const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting migration...');
  const items = await prisma.inventoryItem.findMany();
  let createdCount = 0;
  
  // Mapping array to store original statsIndex to new CardInstance ID
  // key: userId_cardId_statsIndex, value: cardInstance.id
  const indexMap = {};

  for (const item of items) {
    if (!item.gameStats) continue;
    let stats = [];
    try {
      stats = typeof item.gameStats === 'string' ? JSON.parse(item.gameStats) : item.gameStats;
    } catch (e) { continue; }

    if (!Array.isArray(stats)) continue;

    for (let i = 0; i < stats.length; i++) {
        const s = stats[i];
        let power = null, hp = null, inSafe = false;
        if (typeof s === 'object' && s !== null) {
            power = s.power;
            hp = s.hp;
            inSafe = s.inSafe || false;
        } else if (typeof s === 'number') {
            power = s;
        }

        const newInstance = await prisma.cardInstance.create({
            data: {
                power: power !== undefined && power !== null ? Number(power) : null,
                hp: hp !== undefined && hp !== null ? Number(hp) : null,
                inSafe: Boolean(inSafe),
                inventoryItemId: item.id
            }
        });
        createdCount++;
        indexMap[`${item.userId}_${item.cardId}_${i}`] = newInstance.id;
    }
  }
  
  console.log(`Created ${createdCount} CardInstance records.`);
  console.log('Migrating Arena Points...');
  const points = await prisma.arenaPoint.findMany();
  let updatedPoints = 0;

  for (const point of points) {
      if (!point.defendingCards) continue;
      let cards = [];
      try {
        cards = typeof point.defendingCards === 'string' ? JSON.parse(point.defendingCards) : point.defendingCards;
      } catch(e) {}

      if (!Array.isArray(cards) || cards.length === 0) continue;
      
      let updated = false;
      for (const dc of cards) {
          // dc has cardId and statsIndex. We also know point.ownerId (userId)
          const key = `${point.ownerId}_${dc.cardId}_${dc.statsIndex}`;
          const instanceId = indexMap[key];
          if (instanceId) {
             await prisma.cardInstance.update({
                 where: { id: instanceId },
                 data: { arenaPointId: point.id }
             });
             updated = true;
          }
      }
      if (updated) updatedPoints++;
  }
  
  console.log(`Updated ${updatedPoints} ArenaPoints with new relations.`);
  console.log('Migration complete!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
