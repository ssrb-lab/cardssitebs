const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient, Prisma } = require('@prisma/client');
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authenticate = require('./middleware/auth');

const prisma = new PrismaClient();
const app = express();
app.set('trust proxy', 1); // Довіряємо Cloudflare / Nginx proxy для rate_limit

// Налаштування Multer для збереження аватарок
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads', 'avatars');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(
      null,
      `avatar-${req.user?.uid || Date.now()}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`
    );
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
    cb(null, `item-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
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

// SSE Clients for user-specific real-time notifications
let userSSEClients = {};

// Helper to send real-time notification to a specific user
const sendUserNotification = (uid, data) => {
  if (userSSEClients[uid]) {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    userSSEClients[uid].forEach((client) => {
      // Use setImmediate to avoid blocking or write errors in transactions
      setImmediate(() => {
        client.write(message);
        if (client.flush) client.flush(); // If compression middleware is used
      });
    });
  }
};

// Активні ігри Crash
const activeCrashGames = new Map();

app.use(cors());
app.use(express.json());

// Загальний ліміт для API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 хвилин
  max: 5000, // Збільшено ліміт для комфортного тестування
  message: { error: 'Забагато запитів з цього IP, будь ласка, спробуйте знову через 15 хвилин' },
});
app.use('/api', apiLimiter);

// Ліміт для авторизації
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15, // Ліміт кожного IP до 15 запитів
  message: { error: 'Забагато спроб авторизації. Спробуйте пізніше.' },
});

// Роздача статичних файлів (аватарки та картки)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

// Мідлвар для перевірки реального типу файлу за "magic bytes"
const validateImageSignature = async (req, res, next) => {
  if (!req.file) return next();

  try {
    const { fileTypeFromFile } = await import('file-type');
    const type = await fileTypeFromFile(req.file.path);

    if (!type || !type.mime.startsWith('image/')) {
      // Файл не є зображенням, видаляємо його
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Завантажений файл не є валідним зображенням' });
    }

    next();
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Помилка валідації файлу:', err);
    return res.status(500).json({ error: 'Помилка валідації безпеки файлу' });
  }
};

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
// ARENA HELPERS
// ----------------------------------------
const getDefendingInstances = async (uid) => {
  const points = await prisma.arenaPoint.findMany({
    where: { ownerId: uid },
  });

  const instances = [];
  for (const p of points) {
    if (p.defendingCards && Array.isArray(p.defendingCards)) {
      for (const card of p.defendingCards) {
        if (card.id && card.statsIndex !== undefined && card.statsIndex !== null) {
          instances.push({ cardId: card.id, statsIndex: card.statsIndex });
        }
      }
    }
  }
  return instances;
};

const syncArenaIndices = async (tx, userUid, cardId, oldToNewIndexMap) => {
  const points = await tx.arenaPoint.findMany({
    where: { ownerId: userUid },
  });

  for (const point of points) {
    if (!point.defendingCards || !Array.isArray(point.defendingCards)) continue;
    let pointChanged = false;
    const updatedCards = point.defendingCards.map((c) => {
      if (c.id === cardId && c.statsIndex !== undefined && c.statsIndex !== null) {
        if (oldToNewIndexMap.has(c.statsIndex)) {
          const newIdx = oldToNewIndexMap.get(c.statsIndex);
          if (newIdx !== c.statsIndex) {
            c.statsIndex = newIdx;
            pointChanged = true;
          }
        }
      }
      return c;
    });

    if (pointChanged) {
      await tx.arenaPoint.update({
        where: { id: point.id },
        data: { defendingCards: updatedCards },
      });
    }
  }
};

const createSpliceMap = (oldLength, spliceStart, spliceCount) => {
  const map = new Map();
  for (let i = 0; i < oldLength; i++) {
    if (i >= spliceStart && i < spliceStart + spliceCount) map.set(i, -1);
    else if (i >= spliceStart + spliceCount) map.set(i, i - spliceCount);
    else map.set(i, i);
  }
  return map;
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

app.post('/api/auth/google', authLimiter, async (req, res) => {
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
      if (existingNick) nickname = `${nickname}_${crypto.randomBytes(4).toString('hex')}`;

      const randomPassword = crypto.randomBytes(16).toString('hex');
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

app.post('/api/auth/register', authLimiter, async (req, res) => {
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

app.post('/api/auth/login', authLimiter, async (req, res) => {
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

app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
  const { email } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'Користувача з такою електронною поштою не знайдено.' });
    }

    // Generate secure token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = await bcrypt.hash(rawToken, 10);
    // Token valid for 1 hour
    const tokenExpiry = new Date(Date.now() + 60 * 60 * 1000);

    // Update user token in DB
    await prisma.user.update({
      where: { email },
      data: {
        resetToken: hashedToken,
        resetTokenExpiry: tokenExpiry,
      },
    });

    // Setup nodemailer
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // Use STARTTLS for port 587 because Hetzner blocks 465
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;

    const mailOptions = {
      from: 'supportbscard@gmail.com',
      to: email,
      subject: 'Відновлення паролю',
      text: `Ви запросили відновлення паролю.\n\nПерейдіть за посиланням нижче, щоб встановити новий пароль. Це посилання дійсне протягом 1 години:\n\n${resetLink}\n\nЯкщо ви не робили цього запиту, просто проігноруйте цей лист.`,
    };

    // Send email
    await transporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: 'Посилання для відновлення паролю відправлено на вашу пошту.',
    });
  } catch (error) {
    console.error('Помилка відновлення паролю:', error);
    res.status(500).json({ error: 'Помилка сервера при відновленні паролю.' });
  }
});

app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
  const { email, token, newPassword } = req.body;

  if (!email || !token || !newPassword) {
    return res.status(400).json({ error: "Всі поля обов'язкові." });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.resetToken || !user.resetTokenExpiry) {
      return res.status(400).json({ error: 'Недійсний запит на відновлення паролю.' });
    }

    if (new Date() > new Date(user.resetTokenExpiry)) {
      return res
        .status(400)
        .json({ error: 'Токен відновлення паролю закінчився. Запросіть нове посилання.' });
    }

    const isTokenValid = await bcrypt.compare(token, user.resetToken);
    if (!isTokenValid) {
      return res.status(400).json({ error: 'Недійсний токен відновлення паролю.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { email },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    res.json({ success: true, message: 'Пароль успішно змінено.' });
  } catch (error) {
    console.error('Помилка скидання пароля:', error);
    res.status(500).json({ error: 'Помилка сервера при зміні пароля.' });
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
      where: { ownerId: user.uid },
    });

    let crystalsEarned = 0;
    const now = new Date();

    for (const point of ownedPoints) {
      if (point.crystalRatePerHour > 0 && point.crystalsLastClaimedAt) {
        // Calculate how many full 10-minute segments have passed
        const msPassed = now.getTime() - new Date(point.crystalsLastClaimedAt).getTime();
        const tenMinuteSegments = Math.floor(msPassed / (1000 * 60 * 10));

        if (tenMinuteSegments > 0) {
          // Farm rate per 10 minutes
          const ratePer10Min = point.crystalRatePerHour / 6;

          // Calculate whole crystals earned
          const earnedFromThisPoint = Math.floor(tenMinuteSegments * ratePer10Min);

          if (earnedFromThisPoint > 0) {
            crystalsEarned += earnedFromThisPoint;

            // Move the claimedAt forward by exactly the time equivalent of the crystals claimed
            const timeToAdvanceMs = (earnedFromThisPoint / ratePer10Min) * 1000 * 60 * 10;
            const newClaimTime = new Date(
              new Date(point.crystalsLastClaimedAt).getTime() + timeToAdvanceMs
            );

            await prisma.arenaPoint.update({
              where: { id: point.id },
              data: { crystalsLastClaimedAt: newClaimTime },
            });
          }
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
        },
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
      defendingInstances: await getDefendingInstances(user.uid),
    };

    res.json(formattedUser);
  } catch (error) {
    res.status(500).json({ error: 'Помилка завантаження профілю' });
  }
});

// Публічний профіль гравця (для рейтингу)
app.get('/api/profile/public/:identifier', async (req, res) => {
  try {
    const identifier = req.params.identifier;
    
    // Check if it's a UUID (standard length 36)
    const isUid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

    let user = await prisma.user.findUnique({
      where: isUid ? { uid: identifier } : { nickname: identifier },
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
  validateImageSignature,
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
      const cardData = {
        ...data,
        frame: data.frame || 'normal',
        isGame: Boolean(data.isGame),
        perk: data.perk || null,
        perkValue:
          data.perk && data.perkValue !== '' && data.perkValue !== null && data.perkValue !== undefined
            ? Number(data.perkValue)
            : null,
        minPower:
          data.minPower !== '' && data.minPower !== null && data.minPower !== undefined
            ? Number(data.minPower)
            : null,
        maxPower:
          data.maxPower !== '' && data.maxPower !== null && data.maxPower !== undefined
            ? Number(data.maxPower)
            : null,
        minHp:
          data.minHp !== '' && data.minHp !== null && data.minHp !== undefined
            ? Number(data.minHp)
            : null,
        maxHp:
          data.maxHp !== '' && data.maxHp !== null && data.maxHp !== undefined
            ? Number(data.maxHp)
            : null,
      };

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
  validateImageSignature,
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
      if (typeof packData.statsRanges === 'object') {
        packData.statsRanges = packData.statsRanges; // It's already parsed from JSON.parse(req.body.data) if stringified properly, else let Prisma handle JSON
      }
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

const DEFAULT_RARITY_WEIGHTS = {
  'Звичайна': 8500,
  'Рідкісна': 1350,
  'Епічна': 135,
  'Легендарна': 14,
  'Унікальна': 1
};
app.post('/api/game/open-pack', authenticate, async (req, res) => {
  const { packId, amount } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    const pack = await prisma.packCatalog.findUnique({ where: { id: packId } });

    if (!pack) return res.status(404).json({ error: 'Пак не знайдено' });

    const amountToOpen = Number(amount);
    if (!Number.isInteger(amountToOpen) || amountToOpen <= 0) {
      return res.status(400).json({ error: 'Невірна кількість паків!' });
    }

    const totalCost = pack.cost * amountToOpen;
    if (user.coins < totalCost) return res.status(400).json({ error: 'Недостатньо монет!' });

    if (pack.isPremiumOnly && (!user.isPremium || new Date(user.premiumUntil) < new Date())) {
      return res.status(403).json({ error: 'Тільки для Преміум гравців!' });
    }

    let availableCards = (await prisma.cardCatalog.findMany({ where: { packId: pack.id } })).filter(
      (c) => c.maxSupply === 0 || c.pulledCount < c.maxSupply
    );

    if (availableCards.length === 0)
      return res.status(400).json({ error: 'У цьому паку закінчились картки.' });



    let results = [];
    let countsMap = {};
    let totalEarnedCoins = 0;

    // Локальне відстеження для запобігання перевищенню ліміту у межах однієї транзакції
    let localPulledCounts = {};
    availableCards.forEach((c) => (localPulledCounts[c.id] = c.pulledCount || 0));

    const generatePower = (rarity, cardObj) => {
      let min = 0,
        max = 0;

      // Card logic overriding
      if (cardObj && cardObj.minPower !== null && cardObj.maxPower !== null) {
        min = cardObj.minPower;
        max = cardObj.maxPower;
      } else {
        let ranges;
        if (typeof pack.statsRanges === 'string') {
          try {
            ranges = JSON.parse(pack.statsRanges);
          } catch (e) {}
        } else {
          ranges = pack.statsRanges;
        }

        if (
          ranges &&
          ranges[rarity] &&
          ranges[rarity].minPower !== undefined &&
          ranges[rarity].maxPower !== undefined &&
          ranges[rarity].minPower !== '' &&
          ranges[rarity].maxPower !== ''
        ) {
          min = Number(ranges[rarity].minPower);
          max = Number(ranges[rarity].maxPower);
        } else {
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
        }
      }
      return Math.floor(Math.random() * (max - min + 1)) + min;
    };

    const generateHp = (rarity, cardObj) => {
      let min = 0,
        max = 0;

      // Card logic overriding
      if (cardObj && cardObj.minHp !== null && cardObj.maxHp !== null) {
        min = cardObj.minHp;
        max = cardObj.maxHp;
      } else {
        let ranges;
        if (typeof pack.statsRanges === 'string') {
          try {
            ranges = JSON.parse(pack.statsRanges);
          } catch (e) {}
        } else {
          ranges = pack.statsRanges;
        }

        if (
          ranges &&
          ranges[rarity] &&
          ranges[rarity].minHp !== undefined &&
          ranges[rarity].maxHp !== undefined &&
          ranges[rarity].minHp !== '' &&
          ranges[rarity].maxHp !== ''
        ) {
          min = Number(ranges[rarity].minHp);
          max = Number(ranges[rarity].maxHp);
        } else {
          switch (rarity) {
            case 'Унікальна':
              min = 300;
              max = 500;
              break;
            case 'Легендарна':
              min = 200;
              max = 400;
              break;
            case 'Епічна':
              min = 150;
              max = 300;
              break;
            case 'Рідкісна':
              min = 100;
              max = 200;
              break;
            case 'Звичайна':
              min = 50;
              max = 100;
              break;
            default:
              return null;
          }
        }
      }
      return Math.floor(Math.random() * (max - min + 1)) + min;
    };

    let cardStatsToAdd = {}; // { cardId: [{power, hp}, ...] }

    for (let i = 0; i < amount; i++) {
      if (availableCards.length === 0) break; // Якщо всі картки закінчились під час відкриття

      const rarityCounts = {};
      for (const c of availableCards) {
        if (!(c.weight !== null && c.weight !== undefined && c.weight !== '' && Number(c.weight) > 0)) {
          rarityCounts[c.rarity] = (rarityCounts[c.rarity] || 0) + 1;
        }
      }

      let totalWeight = 0;
      const activeWeights = [];

      for (const c of availableCards) {
        let w = 0;
        if (
          c.weight !== null &&
          c.weight !== undefined &&
          c.weight !== '' &&
          Number(c.weight) > 0
        ) {
          w = Number(c.weight);
        } else {
          const globalW = DEFAULT_RARITY_WEIGHTS[c.rarity] || 1;
          let baseW = globalW;
          if (
            pack.customWeights &&
            pack.customWeights[c.rarity] !== undefined &&
            pack.customWeights[c.rarity] !== ''
          ) {
            baseW = Number(pack.customWeights[c.rarity]);
          }
          w = baseW / (rarityCounts[c.rarity] || 1);
        }

        totalWeight += w;
        activeWeights.push({ card: c, weight: w });
      }

      const rand = Math.random() * totalWeight;
      let sum = 0;
      let newCard = activeWeights[0]?.card;
      for (const item of activeWeights) {
        sum += item.weight;
        if (rand <= sum) {
          newCard = item.card;
          break;
        }
      }

      let generatedStats = null;
      if (pack.isGame || newCard.isGame) {
        const power = generatePower(newCard.rarity, newCard);
        const hp = generateHp(newCard.rarity, newCard);
        generatedStats = { power, hp };
      }

      results.push({ ...newCard, generatedStats: generatedStats });
      countsMap[newCard.id] = (countsMap[newCard.id] || 0) + 1;
      if (generatedStats !== null) {
        if (!cardStatsToAdd[newCard.id]) cardStatsToAdd[newCard.id] = [];
        cardStatsToAdd[newCard.id].push(generatedStats);
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
      hp: l.hp,
    }));
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Помилка завантаження ринку.' });
  }
});

// 2. Виставити картку на продаж
app.post('/api/game/market/list', authenticate, async (req, res) => {
  const { cardId, price, power, hp } = req.body;
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
      let removedHp = null;

      if (power !== undefined && power !== null) {
        const parsedPower = Number(power);
        const parsedHp = hp !== undefined && hp !== null ? Number(hp) : null;

        const powerIndex = statsArray.findIndex((p) => {
          if (typeof p === 'object' && p !== null) {
            if (parsedHp !== null && Number(p.hp) !== parsedHp) return false;
            return Number(p.power) === parsedPower;
          }
          return Number(p) === parsedPower;
        });

        if (powerIndex > -1) {
          if (statsArray[powerIndex] && statsArray[powerIndex].inSafe) {
            throw new Error('Ця картка знаходиться у Сейфі і не може бути виставлена на ринок.');
          }
          const defInstances = await getDefendingInstances(user.uid);
          const isDefending = defInstances.some(
            (inst) => inst.cardId === cardId && inst.statsIndex === powerIndex
          );
          if (isDefending) {
            throw new Error(
              'Ця картка зараз захищає точку на Арені і не може бути виставлена на ринок.'
            );
          }

          const map = createSpliceMap(statsArray.length, powerIndex, 1);
          const removed = statsArray.splice(powerIndex, 1)[0];
          await syncArenaIndices(prisma, user.uid, cardId, map);

          removedPower = typeof removed === 'object' ? removed.power : removed;
          removedHp = typeof removed === 'object' ? removed.hp : null;
        } else if (statsArray.length > 0) {
          // Fallback
          let closestIndex = 0;
          let minDiff = Infinity;
          for (let i = 0; i < statsArray.length; i++) {
            const pVal =
              typeof statsArray[i] === 'object'
                ? Number(statsArray[i].power)
                : Number(statsArray[i]);
            const diff = Math.abs(pVal - parsedPower);
            if (diff < minDiff) {
              minDiff = diff;
              closestIndex = i;
            }
          }
          const map = createSpliceMap(statsArray.length, closestIndex, 1);
          const removed = statsArray.splice(closestIndex, 1)[0];
          await syncArenaIndices(prisma, user.uid, cardId, map);

          removedPower = typeof removed === 'object' ? removed.power : removed;
          removedHp = typeof removed === 'object' ? removed.hp : null;
        } else {
          removedPower = parsedPower;
          removedHp = parsedHp;
        }
      } else if (statsArray.length > 0) {
        let weakestIndex = -1;
        let minSum = Infinity;
        for (let i = 0; i < statsArray.length; i++) {
          const s = statsArray[i];
          if (s && s.inSafe) continue; // Пропускаємо сейвлені картки
          const sum = typeof s === 'object' ? (s.power || 0) + (s.hp || 0) : Number(s);
          if (sum < minSum) {
            minSum = sum;
            weakestIndex = i;
          }
        }
        if (weakestIndex === -1) {
          throw new Error('Усі ваші картки цього типу знаходяться у Сейфі.');
        }
        const map = createSpliceMap(statsArray.length, weakestIndex, 1);
        const removed = statsArray.splice(weakestIndex, 1)[0]; // забираємо найслабшу
        await syncArenaIndices(prisma, user.uid, cardId, map);

        removedPower = typeof removed === 'object' ? removed.power : removed;
        removedHp = typeof removed === 'object' ? removed.hp : null;
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
          hp: removedHp,
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
        if (listing.hp !== null) {
          currentStats.push({ power: listing.power, hp: listing.hp });
        } else {
          currentStats.push(listing.power);
        }
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

    // Notify the seller via SSE
    sendUserNotification(listing.sellerId, { type: 'MARKET_SALE' });

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
        if (listing.hp !== null) {
          currentStats.push({ power: listing.power, hp: listing.hp });
        } else {
          currentStats.push(listing.power);
        }
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
// СЕЙФ КАРТОК (SAFE)
// ----------------------------------------
app.post('/api/game/inventory/safe', authenticate, async (req, res) => {
  const { cardId, statsIndex, amount, isSafe } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    if (!user) return res.status(404).json({ error: 'Гравця не знайдено' });

    await prisma.$transaction(async (tx) => {
      const invItem = await tx.inventoryItem.findUnique({
        where: { userId_cardId: { userId: user.uid, cardId } },
      });
      if (!invItem) throw new Error('Картка не знайдена в інвентарі');

      let statsArray = [];
      if (invItem.gameStats) {
        statsArray =
          typeof invItem.gameStats === 'string' ? JSON.parse(invItem.gameStats) : invItem.gameStats;
      }

      // Якщо передано конкретний індекс (для ігрових карток)
      if (statsIndex !== undefined && statsIndex !== null) {
        if (statsIndex < 0 || statsIndex >= statsArray.length)
          throw new Error('Невірний індекс картки');

        // Перевіряємо чи не на арені
        const defInstances = await getDefendingInstances(user.uid);
        const isDefending = defInstances.some(
          (inst) => inst.cardId === cardId && inst.statsIndex === statsIndex
        );
        if (isDefending && isSafe) {
          throw new Error('Не можна покласти в сейф картку, яка зараз на Арені!');
        }

        if (typeof statsArray[statsIndex] !== 'object' || statsArray[statsIndex] === null) {
          statsArray[statsIndex] = {
            power: Number(statsArray[statsIndex]) || 0,
            hp: 0,
            inSafe: isSafe,
          };
        } else {
          statsArray[statsIndex].inSafe = isSafe;
        }
      } else {
        // Масове перенесення (для неігрових карток, де всі екземпляри однакові)
        if (amount === undefined || amount === null) throw new Error('Не вказана кількість карток');
        const transferAmount = Number(amount);
        if (transferAmount <= 0) throw new Error('Невірна кількість');

        // Рахуємо скільки зараз в сейфі
        const currentlySafeCount = statsArray.filter((s) => s && s.inSafe).length;
        const targetSafeCount = isSafe
          ? Math.min(invItem.amount, currentlySafeCount + transferAmount)
          : Math.max(0, currentlySafeCount - transferAmount);

        statsArray = statsArray.filter((s) => typeof s !== 'object' || !s.inSafe);
        const safeArr = Array(targetSafeCount).fill({ inSafe: true });

        // Зберігаємо оригінальні стати
        const oldStats = statsArray.filter((s) => typeof s === 'object' && !s.inSafe);
        const oldNumbers = statsArray.filter((s) => typeof s !== 'object');

        statsArray = [...oldNumbers, ...oldStats, ...safeArr];
      }

      await tx.inventoryItem.update({
        where: { id: invItem.id },
        data: { gameStats: statsArray },
      });
    });

    const updatedUser = await prisma.user.findUnique({
      where: { uid: req.user.uid },
      include: { inventory: true },
    });
    res.json({ success: true, profile: updatedUser });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Помилка сейфу' });
  }
});

// ----------------------------------------
// МІНІ-ГРИ (2048 та Tetris)
// ----------------------------------------
app.post('/api/game/2048/start', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });

    // Записуємо час початку гри для античіту
    const now = new Date();
    const updatedUser = await prisma.user.update({
      where: { uid: user.uid },
      data: {
        last2048PlayDate: now,
        activeMinigame: { game: '2048', startTime: now.toISOString() },
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

    // ANTI-CHEAT CHECK
    if (!user.activeMinigame) {
      return res.status(400).json({ error: 'Гру не було розпочато легітимно!' });
    }
    const minigame =
      typeof user.activeMinigame === 'string'
        ? JSON.parse(user.activeMinigame)
        : user.activeMinigame;
    if (minigame.game !== '2048') {
      return res.status(400).json({ error: 'Неправильна активна гра!' });
    }

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
        activeMinigame: null, // Cleared
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
        activeMinigame: { game: 'tetris', startTime: now.toISOString() },
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

  if (score < 50) {
    // Дозволяємо вийти з гри при малому рахунку, просто очищаємо стан
    try {
      await prisma.user.update({ where: { uid: req.user.uid }, data: { activeMinigame: null } });
    } catch (e) { /* ignore */ }
    return res.json({ reward: 0, message: 'Гру закрито.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });

    // ANTI-CHEAT CHECK
    if (!user.activeMinigame) {
      return res.status(400).json({ error: 'Гру не було розпочато легітимно!' });
    }
    const minigame =
      typeof user.activeMinigame === 'string'
        ? JSON.parse(user.activeMinigame)
        : user.activeMinigame;
    if (minigame.game !== 'tetris') {
      return res.status(400).json({ error: 'Неправильна активна гра!' });
    }

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
        activeMinigame: null,
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
        activeMinigame: { game: 'fuse', startTime: now.toISOString() },
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

    // ANTI-CHEAT CHECK
    if (!user.activeMinigame) {
      return res.status(400).json({ error: 'Гру не було розпочато легітимно!' });
    }
    const minigame =
      typeof user.activeMinigame === 'string'
        ? JSON.parse(user.activeMinigame)
        : user.activeMinigame;
    if (minigame.game !== 'fuse') {
      return res.status(400).json({ error: 'Неправильна активна гра!' });
    }

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

    // Вже не викидаємо помилку, якщо `currentDailyFarm >= 500000`.
    // Прогрес у грі буде зберігатися, але монети не будуть нараховуватись, якщо ліміт вичерпано.

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

    let coinsToGive = Math.floor(Number(score) * payoutPerScore * (1 + Math.floor(Number(score) / 5) * 0.1));
    if (isNaN(coinsToGive) || coinsToGive < 0) coinsToGive = 0;

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
        activeMinigame: null,
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
const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king', 'ace'];

function getCardValue(rank) {
  if (['jack', 'queen', 'king'].includes(rank)) return 10;
  if (rank === 'ace') return 11;
  return parseInt(rank, 10);
}

function getHandScore(hand) {
  let score = 0;
  let aces = 0;
  for (const card of hand) {
    score += card.value;
    if (card.rank === 'ace') aces += 1;
  }
  while (score > 21 && aces > 0) {
    score -= 10;
    aces -= 1;
  }
  return score;
}

function createDeck() {
  const newDeck = [];
  const suitMap = { clubs: 'Clubs', diamonds: 'Diamonds', hearts: 'Hearts', spades: 'Spades' };
  const rankMap = { jack: 'J', queen: 'Q', king: 'K', ace: 'A' };
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      newDeck.push({
        suit,
        rank,
        value: getCardValue(rank),
        image: `/png/card${suitMap[suit]}${rankMap[rank] || rank}.png`,
      });
    }
  }
  // Shuffle
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
}

app.get('/api/game/blackjack/state', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    if (!user.blackjackState) {
      return res.json({ success: true, state: null });
    }

    // Convert DB state string to object if necessary
    const state =
      typeof user.blackjackState === 'string'
        ? JSON.parse(user.blackjackState)
        : user.blackjackState;

    res.json({ success: true, state });
  } catch (error) {
    console.error('Error fetching blackjack state:', error);
    res.status(500).json({ error: 'Помилка сервера.' });
  }
});

app.post('/api/game/blackjack/start', authenticate, async (req, res) => {
  const { betAmount } = req.body;

  const parsedBet = parseInt(betAmount, 10);
  if (isNaN(parsedBet) || parsedBet < 10)
    return res.status(400).json({ error: 'Мінімальна ставка 10 монет.' });

  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });

    // Prevent starting a new game if one is active
    if (user.blackjackState) {
      const currentState =
        typeof user.blackjackState === 'string'
          ? JSON.parse(user.blackjackState)
          : user.blackjackState;

      if (currentState.gameState && currentState.gameState !== 'betting') {
        return res
          .status(400)
          .json({ error: 'Ваша гра вже триває! Спочатку завершіть поточну гру.' });
      }
    }

    if (user.coins < parsedBet) return res.status(400).json({ error: 'Недостатньо монет!' });

    // Deduct coins and create initial state
    const deck = createDeck();
    const playerHand = [deck.pop(), deck.pop()];
    const dealerHand = [deck.pop(), deck.pop()];

    const playerState = {
      deck,
      playerHand,
      dealerHand,
      betAmount: parsedBet,
      gameState: 'playing',
      gameResult: null,
      earnedCoins: 0,
    };

    const pScore = getHandScore(playerHand);
    const dScore = getHandScore(dealerHand);

    let updatedUser;

    // We use updateMany for atomic operation. Prevent race condition by ensuring user.blackjackState is null exactly when we start the game,
    // and they have enough coins.
    const startResult = await prisma.user.updateMany({
      where: {
        uid: user.uid,
        blackjackState: { equals: Prisma.AnyNull }, // Only start if no active game
        coins: { gte: parsedBet }, // Only start if they have enough coins at this exact moment
      },
      data: {
        coins: { decrement: pScore === 21 ? parsedBet - playerState.earnedCoins : parsedBet },
        blackjackState: pScore === 21 ? Prisma.DbNull : playerState,
      },
    });

    if (startResult.count === 0) {
      return res.status(400).json({
        error: 'Не вдалося розпочати гру. Можливо, у вас вже є активна гра або недостатньо монет.',
      });
    }

    updatedUser = await prisma.user.findUnique({ where: { uid: user.uid } });

    res.json({ success: true, profile: updatedUser, state: playerState });
  } catch (error) {
    console.error('Error starting blackjack:', error);
    res.status(500).json({ error: 'Помилка сервера.' });
  }
});

app.post('/api/game/blackjack/hit', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });

    if (!user.blackjackState) {
      return res.status(400).json({ error: 'Немає активної гри.' });
    }

    const state =
      typeof user.blackjackState === 'string'
        ? JSON.parse(user.blackjackState)
        : user.blackjackState;

    if (state.gameState !== 'playing') {
      return res.status(400).json({ error: 'Додаткові карти неможливі на цьому етапі.' });
    }

    const newDeck = [...state.deck];
    const card = newDeck.pop();
    const newHand = [...state.playerHand, card];

    state.deck = newDeck;
    state.playerHand = newHand;

    let updatedUser;

    // Check bust
    if (getHandScore(newHand) > 21) {
      state.gameState = 'game_over';
      state.gameResult = 'lose';
      state.earnedCoins = 0;

      const hitResult = await prisma.user.updateMany({
        where: {
          uid: user.uid,
          blackjackState: { not: Prisma.AnyNull },
        },
        data: { blackjackState: Prisma.DbNull },
      });

      if (hitResult.count === 0) {
        return res.status(400).json({ error: 'Помилка оновлення стану гри.' });
      }
    } else {
      const hitResult = await prisma.user.updateMany({
        where: {
          uid: user.uid,
          blackjackState: { not: Prisma.AnyNull },
        },
        data: { blackjackState: state },
      });

      if (hitResult.count === 0) {
        return res.status(400).json({ error: 'Помилка оновлення стану гри.' });
      }
    }

    updatedUser = await prisma.user.findUnique({ where: { uid: user.uid } });

    res.json({ success: true, profile: updatedUser, state });
  } catch (error) {
    console.error('Error in blackjack hit:', error);
    res.status(500).json({ error: 'Помилка сервера.' });
  }
});

app.post('/api/game/blackjack/stand', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });

    if (!user.blackjackState) {
      return res.status(400).json({ error: 'Немає активної гри.' });
    }

    const state =
      typeof user.blackjackState === 'string'
        ? JSON.parse(user.blackjackState)
        : user.blackjackState;

    if (state.gameState !== 'playing') {
      return res.status(400).json({ error: 'Неправильний етап гри.' });
    }

    // Dealer draws cards until 17
    const newDeck = [...state.deck];
    const dHand = [...state.dealerHand];

    while (getHandScore(dHand) < 17) {
      dHand.push(newDeck.pop());
    }

    state.deck = newDeck;
    state.dealerHand = dHand;
    state.gameState = 'game_over';

    const pScore = getHandScore(state.playerHand);
    const dScore = getHandScore(state.dealerHand);

    if (dScore > 21) {
      state.gameResult = 'win';
      state.earnedCoins = state.betAmount * 2;
    } else if (dScore > pScore) {
      state.gameResult = 'lose';
      state.earnedCoins = 0;
    } else if (dScore < pScore) {
      state.gameResult = 'win';
      state.earnedCoins = state.betAmount * 2;
    } else {
      state.gameResult = 'push';
      state.earnedCoins = Math.floor(state.betAmount);
    }

    let updatedUser;

    // Clear the active game state and award coins if any
    const standResult = await prisma.user.updateMany({
      where: {
        uid: user.uid,
        blackjackState: { not: Prisma.AnyNull },
      },
      data: {
        coins: state.earnedCoins > 0 ? { increment: state.earnedCoins } : undefined,
        blackjackState: Prisma.DbNull,
      },
    });

    if (standResult.count === 0) {
      return res.status(400).json({ error: 'Гра вже була завершена.' });
    }

    updatedUser = await prisma.user.findUnique({ where: { uid: user.uid } });

    res.json({ success: true, profile: updatedUser, state });
  } catch (error) {
    console.error('Error in blackjack stand:', error);
    res.status(500).json({ error: 'Помилка сервера.' });
  }
});

// ----------------------------------------
// CRASH
// ----------------------------------------

function getCrashMultiplier(hash) {
  // 1. Беремо перші 52 біти з SHA-256 хешу раунду (13 hex-символів)
  const h = parseInt(hash.slice(0, 13), 16);
  const e = Math.pow(2, 52); // Максимальне можливе значення

  // 2. Імплементація 1% House Edge (Миттєвий краш)
  // Якщо число ділиться на 100 без остачі, гра миттєво падає на 1.00x
  if (h % 100 === 0) {
    return 1.0;
  }

  // 3. Розрахунок множника для інших 99% раундів
  // Формула: 100 * E / (E - H), з округленням до двох знаків після коми
  const multiplier = Math.floor((100 * e) / (e - h)) / 100;

  // Обмежуємо максимальний множник до 1000000 та повертаємо
  return Math.min(multiplier, 1000000.0);
}

app.post('/api/game/crash/start', authenticate, async (req, res) => {
  const { betAmount } = req.body;
  const bet = parseInt(betAmount, 10);

  if (isNaN(bet) || bet < 10) return res.status(400).json({ error: 'Мінімальна ставка 10 монет.' });

  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    if (user.coins < bet) return res.status(400).json({ error: 'Недостатньо монет!' });

    // Створюємо гру
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(serverSeed).digest('hex');
    const crashPoint = getCrashMultiplier(hash);
    const gameId = Date.now().toString() + Math.random().toString(36).substring(7);

    // Зберігаємо в пам'яті
    activeCrashGames.set(gameId, {
      userId: user.uid,
      bet,
      crashPoint,
      serverSeed,
      hash,
      startTime: Date.now(),
      status: 'playing', // 'playing' або 'cashed_out' або 'crashed'
    });

    // Віднімаємо ставку
    const updatedUser = await prisma.user.update({
      where: { uid: user.uid },
      data: { coins: { decrement: bet } },
    });

    // Очистка старих ігор з пам'яті
    if (activeCrashGames.size > 1000) {
      for (let key of activeCrashGames.keys()) {
        activeCrashGames.delete(key);
        break;
      }
    }

    // Повертаємо тільки хеш, щоб гравець не знав краш-поінт, але міг перевірити його потім
    res.json({ success: true, gameId, hash, profile: updatedUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Помилка сервера при старті Crash.' });
  }
});

app.post('/api/game/crash/cashout', authenticate, async (req, res) => {
  const { gameId, multiplier } = req.body;

  try {
    const game = activeCrashGames.get(gameId);
    if (!game) return res.status(400).json({ error: 'Гру не знайдено або вже завершено.' });
    if (game.userId !== req.user.uid) return res.status(403).json({ error: 'Це не ваша гра.' });

    // Перевірка часу життя гри, якщо вона ще playing, можливо вона вже мала б крашнутись
    const expectedFinalTimeMs = Math.log(game.crashPoint) / 0.00006;
    if (Date.now() - game.startTime >= expectedFinalTimeMs) {
      game.status = 'crashed';
      return res.status(400).json({ error: 'Ви не встигли! Краш вже відбувся.' });
    }

    if (game.status !== 'playing') return res.status(400).json({ error: 'Гру вже завершено.' });

    game.status = 'cashed_out';

    // Античіт: час, який пройшов
    const timeElapsedMs = Date.now() - game.startTime;
    // Графік: M = e^(0.00006 * час) -> час = ln(M) / 0.00006. (0.00006 дає x2 за ~11 секунд)
    const expectedTimeMs = Math.log(multiplier) / 0.00006;

    // Похибка 1.5 сек на лаги
    if (timeElapsedMs < expectedTimeMs - 1500) {
      return res.status(400).json({ error: 'Підозрілий час виходу. Ставку анульовано.' });
    }

    if (multiplier <= game.crashPoint) {
      const winAmount = Math.floor(game.bet * multiplier);
      const updatedUser = await prisma.user.update({
        where: { uid: req.user.uid },
        data: { coins: { increment: winAmount } },
      });
      res.json({
        success: true,
        winAmount,
        profile: updatedUser,
        crashPoint: game.crashPoint,
        serverSeed: game.serverSeed,
      });
    } else {
      game.status = 'crashed';
      res.status(400).json({ error: 'Ви не встигли! Краш вже відбувся.' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Помилка сервера під час Crash.' });
  }
});

app.get('/api/game/crash/:gameId/status', authenticate, (req, res) => {
  const { gameId } = req.params;
  const game = activeCrashGames.get(gameId);

  if (!game) {
    return res.status(404).json({ error: 'Гру не знайдено' });
  }

  // Час, коли гра має закінчитись
  const expectedFinalTimeMs = Math.log(game.crashPoint) / 0.00006;
  const timeElapsedMs = Date.now() - game.startTime;

  if (timeElapsedMs >= expectedFinalTimeMs) {
    game.status = 'crashed';
    return res.json({
      status: 'crashed',
      crashPoint: game.crashPoint,
      serverSeed: game.serverSeed,
      hash: game.hash,
    });
  }

  // Якщо гравець вже забрав, але краш ще не стався для відображення
  if (game.status === 'cashed_out') {
    return res.json({
      status: 'cashed_out',
    });
  }

  return res.json({
    status: 'playing',
  });
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
  const { x, y, name, icon, color, entryFee, cooldownMinutes, crystalRatePerHour, areaPolygon, isLandingZone, neighborIds, battleMode, chipDamageChance } = req.body;
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
        areaPolygon: areaPolygon || [],
        isLandingZone: !!isLandingZone,
        neighborIds: Array.isArray(neighborIds) ? neighborIds : [],
        battleMode: battleMode || 'FULL',
        chipDamageChance: chipDamageChance ? Number(chipDamageChance) : 0,
      },
    });
    res.json({ success: true, point: newPoint });
  } catch (error) {
    res.status(500).json({ error: 'Помилка створення точки.' });
  }
});

app.put('/api/admin/arena/points/:id', authenticate, checkAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, icon, color, entryFee, cooldownMinutes, crystalRatePerHour, areaPolygon, isLandingZone, neighborIds, ownerId, ownerNickname, defendingCards, capturedAt, crystalsLastClaimedAt, battleMode, chipDamageChance } = req.body;
  try {
    const updateData = {
      name: name || 'Точка Арени',
      icon: icon || 'castle',
      color: color || '#4f46e5',
      entryFee: entryFee !== undefined ? Number(entryFee) : 0,
      cooldownMinutes: cooldownMinutes !== undefined ? Number(cooldownMinutes) : 15,
      crystalRatePerHour: crystalRatePerHour !== undefined ? Number(crystalRatePerHour) : 0,
      areaPolygon: areaPolygon,
      isLandingZone: isLandingZone !== undefined ? !!isLandingZone : undefined,
      neighborIds: Array.isArray(neighborIds) ? neighborIds : undefined,
    };

    if (battleMode !== undefined) updateData.battleMode = battleMode;
    if (chipDamageChance !== undefined) updateData.chipDamageChance = Number(chipDamageChance);

    if (ownerId !== undefined) updateData.ownerId = ownerId;
    if (ownerNickname !== undefined) updateData.ownerNickname = ownerNickname;
    if (defendingCards !== undefined) updateData.defendingCards = defendingCards;
    if (capturedAt !== undefined) updateData.capturedAt = capturedAt;
    if (crystalsLastClaimedAt !== undefined) updateData.crystalsLastClaimedAt = crystalsLastClaimedAt;

    const updatedPoint = await prisma.arenaPoint.update({
      where: { id },
      data: updateData,
    });
    res.json({ success: true, point: updatedPoint });
  } catch (error) {
    res.status(500).json({ error: 'Помилка оновлення точки.' });
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
      include: { inventory: true },
    });

    const cardIds = [...new Set(cards.map((c) => c.id))];
    const catalogCards = await prisma.cardCatalog.findMany({ where: { id: { in: cardIds } } });

    const RARITY_MIN_POWER = {
      Унікальна: 100,
      Легендарна: 50,
      Епічна: 25,
      Рідкісна: 10,
      Звичайна: 5,
    };

    const validatedCards = [];
    const usedIndicesByCard = {};

    for (let c of cards) {
      const invItem = user.inventory.find((item) => item.cardId === c.id);
      if (!invItem)
        return res.status(400).json({ error: 'Ви не маєте обраних карт у своєму інвентарі!' });

      const catalogCard = catalogCards.find((cat) => cat.id === c.id);
      if (!catalogCard) return res.status(400).json({ error: 'Недійсна карта.' });

      let currentStats = [];
      if (typeof invItem.gameStats === 'string') {
        try {
          currentStats = JSON.parse(invItem.gameStats);
        } catch (e) {}
      } else if (Array.isArray(invItem.gameStats)) {
        currentStats = invItem.gameStats;
      }

      const minPower = RARITY_MIN_POWER[catalogCard.rarity] || 5;
      const minHp = minPower * 2;

      const effectiveStats = currentStats.map((s) => ({
        power: s.power !== undefined && s.power !== null ? Number(s.power) : minPower,
        hp: s.hp !== undefined && s.hp !== null ? Number(s.hp) : minHp,
        maxHp:
          s.maxHp !== undefined && s.maxHp !== null
            ? Number(s.maxHp)
            : s.hp !== undefined && s.hp !== null
              ? Number(s.hp)
              : minHp,
      }));

      while (effectiveStats.length < invItem.amount) {
        effectiveStats.push({ power: minPower, hp: minHp });
      }

      // Truncate to actual amount (gameStats may have stale entries from sold/traded copies)
      effectiveStats.length = invItem.amount;

      const idx = c.statsIndex;
      if (idx === undefined || idx === null || idx < 0 || idx >= effectiveStats.length) {
        return res.status(400).json({ error: `Недійсні характеристики карти "${catalogCard.name}" (індекс ${idx}, доступно ${effectiveStats.length}).` });
      }

      if (!usedIndicesByCard[c.id]) usedIndicesByCard[c.id] = new Set();
      if (usedIndicesByCard[c.id].has(idx)) {
        return res
          .status(400)
          .json({ error: 'Ви не можете використовувати один і той же екземпляр карти двічі.' });
      }
      usedIndicesByCard[c.id].add(idx);

      validatedCards.push({
        ...catalogCard,
        id: c.id,
        power: effectiveStats[idx].power,
        hp: effectiveStats[idx].hp,
        maxHp: effectiveStats[idx].maxHp || effectiveStats[idx].hp,
        currentHp: effectiveStats[idx].hp,
        statsIndex: idx,
      });
    }

    // Перевірка: чи карти вже захищають іншу точку
    const defendingInstances = await getDefendingInstances(user.uid);
    for (const vc of validatedCards) {
      const isDefending = defendingInstances.some(
        (inst) => inst.cardId === vc.id && inst.statsIndex === vc.statsIndex
      );
      if (isDefending) {
        return res.status(400).json({ error: `Карта "${vc.name}" вже захищає іншу точку Арени!` });
      }
    }

    const point = await prisma.arenaPoint.findUnique({ where: { id } });

    if (!point) return res.status(404).json({ error: 'Точку не знайдено.' });

    // Перевірка доступу: якщо точка НЕ landing zone — гравець повинен володіти хоча б одним сусідом
    if (!point.isLandingZone) {
      const neighborIds = Array.isArray(point.neighborIds) ? point.neighborIds : [];
      if (neighborIds.length === 0) {
        return res.status(400).json({ error: 'Ця точка недоступна для захоплення (немає з\'єднаних зон висадки).' });
      }
      const ownedNeighbors = await prisma.arenaPoint.findMany({
        where: { id: { in: neighborIds }, ownerId: user.uid },
      });
      if (ownedNeighbors.length === 0) {
        return res.status(400).json({ error: 'Щоб атакувати цю точку, спершу захопіть сусідню зону!' });
      }
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
            defendingCards: validatedCards.map((c) => ({
              ...c,
              hp: c.currentHp <= 0 ? c.maxHp : c.currentHp,
            })),
          },
        });
      });

      const updatedUser = await prisma.user.findUnique({
        where: { uid: user.uid },
        include: { inventory: true },
      });
      const updatedPoint = await prisma.arenaPoint.findUnique({ where: { id } });
      const updatedDefending = await getDefendingInstances(user.uid);
      const profileWithDefending = { ...updatedUser, defendingInstances: updatedDefending };

      return res.json({
        success: true,
        message: 'Точка Успішно захоплена',
        profile: profileWithDefending,
        point: updatedPoint,
      });
    } else {
      // Точка вже має власника
      const capturedTime = new Date(point.capturedAt).getTime();
      const cdMs = point.cooldownMinutes * 60 * 1000;
      const cdUntil = capturedTime + cdMs;

      if (Date.now() < cdUntil) {
        return res.status(400).json({ error: 'Точка ще під захистом (Кулдаун).' });
      }

      return res
        .status(400)
        .json({ error: 'Механіка битви ще в розробці. Слідкуйте за оновленнями!' });
    }
  } catch (error) {
    console.error('Помилка захоплення точки:', error);
    res.status(500).json({ error: 'Помилка захоплення точки.' });
  }
});

app.post('/api/game/arena/points/:id/battle', authenticate, async (req, res) => {
  const { id } = req.params;
  const { cards } = req.body;
  console.log('[BATTLE START REQUEST]', { pointId: id, uid: req.user.uid, cardsCount: cards ? cards.length : 'undefined', cardsIsArray: Array.isArray(cards) });
  if (!cards || !Array.isArray(cards) || cards.length !== 5) {
    console.log('[BATTLE START ERROR] Forcing 400: Для бою необхідно обрати рівно 5 карт!');
    return res.status(400).json({ error: 'Для бою необхідно обрати рівно 5 карт!' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { uid: req.user.uid },
      include: { inventory: true },
    });

    const cardIds = [...new Set(cards.map((c) => c.id))];
    const catalogCards = await prisma.cardCatalog.findMany({ where: { id: { in: cardIds } } });

    const RARITY_MIN_POWER = {
      Унікальна: 100,
      Легендарна: 50,
      Епічна: 25,
      Рідкісна: 10,
      Звичайна: 5,
    };

    const validatedCards = [];
    const usedIndicesByCard = {};

    for (let c of cards) {
      const invItem = user.inventory.find((item) => item.cardId === c.id);
      if (!invItem)
        return res.status(400).json({ error: 'Ви не маєте обраних карт у своєму інвентарі!' });

      const catalogCard = catalogCards.find((cat) => cat.id === c.id);
      if (!catalogCard) return res.status(400).json({ error: 'Недійсна карта.' });

      let currentStats = [];
      if (typeof invItem.gameStats === 'string') {
        try {
          currentStats = JSON.parse(invItem.gameStats);
        } catch (e) {}
      } else if (Array.isArray(invItem.gameStats)) {
        currentStats = invItem.gameStats;
      }

      const minPower = RARITY_MIN_POWER[catalogCard.rarity] || 5;
      const minHp = minPower * 2;

      const effectiveStats = currentStats.map((s) => ({
        power: s.power !== undefined && s.power !== null ? Number(s.power) : minPower,
        hp: s.hp !== undefined && s.hp !== null ? Number(s.hp) : minHp,
        maxHp:
          s.maxHp !== undefined && s.maxHp !== null
            ? Number(s.maxHp)
            : s.hp !== undefined && s.hp !== null
              ? Number(s.hp)
              : minHp,
      }));

      while (effectiveStats.length < invItem.amount) {
        effectiveStats.push({ power: minPower, hp: minHp });
      }

      // Truncate to actual amount (gameStats may have stale entries from sold/traded copies)
      effectiveStats.length = invItem.amount;

      const idx = c.statsIndex;
      if (idx === undefined || idx === null || idx < 0 || idx >= effectiveStats.length) {
        return res.status(400).json({ error: 'Недійсні характеристики карти.' });
      }

      if (!usedIndicesByCard[c.id]) usedIndicesByCard[c.id] = new Set();
      if (usedIndicesByCard[c.id].has(idx)) {
        return res
          .status(400)
          .json({ error: 'Ви не можете використовувати один і той же екземпляр карти двічі.' });
      }
      usedIndicesByCard[c.id].add(idx);

      validatedCards.push({
        ...catalogCard,
        id: c.id,
        power: effectiveStats[idx].power,
        hp: effectiveStats[idx].hp,
        maxHp: effectiveStats[idx].maxHp || effectiveStats[idx].hp,
        currentHp: effectiveStats[idx].hp,
        statsIndex: idx,
      });
    }

    // Перевірка: чи карти вже захищають іншу точку
    const defendingInstances = await getDefendingInstances(user.uid);
    for (const vc of validatedCards) {
      const isDefending = defendingInstances.some(
        (inst) => inst.cardId === vc.id && inst.statsIndex === vc.statsIndex
      );
      if (isDefending) {
        return res.status(400).json({ error: `Карта "${vc.name}" вже захищає іншу точку Арени!` });
      }
    }

    const point = await prisma.arenaPoint.findUnique({ where: { id } });

    if (!point) return res.status(404).json({ error: 'Точку не знайдено.' });
    if (!point.ownerId)
      return res.status(400).json({ error: 'Точка вільна, її можна просто захопити.' });
    if (point.ownerId === user.uid)
      return res.status(400).json({ error: 'Ви не можете атакувати власну точку.' });

    // Перевірка доступу: якщо точка НЕ landing zone — гравець повинен володіти хоча б одним сусідом
    if (!point.isLandingZone) {
      const neighborIds = Array.isArray(point.neighborIds) ? point.neighborIds : [];
      if (neighborIds.length === 0) {
        return res.status(400).json({ error: 'Ця точка недоступна для атаки (немає з\'єднаних зон висадки).' });
      }
      const ownedNeighbors = await prisma.arenaPoint.findMany({
        where: { id: { in: neighborIds }, ownerId: user.uid },
      });
      if (ownedNeighbors.length === 0) {
        return res.status(400).json({ error: 'Щоб атакувати цю точку, спершу захопіть сусідню зону!' });
      }
    }



    if (user.coins < point.entryFee) {
      return res.status(400).json({ error: 'Недостатньо монет для атаки.' });
    }

    const capturedTime = new Date(point.capturedAt).getTime();
    const cdMs = point.cooldownMinutes * 60 * 1000;
    const cdUntil = capturedTime + cdMs;

    if (Date.now() < cdUntil) {
      return res.status(400).json({ error: 'Точка ще під захистом (Кулдаун).' });
    }

    // Симуляція бою (Perk-aware)
    const attackerCards = validatedCards;
    const defenderCards = (point.defendingCards || []).map((c) => {
      const maxHp = (c.maxHp !== undefined && c.maxHp !== null && c.maxHp > 0)
        ? c.maxHp
        : (c.hp !== undefined && c.hp !== null && c.hp > 0)
          ? c.hp
          : c.power || 1;
      const currentHp = (c.hp !== undefined && c.hp !== null && c.hp > 0)
        ? c.hp
        : maxHp;
      return { ...c, currentHp, maxHp };
    });

    const battleLog = [];
    const isTeamDead = (team) => team.every((c) => c.currentHp <= 0);

    if (isTeamDead(attackerCards)) {
      return res.status(400).json({ error: "Ваші картки не мають здоров'я (0 ХП) для бою!" });
    }
    if (isTeamDead(defenderCards)) {
      battleLog.push({ note: 'Захисники не мали HP — автоматична перемога атакуючого.' });
    }

    // Perk state tracking
    const lastStandUsed = { attacker: new Array(attackerCards.length).fill(false), defender: new Array(defenderCards.length).fill(false) };
    const poisonStacks = { attacker: new Array(attackerCards.length).fill(null), defender: new Array(defenderCards.length).fill(null) };

    // Target selection with Taunt priority
    const getTargetIndex = (attackerIndex, defenders) => {
      const taunters = [];
      for (let i = 0; i < defenders.length; i++) {
        if (defenders[i].currentHp > 0 && defenders[i].perk === 'taunt') taunters.push(i);
      }
      if (taunters.length > 0) {
        let best = taunters[0];
        let bestDist = Math.abs(attackerIndex - taunters[0]);
        for (let t = 1; t < taunters.length; t++) {
          const d = Math.abs(attackerIndex - taunters[t]);
          if (d < bestDist) { bestDist = d; best = taunters[t]; }
        }
        return best;
      }
      if (defenders[attackerIndex] && defenders[attackerIndex].currentHp > 0) return attackerIndex;
      let closestIdx = -1, minDist = 999;
      for (let i = 0; i < defenders.length; i++) {
        if (defenders[i].currentHp > 0) {
          const d = Math.abs(attackerIndex - i);
          if (d < minDist) { minDist = d; closestIdx = i; }
        }
      }
      return closestIdx;
    };

    // Find lowest-HP-% ally for Healer
    const findHealTarget = (team) => {
      let idx = -1, low = 1.0;
      for (let i = 0; i < team.length; i++) {
        if (team[i].currentHp > 0 && team[i].currentHp < (team[i].maxHp || team[i].hp || 1)) {
          const p = team[i].currentHp / (team[i].maxHp || team[i].hp || 1);
          if (p < low) { low = p; idx = i; }
        }
      }
      return idx;
    };

    // Poison ticks at start of turn
    const applyPoisonTicks = (side, team) => {
      for (let i = 0; i < team.length; i++) {
        const ps = poisonStacks[side][i];
        if (ps && ps.turnsLeft > 0 && team[i].currentHp > 0) {
          team[i].currentHp -= ps.damage;
          ps.turnsLeft--;
          if (ps.turnsLeft <= 0) poisonStacks[side][i] = null;
          if (team[i].currentHp <= 0 && team[i].perk === 'laststand' && !lastStandUsed[side][i]) {
            team[i].currentHp = 1; lastStandUsed[side][i] = true;
            battleLog.push({ attackerSide: side === 'attacker' ? 'defender' : 'attacker', attackerIndex: -1, targetIndex: i, damage: ps.damage, isTargetDead: false, events: ['poison_tick', 'laststand'] });
          } else {
            battleLog.push({ attackerSide: side === 'attacker' ? 'defender' : 'attacker', attackerIndex: -1, targetIndex: i, damage: ps.damage, isTargetDead: team[i].currentHp <= 0, events: ['poison_tick'] });
          }
        }
      }
    };

    // Single attack with all perks
    const performAttack = (aSide, aIdx, aTeam, dTeam) => {
      const atk = aTeam[aIdx];
      if (!atk || atk.currentHp <= 0) return false;
      const dSide = aSide === 'attacker' ? 'defender' : 'attacker';

      // Healer perk
      if (atk.perk === 'healer') {
        const hIdx = findHealTarget(aTeam);
        if (hIdx !== -1) {
          const hAmt = Math.max(1, Math.floor(atk.power * ((atk.perkValue || 30) / 100)));
          const mxHp = aTeam[hIdx].maxHp || aTeam[hIdx].hp || 1;
          const old = aTeam[hIdx].currentHp;
          aTeam[hIdx].currentHp = Math.min(mxHp, aTeam[hIdx].currentHp + hAmt);
          battleLog.push({ attackerSide: aSide, attackerIndex: aIdx, targetIndex: hIdx, damage: 0, isTargetDead: false, events: ['healer'], healAmount: aTeam[hIdx].currentHp - old, healTargetSide: aSide });
          return true;
        }
      }

      const tIdx = getTargetIndex(aIdx, dTeam);
      if (tIdx === -1) return false;
      const tgt = dTeam[tIdx];
      const ev = [];
      const base = atk.power;
      const rng = base * 0.25;
      let dmg = Math.max(1, Math.floor(base - rng + Math.random() * (rng * 2)));

      // Dodge
      if (tgt.perk === 'dodge' && Math.random() * 100 < (tgt.perkValue || 20)) {
        battleLog.push({ attackerSide: aSide, attackerIndex: aIdx, targetIndex: tIdx, damage: 0, isTargetDead: false, events: ['dodge'] });
        return true;
      }
      // Crit
      if (atk.perk === 'crit' && Math.random() * 100 < (atk.perkValue || 20)) { dmg *= 2; ev.push('crit'); }
      // Armor
      if (tgt.perk === 'armor') { dmg = Math.max(1, dmg - Math.floor(dmg * ((tgt.perkValue || 20) / 100))); ev.push('armor'); }

      tgt.currentHp -= dmg;

      // Last Stand
      if (tgt.currentHp <= 0 && tgt.perk === 'laststand' && !lastStandUsed[dSide][tIdx]) {
        tgt.currentHp = 1; lastStandUsed[dSide][tIdx] = true; ev.push('laststand');
      }
      const dead = tgt.currentHp <= 0;

      // Lifesteal
      let heal = 0;
      if (atk.perk === 'lifesteal') {
        heal = Math.max(1, Math.floor(dmg * ((atk.perkValue || 25) / 100)));
        atk.currentHp = Math.min(atk.maxHp || atk.hp || 1, atk.currentHp + heal);
        ev.push('lifesteal');
      }
      // Poison
      let poisoned = false;
      if (atk.perk === 'poison' && !dead) {
        poisonStacks[dSide][tIdx] = { damage: atk.perkValue || 5, turnsLeft: 3 };
        ev.push('poison'); poisoned = true;
      }
      // Thorns
      let thorns = 0;
      if (tgt.perk === 'thorns') {
        thorns = Math.max(1, Math.floor(dmg * ((tgt.perkValue || 25) / 100)));
        atk.currentHp -= thorns; ev.push('thorns');
        if (atk.currentHp <= 0 && atk.perk === 'laststand' && !lastStandUsed[aSide][aIdx]) {
          atk.currentHp = 1; lastStandUsed[aSide][aIdx] = true;
        }
      }

      battleLog.push({ attackerSide: aSide, attackerIndex: aIdx, targetIndex: tIdx, damage: dmg, isTargetDead: dead, events: ev, healAmount: heal || undefined, thornsDamage: thorns || undefined, poisonApplied: poisoned || undefined });

      // Cleave
      if (atk.perk === 'cleave') {
        const splash = Math.max(1, Math.floor(dmg * ((atk.perkValue || 30) / 100)));
        for (const adj of [tIdx - 1, tIdx + 1]) {
          if (adj >= 0 && adj < dTeam.length && dTeam[adj].currentHp > 0) {
            dTeam[adj].currentHp -= splash;
            if (dTeam[adj].currentHp <= 0 && dTeam[adj].perk === 'laststand' && !lastStandUsed[dSide][adj]) { dTeam[adj].currentHp = 1; lastStandUsed[dSide][adj] = true; }
            battleLog.push({ attackerSide: aSide, attackerIndex: aIdx, targetIndex: adj, damage: splash, isTargetDead: dTeam[adj].currentHp <= 0, events: ['cleave'] });
          }
        }
      }
      return true;
    };

    let turnCount = 0;
    const MAX_TURNS = 100;
    while (!isTeamDead(attackerCards) && !isTeamDead(defenderCards) && turnCount < MAX_TURNS) {
      turnCount++;
      let anyAttack = false;
      if (turnCount > 1) {
        applyPoisonTicks('attacker', attackerCards);
        applyPoisonTicks('defender', defenderCards);
        if (isTeamDead(attackerCards) || isTeamDead(defenderCards)) break;
      }
      const mc = Math.max(attackerCards.length, defenderCards.length);
      for (let i = 0; i < mc; i++) {
        if (attackerCards[i]?.currentHp > 0 && !isTeamDead(defenderCards)) { if (performAttack('attacker', i, attackerCards, defenderCards)) anyAttack = true; }
        if (defenderCards[i]?.currentHp > 0 && !isTeamDead(attackerCards)) { if (performAttack('defender', i, defenderCards, attackerCards)) anyAttack = true; }
      }
      if (!anyAttack) break;
    }

    let attackerWon;
    if (isTeamDead(defenderCards)) { attackerWon = true; }
    else if (isTeamDead(attackerCards)) { attackerWon = false; }
    else {
      const hpPct = (t) => { const a = t.filter(c => c.currentHp > 0); return a.length === 0 ? 0 : a.reduce((s, c) => s + c.currentHp / (c.maxHp || 1), 0) / t.length; };
      const aPct = hpPct(attackerCards), dPct = hpPct(defenderCards);
      attackerWon = aPct >= dPct;
      battleLog.push({ note: `\u0422\u0430\u0439\u043c-\u0430\u0443\u0442 (${turnCount} \u0445\u043e\u0434\u0456\u0432). \u0410\u0442\u0430\u043a\u0443\u044e\u0447\u0438\u0439 HP: ${(aPct * 100).toFixed(1)}%, \u0417\u0430\u0445\u0438\u0441\u043d\u0438\u043a HP: ${(dPct * 100).toFixed(1)}%` });
    }
    let updatedPoint = point;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { uid: user.uid },
        data: { coins: { decrement: point.entryFee } },
      });

      // Збереження пошкоджень атакуючих
      for (const card of attackerCards) {
        const invItem = user.inventory.find((item) => item.cardId === card.id);
        if (!invItem) continue;

        let currentStats = [];
        if (typeof invItem.gameStats === 'string') {
          try {
            currentStats = JSON.parse(invItem.gameStats);
          } catch (e) {}
        } else if (Array.isArray(invItem.gameStats)) {
          currentStats = invItem.gameStats;
        }

        const effectiveStats = currentStats.map((s) => ({
          power: s.power !== undefined && s.power !== null ? Number(s.power) : card.power,
          hp: s.hp !== undefined && s.hp !== null ? Number(s.hp) : card.hp,
          maxHp:
            s.maxHp !== undefined && s.maxHp !== null
              ? Number(s.maxHp)
              : s.hp !== undefined && s.hp !== null
                ? Number(s.hp)
                : card.hp,
        }));

        while (effectiveStats.length < invItem.amount) {
          effectiveStats.push({ power: card.power, hp: card.hp, maxHp: card.maxHp || card.hp }); // Оригінальні арти
        }

        let stat = effectiveStats[card.statsIndex];
        if (!stat) continue; // Safety check
        if (!stat.maxHp) stat.maxHp = card.maxHp || card.hp;

        if (point.battleMode === 'HARDCORE') {
          if (card.currentHp <= 0) {
            // Delete dead instance
            effectiveStats.splice(card.statsIndex, 1);
            card._isDestroyed = true; // Mark as dead for defending snapshot
            if (effectiveStats.length === 0 && invItem.amount === 1) {
              await tx.inventoryItem.delete({ where: { id: invItem.id } });
              continue;
            } else {
              await tx.inventoryItem.update({
                where: { id: invItem.id },
                data: { gameStats: effectiveStats, amount: { decrement: 1 } },
              });
              continue;
            }
          } else {
            stat.hp = card.currentHp;
            card.hp = stat.hp;
            card.maxHp = stat.maxHp;
            card.power = stat.power;
          }
        } else if (point.battleMode === 'CHIP_DAMAGE') {
          stat.hp = stat.maxHp;
          if (Math.random() * 100 < (point.chipDamageChance || 0)) {
            stat.maxHp = Math.max(1, Math.floor(stat.maxHp * 0.95));
            stat.power = Math.max(1, Math.floor(stat.power * 0.95));
            stat.hp = stat.maxHp;
          }
          card.hp = stat.hp;
          card.maxHp = stat.maxHp;
          card.power = stat.power;
        } else {
          // FULL
          stat.hp = stat.maxHp;
          card.hp = stat.hp;
          card.maxHp = stat.maxHp;
          card.power = stat.power;
        }

        await tx.inventoryItem.update({
          where: { id: invItem.id },
          data: { gameStats: effectiveStats },
        });
      }

      if (attackerWon) {
        if (point.crystalRatePerHour > 0 && point.ownerId && point.crystalsLastClaimedAt) {
          const lastClaimed = new Date(point.crystalsLastClaimedAt).getTime();
          const hoursElapsed = (Date.now() - lastClaimed) / (1000 * 60 * 60);
          const earnedCrystals = Math.floor(hoursElapsed * point.crystalRatePerHour);
          if (earnedCrystals > 0) {
            await tx.user.update({
              where: { uid: point.ownerId },
              data: { crystals: { increment: earnedCrystals } },
            });
          }
        }

        updatedPoint = await tx.arenaPoint.update({
          where: { id },
          data: {
            ownerId: user.uid,
            ownerNickname: user.nickname,
            capturedAt: new Date(),
            crystalsLastClaimedAt: new Date(),
            defendingCards: attackerCards.filter(c => !c._isDestroyed).map((c) => ({
              ...c,
              hp: c.hp, // Already updated by the loop above based on battleMode
              currentHp: undefined, // cleanup
            })),
          },
        });
      } else {
        // Захисник переміг (атаку відбито)
        updatedPoint = await tx.arenaPoint.update({
          where: { id },
          data: {
            defendingCards: defenderCards.map((c) => {
              if (point.battleMode === 'HARDCORE') {
                if (c.currentHp <= 0) return null; // Card dies permanently from defense
                return { ...c, hp: c.currentHp };
              } else if (point.battleMode === 'CHIP_DAMAGE') {
                let newMax = c.maxHp || c.hp;
                let newPow = c.power;
                if (Math.random() * 100 < (point.chipDamageChance || 0)) {
                  newMax = Math.max(1, Math.floor(newMax * 0.95));
                  newPow = Math.max(1, Math.floor(newPow * 0.95));
                }
                return { ...c, maxHp: newMax, power: newPow, hp: newMax };
              } else {
                // FULL mode
                return { ...c, hp: c.maxHp || c.hp };
              }
            }).filter(Boolean),
          },
        });
      }
    });

    const updatedUser = await prisma.user.findUnique({
      where: { uid: user.uid },
      include: { inventory: true },
    });
    const updatedDefending = await getDefendingInstances(user.uid);
    const profileWithDefending = { ...updatedUser, defendingInstances: updatedDefending };

    res.json({
      success: true,
      attackerWon,
      battleLog,
      point: updatedPoint,
      profile: profileWithDefending,
    });
  } catch (error) {
    console.error('Помилка бою на арені:', error);
    res.status(500).json({ error: 'Помилка бою.' });
  }
});

app.post('/api/game/arena/points/:id/claim', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const point = await prisma.arenaPoint.findUnique({ where: { id } });
    if (!point) return res.status(404).json({ error: 'Точку не знайдено.' });
    if (point.ownerId !== req.user.uid) return res.status(403).json({ error: 'Це не ваша точка.' });

    if (point.crystalRatePerHour <= 0 || !point.crystalsLastClaimedAt) {
      return res.status(400).json({ error: 'Ця точка не генерує кристали.' });
    }

    const lastClaimed = new Date(point.crystalsLastClaimedAt).getTime();
    const hoursElapsed = (Date.now() - lastClaimed) / (1000 * 60 * 60);
    const earnedCrystals = Math.floor(hoursElapsed * point.crystalRatePerHour);

    if (earnedCrystals <= 0) {
      return res.status(400).json({ error: 'Ще недостатньо кристалів для збору (мінімум 1 год).' });
    }

    let updatedPoint;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { uid: req.user.uid },
        data: { crystals: { increment: earnedCrystals } },
      });
      const exactTimeOfEarned = lastClaimed + (earnedCrystals / point.crystalRatePerHour) * 3600000;
      updatedPoint = await tx.arenaPoint.update({
        where: { id },
        data: { crystalsLastClaimedAt: new Date(exactTimeOfEarned) },
      });
    });

    const updatedUser = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    res.json({ success: true, earnedCrystals, point: updatedPoint, profile: updatedUser });
  } catch (error) {
    console.error('Помилка збору кристалів:', error);
    res.status(500).json({ error: 'Помилка збору кристалів.' });
  }
});

// Налаштування інтервалів для SSE Heartbeat
const HEARTBEAT_TIMEOUT = 60000; // 60 секунд (допустимий поріг неактивності)
const GARBAGE_COLLECTOR_INTERVAL = 30000; // Перевіряти кожні 30 секунд

// Garbage Collector для очищення мертвих SSE-з'єднань
const sseGarbageCollector = setInterval(() => {
  const now = Date.now();
  gameClients = gameClients.filter((client) => {
    if (now - client.lastActivity > HEARTBEAT_TIMEOUT) {
      if (!client.writableEnded) {
        client.end();
      }
      console.log(`[SSE] Видалено неактивного клієнта: ${client.id}`);
      return false;
    }
    return true;
  });

  // User notifications clients
  for (const uid in userSSEClients) {
    if (userSSEClients.hasOwnProperty(uid)) {
      userSSEClients[uid].forEach(client => {
        if (now - client.lastActivity > HEARTBEAT_TIMEOUT) {
          if (!client.writableEnded) {
            client.end();
          }
          userSSEClients[uid].delete(client);
        }
      });
      if (userSSEClients[uid].size === 0) {
        delete userSSEClients[uid];
      }
    }
  }
}, GARBAGE_COLLECTOR_INTERVAL);

// Keep-Alive Ping для обходу буферизації проксі (напр. Vite)
const sseKeepAlive = setInterval(() => {
  const pingMessage = `:\n\n`; // SSE comment for keep-alive

  gameClients.forEach(client => {
    client.write(pingMessage);
    if (client.flush) client.flush();
  });

  for (const uid in userSSEClients) {
    if (userSSEClients.hasOwnProperty(uid)) {
      userSSEClients[uid].forEach(client => {
        client.write(pingMessage);
        if (client.flush) client.flush();
      });
    }
  }
}, 15000);

process.on('SIGTERM', () => {
  clearInterval(sseGarbageCollector);
  clearInterval(sseKeepAlive);
});
process.on('SIGINT', () => {
  clearInterval(sseGarbageCollector);
  clearInterval(sseKeepAlive);
});

// Ендпоінт для отримання heartbeat від клієнтів
app.post('/api/games/heartbeat', (req, res) => {
  // Отримуємо ID клієнта. Оскільки це відкритий GET без auth, беремо clientId з тіла
  const clientId = req.body?.clientId; 

  if (!clientId) {
    return res.status(400).json({ error: 'Client ID is missing' });
  }

  // Знаходимо клієнта і оновлюємо timestamp
  const client = gameClients.find((c) => c.id === clientId);
  if (client) {
    client.lastActivity = Date.now();
  }
  
  // Also check userSSEClients for heartbeat
  for (const uid in userSSEClients) {
    if (userSSEClients.hasOwnProperty(uid)) {
      userSSEClients[uid].forEach(c => {
        if (c.id === clientId) {
          c.lastActivity = Date.now();
        }
      });
    }
  }

  res.status(200).send('OK');
});

app.get('/api/games/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write(`data: {"type": "CONNECTED"}\n\n`);

  // Отримуємо унікальний ідентифікатор клієнта
  const clientId = req.query.clientId || Date.now().toString();
  res.id = clientId;
  res.lastActivity = Date.now();

  gameClients.push(res);

  req.on('close', () => {
    gameClients = gameClients.filter((client) => client !== res);
  });
});

// SSE для персональних сповіщень (напр., ринок, бани)
app.get('/api/notifications/stream', authenticate, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const uid = req.user.uid;
  if (!userSSEClients[uid]) {
    userSSEClients[uid] = new Set();
  }
  
  res.id = req.query.clientId || Date.now().toString();
  res.lastActivity = Date.now();
  userSSEClients[uid].add(res);

  res.write(`data: ${JSON.stringify({ type: 'CONNECTED' })}\n\n`);

  req.on('close', () => {
    if (userSSEClients[uid]) {
      userSSEClients[uid].delete(res);
      if (userSSEClients[uid].size === 0) {
        delete userSSEClients[uid];
      }
    }
  });

  // Heartbeat endpoint updates lastActivity for this client too
});

app.get('/api/games/status', async (req, res) => {
  try {
    const settings = await prisma.gameSettings.findUnique({ where: { id: 'main' } });
    const blockedGames = settings?.data?.blockedGames || [];
    const statsRanges = settings?.data?.statsRanges || {};
    res.json({ blockedGames, statsRanges });
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
    res.json(inv.map((i) => ({ id: i.cardId, amount: i.amount, gameStats: i.gameStats })));
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
      case 'crystals':
        updatedUser = await prisma.user.update({
          where: { uid: targetUid },
          data: { crystals: payload.exact ? payload.amount : { increment: payload.amount } },
        });
        await prisma.notification.create({
          data: {
            userId: targetUid,
            type: 'admin_action',
            title: 'Зміна кристалів',
            message: `Адміністратор змінив ваш баланс кристалів. ${payload.exact ? 'Новий баланс: ' + payload.amount : 'Різниця: ' + payload.amount}`,
          },
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
      case 'stats':
        {
          const statsData = {};
          if (payload.crystals !== undefined) statsData.crystals = Number(payload.crystals);
          if (payload.totalCards !== undefined) statsData.totalCards = Number(payload.totalCards);
          if (payload.uniqueCardsCount !== undefined)
            statsData.uniqueCardsCount = Number(payload.uniqueCardsCount);
          if (payload.packsOpened !== undefined)
            statsData.packsOpened = Number(payload.packsOpened);
          if (payload.coinsSpentOnPacks !== undefined)
            statsData.coinsSpentOnPacks = Number(payload.coinsSpentOnPacks);
          if (payload.coinsEarnedFromPacks !== undefined)
            statsData.coinsEarnedFromPacks = Number(payload.coinsEarnedFromPacks);
          updatedUser = await prisma.user.update({
            where: { uid: targetUid },
            data: statsData,
          });
          await prisma.notification.create({
            data: {
              userId: targetUid,
              type: 'admin_action',
              title: 'Оновлення статистики',
              message: `Адміністратор оновив вашу ігрову статистику.`,
            },
          });
        }
        break;
      case 'giveCard':
        {
          const cardObj = await prisma.cardCatalog.findUnique({ where: { id: payload.cardId } });

          let generatedPower = 50;
          let generatedHp = 100;

          if (cardObj) {
            if (cardObj.minPower !== null && cardObj.maxPower !== null) {
              generatedPower =
                Math.floor(Math.random() * (cardObj.maxPower - cardObj.minPower + 1)) +
                cardObj.minPower;
            }
            if (cardObj.minHp !== null && cardObj.maxHp !== null) {
              generatedHp =
                Math.floor(Math.random() * (cardObj.maxHp - cardObj.minHp + 1)) + cardObj.minHp;
            }
          }

          let newStats = [];
          if (cardObj?.isGame || payload.power !== undefined || payload.hp !== undefined) {
            for (let i = 0; i < payload.amount; i++) {
              newStats.push({
                power:
                  payload.power !== undefined && payload.power !== null
                    ? Number(payload.power)
                    : cardObj?.isGame
                      ? generatedPower
                      : 0,
                hp:
                  payload.hp !== undefined && payload.hp !== null
                    ? Number(payload.hp)
                    : cardObj?.isGame
                      ? generatedHp
                      : 0,
              });
            }
          }

          const existingInv = await prisma.inventoryItem.findUnique({
            where: { userId_cardId: { userId: targetUid, cardId: payload.cardId } },
          });

          let currentStats = [];
          if (existingInv && existingInv.gameStats) {
            currentStats =
              typeof existingInv.gameStats === 'string'
                ? JSON.parse(existingInv.gameStats)
                : existingInv.gameStats;
          }

          if (newStats.length > 0) {
            currentStats = [...currentStats, ...newStats];
          }

          await prisma.$transaction([
            prisma.inventoryItem.upsert({
              where: { userId_cardId: { userId: targetUid, cardId: payload.cardId } },
              update: { amount: { increment: payload.amount }, gameStats: currentStats },
              create: {
                userId: targetUid,
                cardId: payload.cardId,
                amount: payload.amount,
                gameStats: currentStats,
              },
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
        }
        break;
      case 'removeCard':
        {
          const invItem = await prisma.inventoryItem.findUnique({
            where: { userId_cardId: { userId: targetUid, cardId: payload.cardId } },
          });
          if (!invItem) break;

          let statsArray = [];
          if (invItem.gameStats) {
            statsArray =
              typeof invItem.gameStats === 'string'
                ? JSON.parse(invItem.gameStats)
                : invItem.gameStats;
          }

          if (
            payload.statsIndex !== undefined &&
            payload.statsIndex >= 0 &&
            payload.statsIndex < statsArray.length
          ) {
            const map = createSpliceMap(statsArray.length, payload.statsIndex, 1);
            statsArray.splice(payload.statsIndex, 1);
            await syncArenaIndices(prisma, targetUid, payload.cardId, map);

            if (invItem.amount <= 1) {
              await prisma.$transaction([
                prisma.inventoryItem.delete({
                  where: { userId_cardId: { userId: targetUid, cardId: payload.cardId } },
                }),
                prisma.user.update({
                  where: { uid: targetUid },
                  data: { totalCards: { decrement: 1 } },
                }),
              ]);
            } else {
              await prisma.$transaction([
                prisma.inventoryItem.update({
                  where: { userId_cardId: { userId: targetUid, cardId: payload.cardId } },
                  data: { amount: { decrement: 1 }, gameStats: statsArray },
                }),
                prisma.user.update({
                  where: { uid: targetUid },
                  data: { totalCards: { decrement: 1 } },
                }),
              ]);
            }
          } else {
            // Normal remove flow
            const map = createSpliceMap(statsArray.length, 0, payload.amount);
            statsArray.splice(0, payload.amount);
            await syncArenaIndices(prisma, targetUid, payload.cardId, map);

            if (invItem.amount <= payload.amount) {
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
            } else {
              await prisma.$transaction([
                prisma.inventoryItem.update({
                  where: { userId_cardId: { userId: targetUid, cardId: payload.cardId } },
                  data: { amount: { decrement: payload.amount }, gameStats: statsArray },
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
          }
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
  validateImageSignature,
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

app.post('/api/game/premium-shop/buy', authenticate, async (req, res) => {
  const { item } = req.body;

  if (!item || !item.itemId) {
    return res.status(400).json({ error: 'Недійсний товар!' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { uid: req.user.uid } });
    if (!user.isPremium || new Date(user.premiumUntil) < new Date()) {
      return res.status(403).json({ error: 'Тільки для Преміум гравців!' });
    }

    // БЕЗПЕКА: Дістаємо ціну з бази даних, а не довіряємо клієнту
    const settings = await prisma.gameSettings.findUnique({ where: { id: 'main' } });
    const premiumItems = settings?.data?.premiumShopItems || [];
    const realItem = premiumItems.find((i) => i.id === item.itemId);

    if (!realItem) {
      return res.status(404).json({ error: 'Товар не знайдено в магазині!' });
    }

    const realPrice = Number(realItem.price);

    if (user.coins < realPrice) return res.status(400).json({ error: 'Недостатньо монет!' });

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { uid: user.uid },
        data: { coins: { decrement: realPrice }, totalCards: { increment: 1 } },
      });
      if (realItem.type === 'card') {
        await tx.inventoryItem.upsert({
          where: { userId_cardId: { userId: user.uid, cardId: realItem.id } },
          update: { amount: { increment: 1 } },
          create: { userId: user.uid, cardId: realItem.id, amount: 1 },
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

    // Безпека: Приховуємо слово, якщо гра ще не закінчилась
    let safeState = user.wordleState;
    if (typeof safeState === 'string') {
      try {
        safeState = JSON.parse(safeState);
      } catch (e) {}
    }

    if (safeState && typeof safeState === 'object') {
      safeState = { ...safeState }; // Shallow copy
      if (safeState.status === 'playing') {
        delete safeState.word;
      }
    }

    res.json({ state: safeState, dailyAttempts });
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

    // Безпека: Ховаємо слово при старті гри, воно має бути на бекенді, але не у клієнта
    const safeResponseState = { ...newState };
    delete safeResponseState.word;

    res.json({
      success: true,
      state: safeResponseState,
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

  // Автоматичне нарахування кристалів кожні 10 хвилин
  setInterval(
    async () => {
      try {
        const points = await prisma.arenaPoint.findMany({
          where: {
            ownerId: { not: null },
            crystalRatePerHour: { gt: 0 },
          },
        });

        for (const point of points) {
          if (!point.crystalsLastClaimedAt) continue;

          const lastClaimed = new Date(point.crystalsLastClaimedAt).getTime();
          const hoursElapsed = (Date.now() - lastClaimed) / (1000 * 60 * 60);
          const earnedCrystals = Math.floor(hoursElapsed * point.crystalRatePerHour);

          if (earnedCrystals > 0) {
            const exactTimeOfEarned =
              lastClaimed + (earnedCrystals / point.crystalRatePerHour) * 3600000;
            await prisma.$transaction(async (tx) => {
              await tx.user.update({
                where: { uid: point.ownerId },
                data: { crystals: { increment: earnedCrystals } },
              });
              await tx.arenaPoint.update({
                where: { id: point.id },
                data: { crystalsLastClaimedAt: new Date(exactTimeOfEarned) },
              });
            });
          }
        }
      } catch (error) {
        console.error('Помилка автоматичного нарахування кристалів:', error);
      }
    },
    10 * 60 * 1000
  ); // Кожні 10 хвилин
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

        const sellAmount = Number(item.amount);
        if (!Number.isInteger(sellAmount) || sellAmount <= 0) {
          throw new Error('Невірна кількість для продажу!');
        }

        if (card.maxSupply > 0) {
          throw new Error(
            `Лімітовану картку "${card.name}" можна продати тільки на ринку гравцям.`
          );
        }

        const price = card.sellPrice || 15;
        let earn = price * item.amount; // Буде перераховано після можливого обрізання

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
              throw new Error(
                'Не можна продати більше 1 картки з конкретною характеристикою за раз.'
              );
            }
            const parsedPower = Number(item.power);
            const parsedHp = item.hp !== undefined && item.hp !== null ? Number(item.hp) : null;

            const powerIndex = statsArray.findIndex((p) => {
              if (typeof p === 'object' && p !== null) {
                if (parsedHp !== null && Number(p.hp) !== parsedHp) return false;
                return Number(p.power) === parsedPower;
              }
              return Number(p) === parsedPower;
            });

            if (powerIndex > -1) {
              if (statsArray[powerIndex] && statsArray[powerIndex].inSafe) {
                throw new Error('Ця картка знаходиться у Сейфі!');
              }
              const defInstances = await getDefendingInstances(user.uid);
              const isDefending = defInstances.some(
                (inst) => inst.cardId === item.cardId && inst.statsIndex === powerIndex
              );
              if (isDefending) {
                throw new Error('Ця картка зараз захищає точку на Арені!');
              }

              const map = createSpliceMap(statsArray.length, powerIndex, 1);
              statsArray.splice(powerIndex, 1);
              await syncArenaIndices(tx, user.uid, item.cardId, map);
            } else if (statsArray.length > 0) {
              // Fallback: remove closest match
              let closestIndex = -1;
              let minDiff = Infinity;
              for (let i = 0; i < statsArray.length; i++) {
                const s = statsArray[i];
                if (s && s.inSafe) continue; // SKIP SAFE
                const pVal = typeof s === 'object' ? Number(s.power) : Number(s);
                const diff = Math.abs(pVal - parsedPower);
                if (diff < minDiff) {
                  minDiff = diff;
                  closestIndex = i;
                }
              }
              if (closestIndex === -1)
                throw new Error('Всі ваші картки цього типу знаходяться у Сейфі!');
              const map = createSpliceMap(statsArray.length, closestIndex, 1);
              statsArray.splice(closestIndex, 1);
              await syncArenaIndices(tx, user.uid, item.cardId, map);
            }
            // else: no gameStats tracked, skip
          } else {
            // Продати без конкретної сили: залишити найсильнішу
            const defInstances = await getDefendingInstances(user.uid);

            // Рахуємо скільки карток заблоковано (Арена + Сейф)
            const lockedIndices = new Set();
            defInstances
              .filter((inst) => inst.cardId === item.cardId)
              .forEach((inst) => {
                if (inst.statsIndex != null) lockedIndices.add(inst.statsIndex);
              });
            statsArray.forEach((s, idx) => {
              if (s && s.inSafe) lockedIndices.add(idx);
            });

            // Замість блокування — зменшуємо sell amount, щоб не зачепити заблоковані картки
            const maxSellable = Math.max(0, invItem.amount - lockedIndices.size);
            if (maxSellable === 0) {
              throw new Error(
                'Всі картки цього типу заблоковані (Сейф або Арена).'
              );
            }
            if (item.amount > maxSellable) {
              item.amount = maxSellable;
            }
            earn = price * item.amount; // Перераховуємо після можливого обрізання

            if (statsArray.length > 0) {
              const remainingAmount = invItem.amount - item.amount; // скільки карток лишається
              if (remainingAmount <= 0) {
                // Продаємо всі — очищуємо gameStats
                statsArray.splice(0, statsArray.length);
              } else {
                // Залишаємо remainingAmount найкращих
                const parsedStats = statsArray.map((s, idx) => {
                  if (typeof s === 'object' && s !== null && s.power !== undefined) {
                    return {
                      index: idx,
                      p: Number(s.power) || 0,
                      h: Number(s.hp) || 0,
                      sum: (Number(s.power) || 0) + (Number(s.hp) || 0),
                    };
                  } else {
                    return { index: idx, p: Number(s) || 0, h: 0, sum: Number(s) || 0 };
                  }
                });

                let keptIndices = new Set();

                // 1. Force keep defending and safe
                const reqDefendingIndices = defInstances
                  .filter((inst) => inst.cardId === item.cardId)
                  .map((inst) => inst.statsIndex)
                  .filter((idx) => idx !== undefined && idx !== null);
                reqDefendingIndices.forEach((idx) => {
                  if (idx >= 0 && idx < statsArray.length) keptIndices.add(idx);
                });
                statsArray.forEach((s, idx) => {
                  if (s && s.inSafe) keptIndices.add(idx);
                });

                // 2. Add best specific stats
                if (remainingAmount >= keptIndices.size + 3 && typeof statsArray[0] === 'object') {
                  let maxP = -1,
                    maxH = -1,
                    maxSum = -1;
                  let idxP = -1,
                    idxH = -1,
                    idxSum = -1;
                  parsedStats.forEach((st) => {
                    if (st.p > maxP) {
                      maxP = st.p;
                      idxP = st.index;
                    }
                    if (st.h > maxH) {
                      maxH = st.h;
                      idxH = st.index;
                    }
                    if (st.sum > maxSum) {
                      maxSum = st.sum;
                      idxSum = st.index;
                    }
                  });
                  if (idxP !== -1) keptIndices.add(idxP);
                  if (idxH !== -1) keptIndices.add(idxH);
                  if (idxSum !== -1) keptIndices.add(idxSum);
                }

                // 3. Keep remaining best
                parsedStats.sort((a, b) => b.sum - a.sum);
                for (const st of parsedStats) {
                  if (keptIndices.size < remainingAmount) {
                    keptIndices.add(st.index);
                  }
                }

                const keptArray = Array.from(keptIndices).sort((a, b) => a - b);
                const oldToNewMap = new Map();
                keptArray.forEach((oldIdx, newIdx) => {
                  oldToNewMap.set(oldIdx, newIdx);
                });

                const newStatsArray = keptArray.map((oldIdx) => statsArray[oldIdx]);
                statsArray = newStatsArray;
                await syncArenaIndices(tx, user.uid, item.cardId, oldToNewMap);
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

    res.json({ success: true, earned: totalEarned, totalRemoved: totalCardsRemoved, profile: updatedUser });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message || 'Помилка продажу карток.' });
  }
});

// ----------------------------------------
// КУЗНЯ (ФОРДЖ) - РЕРОЛ СИЛИ КАРТКИ
// ----------------------------------------
app.post('/api/game/forge/reroll', authenticate, async (req, res) => {
  const { cardId, currentPower, currentHp } = req.body;

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
    const parsedHp = currentHp !== undefined && currentHp !== null ? Number(currentHp) : null;
    const powerIndex = statsArray.findIndex((p) => {
      if (typeof p === 'object' && p !== null) {
        if (parsedHp !== null && Number(p.hp) !== parsedHp) return false;
        return Number(p.power) === parsedPower;
      }
      return Number(p) === parsedPower;
    });

    if (powerIndex === -1) {
      return res
        .status(400)
        .json({ error: 'Картку з такими характеристиками не знайдено в інвентарі.' });
    }

    const defInstances = await getDefendingInstances(user.uid);
    const isDefending = defInstances.some(
      (inst) => inst.cardId === cardId && inst.statsIndex === powerIndex
    );
    if (isDefending) {
      return res
        .status(400)
        .json({ error: 'Ця картка зараз захищає точку на Арені і не може бути перекована.' });
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

    const generateHp = (rarity) => {
      let min = 0,
        max = 0;
      switch (rarity) {
        case 'Унікальна':
          min = 300;
          max = 500;
          break;
        case 'Легендарна':
          min = 200;
          max = 400;
          break;
        case 'Епічна':
          min = 150;
          max = 300;
          break;
        case 'Рідкісна':
          min = 100;
          max = 200;
          break;
        case 'Звичайна':
          min = 50;
          max = 100;
          break;
        default:
          return null;
      }
      return Math.floor(Math.random() * (max - min + 1)) + min;
    };

    const newPower = generatePower(invItem.card.rarity) || parsedPower;
    const newHp = generateHp(invItem.card.rarity) || parsedHp || 50;
    const newStats = { power: newPower, hp: newHp };

    // Define index map for splice and push
    const map = new Map();
    for (let i = 0; i < statsArray.length; i++) {
      if (i === powerIndex) map.set(i, statsArray.length - 1);
      else if (i > powerIndex) map.set(i, i - 1);
      else map.set(i, i);
    }

    // Remove old power and add new power
    statsArray.splice(powerIndex, 1);
    statsArray.push(newStats);

    await prisma.$transaction(async (tx) => {
      await syncArenaIndices(tx, user.uid, cardId, map);

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

    res.json({ success: true, profile: updatedUser, newPower, newHp, cost });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Помилка внутрішнього сервера під час кування.' });
  }
});
