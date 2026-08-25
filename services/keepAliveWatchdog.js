/**
 * keepAliveWatchdog.js
 * Motor de Alta Disponibilidade 24/7 para TAXINEXO 2.0 & Nexus CRM
 * - Impede hibernação do servidor através de auto-pings periódicos (Anti-Sleep).
 * - Monitora a conexão da Evolution API (WhatsApp) na VPS e realiza auto-recuperação.
 * - Garante execução ininterrupta dos rendimentos, webhooks e IA SDR 24 horas por dia.
 */

const axios = require('axios');
const crmDb = require('./crmDb');

class KeepAliveWatchdog {
  constructor() {
    this.appUrl = process.env.APP_URL || 'https://taxinexo.onrender.com';
    this.vpsUrl = process.env.EVOLUTION_API_URL || 'http://95.182.89.102:8080';
    this.apiKey = process.env.GLOBAL_API_KEY || 'tartaruga-1-.';
    this.instance = process.env.DEFAULT_INSTANCE || 'bot_principal';
    this.intervalHeartbeat = null;
    this.intervalVpsMonitor = null;
  }

  start() {
    console.log('[WATCHDOG 24/7] Iniciando motor de alta disponibilidade e proteção Anti-Sleep...');

    // 1. Auto-Ping Anti-Sleep (a cada 4 minutos = 240.000 ms)
    this.pingSelf();
    this.intervalHeartbeat = setInterval(() => {
      this.pingSelf();
    }, 240000);

    // 2. Monitoramento & Auto-Cura da Evolution API VPS (a cada 3 minutos = 180.000 ms)
    this.checkVpsHealth();
    this.intervalVpsMonitor = setInterval(() => {
      this.checkVpsHealth();
    }, 180000);

    // 3. Escudo contra travamentos globais
    process.on('uncaughtException', (err) => {
      console.error('[WATCHDOG CRITICAL SHIELD] Exceção não tratada capturada (Servidor Protegido):', err);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('[WATCHDOG CRITICAL SHIELD] Rejeição de Promise não tratada capturada:', reason);
    });

    console.log('[WATCHDOG 24/7] Operação 24 horas ativada com sucesso!');
  }

  async pingSelf() {
    try {
      const targetUrl = `${this.appUrl}/api/health`;
      const res = await axios.get(targetUrl, { timeout: 10000 });
      console.log(`[WATCHDOG 24/7 HEARTBEAT] Self-Ping OK -> ${targetUrl} [${res.status}] (${new Date().toLocaleTimeString('pt-BR')})`);
    } catch (err) {
      console.warn(`[WATCHDOG HEARTBEAT NOTICE] Self-Ping temporário:`, err.message);
    }
  }

  async checkVpsHealth() {
    try {
      const stateUrl = `${this.vpsUrl}/instance/connectionState/${this.instance}`;
      const res = await axios.get(stateUrl, {
        headers: { apikey: this.apiKey },
        timeout: 10000
      });

      const state = res.data?.instance?.state || 'unknown';
      console.log(`[WATCHDOG 24/7 WHATSAPP] Estado da Instância (${this.instance}): [${state.toUpperCase()}]`);

      // Se a conexão não estiver open, tenta auto-recuperar
      if (state !== 'open' && state !== 'connecting') {
        console.warn(`[WATCHDOG 24/7 RECOVERY] Conexão WhatsApp está '${state}'. Tentando reestabelecer...`);
        try {
          await axios.get(`${this.vpsUrl}/instance/connect/${this.instance}`, {
            headers: { apikey: this.apiKey },
            timeout: 10000
          });
        } catch (e) {}
      }
    } catch (err) {
      console.warn(`[WATCHDOG VPS MONITOR NOTICE] Falha ao checar estado da VPS:`, err.message);
    }
  }
}

const watchdogInstance = new KeepAliveWatchdog();
module.exports = watchdogInstance;
