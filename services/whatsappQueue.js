const axios = require('axios');
const crmDb = require('./crmDb');

class WhatsAppQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
  }

  enqueue({ leadId, phone, text, instanceName }) {
    this.queue.push({
      leadId,
      phone,
      text,
      instanceName,
      enqueuedAt: Date.now()
    });
    console.log(`[WHATSAPP QUEUE] Mensagem enfileirada para ${phone}. Total na fila: ${this.queue.length}`);
    this.processQueue();
  }

  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      try {
        await this.sendMessageWithEvo(item);
      } catch (err) {
        console.error(`[WHATSAPP QUEUE ERROR] Falha ao enviar para ${item.phone}:`, err.message);
      }

      // Delay humanizado aleatório entre 4 e 8 segundos para proteção anti-ban
      if (this.queue.length > 0) {
        const randomDelay = Math.floor(Math.random() * 4000) + 4000;
        console.log(`[WHATSAPP QUEUE] Aguardando ${randomDelay}ms (Anti-Ban) antes do próximo envio...`);
        await new Promise(res => setTimeout(res, randomDelay));
      }
    }

    this.isProcessing = false;
  }

  async sendMessageWithEvo({ leadId, phone, text, instanceName }) {
    const settings = crmDb.getSettings();
    const baseURL = process.env.EVOLUTION_API_URL || settings.evolutionApiUrl || 'http://localhost:8080';
    const apiKey = settings.globalApiKey || process.env.GLOBAL_API_KEY || 'tartaruga-1-.';
    const inst = instanceName || settings.defaultInstance || 'bot_principal';

    const cleanPhone = String(phone).replace(/\D/g, '');
    const jidPhone = cleanPhone.includes('@') ? cleanPhone : `${cleanPhone}@s.whatsapp.net`;

    const client = axios.create({
      baseURL,
      headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
      timeout: 12000
    });

    const response = await client.post(`/message/sendText/${inst}`, {
      number: jidPhone,
      options: { delay: 1200, presence: 'composing' },
      textMessage: { text }
    });

    if (leadId) {
      crmDb.addMessage(leadId, {
        fromMe: true,
        text,
        timestamp: new Date().toISOString(),
        status: 'sent'
      });
    }

    return response.data;
  }
}

const queueInstance = new WhatsAppQueue();
module.exports = queueInstance;
