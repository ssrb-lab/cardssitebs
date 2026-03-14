const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const LIMITS = {
  'Звичайна': { maxPower: 50, maxHp: 100 },
  'Рідкісна': { maxPower: 80, maxHp: 200 },
  'Епічна': { maxPower: 100, maxHp: 300 },
  'Легендарна': { maxPower: 125, maxHp: 400 },
  'Унікальна': { maxPower: 150, maxHp: 500 },
};

async function migrate() {
  console.log('--- Початок міграції характеристик карток ---');
  
  const inventoryItems = await prisma.inventoryItem.findMany({
    include: { card: true }
  });

  let totalFixed = 0;

  for (const item of inventoryItems) {
    if (!item.gameStats || !Array.isArray(item.gameStats)) continue;

    const rarity = item.card.rarity;
    const limits = LIMITS[rarity];
    if (!limits) continue;

    let changed = false;
    const updatedStats = item.gameStats.map(stat => {
      if (typeof stat !== 'object' || stat === null) return stat;

      let newPower = stat.power;
      let newHp = stat.hp;

      if (stat.power > limits.maxPower) {
        newPower = limits.maxPower;
        changed = true;
      }
      if (stat.hp > limits.maxHp) {
        newHp = limits.maxHp;
        changed = true;
      }

      return { ...stat, power: newPower, hp: newHp };
    });

    if (changed) {
      await prisma.inventoryItem.update({
        where: { id: item.id },
        data: { gameStats: updatedStats }
      });
      totalFixed++;
      console.log(`[FIXED] Користувач ${item.userId}, Картка: ${item.card.name} (${rarity})`);
    }
  }

  console.log(`--- Міграція завершена. Виправлено записів: ${totalFixed} ---`);
}

migrate()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
