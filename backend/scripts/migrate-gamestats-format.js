/**
 * migrate-gamestats-format.js
 *
 * Міграція gameStats для всіх гравців:
 *  - Числовий формат [10, 20]     → [{power:10, hp:75, maxHp:75, level:1}, ...]
 *  - Об'єкт без maxHp             → додає maxHp = hp
 *  - Об'єкт без level             → додає level = 1
 *
 * Безпечно запускати повторно — вже мігровані записи не змінюються.
 * Запуск: node backend/scripts/migrate-gamestats-format.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEFAULT_HP = {
  'Звичайна':  75,
  'Рідкісна':  150,
  'Епічна':    225,
  'Легендарна': 300,
  'Унікальна': 400,
};

// Returns { result, changed }
function migrateOneStat(stat, rarity) {
  const defaultHp = DEFAULT_HP[rarity] || 75;

  // Числовий (старий) формат
  if (typeof stat === 'number') {
    return { result: { power: stat, hp: defaultHp, maxHp: defaultHp, level: 1, boostCount: 0 }, changed: true };
  }

  if (typeof stat !== 'object' || stat === null) {
    return { result: { power: 0, hp: defaultHp, maxHp: defaultHp, level: 1, boostCount: 0 }, changed: true };
  }

  let changed = false;
  const result = { ...stat };

  if (result.level === undefined || result.level === null) {
    result.level = 1;
    changed = true;
  }

  if (result.maxHp === undefined || result.maxHp === null) {
    result.maxHp = result.hp || defaultHp;
    changed = true;
  }

  if (result.hp === undefined || result.hp === null) {
    result.hp = defaultHp;
    changed = true;
  }

  if (result.boostCount === undefined) {
    result.boostCount = 0;
    changed = true;
  }

  return { result, changed };
}

async function migrate() {
  console.log('=== Міграція gameStats гравців ===');

  const items = await prisma.inventoryItem.findMany({
    include: { card: { select: { name: true, rarity: true } } },
  });

  let totalItems = 0;
  let fixedItems = 0;

  for (const item of items) {
    totalItems++;
    let stats = item.gameStats;

    if (!Array.isArray(stats) || stats.length === 0) continue;

    let anyChanged = false;
    const updated = stats.map((s) => {
      const { result, changed } = migrateOneStat(s, item.card.rarity);
      if (changed) anyChanged = true;
      return result;
    });

    if (anyChanged) {
      await prisma.inventoryItem.update({
        where: { id: item.id },
        data: { gameStats: updated },
      });
      fixedItems++;
      console.log(`[FIXED] ${item.card.name} (${item.card.rarity}) — userId: ${item.userId}`);
    }
  }

  console.log(`\n=== Готово. Перевірено: ${totalItems}, оновлено: ${fixedItems} ===`);
}

migrate()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
