const express = require('express');
const router = express.Router();
const { readDb, writeDb } = require('../database');
const { authMiddleware } = require('../middleware/auth');

// Resumo da Carteira
router.get('/summary', authMiddleware, (req, res) => {
  const db = readDb();
  const user = db.users.find(u => u.id === req.user.id);
  const myContracts = db.contracts.filter(c => c.userId === req.user.id && c.status === 'Em corrida');
  
  const dailyIncome = myContracts.reduce((acc, c) => acc + c.dailyReturn, 0);
  const totalIncome = db.transactions
    .filter(t => t.userId === req.user.id && t.type === 'income')
    .reduce((acc, t) => acc + t.amount, 0);

  res.json({
    balance: user.balance,
    dailyIncome: dailyIncome,
    totalIncome: totalIncome,
    activeContractsCount: myContracts.length
  });
});

// Gerar Pix de Depósito
router.post('/deposit/pix', authMiddleware, (req, res) => {
  const { amount } = req.body;
  const numAmount = parseFloat(amount);

  if (!numAmount || numAmount < 20) {
    return res.status(400).json({ error: 'O valor mínimo para recarga Pix é R$ 20,00.' });
  }

  const txId = `PIX-${Date.now()}`;
  const pixCopyPaste = `00020126360014BR.GOV.BCB.PIX0114taxinexo8843520400005303986540${numAmount.toFixed(2)}5802BR5908TAXINEXO6009SAOPAULO62070503***6304`;

  res.json({
    txId,
    amount: numAmount,
    pixCopyPaste,
    expiresInSeconds: 900
  });
});

// Confirmar Pagamento Pix (Webhook ou Simulação Instantânea)
router.post('/deposit/confirm', authMiddleware, (req, res) => {
  const { amount, txId } = req.body;
  const numAmount = parseFloat(amount);

  const db = readDb();
  const user = db.users.find(u => u.id === req.user.id);
  user.balance += numAmount;
  user.totalDeposited += numAmount;

  db.transactions.unshift({
    id: txId || `TX-${Date.now()}`,
    userId: user.id,
    type: 'deposit',
    amount: numAmount,
    status: 'approved',
    description: `Recarga Pix Aprovada (+ R$ ${numAmount.toFixed(2)})`,
    createdAt: new Date().toISOString()
  });

  writeDb(db);

  res.json({
    message: 'Depósito creditado com sucesso!',
    newBalance: user.balance
  });
});

// Solicitar Saque
router.post('/withdraw', authMiddleware, (req, res) => {
  const { amount, pixKey } = req.body;
  const numAmount = parseFloat(amount);

  if (!pixKey) {
    return res.status(400).json({ error: 'A Chave Pix é obrigatória.' });
  }
  if (!numAmount || numAmount < 30) {
    return res.status(400).json({ error: 'O valor mínimo de saque é R$ 30,00.' });
  }

  const db = readDb();
  const user = db.users.find(u => u.id === req.user.id);

  if (numAmount > user.balance) {
    return res.status(400).json({ error: 'Saldo insuficiente para saque.' });
  }

  user.balance -= numAmount;
  user.totalWithdrawn += numAmount;

  const txId = `WD-${Date.now()}`;
  db.transactions.unshift({
    id: txId,
    userId: user.id,
    type: 'withdraw',
    amount: -numAmount,
    status: 'pending',
    pixKey: pixKey,
    description: `Solicitação de Saque Pix (${pixKey})`,
    createdAt: new Date().toISOString()
  });

  writeDb(db);

  res.json({
    message: 'Solicitação de saque enviada com sucesso!',
    txId,
    amount: numAmount,
    newBalance: user.balance
  });
});

// Check-in Diário
router.post('/checkin', authMiddleware, (req, res) => {
  const db = readDb();
  const user = db.users.find(u => u.id === req.user.id);
  const today = new Date().toDateString();

  if (user.lastCheckinDate === today) {
    return res.status(400).json({ error: 'Você já resgatou o bônus de hoje!' });
  }

  const bonus = 1.50;
  user.balance += bonus;
  user.lastCheckinDate = today;

  db.transactions.unshift({
    id: `CK-${Date.now()}`,
    userId: user.id,
    type: 'bonus',
    amount: bonus,
    status: 'approved',
    description: 'Bônus de Check-in Diário',
    createdAt: new Date().toISOString()
  });

  writeDb(db);

  res.json({
    message: 'Check-in realizado com sucesso!',
    bonus,
    newBalance: user.balance
  });
});

// Histórico de Transações
router.get('/transactions', authMiddleware, (req, res) => {
  const db = readDb();
  const userTx = db.transactions.filter(t => t.userId === req.user.id);
  res.json(userTx);
});

module.exports = router;
