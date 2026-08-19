const express = require('express');
const router = express.Router();
const { readDb, writeDb } = require('../database');
const { authMiddleware } = require('../middleware/auth');

// Listar Produtos / Veículos Disponíveis
router.get('/products', (req, res) => {
  const db = readDb();
  res.json(db.products);
});

// Listar Contratos Ativos do Usuário
router.get('/my-contracts', authMiddleware, (req, res) => {
  const db = readDb();
  const userContracts = db.contracts.filter(c => c.userId === req.user.id);
  res.json(userContracts);
});

// Contratar Veículo
router.post('/hire', authMiddleware, (req, res) => {
  const { productId } = req.body;
  const db = readDb();

  const product = db.products.find(p => p.id === productId);
  if (!product) {
    return res.status(404).json({ error: 'Veículo não encontrado.' });
  }

  const user = db.users.find(u => u.id === req.user.id);
  if (user.balance < product.price) {
    return res.status(400).json({ error: 'Saldo insuficiente para contratar este veículo.' });
  }

  // Debita do saldo
  user.balance -= product.price;

  // Cria novo contrato
  const newContract = {
    id: `CTR-${Math.floor(1000 + Math.random() * 9000)}`,
    userId: user.id,
    productId: product.id,
    productName: product.name,
    dailyReturn: product.dailyReturn,
    totalDays: product.periodDays,
    daysRemaining: product.periodDays,
    status: 'Em corrida',
    startDate: new Date().toISOString(),
    lastSettlement: new Date().toISOString()
  };

  db.contracts.unshift(newContract);

  // Registra transação
  db.transactions.unshift({
    id: `TX-${Date.now()}`,
    userId: user.id,
    type: 'contract',
    amount: -product.price,
    status: 'approved',
    description: `Contratação de ${product.name}`,
    createdAt: new Date().toISOString()
  });

  // Comissão Multinível (Se o usuário foi indicado por alguém)
  if (user.referredBy) {
    const level1User = db.users.find(u => u.id === user.referredBy);
    if (level1User) {
      const comm1 = product.price * 0.10; // 10%
      level1User.balance += comm1;
      db.transactions.unshift({
        id: `COMM-${Date.now()}-L1`,
        userId: level1User.id,
        type: 'commission',
        amount: comm1,
        status: 'approved',
        description: `Comissão Nível 1 (${user.operatorName}) - ${product.name}`,
        createdAt: new Date().toISOString()
      });

      if (level1User.referredBy) {
        const level2User = db.users.find(u => u.id === level1User.referredBy);
        if (level2User) {
          const comm2 = product.price * 0.05; // 5%
          level2User.balance += comm2;
          db.transactions.unshift({
            id: `COMM-${Date.now()}-L2`,
            userId: level2User.id,
            type: 'commission',
            amount: comm2,
            status: 'approved',
            description: `Comissão Nível 2 - ${product.name}`,
            createdAt: new Date().toISOString()
          });
        }
      }
    }
  }

  writeDb(db);

  res.status(201).json({
    message: 'Contrato ativado com sucesso!',
    contract: newContract,
    newBalance: user.balance
  });
});

module.exports = router;
