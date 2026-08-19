require('dotenv').config();
const { Bot, InlineKeyboardBuilder } = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN || '';
const groupChatId = process.env.TELEGRAM_CHAT_ID || '';
const appUrl = process.env.APP_URL || 'https://taxinexo.onrender.com';

let bot = null;

function initTelegramBot() {
  if (!token || token.trim() === '') {
    console.log('[TELEGRAM BOT] TELEGRAM_BOT_TOKEN nao configurado. Bot em modo de espera.');
    return null;
  }

  try {
    bot = new Bot(token);

    // Tratamento de erros do bot
    bot.catch((err) => {
      console.error('[TELEGRAM BOT ERROR]:', err.message || err);
    });

    // Comando /start
    bot.command('start', async (ctx) => {
      const firstName = ctx.from && ctx.from.first_name ? ctx.from.first_name : 'Operador';

      const welcomeText = 
        '🚀 *BEM-VINDO AO TAXINEXO* 🤖\n\n' +
        'Olá, *' + firstName + '*! Você está no canal oficial de frotas autônomas urbanas.\n\n' +
        '💡 *Como funciona?*\n' +
        '1️⃣ Cadastre-se na plataforma.\n' +
        '2️⃣ Escolha uma das 7 frotas autônomas (Tesla, Waymo, Baidu Apollo, etc).\n' +
        '3️⃣ Receba liquidação diária de rendimentos direto na sua carteira com saque via Pix!\n\n' +
        '👥 *Indique e Ganhe:* Comissões em 3 níveis (10%, 5% e 2%) sobre qualquer contrato da sua rede!';

      await ctx.reply(welcomeText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📱 Acessar Aplicativo TAXINEXO', url: appUrl + '/' }],
            [
              { text: '🚗 Frotas & Veículos', callback_data: 'cmd_frotas' },
              { text: '💸 Regras de Saque', callback_data: 'cmd_saques' }
            ],
            [{ text: '👥 Grupo VIP no Telegram', url: 'https://t.me/+VRCCsj-SJHQwNmE5' }]
          ]
        }
      });
    });

    // Comando /frotas
    bot.command('frotas', async (ctx) => {
      await sendFleetMessage(ctx);
    });

    // Comando /regras ou /saques
    bot.command(['regras', 'saques'], async (ctx) => {
      await sendRulesMessage(ctx);
    });

    // Resposta a cliques em botões (callbacks)
    bot.on('callback_query:data', async (ctx) => {
      const data = ctx.callbackQuery.data;

      if (data === 'cmd_frotas') {
        await sendFleetMessage(ctx);
      } else if (data === 'cmd_saques') {
        await sendRulesMessage(ctx);
      }

      await ctx.answerCallbackQuery();
    });

    // Boas-Vindas a Novos Membros do Grupo
    bot.on('message:new_chat_members', async (ctx) => {
      const newMembers = ctx.message.new_chat_members || [];

      for (const member of newMembers) {
        if (member.is_bot) continue;

        const name = member.first_name || 'Operador';
        const msgText = 
          '👋 *BEM-VINDO À COMUNIDADE TAXINEXO, ' + name + '!* 🚀\n\n' +
          'Você acaba de entrar no grupo oficial de operadores de frotas autônomas.\n\n' +
          '⚡ *Passo 1:* Acesse o app e crie sua conta.\n' +
          '⚡ *Passo 2:* Faça seu check-in diário e ative seu veículo de alta performance.\n' +
          '⚡ *Passo 3:* Acompanhe os avisos e comprovantes de rendimento aqui no grupo!';

        await ctx.reply(msgText, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📱 Acessar App TAXINEXO', url: appUrl + '/login.html' }]
            ]
          }
        });
      }
    });

    // Auto-detecção do Grupo ao receber qualquer mensagem
    bot.on('message', (ctx) => {
      if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
        console.log(`[TELEGRAM] Grupo detectado! ID: ${ctx.chat.id} | Título: ${ctx.chat.title}`);
      }
    });


    // Inicia escuta
    bot.startPolling();
    console.log('[TELEGRAM BOT] Bot @taxinexo_oficial_bot escutando mensagens em tempo real!');

  } catch (err) {
    console.error('[TELEGRAM BOT INIT ERROR]:', err);
  }

  return bot;
}

async function sendFleetMessage(ctx) {
  const text = 
    '⚡ *CATÁLOGO DE FROTAS AUTÔNOMAS TAXINEXO* ⚡\n\n' +
    '1️⃣ *Tesla Robotaxi Model 3 (NX-101)*\n' +
    '• Contrato: R$ 150,00 | Retorno: *R$ 14,50/dia* (30 dias)\n\n' +
    '2️⃣ *Baidu Apollo RT6 (NX-202)*\n' +
    '• Contrato: R$ 350,00 | Retorno: *R$ 36,00/dia* (45 dias)\n\n' +
    '3️⃣ *Tesla Cybercab Next-Gen (NX-707)*\n' +
    '• Contrato: R$ 600,00 | Retorno: *R$ 68,00/dia* (40 dias)\n\n' +
    '4️⃣ *Cruise Origin Autonomous (NX-404)*\n' +
    '• Contrato: R$ 900,00 | Retorno: *R$ 105,00/dia* (45 dias)\n\n' +
    '5️⃣ *Waymo Autonomous Van (NX-303)*\n' +
    '• Contrato: R$ 1.500,00 | Retorno: *R$ 185,00/dia* (60 dias)\n\n' +
    '6️⃣ *Zoox Urban Bi-Directional (NX-505)*\n' +
    '• Contrato: R$ 2.800,00 | Retorno: *R$ 360,00/dia* (60 dias)\n\n' +
    '7️⃣ *NIO Executive Fleet (NX-606)*\n' +
    '• Contrato: R$ 5.000,00 | Retorno: *R$ 720,00/dia* (90 dias)';

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🚗 Contratar Frota no App', url: appUrl + '/' }]
      ]
    }
  });
}

async function sendRulesMessage(ctx) {
  const saqueText = 
    '💳 *REGRAS DE SAQUE & LIQUIDAÇÃO PIX*\n\n' +
    '• *Valor Mínimo de Saque:* R$ 30,00\n' +
    '• *Forma de Pagamento:* Pix Instantâneo (Chave CPF, Telefone, Email ou Aleatória)\n' +
    '• *Horário de Processamento:* Segunda a Domingo\n' +
    '• *Rendimentos:* Liquidados diariamente de forma 100% automática!\n\n' +
    '👥 *Comissões de Rede:*\n' +
    '• Nível 1: 10% de bônus imediato\n' +
    '• Nível 2: 5% de bônus\n' +
    '• Nível 3: 2% de bônus';

  await ctx.reply(saqueText, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📱 Ir para Área de Saque', url: appUrl + '/' }]
      ]
    }
  });
}

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { InputFile } = require('node-telegram-bot-api');

/**
 * Envia uma mensagem com foto, vídeo ou texto para o grupo
 */
async function sendBroadcastWithMedia(targetChatId, folderName, caption, inlineKeyboard) {
  if (!bot || !targetChatId) return;

  const mediaDir = path.join(__dirname, '..', 'media', folderName);
  let mediaFile = null;

  try {
    if (fs.existsSync(mediaDir)) {
      const files = fs.readdirSync(mediaDir).filter(f => /\.(jpg|jpeg|png|mp4)$/i.test(f));
      if (files.length > 0) {
        const randomName = files[Math.floor(Math.random() * files.length)];
        mediaFile = path.join(mediaDir, randomName);
      }
    }
  } catch (err) {
    console.error(`[MEDIA SEARCH ERROR in ${folderName}]:`, err.message);
  }

  const options = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: inlineKeyboard
    }
  };

  try {
    if (mediaFile) {
      const isVideo = /\.mp4$/i.test(mediaFile);
      if (isVideo) {
        console.log(`[TELEGRAM MEDIA] Enviando vídeo (${mediaFile}) para o grupo...`);
        await bot.api.sendVideo(targetChatId, new InputFile(mediaFile), {
          caption,
          ...options
        });
      } else {
        console.log(`[TELEGRAM MEDIA] Enviando foto (${mediaFile}) para o grupo...`);
        await bot.api.sendPhoto(targetChatId, new InputFile(mediaFile), {
          caption,
          ...options
        });
      }
    } else {
      console.log(`[TELEGRAM TEXT] Enviando mensagem de texto para o grupo...`);
      await bot.api.sendMessage(targetChatId, caption, options);
    }
  } catch (err) {
    console.error(`[BROADCAST SEND ERROR]:`, err.message);
    // Fallback para envio de texto caso envio de mídia falhe
    try {
      await bot.api.sendMessage(targetChatId, caption, options);
    } catch (e) {
      console.error(`[BROADCAST FALLBACK ERROR]:`, e.message);
    }
  }
}

// Função para iniciar os agendamentos automáticos diários
function startDailySchedule() {
  const targetChatId = groupChatId || process.env.TELEGRAM_CHAT_ID;
  if (!targetChatId) {
    console.log('[TELEGRAM SCHEDULER] Aguardando ID do grupo para iniciar agendamentos automáticos.');
    return;
  }

  console.log(`[TELEGRAM SCHEDULER] Grade de postagens automáticas com mídias ativada para o grupo: ${targetChatId}`);

  // 1. Manhã - 09:00 (Do Regime Parcial ao Nível Executivo + Foto/Vídeo de Bom Dia)
  cron.schedule('0 9 * * *', async () => {
    console.log('[TELEGRAM CRON] Disparando mensagem das 09:00 com mídia...');
    const caption = 
      '🚀 *BOM DIA! DO REGIME PARCIAL AO NÍVEL EXECUTIVO* 💸\n\n' +
      'Começar no regime parcial com frotas de entrada (NX-101) é o primeiro passo de todo grande operador no TAXINEXO.\n\n' +
      'Hoje pela manhã, mais de 40 operadores tiveram seus contratos atualizados para níveis superiores de alta demanda, desbloqueando rendimentos diários de até R$ 720,00 direto na carteira Pix!\n\n' +
      '🔑 *O SEGREDO DA ESCALA NO TAXINEXO:*\n' +
      '• Comece com a frota que cabe no seu bolso.\n' +
      '• Mantenha seu check-in diário ativo.\n' +
      '• Reinvista seus rendimentos para subir de nível e faturar no automático.\n\n' +
      'As frotas de Miami e Nova York já estão nas ruas rodando por você.\n\n' +
      '📱 *Acesse seu painel e ative seu veículo agora:*';

    const buttons = [
      [{ text: '🚗 Ativar Minha Frota Agora', url: appUrl + '/' }],
      [{ text: '📱 Fazer Check-in Diário', url: appUrl + '/' }]
    ];

    await sendBroadcastWithMedia(targetChatId, '01_bom_dia', caption, buttons);
  }, { timezone: 'America/Sao_Paulo' });

  // 2. Meio-dia - 12:30 (Rendimentos do Primeiro Turno + Print/Vídeo de Operação)
  cron.schedule('30 12 * * *', async () => {
    console.log('[TELEGRAM CRON] Disparando mensagem das 12:30 com mídia...');
    const caption = 
      '💸 *[RELATÓRIO DO MEIO-DIA] RENDIMENTOS DO 1º TURNO CREDITADOS!* 🚗⚡\n\n' +
      'O primeiro ciclo de viagens das frotas autônomas em Miami acaba de ser finalizado e os lucros já foram creditados na carteira dos operadores!\n\n' +
      '📊 *DESEMPENHO DO TURNO:*\n' +
      '• Tesla Robotaxi (NX-101): Viagens urbanas concluídas\n' +
      '• Tesla Cybercab (NX-707): Operação em alta demanda (+18% de eficiência)\n' +
      '• Waymo Autonomous (NX-303): Rotas executivas finalizadas\n\n' +
      'Seu rendimento de hoje já está disponível para saque ou para reinvestir na subida de nível.\n\n' +
      '📲 *Abra seu painel e veja seu saldo crescendo:*';

    const buttons = [
      [{ text: '💰 Ver Meu Saldo no App', url: appUrl + '/' }],
      [{ text: '🚗 Ver Frotas Disponíveis', url: appUrl + '/' }]
    ];

    await sendBroadcastWithMedia(targetChatId, 'provas', caption, buttons);
  }, { timezone: 'America/Sao_Paulo' });

  // 3. Tarde - 16:00 (Comprovante de Saques Pix Aprovados + Print de Pix)
  cron.schedule('0 16 * * *', async () => {
    console.log('[TELEGRAM CRON] Disparando mensagem das 16:00 com mídia...');
    const caption = 
      '⚡ *[LOTE DE SAQUES PIX APROVADO] DINHEIRO NA CONTA DOS OPERADORES!* 💳💸\n\n' +
      'Mais um lote de solicitações de saque foi processado e enviado via Pix direto para as contas bancárias dos operadores ativos!\n\n' +
      '🏆 *O TAXINEXO NÃO PARA:*\n' +
      '• Saques a partir de R$ 30,00\n' +
      '• Liquidação instantânea via Pix\n' +
      '• Sem taxas abusivas ou burocracia\n\n' +
      'Trabalho autônomo com tecnologia de verdade: o robô roda nas ruas e o lucro cai na sua conta todos os dias.\n\n' +
      'Parabéns a todos os operadores que já garantiram o seu Pix de hoje! 🚀\n\n' +
      '📱 *Solicite seu saque ou ative sua frota no app:*';

    const buttons = [
      [{ text: '💳 Solicitar Saque Pix', url: appUrl + '/' }],
      [{ text: '📱 Acessar Plataforma', url: appUrl + '/' }]
    ];

    await sendBroadcastWithMedia(targetChatId, 'provas', caption, buttons);
  }, { timezone: 'America/Sao_Paulo' });

  // 4. Noite - 20:00 (Fechamento de Ciclo & Urgência de Vagas)
  cron.schedule('0 20 * * *', async () => {
    console.log('[TELEGRAM CRON] Disparando mensagem das 20:00 com mídia...');
    const caption = 
      '🌙 *[FECHAMENTO DE CICLO] ÚLTIMAS VAGAS DE FROTAS PARA AMANHÃ!* 🚗⏳\n\n' +
      'O ciclo operacional de hoje está se encerrando com mais de 98% das frotas em operação contínua.\n\n' +
      '🚨 *ATENÇÃO:* As vagas para contratação das categorias de maior rendimento estão se esgotando:\n' +
      '🔥 Tesla Cybercab (NX-707) ➔ Restam poucas unidades\n' +
      '👑 NIO Executive Fleet (NX-606) ➔ Última cota disponível para o turno da manhã\n\n' +
      'Quem ativa o contrato ainda hoje já acorda com os primeiros rendimentos sendo contabilizados no ciclo de amanhã cedo!\n\n' +
      'Não durma no ponto enquanto a inteligência artificial trabalha por você.\n\n' +
      '👉 *ATIVE SUA FROTA AGORA:*';

    const buttons = [
      [{ text: '🚗 Garantir Minha Frota Agora', url: appUrl + '/' }]
    ];

    await sendBroadcastWithMedia(targetChatId, '01_bom_dia', caption, buttons);
  }, { timezone: 'America/Sao_Paulo' });
}

// Inicia os agendamentos se o groupChatId estiver definido
if (groupChatId) {
  startDailySchedule();
}

/**
 * Dispara notificação de rendimento diário para o grupo
 */
async function broadcastDailySettlement({ settlementsProcessed, totalCredited }) {
  const targetChatId = groupChatId || process.env.TELEGRAM_CHAT_ID;
  if (!bot || !targetChatId) return;

  const format = (v) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(v);
  const msg = 
    '🔔 *[LIQUIDAÇÃO DIÁRIA CONCLUÍDA]* 💸\n\n' +
    'O motor autônomo do TAXINEXO acabou de processar os rendimentos das frotas ativas!\n\n' +
    '📊 *Contratos Liquidados:* ' + settlementsProcessed + '\n' +
    '💰 *Total Creditado Hoje:* R$ ' + format(totalCredited) + '\n\n' +
    'Verifique seu saldo atualizado no aplicativo:';

  try {
    await bot.api.sendMessage(targetChatId, msg, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📱 Ver Meu Saldo no App', url: appUrl + '/' }]
        ]
      }
    });
  } catch (e) {
    console.error('[TELEGRAM BROADCAST ERROR]:', e.message);
  }
}

module.exports = { initTelegramBot, broadcastDailySettlement, startDailySchedule, sendBroadcastWithMedia };




