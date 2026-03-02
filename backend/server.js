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

// SSE Clients for real-time game status updates
let gameClients = [];

app.use(cors());
app.use(express.json());

// Мідлвар для перевірки прав адміністратора
const checkAdmin = async (req, res, next) => {
  if (!req.user || !req.user.uid) {
    return res.status(403).json({ error: "Доступ заборонено." });
  }
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    if (!user || (!user.isAdmin && !user.isSuperAdmin)) {
      return res.status(403).json({ error: "Доступ заборонено. Тільки для Адмінів." });
    }
    // Оновлюємо права в req.user для наступних мідлварів/роутів
    req.user.isAdmin = user.isAdmin;
    req.user.isSuperAdmin = user.isSuperAdmin;
    next();
  } catch (error) {
    console.error("Помилка перевірки прав:", error);
    return res.status(500).json({ error: "Помилка сервера при перевірці прав." });
  }
};


// ----------------------------------------
// ДОСЯГНЕННЯ (ACHIEVEMENTS)
// ----------------------------------------
const checkAndAwardCollectionAchievement = async (userId, packId) => {
  try {
    const achievement = await prisma.achievementSettings.findUnique({
      where: { packId: packId }
    });
    if (!achievement) return null;

    const existing = await prisma.userAchievement.findUnique({
      where: { userId_achievementId: { userId, achievementId: achievement.id } }
    });
    if (existing) return null;

    const totalCardsInPack = await prisma.cardCatalog.count({
      where: { packId: packId }
    });
    if (totalCardsInPack === 0) return null;

    const userCardsFromPack = await prisma.inventoryItem.count({
      where: {
        userId: userId,
        amount: { gt: 0 },
        card: { packId: packId }
      }
    });

    if (userCardsFromPack === totalCardsInPack) {
      const awarded = await prisma.userAchievement.create({
        data: {
          userId: userId,
          achievementId: achievement.id
        },
        include: { achievement: true }
      });
      return awarded;
    }
    return null;
  } catch (err) {
    console.error("Помилка видачі досягнення:", err);
    return null;
  }
};

app.get('/api/admin/achievements', authenticate, checkAdmin, async (req, res) => {
  try {
    const achievements = await prisma.achievementSettings.findMany();
    res.json(achievements);
  } catch (err) {
    res.status(500).json({ error: "Помилка завантаження ачівок." });
  }
});

app.post('/api/admin/achievements', authenticate, checkAdmin, async (req, res) => {
  try {
    const { id, name, description, iconUrl, packId } = req.body;
    let achievement;
    if (id) {
      achievement = await prisma.achievementSettings.update({
        where: { id },
        data: { name, description, iconUrl, packId }
      });
    } else {
      achievement = await prisma.achievementSettings.create({
        data: { name, description, iconUrl, packId }
      });
    }
    res.json(achievement);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка збереження ачівки. Можливо цей пак вже має ачівку?" });
  }
});

app.delete('/api/admin/achievements/:id', authenticate, checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.achievementSettings.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Помилка видалення ачівки." });
  }
});

// ----------------------------------------
// АВТОРИЗАЦІЯ ТА РЕЄСТРАЦІЯ
// ----------------------------------------

const checkAndUnbanUser = async (user) => {
  if (user && user.isBanned && user.banUntil && new Date() > new Date(user.banUntil)) {
    await prisma.user.update({
      where: { uid: user.uid },
      data: { isBanned: false, banReason: null, banUntil: null, bannedBy: null }
    });
    return { ...user, isBanned: false, banReason: null, banUntil: null, bannedBy: null };
  }
  return user;
};

app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

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
        data: { email, nickname, passwordHash, avatarUrl, coins: 200, lastIp: ip }
      });
    } else {
      user = await prisma.user.update({
        where: { uid: user.uid },
        data: {
          avatarUrl: (!user.avatarUrl && avatarUrl) ? avatarUrl : user.avatarUrl,
          lastIp: ip
        }
      });
    }

    // Перевірка на мультиаккаунт
    if (ip) {
      const otherAccounts = await prisma.user.findMany({
        where: { lastIp: ip, uid: { not: user.uid } },
        select: { nickname: true }
      });
      if (otherAccounts.length > 0) {
        const otherNicks = otherAccounts.map(a => a.nickname).join(', ');
        await prisma.adminLog.create({
          data: {
            type: "Система",
            details: `⚠️ Підозра на мультиакаунт! Гравець зайшов з IP ${ip}, який також використовують: ${otherNicks}`,
            userUid: user.uid,
            userNickname: user.nickname
          }
        });
      }
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
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { nickname }] }
    });

    if (existingUser) {
      return res.status(400).json({ error: "Користувач з таким email або нікнеймом вже існує." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { nickname, email, passwordHash, lastIp: ip }
    });

    // Перевірка на мультиаккаунт
    if (ip) {
      const otherAccounts = await prisma.user.findMany({
        where: { lastIp: ip, uid: { not: user.uid } },
        select: { nickname: true }
      });
      if (otherAccounts.length > 0) {
        const otherNicks = otherAccounts.map(a => a.nickname).join(', ');
        await prisma.adminLog.create({
          data: {
            type: "Система",
            details: `⚠️ Підозра на мультиакаунт! Новий гравець зареєструвався з IP ${ip}, який також використовують: ${otherNicks}`,
            userUid: user.uid,
            userNickname: user.nickname
          }
        });
      }
    }

    const token = jwt.sign({ uid: user.uid, isAdmin: user.isAdmin }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (error) {
    console.error("Помилка реєстрації:", error);
    res.status(500).json({ error: "Помилка сервера." });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: "Користувача не знайдено." });

    user = await checkAndUnbanUser(user);

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return res.status(401).json({ error: "Неправильний пароль." });

    // Оновлюємо IP при логіні
    if (user.lastIp !== ip) {
      user = await prisma.user.update({
        where: { uid: user.uid },
        data: { lastIp: ip }
      });
    }

    // Перевірка на мультиаккаунт
    if (ip) {
      const otherAccounts = await prisma.user.findMany({
        where: { lastIp: ip, uid: { not: user.uid } },
        select: { nickname: true }
      });
      if (otherAccounts.length > 0) {
        const otherNicks = otherAccounts.map(a => a.nickname).join(', ');
        await prisma.adminLog.create({
          data: {
            type: "Система",
            details: `⚠️ Підозра на мультиакаунт! Гравець зайшов з IP ${ip}, який також використовують: ${otherNicks}`,
            userUid: user.uid,
            userNickname: user.nickname
          }
        });
      }
    }

    const token = jwt.sign({ uid: user.uid, isAdmin: user.isAdmin }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (error) {
    console.error("Помилка логіну:", error);
    res.status(500).json({ error: "Помилка сервера." });
  }
});

// ----------------------------------------
// ПРОФІЛЬ ГРАВЦЯ
// ----------------------------------------

app.get('/api/profile/market-history', authenticate, async (req, res) => {
  try {
    const history = await prisma.marketListing.findMany({
      where: {
        status: 'sold',
        OR: [
          { sellerId: req.user.uid },
          { buyerId: req.user.uid }
        ]
      },
      include: { card: true, seller: { select: { nickname: true } } },
      orderBy: { soldAt: 'desc' },
      take: 30 // Показуємо останні 30 операцій
    });
    res.json(history);
  } catch (e) {
    res.status(500).json({ error: "Помилка завантаження історії ринку." });
  }
});

// Видалити ВЛАСНУ історію (Гравець)
app.delete('/api/profile/market-history', authenticate, async (req, res) => {
  try {
    await prisma.marketListing.deleteMany({
      where: { status: 'sold', OR: [{ sellerId: req.user.uid }, { buyerId: req.user.uid }] }
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Помилка." }); }
});

// Видалити історію КОНКРЕТНОГО ГРАВЦЯ (Адмін)
app.delete('/api/admin/users/:uid/market-history', authenticate, checkAdmin, async (req, res) => {
  try {
    await prisma.marketListing.deleteMany({
      where: { status: 'sold', OR: [{ sellerId: req.params.uid }, { buyerId: req.params.uid }] }
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Помилка." }); }
});

// Видалити ВСЮ ІСТОРІЮ РИНКУ всіх гравців (Адмін)
app.delete('/api/admin/market-history', authenticate, checkAdmin, async (req, res) => {
  try {
    await prisma.marketListing.deleteMany({ where: { status: 'sold' } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Помилка." }); }
});

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
    let user = await prisma.user.findUnique({
      where: { uid: req.user.uid },
      include: {
        inventory: true,
        showcases: true,
        _count: { select: { inventory: true } } // Рахуємо картки гравця
      }
    });

    if (!user) return res.status(404).json({ error: "Гравець не знайдений" });

    user = await checkAndUnbanUser(user);

    // Отримуємо ачівки користувача з деталями (назва, іконка з AchievementSettings)
    const userAchievements = await prisma.userAchievement.findMany({
      where: { userId: user.uid },
      include: { achievement: true },
      orderBy: { createdAt: 'desc' }
    });

    // Додаємо підрахунок до профілю, щоб фронтенд його побачив
    const formattedUser = {
      ...user,
      uniqueCardsCount: user._count.inventory,
      achievements: userAchievements
    };

    res.json(formattedUser);
  } catch (error) {
    res.status(500).json({ error: "Помилка завантаження профілю" });
  }
});

// Публічний профіль гравця (для рейтингу)
app.get('/api/profile/public/:uid', async (req, res) => {
  try {
    let user = await prisma.user.findUnique({
      where: { uid: req.params.uid },
      select: {
        uid: true, nickname: true, avatarUrl: true, coins: true,
        totalCards: true,
        packsOpened: true,
        coinsSpentOnPacks: true,
        coinsEarnedFromPacks: true,
        farmLevel: true, createdAt: true, isPremium: true, premiumUntil: true, mainShowcaseId: true, isBanned: true, banUntil: true, bannedBy: true, banReason: true, isAdmin: true, isSuperAdmin: true, inventory: true, showcases: true,
        _count: { select: { inventory: true } } // Динамічно рахуємо унікальні картки
      }
    });

    if (!user) return res.status(404).json({ error: "Гравця не знайдено." });

    user = await checkAndUnbanUser(user);

    const userAchievements = await prisma.userAchievement.findMany({
      where: { userId: user.uid },
      include: { achievement: true },
      orderBy: { createdAt: 'desc' }
    });

    // Форматуємо результат для фронтенду
    const formattedUser = {
      ...user,
      uniqueCardsCount: user._count.inventory,
      achievements: userAchievements
    };

    res.json(formattedUser);
  } catch (error) {
    res.status(500).json({ error: "Помилка завантаження профілю." });
  }
});

// ----------------------------------------
// ІГРОВІ ДАНІ ТА АДМІНКА (КАРТКИ ТА ПАКИ)
// ----------------------------------------



// Публічний роут для отримання всіх карток та паків
app.get('/api/catalog', async (req, res) => {
  try {
    const cards = await prisma.cardCatalog.findMany();
    const packs = await prisma.packCatalog.findMany();
    const achievements = await prisma.achievementSettings.findMany();
    res.json({ cards, packs, achievements });
  } catch (error) {
    res.status(500).json({ error: "Помилка завантаження каталогу." });
  }
});

// Додавання/Редагування картки
app.post('/api/admin/cards', authenticate, checkAdmin, async (req, res) => {
  try {
    const data = req.body;

    // Переконуємося, що frame передається правильно (fallback на "normal")
    const cardData = { ...data, frame: data.frame || "normal" };

    const existing = await prisma.cardCatalog.findUnique({ where: { id: cardData.id } });
    let card;
    if (existing) {
      card = await prisma.cardCatalog.update({ where: { id: cardData.id }, data: cardData });
    } else {
      card = await prisma.cardCatalog.create({ data: cardData });
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

    let availableCards = (await prisma.cardCatalog.findMany({ where: { packId: pack.id } }))
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

    // Локальне відстеження для запобігання перевищенню ліміту у межах однієї транзакції
    let localPulledCounts = {};
    availableCards.forEach(c => localPulledCounts[c.id] = c.pulledCount || 0);

    for (let i = 0; i < amount; i++) {
      if (availableCards.length === 0) break; // Якщо всі картки закінчились під час відкриття

      let totalWeight = 0;
      const activeWeights = [];

      for (const c of availableCards) {
        let w = 1;
        const globalRObj = DEFAULT_RARITIES.find(r => r.name === c.rarity);

        // Жорстка перевірка: використовуємо шанс картки, тільки якщо він більший за 0
        if (c.weight !== null && c.weight !== undefined && c.weight !== "" && Number(c.weight) > 0) {
          w = Number(c.weight);
        }
        else if (pack.customWeights && pack.customWeights[c.rarity] !== undefined && pack.customWeights[c.rarity] !== "") {
          w = Number(pack.customWeights[c.rarity]);
        }
        else if (globalRObj) {
          w = Number(globalRObj.weight);
        }

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
      localPulledCounts[newCard.id] += 1;
      totalEarnedCoins += (newCard.sellPrice || 15);

      // Якщо картка має ліміт і щойно досягла його - видаляємо її з пулу для наступних спроб
      if (newCard.maxSupply > 0 && localPulledCounts[newCard.id] >= newCard.maxSupply) {
        availableCards = availableCards.filter(c => c.id !== newCard.id);
      }
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

    // Перевірка ачівок для цього паку
    const newAchievement = await checkAndAwardCollectionAchievement(updatedUser.uid, pack.id);
    if (newAchievement) {
      // Додамо до відповіді інфу про отримання нової ачівки
      res.json({ pulledCards: results, profile: updatedUser, newAchievement });
    } else {
      res.json({ pulledCards: results, profile: updatedUser });
    }

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
      // Лот: статус змінено ТА ДОДАНО ПОКУПЦЯ
      await tx.marketListing.update({
        where: { id: listingId },
        data: { status: 'sold', soldAt: new Date(), buyerId: buyer.uid, buyerNickname: buyer.nickname }
      });
      // Сповіщення про продаж
      await tx.notification.create({
        data: {
          userId: listing.sellerId,
          type: 'sale',
          title: 'Картку продано на ринку!',
          message: `Ваш лот був куплений гравцем ${buyer.nickname} за ${listing.price} монет.`
        }
      });
    });

    const updatedUser = await prisma.user.findUnique({ where: { uid: req.user.uid }, include: { inventory: true } });

    // Перевірка ачівки для паку купленої картки
    const boughtCard = await prisma.cardCatalog.findUnique({ where: { id: listing.cardId } });
    let newAchievement = null;
    if (boughtCard && boughtCard.packId) {
      newAchievement = await checkAndAwardCollectionAchievement(updatedUser.uid, boughtCard.packId);
    }

    if (newAchievement) {
      res.json({ success: true, profile: updatedUser, newAchievement });
    } else {
      res.json({ success: true, profile: updatedUser });
    }
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
// МІНІ-ГРИ (2048 та Tetris)
// ----------------------------------------
app.post('/api/game/2048/start', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });

    // Оновлюємо дату гри
    const now = new Date();
    const updatedUser = await prisma.user.update({
      where: { uid: user.uid },
      data: {
        last2048PlayDate: now
      }
    });

    res.json({ success: true, profile: updatedUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Помилка сервера при старті гри." });
  }
});

app.post('/api/game/2048/claim', authenticate, async (req, res) => {
  const { score } = req.body;

  if (score < 100) return res.status(400).json({ error: "Занадто малий рахунок для обміну." });

  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });

    const now = new Date();
    let currentDailyFarm = user.dailyFarmAmount || 0;

    // Скидання денного фарму
    if (user.lastFarmDate) {
      const lastFarm = new Date(user.lastFarmDate);
      if (lastFarm.getUTCDate() !== now.getUTCDate() ||
        lastFarm.getUTCMonth() !== now.getUTCMonth() ||
        lastFarm.getUTCFullYear() !== now.getUTCFullYear()) {
        currentDailyFarm = 0;
      }
    }

    if (currentDailyFarm >= 500000) {
      return res.status(400).json({ error: "Досягнуто денний ліміт фарму (500,000 монет)!" });
    }

    // Курс: 1 поїнт рахунку = 1 монета
    let coinsToGive = score;

    // Обрізаємо нагороду, якщо вона перевищує залишок ліміту
    if (currentDailyFarm + coinsToGive > 500000) {
      coinsToGive = 500000 - currentDailyFarm;
    }

    const updatedUser = await prisma.user.update({
      where: { uid: req.user.uid },
      data: {
        coins: { increment: coinsToGive },
        dailyFarmAmount: currentDailyFarm + coinsToGive,
        lastFarmDate: now
      }
    });
    res.json({ success: true, earned: coinsToGive, profile: updatedUser });
  } catch (error) {
    res.status(500).json({ error: "Помилка нарахування монет за гру 2048." });
  }
});

app.post('/api/game/tetris/start', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });

    const now = new Date();
    const updatedUser = await prisma.user.update({
      where: { uid: user.uid },
      data: {
        lastTetrisPlayDate: now
      }
    });

    res.json({ success: true, profile: updatedUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Помилка сервера при старті гри Тетріс." });
  }
});

app.post('/api/game/tetris/claim', authenticate, async (req, res) => {
  const { score } = req.body;

  if (score < 50) return res.status(400).json({ error: "Занадто малий рахунок для обміну." });

  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });

    const now = new Date();
    let currentDailyFarm = user.dailyFarmAmount || 0;

    // Скидання денного фарму
    if (user.lastFarmDate) {
      const lastFarm = new Date(user.lastFarmDate);
      if (lastFarm.getUTCDate() !== now.getUTCDate() ||
        lastFarm.getUTCMonth() !== now.getUTCMonth() ||
        lastFarm.getUTCFullYear() !== now.getUTCFullYear()) {
        currentDailyFarm = 0;
      }
    }

    if (currentDailyFarm >= 500000) {
      return res.status(400).json({ error: "Досягнуто денний ліміт фарму (500,000 монет)!" });
    }

    // Курс: 1 поїнт рахунку = 6 монети (було 3)
    let coinsToGive = score * 6;

    if (currentDailyFarm + coinsToGive > 500000) {
      coinsToGive = 500000 - currentDailyFarm;
    }

    const updatedUser = await prisma.user.update({
      where: { uid: req.user.uid },
      data: {
        coins: { increment: coinsToGive },
        dailyFarmAmount: currentDailyFarm + coinsToGive,
        lastFarmDate: now
      }
    });
    res.json({ success: true, earned: coinsToGive, profile: updatedUser });
  } catch (error) {
    res.status(500).json({ error: "Помилка нарахування монет за Тетріс." });
  }
});


// ----------------------------------------
// GAME BLOCKED STATUS & SSE (Admin feature)
// ----------------------------------------

app.get('/api/games/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  res.write(`data: {"type": "CONNECTED"}\n\n`);

  gameClients.push(res);

  req.on('close', () => {
    gameClients = gameClients.filter(client => client !== res);
  });
});

app.get('/api/games/status', async (req, res) => {
  try {
    const settings = await prisma.gameSettings.findUnique({ where: { id: "main" } });
    const blockedGames = settings?.data?.blockedGames || [];
    res.json({ blockedGames });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Помилка завантаження статусів ігор." });
  }
});

app.post('/api/admin/games/toggle', authenticate, checkAdmin, async (req, res) => {
  const { game } = req.body;
  if (!game) return res.status(400).json({ error: "Не вказано гру." });

  try {
    let settings = await prisma.gameSettings.findUnique({ where: { id: "main" } });
    if (!settings) {
      settings = await prisma.gameSettings.create({
        data: { id: "main", data: { blockedGames: [] } }
      });
    }

    let blockedGames = settings.data?.blockedGames || [];

    let isBlocked = false;
    if (blockedGames.includes(game)) {
      blockedGames = blockedGames.filter(g => g !== game);
    } else {
      blockedGames.push(game);
      isBlocked = true;
    }

    await prisma.gameSettings.update({
      where: { id: "main" },
      data: { data: { ...settings.data, blockedGames } }
    });

    // Send SSE Event to all clients if the game was just blocked
    if (isBlocked) {
      const message = `data: ${JSON.stringify({ type: "GAME_BLOCKED", game })}\n\n`;
      gameClients.forEach(client => client.write(message));
    } else {
      const message = `data: ${JSON.stringify({ type: "GAME_UNBLOCKED", game })}\n\n`;
      gameClients.forEach(client => client.write(message));
    }

    res.json({ success: true, blockedGames });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Помилка зміни статусу гри." });
  }
});


// ----------------------------------------
// ФАРМ (БИТВИ З БОСАМИ ТА АНТИЧІТ)
// ----------------------------------------

// 5. Перевірка нових продажів (Фонове опитування)
app.get('/api/game/market/notifications', authenticate, async (req, res) => {
  const { lastCheck } = req.query;
  const serverTime = Date.now();

  try {
    let currentUser = await prisma.user.findUnique({
      where: { uid: req.user.uid },
      select: { uid: true, isBanned: true, banUntil: true, bannedBy: true, banReason: true }
    });

    currentUser = await checkAndUnbanUser(currentUser);

    if (currentUser?.isBanned) {
      return res.json({ isBanned: true, serverTime, profile: currentUser });
    }

    if (!lastCheck || lastCheck === 'null') {
      return res.json({ sales: [], serverTime, isBanned: false });
    }

    const checkDate = new Date(parseInt(lastCheck));

    const recentSales = await prisma.marketListing.findMany({
      where: {
        sellerId: req.user.uid,
        status: 'sold',
        soldAt: { gt: checkDate }
      },
      include: { card: true }
    });

    let updatedProfile = null;
    if (recentSales.length > 0) {
      updatedProfile = await prisma.user.findUnique({
        where: { uid: req.user.uid },
        include: { inventory: { include: { card: true } }, farmState: true, showcases: true }
      });
    }

    res.json({ sales: recentSales, profile: updatedProfile, serverTime });
  } catch (error) {
    res.status(500).json({ error: "Помилка перевірки сповіщень." });
  }
});

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

  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid }, include: { farmState: true } });
    let farm = user.farmState;

    const settings = await prisma.gameSettings.findUnique({ where: { id: "main" } });

    // Безпечний доступ до JSON поля
    let bosses = [];
    if (settings && settings.data && typeof settings.data === 'object' && Array.isArray(settings.data.bosses)) {
      bosses = settings.data.bosses;
    }

    const currentBoss = bosses.find(b => b.id === bossId);
    const dbMaxHp = currentBoss && currentBoss.maxHp ? Number(currentBoss.maxHp) : (maxHp || 1000);

    if (!farm) {
      farm = await prisma.farmState.create({ data: { userId: user.uid, bossId, currentHp: Math.max(0, dbMaxHp - damageDone), lastUpdated: new Date() } });
    } else if (farm.bossId !== bossId) {
      farm = await prisma.farmState.update({ where: { userId: user.uid }, data: { bossId, currentHp: Math.max(0, dbMaxHp - damageDone), cooldownUntil: null, lastUpdated: new Date() } });
    } else {
      if (farm.cooldownUntil && new Date(farm.cooldownUntil) > new Date()) {
        return res.status(400).json({ error: "Бос ще на кулдауні!" });
      }
      const currentHp = farm.currentHp ?? dbMaxHp;
      farm = await prisma.farmState.update({
        where: { userId: user.uid },
        data: { currentHp: Math.max(0, currentHp - damageDone), lastUpdated: new Date() }
      });
    }
    res.json({ success: true, farmState: farm });
  } catch (error) {
    console.error("Помилка синхронізації кліків:", error);
    res.status(500).json({ error: "Помилка синхронізації кліків." });
  }
});

// Забрати нагороду
app.post('/api/game/farm/claim', authenticate, async (req, res) => {
  const { bossId } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid }, include: { farmState: true } });
    const farm = user.farmState;

    if (!farm || farm.bossId !== bossId || farm.currentHp > 0) return res.status(400).json({ error: "Боса ще не переможено!" });
    if (farm.cooldownUntil && new Date(farm.cooldownUntil) > new Date()) return res.status(400).json({ error: "Нагороду вже забрано!" });

    // БЕЗПЕКА: Дістаємо дані про боса з БД замість того, щоб вірити клієнту (F12 bypass prevention)
    const settings = await prisma.gameSettings.findUnique({ where: { id: "main" } });
    let bosses = [];
    if (settings && settings.data && typeof settings.data === 'object' && Array.isArray(settings.data.bosses)) {
      bosses = settings.data.bosses;
    }
    const currentBoss = bosses.find(b => b.id === bossId);
    if (!currentBoss) return res.status(404).json({ error: "Боса не знайдено!" });

    const maxHp = Number(currentBoss.maxHp) || 1000;
    const damagePerClick = Number(currentBoss.damagePerClick) || 10;
    const rewardPerClick = Number(currentBoss.rewardPerClick) || 2;
    const killBonus = Number(currentBoss.killBonus) || 0;
    const cdHours = Number(currentBoss.cooldownHours) || 4;

    const maxHitsAllowed = Math.ceil(maxHp / damagePerClick);
    const calculatedReward = (maxHitsAllowed * rewardPerClick) + killBonus;

    // Визначаємо чи треба підвищити рівень (якщо вбитий бос - поточний за рівнем)
    const sortedBosses = [...bosses].sort((a, b) => a.level - b.level);
    const maxBossLevel = sortedBosses.length > 0 ? sortedBosses[sortedBosses.length - 1].level : 1;
    const isLevelUp = user.farmLevel < maxBossLevel && currentBoss.level === user.farmLevel;

    const cdUntil = new Date(Date.now() + cdHours * 60 * 60 * 1000);

    const now = new Date();
    let currentDailyFarm = user.dailyFarmAmount || 0;

    // Скидання денного фарму
    if (user.lastFarmDate) {
      const lastFarm = new Date(user.lastFarmDate);
      if (lastFarm.getUTCDate() !== now.getUTCDate() ||
        lastFarm.getUTCMonth() !== now.getUTCMonth() ||
        lastFarm.getUTCFullYear() !== now.getUTCFullYear()) {
        currentDailyFarm = 0;
      }
    }

    let actualReward = calculatedReward;

    if (currentDailyFarm >= 500000) {
      // Якщо ліміт вичерпано, гравець не отримує нових монет, але вбиває боса
      actualReward = 0;
    } else if (currentDailyFarm + actualReward > 500000) {
      actualReward = 500000 - currentDailyFarm;
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { uid: user.uid },
        data: {
          coins: { increment: actualReward },
          farmLevel: isLevelUp ? { increment: 1 } : undefined,
          dailyFarmAmount: currentDailyFarm + actualReward,
          lastFarmDate: now
        }
      });
      await tx.farmState.update({
        where: { userId: user.uid },
        data: { cooldownUntil: cdUntil, currentHp: maxHp }
      });
    });

    const updatedUser = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    res.json({ success: true, profile: updatedUser, cdUntil, reward: actualReward, isLevelUp });
  } catch (error) {
    console.error("Помилка отримання нагороди:", error);
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
        data: {
          id: "main", data: {
            bosses: [], dailyRewards: [1000, 2000, 3000, 4000, 5000, 6000, 7000],
            premiumDailyRewards: [2000, 4000, 6000, 8000, 10000, 12000, 15000],
            premiumPrice: 10000, premiumDurationDays: 30, premiumShopItems: []
          }
        }
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
        isAdmin: true,       // <-- ДОДАНО
        isSuperAdmin: true,  // <-- ДОДАНО
        isPremium: true,     // <-- ДОДАНО
        premiumUntil: true,  // <-- ДОДАНО
        lastIp: true,        // <-- ДОДАНО для адмінів
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
      isAdmin: user.isAdmin,             // <-- ДОДАНО
      isSuperAdmin: user.isSuperAdmin,   // <-- ДОДАНО
      isPremium: user.isPremium,         // <-- ДОДАНО
      premiumUntil: user.premiumUntil,   // <-- ДОДАНО
      lastIp: user.lastIp,               // <-- ДОДАНО
      uniqueCardsCount: user._count.inventory
    }));

    res.json(formattedUsers);
  } catch (error) {
    console.error("Помилка лідерборду:", error);
    res.status(500).json({ error: "Помилка завантаження рейтингу." });
  }
});

// ----------------------------------------
// ПРЕМІУМ ТА ВІТРИНИ (ПРОФІЛЬ)
// ----------------------------------------

// Створення вітрини
app.post('/api/profile/showcases', authenticate, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Введіть назву вітрини." });

  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid }, include: { showcases: true } });
    if (user.showcases.length >= 5 && !user.isSuperAdmin) {
      return res.status(400).json({ error: "Досягнуто ліміт вітрин (5 шт)." });
    }
    const showcase = await prisma.showcase.create({
      data: { name, cardIds: [], userId: req.user.uid }
    });
    res.json({ success: true, showcase });
  } catch (error) { res.status(500).json({ error: "Помилка створення вітрини." }); }
});

// Видалення вітрини
app.delete('/api/profile/showcases/:id', authenticate, async (req, res) => {
  try {
    const showcase = await prisma.showcase.findUnique({ where: { id: req.params.id } });
    if (!showcase || showcase.userId !== req.user.uid) return res.status(403).json({ error: "Доступ заборонено." });

    await prisma.showcase.delete({ where: { id: req.params.id } });

    // Якщо видалили головну вітрину - знімаємо її з профілю
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    if (user.mainShowcaseId === req.params.id) {
      await prisma.user.update({ where: { uid: req.user.uid }, data: { mainShowcaseId: null } });
    }
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: "Помилка видалення вітрини." }); }
});

// Збереження карток у вітрині
app.put('/api/profile/showcases/:id/cards', authenticate, async (req, res) => {
  const { cardIds } = req.body;
  try {
    const showcase = await prisma.showcase.findUnique({ where: { id: req.params.id } });
    if (!showcase || showcase.userId !== req.user.uid) return res.status(403).json({ error: "Доступ заборонено." });

    const updated = await prisma.showcase.update({
      where: { id: req.params.id },
      data: { cardIds }
    });
    res.json({ success: true, showcase: updated });
  } catch (error) { res.status(500).json({ error: "Помилка збереження карток." }); }
});

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
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' }, select: { uid: true, nickname: true, email: true, coins: true, totalCards: true, createdAt: true, isAdmin: true, isSuperAdmin: true, isBanned: true, banReason: true, banUntil: true, isPremium: true, premiumUntil: true, avatarUrl: true, mainShowcaseId: true, lastIp: true, autoSoundEnabled: true, farmLevel: true } });
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

    // Отримуємо адміна для запису в bannedBy
    const adminUser = await prisma.user.findUnique({ where: { uid: req.user.uid }, select: { nickname: true } });

    switch (action) {
      case 'ban':
        updatedUser = await prisma.user.update({ where: { uid: targetUid }, data: { isBanned: true, banReason: payload.reason, banUntil: payload.until, bannedBy: adminUser?.nickname || "Адміністратор" } });
        await prisma.notification.create({ data: { userId: targetUid, type: 'punishment', title: 'Бан акаунту', message: `Вас забанено адміністратором ${adminUser?.nickname || "Адміністратор"}. Причина: ${payload.reason}. Термін дії: ${payload.until ? new Date(payload.until).toLocaleString() : 'Назавжди'}` } });
        break;
      case 'unban':
        updatedUser = await prisma.user.update({ where: { uid: targetUid }, data: { isBanned: false, banReason: null, banUntil: null, bannedBy: null } });
        break;
      case 'toggleAdmin':
        const userToToggle = await prisma.user.findUnique({ where: { uid: targetUid } });
        updatedUser = await prisma.user.update({ where: { uid: targetUid }, data: { isAdmin: !userToToggle.isAdmin } });
        break;
      case 'nickname':
        const exists = await prisma.user.findFirst({ where: { nickname: payload.nickname } });
        if (exists && exists.uid !== targetUid) return res.status(400).json({ error: "Нікнейм вже зайнятий!" });
        updatedUser = await prisma.user.update({ where: { uid: targetUid }, data: { nickname: payload.nickname } });
        break;
      case 'coins':
        updatedUser = await prisma.user.update({ where: { uid: targetUid }, data: { coins: payload.exact ? payload.amount : { increment: payload.amount } } });
        await prisma.notification.create({ data: { userId: targetUid, type: 'admin_action', title: 'Зміна балансу', message: `Адміністратор змінив ваш баланс монет. ${payload.exact ? 'Новий баланс: ' + payload.amount : 'Різниця: ' + payload.amount}` } });
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
          prisma.user.update({ where: { uid: targetUid }, data: { totalCards: { increment: payload.amount } } }),
          prisma.notification.create({ data: { userId: targetUid, type: 'admin_action', title: 'Отримано картки', message: `Адміністратор видав вам картки (ID: ${payload.cardId}) у кількості ${payload.amount} шт.` } })
        ]);
        break;
      case 'removeCard':
        const invItem = await prisma.inventoryItem.findUnique({ where: { userId_cardId: { userId: targetUid, cardId: payload.cardId } } });
        if (invItem && invItem.amount <= payload.amount) {
          await prisma.$transaction([
            prisma.inventoryItem.delete({ where: { userId_cardId: { userId: targetUid, cardId: payload.cardId } } }),
            prisma.user.update({ where: { uid: targetUid }, data: { totalCards: { decrement: invItem.amount } } }),
            prisma.notification.create({ data: { userId: targetUid, type: 'admin_action', title: 'Вилучено картки', message: `Адміністратор вилучив у вас картки (ID: ${payload.cardId}) у кількості ${invItem.amount} шт.` } })
          ]);
        } else if (invItem) {
          await prisma.$transaction([
            prisma.inventoryItem.update({ where: { userId_cardId: { userId: targetUid, cardId: payload.cardId } }, data: { amount: { decrement: payload.amount } } }),
            prisma.user.update({ where: { uid: targetUid }, data: { totalCards: { decrement: payload.amount } } }),
            prisma.notification.create({ data: { userId: targetUid, type: 'admin_action', title: 'Вилучено картки', message: `Адміністратор вилучив у вас картки (ID: ${payload.cardId}) у кількості ${payload.amount} шт.` } })
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

// Зміна нікнейму (Преміум магазин)
app.post('/api/profile/change-nickname', authenticate, async (req, res) => {
  const { newNickname } = req.body;
  if (!newNickname) return res.status(400).json({ error: "Введіть нікнейм!" });
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    if (user.coins < 100000) return res.status(400).json({ error: "Недостатньо монет!" });

    const exists = await prisma.user.findFirst({ where: { nickname: newNickname } });
    if (exists) return res.status(400).json({ error: "Цей нікнейм вже зайнятий!" });

    const updated = await prisma.user.update({
      where: { uid: req.user.uid },
      data: { nickname: newNickname, coins: { decrement: 100000 } }
    });
    res.json({ success: true, profile: updated });
  } catch (e) { res.status(500).json({ error: "Помилка сервера." }); }
});

// Покупка преміум-товару
app.post('/api/game/premium-shop/buy', authenticate, async (req, res) => {
  const { item } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    if (!user.isPremium || new Date(user.premiumUntil) < new Date()) {
      return res.status(403).json({ error: "Тільки для Преміум гравців!" });
    }
    if (user.coins < item.price) return res.status(400).json({ error: "Недостатньо монет!" });

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { uid: user.uid },
        data: { coins: { decrement: item.price }, totalCards: { increment: 1 } }
      });
      if (item.type === 'card') {
        await tx.inventoryItem.upsert({
          where: { userId_cardId: { userId: user.uid, cardId: item.itemId } },
          update: { amount: { increment: 1 } },
          create: { userId: user.uid, cardId: item.itemId, amount: 1 }
        });
      }
    });

    const updatedUser = await prisma.user.findUnique({ where: { uid: req.user.uid }, include: { inventory: true } });
    res.json({ success: true, profile: updatedUser });
  } catch (e) { res.status(500).json({ error: "Помилка покупки." }); }
});

// Системні Логи Адмінки
app.post('/api/admin/logs', authenticate, async (req, res) => {
  const { type, details } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    await prisma.adminLog.create({
      data: { type, details, userUid: user.uid, userNickname: user.nickname }
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Помилка логування." }); }
});

app.get('/api/admin/logs', authenticate, checkAdmin, async (req, res) => {
  try {
    const logs = await prisma.adminLog.findMany({ orderBy: { timestamp: 'desc' }, take: 100 });
    res.json(logs);
  } catch (e) { res.status(500).json({ error: "Помилка отримання логів." }); }
});

app.delete('/api/admin/logs', authenticate, checkAdmin, async (req, res) => {
  try {
    await prisma.adminLog.deleteMany({});
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Помилка очищення логів." }); }
});

// ----------------------------------------
// СПОВІЩЕННЯ (NOTIFICATIONS)
// ----------------------------------------

app.get('/api/notifications', authenticate, async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.uid },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: "Помилка завантаження сповіщень." });
  }
});

app.put('/api/notifications/:id/read', authenticate, async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user.uid },
      data: { isRead: true }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Помилка оновлення сповіщення." });
  }
});

app.post('/api/notifications/:id/claim', authenticate, async (req, res) => {
  try {
    const notif = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!notif || notif.userId !== req.user.uid) return res.status(404).json({ error: "Сповіщення не знайдено." });
    if (notif.type !== 'gift' || notif.isClaimed) return res.status(400).json({ error: "Подарунок вже забрано або він відсутній." });

    await prisma.$transaction(async (tx) => {
      // Відмічаємо як забране
      await tx.notification.update({ where: { id: notif.id }, data: { isClaimed: true, isRead: true } });

      // Надаємо монети
      if (notif.attachedCoins > 0) {
        await tx.user.update({ where: { uid: req.user.uid }, data: { coins: { increment: notif.attachedCoins } } });
      }

      // Надаємо картки
      if (notif.attachedCardId && notif.attachedCardAmount > 0) {
        await tx.inventoryItem.upsert({
          where: { userId_cardId: { userId: req.user.uid, cardId: notif.attachedCardId } },
          update: { amount: { increment: notif.attachedCardAmount } },
          create: { userId: req.user.uid, cardId: notif.attachedCardId, amount: notif.attachedCardAmount }
        });
        await tx.user.update({ where: { uid: req.user.uid }, data: { totalCards: { increment: notif.attachedCardAmount } } });
      }
    });

    const updatedUser = await prisma.user.findUnique({ where: { uid: req.user.uid }, include: { inventory: true, showcases: true, farmState: true } });
    res.json({ success: true, profile: updatedUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка отримання подарунку." });
  }
});

app.post('/api/admin/notifications', authenticate, checkAdmin, async (req, res) => {
  const { targetUid, type, title, message, attachedCoins, attachedCardId, attachedCardAmount } = req.body;
  // type: 'update' (site update) or 'gift'
  // targetUid: 'ALL' or specific UID

  try {
    const dataObj = { type, title, message, attachedCoins: Number(attachedCoins) || 0, attachedCardId: attachedCardId || null, attachedCardAmount: Number(attachedCardAmount) || 0 };

    if (targetUid === 'ALL') {
      const users = await prisma.user.findMany({ select: { uid: true } });
      const notificationsData = users.map(u => ({ ...dataObj, userId: u.uid }));
      await prisma.notification.createMany({ data: notificationsData });
    } else {
      await prisma.notification.create({ data: { ...dataObj, userId: targetUid } });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Помилка надсилання сповіщень." });
  }
});

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

        if (card.maxSupply > 0) {
          throw new Error(`Лімітовану картку "${card.name}" можна продати тільки на ринку гравцям.`);
        }

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
    res.status(400).json({ error: error.message || "Помилка продажу карток." });
  }
});