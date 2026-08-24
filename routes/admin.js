const express = require('express');
const router = express.Router();
const {
  getGlobalMetrics,
  getAllTransactions,
  findTransactionById,
  updateTransaction,
  getAllUsers,
  findUserById,
  findUserByPhone,
  createUser,
  updateUser,
  getContractsByUserId,
  createContract,
  createTransaction,
  getAllProducts,
  findProductById,
  updateProduct,
  getAnalyticsMetrics,
  getWebhookLogs,
  findWebhookLogById,
  updateWebhookLog,
  getSystemSettings,
  updateSystemSetting
} = require('../database');

const { processDailySettlement } = require('../services/settlementEngine');
const {
  calculateUserNetwork,
  evaluateUserRank,
  getUserCareerOverview,
  distributeCareerCommissions,
  RANKS
} = require('../services/careerEngine');

const ADMIN_KEY = process.env.ADMIN_KEY || process.env.ADMIN_PASSWORD || 'NEXO@ADMIN2026';

// Rota pública para configurações do frontend (WhatsApp, Pixel)
router.get('/public-settings', async (req, res) => {
  try {
    const settings = await getSystemSettings();
    res.json({
      whatsappNumber: settings.whatsappNumber,
      metaPixelId: settings.metaPixelId
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar configurações públicas.' });
  }
});

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

// ==========================================
// 1. MÉTRICAS & ANALYTICS
// ==========================================
router.get('/metrics', async (req, res) => {
  try {
    const metrics = await getGlobalMetrics();
    const analytics = await getAnalyticsMetrics();
    const allUsers = await getAllUsers();
    const allTx = await getAllTransactions();

    const pendingWithdrawalsAmount = allTx
      .filter(t => t.type === 'withdraw' && t.status === 'pending')
      .reduce((acc, t) => acc + Math.abs(parseFloat(t.amount || 0)), 0);

    // Contagem de liderança do plano de carreira
    const rankCounts = { bronze: 0, prata: 0, ouro: 0, rubi: 0, diamante: 0, black_diamond: 0 };
    for (const u of allUsers) {
      const net = calculateUserNetwork(u.id, allUsers);
      const evalRank = (u.careerRank && u.careerRank !== 'bronze') 
        ? (RANKS.find(r => r.id === u.careerRank) || evaluateUserRank(net).currentRank) 
        : evaluateUserRank(net).currentRank;
      if (evalRank && rankCounts[evalRank.id] !== undefined) rankCounts[evalRank.id]++;
    }

    res.json({
      totalDeposited: parseFloat(metrics.totalDeposits || 0),
      totalDistributed: parseFloat(metrics.totalWithdrawals || 0),
      pendingWithdrawalsCount: parseInt(metrics.pendingWithdrawalsCount || 0, 10),
      pendingWithdrawalsAmount: pendingWithdrawalsAmount,
      totalUsers: parseInt(metrics.totalUsers || 0, 10),
      activeContractsCount: parseInt(metrics.activeContracts || 0, 10),
      totalCustodyBalance: parseFloat(metrics.totalCustodyBalance || 0),
      todayUniqueVisitors: analytics.todayUniqueVisitors || 0,
      todayPresellViews: analytics.todayPresellViews || 0,
      todayAppViews: analytics.todayAppViews || 0,
      todayTotalViews: analytics.todayTotalViews || 0,
      rankCounts
    });
  } catch (err) {
    console.error('[ADMIN ERROR /metrics]:', err);
    res.status(500).json({ error: 'Erro ao carregar métricas administrativas.' });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const analytics = await getAnalyticsMetrics();
    res.json(analytics);
  } catch (err) {
    console.error('[ADMIN ERROR /analytics]:', err);
    res.status(500).json({ error: 'Erro ao carregar dados de analytics.' });
  }
});

// ==========================================
// 2. GESTÃO DE SAQUES (PIX)
// ==========================================
router.get('/withdrawals', async (req, res) => {
  try {
    const allTx = await getAllTransactions();
    const withdrawals = allTx.filter(t => t.type === 'withdraw');
    
    const enrichedWithdrawals = await Promise.all(withdrawals.map(async (t) => {
      const user = await findUserById(t.userId);
      const userContracts = user ? await getContractsByUserId(user.id) : [];
      const activeContracts = userContracts.filter(c => c.status === 'Em corrida');
      const totalDeposited = parseFloat(user ? user.totalDeposited || 0 : 0);
      const hasDeposited = Boolean(totalDeposited > 0 || activeContracts.length > 0);

      const commBal = user ? parseFloat(user.commissionBalance || 0) : 0;
      const dailyBal = user ? parseFloat(user.dailyReturnsBalance || 0) : 0;

      return {
        ...t,
        userName: user ? user.operatorName : 'Operador #' + t.userId,
        userPhone: user ? user.phone : 'Não informado',
        userBalance: user ? parseFloat(user.balance || 0) : 0,
        commissionBalance: commBal,
        dailyReturnsBalance: dailyBal,
        isLevel3: user ? (Boolean(user.isLevel3) || Boolean(user.forceLevel3Unlocked)) : false,
        totalDeposited: totalDeposited,
        activeContractsCount: activeContracts.length,
        hasDeposited: hasDeposited,
        activeContractsNames: activeContracts.map(c => c.productName).join(', ')
      };
    }));

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

router.post('/withdrawals/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const tx = await findTransactionById(id);
    if (!tx) return res.status(404).json({ error: 'Transação não encontrada.' });

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

router.post('/withdrawals/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const tx = await findTransactionById(id);
    if (!tx) return res.status(404).json({ error: 'Transação não encontrada.' });

    const updatedTx = await updateTransaction(id, {
      status: 'rejected',
      rejectedAt: new Date().toISOString()
    });

    const user = await findUserById(tx.userId);
    if (user) {
      const refundAmount = Math.abs(tx.amount);
      await updateUser(user.id, {
        balance: (user.balance || 0) + refundAmount,
        totalWithdrawn: Math.max(0, (user.totalWithdrawn || 0) - refundAmount)
      });
    }

    res.json({ message: 'Saque rejeitado e saldo estornado ao usuário!', tx: updatedTx });
  } catch (err) {
    console.error('[ADMIN ERROR /withdrawals/:id/reject]:', err);
    res.status(500).json({ error: 'Erro ao rejeitar saque.' });
  }
});

// ==========================================
// 3. GESTÃO DE USUÁRIOS & PLANO DE CARREIRA
// ==========================================
router.get('/users', async (req, res) => {
  try {
    const allUsers = await getAllUsers();
    const usersList = await Promise.all(allUsers.map(async (u) => {
      const userContracts = await getContractsByUserId(u.id);
      const activeContracts = userContracts.filter(c => c.status === 'Em corrida');
      const hasDeposited = Boolean((u.totalDeposited && u.totalDeposited > 0) || (u.balance && u.balance > 0) || activeContracts.length > 0);
      
      const net = calculateUserNetwork(u.id, allUsers);
      const evalRank = (u.careerRank && u.careerRank !== 'bronze') 
        ? (RANKS.find(r => r.id === u.careerRank) || evaluateUserRank(net).currentRank) 
        : evaluateUserRank(net).currentRank;
      const rank = evalRank || { id: 'bronze', name: 'Operador Bronze', badge: '🥉 Bronze', icon: '🥉' };

      let defaultStatus = 'new';
      if (activeContracts.length > 0) defaultStatus = 'active';

      const totalBal = parseFloat(u.balance || 0);
      let commBal = parseFloat(u.commissionBalance !== undefined && u.commissionBalance !== null ? u.commissionBalance : 0);
      let dailyBal = parseFloat(u.dailyReturnsBalance !== undefined && u.dailyReturnsBalance !== null ? u.dailyReturnsBalance : 0);

      // Se o usuário possui saldo total mas os saldos específicos ainda não foram desmembrados
      if (totalBal > 0 && commBal === 0 && dailyBal === 0) {
        if (activeContracts.length > 0) {
          dailyBal = totalBal;
        } else {
          commBal = totalBal;
        }
      }

      return {
        id: u.id,
        operatorName: u.operatorName || `Operador #${u.id}`,
        phone: u.phone,
        balance: totalBal,
        commissionBalance: commBal,
        dailyReturnsBalance: dailyBal,
        totalDeposited: parseFloat(u.totalDeposited || 0),
        totalWithdrawn: parseFloat(u.totalWithdrawn || 0),
        vipLevel: u.vipLevel || 'VIP 1',
        careerRankId: rank.id,
        careerRankName: rank.name,
        careerRankBadge: rank.badge,
        careerRankIcon: rank.icon,
        isLevel3: Boolean(u.isLevel3) || Boolean(u.forceLevel3Unlocked) || (net.l1.length >= 5 && net.totalTeam >= 15),
        forceLevel3Unlocked: Boolean(u.forceLevel3Unlocked),
        totalDirects: net.l1.length,
        totalTeam: net.totalTeam,
        inviteCode: u.inviteCode,
        activeContractsCount: activeContracts.length,
        activeContractsNames: activeContracts.map(c => c.productName).join(', ') || 'Nenhuma frota ativa',
        hasDeposited: hasDeposited,
        crmStatus: u.crmStatus || defaultStatus,
        crmNotes: u.crmNotes || '',
        createdAt: u.createdAt || new Date().toISOString()
      };
    }));

    usersList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(usersList);
  } catch (err) {
    console.error('[ADMIN ERROR /users]:', err);
    res.status(500).json({ error: 'Erro ao listar usuários.' });
  }
});

// Ajuste Fino de Saldo (Geral, Comissão ou Rendimento)
router.post('/users/:id/adjust-balance', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, type = 'general' } = req.body;
    const numAmount = parseFloat(amount);

    const user = await findUserById(id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const newTotalBalance = (user.balance || 0) + numAmount;
    const updatePayload = { balance: newTotalBalance };

    if (type === 'commission') {
      updatePayload.commissionBalance = Math.max(0, (user.commissionBalance || 0) + numAmount);
    } else if (type === 'daily') {
      updatePayload.dailyReturnsBalance = Math.max(0, (user.dailyReturnsBalance || 0) + numAmount);
    }

    await updateUser(user.id, updatePayload);

    await createTransaction({
      id: `ADJ-${Date.now()}`,
      userId: user.id,
      type: 'adjustment',
      amount: numAmount,
      status: 'approved',
      description: `Ajuste Administrativo de Saldo (${type === 'commission' ? 'Comissão' : type === 'daily' ? 'Diário' : 'Geral'}) (${numAmount > 0 ? '+' : ''} R$ ${numAmount.toFixed(2)})`,
      createdAt: new Date().toISOString()
    });

    res.json({ message: 'Saldo ajustado com sucesso!', newBalance: newTotalBalance });
  } catch (err) {
    console.error('[ADMIN ERROR /users/:id/adjust-balance]:', err);
    res.status(500).json({ error: 'Erro ao ajustar saldo.' });
  }
});

// Interruptor Individual da Trava Nível 3 (Liberar/Bloquear Saque Diário)
router.post('/users/:id/toggle-level3', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await findUserById(id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const currentLock = Boolean(user.forceLevel3Unlocked);
    const newStatus = !currentLock;

    await updateUser(user.id, { forceLevel3Unlocked: newStatus, isLevel3: newStatus });
    res.json({
      message: newStatus ? 'Trava Nível 3 LIBERADA para este operador!' : 'Trava Nível 3 ATIVADA (padrão de rede).',
      forceLevel3Unlocked: newStatus
    });
  } catch (err) {
    console.error('[ADMIN ERROR /users/:id/toggle-level3]:', err);
    res.status(500).json({ error: 'Erro ao alterar trava Nível 3.' });
  }
});

// Promoção / Override Manual de Patente do Plano de Carreira
router.post('/users/:id/override-rank', async (req, res) => {
  try {
    const { id } = req.params;
    const { rankId, creditBonus = false } = req.body;

    const rank = RANKS.find(r => r.id === rankId);
    if (!rank) return res.status(400).json({ error: 'Patente inválida.' });

    const user = await findUserById(id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const updateData = { careerRank: rank.id };
    if (rank.id === 'ouro' || rank.id === 'rubi' || rank.id === 'diamante' || rank.id === 'black_diamond') {
      updateData.forceLevel3Unlocked = true;
      updateData.isLevel3 = true;
    }

    if (creditBonus && rank.bonus > 0) {
      updateData.balance = (user.balance || 0) + rank.bonus;
      updateData.commissionBalance = (user.commissionBalance || 0) + rank.bonus;
      await createTransaction({
        id: `BONUS-${rank.id.toUpperCase()}-${Date.now()}`,
        userId: user.id,
        type: 'bonus',
        amount: rank.bonus,
        status: 'approved',
        description: `Bônus Administrativo de Promoção de Patente: ${rank.badge} (+ R$ ${rank.bonus.toFixed(2)})`,
        createdAt: new Date().toISOString()
      });
    }

    await updateUser(user.id, updateData);
    res.json({ message: `Usuário promovido com sucesso para ${rank.badge}!`, rank });
  } catch (err) {
    console.error('[ADMIN ERROR /users/:id/override-rank]:', err);
    res.status(500).json({ error: 'Erro ao promover usuário.' });
  }
});

// Visão Geral do Plano de Carreira
router.get('/career/overview', async (req, res) => {
  try {
    const allUsers = await getAllUsers();
    const allTx = await getAllTransactions();

    const rankCounts = { bronze: 0, prata: 0, ouro: 0, rubi: 0, diamante: 0, black_diamond: 0 };
    const leaders = [];

    for (const u of allUsers) {
      const net = calculateUserNetwork(u.id, allUsers);
      const evalRank = (u.careerRank && u.careerRank !== 'bronze') 
        ? (RANKS.find(r => r.id === u.careerRank) || evaluateUserRank(net).currentRank) 
        : evaluateUserRank(net).currentRank;
      const rank = evalRank || { id: 'bronze', name: 'Operador Bronze', badge: '🥉 Bronze', icon: '🥉' };
      if (rankCounts[rank.id] !== undefined) rankCounts[rank.id]++;

      if (net.totalTeam > 0 || net.l1.length > 0 || u.careerRank) {
        leaders.push({
          id: u.id,
          name: u.operatorName || `Operador #${u.id}`,
          phone: u.phone,
          rank: rank.badge,
          rankId: rank.id,
          directs: net.l1.length,
          totalTeam: net.totalTeam,
          commissionBalance: u.commissionBalance || 0
        });
      }
    }

    const totalBonusPaid = allTx
      .filter(t => t.type === 'bonus' && t.status === 'approved' && String(t.description || '').includes('Bônus'))
      .reduce((acc, t) => acc + Math.abs(parseFloat(t.amount || 0)), 0);

    leaders.sort((a, b) => b.totalTeam - a.totalTeam || b.directs - a.directs);

    res.json({
      ranks: RANKS,
      rankCounts,
      totalBonusPaid,
      topLeaders: leaders
    });
  } catch (err) {
    console.error('[ADMIN ERROR /career/overview]:', err);
    res.status(500).json({ error: 'Erro ao carregar visão de carreira.' });
  }
});

// ==========================================
// 4. CENTRAL DE WEBHOOKS & CARTPANDA
// ==========================================
router.get('/webhooks', async (req, res) => {
  try {
    const logs = await getWebhookLogs(100);
    res.json(logs);
  } catch (err) {
    console.error('[ADMIN ERROR /webhooks]:', err);
    res.status(500).json({ error: 'Erro ao listar webhooks.' });
  }
});

// Reprocessar Webhook
router.post('/webhooks/:id/reprocess', async (req, res) => {
  try {
    const { id } = req.params;
    const log = await findWebhookLogById(id);
    if (!log) return res.status(404).json({ error: 'Log de webhook não encontrado.' });

    const raw = typeof log.raw_payload === 'string' ? JSON.parse(log.raw_payload) : (log.raw_payload || {});
    const phone = log.customer_phone || raw.phone || (raw.customer && raw.customer.phone);
    const amount = parseFloat(log.amount || raw.amount || raw.total || 0);

    if (!phone || amount <= 0) {
      return res.status(400).json({ error: 'Webhook sem telefone ou valor válido para processamento.' });
    }

    let user = await findUserByPhone(phone);
    if (!user) {
      const cleanPhone = String(phone).replace(/\D/g, '');
      const newUserId = `usr_${Math.floor(1000 + Math.random() * 9000)}`;
      user = await createUser({
        id: newUserId,
        operatorName: log.customer_name && log.customer_name !== 'Cliente' ? log.customer_name : `Operador #${newUserId.replace('usr_', '')}`,
        phone: cleanPhone,
        password: '123',
        balance: 0,
        totalDeposited: 0,
        dailyReturnsBalance: 0,
        commissionBalance: 0,
        pixKey: cleanPhone
      });
    }

    const products = await getAllProducts();
    let matchedProduct = products.find(p => Math.abs(p.price - amount) < 0.01);
    const now = new Date().toISOString();

    await updateUser(user.id, { totalDeposited: (user.totalDeposited || 0) + amount });

    await createTransaction({
      id: `CP-REPROC-${Date.now()}`,
      userId: user.id,
      type: 'deposit',
      amount: amount,
      status: 'approved',
      description: `Pagamento Cartpanda Reprocessado (+ R$ ${amount.toFixed(2)})`,
      createdAt: now
    });

    if (matchedProduct) {
      const contractId = `CTR-${Math.floor(1000 + Math.random() * 9000)}`;
      await createContract({
        id: contractId,
        userId: user.id,
        productId: matchedProduct.id,
        productName: matchedProduct.name,
        dailyReturn: matchedProduct.dailyReturn,
        totalDays: matchedProduct.periodDays,
        daysRemaining: matchedProduct.periodDays,
        status: 'Em corrida',
        startDate: now,
        lastSettlement: now
      });

      await createTransaction({
        id: `TX-${Date.now()}`,
        userId: user.id,
        type: 'contract',
        amount: -matchedProduct.price,
        status: 'approved',
        description: `Contratação Automática de ${matchedProduct.name}`,
        createdAt: now
      });

      await distributeCareerCommissions({
        buyerUser: user,
        amount: matchedProduct.price,
        productName: matchedProduct.name
      });
    } else {
      await updateUser(user.id, { balance: (user.balance || 0) + amount });
    }

    await updateWebhookLog(id, {
      status: 'processed',
      matchedUserId: user.id,
      note: `Reprocessado com sucesso para ${user.operatorName} (${user.phone}).`
    });

    res.json({ message: `Webhook reprocessado! Ativado para ${user.operatorName} (${user.phone}).`, user });
  } catch (err) {
    console.error('[ADMIN ERROR /webhooks/:id/reprocess]:', err);
    res.status(500).json({ error: 'Erro ao reprocessar webhook.' });
  }
});

// Vincular Manualmente Webhook a Qualquer Usuário
router.post('/webhooks/:id/link-user', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const log = await findWebhookLogById(id);
    if (!log) return res.status(404).json({ error: 'Log de webhook não encontrado.' });

    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const amount = parseFloat(log.amount || 0);
    const now = new Date().toISOString();

    await updateUser(user.id, { totalDeposited: (user.totalDeposited || 0) + amount });

    const products = await getAllProducts();
    const matchedProduct = products.find(p => Math.abs(p.price - amount) < 0.01);

    if (matchedProduct) {
      const contractId = `CTR-${Math.floor(1000 + Math.random() * 9000)}`;
      await createContract({
        id: contractId,
        userId: user.id,
        productId: matchedProduct.id,
        productName: matchedProduct.name,
        dailyReturn: matchedProduct.dailyReturn,
        totalDays: matchedProduct.periodDays,
        daysRemaining: matchedProduct.periodDays,
        status: 'Em corrida',
        startDate: now,
        lastSettlement: now
      });

      await createTransaction({
        id: `TX-${Date.now()}`,
        userId: user.id,
        type: 'contract',
        amount: -matchedProduct.price,
        status: 'approved',
        description: `Contratação Vinculada de ${matchedProduct.name}`,
        createdAt: now
      });

      await distributeCareerCommissions({
        buyerUser: user,
        amount: matchedProduct.price,
        productName: matchedProduct.name
      });
    } else {
      await updateUser(user.id, { balance: (user.balance || 0) + amount });
    }

    await updateWebhookLog(id, {
      status: 'processed',
      matchedUserId: user.id,
      note: `Vinculado manualmente pelo Admin ao operador ${user.operatorName} (${user.id}).`
    });

    res.json({ message: `Pagamento vinculado e ativado com sucesso para ${user.operatorName}!` });
  } catch (err) {
    console.error('[ADMIN ERROR /webhooks/:id/link-user]:', err);
    res.status(500).json({ error: 'Erro ao vincular webhook ao usuário.' });
  }
});

// Injetor de Depósito / Ativação de Frota Direta
router.post('/inject-deposit', async (req, res) => {
  try {
    const { phone, amount, productId, autoHire = true } = req.body;
    const numAmount = parseFloat(amount);
    if (!phone || numAmount <= 0) return res.status(400).json({ error: 'Telefone e valor são obrigatórios.' });

    let user = await findUserByPhone(phone);
    if (!user) {
      const cleanPhone = String(phone).replace(/\D/g, '');
      const newUserId = `usr_${Math.floor(1000 + Math.random() * 9000)}`;
      user = await createUser({
        id: newUserId,
        operatorName: `Operador #${newUserId.replace('usr_', '')}`,
        phone: cleanPhone,
        password: '123',
        balance: 0,
        totalDeposited: 0,
        dailyReturnsBalance: 0,
        commissionBalance: 0,
        pixKey: cleanPhone
      });
    }

    const now = new Date().toISOString();
    await updateUser(user.id, { totalDeposited: (user.totalDeposited || 0) + numAmount });

    await createTransaction({
      id: `INJ-${Date.now()}`,
      userId: user.id,
      type: 'deposit',
      amount: numAmount,
      status: 'approved',
      description: `Depósito Injetado pelo Administrador (+ R$ ${numAmount.toFixed(2)})`,
      createdAt: now
    });

    const products = await getAllProducts();
    const targetProduct = productId ? products.find(p => p.id === productId) : products.find(p => Math.abs(p.price - numAmount) < 0.01);

    if (autoHire && targetProduct) {
      const contractId = `CTR-${Math.floor(1000 + Math.random() * 9000)}`;
      await createContract({
        id: contractId,
        userId: user.id,
        productId: targetProduct.id,
        productName: targetProduct.name,
        dailyReturn: targetProduct.dailyReturn,
        totalDays: targetProduct.periodDays,
        daysRemaining: targetProduct.periodDays,
        status: 'Em corrida',
        startDate: now,
        lastSettlement: now
      });

      await createTransaction({
        id: `TX-${Date.now()}`,
        userId: user.id,
        type: 'contract',
        amount: -targetProduct.price,
        status: 'approved',
        description: `Contratação Injetada de ${targetProduct.name}`,
        createdAt: now
      });

      await distributeCareerCommissions({
        buyerUser: user,
        amount: targetProduct.price,
        productName: targetProduct.name
      });
    } else {
      await updateUser(user.id, { balance: (user.balance || 0) + numAmount });
    }

    res.json({ message: `Depósito/Frota de R$ ${numAmount.toFixed(2)} injetado com sucesso para ${user.operatorName} (${user.phone})!`, user });
  } catch (err) {
    console.error('[ADMIN ERROR /inject-deposit]:', err);
    res.status(500).json({ error: 'Erro ao injetar depósito.' });
  }
});

// ==========================================
// 5. GESTÃO DE PRODUTOS / FROTAS
// ==========================================
router.get('/products', async (req, res) => {
  try {
    const products = await getAllProducts();
    res.json(products);
  } catch (err) {
    console.error('[ADMIN ERROR /products]:', err);
    res.status(500).json({ error: 'Erro ao listar produtos.' });
  }
});

router.put('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, checkoutUrl, price, dailyReturn, periodDays, status } = req.body;

    const updated = await updateProduct(id, { name, checkoutUrl, price, dailyReturn, periodDays, status });
    if (!updated) return res.status(404).json({ error: 'Produto não encontrado.' });

    res.json({ message: 'Produto/Frota atualizado com sucesso!', product: updated });
  } catch (err) {
    console.error('[ADMIN ERROR /products/:id]:', err);
    res.status(500).json({ error: 'Erro ao atualizar produto.' });
  }
});

// ==========================================
// 6. CRM & EXPORTAÇÃO
// ==========================================
router.patch('/users/:id/crm', async (req, res) => {
  try {
    const { id } = req.params;
    const { crmStatus, crmNotes } = req.body;

    const user = await findUserById(id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const updated = await updateUser(id, {
      crmStatus: crmStatus !== undefined ? crmStatus : user.crmStatus,
      crmNotes: crmNotes !== undefined ? crmNotes : user.crmNotes
    });

    res.json({ message: 'Status do CRM atualizado!', user: updated });
  } catch (err) {
    console.error('[ADMIN ERROR /users/:id/crm]:', err);
    res.status(500).json({ error: 'Erro ao atualizar CRM do operador.' });
  }
});

router.get('/users/export-csv', async (req, res) => {
  try {
    const users = await getAllUsers();
    const headers = ['ID', 'Nome', 'Telefone', 'Telefone_WhatsApp', 'Status_CRM', 'Saldo_Total', 'Saldo_Comissao', 'Saldo_Diario', 'Patente', 'Frotas_Ativas', 'Data_Cadastro'];
    const rows = await Promise.all(users.map(async (u) => {
      const contracts = await getContractsByUserId(u.id);
      const activeCount = contracts.filter(c => c.status === 'Em corrida').length;
      const cleanPhone = String(u.phone || '').replace(/\D/g, '');
      const waPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
      const status = u.crmStatus || (activeCount > 0 ? 'active' : 'new');
      const date = u.createdAt ? new Date(u.createdAt).toISOString() : '';

      return [
        `"${u.id}"`,
        `"${(u.operatorName || '').replace(/"/g, '""')}"`,
        `"${cleanPhone}"`,
        `"+${waPhone}"`,
        `"${status}"`,
        (u.balance || 0).toFixed(2),
        (u.commissionBalance || 0).toFixed(2),
        (u.dailyReturnsBalance || 0).toFixed(2),
        `"${u.careerRank || 'bronze'}"`,
        activeCount,
        `"${date}"`
      ].join(';');
    }));

    const csvContent = [headers.join(';'), ...rows].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="taxinexo_leads_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('\uFEFF' + csvContent);
  } catch (err) {
    console.error('[ADMIN ERROR /users/export-csv]:', err);
    res.status(500).json({ error: 'Erro ao exportar CSV.' });
  }
});

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

router.get('/settings', async (req, res) => {
  try {
    const settings = await getSystemSettings();
    res.json(settings);
  } catch (err) {
    console.error('[ADMIN ERROR /settings]:', err);
    res.status(500).json({ error: 'Erro ao carregar configurações.' });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const { nexusCrmUrl, whatsappNumber, metaPixelId } = req.body;
    if (nexusCrmUrl !== undefined) await updateSystemSetting('nexus_crm_url', nexusCrmUrl.trim());
    if (whatsappNumber !== undefined) await updateSystemSetting('whatsapp_number', whatsappNumber.trim());
    if (metaPixelId !== undefined) await updateSystemSetting('meta_pixel_id', metaPixelId.trim());

    const updated = await getSystemSettings();
    res.json({ message: 'Configurações atualizadas com sucesso!', settings: updated });
  } catch (err) {
    console.error('[ADMIN ERROR /settings PUT]:', err);
    res.status(500).json({ error: 'Erro ao salvar configurações.' });
  }
});

module.exports = router;
