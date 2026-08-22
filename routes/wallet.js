const express = require('express');
const router = express.Router();
const {
  findUserById,
  findUserByPhone,
  findUserByInviteCode,
  updateUser,
  getContractsByUserId,
  getTransactionsByUserId,
  createTransaction,
  getAllProducts,
  findProductById,
  createContract,
  recordWebhookLog,
  getSystemSettings
} = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { createCartpandaPix } = require('../services/cartpanda');
const { notifyAdminWithdrawal, notifyAdminDeposit } = require('../services/telegramBot');

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

// Webhook Oficial do Cartpanda Pay (Chamado quando o Pix / Pedido é pago)
router.post('/webhook/cartpanda', async (req, res) => {
  console.log('[CARTPANDA WEBHOOK RECEIVED]', JSON.stringify(req.body));
  const rawBody = req.body || {};

  try {
    // 1. Extração flexível de Status
    const status = String(
      rawBody.status ||
      rawBody.order_status ||
      rawBody.financial_status ||
      (rawBody.order && (rawBody.order.status || rawBody.order.financial_status)) ||
      (rawBody.event === 'order.paid' ? 'paid' : '')
    ).toLowerCase();

    // 2. Extração de Valor
    const amount = parseFloat(
      rawBody.amount ||
      rawBody.total ||
      (rawBody.order && (rawBody.order.total || rawBody.order.total_price || rawBody.order.subtotal_price)) ||
      0
    );

    // 3. Extração de Dados do Cliente (Telefone, Nome, Email, ID de Referência)
    const phoneCandidates = [
      rawBody.phone,
      rawBody.customer_phone,
      rawBody.buyer_phone,
      rawBody.customer && rawBody.customer.phone,
      rawBody.order && rawBody.order.phone,
      rawBody.order && rawBody.order.customer && rawBody.order.customer.phone,
      rawBody.order && rawBody.order.shipping_address && rawBody.order.shipping_address.phone,
      rawBody.order && rawBody.order.billing_address && rawBody.order.billing_address.phone,
      rawBody.metadata && rawBody.metadata.reference_id
    ].filter(Boolean);

    const customerName = 
      rawBody.customer_name ||
      rawBody.name ||
      (rawBody.customer && (rawBody.customer.name || `${rawBody.customer.first_name || ''} ${rawBody.customer.last_name || ''}`.trim())) ||
      (rawBody.order && rawBody.order.customer && (rawBody.order.customer.name || `${rawBody.order.customer.first_name || ''} ${rawBody.order.customer.last_name || ''}`.trim())) ||
      'Cliente';

    const customerEmail = 
      rawBody.customer_email ||
      rawBody.email ||
      (rawBody.customer && rawBody.customer.email) ||
      (rawBody.order && rawBody.order.customer && rawBody.order.customer.email) ||
      '';

    const isPaid = ['paid', 'completed', 'approved', 'authorized', 'paid_pending_review', 'succeeded'].includes(status);

    if (!isPaid) {
      await recordWebhookLog({
        provider: 'cartpanda',
        eventType: rawBody.event || 'status_update',
        amount: amount,
        customerPhone: phoneCandidates[0] || null,
        customerName: customerName,
        customerEmail: customerEmail,
        matchedUserId: null,
        status: 'ignored',
        note: `Status não pago: "${status}"`,
        rawPayload: rawBody
      });
      return res.status(200).json({ received: true, note: `Status "${status}" ignorado.` });
    }

    // 4. Localização do Usuário/Operador
    let user = null;
    for (const p of phoneCandidates) {
      if (String(p).startsWith('usr_')) {
        user = await findUserById(p);
        if (user) break;
      }
      user = await findUserByPhone(p);
      if (user) break;
    }

    if (!user) {
      console.warn('[CARTPANDA WEBHOOK] Usuário não localizado para os telefones:', phoneCandidates);
      await recordWebhookLog({
        provider: 'cartpanda',
        eventType: rawBody.event || 'order.paid',
        amount: amount,
        customerPhone: phoneCandidates[0] || null,
        customerName: customerName,
        customerEmail: customerEmail,
        matchedUserId: null,
        status: 'user_not_found',
        note: `Pagamento de R$ ${amount.toFixed(2)} aprovado, mas nenhum operador bateu com os dados.`,
        rawPayload: rawBody
      });
      return res.status(200).json({ received: true, warning: 'Usuário não encontrado.' });
    }

    // 5. Identificar Produto / Frota pelo valor ou itens
    const products = await getAllProducts();
    let matchedProduct = products.find(p => Math.abs(p.price - amount) < 0.01);
    
    if (!matchedProduct && rawBody.order && Array.isArray(rawBody.order.line_items)) {
      for (const item of rawBody.order.line_items) {
        const itemTitle = (item.title || item.name || '').toLowerCase();
        matchedProduct = products.find(p => itemTitle.includes(p.id.toLowerCase()) || itemTitle.includes(p.name.toLowerCase()));
        if (matchedProduct) break;
      }
    }

    const txId = `CP-${rawBody.id || (rawBody.order && rawBody.order.id) || Date.now()}`;
    const now = new Date().toISOString();

    // 6. Atualizar total depositado do usuário
    await updateUser(user.id, {
      totalDeposited: (user.totalDeposited || 0) + amount
    });

    // 7. Criar Transação de Depósito
    await createTransaction({
      id: txId,
      userId: user.id,
      type: 'deposit',
      amount: amount,
      status: 'approved',
      description: `Pagamento Pix Cartpanda Confirmado (+ R$ ${amount.toFixed(2)})`,
      createdAt: now
    });

    let autoHired = false;
    let hiredProductName = null;

    // 8. Ativar Frota Automaticamente se um produto correspondente existir
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

      autoHired = true;
      hiredProductName = matchedProduct.name;

      // 9. Comissões Multinível para a Rede
      if (user.referredBy) {
        const level1User = await findUserById(user.referredBy);
        if (level1User) {
          const comm1 = matchedProduct.price * 0.10; // 10%
          await updateUser(level1User.id, { balance: level1User.balance + comm1 });

          await createTransaction({
            id: `COMM-${Date.now()}-L1`,
            userId: level1User.id,
            type: 'commission',
            amount: comm1,
            status: 'approved',
            description: `Comissão Nível 1 (${user.operatorName}) - ${matchedProduct.name}`,
            createdAt: now
          });

          if (level1User.referredBy) {
            const level2User = await findUserById(level1User.referredBy);
            if (level2User) {
              const comm2 = matchedProduct.price * 0.05; // 5%
              await updateUser(level2User.id, { balance: level2User.balance + comm2 });

              await createTransaction({
                id: `COMM-${Date.now()}-L2`,
                userId: level2User.id,
                type: 'commission',
                amount: comm2,
                status: 'approved',
                description: `Comissão Nível 2 - ${matchedProduct.name}`,
                createdAt: now
              });
            }
          }
        }
      }
    } else {
      // Se não corresponde a uma frota exata, credita no saldo para escolha livre
      await updateUser(user.id, {
        balance: user.balance + amount
      });
    }

    // 10. Notificação Privada ao Administrador via Telegram
    notifyAdminDeposit({
      operatorName: user.operatorName,
      phone: user.phone,
      amount: amount,
      productName: hiredProductName,
      txId: txId,
      isAutoHire: autoHired
    }).catch(e => console.error('[TELEGRAM NOTIFY DEPOSIT ERROR]:', e.message));

    // 10.1 Sincroniza Pagamento / Contrato com o Nexus CRM
    getSystemSettings().then(settings => {
      const crmUrl = settings.nexusCrmUrl || process.env.NEXUS_CRM_URL || 'https://limitations-sequences-similar-treated.trycloudflare.com';
      fetch(`${crmUrl}/api/leads/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: user.operatorName,
          phone: user.phone,
          campaign: `TaxiNexo - ${hiredProductName || 'Recarga Pix'}`,
          utm_source: 'cartpanda_checkout',
          value: amount
        })
      }).catch(e => console.warn('[NEXUS CRM PAYMENT SYNC WARNING]:', e.message));
    }).catch(() => {});

    // 11. Registrar no Log de Auditoria de Webhooks
    await recordWebhookLog({
      provider: 'cartpanda',
      eventType: rawBody.event || 'order.paid',
      amount: amount,
      customerPhone: phoneCandidates[0] || user.phone,
      customerName: customerName,
      customerEmail: customerEmail,
      matchedUserId: user.id,
      status: 'processed',
      note: autoHired ? `Frota ${hiredProductName} ativada com sucesso!` : `Saldo de R$ ${amount.toFixed(2)} creditado.`,
      rawPayload: rawBody
    });

    console.log(`[CARTPANDA] Sucesso! Operador ${user.operatorName} processado (+ R$ ${amount.toFixed(2)}, autoHire: ${autoHired})`);
    res.status(200).json({ success: true, user: user.id, autoHired });
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

