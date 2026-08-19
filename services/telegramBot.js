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

/**
 * Dispara notificação de rendimento diário para o grupo
 */
async function broadcastDailySettlement({ settlementsProcessed, totalCredited }) {
  if (!bot || !groupChatId) return;

  const format = (v) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(v);
  const msg = 
    '🔔 *[LIQUIDAÇÃO DIÁRIA CONCLUÍDA]* 💸\n\n' +
    'O motor autônomo do TAXINEXO acabou de processar os rendimentos das frotas ativas!\n\n' +
    '📊 *Contratos Liquidados:* ' + settlementsProcessed + '\n' +
    '💰 *Total Creditado Hoje:* R$ ' + format(totalCredited) + '\n\n' +
    'Verifique seu saldo atualizado no aplicativo:';

  try {
    await bot.api.sendMessage(groupChatId, msg, {
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

module.exports = { initTelegramBot, broadcastDailySettlement };


