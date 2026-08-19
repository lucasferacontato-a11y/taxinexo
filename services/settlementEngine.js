const { readDb, writeDb } = require('../database');

/**
 * Motor de liquidação diária: percorre todos os contratos ativos
 * e credita o ganho diário na carteira dos usuários
 */
function processDailySettlement() {
  const db = readDb();
  let settlementsProcessed = 0;
  let totalCredited = 0;

  db.contracts.forEach(contract => {
    if (contract.status === 'Em corrida' && contract.daysRemaining > 0) {
      const user = db.users.find(u => u.id === contract.userId);
      if (user) {
        // Credita rendimento
        user.balance += contract.dailyReturn;
        contract.daysRemaining -= 1;
        
        if (contract.daysRemaining <= 0) {
          contract.status = 'Finalizado';
        }

        contract.lastSettlement = new Date().toISOString();

        // Registra transação de rendimento
        db.transactions.unshift({
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
  });

  writeDb(db);
  console.log(`[SETTLEMENT] Processados ${settlementsProcessed} contratos. Total creditado: R$ ${totalCredited.toFixed(2)}`);
  return { settlementsProcessed, totalCredited };
}

module.exports = { processDailySettlement };
