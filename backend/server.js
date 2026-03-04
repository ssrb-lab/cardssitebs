const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const authenticate = require('./middleware/auth');

const prisma = new PrismaClient();
const app = express();

// Налаштування Multer для збереження аватарок
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads', 'avatars');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `avatar-${req.user?.uid || Date.now()}-${Date.now()}${ext}`);
  },
});

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Дозволені лише зображення'));
  },
});

// Налаштування Multer для збереження карток та паків
const cardsStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads', 'cards');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `item-${Date.now()}-${Math.round(Math.random() * 1000)}${ext}`);
  },
});

const uploadCard = multer({
  storage: cardsStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Дозволені лише зображення'));
  },
});

// SSE Clients for real-time game status updates
let gameClients = [];

app.use(cors());
app.use(express.json());

// Роздача статичних файлів (аватарки та картки)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

// Мідлвар для перевірки прав адміністратора
const checkAdmin = async (req, res, next) => {
  if (!req.user || !req.user.uid) {
    return res.status(403).json({ error: 'Доступ заборонено.' });
  }
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    if (!user || (!user.isAdmin && !user.isSuperAdmin)) {
      return res.status(403).json({ error: 'Доступ заборонено. Тільки для Адмінів.' });
    }
    // Оновлюємо права в req.user для наступних мідлварів/роутів
    req.user.isAdmin = user.isAdmin;
    req.user.isSuperAdmin = user.isSuperAdmin;
    next();
  } catch (error) {
    console.error('Помилка перевірки прав:', error);
    return res.status(500).json({ error: 'Помилка сервера при перевірці прав.' });
  }
};

// Мідлвар для перевірки прав тестера
const checkTester = async (req, res, next) => {
  if (!req.user || !req.user.uid) {
    return res.status(403).json({ error: 'Доступ заборонено.' });
  }
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    // Адміни також мають права тестера за замовчуванням
    if (!user || (!user.isTester && !user.isAdmin && !user.isSuperAdmin)) {
      return res.status(403).json({ error: 'Доступ заборонено. Тільки для Тестерів.' });
    }
    // Оновлюємо права в req.user для наступних мідлварів/роутів
    req.user.isTester = user.isTester;
    req.user.isAdmin = user.isAdmin;
    req.user.isSuperAdmin = user.isSuperAdmin;
    next();
  } catch (error) {
    console.error('Помилка перевірки прав тестера:', error);
    return res.status(500).json({ error: 'Помилка сервера при перевірці прав.' });
  }
};

// ----------------------------------------
// ДОСЯГНЕННЯ (ACHIEVEMENTS)
// ----------------------------------------
const checkAndAwardCollectionAchievement = async (userId, packId) => {
  try {
    const achievement = await prisma.achievementSettings.findUnique({
      where: { packId: packId },
    });
    if (!achievement) return null;

    const existing = await prisma.userAchievement.findUnique({
      where: { userId_achievementId: { userId, achievementId: achievement.id } },
    });
    if (existing) return null;

    const totalCardsInPack = await prisma.cardCatalog.count({
      where: { packId: packId },
    });
    if (totalCardsInPack === 0) return null;

    const userCardsFromPack = await prisma.inventoryItem.count({
      where: {
        userId: userId,
        amount: { gt: 0 },
        card: { packId: packId },
      },
    });

    if (userCardsFromPack === totalCardsInPack) {
      const awarded = await prisma.userAchievement.create({
        data: {
          userId: userId,
          achievementId: achievement.id,
        },
        include: { achievement: true },
      });
      return awarded;
    }
    return null;
  } catch (err) {
    console.error('Помилка видачі досягнення:', err);
    return null;
  }
};

app.get('/api/admin/achievements', authenticate, checkAdmin, async (req, res) => {
  try {
    const achievements = await prisma.achievementSettings.findMany();
    res.json(achievements);
  } catch (err) {
    res.status(500).json({ error: 'Помилка завантаження ачівок.' });
  }
});

app.post('/api/admin/achievements', authenticate, checkAdmin, async (req, res) => {
  try {
    const { id, name, description, iconUrl, packId } = req.body;
    let achievement;
    if (id) {
      achievement = await prisma.achievementSettings.update({
        where: { id },
        data: { name, description, iconUrl, packId },
      });
    } else {
      achievement = await prisma.achievementSettings.create({
        data: { name, description, iconUrl, packId },
      });
    }
    res.json(achievement);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Помилка збереження ачівки. Можливо цей пак вже має ачівку?' });
  }
});

app.delete('/api/admin/achievements/:id', authenticate, checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.achievementSettings.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Помилка видалення ачівки.' });
  }
});

function getPenaltyTime(baseTimeStr, count) {
  const parts = baseTimeStr.split(' ');
  const h = parseInt(parts[0]) || 0;
  const m = parseInt(parts[2]) || 0;
  const totalMins = Math.round((h * 60 + m) * Math.pow(1.5, count - 1));
  const newH = Math.floor(totalMins / 60);
  const newM = totalMins % 60;
  return `${newH} г ${newM} хв`;
}

// Хелпер: Очищення вітрин при зменшенні кількості карток
async function sanitizeShowcases(tx, userUid, cardId, newAmount) {
  const showcases = await tx.showcase.findMany({ where: { userId: userUid } });
  let totalInShowcases = 0;
  for (const s of showcases) {
    if (Array.isArray(s.cardIds)) {
      totalInShowcases += s.cardIds.filter((id) => id === cardId).length;
    }
  }

  if (totalInShowcases > newAmount) {
    let toRemove = totalInShowcases - newAmount;
    for (const s of showcases) {
      if (toRemove <= 0) break;
      if (Array.isArray(s.cardIds)) {
        let newCardIds = [...s.cardIds];
        while (newCardIds.includes(cardId) && toRemove > 0) {
          newCardIds.splice(newCardIds.lastIndexOf(cardId), 1);
          toRemove--;
        }
        if (newCardIds.length !== s.cardIds.length) {
          await tx.showcase.update({
            where: { id: s.id },
            data: { cardIds: newCardIds },
          });
        }
      }
    }
  }
}

// ----------------------------------------
// АВТОРИЗАЦІЯ ТА РЕЄСТРАЦІЯ
// ----------------------------------------

const checkAndUnbanUser = async (user) => {
  if (user && user.isBanned && user.banUntil && new Date() > new Date(user.banUntil)) {
    await prisma.user.update({
      where: { uid: user.uid },
      data: { isBanned: false, banReason: null, banUntil: null, bannedBy: null },
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
    let nickname = payload.name.replace(/\s+/g, '_') || 'Гравець';
    const avatarUrl = payload.picture || '';

    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      const existingNick = await prisma.user.findFirst({ where: { nickname } });
      if (existingNick) nickname = `${nickname}_${Math.floor(Math.random() * 10000)}`;

      const randomPassword = Math.random().toString(36).slice(-10);
      const passwordHash = await bcrypt.hash(randomPassword, 10);

      user = await prisma.user.create({
        data: { email, nickname, passwordHash, avatarUrl, coins: 200, lastIp: ip },
      });
    } else {
      user = await prisma.user.update({
        where: { uid: user.uid },
        data: {
          avatarUrl: !user.avatarUrl && avatarUrl ? avatarUrl : user.avatarUrl,
          lastIp: ip,
        },
      });
    }

    // Перевірка на мультиаккаунт
    if (ip) {
      const otherAccounts = await prisma.user.findMany({
        where: { lastIp: ip, uid: { not: user.uid } },
        select: { nickname: true },
      });
      if (otherAccounts.length > 0) {
        const otherNicks = otherAccounts.map((a) => a.nickname).join(', ');
        await prisma.adminLog.create({
          data: {
            type: 'Система',
            details: `⚠️ Підозра на мультиакаунт! Гравець зайшов з IP ${ip}, який також використовують: ${otherNicks}`,
            userUid: user.uid,
            userNickname: user.nickname,
          },
        });
      }
    }

    const token = jwt.sign({ uid: user.uid, isAdmin: user.isAdmin }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });
    res.json({ token, user });
  } catch (error) {
    console.error('Помилка Google Auth:', error);
    res.status(401).json({ error: 'Помилка авторизації через Google.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { nickname, email, password } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { nickname }] },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Користувач з таким email або нікнеймом вже існує.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { nickname, email, passwordHash, lastIp: ip },
    });

    // Перевірка на мультиаккаунт
    if (ip) {
      const otherAccounts = await prisma.user.findMany({
        where: { lastIp: ip, uid: { not: user.uid } },
        select: { nickname: true },
      });
      if (otherAccounts.length > 0) {
        const otherNicks = otherAccounts.map((a) => a.nickname).join(', ');
        await prisma.adminLog.create({
          data: {
            type: 'Система',
            details: `⚠️ Підозра на мультиакаунт! Новий гравець зареєструвався з IP ${ip}, який також використовують: ${otherNicks}`,
            userUid: user.uid,
            userNickname: user.nickname,
          },
        });
      }
    }

    const token = jwt.sign({ uid: user.uid, isAdmin: user.isAdmin }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });
    res.json({ token, user });
  } catch (error) {
    console.error('Помилка реєстрації:', error);
    res.status(500).json({ error: 'Помилка сервера.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'Користувача не знайдено.' });

    user = await checkAndUnbanUser(user);

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return res.status(401).json({ error: 'Неправильний пароль.' });

    // Оновлюємо IP при логіні
    if (user.lastIp !== ip) {
      user = await prisma.user.update({
        where: { uid: user.uid },
        data: { lastIp: ip },
      });
    }

    // Перевірка на мультиаккаунт
    if (ip) {
      const otherAccounts = await prisma.user.findMany({
        where: { lastIp: ip, uid: { not: user.uid } },
        select: { nickname: true },
      });
      if (otherAccounts.length > 0) {
        const otherNicks = otherAccounts.map((a) => a.nickname).join(', ');
        await prisma.adminLog.create({
          data: {
            type: 'Система',
            details: `⚠️ Підозра на мультиакаунт! Гравець зайшов з IP ${ip}, який також використовують: ${otherNicks}`,
            userUid: user.uid,
            userNickname: user.nickname,
          },
        });
      }
    }

    const token = jwt.sign({ uid: user.uid, isAdmin: user.isAdmin }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });
    res.json({ token, user });
  } catch (error) {
    console.error('Помилка логіну:', error);
    res.status(500).json({ error: 'Помилка сервера.' });
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
        OR: [{ sellerId: req.user.uid }, { buyerId: req.user.uid }],
      },
      include: { card: true, seller: { select: { nickname: true } } },
      orderBy: { soldAt: 'desc' },
      take: 30, // Показуємо останні 30 операцій
    });
    res.json(history);
  } catch (e) {
    res.status(500).json({ error: 'Помилка завантаження історії ринку.' });
  }
});

// Видалити ВЛАСНУ історію (Гравець)
app.delete('/api/profile/market-history', authenticate, async (req, res) => {
  try {
    await prisma.marketListing.deleteMany({
      where: { status: 'sold', OR: [{ sellerId: req.user.uid }, { buyerId: req.user.uid }] },
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Помилка.' });
  }
});

// Видалити історію КОНКРЕТНОГО ГРАВЦЯ (Адмін)
app.delete('/api/admin/users/:uid/market-history', authenticate, checkAdmin, async (req, res) => {
  try {
    await prisma.marketListing.deleteMany({
      where: { status: 'sold', OR: [{ sellerId: req.params.uid }, { buyerId: req.params.uid }] },
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Помилка.' });
  }
});

// Видалити ВСЮ ІСТОРІЮ РИНКУ всіх гравців (Адмін)
app.delete('/api/admin/market-history', authenticate, checkAdmin, async (req, res) => {
  try {
    await prisma.marketListing.deleteMany({ where: { status: 'sold' } });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Помилка.' });
  }
});

app.post('/api/profile/change-password', authenticate, async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Введіть всі поля.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    if (!user) return res.status(404).json({ error: 'Користувача не знайдено.' });

    // Перевірка старого пароля
    const isValid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isValid) return res.status(401).json({ error: 'Неправильний старий пароль.' });

    // Хешування та збереження нового пароля
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { uid: req.user.uid },
      data: { passwordHash: newPasswordHash },
    });

    res.json({ success: true, message: 'Пароль успішно змінено!' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Помилка сервера при зміні пароля.' });
  }
});

app.get('/api/profile', authenticate, async (req, res) => {
  try {
    let user = await prisma.user.findUnique({
      where: { uid: req.user.uid },
      include: {
        inventory: true,
        showcases: true,
        _count: { select: { inventory: true } }, // Рахуємо картки гравця
      },
    });

    if (!user) return res.status(404).json({ error: 'Гравець не знайдений' });

    user = await checkAndUnbanUser(user);

    // Passive Crystals Income Calculation
    const ownedPoints = await prisma.arenaPoint.findMany({
      where: { ownerId: user.uid }
    });

    let crystalsEarned = 0;
    const now = new Date();

    for (const point of ownedPoints) {
      if (point.crystalRatePerHour > 0 && point.crystalsLastClaimedAt) {
        // Calculate hours passed
        const msPassed = now.getTime() - new Date(point.crystalsLastClaimedAt).getTime();
        const hoursPassed = msPassed / (1000 * 60 * 60);

        // Calculate whole crystals earned
        const earnedFromThisPoint = Math.floor(hoursPassed * point.crystalRatePerHour);

        if (earnedFromThisPoint > 0) {
          crystalsEarned += earnedFromThisPoint;

          // Move the claimedAt forward by exactly the amount of hours we just claimed
          // This ensures fractional progress (e.g. 1.5 hours) isn't lost
          const newClaimTime = new Date(new Date(point.crystalsLastClaimedAt).getTime() + ((earnedFromThisPoint / point.crystalRatePerHour) * 1000 * 60 * 60));

          await prisma.arenaPoint.update({
            where: { id: point.id },
            data: { crystalsLastClaimedAt: newClaimTime }
          });
        }
      }
    }

    if (crystalsEarned > 0) {
      user = await prisma.user.update({
        where: { uid: user.uid },
        data: { crystals: { increment: crystalsEarned } },
        include: {
          inventory: true,
          showcases: true,
          _count: { select: { inventory: true } },
        }
      });
    }

    // Отримуємо ачівки користувача з деталями (назва, іконка з AchievementSettings)
    const userAchievements = await prisma.userAchievement.findMany({
      where: { userId: user.uid },
      include: { achievement: true },
      orderBy: { createdAt: 'desc' },
    });

    // Додаємо підрахунок до профілю, щоб фронтенд його побачив
    const formattedUser = {
      ...user,
      uniqueCardsCount: user._count.inventory,
      achievements: userAchievements,
    };

    res.json(formattedUser);
  } catch (error) {
    res.status(500).json({ error: 'Помилка завантаження профілю' });
  }
});

// Публічний профіль гравця (для рейтингу)
app.get('/api/profile/public/:uid', async (req, res) => {
  try {
    let user = await prisma.user.findUnique({
      where: { uid: req.params.uid },
      select: {
        uid: true,
        nickname: true,
        avatarUrl: true,
        coins: true,
        totalCards: true,
        packsOpened: true,
        coinsSpentOnPacks: true,
        coinsEarnedFromPacks: true,
        farmLevel: true,
        createdAt: true,
        isPremium: true,
        premiumUntil: true,
        mainShowcaseId: true,
        isBanned: true,
        banUntil: true,
        bannedBy: true,
        banReason: true,
        isAdmin: true,
        isSuperAdmin: true,
        inventory: true,
        showcases: true,
        _count: { select: { inventory: true } }, // Динамічно рахуємо унікальні картки
      },
    });

    if (!user) return res.status(404).json({ error: 'Гравця не знайдено.' });

    user = await checkAndUnbanUser(user);

    const userAchievements = await prisma.userAchievement.findMany({
      where: { userId: user.uid },
      include: { achievement: true },
      orderBy: { createdAt: 'desc' },
    });

    // Форматуємо результат для фронтенду
    const formattedUser = {
      ...user,
      uniqueCardsCount: user._count.inventory,
      achievements: userAchievements,
    };

    res.json(formattedUser);
  } catch (error) {
    res.status(500).json({ error: 'Помилка завантаження профілю.' });
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
    res.status(500).json({ error: 'Помилка завантаження каталогу.' });
  }
});

// Додавання/Редагування картки
app.post(
  '/api/admin/cards',
  authenticate,
  checkAdmin,
  uploadCard.single('imageFile'),
  async (req, res) => {
    try {
      let data;
      if (req.body.data) {
        data = JSON.parse(req.body.data);
      } else {
        data = req.body;
      }

      if (req.file) {
        data.image = `/api/uploads/cards/${req.file.filename}`;
      }

      // Переконуємося, що frame передається правильно (fallback на "normal")
      const cardData = { ...data, frame: data.frame || 'normal', isGame: Boolean(data.isGame) };

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
      res.status(500).json({ error: 'Помилка збереження картки.' });
    }
  }
);

// Видалення картки
app.delete('/api/admin/cards/:id', authenticate, checkAdmin, async (req, res) => {
  try {
    await prisma.cardCatalog.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Помилка видалення картки.' });
  }
});

// Додавання/Редагування паку
app.post(
  '/api/admin/packs',
  authenticate,
  checkAdmin,
  uploadCard.single('imageFile'),
  async (req, res) => {
    try {
      let data;
      if (req.body.data) {
        data = JSON.parse(req.body.data);
      } else {
        data = req.body;
      }

      if (req.file) {
        data.image = `/api/uploads/cards/${req.file.filename}`;
      }
      const packData = { ...data, isGame: Boolean(data.isGame) };
      const existing = await prisma.packCatalog.findUnique({ where: { id: packData.id } });
      let pack;
      if (existing) {
        pack = await prisma.packCatalog.update({ where: { id: packData.id }, data: packData });
      } else {
        pack = await prisma.packCatalog.create({ data: packData });
      }
      res.json(pack);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Помилка збереження паку.' });
    }
  }
);

// Видалення паку
app.delete('/api/admin/packs/:id', authenticate, checkAdmin, async (req, res) => {
  try {
    await prisma.packCatalog.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Помилка видалення паку.' });
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

    if (!pack) return res.status(404).json({ error: 'Пак не знайдено' });

    const totalCost = pack.cost * amount;
    if (user.coins < totalCost) return res.status(400).json({ error: 'Недостатньо монет!' });

    if (pack.isPremiumOnly && (!user.isPremium || new Date(user.premiumUntil) < new Date())) {
      return res.status(403).json({ error: 'Тільки для Преміум гравців!' });
    }

    let availableCards = (await prisma.cardCatalog.findMany({ where: { packId: pack.id } })).filter(
      (c) => c.maxSupply === 0 || c.pulledCount < c.maxSupply
    );

    if (availableCards.length === 0)
      return res.status(400).json({ error: 'У цьому паку закінчились картки.' });

    const DEFAULT_RARITIES = [
      { name: 'Звичайна', weight: 70 },
      { name: 'Рідкісна', weight: 25 },
      { name: 'Епічна', weight: 4 },
      { name: 'Легендарна', weight: 1 },
      { name: 'Унікальна', weight: 0.1 },
    ];

    let results = [];
    let countsMap = {};
    let totalEarnedCoins = 0;

    // Локальне відстеження для запобігання перевищенню ліміту у межах однієї транзакції
    let localPulledCounts = {};
    availableCards.forEach((c) => (localPulledCounts[c.id] = c.pulledCount || 0));

    const generatePower = (rarity) => {
      let min = 0,
        max = 0;
      switch (rarity) {
        case 'Унікальна':
          min = 100;
          max = 150;
          break;
        case 'Легендарна':
          min = 50;
          max = 125;
          break;
        case 'Епічна':
          min = 25;
          max = 100;
          break;
        case 'Рідкісна':
          min = 10;
          max = 80;
          break;
        case 'Звичайна':
          min = 5;
          max = 50;
          break;
        default:
          return null;
      }
      return Math.floor(Math.random() * (max - min + 1)) + min;
    };

    let cardStatsToAdd = {}; // { cardId: [power1, power2, ...] }

    for (let i = 0; i < amount; i++) {
      if (availableCards.length === 0) break; // Якщо всі картки закінчились під час відкриття

      let totalWeight = 0;
      const activeWeights = [];

      for (const c of availableCards) {
        let w = 1;
        const globalRObj = DEFAULT_RARITIES.find((r) => r.name === c.rarity);

        // Жорстка перевірка: використовуємо шанс картки, тільки якщо він більший за 0
        if (
          c.weight !== null &&
          c.weight !== undefined &&
          c.weight !== '' &&
          Number(c.weight) > 0
        ) {
          w = Number(c.weight);
        } else if (
          pack.customWeights &&
          pack.customWeights[c.rarity] !== undefined &&
          pack.customWeights[c.rarity] !== ''
        ) {
          w = Number(pack.customWeights[c.rarity]);
        } else if (globalRObj) {
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
        if (rand <= sum) {
          newCard = item.card;
          break;
        }
      }

      let generatedPower = null;
      if (pack.isGame || newCard.isGame) {
        generatedPower = generatePower(newCard.rarity);
      }

      results.push({ ...newCard, generatedPower });
      countsMap[newCard.id] = (countsMap[newCard.id] || 0) + 1;
      if (generatedPower !== null) {
        if (!cardStatsToAdd[newCard.id]) cardStatsToAdd[newCard.id] = [];
        cardStatsToAdd[newCard.id].push(generatedPower);
      }

      localPulledCounts[newCard.id] += 1;
      totalEarnedCoins += newCard.sellPrice || 15;

      // Якщо картка має ліміт і щойно досягла його - видаляємо її з пулу для наступних спроб
      if (newCard.maxSupply > 0 && localPulledCounts[newCard.id] >= newCard.maxSupply) {
        availableCards = availableCards.filter((c) => c.id !== newCard.id);
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
          coinsEarnedFromPacks: { increment: totalEarnedCoins },
        },
      });

      for (const [cardId, count] of Object.entries(countsMap)) {
        const existingInv = await tx.inventoryItem.findUnique({
          where: { userId_cardId: { userId: user.uid, cardId: cardId } },
        });

        let currentStats = [];
        if (existingInv && existingInv.gameStats) {
          currentStats =
            typeof existingInv.gameStats === 'string'
              ? JSON.parse(existingInv.gameStats)
              : existingInv.gameStats;
        }

        if (cardStatsToAdd[cardId]) {
          currentStats = [...currentStats, ...cardStatsToAdd[cardId]];
        }

        await tx.inventoryItem.upsert({
          where: { userId_cardId: { userId: user.uid, cardId: cardId } },
          update: { amount: { increment: count }, gameStats: currentStats },
          create: { userId: user.uid, cardId: cardId, amount: count, gameStats: currentStats },
        });
        await tx.cardCatalog.update({
          where: { id: cardId },
          data: { pulledCount: { increment: count } },
        });
      }
    });

    // Отримуємо оновлені дані гравця
    const updatedUser = await prisma.user.findUnique({
      where: { uid: req.user.uid },
      include: { inventory: true, farmState: true },
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
    res.status(500).json({ error: 'Помилка відкриття паку.' });
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
      orderBy: { createdAt: 'desc' },
    });
    // Форматуємо під старий формат фронтенду
    const formatted = listings.map((l) => ({
      id: l.id,
      cardId: l.cardId,
      price: l.price,
      status: l.status,
      createdAt: l.createdAt,
      sellerUid: l.sellerId,
      sellerNickname: l.seller.nickname,
      power: l.power,
    }));
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Помилка завантаження ринку.' });
  }
});

// 2. Виставити картку на продаж
app.post('/api/game/market/list', authenticate, async (req, res) => {
  const { cardId, price, power } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    const invItem = await prisma.inventoryItem.findUnique({
      where: { userId_cardId: { userId: user.uid, cardId } },
    });

    if (!invItem || invItem.amount < 1)
      return res.status(400).json({ error: 'У вас немає цієї картки!' });
    if (price < 1 || !Number.isInteger(price))
      return res.status(400).json({ error: 'Невірна ціна!' });

    await prisma.$transaction(async (tx) => {
      let statsArray = [];
      if (invItem.gameStats) {
        statsArray =
          typeof invItem.gameStats === 'string' ? JSON.parse(invItem.gameStats) : invItem.gameStats;
      }

      let removedPower = null;
      if (power !== undefined && power !== null) {
        const parsedPower = Number(power);
        const powerIndex = statsArray.findIndex((p) => Number(p) === parsedPower);
        if (powerIndex > -1) {
          removedPower = statsArray.splice(powerIndex, 1)[0];
        } else if (statsArray.length > 0) {
          // Fallback: power not found exactly (possible data mismatch), remove closest
          statsArray.sort(
            (a, b) => Math.abs(Number(a) - parsedPower) - Math.abs(Number(b) - parsedPower)
          );
          removedPower = statsArray.splice(0, 1)[0];
        } else {
          removedPower = parsedPower; // no stats tracked, just use provided value
        }
      } else if (statsArray.length > 0) {
        statsArray.sort((a, b) => Number(b) - Number(a)); // від найсильнішої до найслабшої
        removedPower = statsArray.splice(statsArray.length - 1, 1)[0]; // забираємо найслабшу
      }

      if (invItem.amount === 1) {
        await tx.inventoryItem.delete({ where: { userId_cardId: { userId: user.uid, cardId } } });
        await sanitizeShowcases(tx, user.uid, cardId, 0);
      } else {
        await tx.inventoryItem.update({
          where: { userId_cardId: { userId: user.uid, cardId } },
          data: { amount: { decrement: 1 }, gameStats: statsArray },
        });
        await sanitizeShowcases(tx, user.uid, cardId, invItem.amount - 1);
      }
      await tx.user.update({ where: { uid: user.uid }, data: { totalCards: { decrement: 1 } } });
      await tx.marketListing.create({
        data: {
          price: Number(price),
          sellerId: user.uid,
          cardId: cardId,
          status: 'active',
          power: removedPower,
        },
      });
    });

    const updatedUser = await prisma.user.findUnique({
      where: { uid: req.user.uid },
      include: { inventory: true },
    });
    res.json({ success: true, profile: updatedUser });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Помилка виставлення на ринок.' });
  }
});

// 3. Купити картку
app.post('/api/game/market/buy', authenticate, async (req, res) => {
  const { listingId } = req.body;
  try {
    const buyer = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    const listing = await prisma.marketListing.findUnique({ where: { id: listingId } });

    if (!listing || listing.status !== 'active')
      return res.status(400).json({ error: 'Лот вже продано або не існує.' });
    if (listing.sellerId === buyer.uid)
      return res.status(400).json({ error: 'Не можна купити свій лот!' });
    if (buyer.coins < listing.price) return res.status(400).json({ error: 'Недостатньо монет!' });

    await prisma.$transaction(async (tx) => {
      // Покупець: -монети, +картка, +totalCards
      await tx.user.update({
        where: { uid: buyer.uid },
        data: { coins: { decrement: listing.price }, totalCards: { increment: 1 } },
      });

      const buyerInv = await tx.inventoryItem.findUnique({
        where: { userId_cardId: { userId: buyer.uid, cardId: listing.cardId } },
      });
      let currentStats = [];
      if (buyerInv && buyerInv.gameStats) {
        currentStats =
          typeof buyerInv.gameStats === 'string'
            ? JSON.parse(buyerInv.gameStats)
            : buyerInv.gameStats;
      }

      if (listing.power !== null) {
        currentStats.push(listing.power);
      }

      await tx.inventoryItem.upsert({
        where: { userId_cardId: { userId: buyer.uid, cardId: listing.cardId } },
        update: { amount: { increment: 1 }, gameStats: currentStats },
        create: { userId: buyer.uid, cardId: listing.cardId, amount: 1, gameStats: currentStats },
      });
      // Продавець: +монети
      await tx.user.update({
        where: { uid: listing.sellerId },
        data: { coins: { increment: listing.price } },
      });
      // Лот: статус змінено ТА ДОДАНО ПОКУПЦЯ
      await tx.marketListing.update({
        where: { id: listingId },
        data: {
          status: 'sold',
          soldAt: new Date(),
          buyerId: buyer.uid,
          buyerNickname: buyer.nickname,
        },
      });
      // Сповіщення про продаж
      await tx.notification.create({
        data: {
          userId: listing.sellerId,
          type: 'sale',
          title: 'Картку продано на ринку!',
          message: `Ваш лот був куплений гравцем ${buyer.nickname} за ${listing.price} монет.`,
        },
      });
    });

    const updatedUser = await prisma.user.findUnique({
      where: { uid: req.user.uid },
      include: { inventory: true },
    });

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
    res.status(500).json({ error: 'Помилка покупки.' });
  }
});

// 4. Зняти лот з продажу
app.post('/api/game/market/cancel', authenticate, async (req, res) => {
  const { listingId } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    const listing = await prisma.marketListing.findUnique({ where: { id: listingId } });

    if (!listing || listing.status !== 'active')
      return res.status(400).json({ error: 'Лот не активний або не існує.' });
    if (listing.sellerId !== user.uid && !user.isAdmin)
      return res.status(403).json({ error: 'У вас немає прав зняти цей лот.' });

    await prisma.$transaction(async (tx) => {
      await tx.marketListing.delete({ where: { id: listingId } });
      await tx.user.update({
        where: { uid: listing.sellerId },
        data: { totalCards: { increment: 1 } },
      });

      const sellerInv = await tx.inventoryItem.findUnique({
        where: { userId_cardId: { userId: listing.sellerId, cardId: listing.cardId } },
      });
      let currentStats = [];
      if (sellerInv && sellerInv.gameStats) {
        currentStats =
          typeof sellerInv.gameStats === 'string'
            ? JSON.parse(sellerInv.gameStats)
            : sellerInv.gameStats;
      }

      if (listing.power !== null) {
        currentStats.push(listing.power);
      }

      await tx.inventoryItem.upsert({
        where: { userId_cardId: { userId: listing.sellerId, cardId: listing.cardId } },
        update: { amount: { increment: 1 }, gameStats: currentStats },
        create: {
          userId: listing.sellerId,
          cardId: listing.cardId,
          amount: 1,
          gameStats: currentStats,
        },
      });
    });

    const updatedUser = await prisma.user.findUnique({
      where: { uid: req.user.uid },
      include: { inventory: true },
    });
    res.json({ success: true, profile: updatedUser });
  } catch (error) {
    res.status(500).json({ error: 'Помилка скасування лоту.' });
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
        last2048PlayDate: now,
      },
    });

    res.json({ success: true, profile: updatedUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Помилка сервера при старті гри.' });
  }
});

app.post('/api/game/2048/claim', authenticate, async (req, res) => {
  const { score } = req.body;

  if (score < 100) return res.status(400).json({ error: 'Занадто малий рахунок для обміну.' });

  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });

    const now = new Date();
    let currentDailyFarm = user.dailyFarmAmount || 0;

    // Скидання денного фарму
    if (user.lastFarmDate) {
      const lastFarm = new Date(user.lastFarmDate);
      if (
        lastFarm.getUTCDate() !== now.getUTCDate() ||
        lastFarm.getUTCMonth() !== now.getUTCMonth() ||
        lastFarm.getUTCFullYear() !== now.getUTCFullYear()
      ) {
        currentDailyFarm = 0;
      }
    }

    if (currentDailyFarm >= 500000) {
      return res.status(400).json({ error: 'Досягнуто денний ліміт фарму (500,000 монет)!' });
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
        lastFarmDate: now,
      },
    });
    res.json({ success: true, earned: coinsToGive, profile: updatedUser });
  } catch (error) {
    res.status(500).json({ error: 'Помилка нарахування монет за гру 2048.' });
  }
});

app.post('/api/game/tetris/start', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });

    const now = new Date();
    const updatedUser = await prisma.user.update({
      where: { uid: user.uid },
      data: {
        lastTetrisPlayDate: now,
      },
    });

    res.json({ success: true, profile: updatedUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Помилка сервера при старті гри Тетріс.' });
  }
});

app.post('/api/game/tetris/claim', authenticate, async (req, res) => {
  const { score } = req.body;

  if (score < 50) return res.status(400).json({ error: 'Занадто малий рахунок для обміну.' });

  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });

    const now = new Date();
    let currentDailyFarm = user.dailyFarmAmount || 0;

    // Скидання денного фарму
    if (user.lastFarmDate) {
      const lastFarm = new Date(user.lastFarmDate);
      if (
        lastFarm.getUTCDate() !== now.getUTCDate() ||
        lastFarm.getUTCMonth() !== now.getUTCMonth() ||
        lastFarm.getUTCFullYear() !== now.getUTCFullYear()
      ) {
        currentDailyFarm = 0;
      }
    }

    if (currentDailyFarm >= 500000) {
      return res.status(400).json({ error: 'Досягнуто денний ліміт фарму (500,000 монет)!' });
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
        lastFarmDate: now,
      },
    });
    res.json({ success: true, earned: coinsToGive, profile: updatedUser });
  } catch (error) {
    res.status(500).json({ error: 'Помилка нарахування монет за Тетріс.' });
  }
});

app.post('/api/game/fuse/start', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });

    const now = new Date();
    const updatedUser = await prisma.user.update({
      where: { uid: user.uid },
      data: {
        lastFusePlayDate: now,
      },
    });

    res.json({ success: true, profile: updatedUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Помилка сервера при старті гри Fuse Repair.' });
  }
});

app.post('/api/game/fuse/claim', authenticate, async (req, res) => {
  const { score } = req.body;

  if (score < 1) return res.status(400).json({ error: 'Занадто малий рахунок для обміну.' });

  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });

    const now = new Date();
    let currentDailyFarm = user.dailyFarmAmount || 0;

    // Скидання денного фарму
    if (user.lastFarmDate) {
      const lastFarm = new Date(user.lastFarmDate);
      if (
        lastFarm.getUTCDate() !== now.getUTCDate() ||
        lastFarm.getUTCMonth() !== now.getUTCMonth() ||
        lastFarm.getUTCFullYear() !== now.getUTCFullYear()
      ) {
        currentDailyFarm = 0;
      }
    }

    if (currentDailyFarm >= 500000) {
      return res.status(400).json({ error: 'Досягнуто денний ліміт фарму (500,000 монет)!' });
    }

    const newPoints = (user.fuseRepairedPoints || 0) + score;
    let newLevel = 1;
    if (newPoints >= 30000) newLevel = 5;
    else if (newPoints >= 15000) newLevel = 4;
    else if (newPoints >= 5000) newLevel = 3;
    else if (newPoints >= 2000) newLevel = 2;

    const payoutPerScore =
      newLevel === 1
        ? 86
        : newLevel === 2
          ? 172
          : newLevel === 3
            ? 230
            : newLevel === 4
              ? 431
              : 402;

    let coinsToGive = Math.floor(score * payoutPerScore * (1 + Math.floor(score / 5) * 0.1));

    if (currentDailyFarm + coinsToGive > 500000) {
      coinsToGive = 500000 - currentDailyFarm;
    }

    const updatedUser = await prisma.user.update({
      where: { uid: req.user.uid },
      data: {
        coins: { increment: coinsToGive },
        dailyFarmAmount: currentDailyFarm + coinsToGive,
        lastFarmDate: now,
        fuseRepairedPoints: newPoints,
        fuseLevel: newLevel,
      },
    });
    res.json({ success: true, earned: coinsToGive, profile: updatedUser });
  } catch (error) {
    res.status(500).json({ error: 'Помилка нарахування монет за Fuse Repair.' });
  }
});

// ----------------------------------------
// BLACKJACK
// ----------------------------------------
app.post('/api/game/blackjack/start', authenticate, async (req, res) => {
  const { betAmount } = req.body;

  const parsedBet = parseInt(betAmount, 10);
  if (isNaN(parsedBet) || parsedBet < 10)
    return res.status(400).json({ error: 'Мінімальна ставка 10 монет.' });

  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    if (user.coins < parsedBet) return res.status(400).json({ error: 'Недостатньо монет!' });

    const updatedUser = await prisma.user.update({
      where: { uid: user.uid },
      data: { coins: { decrement: parsedBet } },
    });

    res.json({ success: true, profile: updatedUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Помилка сервера.' });
  }
});

app.post('/api/game/blackjack/claim', authenticate, async (req, res) => {
  const { result, betAmount } = req.body;

  const parsedBet = parseInt(betAmount, 10);
  if (isNaN(parsedBet) || parsedBet < 10)
    return res.status(400).json({ error: 'Неправильна ставка.' });

  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });

    let coinsToGive = 0;
    if (result === 'win') coinsToGive = parsedBet * 2;
    if (result === 'blackjack') coinsToGive = Math.floor(parsedBet * 2.5);
    if (result === 'push') coinsToGive = Math.floor(parsedBet);

    if (coinsToGive > 0) {
      const updatedUser = await prisma.user.update({
        where: { uid: req.user.uid },
        data: { coins: { increment: coinsToGive } },
      });
      res.json({ success: true, earned: coinsToGive, profile: updatedUser });
    } else {
      res.json({ success: true, earned: 0, profile: user });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Помилка сервера.' });
  }
});

// ----------------------------------------
// GAME BLOCKED STATUS & SSE (Admin feature) & ARENA
// ----------------------------------------

app.get('/api/game/arena/points', authenticate, async (req, res) => {
  try {
    const points = await prisma.arenaPoint.findMany();
    res.json(points);
  } catch (error) {
    res.status(500).json({ error: 'Помилка завантаження точок Арени.' });
  }
});

app.post('/api/admin/arena/points', authenticate, checkAdmin, async (req, res) => {
  const { x, y, name, icon, color, entryFee, cooldownMinutes, crystalRatePerHour } = req.body;
  try {
    const newPoint = await prisma.arenaPoint.create({
      data: {
        x: Number(x),
        y: Number(y),
        name: name || 'Точка Арени',
        icon: icon || 'castle',
        color: color || '#4f46e5',
        entryFee: entryFee ? Number(entryFee) : 0,
        cooldownMinutes: cooldownMinutes ? Number(cooldownMinutes) : 15,
        crystalRatePerHour: crystalRatePerHour ? Number(crystalRatePerHour) : 0,
      },
    });
    res.json({ success: true, point: newPoint });
  } catch (error) {
    res.status(500).json({ error: 'Помилка створення точки.' });
  }
});

app.delete('/api/admin/arena/points/:id', authenticate, checkAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.arenaPoint.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Помилка видалення точки.' });
  }
});

app.post('/api/game/arena/points/:id/capture', authenticate, async (req, res) => {
  const { id } = req.params;
  const { cards } = req.body; // Expect an array of exactly 5 cards

  if (!Array.isArray(cards) || cards.length !== 5) {
    return res.status(400).json({ error: 'Для захоплення точки необхідно обрати рівно 5 карт!' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { uid: req.user.uid },
      include: { inventory: true }
    });
    const point = await prisma.arenaPoint.findUnique({ where: { id } });

    if (!point) return res.status(404).json({ error: 'Точку не знайдено.' });

    // Validate that the user actually owns these 5 specific card instances
    let userHasAllCards = true;

    // Group required cards by ID to count power occurrences
    const requiredCardsCounts = {};
    for (let c of cards) {
      if (!requiredCardsCounts[c.id]) requiredCardsCounts[c.id] = {};
      const p = c.power;
      requiredCardsCounts[c.id][p] = (requiredCardsCounts[c.id][p] || 0) + 1;
    }

    for (const cardId in requiredCardsCounts) {
      const invItem = user.inventory.find(item => item.cardId === cardId);
      if (!invItem) {
        userHasAllCards = false;
        break;
      }

      let currentStats = [];
      if (typeof invItem.gameStats === 'string') {
        try { currentStats = JSON.parse(invItem.gameStats); } catch (e) { }
      } else if (Array.isArray(invItem.gameStats)) {
        currentStats = invItem.gameStats;
      }

      const availablePowers = {};
      for (let p of currentStats) {
        availablePowers[p] = (availablePowers[p] || 0) + 1;
      }

      for (const powerRaw in requiredCardsCounts[cardId]) {
        const requiredCount = requiredCardsCounts[cardId][powerRaw];
        let countAvailable = availablePowers[powerRaw] || 0;
        if (!countAvailable) {
          countAvailable = availablePowers[Number(powerRaw)] || 0;
        }

        if (countAvailable < requiredCount) {
          const assignedCount = currentStats.length;
          const totalAmount = invItem.amount;
          const unassignedCount = Math.max(0, totalAmount - assignedCount);

          if (unassignedCount >= requiredCount) {
            // Valid fallback
          } else {
            userHasAllCards = false;
            break;
          }
        }
      }
    }

    if (!userHasAllCards) {
      return res.status(400).json({ error: 'Ви не маєте обраних карт у своєму інвентарі!' });
    }

    if (!point.ownerId) {
      // Точка пуста, перший гравець може її захопити
      if (user.coins < point.entryFee) {
        return res.status(400).json({ error: 'Недостатньо монет для захоплення цієї точки.' });
      }

      await prisma.$transaction(async (tx) => {
        // Знімаємо монети
        await tx.user.update({
          where: { uid: user.uid },
          data: { coins: { decrement: point.entryFee } },
        });

        // Записуємо власника, час та карти (починаємо відлік кристалів з цієї хвилини)
        await tx.arenaPoint.update({
          where: { id },
          data: {
            ownerId: user.uid,
            ownerNickname: user.nickname,
            capturedAt: new Date(),
            crystalsLastClaimedAt: new Date(),
            defendingCards: cards // JSON object
          },
        });
      });

      const updatedUser = await prisma.user.findUnique({ where: { uid: user.uid } });
      const updatedPoint = await prisma.arenaPoint.findUnique({ where: { id } });

      return res.json({ success: true, message: 'Точка Успішно захоплена', profile: updatedUser, point: updatedPoint });
    } else {
      // Точка вже має власника
      const capturedTime = new Date(point.capturedAt).getTime();
      const cdMs = point.cooldownMinutes * 60 * 1000;
      const cdUntil = capturedTime + cdMs;

      if (Date.now() < cdUntil) {
        return res.status(400).json({ error: 'Точка ще під захистом (Кулдаун).' });
      }

      return res.status(400).json({ error: 'Механіка битви ще в розробці. Слідкуйте за оновленнями!' });
    }
  } catch (error) {
    console.error('Помилка захоплення точки:', error);
    res.status(500).json({ error: 'Помилка захоплення точки.' });
  }
});

app.get('/api/games/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  res.write(`data: {"type": "CONNECTED"}\n\n`);

  gameClients.push(res);

  req.on('close', () => {
    gameClients = gameClients.filter((client) => client !== res);
  });
});

app.get('/api/games/status', async (req, res) => {
  try {
    const settings = await prisma.gameSettings.findUnique({ where: { id: 'main' } });
    const blockedGames = settings?.data?.blockedGames || [];
    res.json({ blockedGames });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Помилка завантаження статусів ігор.' });
  }
});

app.post('/api/admin/games/toggle', authenticate, checkAdmin, async (req, res) => {
  const { game } = req.body;
  if (!game) return res.status(400).json({ error: 'Не вказано гру.' });

  try {
    let settings = await prisma.gameSettings.findUnique({ where: { id: 'main' } });
    if (!settings) {
      settings = await prisma.gameSettings.create({
        data: { id: 'main', data: { blockedGames: [] } },
      });
    }

    let blockedGames = settings.data?.blockedGames || [];

    let isBlocked = false;
    if (blockedGames.includes(game)) {
      blockedGames = blockedGames.filter((g) => g !== game);
    } else {
      blockedGames.push(game);
      isBlocked = true;
    }

    await prisma.gameSettings.update({
      where: { id: 'main' },
      data: { data: { ...settings.data, blockedGames } },
    });

    // Send SSE Event to all clients if the game was just blocked
    if (isBlocked) {
      const message = `data: ${JSON.stringify({ type: 'GAME_BLOCKED', game })}\n\n`;
      gameClients.forEach((client) => client.write(message));
    } else {
      const message = `data: ${JSON.stringify({ type: 'GAME_UNBLOCKED', game })}\n\n`;
      gameClients.forEach((client) => client.write(message));
    }

    res.json({ success: true, blockedGames });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Помилка зміни статусу гри.' });
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
      select: { uid: true, isBanned: true, banUntil: true, bannedBy: true, banReason: true },
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
        soldAt: { gt: checkDate },
      },
      include: { card: true },
    });

    let updatedProfile = null;
    if (recentSales.length > 0) {
      updatedProfile = await prisma.user.findUnique({
        where: { uid: req.user.uid },
        include: { inventory: { include: { card: true } }, farmState: true, showcases: true },
      });
    }

    res.json({ sales: recentSales, profile: updatedProfile, serverTime });
  } catch (error) {
    res.status(500).json({ error: 'Помилка перевірки сповіщень.' });
  }
});

// Отримання стану боса для гравця
app.get('/api/game/farm/state', authenticate, async (req, res) => {
  try {
    const farm = await prisma.farmState.findUnique({ where: { userId: req.user.uid } });
    res.json(farm || {});
  } catch (error) {
    res.status(500).json({ error: 'Помилка завантаження фарму.' });
  }
});

// Синхронізація кліків (Античіт)
app.post('/api/game/farm/sync', authenticate, async (req, res) => {
  const { bossId, damageDone, maxHp } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { uid: req.user.uid },
      include: { farmState: true },
    });
    let farm = user.farmState;

    const settings = await prisma.gameSettings.findUnique({ where: { id: 'main' } });

    // Безпечний доступ до JSON поля
    let bosses = [];
    if (
      settings &&
      settings.data &&
      typeof settings.data === 'object' &&
      Array.isArray(settings.data.bosses)
    ) {
      bosses = settings.data.bosses;
    }

    const currentBoss = bosses.find((b) => b.id === bossId);
    const dbMaxHp = currentBoss && currentBoss.maxHp ? Number(currentBoss.maxHp) : maxHp || 1000;

    if (!farm) {
      farm = await prisma.farmState.create({
        data: {
          userId: user.uid,
          bossId,
          currentHp: Math.max(0, dbMaxHp - damageDone),
          lastUpdated: new Date(),
        },
      });
    } else if (farm.bossId !== bossId) {
      farm = await prisma.farmState.update({
        where: { userId: user.uid },
        data: {
          bossId,
          currentHp: Math.max(0, dbMaxHp - damageDone),
          cooldownUntil: null,
          lastUpdated: new Date(),
        },
      });
    } else {
      if (farm.cooldownUntil && new Date(farm.cooldownUntil) > new Date()) {
        return res.status(400).json({ error: 'Бос ще на кулдауні!' });
      }
      const currentHp = farm.currentHp ?? dbMaxHp;
      farm = await prisma.farmState.update({
        where: { userId: user.uid },
        data: { currentHp: Math.max(0, currentHp - damageDone), lastUpdated: new Date() },
      });
    }
    res.json({ success: true, farmState: farm });
  } catch (error) {
    console.error('Помилка синхронізації кліків:', error);
    res.status(500).json({ error: 'Помилка синхронізації кліків.' });
  }
});

// Забрати нагороду
app.post('/api/game/farm/claim', authenticate, async (req, res) => {
  const { bossId } = req.body;
  try {
    const user = await prisma.user.findUnique({
      where: { uid: req.user.uid },
      include: { farmState: true },
    });
    const farm = user.farmState;

    if (!farm || farm.bossId !== bossId || farm.currentHp > 0)
      return res.status(400).json({ error: 'Боса ще не переможено!' });
    if (farm.cooldownUntil && new Date(farm.cooldownUntil) > new Date())
      return res.status(400).json({ error: 'Нагороду вже забрано!' });

    // БЕЗПЕКА: Дістаємо дані про боса з БД замість того, щоб вірити клієнту (F12 bypass prevention)
    const settings = await prisma.gameSettings.findUnique({ where: { id: 'main' } });
    let bosses = [];
    if (
      settings &&
      settings.data &&
      typeof settings.data === 'object' &&
      Array.isArray(settings.data.bosses)
    ) {
      bosses = settings.data.bosses;
    }
    const currentBoss = bosses.find((b) => b.id === bossId);
    if (!currentBoss) return res.status(404).json({ error: 'Боса не знайдено!' });

    const maxHp = Number(currentBoss.maxHp) || 1000;
    const damagePerClick = Number(currentBoss.damagePerClick) || 10;
    const rewardPerClick = Number(currentBoss.rewardPerClick) || 2;
    const killBonus = Number(currentBoss.killBonus) || 0;
    const cdHours = Number(currentBoss.cooldownHours) || 4;

    const maxHitsAllowed = Math.ceil(maxHp / damagePerClick);
    const calculatedReward = maxHitsAllowed * rewardPerClick + killBonus;

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
      if (
        lastFarm.getUTCDate() !== now.getUTCDate() ||
        lastFarm.getUTCMonth() !== now.getUTCMonth() ||
        lastFarm.getUTCFullYear() !== now.getUTCFullYear()
      ) {
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
          lastFarmDate: now,
        },
      });
      await tx.farmState.update({
        where: { userId: user.uid },
        data: { cooldownUntil: cdUntil, currentHp: maxHp },
      });
    });

    const updatedUser = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    res.json({ success: true, profile: updatedUser, cdUntil, reward: actualReward, isLevelUp });
  } catch (error) {
    console.error('Помилка отримання нагороди:', error);
    res.status(500).json({ error: 'Помилка отримання нагороди.' });
  }
});

// Скинути КД (Для Адміна)
app.post('/api/admin/farm/reset-cd', authenticate, checkAdmin, async (req, res) => {
  const { targetUid, maxHp } = req.body;
  try {
    await prisma.farmState.upsert({
      where: { userId: targetUid },
      update: { cooldownUntil: null, currentHp: maxHp },
      create: { userId: targetUid, currentHp: maxHp, cooldownUntil: null },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Помилка скидання кулдауну.' });
  }
});

// ----------------------------------------
// НАЛАШТУВАННЯ ТА ПРОМОКОДИ
// ----------------------------------------

// --- Налаштування ---
app.get('/api/game/settings', async (req, res) => {
  try {
    let settings = await prisma.gameSettings.findUnique({ where: { id: 'main' } });
    if (!settings) {
      settings = await prisma.gameSettings.create({
        data: {
          id: 'main',
          data: {
            bosses: [],
            dailyRewards: [1000, 2000, 3000, 4000, 5000, 6000, 7000],
            premiumDailyRewards: [2000, 4000, 6000, 8000, 10000, 12000, 15000],
            premiumPrice: 10000,
            premiumDurationDays: 30,
            premiumShopItems: [],
          },
        },
      });
    }
    res.json(settings.data);
  } catch (error) {
    res.status(500).json({ error: 'Помилка завантаження налаштувань.' });
  }
});

app.post('/api/admin/settings', authenticate, checkAdmin, async (req, res) => {
  try {
    const settings = await prisma.gameSettings.upsert({
      where: { id: 'main' },
      update: { data: req.body },
      create: { id: 'main', data: req.body },
    });
    res.json({ success: true, data: settings.data });
  } catch (error) {
    res.status(500).json({ error: 'Помилка збереження налаштувань.' });
  }
});

// --- Промокоди ---
app.get('/api/admin/promos', authenticate, checkAdmin, async (req, res) => {
  try {
    const promos = await prisma.promoCode.findMany();
    res.json(promos);
  } catch (e) {
    res.status(500).json({ error: 'Помилка завантаження промокодів.' });
  }
});

app.post('/api/admin/promos', authenticate, checkAdmin, async (req, res) => {
  try {
    const { code, reward, maxGlobalUses, maxUserUses } = req.body;
    const promo = await prisma.promoCode.upsert({
      where: { code },
      update: {
        reward: Number(reward),
        maxGlobalUses: Number(maxGlobalUses),
        maxUserUses: Number(maxUserUses),
      },
      create: {
        code,
        reward: Number(reward),
        maxGlobalUses: Number(maxGlobalUses),
        maxUserUses: Number(maxUserUses),
        currentGlobalUses: 0,
        usedBy: [],
      },
    });
    res.json(promo);
  } catch (e) {
    res.status(500).json({ error: 'Помилка збереження промокоду.' });
  }
});

app.delete('/api/admin/promos/:code', authenticate, checkAdmin, async (req, res) => {
  try {
    await prisma.promoCode.delete({ where: { code: req.params.code } });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Помилка видалення промокоду.' });
  }
});

app.post('/api/game/promos/use', authenticate, async (req, res) => {
  const { code } = req.body;
  try {
    const promo = await prisma.promoCode.findUnique({ where: { code } });
    if (!promo) return res.status(404).json({ error: 'Промокод не знайдено!' });

    const usedByList = promo.usedBy || [];
    const userUses = usedByList.filter((uid) => uid === req.user.uid).length;

    if (promo.maxGlobalUses > 0 && promo.currentGlobalUses >= promo.maxGlobalUses) {
      return res.status(400).json({ error: 'Ліміт використання цього промокоду вичерпано!' });
    }
    if (promo.maxUserUses > 0 && userUses >= promo.maxUserUses) {
      return res
        .status(400)
        .json({ error: 'Ви вже використали цей код максимальну кількість разів!' });
    }

    await prisma.$transaction(async (tx) => {
      const newUsedBy = [...usedByList, req.user.uid];
      await tx.promoCode.update({
        where: { code },
        data: { currentGlobalUses: { increment: 1 }, usedBy: newUsedBy },
      });
      await tx.user.update({
        where: { uid: req.user.uid },
        data: { coins: { increment: promo.reward } },
      });
    });

    const updatedUser = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    res.json({ success: true, reward: promo.reward, profile: updatedUser });
  } catch (e) {
    res.status(500).json({ error: 'Помилка активації промокоду.' });
  }
});

// --- ЩОДЕННА НАГОРОДА ---
app.post('/api/game/daily-claim', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    const settings = await prisma.gameSettings.findUnique({ where: { id: 'main' } });
    const sData = settings?.data || {};

    const now = new Date();
    if (user.lastDailyClaim) {
      const last = new Date(user.lastDailyClaim);
      if (
        last.getUTCDate() === now.getUTCDate() &&
        last.getUTCMonth() === now.getUTCMonth() &&
        last.getUTCFullYear() === now.getUTCFullYear()
      ) {
        return res.status(400).json({ error: 'Ви вже забирали нагороду сьогодні!' });
      }
    }

    const isPremium = user.isPremium && new Date(user.premiumUntil) > now;
    const rewardsArr = isPremium ? sData.premiumDailyRewards || [] : sData.dailyRewards || [];
    const streak = user.dailyStreak || 0;
    const reward = rewardsArr[streak % rewardsArr.length] || 1000;

    const updatedUser = await prisma.user.update({
      where: { uid: user.uid },
      data: {
        coins: { increment: reward },
        lastDailyClaim: now,
        dailyStreak: streak + 1,
      },
    });

    res.json({ success: true, reward, profile: updatedUser });
  } catch (error) {
    res.status(500).json({ error: 'Помилка отримання нагороди.' });
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
        isAdmin: true, // <-- ДОДАНО
        isSuperAdmin: true, // <-- ДОДАНО
        isPremium: true, // <-- ДОДАНО
        premiumUntil: true, // <-- ДОДАНО
        lastIp: true, // <-- ДОДАНО для адмінів
        // Рахуємо кількість унікальних записів в інвентарі гравця
        _count: {
          select: { inventory: true },
        },
      },
    });

    // Форматуємо дані під те, що очікує RatingView.jsx
    const formattedUsers = users.map((user) => ({
      uid: user.uid,
      nickname: user.nickname,
      coins: user.coins,
      farmLevel: user.farmLevel,
      isBanned: user.isBanned,
      avatarUrl: user.avatarUrl,
      isAdmin: user.isAdmin, // <-- ДОДАНО
      isSuperAdmin: user.isSuperAdmin, // <-- ДОДАНО
      isPremium: user.isPremium, // <-- ДОДАНО
      premiumUntil: user.premiumUntil, // <-- ДОДАНО
      lastIp: user.lastIp, // <-- ДОДАНО
      uniqueCardsCount: user._count.inventory,
    }));

    res.json(formattedUsers);
  } catch (error) {
    console.error('Помилка лідерборду:', error);
    res.status(500).json({ error: 'Помилка завантаження рейтингу.' });
  }
});

// ----------------------------------------
// ПРЕМІУМ ТА ВІТРИНИ (ПРОФІЛЬ)
// ----------------------------------------

// Створення вітрини
app.post('/api/profile/showcases', authenticate, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Введіть назву вітрини.' });

  try {
    const user = await prisma.user.findUnique({
      where: { uid: req.user.uid },
      include: { showcases: true },
    });
    if (user.showcases.length >= 5 && !user.isSuperAdmin) {
      return res.status(400).json({ error: 'Досягнуто ліміт вітрин (5 шт).' });
    }
    const showcase = await prisma.showcase.create({
      data: { name, cardIds: [], userId: req.user.uid },
    });
    res.json({ success: true, showcase });
  } catch (error) {
    res.status(500).json({ error: 'Помилка створення вітрини.' });
  }
});

// Видалення вітрини
app.delete('/api/profile/showcases/:id', authenticate, async (req, res) => {
  try {
    const showcase = await prisma.showcase.findUnique({ where: { id: req.params.id } });
    if (!showcase || showcase.userId !== req.user.uid)
      return res.status(403).json({ error: 'Доступ заборонено.' });

    await prisma.showcase.delete({ where: { id: req.params.id } });

    // Якщо видалили головну вітрину - знімаємо її з профілю
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    if (user.mainShowcaseId === req.params.id) {
      await prisma.user.update({ where: { uid: req.user.uid }, data: { mainShowcaseId: null } });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Помилка видалення вітрини.' });
  }
});

// Збереження карток у вітрині
app.put('/api/profile/showcases/:id/cards', authenticate, async (req, res) => {
  const { cardIds } = req.body;
  try {
    const showcase = await prisma.showcase.findUnique({ where: { id: req.params.id } });
    if (!showcase || showcase.userId !== req.user.uid)
      return res.status(403).json({ error: 'Доступ заборонено.' });

    const updated = await prisma.showcase.update({
      where: { id: req.params.id },
      data: { cardIds },
    });
    res.json({ success: true, showcase: updated });
  } catch (error) {
    res.status(500).json({ error: 'Помилка збереження карток.' });
  }
});

// Купівля преміуму
app.post('/api/game/buy-premium', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    const settings = await prisma.gameSettings.findUnique({ where: { id: 'main' } });
    const price = settings?.data?.premiumPrice || 10000;
    const days = settings?.data?.premiumDurationDays || 30;

    if (user.coins < price) return res.status(400).json({ error: 'Недостатньо монет!' });

    let currentExp = new Date();
    if (user.isPremium && user.premiumUntil) {
      const existingExp = new Date(user.premiumUntil);
      if (!isNaN(existingExp) && existingExp > currentExp) currentExp = existingExp;
    }
    currentExp.setDate(currentExp.getDate() + days);

    const updatedUser = await prisma.user.update({
      where: { uid: user.uid },
      data: {
        coins: { decrement: price },
        isPremium: true,
        premiumUntil: currentExp.toISOString(),
      },
    });

    res.json({ success: true, profile: updatedUser });
  } catch (error) {
    res.status(500).json({ error: 'Помилка покупки преміуму.' });
  }
});

// Зміна головної вітрини
app.post('/api/profile/main-showcase', authenticate, async (req, res) => {
  const { showcaseId } = req.body;
  try {
    const updatedUser = await prisma.user.update({
      where: { uid: req.user.uid },
      data: { mainShowcaseId: showcaseId }, // showcaseId може бути null, якщо знімаємо
    });
    res.json({ success: true, profile: updatedUser });
  } catch (error) {
    res.status(500).json({ error: 'Помилка оновлення вітрини.' });
  }
});

// ----------------------------------------
// АДМІНКА: УПРАВЛІННЯ ГРАВЦЯМИ
// ----------------------------------------

// Завантаження всіх гравців
app.get('/api/admin/users', authenticate, checkAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        uid: true,
        nickname: true,
        email: true,
        coins: true,
        totalCards: true,
        createdAt: true,
        isAdmin: true,
        isSuperAdmin: true,
        isBanned: true,
        banReason: true,
        banUntil: true,
        isPremium: true,
        premiumUntil: true,
        avatarUrl: true,
        mainShowcaseId: true,
        lastIp: true,
        autoSoundEnabled: true,
        farmLevel: true,
      },
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Помилка завантаження гравців.' });
  }
});

// Завантаження інвентарю конкретного гравця
app.get('/api/admin/users/:uid/inventory', authenticate, checkAdmin, async (req, res) => {
  try {
    const inv = await prisma.inventoryItem.findMany({ where: { userId: req.params.uid } });
    res.json(inv.map((i) => ({ id: i.cardId, amount: i.amount })));
  } catch (error) {
    res.status(500).json({ error: 'Помилка завантаження інвентарю.' });
  }
});

// Універсальний обробник дій адміна
app.post('/api/admin/users/action', authenticate, checkAdmin, async (req, res) => {
  const { action, targetUid, payload } = req.body;
  try {
    let updatedUser;

    // Отримуємо адміна для запису в bannedBy
    const adminUser = await prisma.user.findUnique({
      where: { uid: req.user.uid },
      select: { nickname: true },
    });

    switch (action) {
      case 'ban':
        updatedUser = await prisma.user.update({
          where: { uid: targetUid },
          data: {
            isBanned: true,
            banReason: payload.reason,
            banUntil: payload.until,
            bannedBy: adminUser?.nickname || 'Адміністратор',
          },
        });
        await prisma.notification.create({
          data: {
            userId: targetUid,
            type: 'punishment',
            title: 'Бан акаунту',
            message: `Вас забанено адміністратором ${adminUser?.nickname || 'Адміністратор'}. Причина: ${payload.reason}. Термін дії: ${payload.until ? new Date(payload.until).toLocaleString() : 'Назавжди'}`,
          },
        });
        break;
      case 'unban':
        updatedUser = await prisma.user.update({
          where: { uid: targetUid },
          data: { isBanned: false, banReason: null, banUntil: null, bannedBy: null },
        });
        break;
      case 'toggleAdmin':
        const userToToggle = await prisma.user.findUnique({ where: { uid: targetUid } });
        updatedUser = await prisma.user.update({
          where: { uid: targetUid },
          data: { isAdmin: !userToToggle.isAdmin },
        });
        break;
      case 'nickname':
        const exists = await prisma.user.findFirst({ where: { nickname: payload.nickname } });
        if (exists && exists.uid !== targetUid)
          return res.status(400).json({ error: 'Нікнейм вже зайнятий!' });
        updatedUser = await prisma.user.update({
          where: { uid: targetUid },
          data: { nickname: payload.nickname },
        });
        break;
      case 'coins':
        updatedUser = await prisma.user.update({
          where: { uid: targetUid },
          data: { coins: payload.exact ? payload.amount : { increment: payload.amount } },
        });
        await prisma.notification.create({
          data: {
            userId: targetUid,
            type: 'admin_action',
            title: 'Зміна балансу',
            message: `Адміністратор змінив ваш баланс монет. ${payload.exact ? 'Новий баланс: ' + payload.amount : 'Різниця: ' + payload.amount}`,
          },
        });
        break;
      case 'farmLevel':
        updatedUser = await prisma.user.update({
          where: { uid: targetUid },
          data: { farmLevel: payload.level },
        });
        await prisma.farmState.deleteMany({ where: { userId: targetUid } }); // Скидаємо поточного боса
        break;
      case 'premium':
        if (payload.revoke) {
          updatedUser = await prisma.user.update({
            where: { uid: targetUid },
            data: { isPremium: false, premiumUntil: null },
          });
        } else {
          const u = await prisma.user.findUnique({ where: { uid: targetUid } });
          let currentExp = new Date();
          if (u.isPremium && u.premiumUntil && new Date(u.premiumUntil) > currentExp)
            currentExp = new Date(u.premiumUntil);
          currentExp.setDate(currentExp.getDate() + payload.days);
          updatedUser = await prisma.user.update({
            where: { uid: targetUid },
            data: { isPremium: true, premiumUntil: currentExp.toISOString() },
          });
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
            create: { userId: targetUid, cardId: payload.cardId, amount: payload.amount },
          }),
          prisma.user.update({
            where: { uid: targetUid },
            data: { totalCards: { increment: payload.amount } },
          }),
          prisma.notification.create({
            data: {
              userId: targetUid,
              type: 'admin_action',
              title: 'Отримано картки',
              message: `Адміністратор видав вам картки (ID: ${payload.cardId}) у кількості ${payload.amount} шт.`,
            },
          }),
        ]);
        break;
      case 'removeCard':
        const invItem = await prisma.inventoryItem.findUnique({
          where: { userId_cardId: { userId: targetUid, cardId: payload.cardId } },
        });
        if (invItem && invItem.amount <= payload.amount) {
          await prisma.$transaction([
            prisma.inventoryItem.delete({
              where: { userId_cardId: { userId: targetUid, cardId: payload.cardId } },
            }),
            prisma.user.update({
              where: { uid: targetUid },
              data: { totalCards: { decrement: invItem.amount } },
            }),
            prisma.notification.create({
              data: {
                userId: targetUid,
                type: 'admin_action',
                title: 'Вилучено картки',
                message: `Адміністратор вилучив у вас картки (ID: ${payload.cardId}) у кількості ${invItem.amount} шт.`,
              },
            }),
          ]);
        } else if (invItem) {
          await prisma.$transaction([
            prisma.inventoryItem.update({
              where: { userId_cardId: { userId: targetUid, cardId: payload.cardId } },
              data: { amount: { decrement: payload.amount } },
            }),
            prisma.user.update({
              where: { uid: targetUid },
              data: { totalCards: { decrement: payload.amount } },
            }),
            prisma.notification.create({
              data: {
                userId: targetUid,
                type: 'admin_action',
                title: 'Вилучено картки',
                message: `Адміністратор вилучив у вас картки (ID: ${payload.cardId}) у кількості ${payload.amount} шт.`,
              },
            }),
          ]);
        }
        break;
      default:
        return res.status(400).json({ error: 'Невідома дія.' });
    }
    res.json({ success: true, profile: updatedUser });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Помилка виконання дії на сервері.' });
  }
});

// ----------------------------------------
// ОНОВЛЕННЯ АВАТАРА ТА ФАЙЛИ
// ----------------------------------------
app.post('/api/profile/update-avatar', authenticate, async (req, res) => {
  const { avatarUrl } = req.body;

  if (!avatarUrl) {
    return res.status(400).json({ error: 'URL аватара не надано.' });
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { uid: req.user.uid },
      data: { avatarUrl },
    });

    console.log(`Аватар оновлено для користувача: ${updatedUser.nickname}`);
    res.json({ success: true, profile: updatedUser });
  } catch (error) {
    console.error('Помилка при оновленні аватара:', error);
    res.status(500).json({ error: 'Помилка оновлення аватара на сервері.' });
  }
});

app.post(
  '/api/profile/upload-avatar',
  authenticate,
  uploadAvatar.single('avatar'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Файл не завантажено.' });
      }

      const newAvatarUrl = `/api/uploads/avatars/${req.file.filename}`;
      const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });

      // Видаляємо стару аватарку, якщо вона локальна
      if (
        user &&
        user.avatarUrl &&
        (user.avatarUrl.startsWith('/uploads/avatars/') ||
          user.avatarUrl.startsWith('/api/uploads/avatars/'))
      ) {
        const oldPath = path.join(__dirname, user.avatarUrl);
        if (fs.existsSync(oldPath)) {
          try {
            fs.unlinkSync(oldPath);
          } catch (err) {
            console.error('Помилка видалення старого аватара:', err);
          }
        }
      }

      const updatedUser = await prisma.user.update({
        where: { uid: req.user.uid },
        data: { avatarUrl: newAvatarUrl },
      });

      res.json({ success: true, profile: updatedUser, avatarUrl: newAvatarUrl });
    } catch (error) {
      console.error('Помилка при завантаженні аватара:', error);
      res.status(500).json({ error: error.message || 'Помилка завантаження аватара.' });
    }
  }
);

// Запуск сервера
const PORT = process.env.PORT || 5000;

// Зміна нікнейму (Преміум магазин)
app.post('/api/profile/change-nickname', authenticate, async (req, res) => {
  const { newNickname } = req.body;
  if (!newNickname) return res.status(400).json({ error: 'Введіть нікнейм!' });
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    if (user.coins < 100000) return res.status(400).json({ error: 'Недостатньо монет!' });

    const exists = await prisma.user.findFirst({ where: { nickname: newNickname } });
    if (exists) return res.status(400).json({ error: 'Цей нікнейм вже зайнятий!' });

    const updated = await prisma.user.update({
      where: { uid: req.user.uid },
      data: { nickname: newNickname, coins: { decrement: 100000 } },
    });
    res.json({ success: true, profile: updated });
  } catch (e) {
    res.status(500).json({ error: 'Помилка сервера.' });
  }
});

// Покупка преміум-товару
app.post('/api/game/premium-shop/buy', authenticate, async (req, res) => {
  const { item } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    if (!user.isPremium || new Date(user.premiumUntil) < new Date()) {
      return res.status(403).json({ error: 'Тільки для Преміум гравців!' });
    }
    if (user.coins < item.price) return res.status(400).json({ error: 'Недостатньо монет!' });

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { uid: user.uid },
        data: { coins: { decrement: item.price }, totalCards: { increment: 1 } },
      });
      if (item.type === 'card') {
        await tx.inventoryItem.upsert({
          where: { userId_cardId: { userId: user.uid, cardId: item.itemId } },
          update: { amount: { increment: 1 } },
          create: { userId: user.uid, cardId: item.itemId, amount: 1 },
        });
      }
    });

    const updatedUser = await prisma.user.findUnique({
      where: { uid: req.user.uid },
      include: { inventory: true },
    });
    res.json({ success: true, profile: updatedUser });
  } catch (e) {
    res.status(500).json({ error: 'Помилка покупки.' });
  }
});

// Системні Логи Адмінки
app.post('/api/admin/logs', authenticate, async (req, res) => {
  const { type, details } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    await prisma.adminLog.create({
      data: { type, details, userUid: user.uid, userNickname: user.nickname },
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Помилка логування.' });
  }
});

app.get('/api/admin/logs', authenticate, checkAdmin, async (req, res) => {
  try {
    const logs = await prisma.adminLog.findMany({ orderBy: { timestamp: 'desc' }, take: 100 });
    res.json(logs);
  } catch (e) {
    res.status(500).json({ error: 'Помилка отримання логів.' });
  }
});

app.delete('/api/admin/logs', authenticate, checkAdmin, async (req, res) => {
  try {
    await prisma.adminLog.deleteMany({});
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Помилка очищення логів.' });
  }
});

// ----------------------------------------
// СПОВІЩЕННЯ (NOTIFICATIONS)
// ----------------------------------------

app.get('/api/notifications', authenticate, async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.uid },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: 'Помилка завантаження сповіщень.' });
  }
});

app.put('/api/notifications/:id/read', authenticate, async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user.uid },
      data: { isRead: true },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Помилка оновлення сповіщення.' });
  }
});

app.post('/api/notifications/:id/claim', authenticate, async (req, res) => {
  try {
    const notif = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!notif || notif.userId !== req.user.uid)
      return res.status(404).json({ error: 'Сповіщення не знайдено.' });
    if (notif.type !== 'gift' || notif.isClaimed)
      return res.status(400).json({ error: 'Подарунок вже забрано або він відсутній.' });

    await prisma.$transaction(async (tx) => {
      // Відмічаємо як забране
      await tx.notification.update({
        where: { id: notif.id },
        data: { isClaimed: true, isRead: true },
      });

      // Надаємо монети
      if (notif.attachedCoins > 0) {
        await tx.user.update({
          where: { uid: req.user.uid },
          data: { coins: { increment: notif.attachedCoins } },
        });
      }

      // Надаємо картки
      if (notif.attachedCardId && notif.attachedCardAmount > 0) {
        await tx.inventoryItem.upsert({
          where: { userId_cardId: { userId: req.user.uid, cardId: notif.attachedCardId } },
          update: { amount: { increment: notif.attachedCardAmount } },
          create: {
            userId: req.user.uid,
            cardId: notif.attachedCardId,
            amount: notif.attachedCardAmount,
          },
        });
        await tx.user.update({
          where: { uid: req.user.uid },
          data: { totalCards: { increment: notif.attachedCardAmount } },
        });
      }
    });

    const updatedUser = await prisma.user.findUnique({
      where: { uid: req.user.uid },
      include: { inventory: true, showcases: true, farmState: true },
    });
    res.json({ success: true, profile: updatedUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Помилка отримання подарунку.' });
  }
});

app.post('/api/admin/notifications', authenticate, checkAdmin, async (req, res) => {
  const { targetUid, type, title, message, attachedCoins, attachedCardId, attachedCardAmount } =
    req.body;
  // type: 'update' (site update) or 'gift'
  // targetUid: 'ALL' or specific UID

  try {
    const dataObj = {
      type,
      title,
      message,
      attachedCoins: Number(attachedCoins) || 0,
      attachedCardId: attachedCardId || null,
      attachedCardAmount: Number(attachedCardAmount) || 0,
    };

    if (targetUid === 'ALL') {
      const users = await prisma.user.findMany({ select: { uid: true } });
      const notificationsData = users.map((u) => ({ ...dataObj, userId: u.uid }));
      await prisma.notification.createMany({ data: notificationsData });
    } else {
      await prisma.notification.create({ data: { ...dataObj, userId: targetUid } });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Помилка надсилання сповіщень.' });
  }
});

// ----------------------------------------
// СЛІВЦЕ (WORDLE)
// ----------------------------------------
const wordleDictPath = path.join(__dirname, 'data', 'wordle_uk.json');
let wordleDict = [];
try {
  wordleDict = require(wordleDictPath);
} catch (e) {
  console.log('Помилка завантаження словника Wordle', e);
}

app.get('/api/wordle/state', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    if (!user) return res.status(404).json({ error: 'Користувача не знайдено' });

    let dailyAttempts = user.dailyWordleAttempts;
    let lastPlay = user.lastWordlePlayDate ? new Date(user.lastWordlePlayDate) : null;
    const now = new Date();

    if (
      (lastPlay && lastPlay.getDate() !== now.getDate()) ||
      (lastPlay && lastPlay.getMonth() !== now.getMonth())
    ) {
      dailyAttempts = 0;
    }

    res.json({ state: user.wordleState, dailyAttempts });
  } catch (err) {
    res.status(500).json({ error: 'Помилка отримання стану Wordle.' });
  }
});

app.post('/api/wordle/start', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });

    const settings = await prisma.gameSettings.findUnique({ where: { id: 'main' } });
    const wordleEntryCost =
      settings?.data?.wordleEntryCost !== undefined ? Number(settings.data.wordleEntryCost) : 0;

    if (wordleEntryCost > 0 && user.coins < wordleEntryCost) {
      return res.status(400).json({ error: `Недостатньо монет (Потрібно ${wordleEntryCost}).` });
    }

    let dailyAttempts = user.dailyWordleAttempts;
    let lastPlay = user.lastWordlePlayDate ? new Date(user.lastWordlePlayDate) : null;
    const now = new Date();
    if (
      (lastPlay && lastPlay.getDate() !== now.getDate()) ||
      (lastPlay && lastPlay.getMonth() !== now.getMonth())
    ) {
      dailyAttempts = 0;
    }

    if (dailyAttempts >= 5)
      return res.status(400).json({ error: 'Ви вичерпали ліміт на 5 ігор сьогодні.' });

    const randomWord = wordleDict[Math.floor(Math.random() * wordleDict.length)].toLowerCase();

    const newState = {
      word: randomWord,
      guesses: [], // [{ word: '...', colors: ['green', 'yellow', 'gray'] }]
      status: 'playing', // 'playing', 'won', 'lost'
    };

    const updateData = {
      wordleState: newState,
      dailyWordleAttempts: dailyAttempts + 1,
      lastWordlePlayDate: now,
    };

    if (wordleEntryCost > 0) {
      updateData.coins = { decrement: wordleEntryCost };
    }

    const updatedUser = await prisma.user.update({
      where: { uid: user.uid },
      data: updateData,
    });

    res.json({
      success: true,
      state: newState,
      profile: updatedUser,
      dailyAttempts: dailyAttempts + 1,
    });
  } catch (err) {
    res.status(500).json({ error: 'Помилка початку гри Wordle.' });
  }
});

app.post('/api/wordle/guess', authenticate, async (req, res) => {
  const { guess } = req.body;

  if (!guess || guess.length !== 5)
    return res.status(400).json({ error: 'Слово має містити 5 літер.' });

  const lowerGuess = guess.toLowerCase();

  if (!wordleDict.includes(lowerGuess)) {
    return res.status(400).json({ error: 'Слово відсутнє в словнику.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    let state =
      typeof user.wordleState === 'string' ? JSON.parse(user.wordleState) : user.wordleState;

    if (!state || state.status !== 'playing') {
      return res.status(400).json({ error: 'Немає активної гри.' });
    }

    const targetWord = state.word;
    const colors = Array(5).fill('gray');
    const targetArr = targetWord.split('');
    const guessArr = lowerGuess.split('');

    // First pass: exact matches (green)
    guessArr.forEach((char, i) => {
      if (char === targetArr[i]) {
        colors[i] = 'green';
        targetArr[i] = null; // Mark as used
      }
    });

    // Second pass: correct letter, wrong place (yellow)
    guessArr.forEach((char, i) => {
      if (colors[i] !== 'green') {
        const index = targetArr.indexOf(char);
        if (index !== -1) {
          colors[i] = 'yellow';
          targetArr[index] = null; // Mark as used
        }
      }
    });

    state.guesses.push({ word: lowerGuess, colors });

    let reward = 0;

    if (lowerGuess === targetWord) {
      state.status = 'won';
      reward = 1000; // Виграш
    } else if (state.guesses.length >= 6) {
      state.status = 'lost';
    }

    const updateData = { wordleState: state };
    if (reward > 0) {
      updateData.coins = { increment: reward };
    }

    const updatedUser = await prisma.user.update({
      where: { uid: user.uid },
      data: updateData,
    });

    res.json({ success: true, state, profile: updatedUser, reward });
  } catch (err) {
    res.status(500).json({ error: 'Помилка перевірки слова.' });
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
    if (!user) return res.status(404).json({ error: 'Гравця не знайдено.' });

    let totalEarned = 0;
    let totalCardsRemoved = 0;

    // Використовуємо транзакцію для безпечного оновлення
    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const card = await tx.cardCatalog.findUnique({ where: { id: item.cardId } });
        if (!card) continue;

        if (card.maxSupply > 0) {
          throw new Error(
            `Лімітовану картку "${card.name}" можна продати тільки на ринку гравцям.`
          );
        }

        const price = card.sellPrice || 15;
        const earn = price * item.amount;

        // Перевіряємо, чи є в інвентарі достатньо карток
        const invItem = await tx.inventoryItem.findUnique({
          where: { userId_cardId: { userId: user.uid, cardId: item.cardId } },
        });

        if (invItem && invItem.amount >= item.amount) {
          let statsArray = [];
          if (invItem.gameStats) {
            statsArray =
              typeof invItem.gameStats === 'string'
                ? JSON.parse(invItem.gameStats)
                : invItem.gameStats;
          }

          // If a specific power is requested to sell
          if (item.power !== undefined && item.power !== null) {
            if (item.amount !== 1) {
              throw new Error('Не можна продати більше 1 картки з конкретною силою за раз.');
            }
            const parsedPower = Number(item.power);
            const powerIndex = statsArray.findIndex((p) => Number(p) === parsedPower);
            if (powerIndex > -1) {
              statsArray.splice(powerIndex, 1);
            } else if (statsArray.length > 0) {
              // Fallback: power not found (data mismatch), remove closest match
              statsArray.sort(
                (a, b) => Math.abs(Number(a) - parsedPower) - Math.abs(Number(b) - parsedPower)
              );
              statsArray.splice(0, 1);
            }
            // else: no gameStats tracked, skip
          } else {
            // Продати без конкретної сили: залишити найсильнішу (якщо після продажу залишається >= 1 картка)
            if (statsArray.length > 0) {
              const remainingAmount = invItem.amount - item.amount; // скільки карток лишається
              if (remainingAmount <= 0) {
                // Продаємо всі — очищуємо gameStats
                statsArray.splice(0, statsArray.length);
              } else {
                // Залишаємо remainingAmount найсильніших, видаляємо слабші
                statsArray.sort((a, b) => Number(b) - Number(a)); // від найсильнішої до найслабшої
                statsArray.splice(remainingAmount); // видаляємо все після remainingAmount
              }
            }
          }

          if (invItem.amount === item.amount) {
            await tx.inventoryItem.delete({
              where: { userId_cardId: { userId: user.uid, cardId: item.cardId } },
            });
            await sanitizeShowcases(tx, user.uid, item.cardId, 0);
          } else {
            await tx.inventoryItem.update({
              where: { userId_cardId: { userId: user.uid, cardId: item.cardId } },
              data: { amount: { decrement: item.amount }, gameStats: statsArray },
            });
            await sanitizeShowcases(tx, user.uid, item.cardId, invItem.amount - item.amount);
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
            totalCards: { decrement: totalCardsRemoved },
          },
        });
      }
    });

    const updatedUser = await prisma.user.findUnique({
      where: { uid: req.user.uid },
      include: { inventory: true },
    });

    res.json({ success: true, earned: totalEarned, profile: updatedUser });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message || 'Помилка продажу карток.' });
  }
});

// ----------------------------------------
// КУЗНЯ (ФОРДЖ) - РЕРОЛ СИЛИ КАРТКИ
// ----------------------------------------
app.post('/api/game/forge/reroll', authenticate, async (req, res) => {
  const { cardId, currentPower } = req.body;

  if (!cardId || currentPower === undefined || currentPower === null) {
    return res.status(400).json({ error: 'Некоректні дані для кування.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    if (!user) return res.status(404).json({ error: 'Гравця не знайдено.' });

    const invItem = await prisma.inventoryItem.findUnique({
      where: { userId_cardId: { userId: user.uid, cardId: cardId } },
      include: { card: true },
    });

    if (!invItem || invItem.amount < 1) {
      return res.status(400).json({ error: 'Цієї картки немає у вашому інвентарі.' });
    }

    let statsArray = [];
    if (invItem.gameStats) {
      statsArray =
        typeof invItem.gameStats === 'string' ? JSON.parse(invItem.gameStats) : invItem.gameStats;
    }

    const parsedPower = Number(currentPower);
    const powerIndex = statsArray.findIndex((p) => Number(p) === parsedPower);
    if (powerIndex === -1) {
      return res.status(400).json({ error: 'Картку з такою силою не знайдено в інвентарі.' });
    }

    let cost = 100;
    switch (invItem.card.rarity) {
      case 'Звичайна':
        cost = 100;
        break;
      case 'Рідкісна':
        cost = 300;
        break;
      case 'Епічна':
        cost = 1000;
        break;
      case 'Легендарна':
        cost = 5000;
        break;
      case 'Унікальна':
        cost = 15000;
        break;
    }

    if (user.coins < cost) {
      return res.status(400).json({ error: 'Недостатньо монет для кування!' });
    }

    const generatePower = (rarity) => {
      let min = 0,
        max = 0;
      switch (rarity) {
        case 'Унікальна':
          min = 100;
          max = 150;
          break;
        case 'Легендарна':
          min = 50;
          max = 125;
          break;
        case 'Епічна':
          min = 25;
          max = 100;
          break;
        case 'Рідкісна':
          min = 10;
          max = 80;
          break;
        case 'Звичайна':
          min = 5;
          max = 50;
          break;
        default:
          return null;
      }
      return Math.floor(Math.random() * (max - min + 1)) + min;
    };

    const newPower = generatePower(invItem.card.rarity) || parsedPower;

    // Remove old power and add new power
    statsArray.splice(powerIndex, 1);
    statsArray.push(newPower);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { uid: user.uid },
        data: { coins: { decrement: cost } },
      });

      await tx.inventoryItem.update({
        where: { userId_cardId: { userId: user.uid, cardId: cardId } },
        data: { gameStats: statsArray },
      });
    });

    const updatedUser = await prisma.user.findUnique({
      where: { uid: req.user.uid },
      include: { inventory: true },
    });

    res.json({ success: true, profile: updatedUser, newPower, cost });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Помилка внутрішнього сервера під час кування.' });
  }
});
