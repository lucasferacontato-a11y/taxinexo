require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const DB_FILE = path.join(__dirname, 'data.json');
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://taxinexo_user:lFnKrtjDpDvyvQd61jRLuXEVC23t1Nhm@dpg-da2sqlbl550s73cfp14g-a.oregon-postgres.render.com/taxinexo';

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
    id: 'NX-030',
    name: 'BYD Dolphin Autonomous Urban',
    category: 'economy',
    status: 'Disponível',
    price: 30.00,
    dailyReturn: 2.80,
    periodDays: 20,
    checkoutUrl: 'https://pagamento.pricipiaskins.site/checkout/212260809:1',
    description: 'Robotaxi elétrico compacto para deslocamentos e entregas rápidas urbanas.'
  },
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
  users: [],
  products: defaultProducts,
  contracts: [],
  transactions: []
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

      CREATE TABLE IF NOT EXISTS page_views (
        id SERIAL PRIMARY KEY,
        path VARCHAR(255) NOT NULL,
        ip_hash VARCHAR(64) NOT NULL,
        device VARCHAR(32) DEFAULT 'desktop',
        referrer TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON page_views(created_at);
      CREATE INDEX IF NOT EXISTS idx_page_views_ip_hash_created ON page_views(ip_hash, created_at);

      CREATE TABLE IF NOT EXISTS webhook_logs (
        id SERIAL PRIMARY KEY,
        provider VARCHAR(64) DEFAULT 'cartpanda',
        event_type VARCHAR(64),
        amount NUMERIC(14, 2),
        customer_phone VARCHAR(64),
        customer_name VARCHAR(128),
        customer_email VARCHAR(128),
        matched_user_id VARCHAR(64),
        status VARCHAR(64),
        note TEXT,
        raw_payload JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);
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
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;

  // Monta conjunto de candidatos
  const candidates = new Set();
  candidates.add(digits);
  candidates.add(String(phone).trim());

  if (digits.startsWith('55') && digits.length >= 10) {
    candidates.add(digits.substring(2)); // sem 55
  } else if (!digits.startsWith('55')) {
    candidates.add('55' + digits); // com 55
  }

  // Tratamento inteligente do 9º dígito móvel
  const ddd = digits.startsWith('55') ? digits.substring(2, 4) : digits.substring(0, 2);
  const numberPart = digits.startsWith('55') ? digits.substring(4) : digits.substring(2);

  if (numberPart.length === 8) {
    const with9 = ddd + '9' + numberPart;
    candidates.add(with9);
    candidates.add('55' + with9);
  } else if (numberPart.length === 9 && numberPart.startsWith('9')) {
    const without9 = ddd + numberPart.substring(1);
    candidates.add(without9);
    candidates.add('55' + without9);
  }

  const candidateArray = Array.from(candidates);

  if (isPostgres) {
    // 1. Busca exata por qualquer uma das variações formatadas
    const res = await pool.query(
      'SELECT * FROM users WHERE phone = ANY($1::varchar[]) LIMIT 1',
      [candidateArray]
    );
    if (res.rows.length > 0) {
      return mapUser(res.rows[0]);
    }

    // 2. Busca por sufixo dos últimos 8 dígitos (garante matching mesmo com divergência de DDD/formato)
    if (digits.length >= 8) {
      const suffix = digits.slice(-8);
      const resSuffix = await pool.query(
        "SELECT * FROM users WHERE RIGHT(REGEXP_REPLACE(phone, '\\D', '', 'g'), 8) = $1 LIMIT 1",
        [suffix]
      );
      if (resSuffix.rows.length > 0) {
        return mapUser(resSuffix.rows[0]);
      }
    }

    return null;
  }

  const db = readJsonDb();
  for (const c of candidateArray) {
    const found = db.users.find(u => (u.phone || '').replace(/\D/g, '') === c.replace(/\D/g, ''));
    if (found) return found;
  }
  if (digits.length >= 8) {
    const suffix = digits.slice(-8);
    const found = db.users.find(u => ((u.phone || '').replace(/\D/g, '')).endsWith(suffix));
    if (found) return found;
  }
  return null;
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

async function updateProduct(id, fields) {
  if (isPostgres) {
    const setClauses = [];
    const values = [];
    let idx = 1;

    if (fields.checkoutUrl !== undefined) {
      setClauses.push(`checkout_url = $${idx++}`);
      values.push(fields.checkoutUrl);
    }
    if (fields.price !== undefined) {
      setClauses.push(`price = $${idx++}`);
      values.push(fields.price);
    }
    if (fields.dailyReturn !== undefined) {
      setClauses.push(`daily_return = $${idx++}`);
      values.push(fields.dailyReturn);
    }
    if (fields.name !== undefined) {
      setClauses.push(`name = $${idx++}`);
      values.push(fields.name);
    }
    if (fields.status !== undefined) {
      setClauses.push(`status = $${idx++}`);
      values.push(fields.status);
    }

    if (setClauses.length === 0) return await findProductById(id);

    values.push(id);
    const query = `UPDATE products SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;
    const res = await pool.query(query, values);
    return mapProduct(res.rows[0]);
  }

  const db = readJsonDb();
  const prod = db.products.find(p => p.id === id);
  if (prod) {
    Object.assign(prod, fields);
    writeJsonDb(db);
  }
  return prod;
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

// ==========================================
// ANALYTICS & VISITOR TRACKING
// ==========================================
async function recordPageView({ path, ipHash, device, referrer }) {
  if (isPostgres) {
    await pool.query(`
      INSERT INTO page_views (path, ip_hash, device, referrer, created_at)
      VALUES ($1, $2, $3, $4, NOW())
    `, [path, ipHash, device || 'desktop', referrer || 'Direto']);
    return;
  }

  const db = readJsonDb();
  if (!db.pageViews) db.pageViews = [];
  db.pageViews.unshift({
    id: Date.now(),
    path,
    ip_hash: ipHash,
    device: device || 'desktop',
    referrer: referrer || 'Direto',
    created_at: new Date().toISOString()
  });
  if (db.pageViews.length > 500) db.pageViews.length = 500;
  writeJsonDb(db);
}

async function getAnalyticsMetrics() {
  if (isPostgres) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayUniq, totalUniq, todayPresell, todayApp, todayTotal, recent] = await Promise.all([
      pool.query('SELECT COUNT(DISTINCT ip_hash) as count FROM page_views WHERE created_at >= $1', [today.toISOString()]),
      pool.query('SELECT COUNT(DISTINCT ip_hash) as count FROM page_views'),
      pool.query("SELECT COUNT(*) as count FROM page_views WHERE created_at >= $1 AND (path LIKE '%presell%' OR path LIKE '%apresentacao%' OR path LIKE '%start%' OR path LIKE '%como-funciona%')", [today.toISOString()]),
      pool.query("SELECT COUNT(*) as count FROM page_views WHERE created_at >= $1 AND (path = '/' OR path LIKE '%login%' OR path LIKE '%index%')", [today.toISOString()]),
      pool.query('SELECT COUNT(*) as count FROM page_views WHERE created_at >= $1', [today.toISOString()]),
      pool.query('SELECT path, device, referrer, created_at FROM page_views ORDER BY created_at DESC LIMIT 25')
    ]);

    return {
      todayUniqueVisitors: parseInt(todayUniq.rows[0].count, 10),
      totalUniqueVisitors: parseInt(totalUniq.rows[0].count, 10),
      todayPresellViews: parseInt(todayPresell.rows[0].count, 10),
      todayAppViews: parseInt(todayApp.rows[0].count, 10),
      todayTotalViews: parseInt(todayTotal.rows[0].count, 10),
      recentViews: recent.rows
    };
  }

  const db = readJsonDb();
  const pageViews = db.pageViews || [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayViews = pageViews.filter(v => new Date(v.created_at) >= today);
    const todayUniqueVisitors = new Set(todayViews.map(v => v.ip_hash)).size;
  const totalUniqueVisitors = new Set(pageViews.map(v => v.ip_hash)).size;
  const todayPresellViews = todayViews.filter(v => (v.path || '').includes('presell')).length;
  const todayAppViews = todayViews.filter(v => v.path === '/' || (v.path || '').includes('login')).length;
  const todayTotalViews = todayViews.length;
  const recentViews = pageViews.slice(0, 25);

  return {
    todayUniqueVisitors,
    totalUniqueVisitors,
    todayPresellViews,
    todayAppViews,
    todayTotalViews,
    recentViews
  };
}

// ==========================================
// WEBHOOK LOGS & AUDIT
// ==========================================
async function recordWebhookLog({ provider, eventType, amount, customerPhone, customerName, customerEmail, matchedUserId, status, note, rawPayload }) {
  if (isPostgres) {
    try {
      await pool.query(`
        INSERT INTO webhook_logs (provider, event_type, amount, customer_phone, customer_name, customer_email, matched_user_id, status, note, raw_payload, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      `, [
        provider || 'cartpanda',
        eventType || 'order.paid',
        amount || 0,
        customerPhone || null,
        customerName || null,
        customerEmail || null,
        matchedUserId || null,
        status || 'received',
        note || '',
        JSON.stringify(rawPayload || {})
      ]);
    } catch (err) {
      console.error('[DATABASE ERROR /recordWebhookLog]:', err.message);
    }
    return;
  }

  const db = readJsonDb();
  if (!db.webhookLogs) db.webhookLogs = [];
  db.webhookLogs.unshift({
    id: Date.now(),
    provider: provider || 'cartpanda',
    eventType: eventType || 'order.paid',
    amount: amount || 0,
    customerPhone,
    customerName,
    customerEmail,
    matchedUserId,
    status,
    note,
    rawPayload,
    createdAt: new Date().toISOString()
  });
  if (db.webhookLogs.length > 300) db.webhookLogs.length = 300;
  writeJsonDb(db);
}

async function getWebhookLogs(limit = 50) {
  if (isPostgres) {
    const res = await pool.query('SELECT * FROM webhook_logs ORDER BY created_at DESC LIMIT $1', [limit]);
    return res.rows;
  }
  const db = readJsonDb();
  return (db.webhookLogs || []).slice(0, limit);
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
  updateProduct,
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
  // Stats & Analytics
  getGlobalMetrics,
  recordPageView,
  getAnalyticsMetrics,
  // Webhooks
  recordWebhookLog,
  getWebhookLogs
};
