const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_FILE = path.join(__dirname, 'db.json');

const INITIAL_DATA = {
  settings: {
    evolutionApiUrl: 'http://localhost:8080',
    globalApiKey: 'tartaruga-1-.',
    defaultInstance: 'bot_principal',
    aiEnabled: true,
    aiModel: 'gpt-4o-mini',
    autoReplyNewLeads: true,
    welcomeMessageTemplate: 'Olá {{primeiro_nome}}! Seja muito bem-vindo à TAXINEXO 🚕.\n\nNossas frotas de Robotaxi operam 24/7 gerando rendimentos diários automáticos com saque via Pix.\n\n👉 *Crie sua conta:* https://taxinexo.onrender.com/login.html\n📸 *Instagram:* https://www.instagram.com/taxinexoofficial/\n💬 *Grupo VIP:* https://t.me/+VRCCsj-SJHQwNmE5\n\nComo posso te ajudar a simular seus rendimentos hoje?',
    webhookToken: 'taxinexo_lead_token_2026',
    adminPassword: 'taxinexo2026'
  },
  stages: [
    { id: 'novo', title: 'Novos Leads (Anúncios)', color: '#38bdf8', order: 1 },
    { id: 'contato', title: 'Primeiro Contato / Simulação', color: '#818cf8', order: 2 },
    { id: 'qualificado', title: 'Interesse em Cota / Frota', color: '#c084fc', order: 3 },
    { id: 'proposta', title: 'Pix Gerado / Aguardando', color: '#fbbf24', order: 4 },
    { id: 'ganho', title: 'Operador Ativo (Cota Adquirida)', color: '#34d399', order: 5 },
    { id: 'perdido', title: 'Desqualificado / Sem Contato', color: '#f87171', order: 6 }
  ],
  products: [
    { id: 'NX-030', name: 'BYD Dolphin Autonomous Urban', price: 30.00, dailyReturn: 3.20, periodDays: 15 },
    { id: 'NX-101', name: 'Tesla Robotaxi Model 3', price: 150.00, dailyReturn: 14.50, periodDays: 30 },
    { id: 'NX-202', name: 'Baidu Apollo RT6', price: 350.00, dailyReturn: 36.00, periodDays: 45 },
    { id: 'NX-707', name: 'Tesla Cybercab Next-Gen', price: 600.00, dailyReturn: 68.00, periodDays: 40 },
    { id: 'NX-404', name: 'Cruise Origin Autonomous', price: 900.00, dailyReturn: 105.00, periodDays: 45 },
    { id: 'NX-303', name: 'Waymo Autonomous Van', price: 1500.00, dailyReturn: 185.00, periodDays: 60 },
    { id: 'NX-505', name: 'Zoox Urban Bi-Directional', price: 2800.00, dailyReturn: 360.00, periodDays: 60 },
    { id: 'NX-606', name: 'NIO Autonomous Executive Fleet', price: 5000.00, dailyReturn: 720.00, periodDays: 90 }
  ],
  leads: [
    {
      id: 'lead-1',
      name: 'Carlos Eduardo Silveira',
      phone: '5534992019122',
      email: 'carlos.silveira@email.com',
      stage: 'novo',
      value: 600.00,
      tags: ['Meta Ads', 'Tesla Cybercab', 'Lead Quente'],
      campaign: 'Meta Ads - Frotas Autônomas 2026',
      utm_source: 'facebook',
      utm_campaign: 'cybercab_escala',
      utm_medium: 'cpc',
      notes: 'Interessado na cota Tesla Cybercab (R$ 600). Perguntou sobre saque diário via PIX.',
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      unreadCount: 1,
      lastMessage: 'Gostaria de saber como funciona o rendimento diário da frota Cybercab.'
    },
    {
      id: 'lead-2',
      name: 'Mariana Costa Ramos',
      phone: '5511988223344',
      email: 'mariana.ramos@gestao.com.br',
      stage: 'proposta',
      value: 1500.00,
      tags: ['Google Ads', 'Waymo Van', 'Investidora VIP'],
      campaign: 'Google Search - Frotas Robotaxi Rendimento',
      utm_source: 'google',
      utm_campaign: 'search_high_intent',
      utm_medium: 'cpc',
      notes: 'Gerou Pix de R$ 1.500 para a Van Waymo. Aguardando confirmação bancária.',
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      updatedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
      unreadCount: 0,
      lastMessage: 'Vou pagar o Pix agora à tarde para liberar a cota!'
    },
    {
      id: 'lead-3',
      name: 'Rodrigo Mendonça',
      phone: '5521977112233',
      email: 'rodrigo.m@agencia.com',
      stage: 'ganho',
      value: 5000.00,
      tags: ['Instagram Ads', 'Frota NIO Executive', 'VIP 2'],
      campaign: 'Instagram Stories - Rendimento Autônomo',
      utm_source: 'instagram',
      utm_campaign: 'stories_remarketing',
      utm_medium: 'stories',
      notes: 'Operador ativo! Adquiriu a cota da Frota Executiva NIO (R$ 5.000,00). Rendimento diário de R$ 720,00 ativo.',
      createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
      updatedAt: new Date(Date.now() - 86400000).toISOString(),
      unreadCount: 0,
      lastMessage: 'Comprovante do Pix enviado! Já apareceu meu saldo no painel Taxi Nexo.'
    }
  ],
  messages: {
    'lead-1': [
      {
        id: 'msg-1',
        fromMe: false,
        text: 'Olá! Vi o anúncio da TAXINEXO sobre as frotas de robotaxi elétricas.',
        timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
        status: 'read'
      },
      {
        id: 'msg-2',
        fromMe: true,
        text: 'Olá Carlos! Seja muito bem-vindo à TAXINEXO. A frota Cybercab rende R$ 68,00 por dia durante 40 dias com saque diário via Pix. Deseja que eu gere sua chave Pix para ativação?',
        timestamp: new Date(Date.now() - 3600000 * 1.9).toISOString(),
        status: 'read'
      },
      {
        id: 'msg-3',
        fromMe: false,
        text: 'Gostaria de saber como funciona o rendimento diário da frota Cybercab.',
        timestamp: new Date(Date.now() - 3600000 * 1.5).toISOString(),
        status: 'read'
      }
    ]
  },
  automations: [
    {
      id: 'auto-1',
      name: 'Boas-Vindas Meta Ads Frotas Taxi Nexo',
      trigger: 'new_lead_meta',
      action: 'send_whatsapp',
      actionValue: 'Olá {{primeiro_nome}}! Bem-vindo à TAXINEXO 🚕. Recebi seu cadastro pelo anúncio da {{campanha}}. Nossas frotas de Robotaxi operam 24/7 gerando rendimentos diários. Qual veículo você deseja simular hoje?',
      delaySeconds: 5,
      enabled: true
    },
    {
      id: 'auto-2',
      name: 'Auto-Qualificação por Palavras (PIX / COTA / SAQUE / TESLA)',
      trigger: 'keyword',
      triggerValue: 'pix,cota,tesla,saque,rendimento,comprar',
      action: 'move_stage',
      actionValue: 'qualificado',
      enabled: true
    },
    {
      id: 'auto-3',
      name: 'Recuperação de Depósito Pix Não Pago (24h)',
      trigger: 'no_reply_24h',
      action: 'send_whatsapp',
      actionValue: 'Oi {{primeiro_nome}}, passando para avisar que sua cota da frota TAXINEXO está reservada por mais 12 horas. Precisa de ajuda para concluir a ativação?',
      delaySeconds: 86400,
      enabled: true
    }
  ],
  campaigns: [
    { id: 'c1', name: 'Meta Ads - Frotas Autônomas 2026', source: 'Facebook/Instagram', leads: 68, spend: 850.00, revenue: 16800.00, roas: '19.7x' },
    { id: 'c2', name: 'Google Search - Robotaxi Rendimento', source: 'Google Ads', leads: 42, spend: 1100.00, revenue: 22500.00, roas: '20.4x' },
    { id: 'c3', name: 'TikTok Ads - Vídeo Cybercab VSL', source: 'TikTok', leads: 95, spend: 480.00, revenue: 7800.00, roas: '16.2x' }
  ]
};

function readDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(INITIAL_DATA, null, 2), 'utf-8');
      return INITIAL_DATA;
    }
    const content = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error('Erro ao ler DB:', err);
    return INITIAL_DATA;
  }
}

function writeDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erro ao escrever DB:', err);
  }
}

const db = {
  getSettings: () => readDb().settings,
  updateSettings: (newSettings) => {
    const data = readDb();
    data.settings = { ...data.settings, ...newSettings };
    writeDb(data);
    return data.settings;
  },

  getStages: () => readDb().stages,
  getProducts: () => readDb().products || [],

  getLeads: () => {
    const data = readDb();
    return data.leads.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  },

  getLead: (id) => {
    const data = readDb();
    return data.leads.find(l => l.id === id || l.phone === id);
  },

  createLead: (leadData) => {
    const data = readDb();
    const cleanPhone = String(leadData.phone || '').replace(/\D/g, '');
    const existing = data.leads.find(l => l.phone === cleanPhone);
    if (existing) {
      existing.updatedAt = new Date().toISOString();
      if (leadData.name) existing.name = leadData.name;
      if (leadData.email) existing.email = leadData.email;
      if (leadData.campaign) existing.campaign = leadData.campaign;
      if (leadData.value) existing.value = leadData.value;
      if (leadData.tags) {
        existing.tags = Array.from(new Set([...(existing.tags || []), ...leadData.tags]));
      }
      writeDb(data);
      return { lead: existing, created: false };
    }

    const newLead = {
      id: 'lead-' + uuidv4().substring(0, 8),
      name: leadData.name || 'Operador #Lead',
      phone: cleanPhone,
      email: leadData.email || '',
      stage: leadData.stage || 'novo',
      value: Number(leadData.value) || 350.00,
      tags: leadData.tags || ['Meta Ads', 'Taxi Nexo'],
      campaign: leadData.campaign || 'Meta Ads - Frotas Autônomas',
      utm_source: leadData.utm_source || 'meta_ads',
      utm_campaign: leadData.utm_campaign || 'frotas_escala',
      utm_medium: leadData.utm_medium || 'cpc',
      notes: leadData.notes || 'Lead capturado automaticamente via anúncio Taxi Nexo.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      unreadCount: 0,
      lastMessage: leadData.lastMessage || 'Novo lead Taxi Nexo cadastrado.'
    };

    data.leads.unshift(newLead);
    writeDb(data);
    return { lead: newLead, created: true };
  },

  updateLead: (id, updates) => {
    const data = readDb();
    const lead = data.leads.find(l => l.id === id || l.phone === id);
    if (!lead) return null;
    Object.assign(lead, updates, { updatedAt: new Date().toISOString() });
    writeDb(data);
    return lead;
  },

  deleteLead: (id) => {
    const data = readDb();
    const idx = data.leads.findIndex(l => l.id === id);
    if (idx === -1) return false;
    data.leads.splice(idx, 1);
    delete data.messages[id];
    writeDb(data);
    return true;
  },

  getMessages: (leadId) => {
    const data = readDb();
    return data.messages[leadId] || [];
  },

  addMessage: (leadId, msg) => {
    const data = readDb();
    if (!data.messages[leadId]) {
      data.messages[leadId] = [];
    }
    const newMsg = {
      id: msg.id || 'msg-' + uuidv4().substring(0, 8),
      fromMe: Boolean(msg.fromMe),
      text: msg.text || '',
      mediaType: msg.mediaType || null,
      mediaUrl: msg.mediaUrl || null,
      timestamp: msg.timestamp || new Date().toISOString(),
      status: msg.status || 'sent'
    };
    data.messages[leadId].push(newMsg);

    const lead = data.leads.find(l => l.id === leadId);
    if (lead) {
      lead.lastMessage = msg.text || 'Mídia enviada';
      lead.updatedAt = newMsg.timestamp;
      if (!msg.fromMe) {
        lead.unreadCount = (lead.unreadCount || 0) + 1;
      }
    }

    writeDb(data);
    return newMsg;
  },

  getAutomations: () => readDb().automations || [],
  
  saveAutomation: (auto) => {
    const data = readDb();
    if (!data.automations) data.automations = [];
    if (auto.id) {
      const idx = data.automations.findIndex(a => a.id === auto.id);
      if (idx !== -1) {
        data.automations[idx] = { ...data.automations[idx], ...auto };
        writeDb(data);
        return data.automations[idx];
      }
    }
    const newAuto = { id: 'auto-' + uuidv4().substring(0, 8), enabled: true, ...auto };
    data.automations.push(newAuto);
    writeDb(data);
    return newAuto;
  },

  toggleAutomation: (id) => {
    const data = readDb();
    const auto = (data.automations || []).find(a => a.id === id);
    if (auto) {
      auto.enabled = !auto.enabled;
      writeDb(data);
      return auto;
    }
    return null;
  },

  getAnalytics: () => {
    const data = readDb();
    const leads = data.leads || [];
    const totalLeads = leads.length;
    const wonLeads = leads.filter(l => l.stage === 'ganho');
    const totalWonValue = wonLeads.reduce((acc, l) => acc + (Number(l.value) || 0), 0);
    const pipelineValue = leads.reduce((acc, l) => acc + (Number(l.value) || 0), 0);
    const conversionRate = totalLeads > 0 ? ((wonLeads.length / totalLeads) * 100).toFixed(1) : '0';

    const sourceMap = {};
    leads.forEach(l => {
      const src = (l.tags && l.tags[0]) || l.utm_source || 'Meta Ads';
      sourceMap[src] = (sourceMap[src] || 0) + 1;
    });

    const leadsBySource = Object.keys(sourceMap).map(name => ({
      name,
      value: sourceMap[name]
    }));

    return {
      totalLeads,
      wonCount: wonLeads.length,
      totalWonValue,
      pipelineValue,
      conversionRate: Number(conversionRate),
      leadsBySource,
      campaigns: data.campaigns || []
    };
  }
};

module.exports = db;
