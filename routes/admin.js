const express = require('express');
const router = express.Router();
const { readDb, writeDb } = require('../database');
const { processDailySettlement } = require('../services/settlementEngine');

// Métricas Globais da Plataforma
router.get('/metrics', (req, res) => {
  const db = readDb();
  
  const totalUsers = db.users.length;
  const totalDeposits = db.transactions
    .filter(t => t.type === 'deposit' && t.status === 'approved')
    .reduce((acc, t) => acc + t.amount, 0);

  const totalWithdrawals = db.transactions
    .filter(t => t.type === 'withdraw' && t.status === 'approved')
    .reduce((acc, t) => acc + Math.abs(t.amount), 0);

  const pendingWithdrawalsCount = db.transactions
    .filter(t => t.type === 'withdraw' && t.status === 'pending').length;

  const activeContracts = db.contracts.filter(c => c.status === 'Em corrida').length;
  const totalCustodyBalance = db.users.reduce((acc, u) => acc + u.balance, 0);

  res.json({
    totalUsers,
    totalDeposits,
    totalWithdrawals,
    pendingWithdrawalsCount,
    activeContracts,
    totalCustodyBalance
  });
});

// Listar Solicitações de Saque
router.get('/withdrawals', (req, res) => {
  const db = readDb();
  const withdrawals = db.transactions
    .filter(t => t.type === 'withdraw')
    .map(w => {
      const user = db.users.find(u => u.id === w.userId);
      return {
        ...w,
        userName: user ? user.operatorName : 'Usuário Desconhecido',
        userPhone: user ? user.phone : 'N/A'
      };
    });

  res.json(withdrawals);
});

// Aprovar Saque
router.post('/withdrawals/:id/approve', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const tx = db.transactions.find(t => t.id === id);

  if (!tx) {
    return res.status(404).json({ error: 'Transação não encontrada.' });
  }

  tx.status = 'approved';
  tx.approvedAt = new Date().toISOString();
  writeDb(db);

  res.json({ message: 'Saque aprovado com sucesso!', tx });
});

// Rejeitar Saque (Estorna saldo para o usuário)
router.post('/withdrawals/:id/reject', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const tx = db.transactions.find(t => t.id === id);

  if (!tx) {
    return res.status(404).json({ error: 'Transação não encontrada.' });
  }

  tx.status = 'rejected';
  tx.rejectedAt = new Date().toISOString();

  // Devolve o saldo ao usuário
  const user = db.users.find(u => u.id === tx.userId);
  if (user) {
    user.balance += Math.abs(tx.amount);
  }

  writeDb(db);

  res.json({ message: 'Saque rejeitado e saldo estornado ao usuário!', tx });
});

// Listar Usuários
router.get('/users', (req, res) => {
  const db = readDb();
  const usersList = db.users.map(u => {
    const userContracts = db.contracts.filter(c => c.userId === u.id && c.status === 'Em corrida');
    return {
      id: u.id,
      operatorName: u.operatorName,
      phone: u.phone,
      balance: u.balance,
      vipLevel: u.vipLevel,
      inviteCode: u.inviteCode,
      activeContractsCount: userContracts.length,
      createdAt: u.createdAt
    };
  });

  res.json(usersList);
});

// Ajustar Saldo de Usuário
router.post('/users/:id/adjust-balance', (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;
  const numAmount = parseFloat(amount);

  const db = readDb();
  const user = db.users.find(u => u.id === id);

  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  user.balance += numAmount;

  db.transactions.unshift({
    id: `ADJ-${Date.now()}`,
    userId: user.id,
    type: 'adjustment',
    amount: numAmount,
    status: 'approved',
    description: `Ajuste Administrativo de Saldo (${numAmount > 0 ? '+' : ''} R$ ${numAmount.toFixed(2)})`,
    createdAt: new Date().toISOString()
  });

  writeDb(db);

  res.json({ message: 'Saldo ajustado com sucesso!', newBalance: user.balance });
});

// Disparar Liquidação Diária Manualmente
router.post('/settle', (req, res) => {
  const result = processDailySettlement();
  res.json({ message: 'Ciclo de liquidação diária concluído!', ...result });
});

module.exports = router;
