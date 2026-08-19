const express = require('express');
const router = express.Router();
const {
  getGlobalMetrics,
  getAllTransactions,
  findTransactionById,
  updateTransaction,
  getAllUsers,
  findUserById,
  updateUser,
  getContractsByUserId,
  createTransaction
} = require('../database');
const { processDailySettlement } = require('../services/settlementEngine');

const ADMIN_KEY = process.env.ADMIN_KEY || process.env.ADMIN_PASSWORD || 'NEXO@ADMIN2026';

// Rota para validar a Chave de Administrador
router.post('/auth/verify', (req, res) => {
  const { key } = req.body;
  if (key && key.trim() === ADMIN_KEY) {
    return res.json({ authenticated: true, message: 'Acesso administrativo concedido.' });
  }
  return res.status(401).json({ authenticated: false, error: 'Chave de Administrador inválida.' });
});

// Middleware de Proteção para todas as rotas administrativas
function adminAuthMiddleware(req, res, next) {
  const authHeader = req.headers['x-admin-key'] || req.headers['authorization'];
  const key = authHeader ? authHeader.replace('Bearer ', '').trim() : '';

  if (key && key === ADMIN_KEY) {
    return next();
  }

  return res.status(401).json({ error: 'Acesso não autorizado. Chave de Administrador necessária.' });
}

router.use(adminAuthMiddleware);

// Métricas Globais da Plataforma
router.get('/metrics', async (req, res) => {

  try {
    const metrics = await getGlobalMetrics();
    res.json(metrics);
  } catch (err) {
    console.error('[ADMIN ERROR /metrics]:', err);
    res.status(500).json({ error: 'Erro ao carregar métricas administrativas.' });
  }
});

// Listar Solicitações de Saque
router.get('/withdrawals', async (req, res) => {
  try {
    const allTx = await getAllTransactions();
    const withdrawals = allTx.filter(t => t.type === 'withdraw');
    res.json(withdrawals);
  } catch (err) {
    console.error('[ADMIN ERROR /withdrawals]:', err);
    res.status(500).json({ error: 'Erro ao listar saques.' });
  }
});

// Aprovar Saque
router.post('/withdrawals/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const tx = await findTransactionById(id);

    if (!tx) {
      return res.status(404).json({ error: 'Transação não encontrada.' });
    }

    const updatedTx = await updateTransaction(id, {
      status: 'approved',
      approvedAt: new Date().toISOString()
    });

    res.json({ message: 'Saque aprovado com sucesso!', tx: updatedTx });
  } catch (err) {
    console.error('[ADMIN ERROR /withdrawals/:id/approve]:', err);
    res.status(500).json({ error: 'Erro ao aprovar saque.' });
  }
});

// Rejeitar Saque (Estorna saldo para o usuário)
router.post('/withdrawals/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const tx = await findTransactionById(id);

    if (!tx) {
      return res.status(404).json({ error: 'Transação não encontrada.' });
    }

    const updatedTx = await updateTransaction(id, {
      status: 'rejected',
      rejectedAt: new Date().toISOString()
    });

    // Devolve o saldo ao usuário
    const user = await findUserById(tx.userId);
    if (user) {
      const refundAmount = Math.abs(tx.amount);
      await updateUser(user.id, {
        balance: user.balance + refundAmount,
        totalWithdrawn: Math.max(0, user.totalWithdrawn - refundAmount)
      });
    }

    res.json({ message: 'Saque rejeitado e saldo estornado ao usuário!', tx: updatedTx });
  } catch (err) {
    console.error('[ADMIN ERROR /withdrawals/:id/reject]:', err);
    res.status(500).json({ error: 'Erro ao rejeitar saque.' });
  }
});

// Listar Usuários
router.get('/users', async (req, res) => {
  try {
    const users = await getAllUsers();
    const usersList = await Promise.all(users.map(async (u) => {
      const userContracts = await getContractsByUserId(u.id);
      const activeContracts = userContracts.filter(c => c.status === 'Em corrida');
      return {
        id: u.id,
        operatorName: u.operatorName,
        phone: u.phone,
        balance: u.balance,
        vipLevel: u.vipLevel,
        inviteCode: u.inviteCode,
        activeContractsCount: activeContracts.length,
        createdAt: u.createdAt
      };
    }));

    res.json(usersList);
  } catch (err) {
    console.error('[ADMIN ERROR /users]:', err);
    res.status(500).json({ error: 'Erro ao listar usuários.' });
  }
});

// Ajustar Saldo de Usuário
router.post('/users/:id/adjust-balance', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;
    const numAmount = parseFloat(amount);

    const user = await findUserById(id);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const newBalance = user.balance + numAmount;
    await updateUser(user.id, { balance: newBalance });

    await createTransaction({
      id: `ADJ-${Date.now()}`,
      userId: user.id,
      type: 'adjustment',
      amount: numAmount,
      status: 'approved',
      description: `Ajuste Administrativo de Saldo (${numAmount > 0 ? '+' : ''} R$ ${numAmount.toFixed(2)})`,
      createdAt: new Date().toISOString()
    });

    res.json({ message: 'Saldo ajustado com sucesso!', newBalance: newBalance });
  } catch (err) {
    console.error('[ADMIN ERROR /users/:id/adjust-balance]:', err);
    res.status(500).json({ error: 'Erro ao ajustar saldo.' });
  }
});

// Disparar Liquidação Diária Manualmente
router.post('/settle', async (req, res) => {
  try {
    const result = await processDailySettlement();
    res.json({ message: 'Ciclo de liquidação diária concluído!', ...result });
  } catch (err) {
    console.error('[ADMIN ERROR /settle]:', err);
    res.status(500).json({ error: 'Erro ao processar liquidação.' });
  }
});

module.exports = router;

