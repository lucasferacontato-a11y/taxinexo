require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { initDb, recordPageView } = require('./database');
const { initTelegramBot } = require('./services/telegramBot');

const app = express();
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

app.use(cors());
app.use(express.json());

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

// Rotas da API Backend
app.use('/api/auth', require('./routes/auth'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/fleet', require('./routes/fleet'));
app.use('/api/team', require('./routes/team'));
app.use('/api/admin', require('./routes/admin'));

// Healthcheck
app.get('/api/health', (req, res) => {
  res.json({ status: 'online', service: 'TAXINEXO 2.0 Cloud API', timestamp: new Date().toISOString() });
});

// Rotas Amigáveis para Landing Page / Presell (Meta Ads)
app.get(['/presell', '/apresentacao', '/start', '/como-funciona'], (req, res) => {
  res.sendFile(path.join(publicDir, 'presell.html'));
});

// Fallback para SPA e arquivos HTML
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});


// Inicialização com Banco de Dados
async function startServer() {
  try {
    await initDb();

    // Inicializa Bot do Telegram (se token estiver presente)
    initTelegramBot();

    // Liquidação de rendimentos configurada em modo MANUAL (liberação exclusiva pelo Administrador no Painel /admin.html)

    app.listen(PORT, HOST, () => {
      console.log(`=================================================`);
      console.log(`🚀 TAXINEXO 2.0 Online rodando na porta ${PORT} no host ${HOST}`);
      console.log(`=================================================`);
    });
  } catch (err) {
    console.error('Falha crítica ao iniciar o servidor:', err);
    process.exit(1);
  }
}

startServer();

