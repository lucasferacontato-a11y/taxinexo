require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { initDb, recordPageView } = require('./database');
const { initTelegramBot } = require('./services/telegramBot');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }
});

const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Middleware de Rastreamento de Visitantes Reais (Analytics)
app.use((req, res, next) => {
  const p = (req.path || '/').toLowerCase();
  const isStaticAsset = /\.(jpg|jpeg|png|gif|ico|svg|css|js|map|json|woff|woff2|ttf|txt)$/i.test(p);
  const isApi = p.startsWith('/api/');

  if (!isStaticAsset && !isApi && req.method === 'GET') {
    const userAgent = (req.headers['user-agent'] || '').toLowerCase();
    const isBot = /bot|spider|crawl|curl|uptime|ping|render|headless|postman/i.test(userAgent);

    if (!isBot) {
      const forwarded = req.headers['x-forwarded-for'];
      const clientIp = (forwarded ? forwarded.split(',')[0] : req.socket.remoteAddress) || '127.0.0.1';
      const ipHash = crypto.createHash('sha256').update(clientIp + '_taxinexo_salt').digest('hex').substring(0, 16);
      const isMobile = /mobile|iphone|android|ipad|phone/i.test(userAgent);
      const device = isMobile ? 'mobile' : 'desktop';
      const referrer = req.headers['referer'] || req.headers['referrer'] || 'Direto / Tráfego';

      let cleanPath = req.path;
      if (cleanPath === '' || cleanPath === '/index.html') cleanPath = '/';

      recordPageView({
        path: cleanPath,
        ipHash: ipHash,
        device: device,
        referrer: String(referrer).substring(0, 255)
      }).catch(err => console.error('[ANALYTICS ERROR]:', err.message));
    }
  }

  next();
});

// Servir arquivos estáticos do diretório public
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// Servir Nexus CRM em /crm
const crmDir = path.join(publicDir, 'crm');
app.use('/crm', express.static(crmDir));

// Rotas da API Backend TaxiNexo
const walletRouter = require('./routes/wallet');
app.use('/api/auth', require('./routes/auth'));
app.use('/api/wallet', walletRouter);
app.use('/api/fleet', require('./routes/fleet'));
app.use('/api/team', require('./routes/team'));
app.use('/api/admin', require('./routes/admin'));

// Webhook Aliases (Garante que qualquer variação de URL cadastrada no Cartpanda funcione)
app.use(['/webhook/cartpanda', '/api/webhook/cartpanda', '/cartpanda/webhook'], (req, res, next) => {
  req.url = '/webhook/cartpanda';
  walletRouter(req, res, next);
});

// Rotas da API Backend Nexus CRM & Webhooks Diretos
const crmRouter = require('./routes/crm')(io);
app.all(['/webhook/evolution', '/evolution/webhook', '/api/webhook/evolution'], (req, res, next) => {
  req.url = '/webhook/evolution';
  crmRouter(req, res, next);
});
app.use('/api', crmRouter);

// Healthcheck
app.get('/api/health', (req, res) => {
  res.json({ status: 'online', service: 'TAXINEXO 2.0 Cloud API', timestamp: new Date().toISOString() });
});

// 1. Rota Raiz (Landing Page / Presell Oficial)
app.get(['/', '/presell', '/apresentacao', '/start', '/como-funciona'], (req, res) => {
  res.sendFile(path.join(publicDir, 'presell.html'));
});

// 2. Rota para Nexus CRM SPA
app.get(['/crm', '/crm/*', '/nexus'], (req, res) => {
  res.sendFile(path.join(crmDir, 'index.html'));
});

// 3. Rota para o Aplicativo / Dashboard do Operador
app.get(['/app', '/dashboard', '/painel', '/login', '/home'], (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// 4. Fallback para SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Inicialização com Banco de Dados
async function startServer() {
  try {
    await initDb();

    // Inicializa Bot do Telegram (se token estiver presente)
    initTelegramBot();

    server.listen(PORT, HOST, () => {
      console.log(`=================================================`);
      console.log(`🚀 TAXINEXO 2.0 + Nexus CRM Online na porta ${PORT}`);
      console.log(`📊 Painel Operador: http://localhost:${PORT}`);
      console.log(`🛰️ Nexus CRM 24/7: http://localhost:${PORT}/crm`);
      console.log(`=================================================`);

      // Inicia o Watchdog de Alta Disponibilidade 24/7 (Anti-Sleep & Auto-Cura)
      const watchdog = require('./services/keepAliveWatchdog');
      watchdog.start();
    });
  } catch (err) {
    console.error('Falha crítica ao iniciar o servidor:', err);
    process.exit(1);
  }
}

startServer();

