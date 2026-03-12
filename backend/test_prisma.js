const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const packs = await prisma.packCatalog.findMany({ where: { isHidden: false } });
  const packIds = packs.map(p => p.id);
  
  const cards = await prisma.cardCatalog.findMany({ where: { packId: { in: packIds } } });
  const visibleCardIds = cards.map(c => c.id);

  const users = await prisma.user.findMany({
    take: 1,
    select: {
      uid: true,
      _count: {
        select: {
          inventory: {
            where: {
              cardId: { in: visibleCardIds }
            }
          }
        }
      }
    }
  });

  console.log("Success:", JSON.stringify(users, null, 2));
}

test().catch(console.error).finally(() => prisma.$disconnect());
