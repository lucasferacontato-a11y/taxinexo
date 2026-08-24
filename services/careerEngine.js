const {
  getAllUsers,
  findUserById,
  updateUser,
  createTransaction,
  getTransactionsByUserId
} = require('../database');

const RANKS = [
  {
    id: 'bronze',
    name: 'Operador Bronze',
    icon: '🥉',
    badge: '🥉 Bronze',
    minDirects: 0,
    minTotal: 0,
    unlockedLevels: [1],
    bonus: 0,
    description: '15% no Nível 1'
  },
  {
    id: 'prata',
    name: 'Supervisor Prata',
    icon: '🥈',
    badge: '🥈 Prata',
    minDirects: 5,
    minTotal: 5,
    unlockedLevels: [1, 2],
    bonus: 100.00,
    description: '15% N1 + 10% N2 (+ R$ 100 no Pix)'
  },
  {
    id: 'ouro',
    name: 'Gestor Ouro',
    icon: '🥇',
    badge: '🥇 Ouro',
    minDirects: 5,
    minTotal: 15,
    unlockedLevels: [1, 2, 3],
    bonus: 300.00,
    description: '15% + 10% + 5% (+ R$ 300 no Pix + Saques Diários Liberados)'
  },
  {
    id: 'rubi',
    name: 'Diretor Rubi',
    icon: '💎',
    badge: '💎 Rubi',
    minDirects: 10,
    minTotal: 50,
    unlockedLevels: [1, 2, 3, 4],
    bonus: 1000.00,
    description: '15% + 10% + 5% + 2% N4 (+ R$ 1.000 no Pix)'
  },
  {
    id: 'diamante',
    name: 'Embaixador Diamante',
    icon: '👑',
    badge: '👑 Diamante',
    minDirects: 15,
    minTotal: 150,
    unlockedLevels: [1, 2, 3, 4, 5],
    bonus: 3000.00,
    description: '15% + 10% + 5% + 2% + 1% N5 (+ R$ 3.000 no Pix + Cota Cruise)'
  },
  {
    id: 'black_diamond',
    name: 'Sócio Black Diamond',
    icon: '⚡',
    badge: '⚡ Black Diamond',
    minDirects: 25,
    minTotal: 500,
    unlockedLevels: [1, 2, 3, 4, 5],
    bonus: 10000.00,
    description: 'Profundidade Total + Pool Global 1% (+ R$ 10.000 no Pix)'
  }
];

const LEVEL_PERCENTS = {
  1: 0.15, // 15%
  2: 0.10, // 10%
  3: 0.05, // 5%
  4: 0.02, // 2%
  5: 0.01  // 1%
};

function calculateUserNetwork(userId, allUsers) {
  const l1Users = allUsers.filter(u => u.referredBy === userId);
  const l1Ids = l1Users.map(u => u.id);

  const l2Users = allUsers.filter(u => l1Ids.includes(u.referredBy));
  const l2Ids = l2Users.map(u => u.id);

  const l3Users = allUsers.filter(u => l2Ids.includes(u.referredBy));
  const l3Ids = l3Users.map(u => u.id);

  const l4Users = allUsers.filter(u => l3Ids.includes(u.referredBy));
  const l4Ids = l4Users.map(u => u.id);

  const l5Users = allUsers.filter(u => l4Ids.includes(u.referredBy));

  const totalMembers = l1Users.length + l2Users.length + l3Users.length + l4Users.length + l5Users.length;

  return {
    l1: l1Users,
    l2: l2Users,
    l3: l3Users,
    l4: l4Users,
    l5: l5Users,
    totalMembers,
    directsCount: l1Users.length
  };
}

function evaluateUserRank(networkData) {
  const { directsCount, totalMembers, l3 } = networkData;

  let currentRankIndex = 0;

  for (let i = RANKS.length - 1; i >= 0; i--) {
    const rank = RANKS[i];
    let qualifies = false;

    if (rank.id === 'bronze') {
      qualifies = true;
    } else if (rank.id === 'prata') {
      qualifies = directsCount >= rank.minDirects;
    } else if (rank.id === 'ouro') {
      qualifies = directsCount >= rank.minDirects && totalMembers >= rank.minTotal && l3.length >= 1;
    } else {
      qualifies = directsCount >= rank.minDirects && totalMembers >= rank.minTotal;
    }

    if (qualifies) {
      currentRankIndex = i;
      break;
    }
  }

  const currentRank = RANKS[currentRankIndex];
  const nextRank = currentRankIndex < RANKS.length - 1 ? RANKS[currentRankIndex + 1] : null;

  let progressPercent = 100;
  let remainingDirects = 0;
  let remainingTotal = 0;

  if (nextRank) {
    remainingDirects = Math.max(0, nextRank.minDirects - directsCount);
    remainingTotal = Math.max(0, nextRank.minTotal - totalMembers);
    
    const directProg = nextRank.minDirects > 0 ? (directsCount / nextRank.minDirects) : 1;
    const totalProg = nextRank.minTotal > 0 ? (totalMembers / nextRank.minTotal) : 1;
    progressPercent = Math.min(99, Math.round(((directProg + totalProg) / 2) * 100));
  }

  return {
    currentRank,
    nextRank,
    progressPercent,
    remainingDirects,
    remainingTotal,
    unlockedLevels: currentRank.unlockedLevels,
    isLevel3Unlocked: currentRank.unlockedLevels.includes(3)
  };
}

async function checkAndPromoteUser(userId, allUsersParam = null) {
  try {
    const allUsers = allUsersParam || await getAllUsers();
    const user = allUsers.find(u => u.id === userId);
    if (!user) return null;

    const network = calculateUserNetwork(userId, allUsers);
    const { currentRank } = evaluateUserRank(network);

    const userTx = await getTransactionsByUserId(userId);
    const awardedBonuses = userTx
      .filter(t => t.type === 'bonus' && (t.description || '').includes('Bônus de Graduação'))
      .map(t => t.description);

    const rankBonusDescription = 'Bônus de Graduação - ' + currentRank.name;

    if (currentRank.bonus > 0 && !awardedBonuses.some(d => d.includes(currentRank.name))) {
      console.log('[CAREER ADVANCEMENT] Operador ' + user.operatorName + ' atingiu ' + currentRank.name + '! Creditando R$ ' + currentRank.bonus.toFixed(2));

      const newBalance = user.balance + currentRank.bonus;
      await updateUser(user.id, {
        balance: newBalance,
        vipLevel: currentRank.badge,
        careerRank: currentRank.id
      });

      await createTransaction({
        id: 'RANK-' + Date.now() + '-' + currentRank.id,
        userId: user.id,
        type: 'bonus',
        amount: currentRank.bonus,
        status: 'approved',
        description: rankBonusDescription,
        createdAt: new Date().toISOString()
      });
    }

    return { user, currentRank, network };
  } catch (err) {
    console.error('[CAREER ENGINE ERROR /checkAndPromoteUser]:', err);
    return null;
  }
}

async function distributeCareerCommissions({ buyerUser, amount, productName }) {
  try {
    const allUsers = await getAllUsers();
    let currentUplineId = buyerUser.referredBy;
    const now = new Date().toISOString();

    for (let level = 1; level <= 5; level++) {
      if (!currentUplineId) break;

      const uplineUser = allUsers.find(u => u.id === currentUplineId);
      if (!uplineUser) break;

      const network = calculateUserNetwork(uplineUser.id, allUsers);
      const { unlockedLevels, currentRank } = evaluateUserRank(network);
      const percent = LEVEL_PERCENTS[level] || 0;
      const commissionAmount = amount * percent;

      if (unlockedLevels.includes(level)) {
        const newBalance = uplineUser.balance + commissionAmount;
        await updateUser(uplineUser.id, { balance: newBalance });

        await createTransaction({
          id: 'COMM-' + Date.now() + '-L' + level + '-' + uplineUser.id.slice(-4),
          userId: uplineUser.id,
          type: 'commission',
          amount: commissionAmount,
          status: 'approved',
          description: 'Comissão Nível ' + level + ' (' + (percent * 100).toFixed(0) + '% de ' + buyerUser.operatorName + ') - ' + productName,
          createdAt: now
        });

        console.log('[COMMISSION L' + level + '] Creditado R$ ' + commissionAmount.toFixed(2) + ' para ' + uplineUser.operatorName + ' (' + currentRank.name + ')');
      } else {
        console.log('[COMMISSION COMPRESSED] Nível ' + level + ' retido para ' + uplineUser.operatorName + ' (Requer patente superior).');
      }

      await checkAndPromoteUser(uplineUser.id, allUsers);
      currentUplineId = uplineUser.referredBy;
    }
  } catch (err) {
    console.error('[CAREER ENGINE ERROR /distributeCareerCommissions]:', err);
  }
}

module.exports = {
  RANKS,
  LEVEL_PERCENTS,
  calculateUserNetwork,
  evaluateUserRank,
  checkAndPromoteUser,
  distributeCareerCommissions
};
