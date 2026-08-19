const {
  getAllActiveContracts,
  findUserById,
  updateUser,
  updateContract,
  createTransaction
} = require('../database');
const { broadcastDailySettlement } = require('./telegramBot');

/**
 * Motor de liquidação diária: percorre todos os contratos ativos
 * e credita o ganho diário na carteira dos usuários
 */
async function processDailySettlement() {
  let settlementsProcessed = 0;
  let totalCredited = 0;

  try {
    const activeContracts = await getAllActiveContracts();

    for (const contract of activeContracts) {
      const user = await findUserById(contract.userId);
      if (user) {
        // Credita rendimento no saldo
        const newBalance = user.balance + contract.dailyReturn;
        await updateUser(user.id, { balance: newBalance });

        const remaining = contract.daysRemaining - 1;
        const newStatus = remaining <= 0 ? 'Finalizado' : contract.status;

        await updateContract(contract.id, {
          daysRemaining: remaining,
          status: newStatus,
          lastSettlement: new Date().toISOString()
        });

        // Registra transação de rendimento
        await createTransaction({
          id: `TX-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          userId: user.id,
          type: 'income',
          amount: contract.dailyReturn,
          status: 'approved',
          description: `Rendimento Diário - ${contract.productName}`,
          createdAt: new Date().toISOString()
        });

        settlementsProcessed++;
        totalCredited += contract.dailyReturn;
      }
    }

    console.log(`[SETTLEMENT] Processados ${settlementsProcessed} contratos. Total creditado: R$ ${totalCredited.toFixed(2)}`);

    if (settlementsProcessed > 0) {
      broadcastDailySettlement({ settlementsProcessed, totalCredited });
    }
  } catch (err) {
    console.error('[SETTLEMENT ERROR]:', err);
  }

  return { settlementsProcessed, totalCredited };
}

module.exports = { processDailySettlement };


