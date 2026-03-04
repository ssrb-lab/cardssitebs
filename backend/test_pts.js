const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fix() {
    try {
        // MySQL 5.7+ JSON syntax to clean up the table
        await prisma.$executeRawUnsafe(`UPDATE ArenaPoint SET defendingCards = JSON_ARRAY() WHERE defendingCards IS NULL OR JSON_VALID(defendingCards) = 0`);
        console.log('Fixed invalid JSON cells in ArenaPoint.');
        const pts = await prisma.arenaPoint.findMany();
        console.log('Points count after fix:', pts.length);
    } catch (e) { console.error('Error during fallback:', e); }
}
fix().finally(() => prisma.$disconnect());
