const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_FILE = path.join(__dirname, 'data.json');

const defaultData = {
  users: [
    {
      id: 'usr_8843',
      operatorName: 'Operador #8843',
      phone: '11987654321',
      passwordHash: bcrypt.hashSync('123456', 10),
      inviteCode: 'NEXO8843',
      referredBy: null,
      balance: 1250.80,
      totalDeposited: 1500.00,
      totalWithdrawn: 249.20,
      vipLevel: 'VIP 1',
      lastCheckinDate: null,
      createdAt: new Date().toISOString()
    }
  ],
    products: [
    {
      id: 'NX-101',
      name: 'Tesla Robotaxi Model 3',
      category: 'economy',
      status: 'Disponível',
      price: 150.00,
      dailyReturn: 14.50,
      periodDays: 30,
      checkoutUrl: 'https://pagamento.pricipiaskins.site/checkout/212187584:1',
      description: 'Veículo elétrico autônomo para corridas urbanas diárias.'
    },
    {
      id: 'NX-202',
      name: 'Baidu Apollo RT6',
      category: 'popular',
      status: 'Alta Demanda',
      price: 350.00,
      dailyReturn: 36.00,
      periodDays: 45,
      checkoutUrl: 'https://pagamento.pricipiaskins.site/checkout/212187589:1',
      description: 'Robotaxi com 38 sensores LiDAR e IA de nível 4 integrada.'
    },
    {
      id: 'NX-707',
      name: 'Tesla Cybercab Next-Gen',
      category: 'popular',
      status: 'Alta Demanda',
      price: 600.00,
      dailyReturn: 68.00,
      periodDays: 40,
      checkoutUrl: 'https://pagamento.pricipiaskins.site/checkout/212187590:1',
      description: 'Frota de carregamento por indução e operação 24/7 sem volante.'
    },
    {
      id: 'NX-404',
      name: 'Cruise Origin Autonomous',
      category: 'popular',
      status: 'Alta Demanda',
      price: 900.00,
      dailyReturn: 105.00,
      periodDays: 45,
      checkoutUrl: 'https://pagamento.pricipiaskins.site/checkout/212187597:1',
      description: 'Lançadeira autônoma espaçosa para transporte compartilhado.'
    },
    {
      id: 'NX-303',
      name: 'Waymo Autonomous Van',
      category: 'vip',
      status: 'VIP',
      price: 1500.00,
      dailyReturn: 185.00,
      periodDays: 60,
      checkoutUrl: 'https://pagamento.pricipiaskins.site/checkout/212187598:1',
      description: 'Van autônoma de alta capacidade operando em rotas corporativas.'
    },
    {
      id: 'NX-505',
      name: 'Zoox Urban Bi-Directional',
      category: 'vip',
      status: 'VIP',
      price: 2800.00,
      dailyReturn: 360.00,
      periodDays: 60,
      checkoutUrl: 'https://pagamento.pricipiaskins.site/checkout/212187602:1',
      description: 'Veículo bidirecional com tração nas 4 rodas para tráfego denso.'
    },
    {
      id: 'NX-606',
      name: 'NIO Autonomous Executive Fleet',
      category: 'vip',
      status: 'VIP',
      price: 5000.00,
      dailyReturn: 720.00,
      periodDays: 90,
      checkoutUrl: 'https://pagamento.pricipiaskins.site/checkout/212187611:1',
      description: 'Frota executiva premium com troca de bateria em 3 min.'
    }
  ],
  contracts: [
    {
      id: 'CTR-9912',
      userId: 'usr_8843',
      productId: 'NX-202',
      productName: 'Robotaxi Apollo RT6',
      dailyReturn: 38.00,
      totalDays: 45,
      daysRemaining: 24,
      status: 'Em corrida',
      startDate: new Date(Date.now() - 21 * 86400000).toISOString(),
      lastSettlement: new Date().toISOString()
    },
    {
      id: 'CTR-3341',
      userId: 'usr_8843',
      productId: 'NX-101',
      productName: 'Tesla Model 3 Fleet',
      dailyReturn: 15.50,
      totalDays: 30,
      daysRemaining: 5,
      status: 'Em corrida',
      startDate: new Date(Date.now() - 25 * 86400000).toISOString(),
      lastSettlement: new Date().toISOString()
    }
  ],
  transactions: [
    {
      id: 'TX-1001',
      userId: 'usr_8843',
      type: 'deposit',
      amount: 1500.00,
      status: 'approved',
      description: 'Recarga Pix Confirmada',
      createdAt: new Date(Date.now() - 30 * 86400000).toISOString()
    },
    {
      id: 'TX-1002',
      userId: 'usr_8843',
      type: 'contract',
      amount: -350.00,
      status: 'approved',
      description: 'Contratação Robotaxi Apollo RT6',
      createdAt: new Date(Date.now() - 21 * 86400000).toISOString()
    }
  ]
};

function readDb() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
    return defaultData;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return defaultData;
  }
}

function writeDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

module.exports = { readDb, writeDb };
