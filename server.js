const express = require('express');
const cors = require('cors');
const path = require('path');
const { processDailySettlement } = require('./services/settlementEngine');

const app = express();
const PORT = process.env.PORT || 3000;

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

// Redireciona qualquer outra rota para o index.html (SPA Fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Inicia Cron Job de Liquidação Diária (a cada 60 minutos)
setInterval(() => {
  console.log('[CRON] Executando ciclo de liquidação diária...');
  processDailySettlement();
}, 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`🚀 TAXINEXO Online rodando na porta ${PORT}`);
  console.log(`📱 App PWA: http://localhost:${PORT}/`);
  console.log(`=================================================`);
});
