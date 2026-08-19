const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { readDb, writeDb } = require('../database');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');

// Cadastro
router.post('/register', (req, res) => {
  const { phone, password, inviteCode } = req.body;

  if (!phone || !password) {
    return res.status(400).json({ error: 'Telefone e senha são obrigatórios.' });
  }

  const db = readDb();
  const existing = db.users.find(u => u.phone === phone);
  if (existing) {
    return res.status(400).json({ error: 'Este número de telefone já está cadastrado.' });
  }

  // Verifica quem indicou
  let referredBy = null;
  if (inviteCode) {
    const upline = db.users.find(u => u.inviteCode.toUpperCase() === inviteCode.toUpperCase());
    if (upline) referredBy = upline.id;
  }

  const newUserId = `usr_${Math.floor(1000 + Math.random() * 9000)}`;
  const newUser = {
    id: newUserId,
    operatorName: `Operador #${newUserId.replace('usr_', '')}`,
    phone: phone.replace(/\D/g, ''),
    passwordHash: bcrypt.hashSync(password, 10),
    inviteCode: `NX${Math.floor(1000 + Math.random() * 9000)}`,
    referredBy: referredBy,
    balance: 0.00,
    totalDeposited: 0.00,
    totalWithdrawn: 0.00,
    vipLevel: 'VIP 1',
    lastCheckinDate: null,
    createdAt: new Date().toISOString()
  };

  db.users.push(newUser);
  writeDb(db);

  const token = jwt.sign({ userId: newUser.id }, JWT_SECRET, { expiresIn: '7d' });

  res.status(201).json({
    message: 'Conta criada com sucesso!',
    token,
    user: {
      id: newUser.id,
      operatorName: newUser.operatorName,
      phone: newUser.phone,
      inviteCode: newUser.inviteCode,
      balance: newUser.balance,
      vipLevel: newUser.vipLevel
    }
  });
});

// Login
router.post('/login', (req, res) => {
  const { phone, password } = req.body;
  const cleanPhone = (phone || '').replace(/\D/g, '');

  const db = readDb();
  const user = db.users.find(u => u.phone === cleanPhone || u.phone === phone);

  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Telefone ou senha incorretos.' });
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

  res.json({
    message: 'Login realizado com sucesso!',
    token,
    user: {
      id: user.id,
      operatorName: user.operatorName,
      phone: user.phone,
      inviteCode: user.inviteCode,
      balance: user.balance,
      vipLevel: user.vipLevel
    }
  });
});

// Dados do Usuário Logado
router.get('/me', authMiddleware, (req, res) => {
  const u = req.user;
  res.json({
    id: u.id,
    operatorName: u.operatorName,
    phone: u.phone,
    inviteCode: u.inviteCode,
    balance: u.balance,
    vipLevel: u.vipLevel,
    createdAt: u.createdAt
  });
});

module.exports = router;
