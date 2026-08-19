const jwt = require('jsonwebtoken');
const { findUserById } = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'taxinexo_super_secure_jwt_secret_2026';

async function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
  }

  const token = authHeader.replace('Bearer ', '').trim();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await findUserById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ error: 'Usuário inválido ou não encontrado.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

module.exports = { authMiddleware, JWT_SECRET };

