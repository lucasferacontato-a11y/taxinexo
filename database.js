require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const DB_FILE = path.join(__dirname, 'data.json');
const DATABASE_URL = process.env.DATABASE_URL || '';

let pool = null;
const isPostgres = Boolean(DATABASE_URL && DATABASE_URL.trim().length > 0);

if (isPostgres) {
  console.log('[DATABASE] Modo PostgreSQL ativado via DATABASE_URL');
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
  });
} else {
  console.log('[DATABASE] DATABASE_URL não detectada. Utilizando armazenamento em arquivo local (data.json)');
}

const defaultProducts = [
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
];

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
  products: defaultProducts,
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

// ==========================================
// LOCAL FILE SYSTEM HELPERS (FALLBACK)
// ==========================================
function readJsonDb() {
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

function writeJsonDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ==========================================
// POSTGRESQL INITIALIZATION & MIGRATIONS
// ==========================================
async function initDb() {
  if (!isPostgres) {
    readJsonDb();
    console.log('[DATABASE] Banco local JSON verificado.');
    return;
  }

  const client = await pool.connect();
  try {
    console.log('[DATABASE] Conectado ao PostgreSQL. Verificando tabelas...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        operator_name VARCHAR(128) NOT NULL,
        phone VARCHAR(32) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        invite_code VARCHAR(32) UNIQUE NOT NULL,
        referred_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
        balance NUMERIC(14, 2) DEFAULT 0.00,
        total_deposited NUMERIC(14, 2) DEFAULT 0.00,
        total_withdrawn NUMERIC(14, 2) DEFAULT 0.00,
        vip_level VARCHAR(32) DEFAULT 'VIP 1',
        last_checkin_date VARCHAR(32),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS products (
        id VARCHAR(32) PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        category VARCHAR(64) DEFAULT 'economy',
        status VARCHAR(64) DEFAULT 'Disponível',
        price NUMERIC(14, 2) NOT NULL,
        daily_return NUMERIC(14, 2) NOT NULL,
        period_days INTEGER NOT NULL,
        checkout_url TEXT,
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS contracts (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        product_id VARCHAR(32) NOT NULL,
        product_name VARCHAR(128) NOT NULL,
        daily_return NUMERIC(14, 2) NOT NULL,
        total_days INTEGER NOT NULL,
        days_remaining INTEGER NOT NULL,
        status VARCHAR(32) DEFAULT 'Em corrida',
        start_date TIMESTAMPTZ DEFAULT NOW(),
        last_settlement TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(32) NOT NULL,
        amount NUMERIC(14, 2) NOT NULL,
        status VARCHAR(32) DEFAULT 'approved',
        pix_key VARCHAR(128),
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        approved_at TIMESTAMPTZ,
        rejected_at TIMESTAMPTZ
      );
    `);

    // Semeia produtos caso a tabela esteja vazia
    const prodRes = await client.query('SELECT COUNT(*) FROM products');
    if (parseInt(prodRes.rows[0].count, 10) === 0) {
      console.log('[DATABASE] Populando catálogo inicial de veículos...');
      for (const p of defaultProducts) {
        await client.query(`
          INSERT INTO products (id, name, category, status, price, daily_return, period_days, checkout_url, description)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [p.id, p.name, p.category, p.status, p.price, p.dailyReturn, p.periodDays, p.checkoutUrl, p.description]);
      }
    }

    // Semeia usuário padrão de teste caso a tabela esteja vazia
    const userRes = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(userRes.rows[0].count, 10) === 0) {
      console.log('[DATABASE] Criando usuário de demonstração...');
      const u = defaultData.users[0];
      await client.query(`
        INSERT INTO users (id, operator_name, phone, password_hash, invite_code, balance, total_deposited, total_withdrawn, vip_level, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [u.id, u.operatorName, u.phone, u.passwordHash, u.inviteCode, u.balance, u.totalDeposited, u.totalWithdrawn, u.vipLevel, u.createdAt]);

      for (const c of defaultData.contracts) {
        await client.query(`
          INSERT INTO contracts (id, user_id, product_id, product_name, daily_return, total_days, days_remaining, status, start_date, last_settlement)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [c.id, c.userId, c.productId, c.productName, c.dailyReturn, c.totalDays, c.daysRemaining, c.status, c.startDate, c.lastSettlement]);
      }

      for (const t of defaultData.transactions) {
        await client.query(`
          INSERT INTO transactions (id, user_id, type, amount, status, description, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [t.id, t.userId, t.type, t.amount, t.status, t.description, t.createdAt]);
      }
    }

    console.log('[DATABASE] Tabelas PostgreSQL inicializadas com sucesso!');
  } catch (err) {
    console.error('[DATABASE ERROR] Erro na inicialização do PostgreSQL:', err);
  } finally {
    client.release();
  }
}

// Helpers para mapeamento de colunas Postgres <-> camelCase
function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    operatorName: row.operator_name,
    phone: row.phone,
    passwordHash: row.password_hash,
    inviteCode: row.invite_code,
    referredBy: row.referred_by,
    balance: parseFloat(row.balance || 0),
    totalDeposited: parseFloat(row.total_deposited || 0),
    totalWithdrawn: parseFloat(row.total_withdrawn || 0),
    vipLevel: row.vip_level,
    lastCheckinDate: row.last_checkin_date,
    createdAt: row.created_at
  };
}

function mapProduct(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    status: row.status,
    price: parseFloat(row.price || 0),
    dailyReturn: parseFloat(row.daily_return || 0),
    periodDays: parseInt(row.period_days, 10),
    checkoutUrl: row.checkout_url,
    description: row.description
  };
}

function mapContract(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    productId: row.product_id,
    productName: row.product_name,
    dailyReturn: parseFloat(row.daily_return || 0),
    totalDays: parseInt(row.total_days, 10),
    daysRemaining: parseInt(row.days_remaining, 10),
    status: row.status,
    startDate: row.start_date,
    lastSettlement: row.last_settlement
  };
}

function mapTransaction(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    amount: parseFloat(row.amount || 0),
    status: row.status,
    pixKey: row.pix_key,
    description: row.description,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    rejectedAt: row.rejected_at
  };
}

// ==========================================
// UNIFIED ASYNC DATA ACCESS LAYER
// ==========================================

// --- USERS ---
async function findUserById(id) {
  if (isPostgres) {
    const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return mapUser(res.rows[0]);
  }
  const db = readJsonDb();
  return db.users.find(u => u.id === id) || null;
}

async function findUserByPhone(phone) {
  const clean = (phone || '').replace(/\D/g, '');
  if (isPostgres) {
    const res = await pool.query('SELECT * FROM users WHERE phone = $1 OR phone = $2', [clean, phone]);
    return mapUser(res.rows[0]);
  }
  const db = readJsonDb();
  return db.users.find(u => u.phone === clean || u.phone === phone) || null;
}

async function findUserByInviteCode(code) {
  if (!code) return null;
  const upper = code.toUpperCase();
  if (isPostgres) {
    const res = await pool.query('SELECT * FROM users WHERE UPPER(invite_code) = $1', [upper]);
    return mapUser(res.rows[0]);
  }
  const db = readJsonDb();
  return db.users.find(u => (u.inviteCode || '').toUpperCase() === upper) || null;
}

async function createUser(user) {
  if (isPostgres) {
    await pool.query(`
      INSERT INTO users (id, operator_name, phone, password_hash, invite_code, referred_by, balance, total_deposited, total_withdrawn, vip_level, last_checkin_date, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      user.id,
      user.operatorName,
      user.phone,
      user.passwordHash,
      user.inviteCode,
      user.referredBy || null,
      user.balance || 0,
      user.totalDeposited || 0,
      user.totalWithdrawn || 0,
      user.vipLevel || 'VIP 1',
      user.lastCheckinDate || null,
      user.createdAt || new Date().toISOString()
    ]);
    return user;
  }

  const db = readJsonDb();
  db.users.push(user);
  writeJsonDb(db);
  return user;
}

async function updateUser(id, fields) {
  if (isPostgres) {
    const setClauses = [];
    const values = [];
    let idx = 1;

    if (fields.balance !== undefined) {
      setClauses.push(`balance = $${idx++}`);
      values.push(fields.balance);
    }
    if (fields.totalDeposited !== undefined) {
      setClauses.push(`total_deposited = $${idx++}`);
      values.push(fields.totalDeposited);
    }
    if (fields.totalWithdrawn !== undefined) {
      setClauses.push(`total_withdrawn = $${idx++}`);
      values.push(fields.totalWithdrawn);
    }
    if (fields.lastCheckinDate !== undefined) {
      setClauses.push(`last_checkin_date = $${idx++}`);
      values.push(fields.lastCheckinDate);
    }
    if (fields.vipLevel !== undefined) {
      setClauses.push(`vip_level = $${idx++}`);
      values.push(fields.vipLevel);
    }
    if (fields.operatorName !== undefined) {
      setClauses.push(`operator_name = $${idx++}`);
      values.push(fields.operatorName);
    }

    if (setClauses.length === 0) return await findUserById(id);

    values.push(id);
    const query = `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;
    const res = await pool.query(query, values);
    return mapUser(res.rows[0]);
  }

  const db = readJsonDb();
  const user = db.users.find(u => u.id === id);
  if (user) {
    Object.assign(user, fields);
    writeJsonDb(db);
  }
  return user;
}

async function getAllUsers() {
  if (isPostgres) {
    const res = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
    return res.rows.map(mapUser);
  }
  const db = readJsonDb();
  return db.users;
}

// --- PRODUCTS ---
async function getAllProducts() {
  if (isPostgres) {
    const res = await pool.query('SELECT * FROM products ORDER BY price ASC');
    return res.rows.map(mapProduct);
  }
  const db = readJsonDb();
  return db.products;
}

async function findProductById(id) {
  if (isPostgres) {
    const res = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    return mapProduct(res.rows[0]);
  }
  const db = readJsonDb();
  return db.products.find(p => p.id === id) || null;
}

// --- CONTRACTS ---
async function getContractsByUserId(userId) {
  if (isPostgres) {
    const res = await pool.query('SELECT * FROM contracts WHERE user_id = $1 ORDER BY start_date DESC', [userId]);
    return res.rows.map(mapContract);
  }
  const db = readJsonDb();
  return db.contracts.filter(c => c.userId === userId);
}

async function getAllActiveContracts() {
  if (isPostgres) {
    const res = await pool.query("SELECT * FROM contracts WHERE status = 'Em corrida' AND days_remaining > 0");
    return res.rows.map(mapContract);
  }
  const db = readJsonDb();
  return db.contracts.filter(c => c.status === 'Em corrida' && c.daysRemaining > 0);
}

async function createContract(contract) {
  if (isPostgres) {
    await pool.query(`
      INSERT INTO contracts (id, user_id, product_id, product_name, daily_return, total_days, days_remaining, status, start_date, last_settlement)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      contract.id,
      contract.userId,
      contract.productId,
      contract.productName,
      contract.dailyReturn,
      contract.totalDays,
      contract.daysRemaining,
      contract.status || 'Em corrida',
      contract.startDate || new Date().toISOString(),
      contract.lastSettlement || new Date().toISOString()
    ]);
    return contract;
  }

  const db = readJsonDb();
  db.contracts.unshift(contract);
  writeJsonDb(db);
  return contract;
}

async function updateContract(id, fields) {
  if (isPostgres) {
    const setClauses = [];
    const values = [];
    let idx = 1;

    if (fields.daysRemaining !== undefined) {
      setClauses.push(`days_remaining = $${idx++}`);
      values.push(fields.daysRemaining);
    }
    if (fields.status !== undefined) {
      setClauses.push(`status = $${idx++}`);
      values.push(fields.status);
    }
    if (fields.lastSettlement !== undefined) {
      setClauses.push(`last_settlement = $${idx++}`);
      values.push(fields.lastSettlement);
    }

    if (setClauses.length === 0) return;

    values.push(id);
    await pool.query(`UPDATE contracts SET ${setClauses.join(', ')} WHERE id = $${idx}`, values);
    return;
  }

  const db = readJsonDb();
  const c = db.contracts.find(item => item.id === id);
  if (c) {
    Object.assign(c, fields);
    writeJsonDb(db);
  }
}

// --- TRANSACTIONS ---
async function getTransactionsByUserId(userId) {
  if (isPostgres) {
    const res = await pool.query('SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return res.rows.map(mapTransaction);
  }
  const db = readJsonDb();
  return db.transactions.filter(t => t.userId === userId);
}

async function getAllTransactions() {
  if (isPostgres) {
    const res = await pool.query(`
      SELECT t.*, u.operator_name, u.phone 
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.id
      ORDER BY t.created_at DESC
    `);
    return res.rows.map(row => ({
      ...mapTransaction(row),
      userName: row.operator_name || 'Usuário Desconhecido',
      userPhone: row.phone || 'N/A'
    }));
  }

  const db = readJsonDb();
  return db.transactions.map(t => {
    const user = db.users.find(u => u.id === t.userId);
    return {
      ...t,
      userName: user ? user.operatorName : 'Usuário Desconhecido',
      userPhone: user ? user.phone : 'N/A'
    };
  });
}

async function findTransactionById(id) {
  if (isPostgres) {
    const res = await pool.query('SELECT * FROM transactions WHERE id = $1', [id]);
    return mapTransaction(res.rows[0]);
  }
  const db = readJsonDb();
  return db.transactions.find(t => t.id === id) || null;
}

async function createTransaction(tx) {
  if (isPostgres) {
    await pool.query(`
      INSERT INTO transactions (id, user_id, type, amount, status, pix_key, description, created_at, approved_at, rejected_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      tx.id,
      tx.userId,
      tx.type,
      tx.amount,
      tx.status || 'approved',
      tx.pixKey || null,
      tx.description || '',
      tx.createdAt || new Date().toISOString(),
      tx.approvedAt || null,
      tx.rejectedAt || null
    ]);
    return tx;
  }

  const db = readJsonDb();
  db.transactions.unshift(tx);
  writeJsonDb(db);
  return tx;
}

async function updateTransaction(id, fields) {
  if (isPostgres) {
    const setClauses = [];
    const values = [];
    let idx = 1;

    if (fields.status !== undefined) {
      setClauses.push(`status = $${idx++}`);
      values.push(fields.status);
    }
    if (fields.approvedAt !== undefined) {
      setClauses.push(`approved_at = $${idx++}`);
      values.push(fields.approvedAt);
    }
    if (fields.rejectedAt !== undefined) {
      setClauses.push(`rejected_at = $${idx++}`);
      values.push(fields.rejectedAt);
    }

    if (setClauses.length === 0) return await findTransactionById(id);

    values.push(id);
    const query = `UPDATE transactions SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;
    const res = await pool.query(query, values);
    return mapTransaction(res.rows[0]);
  }

  const db = readJsonDb();
  const tx = db.transactions.find(t => t.id === id);
  if (tx) {
    Object.assign(tx, fields);
    writeJsonDb(db);
  }
  return tx;
}

// --- STATS & METRICS ---
async function getGlobalMetrics() {
  if (isPostgres) {
    const [userRes, depRes, withRes, pendRes, contRes, custRes] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query("SELECT COALESCE(SUM(amount), 0) as sum FROM transactions WHERE type = 'deposit' AND status = 'approved'"),
      pool.query("SELECT COALESCE(SUM(ABS(amount)), 0) as sum FROM transactions WHERE type = 'withdraw' AND status = 'approved'"),
      pool.query("SELECT COUNT(*) FROM transactions WHERE type = 'withdraw' AND status = 'pending'"),
      pool.query("SELECT COUNT(*) FROM contracts WHERE status = 'Em corrida'"),
      pool.query('SELECT COALESCE(SUM(balance), 0) as sum FROM users')
    ]);

    return {
      totalUsers: parseInt(userRes.rows[0].count, 10),
      totalDeposits: parseFloat(depRes.rows[0].sum),
      totalWithdrawals: parseFloat(withRes.rows[0].sum),
      pendingWithdrawalsCount: parseInt(pendRes.rows[0].count, 10),
      activeContracts: parseInt(contRes.rows[0].count, 10),
      totalCustodyBalance: parseFloat(custRes.rows[0].sum)
    };
  }

  const db = readJsonDb();
  const totalUsers = db.users.length;
  const totalDeposits = db.transactions
    .filter(t => t.type === 'deposit' && t.status === 'approved')
    .reduce((acc, t) => acc + t.amount, 0);
  const totalWithdrawals = db.transactions
    .filter(t => t.type === 'withdraw' && t.status === 'approved')
    .reduce((acc, t) => acc + Math.abs(t.amount), 0);
  const pendingWithdrawalsCount = db.transactions
    .filter(t => t.type === 'withdraw' && t.status === 'pending').length;
  const activeContracts = db.contracts.filter(c => c.status === 'Em corrida').length;
  const totalCustodyBalance = db.users.reduce((acc, u) => acc + u.balance, 0);

  return {
    totalUsers,
    totalDeposits,
    totalWithdrawals,
    pendingWithdrawalsCount,
    activeContracts,
    totalCustodyBalance
  };
}

module.exports = {
  isPostgres,
  initDb,
  // Users
  findUserById,
  findUserByPhone,
  findUserByInviteCode,
  createUser,
  updateUser,
  getAllUsers,
  // Products
  getAllProducts,
  findProductById,
  // Contracts
  getContractsByUserId,
  getAllActiveContracts,
  createContract,
  updateContract,
  // Transactions
  getTransactionsByUserId,
  getAllTransactions,
  findTransactionById,
  createTransaction,
  updateTransaction,
  // Stats
  getGlobalMetrics
};
