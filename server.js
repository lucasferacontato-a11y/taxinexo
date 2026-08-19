require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./database');
const { processDailySettlement } = require('./services/settlementEngine');
const { initTelegramBot } = require('./services/telegramBot');

const app = express();
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

app.use(cors());
app.use(express.json());

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
  res.json({ status: 'online', service: 'TAXINEXO Cloud API', timestamp: new Date().toISOString() });
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

    // Inicia Cron Job de Liquidação Diária (a cada 60 minutos)
    setInterval(() => {
      console.log('[CRON] Executando ciclo de liquidação diária...');
      processDailySettlement();
    }, 60 * 60 * 1000);

    app.listen(PORT, HOST, () => {
      console.log(`=================================================`);
      console.log(`🚀 TAXINEXO Online rodando na porta ${PORT} no host ${HOST}`);
      console.log(`=================================================`);
    });
  } catch (err) {
    console.error('Falha crítica ao iniciar o servidor:', err);
    process.exit(1);
  }
}

startServer();

