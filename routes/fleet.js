const express = require('express');
const router = express.Router();
const {
  getAllProducts,
  findProductById,
  getContractsByUserId,
  createContract,
  findUserById,
  updateUser,
  createTransaction
} = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { distributeCareerCommissions } = require('../services/careerEngine');

// Listar Produtos / Veículos Disponíveis
router.get('/products', async (req, res) => {
  try {
    const products = await getAllProducts();
    res.json(products);
  } catch (err) {
    console.error('[FLEET ERROR /products]:', err);
    res.status(500).json({ error: 'Erro ao listar veículos.' });
  }
});

// Listar Contratos Ativos do Usuário
router.get('/my-contracts', authMiddleware, async (req, res) => {
  try {
    const userContracts = await getContractsByUserId(req.user.id);
    res.json(userContracts);
  } catch (err) {
    console.error('[FLEET ERROR /my-contracts]:', err);
    res.status(500).json({ error: 'Erro ao buscar contratos.' });
  }
});

// Contratar Veículo
router.post('/hire', authMiddleware, async (req, res) => {
  try {
    const { productId } = req.body;
    const product = await findProductById(productId);

    if (!product) {
      return res.status(404).json({ error: 'Veículo não encontrado.' });
    }

    const user = await findUserById(req.user.id);
    if (user.balance < product.price) {
      return res.status(400).json({ error: 'Saldo insuficiente para contratar este veículo.' });
    }

    // Debita do saldo do usuário
    const newBalance = user.balance - product.price;
    await updateUser(user.id, { balance: newBalance });

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

    await createContract(newContract);

    // Registra transação da contratação
    await createTransaction({
      id: `TX-${Date.now()}`,
      userId: user.id,
      type: 'contract',
      amount: -product.price,
      status: 'approved',
      description: `Contratação de ${product.name}`,
      createdAt: new Date().toISOString()
    });

    // Comissão Multinível com Plano de Carreira e Desbloqueio Progressivo de 5 Níveis
    await distributeCareerCommissions({
      buyerUser: user,
      amount: product.price,
      productName: product.name
    });

    res.status(201).json({
      message: 'Contrato ativado com sucesso!',
      contract: newContract,
      newBalance: newBalance
    });
  } catch (err) {
    console.error('[FLEET ERROR /hire]:', err);
    res.status(500).json({ error: 'Erro ao processar contratação.' });
  }
});

module.exports = router;

