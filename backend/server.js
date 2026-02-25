const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
require('dotenv').config();

const authenticate = require('./middleware/auth');

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json());

// ----------------------------------------
// АВТОРИЗАЦІЯ ТА РЕЄСТРАЦІЯ
// ----------------------------------------

app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    const email = payload.email;
    let nickname = payload.name.replace(/\s+/g, '_') || "Гравець";
    const avatarUrl = payload.picture || "";

    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      const existingNick = await prisma.user.findFirst({ where: { nickname } });
      if (existingNick) nickname = `${nickname}_${Math.floor(Math.random() * 10000)}`;

      const randomPassword = Math.random().toString(36).slice(-10);
      const passwordHash = await bcrypt.hash(randomPassword, 10);

      user = await prisma.user.create({
        data: { email, nickname, passwordHash, avatarUrl, coins: 200 }
      });
    } else if (!user.avatarUrl && avatarUrl) {
      user = await prisma.user.update({
          where: { uid: user.uid },
          data: { avatarUrl }
      });
    }

    const token = jwt.sign({ uid: user.uid, isAdmin: user.isAdmin }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });

  } catch (error) {
    console.error("Помилка Google Auth:", error);
    res.status(401).json({ error: "Помилка авторизації через Google." });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { nickname, email, password } = req.body;
  try {
    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { nickname }] }
    });
    
    if (existingUser) {
      return res.status(400).json({ error: "Користувач з таким email або нікнеймом вже існує." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { nickname, email, passwordHash }
    });

    const token = jwt.sign({ uid: user.uid, isAdmin: user.isAdmin }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Помилка сервера." });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: "Користувача не знайдено." });

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return res.status(401).json({ error: "Неправильний пароль." });

    const token = jwt.sign({ uid: user.uid, isAdmin: user.isAdmin }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ error: "Помилка сервера." });
  }
});

// ----------------------------------------
// ПРОФІЛЬ ГРАВЦЯ
// ----------------------------------------

app.post('/api/profile/change-password', authenticate, async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: "Введіть всі поля." });
  }

  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    if (!user) return res.status(404).json({ error: "Користувача не знайдено." });

    // Перевірка старого пароля
    const isValid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isValid) return res.status(401).json({ error: "Неправильний старий пароль." });

    // Хешування та збереження нового пароля
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { uid: req.user.uid },
      data: { passwordHash: newPasswordHash }
    });

    res.json({ success: true, message: "Пароль успішно змінено!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Помилка сервера при зміні пароля." });
  }
});

app.get('/api/profile', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { uid: req.user.uid },
      include: {
        inventory: { include: { card: true } },
        farmState: true
      }
    });
    
    if (!user) return res.status(404).json({ error: "Профіль не знайдено." });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: "Помилка сервера." });
  }
});

// Публічний профіль гравця (для рейтингу)
app.get('/api/profile/public/:uid', async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { uid: req.params.uid },
            select: { uid: true, nickname: true, avatarUrl: true, coins: true, uniqueCardsCount: true, packsOpened: true, farmLevel: true, createdAt: true, isPremium: true, premiumUntil: true, mainShowcaseId: true, isBanned: true, isAdmin: true, isSuperAdmin: true, inventory: true }
        });
        if (!user) return res.status(404).json({ error: "Гравця не знайдено." });
        res.json(user);
    } catch (error) { res.status(500).json({ error: "Помилка завантаження профілю." }); }
});

// ----------------------------------------
// ІГРОВІ ДАНІ ТА АДМІНКА (КАРТКИ ТА ПАКИ)
// ----------------------------------------

// Мідлвар для перевірки прав адміністратора
const checkAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: "Доступ заборонено. Тільки для Адмінів." });
  }
  next();
};

// Публічний роут для отримання всіх карток та паків
app.get('/api/catalog', async (req, res) => {
  try {
    const cards = await prisma.cardCatalog.findMany();
    const packs = await prisma.packCatalog.findMany();
    res.json({ cards, packs });
  } catch (error) {
    res.status(500).json({ error: "Помилка завантаження каталогу." });
  }
});

// Додавання/Редагування картки
app.post('/api/admin/cards', authenticate, checkAdmin, async (req, res) => {
  try {
    const data = req.body;
    const existing = await prisma.cardCatalog.findUnique({ where: { id: data.id } });
    let card;
    if (existing) {
      card = await prisma.cardCatalog.update({ where: { id: data.id }, data });
    } else {
      card = await prisma.cardCatalog.create({ data });
    }
    res.json(card);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Помилка збереження картки." });
  }
});

// Видалення картки
app.delete('/api/admin/cards/:id', authenticate, checkAdmin, async (req, res) => {
  try {
    await prisma.cardCatalog.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Помилка видалення картки." });
  }
});

// Додавання/Редагування паку
app.post('/api/admin/packs', authenticate, checkAdmin, async (req, res) => {
  try {
    const data = req.body;
    const existing = await prisma.packCatalog.findUnique({ where: { id: data.id } });
    let pack;
    if (existing) {
      pack = await prisma.packCatalog.update({ where: { id: data.id }, data });
    } else {
      pack = await prisma.packCatalog.create({ data });
    }
    res.json(pack);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Помилка збереження паку." });
  }
});

// Видалення паку
app.delete('/api/admin/packs/:id', authenticate, checkAdmin, async (req, res) => {
  try {
    await prisma.packCatalog.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Помилка видалення паку." });
  }
});

// ----------------------------------------
// ІГРОВА МЕХАНІКА (ВІДКРИТТЯ ПАКІВ)
// ----------------------------------------
app.post('/api/game/open-pack', authenticate, async (req, res) => {
  const { packId, amount } = req.body;
  
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    const pack = await prisma.packCatalog.findUnique({ where: { id: packId } });
    
    if (!pack) return res.status(404).json({ error: "Пак не знайдено" });

    const totalCost = pack.cost * amount;
    if (user.coins < totalCost) return res.status(400).json({ error: "Недостатньо монет!" });

    if (pack.isPremiumOnly && (!user.isPremium || new Date(user.premiumUntil) < new Date())) {
        return res.status(403).json({ error: "Тільки для Преміум гравців!" });
    }

    const availableCards = (await prisma.cardCatalog.findMany({ where: { packId: pack.id } }))
        .filter(c => c.maxSupply === 0 || c.pulledCount < c.maxSupply);

    if (availableCards.length === 0) return res.status(400).json({ error: "У цьому паку закінчились картки." });

    const DEFAULT_RARITIES = [
      { name: "Звичайна", weight: 70 }, { name: "Рідкісна", weight: 25 },
      { name: "Епічна", weight: 4 }, { name: "Легендарна", weight: 1 },
      { name: "Унікальна", weight: 0.1 }
    ];

    let results = [];
    let countsMap = {};
    let totalEarnedCoins = 0;

    for (let i = 0; i < amount; i++) {
        let totalWeight = 0;
        const activeWeights = [];

        for (const c of availableCards) {
            let w = 1;
            const globalRObj = DEFAULT_RARITIES.find(r => r.name === c.rarity);
            
            if (c.weight !== null && c.weight !== undefined) w = Number(c.weight);
            else if (pack.customWeights && pack.customWeights[c.rarity] !== undefined) w = Number(pack.customWeights[c.rarity]);
            else if (globalRObj) w = Number(globalRObj.weight);
            
            totalWeight += w;
            activeWeights.push({ card: c, weight: w });
        }

        const rand = Math.random() * totalWeight;
        let sum = 0;
        let newCard = activeWeights[0].card;
        for (const item of activeWeights) {
            sum += item.weight;
            if (rand <= sum) { newCard = item.card; break; }
        }

        results.push(newCard);
        countsMap[newCard.id] = (countsMap[newCard.id] || 0) + 1;
        totalEarnedCoins += (newCard.sellPrice || 15);
    }

    // Зберігаємо результати в базу даних однією транзакцією (безпечно!)
    await prisma.$transaction(async (tx) => {
        await tx.user.update({
            where: { uid: user.uid },
            data: {
                coins: { decrement: totalCost },
                totalCards: { increment: results.length },
                packsOpened: { increment: amount },
                coinsSpentOnPacks: { increment: totalCost },
                coinsEarnedFromPacks: { increment: totalEarnedCoins }
            }
        });

        for (const [cardId, count] of Object.entries(countsMap)) {
            await tx.inventoryItem.upsert({
                where: { userId_cardId: { userId: user.uid, cardId: cardId } },
                update: { amount: { increment: count } },
                create: { userId: user.uid, cardId: cardId, amount: count }
            });
            await tx.cardCatalog.update({
                where: { id: cardId },
                data: { pulledCount: { increment: count } }
            });
        }
    });

    // Отримуємо оновлені дані гравця
    const updatedUser = await prisma.user.findUnique({
        where: { uid: req.user.uid },
        include: { inventory: true, farmState: true }
    });

    res.json({ pulledCards: results, profile: updatedUser });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Помилка відкриття паку." });
  }
});

// ----------------------------------------
// РИНОК (MARKETPLACE)
// ----------------------------------------

// 1. Отримати всі активні лоти
app.get('/api/game/market', async (req, res) => {
  try {
    const listings = await prisma.marketListing.findMany({
      where: { status: 'active' },
      include: { seller: { select: { nickname: true } } },
      orderBy: { createdAt: 'desc' }
    });
    // Форматуємо під старий формат фронтенду
    const formatted = listings.map(l => ({
        id: l.id,
        cardId: l.cardId,
        price: l.price,
        status: l.status,
        createdAt: l.createdAt,
        sellerUid: l.sellerId,
        sellerNickname: l.seller.nickname
    }));
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: "Помилка завантаження ринку." });
  }
});

// 2. Виставити картку на продаж
app.post('/api/game/market/list', authenticate, async (req, res) => {
  const { cardId, price } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    const invItem = await prisma.inventoryItem.findUnique({ where: { userId_cardId: { userId: user.uid, cardId } } });

    if (!invItem || invItem.amount < 1) return res.status(400).json({ error: "У вас немає цієї картки!" });
    if (price < 1 || !Number.isInteger(price)) return res.status(400).json({ error: "Невірна ціна!" });

    await prisma.$transaction(async (tx) => {
        if (invItem.amount === 1) {
            await tx.inventoryItem.delete({ where: { userId_cardId: { userId: user.uid, cardId } } });
        } else {
            await tx.inventoryItem.update({ where: { userId_cardId: { userId: user.uid, cardId } }, data: { amount: { decrement: 1 } } });
        }
        await tx.user.update({ where: { uid: user.uid }, data: { totalCards: { decrement: 1 } } });
        await tx.marketListing.create({
            data: { price: Number(price), sellerId: user.uid, cardId: cardId, status: "active" }
        });
    });

    const updatedUser = await prisma.user.findUnique({ where: { uid: req.user.uid }, include: { inventory: true } });
    res.json({ success: true, profile: updatedUser });
  } catch (error) {
    res.status(500).json({ error: "Помилка виставлення на ринок." });
  }
});

// 3. Купити картку
app.post('/api/game/market/buy', authenticate, async (req, res) => {
  const { listingId } = req.body;
  try {
    const buyer = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    const listing = await prisma.marketListing.findUnique({ where: { id: listingId } });

    if (!listing || listing.status !== 'active') return res.status(400).json({ error: "Лот вже продано або не існує." });
    if (listing.sellerId === buyer.uid) return res.status(400).json({ error: "Не можна купити свій лот!" });
    if (buyer.coins < listing.price) return res.status(400).json({ error: "Недостатньо монет!" });

    await prisma.$transaction(async (tx) => {
        // Покупець: -монети, +картка, +totalCards
        await tx.user.update({ where: { uid: buyer.uid }, data: { coins: { decrement: listing.price }, totalCards: { increment: 1 } } });
        await tx.inventoryItem.upsert({
            where: { userId_cardId: { userId: buyer.uid, cardId: listing.cardId } },
            update: { amount: { increment: 1 } },
            create: { userId: buyer.uid, cardId: listing.cardId, amount: 1 }
        });
        // Продавець: +монети
        await tx.user.update({ where: { uid: listing.sellerId }, data: { coins: { increment: listing.price } } });
        // Лот: статус змінено
        await tx.marketListing.update({ where: { id: listingId }, data: { status: 'sold', soldAt: new Date() } });
    });

    const updatedUser = await prisma.user.findUnique({ where: { uid: req.user.uid }, include: { inventory: true } });
    res.json({ success: true, profile: updatedUser });
  } catch (error) {
    res.status(500).json({ error: "Помилка покупки." });
  }
});

// 4. Зняти лот з продажу
app.post('/api/game/market/cancel', authenticate, async (req, res) => {
  const { listingId } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    const listing = await prisma.marketListing.findUnique({ where: { id: listingId } });

    if (!listing || listing.status !== 'active') return res.status(400).json({ error: "Лот не активний або не існує." });
    if (listing.sellerId !== user.uid && !user.isAdmin) return res.status(403).json({ error: "У вас немає прав зняти цей лот." });

    await prisma.$transaction(async (tx) => {
        await tx.marketListing.delete({ where: { id: listingId } });
        await tx.user.update({ where: { uid: listing.sellerId }, data: { totalCards: { increment: 1 } } });
        await tx.inventoryItem.upsert({
            where: { userId_cardId: { userId: listing.sellerId, cardId: listing.cardId } },
            update: { amount: { increment: 1 } },
            create: { userId: listing.sellerId, cardId: listing.cardId, amount: 1 }
        });
    });

    const updatedUser = await prisma.user.findUnique({ where: { uid: req.user.uid }, include: { inventory: true } });
    res.json({ success: true, profile: updatedUser });
  } catch (error) {
    res.status(500).json({ error: "Помилка скасування лоту." });
  }
});

// ----------------------------------------
// ФАРМ (БИТВИ З БОСАМИ ТА АНТИЧІТ)
// ----------------------------------------

// Отримання стану боса для гравця
app.get('/api/game/farm/state', authenticate, async (req, res) => {
  try {
    const farm = await prisma.farmState.findUnique({ where: { userId: req.user.uid } });
    res.json(farm || {});
  } catch (error) { res.status(500).json({ error: "Помилка завантаження фарму." }); }
});

// Синхронізація кліків (Античіт)
app.post('/api/game/farm/sync', authenticate, async (req, res) => {
  const { bossId, damageDone, maxHp } = req.body;
  
// АНТИЧІТ: Ігноруємо адмінів (для кнопки InstaKill), і ставимо адекватніший ліміт для високих рівнів
if (!req.user.isAdmin && damageDone > 50000) {
    return res.status(400).json({ error: "Виявлено автоклікер! Занадто швидкі кліки!" });
}

  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid }, include: { farmState: true } });
    let farm = user.farmState;

    if (!farm) {
        farm = await prisma.farmState.create({ data: { userId: user.uid, bossId, currentHp: Math.max(0, maxHp - damageDone) } });
    } else if (farm.bossId !== bossId) {
        farm = await prisma.farmState.update({ where: { userId: user.uid }, data: { bossId, currentHp: Math.max(0, maxHp - damageDone), cooldownUntil: null } });
    } else {
        if (farm.cooldownUntil && new Date(farm.cooldownUntil) > new Date()) {
            return res.status(400).json({ error: "Бос ще на кулдауні!" });
        }
        const currentHp = farm.currentHp ?? maxHp;
        farm = await prisma.farmState.update({
            where: { userId: user.uid },
            data: { currentHp: Math.max(0, currentHp - damageDone), lastUpdated: new Date() }
        });
    }
    res.json({ success: true, farmState: farm });
  } catch (error) {
    res.status(500).json({ error: "Помилка синхронізації кліків." });
  }
});

// Забрати нагороду
app.post('/api/game/farm/claim', authenticate, async (req, res) => {
   const { bossId, reward, isLevelUp, cdHours, maxHp } = req.body;
   try {
       const user = await prisma.user.findUnique({ where: { uid: req.user.uid }, include: { farmState: true } });
       const farm = user.farmState;

       if (!farm || farm.bossId !== bossId || farm.currentHp > 0) return res.status(400).json({ error: "Боса ще не переможено!" });
       if (farm.cooldownUntil && new Date(farm.cooldownUntil) > new Date()) return res.status(400).json({ error: "Нагороду вже забрано!" });

       const cdUntil = new Date(Date.now() + cdHours * 60 * 60 * 1000);

       await prisma.$transaction(async (tx) => {
           await tx.user.update({
               where: { uid: user.uid },
               data: { coins: { increment: reward }, farmLevel: isLevelUp ? { increment: 1 } : undefined }
           });
           await tx.farmState.update({
               where: { userId: user.uid },
               data: { cooldownUntil: cdUntil, currentHp: maxHp }
           });
       });

       const updatedUser = await prisma.user.findUnique({ where: { uid: req.user.uid } });
       res.json({ success: true, profile: updatedUser, cdUntil });
   } catch (error) {
       res.status(500).json({ error: "Помилка отримання нагороди." });
   }
});

// Скинути КД (Для Адміна)
app.post('/api/admin/farm/reset-cd', authenticate, checkAdmin, async (req, res) => {
    const { targetUid, maxHp } = req.body;
    try {
        await prisma.farmState.upsert({
            where: { userId: targetUid },
            update: { cooldownUntil: null, currentHp: maxHp },
            create: { userId: targetUid, currentHp: maxHp, cooldownUntil: null }
        });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: "Помилка скидання кулдауну." }); }
});

// ----------------------------------------
// НАЛАШТУВАННЯ ТА ПРОМОКОДИ
// ----------------------------------------

// --- Налаштування ---
app.get('/api/game/settings', async (req, res) => {
  try {
    let settings = await prisma.gameSettings.findUnique({ where: { id: "main" } });
    if (!settings) {
        settings = await prisma.gameSettings.create({ 
            data: { id: "main", data: { 
                bosses: [], dailyRewards: [1000, 2000, 3000, 4000, 5000, 6000, 7000], 
                premiumDailyRewards: [2000, 4000, 6000, 8000, 10000, 12000, 15000], 
                premiumPrice: 10000, premiumDurationDays: 30, premiumShopItems: [] 
            }} 
        });
    }
    res.json(settings.data);
  } catch (error) { res.status(500).json({ error: "Помилка завантаження налаштувань." }); }
});

app.post('/api/admin/settings', authenticate, checkAdmin, async (req, res) => {
  try {
    const settings = await prisma.gameSettings.upsert({
        where: { id: "main" },
        update: { data: req.body },
        create: { id: "main", data: req.body }
    });
    res.json({ success: true, data: settings.data });
  } catch (error) { res.status(500).json({ error: "Помилка збереження налаштувань." }); }
});

// --- Промокоди ---
app.get('/api/admin/promos', authenticate, checkAdmin, async (req, res) => {
    try {
        const promos = await prisma.promoCode.findMany();
        res.json(promos);
    } catch (e) { res.status(500).json({ error: "Помилка завантаження промокодів." }); }
});

app.post('/api/admin/promos', authenticate, checkAdmin, async (req, res) => {
    try {
        const { code, reward, maxGlobalUses, maxUserUses } = req.body;
        const promo = await prisma.promoCode.upsert({
            where: { code },
            update: { reward: Number(reward), maxGlobalUses: Number(maxGlobalUses), maxUserUses: Number(maxUserUses) },
            create: { code, reward: Number(reward), maxGlobalUses: Number(maxGlobalUses), maxUserUses: Number(maxUserUses), currentGlobalUses: 0, usedBy: [] }
        });
        res.json(promo);
    } catch (e) { res.status(500).json({ error: "Помилка збереження промокоду." }); }
});

app.delete('/api/admin/promos/:code', authenticate, checkAdmin, async (req, res) => {
    try {
        await prisma.promoCode.delete({ where: { code: req.params.code } });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Помилка видалення промокоду." }); }
});

app.post('/api/game/promos/use', authenticate, async (req, res) => {
    const { code } = req.body;
    try {
        const promo = await prisma.promoCode.findUnique({ where: { code } });
        if (!promo) return res.status(404).json({ error: "Промокод не знайдено!" });

        const usedByList = promo.usedBy || [];
        const userUses = usedByList.filter(uid => uid === req.user.uid).length;

        if (promo.maxGlobalUses > 0 && promo.currentGlobalUses >= promo.maxGlobalUses) {
            return res.status(400).json({ error: "Ліміт використання цього промокоду вичерпано!" });
        }
        if (promo.maxUserUses > 0 && userUses >= promo.maxUserUses) {
            return res.status(400).json({ error: "Ви вже використали цей код максимальну кількість разів!" });
        }

        await prisma.$transaction(async (tx) => {
            const newUsedBy = [...usedByList, req.user.uid];
            await tx.promoCode.update({
                where: { code },
                data: { currentGlobalUses: { increment: 1 }, usedBy: newUsedBy }
            });
            await tx.user.update({
                where: { uid: req.user.uid },
                data: { coins: { increment: promo.reward } }
            });
        });

        const updatedUser = await prisma.user.findUnique({ where: { uid: req.user.uid } });
        res.json({ success: true, reward: promo.reward, profile: updatedUser });

    } catch (e) { res.status(500).json({ error: "Помилка активації промокоду." }); }
});

// --- ЩОДЕННА НАГОРОДА ---
app.post('/api/game/daily-claim', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    const settings = await prisma.gameSettings.findUnique({ where: { id: "main" } });
    const sData = settings?.data || {};

    const now = new Date();
    if (user.lastDailyClaim) {
        const last = new Date(user.lastDailyClaim);
        if (last.getUTCDate() === now.getUTCDate() && last.getUTCMonth() === now.getUTCMonth() && last.getUTCFullYear() === now.getUTCFullYear()) {
            return res.status(400).json({ error: "Ви вже забирали нагороду сьогодні!" });
        }
    }

    const isPremium = user.isPremium && new Date(user.premiumUntil) > now;
    const rewardsArr = isPremium ? (sData.premiumDailyRewards || []) : (sData.dailyRewards || []);
    const streak = user.dailyStreak || 0;
    const reward = rewardsArr[streak % rewardsArr.length] || 1000;

    const updatedUser = await prisma.user.update({
        where: { uid: user.uid },
        data: {
            coins: { increment: reward },
            lastDailyClaim: now,
            dailyStreak: streak + 1
        }
    });

    res.json({ success: true, reward, profile: updatedUser });
  } catch (error) {
    res.status(500).json({ error: "Помилка отримання нагороди." });
  }
});

// ----------------------------------------
// РЕЙТИНГ (ТАБЛИЦЯ ЛІДЕРІВ)
// ----------------------------------------
app.get('/api/game/leaderboard', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        uid: true,
        nickname: true,
        coins: true,
        farmLevel: true,
        isBanned: true,
        avatarUrl: true,
        // Рахуємо кількість унікальних записів в інвентарі гравця
        _count: {
          select: { inventory: true }
        }
      }
    });
    
    // Форматуємо дані під те, що очікує RatingView.jsx
    const formattedUsers = users.map(user => ({
        uid: user.uid,
        nickname: user.nickname,
        coins: user.coins,
        farmLevel: user.farmLevel,
        isBanned: user.isBanned,
        avatarUrl: user.avatarUrl,
        uniqueCardsCount: user._count.inventory // Передаємо підраховану кількість
    }));

    res.json(formattedUsers);
  } catch (error) {
    res.status(500).json({ error: "Помилка завантаження рейтингу." });
  }
});

// ----------------------------------------
// ПРЕМІУМ ТА ВІТРИНИ (ПРОФІЛЬ)
// ----------------------------------------

// Купівля преміуму
app.post('/api/game/buy-premium', authenticate, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
        const settings = await prisma.gameSettings.findUnique({ where: { id: "main" } });
        const price = settings?.data?.premiumPrice || 10000;
        const days = settings?.data?.premiumDurationDays || 30;

        if (user.coins < price) return res.status(400).json({ error: "Недостатньо монет!" });

        let currentExp = new Date();
        if (user.isPremium && user.premiumUntil) {
            const existingExp = new Date(user.premiumUntil);
            if (!isNaN(existingExp) && existingExp > currentExp) currentExp = existingExp;
        }
        currentExp.setDate(currentExp.getDate() + days);

        const updatedUser = await prisma.user.update({
            where: { uid: user.uid },
            data: { coins: { decrement: price }, isPremium: true, premiumUntil: currentExp.toISOString() }
        });

        res.json({ success: true, profile: updatedUser });
    } catch (error) { res.status(500).json({ error: "Помилка покупки преміуму." }); }
});

// Зміна головної вітрини
app.post('/api/profile/main-showcase', authenticate, async (req, res) => {
    const { showcaseId } = req.body;
    try {
        const updatedUser = await prisma.user.update({
            where: { uid: req.user.uid },
            data: { mainShowcaseId: showcaseId } // showcaseId може бути null, якщо знімаємо
        });
        res.json({ success: true, profile: updatedUser });
    } catch (error) { res.status(500).json({ error: "Помилка оновлення вітрини." }); }
});

// ----------------------------------------
// АДМІНКА: УПРАВЛІННЯ ГРАВЦЯМИ
// ----------------------------------------

// Завантаження всіх гравців
app.get('/api/admin/users', authenticate, checkAdmin, async (req, res) => {
    try {
        const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
        res.json(users);
    } catch (error) { res.status(500).json({ error: "Помилка завантаження гравців." }); }
});

// Завантаження інвентарю конкретного гравця
app.get('/api/admin/users/:uid/inventory', authenticate, checkAdmin, async (req, res) => {
    try {
        const inv = await prisma.inventoryItem.findMany({ where: { userId: req.params.uid } });
        res.json(inv.map(i => ({ id: i.cardId, amount: i.amount })));
    } catch (error) { res.status(500).json({ error: "Помилка завантаження інвентарю." }); }
});

// Універсальний обробник дій адміна
app.post('/api/admin/users/action', authenticate, checkAdmin, async (req, res) => {
    const { action, targetUid, payload } = req.body;
    try {
        let updatedUser;
        switch (action) {
            case 'ban':
                updatedUser = await prisma.user.update({ where: { uid: targetUid }, data: { isBanned: true, banReason: payload.reason, banUntil: payload.until } });
                break;
            case 'unban':
                updatedUser = await prisma.user.update({ where: { uid: targetUid }, data: { isBanned: false, banReason: null, banUntil: null } });
                break;
            case 'toggleAdmin':
                const userToToggle = await prisma.user.findUnique({ where: { uid: targetUid }});
                updatedUser = await prisma.user.update({ where: { uid: targetUid }, data: { isAdmin: !userToToggle.isAdmin } });
                break;
            case 'nickname':
                const exists = await prisma.user.findFirst({ where: { nickname: payload.nickname } });
                if (exists && exists.uid !== targetUid) return res.status(400).json({ error: "Нікнейм вже зайнятий!" });
                updatedUser = await prisma.user.update({ where: { uid: targetUid }, data: { nickname: payload.nickname } });
                break;
            case 'coins':
                updatedUser = await prisma.user.update({ where: { uid: targetUid }, data: { coins: payload.exact ? payload.amount : { increment: payload.amount } } });
                break;
            case 'farmLevel':
                updatedUser = await prisma.user.update({ where: { uid: targetUid }, data: { farmLevel: payload.level } });
                await prisma.farmState.deleteMany({ where: { userId: targetUid } }); // Скидаємо поточного боса
                break;
            case 'premium':
                if (payload.revoke) {
                    updatedUser = await prisma.user.update({ where: { uid: targetUid }, data: { isPremium: false, premiumUntil: null } });
                } else {
                    const u = await prisma.user.findUnique({ where: { uid: targetUid } });
                    let currentExp = new Date();
                    if (u.isPremium && u.premiumUntil && new Date(u.premiumUntil) > currentExp) currentExp = new Date(u.premiumUntil);
                    currentExp.setDate(currentExp.getDate() + payload.days);
                    updatedUser = await prisma.user.update({ where: { uid: targetUid }, data: { isPremium: true, premiumUntil: currentExp.toISOString() } });
                }
                break;
            case 'delete':
                await prisma.user.delete({ where: { uid: targetUid } });
                return res.json({ success: true, deleted: true });
            case 'giveCard':
                await prisma.$transaction([
                    prisma.inventoryItem.upsert({
                        where: { userId_cardId: { userId: targetUid, cardId: payload.cardId } },
                        update: { amount: { increment: payload.amount } },
                        create: { userId: targetUid, cardId: payload.cardId, amount: payload.amount }
                    }),
                    prisma.user.update({ where: { uid: targetUid }, data: { totalCards: { increment: payload.amount } } })
                ]);
                break;
            case 'removeCard':
                const invItem = await prisma.inventoryItem.findUnique({ where: { userId_cardId: { userId: targetUid, cardId: payload.cardId } } });
                if (invItem && invItem.amount <= payload.amount) {
                    await prisma.$transaction([
                        prisma.inventoryItem.delete({ where: { userId_cardId: { userId: targetUid, cardId: payload.cardId } } }),
                        prisma.user.update({ where: { uid: targetUid }, data: { totalCards: { decrement: invItem.amount } } })
                    ]);
                } else if (invItem) {
                    await prisma.$transaction([
                        prisma.inventoryItem.update({ where: { userId_cardId: { userId: targetUid, cardId: payload.cardId } }, data: { amount: { decrement: payload.amount } } }),
                        prisma.user.update({ where: { uid: targetUid }, data: { totalCards: { decrement: payload.amount } } })
                    ]);
                }
                break;
            default: return res.status(400).json({ error: "Невідома дія." });
        }
        res.json({ success: true, profile: updatedUser });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Помилка виконання дії на сервері." });
    }
});

// ----------------------------------------
// ОНОВЛЕННЯ АВАТАРА
// ----------------------------------------
app.post('/api/profile/update-avatar', authenticate, async (req, res) => {
  const { avatarUrl } = req.body;
  
  if (!avatarUrl) {
    return res.status(400).json({ error: "URL аватара не надано." });
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { uid: req.user.uid },
      data: { avatarUrl }
    });
    
    console.log(`Аватар оновлено для користувача: ${updatedUser.nickname}`);
    res.json({ success: true, profile: updatedUser });
  } catch (error) {
    console.error("Помилка при оновленні аватара:", error);
    res.status(500).json({ error: "Помилка оновлення аватара на сервері." });
  }
});

// Запуск сервера
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Бекенд успішно запущено на порту ${PORT}, Мій лорд.`);
});

// ----------------------------------------
// ІГРОВА МЕХАНІКА (ПРОДАЖ КАРТОК)
// ----------------------------------------
app.post('/api/game/sell-cards', authenticate, async (req, res) => {
  const { items } = req.body; // Очікуємо масив: [{ cardId: "c1", amount: 2 }, ...]

  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    if (!user) return res.status(404).json({ error: "Гравця не знайдено." });

    let totalEarned = 0;
    let totalCardsRemoved = 0;

    // Використовуємо транзакцію для безпечного оновлення
    await prisma.$transaction(async (tx) => {
       for (const item of items) {
           const card = await tx.cardCatalog.findUnique({ where: { id: item.cardId } });
           if (!card) continue;
           
           const price = card.sellPrice || 15;
           const earn = price * item.amount;
           
           // Перевіряємо, чи є в інвентарі достатньо карток
           const invItem = await tx.inventoryItem.findUnique({ 
               where: { userId_cardId: { userId: user.uid, cardId: item.cardId } }
           });
           
           if (invItem && invItem.amount >= item.amount) {
               if (invItem.amount === item.amount) {
                   await tx.inventoryItem.delete({ 
                       where: { userId_cardId: { userId: user.uid, cardId: item.cardId } }
                   });
               } else {
                   await tx.inventoryItem.update({
                       where: { userId_cardId: { userId: user.uid, cardId: item.cardId } },
                       data: { amount: { decrement: item.amount } }
                   });
               }
               totalEarned += earn;
               totalCardsRemoved += item.amount;
           }
       }
       
       if (totalCardsRemoved > 0) {
           await tx.user.update({
               where: { uid: user.uid },
               data: { 
                   coins: { increment: totalEarned },
                   totalCards: { decrement: totalCardsRemoved }
               }
           });
       }
    });

    const updatedUser = await prisma.user.findUnique({
        where: { uid: req.user.uid },
        include: { inventory: true }
    });

    res.json({ success: true, earned: totalEarned, profile: updatedUser });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Помилка продажу карток на сервері." });
  }
});