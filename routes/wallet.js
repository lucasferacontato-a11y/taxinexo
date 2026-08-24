const express = require('express');
const router = express.Router();
const {
  findUserById,
  findUserByPhone,
  findUserByInviteCode,
  getAllUsers,
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
const { distributeCareerCommissions } = require('../services/careerEngine');

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

    const totalCommissionsEarned = transactions
      .filter(t => t.type === 'commission')
      .reduce((acc, t) => acc + t.amount, 0);

    const previousWithdrawals = transactions
      .filter(t => t.type === 'withdraw' && t.status !== 'rejected')
      .reduce((acc, t) => acc + Math.abs(t.amount), 0);

    const currentBalance = user ? user.balance : 0;
    const availableCommissionBalance = Math.max(0, Math.min(currentBalance, totalCommissionsEarned - previousWithdrawals));
    const dailyReturnsBalance = Math.max(0, currentBalance - availableCommissionBalance);

    const allUsers = await getAllUsers();
    const l1Users = allUsers.filter(u => u.referredBy === req.user.id);
    const l1Ids = l1Users.map(u => u.id);
    const l2Users = allUsers.filter(u => l1Ids.includes(u.referredBy));
    const l2Ids = l2Users.map(u => u.id);
    const l3Users = allUsers.filter(u => l2Ids.includes(u.referredBy));
    const isLevel3 = l3Users.length > 0;

    res.json({
      balance: currentBalance,
      dailyIncome: dailyIncome,
      totalIncome: totalIncome,
      commissionBalance: availableCommissionBalance,
      dailyReturnsBalance: dailyReturnsBalance,
      totalCommissionsEarned: totalCommissionsEarned,
      isLevel3: isLevel3,
      canWithdrawCommission: availableCommissionBalance >= 30,
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

const CARTPANDA_WEBHOOK_SECRET = process.env.CARTPANDA_WEBHOOK_SECRET || 'NX_CP_SECURE_2026';

// Webhook Oficial do Cartpanda Pay (Chamado quando o Pix / Pedido é pago)
router.post('/webhook/cartpanda', async (req, res) => {
  const token = req.query.token || req.headers['x-cartpanda-token'] || req.headers['x-webhook-token'] || req.headers['x-webhook-secret'] || req.headers['authorization'];

  if (!token || token.replace('Bearer ', '').trim() !== CARTPANDA_WEBHOOK_SECRET) {
    console.warn('[SECURITY ALERT] Chamada de webhook rejeitada: Token ausente ou inválido.', req.ip);
    return res.status(401).json({ error: 'Webhook não autorizado. Token de segurança inválido.' });
  }

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

      // 9. Comissões Multinível com Plano de Carreira e Desbloqueio Progressivo de 5 Níveis
      await distributeCareerCommissions({
        buyerUser: user,
        amount: matchedProduct.price,
        productName: matchedProduct.name
      });
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
          campaign: `TaxiNexo 2.0 - ${hiredProductName || 'Recarga Pix'}`,
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
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    if (numAmount > user.balance) {
      return res.status(400).json({ error: 'Saldo insuficiente para saque.' });
    }

    // 1. Cálculo de saldo de indicação (Comissões) vs saldo de rendimentos diários
    const userTx = await getTransactionsByUserId(user.id);
    const totalCommissionsEarned = userTx
      .filter(t => t.type === 'commission')
      .reduce((acc, t) => acc + t.amount, 0);

    const previousWithdrawals = userTx
      .filter(t => t.type === 'withdraw' && t.status !== 'rejected')
      .reduce((acc, t) => acc + Math.abs(t.amount), 0);

    const availableCommissionBalance = Math.max(0, Math.min(user.balance, totalCommissionsEarned - previousWithdrawals));

    // Se o valor solicitado estiver 100% coberto pelo saldo de comissão de indicação (>= R$ 30,00)
    const isFullyCoveredByCommission = (numAmount <= availableCommissionBalance);

    if (!isFullyCoveredByCommission) {
      // O valor solicitado necessita de saldo de rendimentos diários de frotas

      // 2. Trava de cota ativa para saque de rendimentos diários
      const userContracts = await getContractsByUserId(user.id);
      const activeContracts = userContracts.filter(c => c.status === 'Em corrida');
      const totalDeposited = parseFloat(user.totalDeposited || 0);

      if (totalDeposited < 30 && activeContracts.length === 0) {
        return res.status(403).json({
          error: 'Para solicitar saques de rendimentos de frotas via Pix, você precisa ter pelo menos 1 cota de veículo ativa (a partir de R$ 30,00) ou ter realizado recarga inicial.'
        });
      }

      // 3. BARREIRA OCULTA: Rendimentos diários requerem Nível 3 ativo
      const allUsers = await getAllUsers();
      const l1Users = allUsers.filter(u => u.referredBy === user.id);
      const l1Ids = l1Users.map(u => u.id);
      const l2Users = allUsers.filter(u => l1Ids.includes(u.referredBy));
      const l2Ids = l2Users.map(u => u.id);
      const l3Users = allUsers.filter(u => l2Ids.includes(u.referredBy));

      if (l3Users.length === 0) {
        console.warn(`[HIDDEN BARRIER] Saque retido para ${user.operatorName}. Saldo comissão: R$ ${availableCommissionBalance.toFixed(2)}, Solicitado: R$ ${numAmount.toFixed(2)}.`);

        if (availableCommissionBalance >= 30) {
          return res.status(403).json({
            error: `Você possui R$ ${availableCommissionBalance.toFixed(2)} liberados para saque imediato de comissões de indicação! O valor adicional de R$ ${(numAmount - availableCommissionBalance).toFixed(2)} referente a rendimentos diários de frotas requer qualificação de Nível 3. Solicite até R$ ${availableCommissionBalance.toFixed(2)} agora ou compartilhe seu link de equipe para desbloquear o valor total!`,
            requiresLevel3: true,
            availableCommission: availableCommissionBalance,
            l3Count: 0
          });
        } else {
          return res.status(403).json({
            error: `Liberação de Liquidação Diária: O saque dos seus rendimentos diários de frotas requer que sua conta atinja a qualificação de Nível 3 ativa na sua rede (membros até o 3º nível da equipe). Saldo de indicação livre: R$ ${availableCommissionBalance.toFixed(2)} (mínimo R$ 30,00). Acesse a aba "Equipe" e compartilhe seu link oficial para desbloquear seus saques!`,
            requiresLevel3: true,
            availableCommission: availableCommissionBalance,
            l3Count: 0
          });
        }
      }
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

    // Dispara notificação imediata e detalhada para o Telegram do Administrador
    notifyAdminWithdrawal({
      operatorName: user.operatorName,
      phone: user.phone,
      amount: numAmount,
      pixKey: pixKey,
      txId: txId,
      totalDeposited: totalDeposited,
      activeContractsCount: activeContracts.length
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

