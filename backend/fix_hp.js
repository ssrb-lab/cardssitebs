const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixNegativeHp() {
    console.log('Починаю відновлення від\'ємного ХП та додавання maxHp...');
    let fixedInventoryCount = 0;
    let fixedPointsCount = 0;

    try {
        // 1. Fix InventoryItem
        const items = await prisma.inventoryItem.findMany();
        for (const item of items) {
            if (!item.gameStats) continue;

            let stats = [];
            try {
                stats = typeof item.gameStats === 'string' ? JSON.parse(item.gameStats) : item.gameStats;
            } catch (e) {
                continue;
            }

            if (!Array.isArray(stats)) continue;

            let changed = false;
            const fixedStats = stats.map(s => {
                if (!s || typeof s !== 'object') return s;

                let power = s.power || 0;
                let hp = s.hp || 0;
                let maxHp = s.maxHp || hp || (power * 2);

                // Ensure maxHp is at least current HP if it somehow was 0 The card.power * 2 provides a safe fallback
                if (!s.maxHp) {
                    maxHp = Math.max(hp, power * 2);
                    changed = true;
                }

                // Fix negative HP by restoring to maxHp
                if (hp <= 0) {
                    hp = maxHp;
                    changed = true;
                }

                return { ...s, power, hp, maxHp };
            });

            if (changed) {
                await prisma.inventoryItem.update({
                    where: { id: item.id },
                    data: { gameStats: fixedStats }
                });
                fixedInventoryCount++;
            }
        }

        // 2. Fix ArenaPoint defendingCards
        const points = await prisma.arenaPoint.findMany();
        for (const point of points) {
            if (!point.defendingCards) continue;

            let cards = [];
            try {
                cards = typeof point.defendingCards === 'string' ? JSON.parse(point.defendingCards) : point.defendingCards;
            } catch (e) {
                continue;
            }

            if (!Array.isArray(cards)) continue;

            let pointChanged = false;
            const fixedCards = cards.map(c => {
                if (!c) return c;

                let power = c.power || 0;
                let hp = c.hp || 0;
                let maxHp = c.maxHp || hp || (power * 2);

                if (!c.maxHp) {
                    maxHp = Math.max(hp, power * 2);
                    pointChanged = true;
                }

                if (hp <= 0) {
                    hp = maxHp;
                    c.currentHp = maxHp; // Update currentHp if exists
                    pointChanged = true;
                }

                return { ...c, power, hp, maxHp };
            });

            if (pointChanged) {
                await prisma.arenaPoint.update({
                    where: { id: point.id },
                    data: { defendingCards: fixedCards }
                });
                fixedPointsCount++;
            }
        }

        console.log(`Ремонт завершено!`);
        console.log(`Виправлено інвентарів: ${fixedInventoryCount}`);
        console.log(`Виправлено точок арени: ${fixedPointsCount}`);

    } catch (error) {
        console.error('Помилка під час відновлення:', error);
    } finally {
        await prisma.$disconnect();
    }
}

fixNegativeHp();
