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
  createTransaction,
  getAllProducts,
  findProductById,
  updateProduct,
  getAnalyticsMetrics,
  getWebhookLogs
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
    const analytics = await getAnalyticsMetrics();
    res.json({
      ...metrics,
      todayUniqueVisitors: analytics.todayUniqueVisitors,
      todayPresellViews: analytics.todayPresellViews,
      todayAppViews: analytics.todayAppViews,
      todayTotalViews: analytics.todayTotalViews
    });
  } catch (err) {
    console.error('[ADMIN ERROR /metrics]:', err);
    res.status(500).json({ error: 'Erro ao carregar métricas administrativas.' });
  }
});

// Analytics & Visitantes em Tempo Real
router.get('/analytics', async (req, res) => {
  try {
    const analytics = await getAnalyticsMetrics();
    res.json(analytics);
  } catch (err) {
    console.error('[ADMIN ERROR /analytics]:', err);
    res.status(500).json({ error: 'Erro ao carregar dados de analytics.' });
  }
});

// Listar Solicitações de Saque
router.get('/withdrawals', async (req, res) => {
  try {
    const allTx = await getAllTransactions();
    const withdrawals = allTx.filter(t => t.type === 'withdraw');
    
    // Enriquece cada saque com o nome e telefone do operador
    const enrichedWithdrawals = await Promise.all(withdrawals.map(async (t) => {
      const user = await findUserById(t.userId);
      return {
        ...t,
        userName: user ? user.operatorName : 'Operador #' + t.userId,
        userPhone: user ? user.phone : 'Não informado'
      };
    }));

    // Ordena os pendentes primeiro e por data mais recente
    enrichedWithdrawals.sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    res.json(enrichedWithdrawals);
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
        operatorName: u.operatorName || `Operador #${u.id}`,
        phone: u.phone,
        balance: parseFloat(u.balance || 0),
        totalDeposited: parseFloat(u.totalDeposited || 0),
        totalWithdrawn: parseFloat(u.totalWithdrawn || 0),
        vipLevel: u.vipLevel || 'VIP 1',
        inviteCode: u.inviteCode,
        activeContractsCount: activeContracts.length,
        hasDeposited: Boolean((u.totalDeposited && u.totalDeposited > 0) || (u.balance && u.balance > 0)),
        createdAt: u.createdAt || new Date().toISOString()
      };
    }));

    // Ordena cadastros mais recentes primeiro
    usersList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

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

// Listar Produtos / Planos para Gestão de Links de Checkout
router.get('/products', async (req, res) => {
  try {
    const products = await getAllProducts();
    res.json(products);
  } catch (err) {
    console.error('[ADMIN ERROR /products]:', err);
    res.status(500).json({ error: 'Erro ao listar produtos.' });
  }
});

// Atualizar Link de Checkout / Preço de um Produto
router.put('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { checkoutUrl, price, dailyReturn, status } = req.body;

    const updated = await updateProduct(id, { checkoutUrl, price, dailyReturn, status });
    if (!updated) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }

    res.json({ message: 'Produto atualizado com sucesso!', product: updated });
  } catch (err) {
    console.error('[ADMIN ERROR /products/:id]:', err);
    res.status(500).json({ error: 'Erro ao atualizar produto.' });
  }
});

// Executar Liquidação Manual de Lucros (Disparado pelo Administrador)
router.post('/settle', async (req, res) => {
  try {
    console.log('[ADMIN] Liquidação manual de lucros iniciada pelo Administrador...');
    const result = await processDailySettlement();
    res.json(result);
  } catch (err) {
    console.error('[ADMIN ERROR /settle]:', err);
    res.status(500).json({ error: 'Erro ao executar liquidação manual.' });
  }
});

// Listar Logs de Webhooks (Auditoria Cartpanda)
router.get('/webhooks', async (req, res) => {
  try {
    const logs = await getWebhookLogs(50);
    res.json(logs);
  } catch (err) {
    console.error('[ADMIN ERROR /webhooks]:', err);
    res.status(500).json({ error: 'Erro ao carregar logs de webhook.' });
  }
});

module.exports = router;


