require('dotenv').config();
const RawTelegramBot = require('node-telegram-bot-api');
const TelegramBot = typeof RawTelegramBot === 'function' ? RawTelegramBot : (RawTelegramBot.default || RawTelegramBot);

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
    bot = new TelegramBot(token, { polling: true });
    console.log('[TELEGRAM BOT] Bot do Telegram iniciado com sucesso!');


    // Comando /start
    bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      const firstName = msg.from.first_name || 'Operador';

      const welcomeText = 
        '🚀 *BEM-VINDO AO TAXINEXO* 🤖\n' +
        'Olá, *' + firstName + '*! Você está no terminal oficial do maior ecossistema de frotas autônomas urbanas.\n\n' +
        '💡 *Como funciona?*\n' +
        '1️⃣ Cadastre-se na plataforma.\n' +
        '2️⃣ Escolha uma das 7 categorias de veículos autônomos (Tesla, Waymo, Baidu Apollo, etc).\n' +
        '3️⃣ Receba liquidação diária de rendimentos direto na sua carteira com saque via Pix!\n\n' +
        '👥 *Indique e Ganhe:* Comissões em 3 níveis (10%, 5% e 2%) sobre qualquer contrato da sua rede!';

      bot.sendMessage(chatId, welcomeText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📱 Acessar Aplicativo TAXINEXO', url: appUrl + '/' }],
            [
              { text: '🚗 Frotas & Veículos', callback_data: 'cmd_frotas' },
              { text: '💸 Como Sacar', callback_data: 'cmd_saques' }
            ],
            [{ text: '👥 Grupo VIP de Operadores', url: 'https://t.me/+VRCCsj-SJHQwNmE5' }]
          ]
        }
      });
    });

    // Comando /frotas
    bot.onText(/\/frotas/, (msg) => {
      sendFleetList(msg.chat.id);
    });

    // Resposta a botões inline (callbacks)
    bot.on('callback_query', (query) => {
      const chatId = query.message.chat.id;

      if (query.data === 'cmd_frotas') {
        sendFleetList(chatId);
      } else if (query.data === 'cmd_saques') {
        const saqueText = 
          '💳 *REGRAS DE SAQUE & LIQUIDAÇÃO PIX*\n\n' +
          '• *Valor Mínimo de Saque:* R$ 30,00\n' +
          '• *Forma de Pagamento:* Pix Instantâneo (Chave CPF, Telefone, Email ou Aleatória)\n' +
          '• *Horário de Processamento:* Segunda a Domingo\n' +
          '• *Rendimentos:* Liquidados diariamente de forma 100% automática!';

        bot.sendMessage(chatId, saqueText, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📱 Ir para Área de Saque', url: appUrl + '/' }]
            ]
          }
        });
      }

      bot.answerCallbackQuery(query.id);
    });

    // Boas-Vindas a Novos Membros do Grupo
    bot.on('new_chat_members', (msg) => {
      const chatId = msg.chat.id;
      const newMembers = msg.new_chat_members;

      newMembers.forEach((member) => {
        if (member.is_bot) return;

        const name = member.first_name || 'Operador';
        const msgText = 
          '👋 *BEM-VINDO À COMUNIDADE TAXINEXO, ' + name + '!* 🚀\n\n' +
          'Você acaba de entrar no grupo oficial de operadores de frotas autônomas.\n\n' +
          '⚡ *Passo 1:* Acesse o app e crie sua conta.\n' +
          '⚡ *Passo 2:* Faça seu check-in diário e escolha seu veículo de alta performance.\n' +
          '⚡ *Passo 3:* Acompanhe os avisos e comprovantes de rendimento aqui no grupo!';

        bot.sendMessage(chatId, msgText, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📱 Acessar App TAXINEXO', url: appUrl + '/login.html' }]
            ]
          }
        });
      });
    });

    bot.on('polling_error', (error) => {
      if (!error.message.includes('EFATAL')) {
        console.error('[TELEGRAM BOT ERROR]:', error.message);
      }
    });

  } catch (err) {
    console.error('[TELEGRAM BOT INIT ERROR]:', err);
  }

  return bot;
}

function sendFleetList(chatId) {
  if (!bot) return;

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

  bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🚗 Contratar Frota no App', url: appUrl + '/' }]
      ]
    }
  });
}

/**
 * Dispara notificação de rendimento diário para o grupo
 */
function broadcastDailySettlement({ settlementsProcessed, totalCredited }) {
  if (!bot || !groupChatId) return;

  const format = (v) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(v);
  const msg = 
    '🔔 *[LIQUIDAÇÃO DIÁRIA CONCLUÍDA]* 💸\n\n' +
    'O motor autônomo do TAXINEXO acabou de processar os rendimentos das frotas ativas!\n\n' +
    '📊 *Contratos Liquidados:* ' + settlementsProcessed + '\n' +
    '💰 *Total Creditado Hoje:* R$ ' + format(totalCredited) + '\n\n' +
    'Verifique seu saldo atualizado no aplicativo:';

  bot.sendMessage(groupChatId, msg, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📱 Ver Meu Saldo no App', url: appUrl + '/' }]
      ]
    }
  }).catch((e) => console.error('[TELEGRAM BROADCAST ERROR]:', e.message));
}

module.exports = { initTelegramBot, broadcastDailySettlement };

