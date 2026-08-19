const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { findUserByPhone, findUserByInviteCode, createUser } = require('../database');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');

// Cadastro
router.post('/register', async (req, res) => {
  try {
    const { phone, password, inviteCode } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: 'Telefone e senha são obrigatórios.' });
    }

    const cleanPhone = phone.replace(/\D/g, '');
    const existing = await findUserByPhone(cleanPhone);
    if (existing) {
      return res.status(400).json({ error: 'Este número de telefone já está cadastrado.' });
    }

    // Verifica quem indicou
    let referredBy = null;
    if (inviteCode) {
      const upline = await findUserByInviteCode(inviteCode);
      if (upline) referredBy = upline.id;
    }

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const newUserId = `usr_${randomSuffix}`;
    const newUser = {
      id: newUserId,
      operatorName: `Operador #${randomSuffix}`,
      phone: cleanPhone,
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

    await createUser(newUser);

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
  } catch (err) {
    console.error('[AUTH ERROR /register]:', err);
    res.status(500).json({ error: 'Erro interno ao processar cadastro.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const cleanPhone = (phone || '').replace(/\D/g, '');

    const user = await findUserByPhone(cleanPhone);

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
  } catch (err) {
    console.error('[AUTH ERROR /login]:', err);
    res.status(500).json({ error: 'Erro interno ao realizar login.' });
  }
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

