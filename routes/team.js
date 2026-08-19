const express = require('express');
const router = express.Router();
const { getAllUsers, getTransactionsByUserId } = require('../database');
const { authMiddleware } = require('../middleware/auth');

// Estatísticas e Níveis da Equipe
router.get('/overview', authMiddleware, async (req, res) => {
  try {
    const allUsers = await getAllUsers();
    const currentUserId = req.user.id;

    // Nível 1 (Diretos)
    const l1Users = allUsers.filter(u => u.referredBy === currentUserId);
    const l1Ids = l1Users.map(u => u.id);

    // Nível 2
    const l2Users = allUsers.filter(u => l1Ids.includes(u.referredBy));
    const l2Ids = l2Users.map(u => u.id);

    // Nível 3
    const l3Users = allUsers.filter(u => l2Ids.includes(u.referredBy));

    const totalMembers = l1Users.length + l2Users.length + l3Users.length;
    
    // Total de comissões ganhas
    const userTx = await getTransactionsByUserId(currentUserId);
    const myCommissions = userTx.filter(t => t.type === 'commission');
    const totalCommission = myCommissions.reduce((acc, t) => acc + t.amount, 0);

    const l1Comm = myCommissions.filter(t => t.description.includes('Nível 1')).reduce((acc, t) => acc + t.amount, 0);
    const l2Comm = myCommissions.filter(t => t.description.includes('Nível 2')).reduce((acc, t) => acc + t.amount, 0);
    const l3Comm = myCommissions.filter(t => t.description.includes('Nível 3')).reduce((acc, t) => acc + t.amount, 0);

    res.json({
      totalMembers,
      activeMembers: totalMembers,
      totalCommission: totalCommission,
      levels: [
        { id: 1, name: 'Nível 1 (Diretos)', percent: 10, members: l1Users.length, generated: l1Comm, icon: 'fa-users-viewfinder' },
        { id: 2, name: 'Nível 2', percent: 5, members: l2Users.length, generated: l2Comm, icon: 'fa-network-wired' },
        { id: 3, name: 'Nível 3', percent: 2, members: l3Users.length, generated: l3Comm, icon: 'fa-diagram-project' }
      ]
    });
  } catch (err) {
    console.error('[TEAM ERROR /overview]:', err);
    res.status(500).json({ error: 'Erro ao buscar dados da equipe.' });
  }
});

module.exports = router;

