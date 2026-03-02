const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany({ where: { isBanned: true } });
    console.log('Current Node Date:', new Date().toISOString());
    console.log('Current Node MS:', Date.now());
    users.forEach(u => {
        console.log('User:', u.nickname);
        console.log('banUntil (DB object):', u.banUntil);
        console.log('banUntil (ISO):', u.banUntil ? u.banUntil.toISOString() : null);
        console.log('banUntil MS:', u.banUntil ? u.banUntil.getTime() : null);
        console.log('Should Unban:', u.banUntil ? new Date() > new Date(u.banUntil) : false);
        console.log('bannedBy:', u.bannedBy);
        console.log('---------------------------');
    });
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
