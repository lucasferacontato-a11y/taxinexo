const express = require('express');
const axios = require('axios');
const db = require('../services/crmDb');

module.exports = function(io) {
  const router = express.Router();

  // Helper Evolution API client
  function getEvoClient() {
    const settings = db.getSettings();
    const baseURL = process.env.EVOLUTION_API_URL || settings.evolutionApiUrl || 'http://95.182.89.102:8080';
    return axios.create({
      baseURL: baseURL,
      headers: {
        'apikey': settings.globalApiKey || process.env.GLOBAL_API_KEY || 'tartaruga-1-.',
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
  }

  // ---------------- WhatsApp Endpoints ----------------
  router.get('/whatsapp/status', async (req, res) => {
    const settings = db.getSettings();
    const instanceName = req.query.instance || settings.defaultInstance || 'bot_principal';
    const evo = getEvoClient();

    try {
      const instancesRes = await evo.get('/instance/fetchInstances');
      const instanceList = Array.isArray(instancesRes.data) ? instancesRes.data : [];
      const inst = instanceList.find(i => (i.name === instanceName || i.instance?.instanceName === instanceName));

      let qrData = null;
      let connectionStatus = inst ? (inst.connectionStatus || inst.instance?.status || 'close') : 'not_created';

      if (inst && (connectionStatus === 'connecting' || connectionStatus === 'close')) {
        try {
          const qrRes = await evo.get(`/instance/connect/${instanceName}`);
          qrData = qrRes.data;
        } catch (err) {}
      }

      return res.json({
        success: true,
        instanceName,
        exists: Boolean(inst),
        connectionStatus: connectionStatus,
        ownerJid: inst ? (inst.ownerJid || inst.instance?.owner) : null,
        profileName: inst ? (inst.profileName || inst.instance?.profileName) : null,
        profilePicUrl: inst ? (inst.profilePicUrl || inst.instance?.profilePictureUrl) : null,
        qrcode: qrData
      });
    } catch (err) {
      return res.json({
        success: false,
        instanceName,
        exists: false,
        connectionStatus: 'offline',
        error: err.response?.data || err.message,
        message: 'Evolution API não conectada em ' + (process.env.EVOLUTION_API_URL || settings.evolutionApiUrl)
      });
    }
  });

  router.post('/whatsapp/connect', async (req, res) => {
    const { number, instanceName } = req.body;
    const settings = db.getSettings();
    const inst = instanceName || settings.defaultInstance || 'bot_principal';
    const evo = getEvoClient();

    try {
      let response;
      const url = number ? `/instance/connect/${inst}?number=${number}` : `/instance/connect/${inst}`;
      try {
        response = await evo.get(url);
      } catch (connectErr) {
        if (connectErr.response?.status === 404 || connectErr.response?.data?.status === 404) {
          // Instância não existe -> cria automaticamente
          await evo.post('/instance/create', {
            instanceName: inst,
            token: 'taxinexo_token_2026',
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS'
          });
          response = await evo.get(url);
        } else {
          throw connectErr;
        }
      }

      const resData = response.data || {};
      const base64 = resData.base64 || resData.qrcode?.base64 || (typeof resData.qrcode === 'string' ? resData.qrcode : null);
      const pairingCode = resData.pairingCode || resData.code;

      if (io && base64) io.emit('whatsapp:qrcode', base64);
      return res.json({
        success: true,
        data: resData,
        qrcode: base64 ? { base64 } : resData.qrcode,
        base64: base64,
        pairingCode: pairingCode
      });
    } catch (err) {
      console.error('[WHATSAPP CONNECT ERROR]:', err.response?.data || err.message);
      return res.status(500).json({ success: false, error: err.response?.data || err.message });
    }
  });

  router.post('/whatsapp/send', async (req, res) => {
    const { leadId, phone, text, instanceName } = req.body;
    if (!text || (!leadId && !phone)) {
      return res.status(400).json({ success: false, message: 'Dados insuficientes.' });
    }

    const settings = db.getSettings();
    const inst = instanceName || settings.defaultInstance || 'bot_principal';
    let targetPhone = phone;
    let targetLeadId = leadId;

    if (!targetPhone && targetLeadId) {
      const lead = db.getLead(targetLeadId);
      if (lead) targetPhone = lead.phone;
    }

    if (!targetLeadId && targetPhone) {
      const cleanPhone = String(targetPhone).replace(/\D/g, '');
      let lead = db.getLead(cleanPhone);
      if (!lead) {
        const created = db.createLead({ phone: cleanPhone, name: 'Lead ' + cleanPhone.slice(-4) });
        lead = created.lead;
      }
      targetLeadId = lead.id;
    }

    const cleanNumber = String(targetPhone).replace(/\D/g, '');
    const evo = getEvoClient();

    let cleanedText = text;
    const crmMatch = text.match(/<crm>([\s\S]*?)<\/crm>/);
    if (crmMatch) {
      try {
        const crmData = JSON.parse(crmMatch[1].trim());
        const updates = {};
        if (crmData.estagio_funil) updates.stage = crmData.estagio_funil;
        if (crmData.temperatura) updates.temperature = crmData.temperatura;
        if (crmData.score_lead) updates.leadScore = Number(crmData.score_lead);
        if (crmData.veiculo_interesse) updates.vehicleInterest = crmData.veiculo_interesse;
        if (crmData.valor_cota) updates.value = Number(crmData.valor_cota);
        if (crmData.tag_adicionada) {
          const currentLead = db.getLead(targetLeadId);
          updates.tags = Array.from(new Set([...(currentLead?.tags || []), crmData.tag_adicionada]));
        }
        db.updateLead(targetLeadId, updates);
      } catch (e) {}
      cleanedText = text.replace(/<crm>[\s\S]*?<\/crm>/g, '').trim();
    }

    try {
      const evoRes = await evo.post(`/message/sendText/${inst}`, {
        number: cleanNumber,
        text: cleanedText,
        delay: 1200
      });

      const msg = db.addMessage(targetLeadId, {
        fromMe: true,
        text: cleanedText,
        timestamp: new Date().toISOString(),
        status: 'sent'
      });

      if (io) {
        io.emit('chat:message', { leadId: targetLeadId, message: msg });
        io.emit('leads:update', db.getLeads());
      }

      return res.json({ success: true, message: msg, evoResponse: evoRes.data });
    } catch (err) {
      const msg = db.addMessage(targetLeadId, {
        fromMe: true,
        text: text,
        timestamp: new Date().toISOString(),
        status: 'error'
      });
      if (io) io.emit('chat:message', { leadId: targetLeadId, message: msg });
      return res.status(500).json({
        success: false,
        message: 'Erro ao enviar via WhatsApp Evolution API',
        error: err.response?.data || err.message,
        savedLocally: msg
      });
    }
  });

  // ---------------- Webhook Evolution & Funil Automático de Atendimento ----------------
  router.post(['/webhook/evolution', '/api/webhook/evolution', '/webhook/evolution/*', '*'], async (req, res, next) => {
    if (req.method !== 'POST' && req.url.includes('webhook')) return next();
    const { event, instance, data } = req.body || {};
    const whatsappQueue = require('../services/whatsappQueue');

    console.log(`[WEBHOOK EVOLUTION RECEIVED] Event: ${event}, Instance: ${instance}`);

    // Trata mensagens (Evolution envia como messages.upsert ou array de data)
    const msgObj = Array.isArray(data) ? data[0] : data;

    if ((event === 'messages.upsert' || event === 'MESSAGES_UPSERT') && msgObj) {
      const key = msgObj.key || {};
      const fromMe = Boolean(key.fromMe);
      const remoteJid = key.remoteJid || '';
      
      if (remoteJid.includes('status@broadcast') || remoteJid.includes('@g.us')) {
        return res.json({ received: true });
      }

      const cleanPhone = remoteJid.split('@')[0].replace(/\D/g, '');
      if (!cleanPhone) return res.json({ received: true });

      const messageContent = msgObj.message?.conversation ||
        msgObj.message?.extendedTextMessage?.text ||
        msgObj.message?.imageMessage?.caption ||
        '';

      console.log(`[WHATSAPP MSG INCOMING] De: ${cleanPhone} | fromMe: ${fromMe} | Texto: "${messageContent}"`);

      let lead = db.getLead(cleanPhone);
      let isNewLead = false;

      if (!lead) {
        const pushName = msgObj.pushName || ('Operador #' + cleanPhone.slice(-4));
        const created = db.createLead({
          phone: cleanPhone,
          name: pushName,
          stage: 'novo',
          tags: ['WhatsApp Orgânico', 'Presell Dúvidas'],
          lastMessage: messageContent
        });
        lead = created.lead;
        isNewLead = true;
      }

      // Registra mensagem recebida
      const newMsg = db.addMessage(lead.id, {
        id: key.id || 'wa-' + Date.now(),
        fromMe,
        text: messageContent || 'Mensagem recebida',
        timestamp: new Date().toISOString(),
        status: 'read'
      });

      if (io) {
        io.emit('chat:message', { leadId: lead.id, message: newMsg });
        io.emit('leads:update', db.getLeads());
        if (isNewLead) {
          io.emit('leads:new', { lead, isNew: true });
        }
      }

      // Se a mensagem veio do cliente (!fromMe) e o bot NÃO está pausado
      if (!fromMe && messageContent && !lead.botPaused) {
        const lower = messageContent.toLowerCase();
        const firstName = (lead.name || '').split(' ')[0] || 'amigo';
        let replyText = null;
        let nextStage = null;

        // 1. Pedido de Atendente Humano
        if (lower.includes('humano') || lower.includes('atendente') || lower.includes('pessoa') || lower.includes('falar com alguém')) {
          db.updateLead(lead.id, { botPaused: true });
          replyText = `Entendido, ${firstName}! Pausei nosso assistente automático 👨‍💼. Um consultor oficial TAXINEXO vai assumir seu atendimento em instantes.`;
          if (io) io.emit('leads:human_requested', { lead });
        }
        // 2. Tabela, Cotas e Rendimentos
        else if (lower.includes('tabela') || lower.includes('quanto custa') || lower.includes('rendimento') || lower.includes('cota') || lower.includes('preço') || lower.includes('valor') || lower.includes('cybercab') || lower.includes('lucro') || lower.includes('ganho')) {
          nextStage = 'qualificado';
          replyText = `📊 *Frotas Disponíveis para Ativação TAXINEXO:*\n\n🟢 *Entrada:*\n• *BYD Dolphin:* Cota R$ 30,00 ➔ R$ 2,80/dia (15 dias)\n• *Tesla Model 3:* Cota R$ 150,00 ➔ R$ 14,50/dia (30 dias)\n\n🟡 *Popular & Alta Demanda:*\n• *Baidu Apollo RT6:* Cota R$ 350,00 ➔ R$ 36,00/dia (45 dias)\n• *Tesla Cybercab:* Cota R$ 600,00 ➔ R$ 68,00/dia (40 dias)\n• *Cruise Origin:* Cota R$ 900,00 ➔ R$ 105,00/dia (45 dias)\n\n🟣 *VIP & Executivo:*\n• *Waymo Van:* Cota R$ 1.500,00 ➔ R$ 185,00/dia (60 dias)\n• *Zoox 4x4:* Cota R$ 2.800,00 ➔ R$ 360,00/dia (60 dias)\n• *NIO Executive:* Cota R$ 5.000,00 ➔ R$ 720,00/dia (90 dias)\n\n⚡ Saques liberados todo dia via Pix!\n👉 Qual dessas frotas você gostaria de ativar para eu te orientar no passo a passo?`;
        }
        // 3. Pix, Cadastro e Ativação
        else if (lower.includes('pix') || lower.includes('pagar') || lower.includes('como ativo') || lower.includes('como cadastro') || lower.includes('link') || lower.includes('site') || lower.includes('cadastrar') || lower.includes('recarga')) {
          nextStage = 'proposta';
          replyText = `Perfeito, ${firstName}! O processo de ativação é 100% automático:\n\n1️⃣ Acesse nosso aplicativo: https://taxinexo.onrender.com/login.html\n2️⃣ Crie sua conta e clique no botão *Recarga Pix*.\n3️⃣ Pague o Pix do valor da cota escolhida.\n4️⃣ Na aba *Frotas*, clique em *Alugar / Ativar Cota*.\n\nAssim que pagar, seu rendimento começa a contar na mesma hora! Qualquer dúvida me avise aqui.`;
        }
        // 4. Primeiro Contato / Dúvidas Gerais (Mensagem Padrão de Boas-Vindas)
        else {
          nextStage = 'contato';
          replyText = `Olá ${firstName}! Seja muito bem-vindo à *TAXINEXO* 🚕.\n\nNossas frotas de robotáxis elétricos autônomos operam 24/7 gerando rendimentos diários com saque via Pix a partir de *R$ 30,00*.\n\n📱 *Acesse o Aplicativo:* https://taxinexo.onrender.com/login.html\n📸 *Instagram:* https://www.instagram.com/taxinexoofficial/\n💬 *Grupo VIP Telegram:* https://t.me/+VRCCsj-SJHQwNmE5\n\nVocê gostaria de ver a *tabela completa de cotas e rendimentos* ou tirar alguma dúvida específica?`;
        }

        if (nextStage && lead.stage !== 'ganho') {
          db.updateLead(lead.id, { stage: nextStage });
          if (io) io.emit('leads:update', db.getLeads());
        }

        if (replyText) {
          console.log(`[AUTO-RESPONDER DISPATCH] Disparando resposta para ${cleanPhone}...`);
          whatsappQueue.enqueue({
            leadId: lead.id,
            phone: cleanPhone,
            text: replyText,
            instanceName: instance || 'bot_principal'
          });
        }
      }
    }

    if ((event === 'qrcode.updated' || event === 'QRCODE_UPDATED') && data?.qrcode && io) {
      io.emit('whatsapp:qrcode', data.qrcode);
    }
    if ((event === 'connection.update' || event === 'CONNECTION_UPDATE') && io) {
      io.emit('whatsapp:connection', data);
    }

    return res.json({ received: true });
  });

  // Meta Verification & Ads Ingestion
  router.get('/leads/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const settings = db.getSettings();

    if (mode === 'subscribe' && (token === settings.webhookToken || token === 'taxinexo_lead_token_2026' || !token)) {
      return res.status(200).send(challenge);
    }
    return res.status(200).send(challenge || 'Webhook active');
  });

  router.post('/leads/webhook', async (req, res) => {
    try {
      const payload = req.body || {};
      const rawName = payload.name || payload.full_name || payload.nome || payload.first_name || 'Lead Anúncio';
      const rawPhone = payload.phone || payload.whatsapp || payload.telefone || payload.phone_number || '';
      const rawEmail = payload.email || payload.mail || '';
      const campaignName = payload.campaign_name || payload.campanha || payload.ad_name || payload.utm_campaign || 'Meta Ads - Conversão';
      const utmSource = payload.utm_source || payload.source || 'meta_ads';
      const utmMedium = payload.utm_medium || 'cpc';
      const dealValue = Number(payload.value || payload.valor || 30.00);

      const cleanPhone = String(rawPhone).replace(/\D/g, '');
      if (!cleanPhone || cleanPhone.length < 8) {
        return res.status(400).json({ success: false, message: 'Telefone inválido.' });
      }

      const { lead, created } = db.createLead({
        name: rawName,
        phone: cleanPhone,
        email: rawEmail,
        stage: 'novo',
        value: dealValue,
        tags: [utmSource === 'meta_ads' ? 'Meta Ads' : utmSource.toUpperCase(), 'Novo Lead'],
        campaign: campaignName,
        utm_source: utmSource,
        utm_campaign: campaignName,
        utm_medium: utmMedium,
        notes: `Lead capturado em ${new Date().toLocaleString('pt-BR')}.`,
        lastMessage: `Lead cadastrado via ${campaignName}`
      });

      if (io) {
        io.emit('leads:new', { lead, isNew: created });
        io.emit('leads:update', db.getLeads());
      }

      return res.json({ success: true, message: 'Lead processado com sucesso!', leadId: lead.id, lead });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // ---------------- Leads & CRM CRUD ----------------
  router.get('/leads', (req, res) => res.json(db.getLeads()));
  router.get('/leads/:id', (req, res) => {
    const lead = db.getLead(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
    return res.json(lead);
  });
  router.post('/leads', (req, res) => {
    const { lead } = db.createLead(req.body);
    if (io) io.emit('leads:update', db.getLeads());
    return res.json(lead);
  });
  router.put('/leads/:id', (req, res) => {
    const updated = db.updateLead(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Lead não encontrado' });
    if (io) io.emit('leads:update', db.getLeads());
    return res.json(updated);
  });
  router.delete('/leads/:id', (req, res) => {
    const success = db.deleteLead(req.params.id);
    if (io) io.emit('leads:update', db.getLeads());
    return res.json({ success });
  });

  router.patch('/leads/:id/toggle-bot', (req, res) => {
    const lead = db.getLead(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
    const updated = db.updateLead(req.params.id, { botPaused: !lead.botPaused });
    if (io) io.emit('leads:update', db.getLeads());
    return res.json(updated);
  });

  router.get('/messages/:leadId', (req, res) => {
    const messages = db.getMessages(req.params.leadId);
    db.updateLead(req.params.leadId, { unreadCount: 0 });
    if (io) io.emit('leads:update', db.getLeads());
    return res.json(messages);
  });

  router.get('/stages', (req, res) => res.json(db.getStages()));
  router.get('/automations', (req, res) => res.json(db.getAutomations()));
  router.post('/automations', (req, res) => {
    const auto = db.saveAutomation(req.body);
    return res.json(auto);
  });
  router.patch('/automations/:id/toggle', (req, res) => {
    const auto = db.toggleAutomation(req.params.id);
    return res.json(auto);
  });

  router.get('/analytics', (req, res) => res.json(db.getAnalytics()));
  router.get('/settings', (req, res) => res.json(db.getSettings()));
  router.put('/settings', (req, res) => {
    const updated = db.updateSettings(req.body);
    return res.json(updated);
  });

  router.get('/leads/export', (req, res) => {
    const leads = db.getLeads();
    let csv = 'ID,Nome,WhatsApp,Email,Etapa,Valor,Campanha,UTM_Source,Criado_Em\n';
    leads.forEach(l => {
      csv += `"${l.id}","${l.name}","${l.phone}","${l.email}","${l.stage}","${l.value}","${l.campaign}","${l.utm_source}","${l.createdAt}"\n`;
    });
    res.header('Content-Type', 'text/csv');
    res.attachment(`leads-export-${Date.now()}.csv`);
    return res.send(csv);
  });

  
  // ---------------- Exportação de Leads (CSV & Lookalike Meta Ads) ----------------
  router.get('/leads/export/csv', (req, res) => {
    try {
      const leads = db.getLeads();
      let csv = '\uFEFFNome,Telefone,Email,Etapa,Valor,Campanha,UTM_Source,UTM_Campaign,Data_Cadastro\n';
      leads.forEach(l => {
        const phone = l.phone ? `+${l.phone}` : '';
        const name = (l.name || '').replace(/,/g, ' ');
        const email = l.email || '';
        const stage = l.stage || '';
        const value = l.value || 0;
        const campaign = (l.campaign || '').replace(/,/g, ' ');
        const source = l.utm_source || '';
        const utmCamp = (l.utm_campaign || '').replace(/,/g, ' ');
        const date = l.createdAt ? new Date(l.createdAt).toLocaleDateString('pt-BR') : '';
        csv += `"${name}","${phone}","${email}","${stage}",${value},"${campaign}","${source}","${utmCamp}","${date}"\n`;
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="leads_taxinexo_export.csv"');
      return res.send(csv);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao exportar leads.' });
    }
  });

  router.get('/leads/export/lookalike', (req, res) => {
    try {
      const leads = db.getLeads();
      // Formato otimizado para o Gerenciador de Anúncios do Facebook (Lookalike)
      let csv = 'phone,fn,email,value\n';
      leads.forEach(l => {
        if (l.phone) {
          const cleanPhone = l.phone.replace(/\D/g, '');
          const firstName = (l.name || '').split(' ')[0] || '';
          csv += `55${cleanPhone},${firstName},${l.email || ''},${l.value || 0}\n`;
        }
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="meta_lookalike_audiences.csv"');
      return res.send(csv);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao exportar público Lookalike.' });
    }
  });

  return router;
};
