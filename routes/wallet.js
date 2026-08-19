const express = require('express');
const router = express.Router();
const {
  findUserById,
  findUserByPhone,
  updateUser,
  getContractsByUserId,
  getTransactionsByUserId,
  createTransaction
} = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { createCartpandaPix } = require('../services/cartpanda');
const { notifyAdminWithdrawal } = require('../services/telegramBot');

// Resumo da Carteira
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    const contracts = await getContractsByUserId(req.user.id);
    const myContracts = contracts.filter(c => c.status === 'Em corrida');
    
    const dailyIncome = myContracts.reduce((acc, c) => acc + c.dailyReturn, 0);

    const transactions = await getTransactionsByUserId(req.user.id);
    const totalIncome = transactions
      .filter(t => t.type === 'income')
      .reduce((acc, t) => acc + t.amount, 0);

    res.json({
      balance: user ? user.balance : 0,
      dailyIncome: dailyIncome,
      totalIncome: totalIncome,
      activeContractsCount: myContracts.length
    });
  } catch (err) {
    console.error('[WALLET ERROR /summary]:', err);
    res.status(500).json({ error: 'Erro ao buscar resumo da carteira.' });
  }
});

// Gerar Pix de Depósito (Integrado com Cartpanda Pay)
router.post('/deposit/pix', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    const numAmount = parseFloat(amount);

    if (!numAmount || numAmount < 20) {
      return res.status(400).json({ error: 'O valor mínimo para recarga Pix é R$ 20,00.' });
    }

    const user = req.user;
    const pixResult = await createCartpandaPix({
      amount: numAmount,
      customerName: user.operatorName,
      customerPhone: user.phone,
      customerEmail: `${user.phone}@taxinexo.com`,
      referenceId: user.id
    });

    if (!pixResult.success) {
      return res.status(500).json({ error: pixResult.error || 'Erro ao gerar Pix no Cartpanda Pay.' });
    }

    res.json(pixResult);
  } catch (err) {
    console.error('[WALLET ERROR /deposit/pix]:', err);
    res.status(500).json({ error: 'Erro ao gerar cobrança Pix.' });
  }
});

// Webhook Oficial do Cartpanda Pay (Chamado quando o Pix é pago)
router.post('/webhook/cartpanda', async (req, res) => {
  console.log('[CARTPANDA WEBHOOK RECEIVED]', JSON.stringify(req.body));
  try {
    const event = req.body;

    const status = event.status || event.order_status || (event.order && event.order.status);
    const amount = parseFloat(event.amount || (event.order && event.order.total) || 0);
    const referenceId = (event.metadata && event.metadata.reference_id) || event.customer_phone || (event.customer && event.customer.phone);

    if (status === 'paid' || status === 'completed' || status === 'approved') {
      let user = null;
      if (referenceId) {
        user = await findUserById(referenceId);
        if (!user) {
          user = await findUserByPhone(referenceId);
        }
      }
      if (!user && event.customer && event.customer.phone) {
        const cleanPhone = event.customer.phone.replace(/\D/g, '');
        user = await findUserByPhone(cleanPhone);
      }

      if (user && amount > 0) {
        const updatedUser = await updateUser(user.id, {
          balance: user.balance + amount,
          totalDeposited: user.totalDeposited + amount
        });

        await createTransaction({
          id: `CP-${event.id || Date.now()}`,
          userId: user.id,
          type: 'deposit',
          amount: amount,
          status: 'approved',
          description: `Recarga Pix Cartpanda Pay Confirmada (+ R$ ${amount.toFixed(2)})`,
          createdAt: new Date().toISOString()
        });

        console.log(`[CARTPANDA] Saldo de R$ ${amount} creditado para o usuário ${user.operatorName}`);
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[CARTPANDA WEBHOOK ERROR]:', err);
    res.status(500).json({ error: 'Erro ao processar webhook.' });
  }
});

// Confirmar Pagamento Pix (Simulação Instantânea / Fallback)
router.post('/deposit/confirm', authMiddleware, async (req, res) => {
  try {
    const { amount, txId } = req.body;
    const numAmount = parseFloat(amount);

    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ error: 'Valor de depósito inválido.' });
    }

    const user = await findUserById(req.user.id);
    const newBalance = user.balance + numAmount;
    const newDeposited = user.totalDeposited + numAmount;

    await updateUser(user.id, {
      balance: newBalance,
      totalDeposited: newDeposited
    });

    await createTransaction({
      id: txId || `TX-${Date.now()}`,
      userId: user.id,
      type: 'deposit',
      amount: numAmount,
      status: 'approved',
      description: `Recarga Pix Aprovada (+ R$ ${numAmount.toFixed(2)})`,
      createdAt: new Date().toISOString()
    });

    res.json({
      message: 'Depósito creditado com sucesso!',
      newBalance: newBalance
    });
  } catch (err) {
    console.error('[WALLET ERROR /deposit/confirm]:', err);
    res.status(500).json({ error: 'Erro ao confirmar depósito.' });
  }
});

// Solicitar Saque
router.post('/withdraw', authMiddleware, async (req, res) => {
  try {
    const { amount, pixKey } = req.body;
    const numAmount = parseFloat(amount);

    if (!pixKey) {
      return res.status(400).json({ error: 'A Chave Pix é obrigatória.' });
    }
    if (!numAmount || numAmount < 30) {
      return res.status(400).json({ error: 'O valor mínimo de saque é R$ 30,00.' });
    }

    const user = await findUserById(req.user.id);

    if (numAmount > user.balance) {
      return res.status(400).json({ error: 'Saldo insuficiente para saque.' });
    }

    const newBalance = user.balance - numAmount;
    const newWithdrawn = user.totalWithdrawn + numAmount;

    await updateUser(user.id, {
      balance: newBalance,
      totalWithdrawn: newWithdrawn
    });

    const txId = `WD-${Date.now()}`;
    await createTransaction({
      id: txId,
      userId: user.id,
      type: 'withdraw',
      amount: -numAmount,
      status: 'pending',
      pixKey: pixKey,
      description: `Solicitação de Saque Pix (${pixKey})`,
      createdAt: new Date().toISOString()
    });

    // Dispara notificação imediata para o Telegram do Administrador
    notifyAdminWithdrawal({
      operatorName: user.operatorName,
      phone: user.phone,
      amount: numAmount,
      pixKey: pixKey,
      txId: txId
    }).catch(err => console.error('[ADMIN NOTIFY WITHDRAW ERROR]:', err));

    res.json({
      message: 'Solicitação de saque enviada com sucesso!',
      txId,
      amount: numAmount,
      newBalance: newBalance
    });

  } catch (err) {
    console.error('[WALLET ERROR /withdraw]:', err);
    res.status(500).json({ error: 'Erro ao solicitar saque.' });
  }
});

// Check-in Diário
router.post('/checkin', authMiddleware, async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    const today = new Date().toDateString();

    if (user.lastCheckinDate === today) {
      return res.status(400).json({ error: 'Você já resgatou o bônus de hoje!' });
    }

    const bonus = 1.50;
    const newBalance = user.balance + bonus;

    await updateUser(user.id, {
      balance: newBalance,
      lastCheckinDate: today
    });

    await createTransaction({
      id: `CK-${Date.now()}`,
      userId: user.id,
      type: 'bonus',
      amount: bonus,
      status: 'approved',
      description: 'Bônus de Check-in Diário',
      createdAt: new Date().toISOString()
    });

    res.json({
      message: 'Check-in realizado com sucesso!',
      bonus,
      newBalance: newBalance
    });
  } catch (err) {
    console.error('[WALLET ERROR /checkin]:', err);
    res.status(500).json({ error: 'Erro ao realizar check-in.' });
  }
});

// Histórico de Transações
router.get('/transactions', authMiddleware, async (req, res) => {
  try {
    const userTx = await getTransactionsByUserId(req.user.id);
    res.json(userTx);
  } catch (err) {
    console.error('[WALLET ERROR /transactions]:', err);
    res.status(500).json({ error: 'Erro ao buscar histórico de transações.' });
  }
});

module.exports = router;

