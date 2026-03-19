import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  Layers,
  LayoutGrid,
  Ticket,
  Settings,
  ScrollText,
  Bug,
  Edit2,
  Trash2,
  Ban,
  Database,
  Loader2,
  ArrowLeft,
  Coins,
  Gem,
  Swords,
  Search,
  Filter,
  User,
  Eye,
  CheckCircle2,
  CalendarDays,
  Gift,
  Zap,
  Trophy,
  Mail,
  Play,
  Volume2,
  Shield,
  Heart,
  Star,
} from 'lucide-react';
import {
  fetchPromosRequest,
  savePromoRequest,
  adminClearUserMarketHistoryRequest,
  adminClearAllMarketHistoryRequest,
  deletePromoRequest,
  saveSettingsRequest,
  getToken,
  adminResetCdRequest,
  savePackToDb,
  deletePackFromDb,
  saveCardToDb,
  deleteCardFromDb,
  fetchAdminUsers,
  fetchAdminUserInventory,
  adminUserActionRequest,
  fetchAdminLogsRequest,
  clearAdminLogsRequest,
  fetchAdminAchievements,
  deleteAchievementSettingsRequest,
  sendAdminNotification,
  uploadBannerRequest,
  fetchAdminEmeraldTypes,
  saveEmeraldTypeRequest,
  deleteEmeraldTypeRequest,
  fetchAdminEmeraldSettings,
  saveEmeraldSettingsRequest,
} from '../config/api';
import { formatDate, getCardStyle } from '../utils/helpers';
import { EFFECT_OPTIONS, FRAME_OPTIONS, SELL_PRICE, DROP_ANIMATIONS } from '../config/constants';
import PlayerAvatar from '../components/PlayerAvatar';
import CardFrame from '../components/CardFrame';
import { PERK_META } from '../components/PerkBadge';
import AchievementIcon, { ACHIEVEMENT_PRESETS } from '../components/AchievementIcon';

// ============================================================
// AUTO-BALANCE SYSTEM
// ============================================================

/** Базові статки на 1 рівні для кожної рідкості (HP ≈ 2.5× Сили) */
const AB_BASE = {
  'Звичайна':   { power: 10,  hp: 25  },
  'Рідкісна':   { power: 22,  hp: 55  },
  'Епічна':     { power: 50,  hp: 125 },
  'Легендарна': { power: 100, hp: 250 },
  'Унікальна':  { power: 200, hp: 500 },
};

/**
 * Модифікатори статків залежно від перку.
 * pMod — корекція Сили, hMod — корекція HP (відносні, напр. -0.10 = -10%)
 * val  — дефолтне значення ефективності перку (null = авто, без поля)
 */
const AB_PERK_MOD = {
  crit:      { pMod: -0.10, hMod: -0.10, val: 20  }, // Скляна гармата
  cleave:    { pMod: -0.05, hMod: -0.05, val: 30  }, // Помірне AoE
  poison:    { pMod: -0.10, hMod: -0.10, val: 10  }, // DoT атакер
  lifesteal: { pMod: -0.10, hMod: -0.05, val: 25  }, // Вампір
  burn:      { pMod: -0.10, hMod: -0.10, val: 10  }, // DoT атакер
  dodge:     { pMod: -0.15, hMod: +0.15, val: 20  }, // Ухильник
  thorns:    { pMod: -0.15, hMod: +0.10, val: 25  }, // Шипи-танк
  armor:     { pMod: -0.15, hMod: +0.20, val: 25  }, // Броньований танк
  laststand: { pMod: +0.05, hMod: -0.15, val: null }, // Берсерк
  shield:    { pMod: -0.10, hMod: +0.15, val: 15  }, // Щитовик
  taunt:     { pMod: -0.20, hMod: +0.25, val: null }, // Провокатор
  healer:    { pMod: -0.25, hMod: +0.10, val: 20  }, // Підтримка (20% maxHp цілі)
};

/** % приросту від maxStat на кожному рівні 2–10 (агресивне прискорення) */
const AB_LVL_PCT = [0.08, 0.10, 0.12, 0.15, 0.18, 0.22, 0.26, 0.30, 0.35];

/** Кількість дублікатів для кожного рівня 2–10 */
const AB_DUPES = {
  'Звичайна':   [1,  1,  1,  2,  2,   2,   3,   3,   3  ],  // ~18 total
  'Рідкісна':   [1,  1,  2,  3,  4,   5,   5,   5,   5  ],  // ~31 total
  'Епічна':     [2,  2,  3,  4,  5,   6,   7,   8,   8  ],  // ~45 total
  'Легендарна': [3,  4,  5,  7,  9,  11,  13,  15,  15  ],  // ~82 total
  'Унікальна':  [4,  5,  7,  9, 12,  15,  18,  22,  25  ],  // ~117 total
};

/** Вартість прокачки для кожного рівня 2–10 (останні 3 — кристали) */
const AB_COST = {
  'Звичайна':   [500,    800,    1500,    2500,    4000,    6000,    100,  200,  500  ],
  'Рідкісна':   [1000,   2000,   4000,    7000,    12000,   20000,   300,  700,  1500 ],
  'Епічна':     [4000,   8000,   14000,   25000,   45000,   75000,   1200, 2500, 4000 ],
  'Легендарна': [12000,  20000,  35000,   60000,   100000,  180000,  1500, 3000, 5000 ],
  'Унікальна':  [30000,  60000,  100000,  180000,  300000,  500000,  3000, 5000, 8000 ],
};

/** Валюта для рівнів 2–10: перші 6 — монети, останні 3 — кристали */
const AB_CURRENCY = ['coins','coins','coins','coins','coins','coins','crystals','crystals','crystals'];

/**
 * Розраховує збалансований набір ігрових параметрів.
 * @param {string} rarity - рідкість картки
 * @param {string|null} perk - основний перк
 * @returns об'єкт з minPower, maxPower, minHp, maxHp, perkValue, levelingConfig
 */
function computeAutoBalance(rarity, perk) {
  const base    = AB_BASE[rarity]    || AB_BASE['Звичайна'];
  const mod     = (perk && AB_PERK_MOD[perk]) ? AB_PERK_MOD[perk] : { pMod: 0, hMod: 0, val: '' };
  const dupeArr = AB_DUPES[rarity]   || AB_DUPES['Звичайна'];
  const costArr = AB_COST[rarity]    || AB_COST['Звичайна'];

  // Фіксовані значення — без рандому
  const maxPower = Math.round(base.power * (1 + mod.pMod));
  const maxHp    = Math.round(base.hp    * (1 + mod.hMod));
  const minPower = maxPower;
  const minHp    = maxHp;

  const levelingConfig = {};
  for (let lvl = 2; lvl <= 10; lvl++) {
    const pct = AB_LVL_PCT[lvl - 2];
    levelingConfig[lvl] = {
      powerAdd: Math.max(1, Math.round(maxPower * pct)),
      hpAdd:    Math.max(1, Math.round(maxHp    * pct)),
      dupes:    dupeArr[lvl - 2],
      cost:     costArr[lvl - 2],
      currency: AB_CURRENCY[lvl - 2],
    };
  }

  return {
    minPower,
    maxPower,
    minHp,
    maxHp,
    perkValue:     mod.val !== undefined && mod.val !== null ? mod.val : '',
    levelingConfig,
  };
}

// ============================================================

export default function AdminView({
  db,
  appId,
  currentProfile,
  setProfile,
  reloadSettings,
  cardsCatalog,
  packsCatalog,
  setCardsCatalog,
  setPacksCatalog,
  rarities,
  showToast,
  addSystemLog,
  dailyRewards,
  premiumDailyRewards,
  premiumPrice,
  premiumDurationDays,
  premiumShopItems,
  setViewingPlayerProfile,
  setCurrentView,
  setViewingCard,
  bosses,
  wordleEntryCost,
}) {
  const [activeTab, setActiveTab] = useState('users');
  const [newBoss, setNewBoss] = useState({
    id: '',
    level: '',
    cardId: '',
    maxHp: '',
    damagePerClick: '',
    rewardPerClick: '',
    killBonus: '',
    cooldownHours: '',
  });
  const [allUsers, setAllUsers] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [adminSetFarmLevel, setAdminSetFarmLevel] = useState('');

  const [viewingUser, setViewingUser] = useState(null);
  const [userInventory, setUserInventory] = useState([]);
  const [loadingUserInv, setLoadingUserInv] = useState(false);
  const [invPackFilter, setInvPackFilter] = useState('all');
  const [invSearchTerm, setInvSearchTerm] = useState('');
  const [adminUserSearchTerm, setAdminUserSearchTerm] = useState('');

  const [banModalUser, setBanModalUser] = useState(null);
  const [banReason, setBanReason] = useState('');
  const [banDurationValue, setBanDurationValue] = useState('');
  const [banDurationUnit, setBanDurationUnit] = useState('h');

  const [premiumModalUser, setPremiumModalUser] = useState(null);
  const [premiumGiveDays, setPremiumGiveDays] = useState(30);

  const [adminNewNickname, setAdminNewNickname] = useState('');

  const [adminAddCardId, setAdminAddCardId] = useState('');
  const [adminAddCardAmount, setAdminAddCardAmount] = useState(1);
  const [adminAddCardPower, setAdminAddCardPower] = useState('');
  const [adminAddCardHp, setAdminAddCardHp] = useState('');
  const [adminAddCardLevel, setAdminAddCardLevel] = useState('');
  const [adminAddCoinsAmount, setAdminAddCoinsAmount] = useState(100);
  const [adminSetCoinsAmount, setAdminSetCoinsAmount] = useState(0);

  const [adminRemoveModalData, setAdminRemoveModalData] = useState(null);
  const [adminEditCardModal, setAdminEditCardModal] = useState(null); // { cardId, cardName, statIdx, stat, cardDef }

  const [editingCard, setEditingCard] = useState(null);
  const [cardForm, setCardForm] = useState({
    id: '',
    packId: packsCatalog[0]?.id || '',
    name: '',
    rarity: rarities[0]?.name || 'Звичайна',
    image: '',
    dropAnim: '',
    maxSupply: '',
    weight: '',
    sellPrice: '',
    effect: '',
    soundUrl: '',
    soundVolume: 0.5,
    frame: 'normal',
    isGame: false,
    blockGame: false,
    minPower: '',
    maxPower: '',
    minHp: '',
    maxHp: '',
    perk: '',
    perkValue: '',
    levelingConfig: {},
    bonusPerkLevel: '',
    bonusPerk: '',
    bonusPerkValue: '',
  });
  const [editingPack, setEditingPack] = useState(null);
  const [packForm, setPackForm] = useState({
    id: '',
    name: '',
    category: 'Базові',
    cost: 50,
    premiumCost: '',
    image: '',
    customWeights: {},
    statsRanges: {},
    isHidden: false,
    isPremiumOnly: false,
    isGame: false,
  });

  const [cardImageFile, setCardImageFile] = useState(null);
  const [cardPreviewUrl, setCardPreviewUrl] = useState('');

  useEffect(() => {
    if (cardImageFile) {
      const url = URL.createObjectURL(cardImageFile);
      setCardPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setCardPreviewUrl(cardForm.image || '/logo.png');
    }
  }, [cardImageFile, cardForm.image]);

  const playCardSound = () => {
    if (!cardForm.soundUrl) return;
    const audio = new Audio(cardForm.soundUrl);
    audio.volume = cardForm.soundVolume !== undefined ? cardForm.soundVolume : 0.5;
    audio.play().catch((e) => console.error('Error playing sound:', e));
  };

  // --- AUTO-BALANCE STATE & LOGIC ---
  const [autoBalanceApplied, setAutoBalanceApplied] = useState(false);
  const prevIsGameRef = useRef(false);

  // Коли вмикається isGame — автоматично заповнюємо баланс
  useEffect(() => {
    if (cardForm.isGame && !prevIsGameRef.current) {
      const balanced = computeAutoBalance(cardForm.rarity, cardForm.perk || null);
      setCardForm(prev => ({ ...prev, ...balanced }));
      setAutoBalanceApplied(true);
    }
    prevIsGameRef.current = cardForm.isGame;
  }, [cardForm.isGame]); // eslint-disable-line

  /** Ручне застосування авто-балансу (кнопка) */
  const handleApplyAutoBalance = () => {
    const balanced = computeAutoBalance(cardForm.rarity, cardForm.perk || null);
    setCardForm(prev => ({ ...prev, ...balanced }));
    setAutoBalanceApplied(true);
  };

  /** Зміна основного перку + авто-коригування perkValue і статків */
  const handlePerkChange = (newPerk) => {
    if (cardForm.isGame && newPerk) {
      const balanced = computeAutoBalance(cardForm.rarity, newPerk);
      setCardForm(prev => ({
        ...prev,
        perk: newPerk,
        perkValue: balanced.perkValue,
        minPower: balanced.minPower,
        maxPower: balanced.maxPower,
        minHp: balanced.minHp,
        maxHp: balanced.maxHp,
        levelingConfig: balanced.levelingConfig,
      }));
      setAutoBalanceApplied(true);
    } else {
      setCardForm(prev => ({ ...prev, perk: newPerk, perkValue: '' }));
      setAutoBalanceApplied(false);
    }
  };

  /** Зміна рідкості + перерахунок балансу якщо isGame увімкнено */
  const handleRarityChange = (newRarity) => {
    if (cardForm.isGame) {
      const balanced = computeAutoBalance(newRarity, cardForm.perk || null);
      setCardForm(prev => ({ ...prev, rarity: newRarity, ...balanced }));
      setAutoBalanceApplied(true);
    } else {
      setCardForm(prev => ({ ...prev, rarity: newRarity }));
    }
  };
  // --- END CARD AUTO-BALANCE ---

  // --- PACK AUTO-BALANCE ---
  const [packAutoBalanceApplied, setPackAutoBalanceApplied] = useState(false);
  const prevPackIsGameRef = useRef(false);

  /** Заповнити statsRanges паку базовими значеннями для кожної рідкості */
  const applyPackAutoBalance = () => {
    const ranges = {};
    for (const [rarity, base] of Object.entries(AB_BASE)) {
      ranges[rarity] = {
        minPower: base.power,
        maxPower: base.power,
        minHp:    base.hp,
        maxHp:    base.hp,
      };
    }
    setPackForm(prev => ({ ...prev, statsRanges: ranges }));
    setPackAutoBalanceApplied(true);
  };

  useEffect(() => {
    if (packForm.isGame && !prevPackIsGameRef.current) {
      applyPackAutoBalance();
    }
    prevPackIsGameRef.current = packForm.isGame;
  }, [packForm.isGame]); // eslint-disable-line

  const handlePackIsGameChange = (checked) => {
    setPackForm(prev => ({ ...prev, isGame: checked }));
    if (!checked) setPackAutoBalanceApplied(false);
  };
  // --- END PACK AUTO-BALANCE ---

  const [packImageFile, setPackImageFile] = useState(null);

  const [allAchievements, setAllAchievements] = useState([]);
  const [achievementForm, setAchievementForm] = useState({
    id: '',
    packId: packsCatalog[0]?.id || '',
    name: '',
    description: '',
    iconUrl: '',
  });
  const [editingAchievement, setEditingAchievement] = useState(null);

  const [allPromos, setAllPromos] = useState([]);
  const [promoForm, setPromoForm] = useState({
    code: '',
    reward: 100,
    maxGlobalUses: 0,
    maxUserUses: 1,
  });

  const [notifForm, setNotifForm] = useState({
    targetUid: 'ALL',
    type: 'update',
    title: '',
    message: '',
    attachedCoins: 0,
    attachedCardId: '',
    attachedCardAmount: 1,
  });

  const [adminStatsForm, setAdminStatsForm] = useState({
    packsOpened: '',
    coinsSpentOnPacks: '',
    coinsEarnedFromPacks: '',
  });

  const [adminAddCrystalsAmount, setAdminAddCrystalsAmount] = useState(10);

  const [packSearchTerm, setPackSearchTerm] = useState('');
  const [cardSearchTerm, setCardSearchTerm] = useState('');
  const [cardPackFilter, setCardPackFilter] = useState('all');

  const [adminLogs, setAdminLogs] = useState([]);

  const [rewardsForm, setRewardsForm] = useState(
    dailyRewards || [1000, 2000, 3000, 4000, 5000, 6000, 7000]
  );
  const [premiumRewardsForm, setPremiumRewardsForm] = useState(
    premiumDailyRewards || [2000, 4000, 6000, 8000, 10000, 12000, 15000]
  );
  const [priceForm, setPriceForm] = useState(premiumPrice !== undefined ? premiumPrice : 10000);
  const [durationDaysForm, setDurationDaysForm] = useState(
    premiumDurationDays !== undefined ? premiumDurationDays : 30
  );
  const [wordleCostForm, setWordleCostForm] = useState(
    wordleEntryCost !== undefined ? wordleEntryCost : 0
  );
  const [shopItemForm, setShopItemForm] = useState({
    type: 'card',
    itemId: '',
    price: 500,
    currency: 'coins',
    description: '',
    imageFile: null,
  });
  const [editingShopItem, setEditingShopItem] = useState(null);

  // Emerald admin state
  const [emeraldTypes, setEmeraldTypes] = useState([]);
  const [emeraldSettings, setEmeraldSettings] = useState({ boxCostAmount: 100, boxCostCurrency: 'coins', maxDailyOpens: 3 });
  const [editingEmeraldType, setEditingEmeraldType] = useState(null);
  const [emeraldTypeForm, setEmeraldTypeForm] = useState({ name: '', color: '#10b981', perkBoostPercent: 10, dropWeight: 50 });
  const [isSavingEmerald, setIsSavingEmerald] = useState(false);

  const updatePackStatsRange = (rarity, field, value) => {
    setPackForm((prev) => ({
      ...prev,
      statsRanges: {
        ...(prev.statsRanges || {}),
        [rarity]: {
          ...(prev.statsRanges?.[rarity] || {}),
          [field]: value,
        },
      },
    }));
  };

  const getFullSettings = () => ({
    bosses: bosses || [],
    dailyRewards: rewardsForm || [],
    premiumDailyRewards: premiumRewardsForm || [],
    premiumPrice: Number(priceForm),
    premiumDurationDays: Number(durationDaysForm),
    premiumShopItems: premiumShopItems || [],
    wordleEntryCost: Number(wordleCostForm) >= 0 ? Number(wordleCostForm) : 0,
  });

  useEffect(() => {
    setRewardsForm(dailyRewards || [1000, 2000, 3000, 4000, 5000, 6000, 7000]);
    setPremiumRewardsForm(premiumDailyRewards || [2000, 4000, 6000, 8000, 10000, 12000, 15000]);
    setPriceForm(premiumPrice !== undefined ? premiumPrice : 10000);
    setDurationDaysForm(premiumDurationDays !== undefined ? premiumDurationDays : 30);
    setWordleCostForm(wordleEntryCost !== undefined ? wordleEntryCost : 0);
  }, [dailyRewards, premiumDailyRewards, premiumPrice, premiumDurationDays, wordleEntryCost]);

  const loadUsers = async () => {
    try {
      const users = await fetchAdminUsers(getToken());
      setAllUsers(users || []);
    } catch {
      console.error('Помилка завантаження гравців');
    }
  };

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers();
    }

    if (activeTab === 'promos' && currentProfile.isAdmin) {
      const loadPromos = async () => {
        try {
          const data = await fetchPromosRequest(getToken());
          setAllPromos(data || []);
        } catch (e) {
          console.error(e);
        }
      };
      loadPromos();
    }

    if (activeTab === 'logs' && currentProfile.isAdmin) {
      const loadLogs = async () => {
        try {
          const data = await fetchAdminLogsRequest(getToken());
          setAdminLogs(data || []);
        } catch (e) {
          console.error(e);
        }
      };
      loadLogs();
    }

    if (activeTab === 'achievements' && currentProfile.isAdmin) {
      const loadAchievements = async () => {
        try {
          const data = await fetchAdminAchievements(getToken());
          setAllAchievements(data || []);
        } catch (e) {
          console.error(e);
        }
      };
      loadAchievements();
    }

    if (activeTab === 'emeralds' && currentProfile.isAdmin) {
      const loadEmeralds = async () => {
        try {
          const [types, settings] = await Promise.all([
            fetchAdminEmeraldTypes(getToken()),
            fetchAdminEmeraldSettings(getToken()),
          ]);
          setEmeraldTypes(types || []);
          setEmeraldSettings(settings || { boxCostAmount: 100, boxCostCurrency: 'coins', maxDailyOpens: 3 });
        } catch (e) {
          console.error(e);
        }
      };
      loadEmeralds();
    }
  }, [activeTab, db, appId, currentProfile]);

  const syncAllProfiles = async () => {
    showToast('Тепер MySQL автоматично рахує картки. Синхронізація не потрібна!', 'success');
  };

  const handleDeleteUser = async (userToDelete) => {
    if (userToDelete.isSuperAdmin)
      return showToast('Не можна видалити Супер Адміністратора!', 'error');
    if (
      !confirm(
        `Мій лорд, Ви впевнені, що хочете БЕЗПОВОРОТНО видалити гравця ${userToDelete.nickname}?`
      )
    )
      return;
    try {
      await adminUserActionRequest(getToken(), 'delete', userToDelete.uid);
      showToast(`Гравця ${userToDelete.nickname} видалено.`, 'success');
      addSystemLog('Адмін', `Видалено акаунт: ${userToDelete.nickname}`);
      loadUsers();
    } catch {
      showToast('Помилка під час видалення.');
    }
  };

  const handleInspectUser = async (uid) => {
    setLoadingUserInv(true);
    setInvPackFilter('all');
    setInvSearchTerm('');
    const u = allUsers.find((x) => x.uid === uid);
    setViewingUser(u);
    if (u) {
      setAdminSetCoinsAmount(u.coins || 0);
      setAdminNewNickname(u.nickname || '');
      setAdminSetFarmLevel(u.farmLevel || 1);
      setAdminAddCrystalsAmount(u.crystals || 0);
    }
    try {
      const items = await fetchAdminUserInventory(getToken(), uid);
      setUserInventory(items || []);
    } catch {
      showToast('Помилка доступу до інвентарю.');
    }
    // Завантажуємо типи смарагдів якщо ще не завантажені
    if (emeraldTypes.length === 0) {
      try {
        const types = await fetchAdminEmeraldTypes(getToken());
        setEmeraldTypes(types || []);
      } catch { /* silent */ }
    }
    setLoadingUserInv(false);
  };

  const submitBan = async (e) => {
    e.preventDefault();
    if (!banModalUser) return;
    let banUntil = null;
    if (banDurationUnit !== 'perm') {
      const val = parseInt(banDurationValue, 10);
      let multiplier =
        banDurationUnit === 'm' ? 60000 : banDurationUnit === 'h' ? 3600000 : 86400000;
      banUntil = new Date(Date.now() + val * multiplier).toISOString();
    }
    try {
      await adminUserActionRequest(getToken(), 'ban', banModalUser.uid, {
        reason: banReason,
        until: banUntil,
      });
      showToast(`Гравця заблоковано.`, 'success');
      setBanModalUser(null);
      loadUsers();
    } catch {
      showToast('Помилка блокування.', 'error');
    }
  };

  const handleUnban = async (uid) => {
    try {
      await adminUserActionRequest(getToken(), 'unban', uid);
      showToast('Розблоковано.', 'success');
      loadUsers();
    } catch {
      showToast('Помилка розблокування.', 'error');
    }
  };

  const toggleAdminStatus = async (userObj) => {
    if (!currentProfile.isSuperAdmin) return;
    try {
      await adminUserActionRequest(getToken(), 'toggleAdmin', userObj.uid);
      showToast('Статус змінено.', 'success');
      loadUsers();
    } catch {
      showToast('Помилка зміни прав.', 'error');
    }
  };

  const changeUserNickname = async () => {
    if (!adminNewNickname.trim() || adminNewNickname.trim() === viewingUser.nickname) return;
    try {
      const data = await adminUserActionRequest(getToken(), 'nickname', viewingUser.uid, {
        nickname: adminNewNickname.trim(),
      });
      showToast('Нікнейм змінено!', 'success');
      setViewingUser(data.profile);
      loadUsers();
    } catch (e) {
      showToast(e.message || 'Помилка зміни.', 'error');
    }
  };

  const giveCoinsToSelf = async (amount) => {
    try {
      const data = await adminUserActionRequest(getToken(), 'coins', currentProfile.uid, {
        amount,
        exact: false,
      });
      setProfile(data.profile); // <--- Ось ця магія миттєво оновить баланс у верхньому меню!
      showToast(`Видано собі ${amount} монет!`, 'success');
      loadUsers();
    } catch {
      showToast('Помилка нарахування.', 'error');
    }
  };



  const setExactCrystalsToUser = async () => {
    if (adminAddCrystalsAmount === '' || isNaN(adminAddCrystalsAmount)) return;
    try {
      const data = await adminUserActionRequest(getToken(), 'crystals', viewingUser.uid, {
        amount: parseInt(adminAddCrystalsAmount),
        exact: true,
      });
      if (viewingUser.uid === currentProfile.uid) setProfile(data.profile);
      showToast('Точний баланс кристалів встановлено.', 'success');
      setViewingUser(data.profile);
      loadUsers();
    } catch {
      showToast('Помилка кристалів.', 'error');
    }
  };

  const setExactCoinsToUser = async () => {
    if (adminSetCoinsAmount === '' || isNaN(adminSetCoinsAmount)) return;
    try {
      const data = await adminUserActionRequest(getToken(), 'coins', viewingUser.uid, {
        amount: parseInt(adminSetCoinsAmount),
        exact: true,
      });
      if (viewingUser.uid === currentProfile.uid) setProfile(data.profile); // <--- ДОДАНО ОНОВЛЕННЯ
      showToast('Точний баланс встановлено.', 'success');
      setViewingUser(data.profile);
      loadUsers();
    } catch {
      showToast('Помилка балансу.', 'error');
    }
  };

  const resetPlayerCooldown = async (targetUid, targetNickname) => {
    if (
      !window.confirm(`Мій лорд, ви точно хочете скинути таймер боса для гравця ${targetNickname}?`)
    )
      return;
    try {
      await adminResetCdRequest(getToken(), targetUid, 1000);
      showToast('Кулдаун скинуто!', 'success');
    } catch {
      showToast('Помилка скидання КД.', 'error');
    }
  };

  const setPlayerFarmLevel = async () => {
    const val = parseInt(adminSetFarmLevel, 10);
    if (isNaN(val) || val < 1) return;
    try {
      const data = await adminUserActionRequest(getToken(), 'farmLevel', viewingUser.uid, {
        level: val,
      });
      showToast('Рівень Фарму змінено!', 'success');
      setViewingUser(data.profile);
      loadUsers();
    } catch {
      showToast('Помилка встановлення рівня.', 'error');
    }
  };

  const resetFarmLimit = async () => {
    if (!window.confirm(`Скинути денний ліміт фарму для ${viewingUser.nickname}?`)) return;
    try {
      const data = await adminUserActionRequest(getToken(), 'resetFarmLimit', viewingUser.uid);
      showToast(`Ліміт фарму скинуто для ${viewingUser.nickname}!`, 'success');
      setViewingUser(data.profile);
      loadUsers();
    } catch {
      showToast('Помилка скидання ліміту.', 'error');
    }
  };

  const savePlayerStats = async () => {
    try {
      const payload = {};
      Object.keys(adminStatsForm).forEach((key) => {
        if (adminStatsForm[key] !== '') payload[key] = Number(adminStatsForm[key]);
      });
      if (Object.keys(payload).length === 0) return;
      const data = await adminUserActionRequest(getToken(), 'stats', viewingUser.uid, payload);
      showToast('Статистику гравця оновлено.', 'success');
      setViewingUser(data.profile);
      loadUsers();
      setAdminStatsForm({ crystals: '', totalCards: '', uniqueCardsCount: '', packsOpened: '', coinsSpentOnPacks: '', coinsEarnedFromPacks: '' });
    } catch (e) {
      showToast(e.message || 'Помилка збереження статистики.', 'error');
    }
  };

  const giveCardToUser = async () => {
    if (!adminAddCardId || adminAddCardAmount < 1) return;
    try {
      await adminUserActionRequest(getToken(), 'giveCard', viewingUser.uid, {
        cardId: adminAddCardId,
        amount: adminAddCardAmount,
        power: adminAddCardPower ? Number(adminAddCardPower) : undefined,
        hp: adminAddCardHp ? Number(adminAddCardHp) : undefined,
        level: adminAddCardLevel ? Number(adminAddCardLevel) : undefined,
      });
      showToast(`Успішно нараховано ${adminAddCardAmount} шт.`, 'success');
      handleInspectUser(viewingUser.uid);
      setAdminAddCardPower('');
      setAdminAddCardHp('');
      setAdminAddCardLevel('');
      loadUsers();
    } catch {
      showToast('Помилка картки.', 'error');
    }
  };

  const removeCardFromUser = async (cardId, currentAmount, isGameCard, gameStatsArray, cardDef) => {
    if (gameStatsArray && (typeof gameStatsArray === 'string' ? JSON.parse(gameStatsArray).length > 0 : gameStatsArray.length > 0)) {
      const cDef = cardDef || cardsCatalog.find(c => c.id === cardId);
      setAdminRemoveModalData({
        cardId,
        cardName: cDef?.name || 'Card',
        cardDef: cDef || null,
        stats: typeof gameStatsArray === 'string' ? JSON.parse(gameStatsArray) : gameStatsArray
      });
      return;
    }

    const input = prompt(`Скільки карток відібрати? (У гравця зараз: ${currentAmount} шт.)`, '1');
    if (input === null) return; // Якщо ви натиснули "Скасувати"

    const amountToRemove = parseInt(input, 10);
    if (isNaN(amountToRemove) || amountToRemove <= 0) {
      return showToast('Введіть коректну кількість!', 'error');
    }

    try {
      await adminUserActionRequest(getToken(), 'removeCard', viewingUser.uid, {
        cardId,
        amount: amountToRemove,
      });
      showToast(`Успішно вилучено ${amountToRemove} шт.`, 'success');
      handleInspectUser(viewingUser.uid);
      loadUsers();
    } catch {
      showToast('Помилка вилучення.', 'error');
    }
  };

  const removeSpecificCardInstance = async (cardId, statsIndex) => {
    try {
      await adminUserActionRequest(getToken(), 'removeCard', viewingUser.uid, {
        cardId,
        amount: 1, // Doesn't matter because we pass statsIndex
        statsIndex,
      });
      showToast(`Специфічний дублікат вилучено.`, 'success');
      setAdminRemoveModalData(null);
      handleInspectUser(viewingUser.uid);
      loadUsers();
    } catch {
      showToast('Помилка вилучення дублікату.', 'error');
    }
  };

  const adminAddDuplicate = async (cardId) => {
    try {
      await adminUserActionRequest(getToken(), 'giveCard', viewingUser.uid, {
        cardId,
        amount: 1,
        level: 1,
      });
      showToast('Дублікат додано.', 'success');
      const invRes = await fetchAdminUserInventory(getToken(), viewingUser.uid);
      const updatedItem = invRes.find(i => i.id === cardId);
      if (updatedItem) {
        const stats = typeof updatedItem.gameStats === 'string'
          ? JSON.parse(updatedItem.gameStats) : (updatedItem.gameStats || []);
        setAdminRemoveModalData(prev => ({ ...prev, stats }));
      }
    } catch {
      showToast('Помилка додавання дублікату.', 'error');
    }
  };

  const adminRemoveDuplicate = async (cardId, mainIdx, stats) => {
    // Find first non-main, non-inSafe entry
    const dupIdx = stats.findIndex((s, i) => i !== mainIdx && !s.inSafe);
    if (dupIdx === -1) return showToast('Немає вільних дублікатів для вилучення.', 'error');
    try {
      await adminUserActionRequest(getToken(), 'removeCard', viewingUser.uid, {
        cardId,
        amount: 1,
        statsIndex: dupIdx,
      });
      showToast('Дублікат вилучено.', 'success');
      const invRes = await fetchAdminUserInventory(getToken(), viewingUser.uid);
      const updatedItem = invRes.find(i => i.id === cardId);
      if (updatedItem) {
        const newStats = typeof updatedItem.gameStats === 'string'
          ? JSON.parse(updatedItem.gameStats) : (updatedItem.gameStats || []);
        if (newStats.length === 0) {
          setAdminRemoveModalData(null);
        } else {
          setAdminRemoveModalData(prev => ({ ...prev, stats: newStats }));
        }
      } else {
        setAdminRemoveModalData(null);
      }
    } catch {
      showToast('Помилка вилучення дублікату.', 'error');
    }
  };

  const saveCardStatEdit = async () => {
    if (!adminEditCardModal) return;
    const {
      cardId, statIdx,
      editPower, editHp, editLevel, editEmerald, origEmerald,
      editPerk, editPerkValue, editBonusPerk, editBonusPerkValue, editBonusPerkLevel,
      origPerk, origPerkValue, origBonusPerk, origBonusPerkValue, origBonusPerkLevel,
    } = adminEditCardModal;
    try {
      // 1. Статки примірника (level / power / hp)
      await adminUserActionRequest(getToken(), 'updateCardStat', viewingUser.uid, {
        cardId, statsIndex: statIdx,
        power: Number(editPower), hp: Number(editHp), level: Number(editLevel),
      });

      // 2. Смарагд на примірнику (якщо змінився)
      if (editEmerald !== origEmerald) {
        await adminUserActionRequest(getToken(), 'adminSetEmerald', viewingUser.uid, {
          cardId, statsIndex: statIdx,
          emeraldTypeId: editEmerald || null,
        });
      }

      // 3. Визначення картки (перки) — якщо змінилось
      const defChanged =
        String(editPerk || '') !== String(origPerk || '') ||
        String(editPerkValue || '') !== String(origPerkValue || '') ||
        String(editBonusPerk || '') !== String(origBonusPerk || '') ||
        String(editBonusPerkValue || '') !== String(origBonusPerkValue || '') ||
        String(editBonusPerkLevel || '') !== String(origBonusPerkLevel || '');
      if (defChanged) {
        await adminUserActionRequest(getToken(), 'updateCardDef', viewingUser.uid, {
          cardId,
          perk: editPerk || '',
          perkValue: editPerkValue,
          bonusPerk: editBonusPerk || '',
          bonusPerkValue: editBonusPerkValue,
          bonusPerkLevel: editBonusPerkLevel,
        });
        // Оновлюємо каталог локально
        setCardsCatalog(prev => prev.map(c => c.id === cardId ? {
          ...c,
          perk: editPerk || null,
          perkValue: editPerkValue !== '' ? Number(editPerkValue) : null,
          bonusPerk: editBonusPerk || null,
          bonusPerkValue: editBonusPerkValue !== '' ? Number(editBonusPerkValue) : null,
          bonusPerkLevel: editBonusPerkLevel !== '' ? Number(editBonusPerkLevel) : null,
        } : c));
      }

      showToast('Картку оновлено.', 'success');
      setAdminEditCardModal(null);
      handleInspectUser(viewingUser.uid);

      // Оновлюємо статки у модалці видалення
      const invRes = await fetchAdminUserInventory(getToken(), viewingUser.uid);
      const updatedItem = invRes.find(i => i.id === cardId);
      if (updatedItem && adminRemoveModalData) {
        const stats = typeof updatedItem.gameStats === 'string'
          ? JSON.parse(updatedItem.gameStats) : updatedItem.gameStats;
        const updatedDef = cardsCatalog.find(c => c.id === cardId);
        setAdminRemoveModalData(prev => ({ ...prev, stats, cardDef: updatedDef || prev.cardDef }));
      }
    } catch {
      showToast('Помилка оновлення картки.', 'error');
    }
  };

  const handlePremiumAction = async (e, action) => {
    e.preventDefault();
    if (!premiumModalUser) return;
    try {
      await adminUserActionRequest(getToken(), 'premium', premiumModalUser.uid, {
        revoke: action === 'revoke',
        days: Number(premiumGiveDays),
      });
      showToast(action === 'revoke' ? 'Преміум забрано' : 'Преміум видано!', 'success');
      setPremiumModalUser(null);
      loadUsers();
    } catch {
      showToast('Помилка преміуму.', 'error');
    }
  };

  const resetBossForm = () => {
    setNewBoss({
      id: '',
      level: '',
      cardId: '',
      maxHp: '',
      damagePerClick: '',
      rewardPerClick: '',
      killBonus: '',
      cooldownHours: '',
    });
  };

  const handleAddBoss = async (e) => {
    e.preventDefault();
    if (!newBoss.cardId) return showToast('Виберіть картку!', 'error');
    const bossData = {
      id: newBoss.id || `boss_${Date.now()}`,
      level: Number(newBoss.level),
      cardId: newBoss.cardId,
      maxHp: Number(newBoss.maxHp),
      damagePerClick: Number(newBoss.damagePerClick),
      rewardPerClick: Number(newBoss.rewardPerClick),
      killBonus: Number(newBoss.killBonus),
      cooldownHours: Number(newBoss.cooldownHours),
    };

    let updatedBosses = newBoss.id
      ? bosses.map((b) => (b.id === newBoss.id ? bossData : b)).sort((a, b) => a.level - b.level)
      : [...(bosses || []), bossData].sort((a, b) => a.level - b.level);

    try {
      setIsSyncing(true);
      const newSettings = getFullSettings();
      newSettings.bosses = updatedBosses;
      await saveSettingsRequest(getToken(), newSettings);
      await reloadSettings();
      showToast(newBoss.id ? 'Боса оновлено!' : `Боса ${bossData.level} рівня додано!`, 'success');
      resetBossForm();
    } catch {
      showToast('Помилка збереження боса', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteBoss = async (bossId) => {
    if (!confirm('Ви впевнені, що хочете видалити цього боса?')) return;
    try {
      setIsSyncing(true);
      const updatedBosses = bosses.filter((b) => b.id !== bossId);
      const newSettings = getFullSettings();
      newSettings.bosses = updatedBosses;
      await saveSettingsRequest(getToken(), newSettings);
      await reloadSettings();
      showToast('Боса успішно видалено', 'success');
    } catch {
      showToast('Помилка видалення', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const savePack = async (e) => {
    e.preventDefault();
    const newPackData = {
      ...packForm,
      id: editingPack ? editingPack.id : 'p' + Date.now(),
      cost: Number(packForm.cost),
      isHidden: !!packForm.isHidden,
      isPremiumOnly: !!packForm.isPremiumOnly,
      isGame: !!packForm.isGame,
      category: packForm.category || 'Базові',
    };
    if (packImageFile) {
      newPackData.imageFile = packImageFile;
    }

    try {
      const savedPack = await savePackToDb(getToken(), newPackData);
      let updatedPacks = [...packsCatalog];
      if (editingPack)
        updatedPacks = updatedPacks.map((p) => (p.id === savedPack.id ? savedPack : p));
      else updatedPacks.push(savedPack);

      setPacksCatalog(updatedPacks);
      addSystemLog('Адмін', `${editingPack ? 'Оновлено' : 'Створено'} пак: ${packForm.name}`);
      setEditingPack(null);
      setPackImageFile(null);
      setPackForm({
        id: '',
        name: '',
        category: 'Базові',
        cost: 50,
        image: '',
        customWeights: {},
        statsRanges: {},
        isHidden: false,
        isPremiumOnly: false,
        isGame: false,
      });
      showToast('Пак збережено в MySQL!', 'success');
    } catch {
      showToast('Помилка збереження паку', 'error');
    }
  };

  const deletePack = async (packId) => {
    if (!confirm('Видалити цей пак?')) return;
    try {
      await deletePackFromDb(getToken(), packId);
      const pDef = packsCatalog.find((p) => p.id === packId);
      setPacksCatalog(packsCatalog.filter((p) => p.id !== packId));
      addSystemLog('Адмін', `Видалено пак: ${pDef?.name}`);
      showToast('Пак видалено з MySQL!', 'success');
    } catch {
      showToast('Помилка видалення', 'error');
    }
  };

  const saveCard = async (e) => {
    e.preventDefault();
    const newCardData = {
      id: editingCard ? editingCard.id : 'c' + Date.now(),
      packId: cardForm.packId,
      name: cardForm.name,
      rarity: cardForm.rarity,
      image: cardForm.image,
      maxSupply: cardForm.maxSupply ? Number(cardForm.maxSupply) : 0,
      weight: cardForm.weight ? Number(cardForm.weight) : null,
      sellPrice: cardForm.sellPrice ? Number(cardForm.sellPrice) : SELL_PRICE,
      effect: cardForm.effect || '',
      dropAnim: cardForm.dropAnim || '',
      soundUrl: cardForm.soundUrl || '',
      soundVolume: cardForm.soundVolume !== undefined ? Number(cardForm.soundVolume) : 0.5,
      frame: cardForm.frame || 'normal',
      isGame: !!cardForm.isGame,
      blockGame: !!cardForm.blockGame,
      perk: cardForm.perk || '',
      perkValue: cardForm.perkValue ? Number(cardForm.perkValue) : '',
      pulledCount: editingCard ? editingCard.pulledCount || 0 : 0,
      minPower: cardForm.minPower !== '' && cardForm.minPower !== null && cardForm.minPower !== undefined ? Number(cardForm.minPower) : null,
      maxPower: cardForm.maxPower !== '' && cardForm.maxPower !== null && cardForm.maxPower !== undefined ? Number(cardForm.maxPower) : null,
      minHp: cardForm.minHp !== '' && cardForm.minHp !== null && cardForm.minHp !== undefined ? Number(cardForm.minHp) : null,
      maxHp: cardForm.maxHp !== '' && cardForm.maxHp !== null && cardForm.maxHp !== undefined ? Number(cardForm.maxHp) : null,
      levelingConfig: cardForm.levelingConfig || {},
      bonusPerkLevel: cardForm.bonusPerkLevel ? Number(cardForm.bonusPerkLevel) : null,
      bonusPerk: cardForm.bonusPerk || '',
      bonusPerkValue: cardForm.bonusPerkValue ? Number(cardForm.bonusPerkValue) : null,
    };
    if (cardImageFile) {
      newCardData.imageFile = cardImageFile;
    }

    try {
      const savedCard = await saveCardToDb(getToken(), newCardData);
      let updatedCatalog = [...cardsCatalog];
      if (editingCard)
        updatedCatalog = updatedCatalog.map((c) => (c.id === savedCard.id ? savedCard : c));
      else updatedCatalog.push(savedCard);

      setCardsCatalog(updatedCatalog);
      addSystemLog('Адмін', `${editingCard ? 'Оновлено' : 'Створено'} картку: ${cardForm.name}`);
      setEditingCard(null);
      setCardImageFile(null);
      setCardForm({
        id: '',
        packId: packsCatalog[0]?.id || '',
        name: '',
        rarity: rarities[0]?.name || 'Звичайна',
        image: '',
        dropAnim: '',
        maxSupply: '',
        weight: '',
        sellPrice: '',
        effect: '',
        soundUrl: '',
        soundVolume: 0.5,
        frame: 'normal',
        isGame: false,
        blockGame: false,
        minPower: '',
        maxPower: '',
        minHp: '',
        maxHp: '',
        perk: '',
        perkValue: '',
      });
      showToast('Картку збережено в MySQL!', 'success');
    } catch {
      showToast('Помилка збереження картки', 'error');
    }
  };

  const deleteCard = async (cardId) => {
    if (!confirm('Видалити цю картку?')) return;
    try {
      await deleteCardFromDb(getToken(), cardId);
      const cDef = cardsCatalog.find((c) => c.id === cardId);
      setCardsCatalog(cardsCatalog.filter((c) => c.id !== cardId));
      addSystemLog('Адмін', `Видалено картку: ${cDef?.name}`);
      showToast('Картку видалено з MySQL!', 'success');
    } catch {
      showToast('Помилка видалення', 'error');
    }
  };

  const savePromo = async (e) => {
    e.preventDefault();
    const codeId = promoForm.code.trim().toUpperCase();
    if (!codeId) return;
    try {
      await savePromoRequest(getToken(), { ...promoForm, code: codeId });
      showToast('Промокод створено!', 'success');
      setPromoForm({ code: '', reward: 100, maxGlobalUses: 0, maxUserUses: 1 });
      const data = await fetchPromosRequest(getToken());
      setAllPromos(data || []);
    } catch {
      showToast('Помилка створення промокоду', 'error');
    }
  };

  const deletePromo = async (codeId) => {
    if (!confirm('Видалити промокод?')) return;
    try {
      await deletePromoRequest(getToken(), codeId);
      showToast('Промокод видалено.', 'success');
      setAllPromos(allPromos.filter((p) => p.code !== codeId));
    } catch {
      showToast('Помилка видалення.', 'error');
    }
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    try {
      const newSettings = getFullSettings();
      await saveSettingsRequest(getToken(), newSettings);
      await reloadSettings();
      addSystemLog('Адмін', 'Оновлено налаштування гри.');
      showToast('Налаштування оновлено!', 'success');
    } catch {
      showToast('Помилка оновлення налаштувань.', 'error');
    }
  };

  const editPremiumShopItem = (item) => {
    setEditingShopItem(item);
    setShopItemForm({
      type: item.type,
      itemId: item.itemId || '',
      price: item.price,
      currency: item.currency || 'coins',
      description: item.description || '',
      imageFile: null,
    });
  };

  const addPremiumShopItem = async (e) => {
    e.preventDefault();
    try {
      let finalImage = editingShopItem ? editingShopItem.image : undefined;
      let finalItemId = shopItemForm.itemId;

      if (shopItemForm.type === 'banner' || shopItemForm.type === 'plate') {
        const typeLabel = shopItemForm.type === 'plate' ? 'бейджа' : 'банера';
        if (shopItemForm.imageFile) {
          showToast(`Завантаження ${typeLabel}...`, 'success');
          const res = await uploadBannerRequest(getToken(), shopItemForm.imageFile);
          finalImage = res.url;
          finalItemId = editingShopItem ? editingShopItem.itemId : `${shopItemForm.type}_${Date.now()}`;
        } else if (!editingShopItem) {
          return showToast(`Будь ласка, завантажте файл ${typeLabel}.`, 'error');
        } else {
          finalItemId = editingShopItem.itemId;
        }
      }

      const newItem = {
        id: editingShopItem ? editingShopItem.id : 'si_' + Date.now(),
        type: shopItemForm.type,
        itemId: finalItemId,
        image: finalImage,
        price: Number(shopItemForm.price),
        currency: shopItemForm.currency || 'coins',
        description: shopItemForm.description,
      };
      const newSettings = getFullSettings();
      if (editingShopItem) {
        newSettings.premiumShopItems = premiumShopItems.map((i) =>
          i.id === editingShopItem.id ? newItem : i
        );
      } else {
        newSettings.premiumShopItems = [...premiumShopItems, newItem];
      }
      await saveSettingsRequest(getToken(), newSettings);
      await reloadSettings();
      showToast(editingShopItem ? 'Товар оновлено!' : 'Товар додано!', 'success');
      setShopItemForm({ type: 'card', itemId: '', price: 500, currency: 'coins', description: '', imageFile: null });
      setEditingShopItem(null);
    } catch {
      showToast('Помилка збереження товару.', 'error');
    }
  };

  const deletePremiumShopItem = async (itemId) => {
    if (!confirm('Видалити товар з магазину?')) return;
    try {
      const newSettings = getFullSettings();
      newSettings.premiumShopItems = premiumShopItems.filter((i) => i.id !== itemId);
      await saveSettingsRequest(getToken(), newSettings);
      await reloadSettings();
      showToast('Товар видалено.', 'success');
    } catch {
      showToast('Помилка видалення.', 'error');
    }
  };

  const clearAdminLogs = async () => {
    if (!confirm('Очистити всі системні логи? Це безповоротно!')) return;
    try {
      await clearAdminLogsRequest(getToken());
      setAdminLogs([]);
      showToast('Логи успішно очищено!', 'success');
    } catch (e) {
      console.error(e);
      showToast('Помилка очищення логів.', 'error');
    }
  };

  const clearUserHistory = async () => {
    if (!confirm(`Очистити історію ринку гравця ${viewingUser.nickname}?`)) return;
    try {
      await adminClearUserMarketHistoryRequest(getToken(), viewingUser.uid);
      showToast('Історію гравця очищено!', 'success');
    } catch {
      showToast('Помилка.', 'error');
    }
  };

  const clearAllMarketHistory = async () => {
    if (!confirm('УВАГА! Це назавжди видалить історію ринку ВУСІХ гравців. Продовжити?')) return;
    try {
      await adminClearAllMarketHistoryRequest(getToken());
      showToast('Глобальну історію очищено!', 'success');
    } catch {
      showToast('Помилка.', 'error');
    }
  };

  const filteredPacks = packsCatalog.filter((p) =>
    p.name.toLowerCase().includes(packSearchTerm.toLowerCase())
  );

  const filteredCards = cardsCatalog
    .filter((c) => {
      const matchesSearch = c.name.toLowerCase().includes(cardSearchTerm.toLowerCase());
      const matchesPack = cardPackFilter === 'all' || c.packId === cardPackFilter;
      return matchesSearch && matchesPack;
    })
    .sort((a, b) => {
      const wA = rarities.find((r) => r.name === a.rarity)?.weight || 100;
      const wB = rarities.find((r) => r.name === b.rarity)?.weight || 100;
      return wA - wB;
    });

  const handleSendNotification = async (e) => {
    e.preventDefault();
    try {
      await sendAdminNotification(getToken(), notifForm);
      showToast('Сповіщення успішно надіслано!', 'success');
      setNotifForm({
        targetUid: 'ALL',
        type: 'update',
        title: '',
        message: '',
        attachedCoins: 0,
        attachedCardId: '',
        attachedCardAmount: 1,
      });
    } catch (err) {
      showToast(err.message || 'Помилка надсилання сповіщення.', 'error');
    }
  };

  const saveAchievement = async (e) => {
    e.preventDefault();
    try {
      await saveAchievementSettingsRequest(getToken(), achievementForm);
      showToast(editingAchievement ? 'Ачівку оновлено!' : 'Ачівку створено!', 'success');
      setAchievementForm({
        id: '',
        packId: packsCatalog[0]?.id || '',
        name: '',
        description: '',
        iconUrl: '',
      });
      setEditingAchievement(null);
      const data = await fetchAdminAchievements(getToken());
      setAllAchievements(data || []);
    } catch {
      showToast('Помилка збереження ачівки', 'error');
    }
  };

  const deleteAchievement = async (id) => {
    if (!confirm('Видалити ачівку?')) return;
    try {
      await deleteAchievementSettingsRequest(getToken(), id);
      showToast('Ачівку видалено.', 'success');
      setAllAchievements(allAchievements.filter((a) => a.id !== id));
    } catch {
      showToast('Помилка видалення ачівки', 'error');
    }
  };

  // --- ДОДАТИ ЦЮ ФУНКЦІЮ ПЕРЕД return ( ---
  const calculateDropChance = (targetCard, packInfo) => {
    if (!packInfo) return '0%';

    const cardsInThisPack = cardsCatalog.filter((c) => c.packId === packInfo.id);
    if (cardsInThisPack.length === 0) return '0%';

    const DEFAULT_RARITY_WEIGHTS = {
      'Звичайна': 8500,
      'Рідкісна': 1350,
      'Епічна': 135,
      'Легендарна': 14,
      'Унікальна': 1
    };

    let availableCards = cardsInThisPack.filter(c => !(c.maxSupply > 0 && (c.pulledCount || 0) >= c.maxSupply));
    if (availableCards.length === 0) return '0%';

    const rarityCounts = {};
    for (const c of availableCards) {
      if (c.weight === null || c.weight === undefined || c.weight === '') {
        rarityCounts[c.rarity] = (rarityCounts[c.rarity] || 0) + 1;
      }
    }

    let totalWeight = 0;
    let targetCardWeight = 0;

    for (const c of availableCards) {
      let w = 0;
      if (c.weight !== null && c.weight !== undefined && c.weight !== '') {
        w = Number(c.weight);
      } else {
        const globalW = DEFAULT_RARITY_WEIGHTS[c.rarity] || 1;
        let baseW = globalW;
        if (
          packInfo.customWeights &&
          packInfo.customWeights[c.rarity] !== undefined &&
          packInfo.customWeights[c.rarity] !== ''
        ) {
          baseW = Number(packInfo.customWeights[c.rarity]);
        }
        w = baseW / (rarityCounts[c.rarity] || 1);
      }

      totalWeight += w;
      if (c.id === targetCard.id) {
        targetCardWeight = w;
      }
    }

    if (totalWeight === 0) return '0%';
    const chance = (targetCardWeight / totalWeight) * 100;
    if (chance === 0) return '0%';
    if (chance < 0.0001) return '<0.0001%';
    const fixed = chance < 0.1 ? chance.toFixed(4) : chance.toFixed(2);
    return parseFloat(fixed) + '%';
  };

  const calculatePackEV = (packInfo) => {
    if (!packInfo) return 0;
    const cardsInThisPack = cardsCatalog.filter((c) => c.packId === packInfo.id);
    if (cardsInThisPack.length === 0) return 0;

    const DEFAULT_RARITY_WEIGHTS = {
      'Звичайна': 8500,
      'Рідкісна': 1350,
      'Епічна': 135,
      'Легендарна': 14,
      'Унікальна': 1
    };

    let availableCards = cardsInThisPack.filter(c => !(c.maxSupply > 0 && (c.pulledCount || 0) >= c.maxSupply));
    if (availableCards.length === 0) return 0;

    const rarityCounts = {};
    for (const c of availableCards) {
      if (c.weight === null || c.weight === undefined || c.weight === '') {
        rarityCounts[c.rarity] = (rarityCounts[c.rarity] || 0) + 1;
      }
    }

    let totalWeight = 0;
    const cardsWithWeights = [];

    for (const c of availableCards) {
      let w = 0;
      if (c.weight !== null && c.weight !== undefined && c.weight !== '') {
        w = Number(c.weight);
      } else {
        const globalW = DEFAULT_RARITY_WEIGHTS[c.rarity] || 1;
        let baseW = globalW;
        if (
          packInfo.customWeights &&
          packInfo.customWeights[c.rarity] !== undefined &&
          packInfo.customWeights[c.rarity] !== ''
        ) {
          baseW = Number(packInfo.customWeights[c.rarity]);
        }
        w = baseW / (rarityCounts[c.rarity] || 1);
      }
      totalWeight += w;
      cardsWithWeights.push({ card: c, weight: w });
    }

    if (totalWeight === 0) return 0;

    let totalEV = 0;
    for (const item of cardsWithWeights) {
      const chance = item.weight / totalWeight;
      totalEV += chance * (Number(item.card.sellPrice) || 15);
    }
    return totalEV;
  };

  const filteredAdminUsers = allUsers.filter((u) =>
    u.nickname?.toLowerCase().includes(adminUserSearchTerm.toLowerCase())
  );

  return (
    <div className="w-full max-w-[98%] 2xl:max-w-[1800px] mx-auto pb-10 relative">
      {/* МОДАЛКА БАНУ */}
      {banModalUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-neutral-900 border border-red-900/50 p-6 rounded-3xl shadow-2xl max-w-sm w-full animate-in zoom-in-95">
            <h3 className="text-xl font-black text-red-500 mb-4 flex items-center gap-2">
              <Ban /> Заблокувати {banModalUser.nickname}
            </h3>
            <form onSubmit={submitBan} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">
                  Причина блокування:
                </label>
                <input
                  type="text"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Наприклад: Чіти, Образи..."
                  required
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-red-500 outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">
                  Термін:
                </label>
                <div className="flex gap-2">
                  {banDurationUnit !== 'perm' && (
                    <input
                      type="number"
                      min="1"
                      value={banDurationValue}
                      onChange={(e) => setBanDurationValue(e.target.value)}
                      placeholder="Час..."
                      required
                      className="w-1/2 bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-red-500 outline-none"
                    />
                  )}
                  <select
                    value={banDurationUnit}
                    onChange={(e) => {
                      setBanDurationUnit(e.target.value);
                      if (e.target.value === 'perm') setBanDurationValue('');
                    }}
                    className="w-1/2 flex-1 bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-red-500 outline-none"
                  >
                    <option value="m">Хвилин</option>
                    <option value="h">Годин</option>
                    <option value="d">Днів</option>
                    <option value="perm">Назавжди</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl transition-colors"
                >
                  Забанити
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBanModalUser(null);
                    setBanReason('');
                    setBanDurationValue('');
                  }}
                  className="bg-neutral-800 text-white font-bold py-3 px-6 rounded-xl"
                >
                  Скасувати
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* МОДАЛКА УПРАВЛІННЯ ІГРОВОЮ КАРТКОЮ */}
      {adminRemoveModalData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-neutral-900 border border-neutral-700 p-6 rounded-3xl shadow-2xl max-w-xl w-full max-h-[85vh] flex flex-col animate-in zoom-in-95">
            <h3 className="text-xl font-black text-white mb-1 flex items-center gap-2">
              <Swords size={20} className="text-purple-400" />
              {adminRemoveModalData.cardName}
            </h3>
            {/* Perk info from card definition */}
            {(() => {
              const cd = adminRemoveModalData.cardDef;
              if (!cd) return null;
              const perks = [cd.perk, cd.bonusPerk].filter(Boolean).filter(p => PERK_META[p]);
              return perks.length > 0 ? (
                <div className="flex flex-wrap gap-2 mb-3 mt-1">
                  {perks.map(p => {
                    const m = PERK_META[p];
                    return (
                      <span key={p} className={`text-xs px-2 py-0.5 rounded-full ${m.bg} ${m.color} font-bold border border-white/10`} title={m.desc}>
                        {m.label}{cd.perk === p && cd.perkValue ? ` ${cd.perkValue}%` : ''}{cd.bonusPerk === p && cd.bonusPerkValue ? ` ${cd.bonusPerkValue}%` : ''}
                      </span>
                    );
                  })}
                  {cd.bonusPerkLevel && <span className="text-[10px] text-neutral-500">Бонус-перк з {cd.bonusPerkLevel} рів.</span>}
                </div>
              ) : null;
            })()}
            {adminRemoveModalData.cardDef?.isGame ? (
              // ===== ІГРОВА КАРТКА: головна + дублікати =====
              (() => {
                const stats = adminRemoveModalData.stats || [];
                const mainIdx = stats.reduce((best, s, i) => (s.level || 1) > (stats[best]?.level || 1) ? i : best, 0);
                const mainStat = stats[mainIdx];
                const dupCount = stats.length - 1;
                const cd = adminRemoveModalData.cardDef;
                return (
                  <div className="flex-1 overflow-y-auto pr-1 mb-4 space-y-3">
                    {/* Головна картка */}
                    <div>
                      <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Головна картка</p>
                      {mainStat ? (
                        <div className="bg-neutral-950 p-3 rounded-xl border border-purple-900/40 flex justify-between items-center gap-2">
                          <div className="flex items-center gap-1 shrink-0">
                            <Star size={13} className="text-yellow-400" />
                            <span className="text-yellow-300 font-black text-sm">Рів.{mainStat.level || 1}</span>
                          </div>
                          <div className="flex gap-3 flex-1 flex-wrap">
                            <div className="flex items-center gap-1 text-green-400 font-bold text-sm">
                              <Swords size={12} />{mainStat.power}
                            </div>
                            <div className="flex items-center gap-1 text-red-400 font-bold text-sm">
                              <Heart size={12} />{mainStat.hp}
                            </div>
                            {mainStat.emerald && (() => {
                              const et = emeraldTypes.find(e => e.id === mainStat.emerald);
                              return et ? (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-700/50 bg-emerald-900/30 text-emerald-300 flex items-center gap-1">
                                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: et.color }} />
                                  {et.name}
                                </span>
                              ) : null;
                            })()}
                            {mainStat.inSafe && <span className="text-[10px] bg-blue-900/40 text-blue-300 px-1.5 py-0.5 rounded border border-blue-800">Сейф</span>}
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <button
                              onClick={() => {
                                setAdminEditCardModal({
                                  cardId: adminRemoveModalData.cardId,
                                  cardName: adminRemoveModalData.cardName,
                                  statIdx: mainIdx,
                                  editPower: mainStat.power,
                                  editHp: mainStat.hp,
                                  editLevel: mainStat.level || 1,
                                  editEmerald: mainStat.emerald || null,
                                  origEmerald: mainStat.emerald || null,
                                  editPerk: cd?.perk || '',
                                  editPerkValue: cd?.perkValue ?? '',
                                  editBonusPerk: cd?.bonusPerk || '',
                                  editBonusPerkValue: cd?.bonusPerkValue ?? '',
                                  editBonusPerkLevel: cd?.bonusPerkLevel ?? '',
                                  origPerk: cd?.perk || '',
                                  origPerkValue: cd?.perkValue ?? '',
                                  origBonusPerk: cd?.bonusPerk || '',
                                  origBonusPerkValue: cd?.bonusPerkValue ?? '',
                                  origBonusPerkLevel: cd?.bonusPerkLevel ?? '',
                                  cardDef: cd,
                                });
                              }}
                              className="bg-blue-900/30 hover:bg-blue-900/60 text-blue-400 p-2 rounded-lg transition-colors border border-blue-900/50"
                              title="Редагувати"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => removeSpecificCardInstance(adminRemoveModalData.cardId, mainIdx)}
                              className="bg-red-600/20 hover:bg-red-600/40 text-red-500 p-2 rounded-lg transition-colors border border-red-900/50"
                              title="Вилучити картку"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-neutral-500 text-sm py-3 text-center">Немає статів.</div>
                      )}
                    </div>
                    {/* Дублікати */}
                    <div>
                      <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Дублікати для апгрейду</p>
                      <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 flex items-center justify-between gap-3">
                        <span className="text-neutral-300 text-sm">Кількість дублікатів:</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => adminRemoveDuplicate(adminRemoveModalData.cardId, mainIdx, stats)}
                            disabled={dupCount <= 0}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-900/30 hover:bg-red-900/60 text-red-400 border border-red-900/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed font-black text-lg"
                          >−</button>
                          <span className="text-white font-black text-lg w-8 text-center">{dupCount}</span>
                          <button
                            onClick={() => adminAddDuplicate(adminRemoveModalData.cardId)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-green-900/30 hover:bg-green-900/60 text-green-400 border border-green-900/50 transition-colors font-black text-lg"
                          >+</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : (
              // ===== ЗВИЧАЙНА КАРТКА: всі примірники =====
              <>
                <p className="text-xs text-neutral-500 mb-3">Екземпляри картки у гравця — редагуй або вилучай конкретний примірник.</p>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 mb-4">
                  {adminRemoveModalData.stats && adminRemoveModalData.stats.length > 0 ? (
                    adminRemoveModalData.stats.map((stat, idx) => (
                      <div key={idx} className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 flex justify-between items-center gap-2">
                        <div className="flex items-center gap-1 shrink-0">
                          <Star size={13} className="text-yellow-400" />
                          <span className="text-yellow-300 font-black text-sm">Рів.{stat.level || 1}</span>
                        </div>
                        <div className="flex gap-3 flex-1 flex-wrap">
                          <div className="flex items-center gap-1 text-green-400 font-bold text-sm">
                            <Swords size={12} />{stat.power}
                          </div>
                          <div className="flex items-center gap-1 text-red-400 font-bold text-sm">
                            <Heart size={12} />{stat.hp}
                          </div>
                          {stat.emerald && (() => {
                            const et = emeraldTypes.find(e => e.id === stat.emerald);
                            return et ? (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-700/50 bg-emerald-900/30 text-emerald-300 flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full inline-block" style={{ background: et.color }} />
                                {et.name}
                              </span>
                            ) : null;
                          })()}
                          {stat.inSafe && <span className="text-[10px] bg-blue-900/40 text-blue-300 px-1.5 py-0.5 rounded border border-blue-800">Сейф</span>}
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            onClick={() => {
                              const cd = adminRemoveModalData.cardDef;
                              setAdminEditCardModal({
                                cardId: adminRemoveModalData.cardId,
                                cardName: adminRemoveModalData.cardName,
                                statIdx: idx,
                                editPower: stat.power,
                                editHp: stat.hp,
                                editLevel: stat.level || 1,
                                editEmerald: stat.emerald || null,
                                origEmerald: stat.emerald || null,
                                editPerk: cd?.perk || '',
                                editPerkValue: cd?.perkValue ?? '',
                                editBonusPerk: cd?.bonusPerk || '',
                                editBonusPerkValue: cd?.bonusPerkValue ?? '',
                                editBonusPerkLevel: cd?.bonusPerkLevel ?? '',
                                origPerk: cd?.perk || '',
                                origPerkValue: cd?.perkValue ?? '',
                                origBonusPerk: cd?.bonusPerk || '',
                                origBonusPerkValue: cd?.bonusPerkValue ?? '',
                                origBonusPerkLevel: cd?.bonusPerkLevel ?? '',
                                cardDef: cd,
                              });
                            }}
                            className="bg-blue-900/30 hover:bg-blue-900/60 text-blue-400 p-2 rounded-lg transition-colors border border-blue-900/50"
                            title="Редагувати"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => removeSpecificCardInstance(adminRemoveModalData.cardId, idx)}
                            className="bg-red-600/20 hover:bg-red-600/40 text-red-500 p-2 rounded-lg transition-colors border border-red-900/50"
                            title="Вилучити"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-neutral-500 text-sm py-4 text-center">Ця картка не має ігрових статів.</div>
                  )}
                </div>
              </>
            )}
            <button
              onClick={() => setAdminRemoveModalData(null)}
              className="w-full bg-neutral-800 text-white font-bold py-3 rounded-xl hover:bg-neutral-700 transition-colors"
            >
              Закрити
            </button>
          </div>
        </div>
      )}

      {/* МОДАЛКА ПОВНОГО РЕДАГУВАННЯ КАРТКИ ГРАВЦЯ */}
      {adminEditCardModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in">
          <div className="bg-neutral-900 border border-blue-900/50 p-5 rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95">
            <h3 className="text-lg font-black text-blue-300 mb-0.5 flex items-center gap-2">
              <Edit2 size={18} /> {adminEditCardModal.cardName}
            </h3>
            <p className="text-xs text-neutral-500 mb-4">Примірник #{adminEditCardModal.statIdx + 1}</p>

            {/* === БЛОК 1: СТАТКИ ПРИМІРНИКА === */}
            <div className="mb-4 p-3.5 bg-neutral-950 border border-neutral-800 rounded-2xl">
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-3">⚙️ Статки примірника</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-yellow-400 uppercase mb-1 block">Рівень</label>
                  <input type="number" min="1" max="10"
                    value={adminEditCardModal.editLevel}
                    onChange={e => setAdminEditCardModal(prev => ({ ...prev, editLevel: e.target.value }))}
                    className="w-full bg-black border border-neutral-700 rounded-xl px-3 py-2 text-white focus:border-yellow-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-green-400 uppercase mb-1 block">Сила</label>
                  <input type="number" min="0"
                    value={adminEditCardModal.editPower}
                    onChange={e => setAdminEditCardModal(prev => ({ ...prev, editPower: e.target.value }))}
                    className="w-full bg-black border border-neutral-700 rounded-xl px-3 py-2 text-white focus:border-green-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-red-400 uppercase mb-1 block">HP</label>
                  <input type="number" min="0"
                    value={adminEditCardModal.editHp}
                    onChange={e => setAdminEditCardModal(prev => ({ ...prev, editHp: e.target.value }))}
                    className="w-full bg-black border border-neutral-700 rounded-xl px-3 py-2 text-white focus:border-red-500 outline-none text-sm"
                  />
                </div>
              </div>
              {/* Смарагд на примірнику */}
              <div className="mt-3">
                <label className="text-[10px] font-bold text-emerald-400 uppercase mb-1 block">Смарагд на картці</label>
                <select
                  value={adminEditCardModal.editEmerald || ''}
                  onChange={e => setAdminEditCardModal(prev => ({ ...prev, editEmerald: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full bg-black border border-neutral-700 rounded-xl px-3 py-2 text-white focus:border-emerald-500 outline-none text-sm"
                >
                  <option value="">Без смарагду</option>
                  {emeraldTypes.map(et => (
                    <option key={et.id} value={et.id}>{et.name} (+{et.perkBoostPercent}%)</option>
                  ))}
                </select>
              </div>
            </div>

            {/* === БЛОК 2: ВИЗНАЧЕННЯ КАРТКИ (перки) === */}
            <div className="mb-4 p-3.5 bg-purple-950/20 border border-purple-900/30 rounded-2xl">
              <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1">⚡ Визначення картки (перки)</p>
              <p className="text-[10px] text-neutral-500 mb-3">⚠️ Зміни застосуються до всіх гравців з цією карткою</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-purple-300 uppercase mb-1 block">Перк</label>
                  <select
                    value={adminEditCardModal.editPerk || ''}
                    onChange={e => setAdminEditCardModal(prev => ({ ...prev, editPerk: e.target.value }))}
                    className="w-full bg-black border border-neutral-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 outline-none text-sm"
                  >
                    <option value="">Без перку</option>
                    <optgroup label="⚔️ Атакувальні">
                      <option value="crit">Крит</option>
                      <option value="cleave">Сплеск</option>
                      <option value="poison">Отрута</option>
                      <option value="lifesteal">Вампіризм</option>
                      <option value="burn">Опік</option>
                    </optgroup>
                    <optgroup label="🛡️ Захисні">
                      <option value="dodge">Ухилення</option>
                      <option value="thorns">Шипи</option>
                      <option value="armor">Броня</option>
                      <option value="laststand">Виживання</option>
                      <option value="shield">Щит</option>
                    </optgroup>
                    <optgroup label="🎯 Тактичні">
                      <option value="taunt">Провокація</option>
                      <option value="healer">Цілитель</option>
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-purple-300 uppercase mb-1 block">Ефект (%)</label>
                  <input type="number" min="1" max="100"
                    placeholder="Авто"
                    disabled={!adminEditCardModal.editPerk || adminEditCardModal.editPerk === 'taunt' || adminEditCardModal.editPerk === 'laststand'}
                    value={adminEditCardModal.editPerkValue ?? ''}
                    onChange={e => setAdminEditCardModal(prev => ({ ...prev, editPerkValue: e.target.value }))}
                    className="w-full bg-black border border-neutral-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 outline-none text-sm disabled:opacity-30"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-blue-300 uppercase mb-1 block">Бонус-перк (рів.)</label>
                  <select
                    value={adminEditCardModal.editBonusPerkLevel ?? ''}
                    onChange={e => setAdminEditCardModal(prev => ({ ...prev, editBonusPerkLevel: e.target.value }))}
                    className="w-full bg-black border border-neutral-700 rounded-xl px-3 py-2 text-white focus:border-blue-500 outline-none text-sm"
                  >
                    <option value="">Без бонус-перку</option>
                    {[2,3,4,5,6,7,8,9,10].map(l => <option key={l} value={l}>Рів. {l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-blue-300 uppercase mb-1 block">Бонус-перк</label>
                  <select
                    value={adminEditCardModal.editBonusPerk || ''}
                    disabled={!adminEditCardModal.editBonusPerkLevel}
                    onChange={e => setAdminEditCardModal(prev => ({ ...prev, editBonusPerk: e.target.value }))}
                    className="w-full bg-black border border-neutral-700 rounded-xl px-3 py-2 text-white focus:border-blue-500 outline-none text-sm disabled:opacity-30"
                  >
                    <option value="">Оберіть</option>
                    <option value="crit">Крит</option>
                    <option value="cleave">Сплеск</option>
                    <option value="poison">Отрута</option>
                    <option value="lifesteal">Вампіризм</option>
                    <option value="burn">Опік</option>
                    <option value="dodge">Ухилення</option>
                    <option value="thorns">Шипи</option>
                    <option value="armor">Броня</option>
                    <option value="laststand">Виживання</option>
                    <option value="shield">Щит</option>
                    <option value="taunt">Провокація</option>
                    <option value="healer">Цілитель</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-blue-300 uppercase mb-1 block">Ефект бонус-перку (%)</label>
                  <input type="number" min="1" max="100"
                    placeholder="Авто"
                    disabled={!adminEditCardModal.editBonusPerk || adminEditCardModal.editBonusPerk === 'taunt' || adminEditCardModal.editBonusPerk === 'laststand'}
                    value={adminEditCardModal.editBonusPerkValue ?? ''}
                    onChange={e => setAdminEditCardModal(prev => ({ ...prev, editBonusPerkValue: e.target.value }))}
                    className="w-full bg-black border border-neutral-700 rounded-xl px-3 py-2 text-white focus:border-blue-500 outline-none text-sm disabled:opacity-30"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setAdminEditCardModal(null)}
                className="flex-1 bg-neutral-800 text-white font-bold py-3 rounded-xl hover:bg-neutral-700 transition-colors text-sm">
                Скасувати
              </button>
              <button onClick={saveCardStatEdit}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors text-sm">
                Зберегти
              </button>
            </div>
          </div>
        </div>
      )}

      {/* МОДАЛКА ПРЕМІУМУ */}
      {premiumModalUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-neutral-900 border border-fuchsia-900/50 p-6 rounded-3xl shadow-2xl max-w-sm w-full animate-in zoom-in-95">
            <h3 className="text-xl font-black text-fuchsia-400 mb-4 flex items-center gap-2">
              <Gem /> Преміум: {premiumModalUser.nickname}
            </h3>
            <div className="space-y-4">
              {premiumModalUser.isPremium &&
                premiumModalUser.premiumUntil &&
                new Date(premiumModalUser.premiumUntil) > new Date() && (
                  <div className="bg-fuchsia-900/20 border border-fuchsia-500/30 p-3 rounded-xl text-fuchsia-300 text-sm mb-4">
                    Поточний преміум до: <br />
                    <span className="font-bold">{formatDate(premiumModalUser.premiumUntil)}</span>
                  </div>
                )}
              <form onSubmit={(e) => handlePremiumAction(e, 'give')}>
                <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">
                  Додати/Видати днів:
                </label>
                <input
                  type="number"
                  min="1"
                  value={premiumGiveDays}
                  onChange={(e) => setPremiumGiveDays(e.target.value)}
                  required
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-fuchsia-500 outline-none mb-4"
                />
                <button
                  type="submit"
                  className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold py-3 rounded-xl transition-colors shadow-lg"
                >
                  Видати / Продовжити
                </button>
              </form>

              {premiumModalUser.isPremium && (
                <button
                  onClick={(e) => handlePremiumAction(e, 'revoke')}
                  className="w-full bg-red-900/40 hover:bg-red-900 text-red-400 font-bold py-3 rounded-xl transition-colors border border-red-900/50 mt-2"
                >
                  Забрати Преміум
                </button>
              )}
              <button
                onClick={() => setPremiumModalUser(null)}
                className="w-full bg-neutral-800 text-white font-bold py-3 rounded-xl mt-2 hover:bg-neutral-700 transition-colors"
              >
                Скасувати
              </button>
            </div>
          </div>
        </div>
      )}

      {/* НАВІГАЦІЯ АДМІНКИ */}
      <div className="flex flex-wrap gap-2 mb-6 bg-neutral-900 p-2 rounded-xl">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex-1 min-w-[120px] whitespace-nowrap py-3 px-3 rounded-lg font-bold flex justify-center items-center gap-2 ${activeTab === 'users' ? 'bg-purple-600 text-white' : 'text-neutral-400 hover:bg-neutral-800'}`}
        >
          <Users size={18} /> Гравці
        </button>
        <button
          onClick={() => setActiveTab('packs')}
          className={`flex-1 min-w-[120px] whitespace-nowrap py-3 px-3 rounded-lg font-bold flex justify-center items-center gap-2 ${activeTab === 'packs' ? 'bg-purple-600 text-white' : 'text-neutral-400 hover:bg-neutral-800'}`}
        >
          <Layers size={18} /> Паки
        </button>
        <button
          onClick={() => setActiveTab('cards')}
          className={`flex-1 min-w-[120px] whitespace-nowrap py-3 px-3 rounded-lg font-bold flex justify-center items-center gap-2 ${activeTab === 'cards' ? 'bg-purple-600 text-white' : 'text-neutral-400 hover:bg-neutral-800'}`}
        >
          <LayoutGrid size={18} /> Картки
        </button>
        {(currentProfile.isAdmin || currentProfile.isSuperAdmin) && (
          <>
            <button
              onClick={() => setActiveTab('achievements')}
              className={`flex-1 min-w-[120px] whitespace-nowrap py-3 px-3 rounded-lg font-bold flex justify-center items-center gap-2 ${activeTab === 'achievements' ? 'bg-purple-600 text-white' : 'text-neutral-400 hover:bg-neutral-800'}`}
            >
              <Trophy size={18} /> Ачівки
            </button>
            <button
              onClick={() => setActiveTab('bosses')}
              className={`flex-1 min-w-[120px] whitespace-nowrap py-3 px-3 rounded-lg font-bold flex justify-center items-center gap-2 ${activeTab === 'bosses' ? 'bg-red-600 text-white' : 'text-neutral-400 hover:bg-neutral-800'}`}
            >
              <Swords size={18} /> Боси
            </button>
            <button
              onClick={() => setActiveTab('promos')}
              className={`flex-1 min-w-[120px] whitespace-nowrap py-3 px-3 rounded-lg font-bold flex justify-center items-center gap-2 ${activeTab === 'promos' ? 'bg-purple-600 text-white' : 'text-neutral-400 hover:bg-neutral-800'}`}
            >
              <Ticket size={18} /> Коди
            </button>
            <button
              onClick={() => setActiveTab('notifications')}
              className={`flex-1 min-w-[120px] whitespace-nowrap py-3 px-3 rounded-lg font-bold flex justify-center items-center gap-2 ${activeTab === 'notifications' ? 'bg-blue-600 text-white' : 'text-blue-400/70 hover:bg-neutral-800'}`}
            >
              <Mail size={18} className="shrink-0" /> Сповіщення
            </button>
            <button
              onClick={() => setActiveTab('premiumShop')}
              className={`flex-1 min-w-[120px] whitespace-nowrap py-3 px-3 rounded-lg font-bold flex justify-center items-center gap-2 ${activeTab === 'premiumShop' ? 'bg-fuchsia-600 text-white' : 'text-fuchsia-400/70 hover:bg-neutral-800'}`}
            >
              <Gem size={18} /> Прем Товари
            </button>
            <button
              onClick={() => setActiveTab('emeralds')}
              className={`flex-1 min-w-[120px] whitespace-nowrap py-3 px-3 rounded-lg font-bold flex justify-center items-center gap-2 ${activeTab === 'emeralds' ? 'bg-emerald-700 text-white' : 'text-emerald-400/70 hover:bg-neutral-800'}`}
            >
              💎 Смарагди
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex-1 min-w-[120px] whitespace-nowrap py-3 px-3 rounded-lg font-bold flex justify-center items-center gap-2 ${activeTab === 'settings' ? 'bg-purple-600 text-white' : 'text-neutral-400 hover:bg-neutral-800'}`}
            >
              <Settings size={18} /> Налаштування
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`flex-1 min-w-[120px] whitespace-nowrap py-3 px-3 rounded-lg font-bold flex justify-center items-center gap-2 ${activeTab === 'logs' ? 'bg-red-900 text-white' : 'text-red-400 hover:bg-neutral-800'}`}
            >
              <ScrollText size={18} /> Логи
            </button>
          </>
        )}
      </div>

      {/* --- Вкладка: ГРАВЦІ --- */}
      {activeTab === 'users' && (
        <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-4 relative">


          {viewingUser ? (
            <div className="animate-in fade-in slide-in-from-right-4">
              <button
                onClick={() => setViewingUser(null)}
                className="mb-4 text-neutral-400 hover:text-white flex items-center gap-2 font-bold"
              >
                <ArrowLeft size={18} /> Назад до списку
              </button>

              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 mb-4 flex flex-col sm:flex-row gap-3 items-end sm:items-center">
                <div className="flex-1 w-full">
                  <label className="text-xs text-neutral-400 font-bold mb-1 block">
                    Змінити нікнейм гравцю:
                  </label>
                  <input
                    type="text"
                    value={adminNewNickname}
                    onChange={(e) => setAdminNewNickname(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  onClick={changeUserNickname}
                  disabled={!adminNewNickname.trim() || adminNewNickname === viewingUser.nickname}
                  className="bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 text-white font-bold px-4 py-2 rounded-lg w-full sm:w-auto transition-colors h-10"
                >
                  Змінити
                </button>
              </div>

              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 mb-4 flex flex-col sm:flex-row gap-3 items-end sm:items-center">
                <div className="flex-1 w-full">
                  <label className="text-xs text-neutral-400 font-bold mb-1 block">
                    Нарахувати картку гравцю:
                  </label>
                  <select
                    value={adminAddCardId}
                    onChange={(e) => setAdminAddCardId(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white outline-none focus:border-purple-500"
                  >
                    <option value="" disabled>
                      Оберіть картку (найрідкісніші зверху)...
                    </option>
                    {filteredCards.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.rarity})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-full sm:w-24">
                  <label className="text-xs text-neutral-400 font-bold mb-1 block">
                    Кількість:
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={adminAddCardAmount}
                    onChange={(e) => setAdminAddCardAmount(Number(e.target.value))}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white outline-none focus:border-purple-500"
                  />
                </div>
                <div className="w-full sm:w-20">
                  <label className="text-xs text-neutral-400 font-bold mb-1 block">Сила:</label>
                  <input
                    type="number"
                    placeholder="Auto"
                    value={adminAddCardPower}
                    onChange={(e) => setAdminAddCardPower(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white outline-none focus:border-green-500"
                  />
                </div>
                <div className="w-full sm:w-20">
                  <label className="text-xs text-neutral-400 font-bold mb-1 block">HP:</label>
                  <input
                    type="number"
                    placeholder="Auto"
                    value={adminAddCardHp}
                    onChange={(e) => setAdminAddCardHp(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white outline-none focus:border-red-500"
                  />
                </div>
                <div className="w-full sm:w-20">
                  <label className="text-xs text-neutral-400 font-bold mb-1 block">Рівень:</label>
                  <input
                    type="number"
                    placeholder="1"
                    min="1"
                    max="10"
                    value={adminAddCardLevel}
                    onChange={(e) => setAdminAddCardLevel(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white outline-none focus:border-yellow-500"
                  />
                </div>
                <button
                  onClick={giveCardToUser}
                  disabled={!adminAddCardId}
                  className="bg-green-600 hover:bg-green-500 disabled:bg-neutral-700 text-white font-bold px-4 py-2 rounded-lg w-full sm:w-auto transition-colors h-10"
                >
                  Надати
                </button>
              </div>

              <div className="flex flex-col xl:flex-row gap-4 mb-6">
                <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 flex-1 flex flex-col gap-3">
                  <div>
                    <label className="text-xs text-neutral-400 font-bold mb-1 block">
                      Встановити точний баланс:
                    </label>
                    <input
                      type="number"
                      value={adminSetCoinsAmount}
                      onChange={(e) => setAdminSetCoinsAmount(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white outline-none focus:border-yellow-500"
                    />
                  </div>
                  <button
                    onClick={setExactCoinsToUser}
                    className="bg-yellow-600 hover:bg-yellow-500 text-yellow-950 font-bold px-4 py-2 rounded-lg w-full transition-colors flex-1 min-h-[40px]"
                  >
                    Встановити
                  </button>
                </div>

                <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 flex-1 flex flex-col gap-3">
                  <div>
                    <label className="text-xs text-neutral-400 font-bold mb-1 block">
                      Рівень Босів (Фарм):
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={adminSetFarmLevel}
                      onChange={(e) => setAdminSetFarmLevel(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white outline-none focus:border-red-500"
                    />
                  </div>
                  <div className="flex gap-2 flex-1">
                    <button
                      onClick={setPlayerFarmLevel}
                      className="bg-red-600 hover:bg-red-500 text-white font-bold px-4 py-2 rounded-lg flex-1 transition-colors min-h-[40px] whitespace-nowrap"
                    >
                      Рівень
                    </button>
                    {/* КНОПКА СКИНУТИ КД (В ДЕТАЛЬНОМУ ПРОФІЛІ) */}
                    <button
                      onClick={() => resetPlayerCooldown(viewingUser.uid, viewingUser.nickname)}
                      className="bg-yellow-600 hover:bg-yellow-500 text-yellow-950 font-bold px-4 py-2 rounded-lg transition-colors min-h-[40px]"
                      title="Скинути таймер боса"
                    >
                      <Zap size={20} className="mx-auto" />
                    </button>
                  </div>
                  <button
                    onClick={resetFarmLimit}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-lg transition-colors w-full text-sm flex items-center justify-center gap-2"
                    title="Скинути денний ліміт фарму 500к"
                  >
                    Скинути ліміт фарму ({((viewingUser.dailyFarmAmount || 0) / 1000).toFixed(0)}к / 500к)
                  </button>
                </div>

                <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 flex-1 flex flex-col gap-3">
                  <h4 className="font-bold text-neutral-300 mb-2 mt-1 xl:mt-0">Ринок:</h4>
                  <button
                    onClick={clearUserHistory}
                    className="w-full bg-red-900/40 hover:bg-red-900 text-red-400 hover:text-white font-bold py-2 rounded-xl transition-colors border border-red-900/50 flex-1 min-h-[40px]"
                  >
                    Очистити історію ринку цього гравця
                  </button>
                </div>

                <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 flex-1 flex flex-col gap-3">
                  <div>
                    <label className="text-xs text-purple-400 font-bold mb-1 block">
                      Встановити кристали:
                    </label>
                    <input
                      type="number"
                      value={adminAddCrystalsAmount}
                      onChange={(e) => setAdminAddCrystalsAmount(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white outline-none focus:border-purple-500"
                    />
                  </div>
                  <button
                    onClick={setExactCrystalsToUser}
                    className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-2 rounded-lg w-full transition-colors flex-1 min-h-[40px] whitespace-nowrap"
                  >
                    Встановити
                  </button>
                </div>

              </div>

              {/* Рядок зі Статистикою гравця (на всю ширину) */}
              <div className="bg-neutral-950 p-6 rounded-xl border border-purple-900/40 shadow-inner mb-6 w-full">
                <h4 className="font-bold text-purple-300 text-lg mb-6 flex items-center gap-2">
                  <span>📊</span> Статистика Гравця
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
                  {[
                    { key: 'packsOpened', label: 'Відкрито паків', current: viewingUser.packsOpened },
                    { key: 'coinsSpentOnPacks', label: 'Витрачено на паки', current: viewingUser.coinsSpentOnPacks },
                    { key: 'coinsEarnedFromPacks', label: 'Зароблено з паків', current: viewingUser.coinsEarnedFromPacks },
                  ].map(({ key, label, current }) => (
                    <div key={key} className="bg-neutral-900/50 p-3 rounded-lg border border-neutral-800 flex flex-col justify-between">
                      <div className="mb-2">
                        <label className="text-xs text-neutral-300 font-bold block mb-1">{label}</label>
                        <span className="text-[10px] text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded-full inline-block">Поточне: {current}</span>
                      </div>
                      <input
                        type="number"
                        placeholder="Нове значення..."
                        value={adminStatsForm[key] || ''}
                        onChange={(e) => setAdminStatsForm({ ...adminStatsForm, [key]: e.target.value })}
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-white outline-none focus:border-purple-500 transition-colors"
                      />
                    </div>
                  ))}
                </div>
                <button
                  onClick={savePlayerStats}
                  className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 text-lg rounded-xl transition-colors shadow-lg"
                >
                  Зберегти Статистику
                </button>
              </div>

              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  Інвентар: <span className="text-yellow-500">{viewingUser.nickname}</span> (
                  {viewingUser.coins} <Coins size={16} />)
                </h3>
                <div className="text-[11px] text-neutral-500 font-mono mb-4 mt-1 bg-neutral-900 inline-block px-2 py-1 rounded border border-neutral-800">
                  Останній IP:{' '}
                  <span className="text-red-400">{viewingUser.lastIp || 'Ще не заходив'}</span>
                </div>
              </div>

              {/* Фільтри інвентарю гравця */}
              <div className="flex flex-col sm:flex-row gap-3 mb-4 mt-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Пошук картки за назвою..."
                    value={invSearchTerm}
                    onChange={(e) => setInvSearchTerm(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-10 pr-4 py-3 text-white focus:border-purple-500 outline-none"
                  />
                </div>
                <div className="relative w-full sm:w-64">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
                  <select
                    value={invPackFilter}
                    onChange={(e) => setInvPackFilter(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-10 pr-4 py-3 text-white focus:border-purple-500 outline-none appearance-none"
                  >
                    <option value="all">Усі паки</option>
                    {packsCatalog.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {loadingUserInv ? (
                <div className="py-10 text-center text-neutral-500">
                  <Loader2 className="animate-spin mx-auto w-8 h-8" />
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3 mt-2">
                  {userInventory
                    .filter((invItem) => {
                      const c = cardsCatalog.find((cat) => cat.id === invItem.id);
                      if (!c) return false;
                      const matchesSearch = invSearchTerm
                        ? c.name.toLowerCase().includes(invSearchTerm.toLowerCase())
                        : true;
                      const matchesPack = invPackFilter === 'all' || c.packId === invPackFilter;
                      return matchesSearch && matchesPack;
                    })
                    .map((invItem) => {
                      const c = cardsCatalog.find((cat) => cat.id === invItem.id);
                      if (!c) return null;
                      const style = getCardStyle(c.rarity, rarities);
                      const effectClass = c.effect ? `effect-${c.effect}` : '';
                      const isGif = c.image && c.image.toLowerCase().endsWith('.gif');

                      return (
                        <div
                          key={invItem.id}
                          className={`bg-neutral-950 rounded-xl border-2 ${style.border} overflow-hidden flex flex-col items-center p-1 relative group ${effectClass} cursor-pointer transition-transform hover:-translate-y-1`}
                          onClick={() => setViewingCard({ card: c, amount: invItem.amount })}
                        >
                          <CardFrame frame={c.frame} effect={c.effect} className="rounded-lg overflow-hidden isolate z-0">
                            {isGif ? (
                              <canvas
                                className="w-full aspect-[2/3] object-cover rounded-lg mb-2 group-hover:opacity-40 transition-opacity"
                                ref={(canvas) => {
                                  if (!canvas || canvas.dataset.drawn) return;
                                  canvas.dataset.drawn = 'true';
                                  const img = new Image();
                                  img.onload = () => {
                                    setTimeout(() => {
                                      canvas.width = img.naturalWidth;
                                      canvas.height = img.naturalHeight;
                                      const ctx = canvas.getContext('2d');
                                      ctx.drawImage(img, 0, 0);
                                    }, 150);
                                  };
                                  img.src = c.image;
                                }}
                              />
                            ) : (
                              <img
                                src={c.image}
                                alt={c.name}
                                className="w-full aspect-[2/3] object-cover rounded-lg mb-2 group-hover:opacity-40 transition-opacity"
                                loading="lazy"
                              />
                            )}
                          </CardFrame>
                          <div className="text-[10px] font-bold text-white truncate w-full text-center mt-1">
                            {c.name}
                          </div>
                          <div className="flex items-center justify-center gap-1.5 mb-1 z-10">
                            <span className="text-xs font-black text-yellow-500">x{invItem.amount}</span>
                            {c.isGame && (() => {
                              const gs = typeof invItem.gameStats === 'string' ? JSON.parse(invItem.gameStats || '[]') : (invItem.gameStats || []);
                              const maxLvl = gs.length > 0 ? Math.max(...gs.map(s => s.level || 1)) : null;
                              return maxLvl ? <span className="text-[9px] font-black text-purple-300 bg-purple-900/50 px-1 rounded">Рів.{maxLvl}</span> : null;
                            })()}
                          </div>

                          {/* Admin Action Overlay */}
                          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20 pointer-events-none">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeCardFromUser(invItem.id, invItem.amount, c.isGame, invItem.gameStats, c);
                              }}
                              className="bg-red-600 hover:bg-red-500 text-white p-2 rounded-xl font-bold font-mono text-xs shadow-[0_0_15px_rgba(220,38,38,0.8)] transform hover:scale-110 transition-transform pointer-events-auto"
                              title="Управління (Ігрова) / Вилучити"
                            >
                              Управління
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  {userInventory.length === 0 && (
                    <p className="col-span-full text-neutral-500">Інвентар порожній.</p>
                  )}
                </div>
              )}

              {/* ===== СМАРАГДИ ГРАВЦЯ ===== */}
              {viewingUser && emeraldTypes.length > 0 && (
                <div className="mt-6 p-4 border border-emerald-900/30 bg-emerald-950/10 rounded-2xl">
                  <h4 className="text-emerald-400 font-bold text-sm mb-3 flex items-center gap-2">
                    <Gem size={16} className="text-emerald-400" /> Смарагди гравця
                    <span className="text-xs text-neutral-500 font-normal ml-1">— редагуй кількість кожного типу</span>
                  </h4>
                  <div className="flex flex-wrap gap-3">
                    {emeraldTypes.map(et => {
                      const emeraldInv = typeof viewingUser.emeraldInventory === 'object'
                        ? viewingUser.emeraldInventory
                        : (viewingUser.emeraldInventory ? JSON.parse(viewingUser.emeraldInventory) : {});
                      const count = emeraldInv[String(et.id)] || 0;
                      const setCount = async (newCount) => {
                        const nc = Math.max(0, newCount);
                        const newInv = {
                          ...(typeof viewingUser.emeraldInventory === 'object'
                            ? viewingUser.emeraldInventory
                            : JSON.parse(viewingUser.emeraldInventory || '{}')),
                          [String(et.id)]: nc,
                        };
                        if (nc === 0) delete newInv[String(et.id)];
                        try {
                          await adminUserActionRequest(getToken(), 'setEmeraldInventory', viewingUser.uid, {
                            emeraldInventory: newInv,
                          });
                          setViewingUser(prev => ({ ...prev, emeraldInventory: newInv }));
                          // also update allUsers
                          loadUsers();
                        } catch { showToast('Помилка оновлення смарагдів.', 'error'); }
                      };
                      return (
                        <div key={et.id} className="flex items-center gap-2 bg-neutral-900 border border-neutral-700 px-3 py-2 rounded-xl">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: et.color }} />
                          <span className="text-sm text-white font-bold">{et.name}</span>
                          <span className="text-xs text-neutral-500">+{et.perkBoostPercent}%</span>
                          <div className="flex items-center gap-1 ml-2">
                            <button
                              onClick={() => setCount(count - 1)}
                              disabled={count <= 0}
                              className="w-6 h-6 rounded-lg bg-neutral-800 hover:bg-red-900/50 text-neutral-300 font-black text-sm flex items-center justify-center disabled:opacity-30 transition-colors"
                            >−</button>
                            <input
                              type="number" min="0"
                              value={count}
                              onChange={e => setCount(Number(e.target.value))}
                              className="w-10 text-center bg-neutral-950 border border-neutral-700 rounded-lg text-yellow-400 font-black text-sm py-0.5 outline-none focus:border-emerald-500"
                            />
                            <button
                              onClick={() => setCount(count + 1)}
                              className="w-6 h-6 rounded-lg bg-neutral-800 hover:bg-emerald-900/50 text-emerald-400 font-black text-sm flex items-center justify-center transition-colors"
                            >+</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Пошук гравця за нікнеймом..."
                  value={adminUserSearchTerm}
                  onChange={(e) => setAdminUserSearchTerm(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl pl-10 pr-4 py-3 text-white focus:border-purple-500 outline-none"
                />
              </div>

              <div className="space-y-2">
                {filteredAdminUsers.map((u, i) => {
                  const canBan =
                    u.uid !== currentProfile.uid &&
                    !u.isSuperAdmin &&
                    (!u.isAdmin || currentProfile.isSuperAdmin);
                  const canToggleAdmin =
                    currentProfile.isSuperAdmin && u.uid !== currentProfile.uid && !u.isSuperAdmin;
                  const isUserPremium =
                    u.isPremium && u.premiumUntil && new Date(u.premiumUntil) > new Date();

                  return (
                    <div
                      key={i}
                      className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-3 px-4 border border-neutral-800 bg-neutral-950 rounded-xl gap-4"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <PlayerAvatar
                          profile={u}
                          className="w-10 h-10 rounded-full shrink-0"
                          iconSize={18}
                        />
                        <div className="min-w-0">
                          <div
                            className="font-bold text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-2 truncate cursor-pointer transition-colors"
                            onClick={() => {
                              setViewingPlayerProfile(u.nickname);
                              setCurrentView('publicProfile');
                            }}
                          >
                            {u.nickname}
                            {isUserPremium && (
                              <Gem
                                size={14}
                                className="text-fuchsia-400 fill-fuchsia-400 shrink-0"
                                title="Преміум"
                              />
                            )}
                            {u.isBanned && (
                              <span
                                className="text-[10px] bg-red-900/50 text-red-400 px-2 py-0.5 rounded border border-red-800 uppercase font-black tracking-widest shrink-0 ml-1"
                                title={
                                  u.banUntil
                                    ? `Забанено до: ${new Date(u.banUntil).toLocaleString()}`
                                    : 'Бан назавжди'
                                }
                              >
                                Бан{' '}
                                {u.banUntil
                                  ? `до ${new Date(u.banUntil).toLocaleDateString()}`
                                  : 'навсіди'}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-neutral-500 truncate">
                            {u.email || 'Приховано (Google)'}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <div className="hidden sm:block text-right mr-2">
                          <div className="text-[10px] text-neutral-500 uppercase font-bold">
                            Монети / Карти
                          </div>
                          <div className="text-sm font-bold text-yellow-500">
                            {u.coins} <Coins size={12} className="inline text-yellow-600" /> /{' '}
                            <span className="text-blue-400">{u.uniqueCardsCount || 0}</span>
                          </div>
                        </div>

                        {currentProfile.isSuperAdmin && (
                          <button
                            onClick={() => {
                              setPremiumModalUser(u);
                              setPremiumGiveDays(premiumDurationDays);
                            }}
                            className={`p-2 rounded-lg transition-colors ${isUserPremium ? 'bg-fuchsia-600 text-white' : 'bg-fuchsia-900/40 text-fuchsia-400 hover:bg-fuchsia-900'}`}
                            title="Управління Преміумом"
                          >
                            <Gem size={18} />
                          </button>
                        )}

                        {canToggleAdmin && (
                          <button
                            onClick={() => toggleAdminStatus(u)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors border ${u.isAdmin ? 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:bg-neutral-700' : 'bg-purple-900/40 text-purple-400 border-purple-800 hover:bg-purple-900/60'}`}
                          >
                            {u.isAdmin ? '- Адмінку' : '+ Адмінку'}
                          </button>
                        )}

                        {/* КНОПКА СКИНУТИ КД (У СПИСКУ ГРАВЦІВ) */}
                        <button
                          onClick={() => resetPlayerCooldown(u.uid, u.nickname)}
                          className="p-2 bg-yellow-900/40 text-yellow-400 hover:bg-yellow-900 rounded-lg transition-colors"
                          title="Скинути таймер арени"
                        >
                          <Zap size={18} />
                        </button>

                        <button
                          onClick={() => handleInspectUser(u.uid)}
                          className="p-2 bg-blue-900/40 text-blue-400 hover:bg-blue-900 rounded-lg transition-colors"
                          title="Управління гравцем (Інвентар)"
                        >
                          <Eye size={18} />
                        </button>

                        {canBan && (
                          <>
                            {u.isBanned ? (
                              <button
                                onClick={() => handleUnban(u.uid)}
                                className="p-2 bg-green-900/40 text-green-400 hover:bg-green-900 rounded-lg transition-colors"
                                title="Розбанити"
                              >
                                <CheckCircle2 size={18} />
                              </button>
                            ) : (
                              <button
                                onClick={() => setBanModalUser(u)}
                                className="p-2 bg-orange-900/40 text-orange-400 hover:bg-orange-900 rounded-lg transition-colors"
                                title="Заблокувати (Бан)"
                              >
                                <Ban size={18} />
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="p-2 bg-red-900/40 text-red-500 hover:bg-red-900 rounded-lg transition-colors ml-1"
                              title="Видалити акаунт назавжди"
                            >
                              <Trash2 size={18} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                {filteredAdminUsers.length === 0 && (
                  <div className="text-center py-8 text-neutral-500">
                    Гравців за запитом не знайдено.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- Вкладка: НАЛАШТУВАННЯ (Щоденні нагороди) --- */}
      {activeTab === 'settings' && currentProfile.isAdmin && (
        <div className="space-y-6 animate-in fade-in">
          <form
            onSubmit={saveSettings}
            className="bg-neutral-900 border border-purple-900/50 p-6 rounded-2xl"
          >
            <h3 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
              <Settings className="text-blue-500" /> Глобальні Налаштування
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800">
                <label className="text-xs font-bold text-neutral-400 uppercase mb-2 block">
                  Ціна Преміум-Акаунту (Монети):
                </label>
                <div className="relative">
                  <Coins className="absolute left-3 top-1/2 -translate-y-1/2 text-yellow-500 w-5 h-5" />
                  <input
                    type="number"
                    min="0"
                    value={priceForm}
                    onChange={(e) => setPriceForm(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg pl-10 pr-4 py-3 text-white focus:border-purple-500 outline-none font-bold"
                  />
                </div>
              </div>
              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800">
                <label className="text-xs font-bold text-neutral-400 uppercase mb-2 block">
                  Термін Преміум-Акаунту (Дні):
                </label>
                <div className="relative">
                  <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500 w-5 h-5" />
                  <input
                    type="number"
                    min="1"
                    value={durationDaysForm}
                    onChange={(e) => setDurationDaysForm(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg pl-10 pr-4 py-3 text-white focus:border-blue-500 outline-none font-bold"
                  />
                </div>
              </div>

              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 sm:col-span-2">
                <label className="text-xs font-bold text-neutral-400 uppercase mb-2 block">
                  Вартість Входу "Слівце" (Монети, 0 = Безкоштовно):
                </label>
                <div className="relative">
                  <Coins className="absolute left-3 top-1/2 -translate-y-1/2 text-yellow-500 w-5 h-5" />
                  <input
                    type="number"
                    min="0"
                    value={wordleCostForm}
                    onChange={(e) => setWordleCostForm(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg pl-10 pr-4 py-3 text-white focus:border-green-500 outline-none font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h4 className="text-sm font-bold text-orange-400 mb-2 flex items-center gap-2">
                <Gift size={16} /> Щоденні Нагороди (Звичайні)
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                {rewardsForm.map((val, idx) => (
                  <div
                    key={`norm-${idx}`}
                    className="bg-neutral-950 p-2 rounded-xl border border-neutral-800"
                  >
                    <label className="text-[10px] font-bold text-neutral-500 uppercase block mb-1">
                      День {idx + 1}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={val}
                      onChange={(e) => {
                        const newArr = [...rewardsForm];
                        newArr[idx] = Number(e.target.value);
                        setRewardsForm(newArr);
                      }}
                      className="w-full bg-transparent text-white font-bold outline-none text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <h4 className="text-sm font-bold text-fuchsia-400 mb-2 flex items-center gap-2">
                <Gem size={16} /> Щоденні Нагороди (Преміум)
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                {premiumRewardsForm.map((val, idx) => (
                  <div
                    key={`prem-${idx}`}
                    className="bg-neutral-950 p-2 rounded-xl border border-fuchsia-900/50"
                  >
                    <label className="text-[10px] font-bold text-fuchsia-500 uppercase block mb-1">
                      День {idx + 1}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={val}
                      onChange={(e) => {
                        const newArr = [...premiumRewardsForm];
                        newArr[idx] = Number(e.target.value);
                        setPremiumRewardsForm(newArr);
                      }}
                      className="w-full bg-transparent text-white font-bold outline-none text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl shadow-lg transition-colors"
            >
              Зберегти Налаштування
            </button>
          </form>
        </div>
      )}
      {/* --- Вкладка: БОСИ --- */}
      {activeTab === 'bosses' && currentProfile.isAdmin && (
        <div className="space-y-6 animate-in fade-in">
          <h2 className="text-2xl font-black text-white uppercase tracking-widest flex items-center gap-2 mb-6">
            <Swords className="text-red-500" /> Налаштування Босів
          </h2>

          {/* Форма створення Боса */}
          <form
            onSubmit={handleAddBoss}
            className="bg-neutral-900 border border-red-900/50 p-6 rounded-2xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4"
          >
            <div>
              <label className="block text-xs text-neutral-500 uppercase font-bold mb-1">
                Рівень Боса
              </label>
              <input
                type="number"
                required
                value={newBoss.level}
                onChange={(e) => setNewBoss({ ...newBoss, level: e.target.value })}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 uppercase font-bold mb-1">
                Картка (Обмеження: Звичайна-Рідкісна)
              </label>
              <select
                required
                value={newBoss.cardId}
                onChange={(e) => setNewBoss({ ...newBoss, cardId: e.target.value })}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500"
              >
                <option value="" disabled>
                  Оберіть картку...
                </option>
                {cardsCatalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-500 uppercase font-bold mb-1">
                Здоров'я (Max HP)
              </label>
              <input
                type="number"
                required
                value={newBoss.maxHp}
                onChange={(e) => setNewBoss({ ...newBoss, maxHp: e.target.value })}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 uppercase font-bold mb-1">
                Урон від 1 кліку гравця
              </label>
              <input
                type="number"
                required
                value={newBoss.damagePerClick}
                onChange={(e) => setNewBoss({ ...newBoss, damagePerClick: e.target.value })}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500"
                title="Скільки ХП знімає один тап (наприклад, 10)"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 uppercase font-bold mb-1">
                Монет за 1 клік
              </label>
              <input
                type="number"
                required
                value={newBoss.rewardPerClick}
                onChange={(e) => setNewBoss({ ...newBoss, rewardPerClick: e.target.value })}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 uppercase font-bold mb-1">
                Бонус за вбивство
              </label>
              <input
                type="number"
                required
                value={newBoss.killBonus}
                onChange={(e) => setNewBoss({ ...newBoss, killBonus: e.target.value })}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 uppercase font-bold mb-1">
                Кулдаун (Годин)
              </label>
              <input
                type="number"
                required
                step="0.5"
                value={newBoss.cooldownHours}
                onChange={(e) => setNewBoss({ ...newBoss, cooldownHours: e.target.value })}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="sm:col-span-2 md:col-span-3 flex items-end gap-2">
              <button
                type="submit"
                disabled={isSyncing}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-6 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSyncing ? <Loader2 size={20} className="animate-spin" /> : <Swords size={20} />}
                {newBoss.id ? 'Зберегти зміни' : 'Додати Боса'}
              </button>
              {newBoss.id && (
                <button
                  type="button"
                  onClick={resetBossForm}
                  className="bg-neutral-800 hover:bg-neutral-700 text-white font-bold py-3 px-6 rounded-xl transition-colors"
                >
                  Скасувати
                </button>
              )}
            </div>
          </form>

          {/* Список існуючих Босів */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-8">
            {[...(bosses || [])]
              .sort((a, b) => a.level - b.level)
              .map((boss) => {
                const bCard = cardsCatalog.find((c) => c.id === boss.cardId);
                return (
                  <div
                    key={boss.id}
                    className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex gap-4 relative overflow-hidden group"
                  >
                    <div className="w-20 aspect-[2/3] rounded-lg border border-neutral-700 overflow-hidden flex-shrink-0 relative">
                      {bCard && (
                        <img
                          src={bCard.image}
                          alt="boss"
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      )}
                      <div className="absolute top-0 left-0 w-full bg-black/80 text-center text-[10px] font-black text-red-500 py-0.5">
                        LVL {boss.level}
                      </div>
                    </div>
                    <div className="flex-1">
                      <h4 className="text-white font-black text-lg">{bCard?.name || 'Невідомо'}</h4>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-2 text-xs text-neutral-400">
                        <div>
                          HP: <span className="text-white">{boss.maxHp}</span>
                        </div>
                        <div>
                          Урон: <span className="text-red-400">-{boss.damagePerClick}</span>
                        </div>
                        <div>
                          За тап: <span className="text-yellow-500">+{boss.rewardPerClick} 🪙</span>
                        </div>
                        <div>
                          Бонус: <span className="text-yellow-500">+{boss.killBonus} 🪙</span>
                        </div>
                        <div className="col-span-2">
                          Кулдаун: <span className="text-blue-400">{boss.cooldownHours} год.</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setNewBoss(boss);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="absolute top-3 right-10 text-neutral-500 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDeleteBoss(boss.id)}
                      className="absolute top-3 right-3 text-neutral-500 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      )}
      {/* --- Вкладка: ТОВАРИ ПРЕМІУМ МАГАЗИНУ --- */}
      {activeTab === 'premiumShop' && currentProfile.isAdmin && (
        <div className="space-y-6 animate-in fade-in">
          <form
            onSubmit={addPremiumShopItem}
            className="bg-neutral-900 border border-fuchsia-900/50 p-6 rounded-2xl"
          >
            <h3 className="text-xl font-bold mb-4 text-fuchsia-400 flex items-center gap-2">
              <Gem /> {editingShopItem ? 'Редагувати товар' : 'Додати товар у Прем. Магазин'}
            </h3>
            
            <div className="mb-4">
              <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">
                Тип товару:
              </label>
              <select
                value={shopItemForm.type}
                onChange={(e) => setShopItemForm({ ...shopItemForm, type: e.target.value })}
                className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white outline-none focus:border-fuchsia-500"
              >
                <option value="card">Ексклюзивна картка</option>
                <option value="banner">Банер для профілю</option>
                <option value="plate">Бейдж для рейтингу</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              {shopItemForm.type === 'card' ? (
                <div>
                  <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">
                    Оберіть картку (ексклюзив):
                  </label>
                  <select
                    value={shopItemForm.itemId}
                    onChange={(e) => setShopItemForm({ ...shopItemForm, itemId: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white outline-none focus:border-fuchsia-500"
                    required
                  >
                    <option value="" disabled>Оберіть...</option>
                    {filteredCards.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.rarity})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">
                    {shopItemForm.type === 'plate' ? 'Відео/GIF бейджа:' : 'Зображення банера:'}
                  </label>
                  <input
                    type="file"
                    accept={shopItemForm.type === 'plate' ? 'video/*,image/gif,image/*' : 'image/*'}
                    onChange={(e) => setShopItemForm({ ...shopItemForm, imageFile: e.target.files[0] })}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-neutral-400 outline-none focus:border-fuchsia-500"
                    required={!editingShopItem}
                  />
                  {editingShopItem && editingShopItem.image && !shopItemForm.imageFile && (
                    <div className="mt-2 flex items-center gap-2">
                      {shopItemForm.type === 'plate' && editingShopItem.image.match(/\.(mp4|webm|mov)$/i) ? (
                        <video src={editingShopItem.image} className="h-10 rounded border border-neutral-700" muted autoPlay loop />
                      ) : (
                        <img src={editingShopItem.image} alt="Поточне" className="h-10 rounded border border-neutral-700" />
                      )}
                      <span className="text-xs text-neutral-500">Поточне зображення (залишиться, якщо не обрати нове)</span>
                    </div>
                  )}
                </div>
              )}
              
              <div>
                <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">
                  Ціна:
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={shopItemForm.price}
                    onChange={(e) => setShopItemForm({ ...shopItemForm, price: e.target.value })}
                    className="flex-1 bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white outline-none focus:border-fuchsia-500"
                    min="1"
                    required
                  />
                  <select
                    value={shopItemForm.currency}
                    onChange={(e) => setShopItemForm({ ...shopItemForm, currency: e.target.value })}
                    className="bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-3 text-white outline-none focus:border-fuchsia-500"
                  >
                    <option value="coins">Монети</option>
                    <option value="crystals">Кристали</option>
                  </select>
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">
                  Короткий опис товару:
                </label>
                <input
                  type="text"
                  placeholder={shopItemForm.type === 'card' ? "Наприклад: Легендарна лімітована картка тільки для преміум-гравців!" : "Наприклад: Новий унікальний банер на ваш профіль!"}
                  value={shopItemForm.description}
                  onChange={(e) =>
                    setShopItemForm({ ...shopItemForm, description: e.target.value })
                  }
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white outline-none focus:border-fuchsia-500"
                  required
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                className="flex-1 bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold py-3 rounded-xl shadow-lg transition-colors"
              >
                {editingShopItem ? 'Зберегти зміни' : 'Додати товар'}
              </button>
              {editingShopItem && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingShopItem(null);
                    setShopItemForm({ type: 'card', itemId: '', price: 500, currency: 'coins', description: '', imageFile: null });
                  }}
                  className="px-6 bg-neutral-700 hover:bg-neutral-600 text-white font-bold py-3 rounded-xl shadow-lg transition-colors"
                >
                  Скасувати
                </button>
              )}
            </div>
          </form>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {premiumShopItems.map((item) => {
              const cDef = item.type === 'card' ? cardsCatalog.find((c) => c.id === item.itemId) : null;
              const isBanner = item.type === 'banner';
              const isPlate = item.type === 'plate';
              const isMedia = isBanner || isPlate;
              const isVideo = isPlate && item.image && item.image.match(/\.(mp4|webm|mov)$/i);
              return (
                <div
                  key={item.id}
                  className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 flex flex-col items-center relative group/item"
                >
                  {/* Hover overlay with edit & delete buttons */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/item:opacity-100 transition-opacity duration-200 rounded-xl z-10 flex items-center justify-center gap-3 pointer-events-none group-hover/item:pointer-events-auto">
                    <button
                      onClick={() => editPremiumShopItem(item)}
                      className="w-11 h-11 rounded-full bg-blue-600 hover:bg-blue-500 flex items-center justify-center text-white shadow-lg transition-all transform scale-75 group-hover/item:scale-100 duration-200"
                      title="Редагувати"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => deletePremiumShopItem(item.id)}
                      className="w-11 h-11 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center text-white shadow-lg transition-all transform scale-75 group-hover/item:scale-100 duration-200"
                      title="Видалити"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <div 
                    className={`bg-black/20 border border-neutral-700 rounded-lg overflow-hidden mb-2 relative mx-auto group ${isPlate ? 'w-full aspect-[5/1]' : isMedia ? 'w-full aspect-[2/1]' : 'w-20 aspect-[2/3]'}`}
                    onMouseEnter={(e) => { const v = e.currentTarget.querySelector('video'); if (v) v.play().catch(() => {}); }}
                    onMouseLeave={(e) => { const v = e.currentTarget.querySelector('video'); if (v) { v.pause(); v.currentTime = 0; } }}
                  >
                    {isVideo ? (
                      <video src={item.image} className={`absolute inset-0 w-full h-full object-cover ${isPlate ? 'object-[right_30%]' : 'object-center'}`} muted loop playsInline />
                    ) : (
                      <img
                        src={isMedia ? item.image : cDef?.image}
                        className={`absolute inset-0 w-full h-full object-cover ${isPlate ? 'object-[right_30%]' : 'object-center'}`}
                        alt=""
                        loading="lazy"
                      />
                    )}
                  </div>
                  <div className="text-[10px] text-fuchsia-400 font-bold uppercase tracking-widest mb-0.5">
                    {isPlate ? 'Бейдж' : isBanner ? 'Банер' : 'Картка'}
                  </div>
                  <div className="font-bold text-white text-xs text-center truncate w-full mb-1">
                    {isMedia ? (item.description || (isPlate ? 'Бейдж' : 'Банер')) : (cDef?.name || 'Невідомо')}
                  </div>
                  {!isMedia && item.description && (
                    <div className="text-[10px] text-neutral-500 text-center line-clamp-1 leading-tight w-full mb-1">
                      {item.description}
                    </div>
                  )}
                  <div className={`flex items-center gap-1 text-xs font-bold mt-auto pt-1 ${item.currency === 'crystals' ? 'text-fuchsia-400' : 'text-yellow-500'}`}>
                    {item.price} {item.currency === 'crystals' ? <Gem size={12} /> : <Coins size={12} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --- Вкладка: ПРОМОКОДИ --- */}
      {activeTab === 'promos' && currentProfile.isAdmin && (
        <div className="space-y-6 animate-in fade-in">
          <form
            onSubmit={savePromo}
            className="bg-neutral-900 border border-purple-900/50 p-6 rounded-2xl"
          >
            <h3 className="text-xl font-bold mb-4 text-purple-400 flex items-center gap-2">
              <Ticket /> Створити Промокод
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">
                  Код (латиницею):
                </label>
                <input
                  type="text"
                  placeholder="Наприклад: NEW_YEAR"
                  value={promoForm.code}
                  onChange={(e) =>
                    setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })
                  }
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white uppercase"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">
                  Нагорода (Монети):
                </label>
                <input
                  type="number"
                  value={promoForm.reward}
                  onChange={(e) => setPromoForm({ ...promoForm, reward: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white"
                  min="1"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">
                  Всього використань сервером (0 = Безлім):
                </label>
                <input
                  type="number"
                  value={promoForm.maxGlobalUses}
                  onChange={(e) => setPromoForm({ ...promoForm, maxGlobalUses: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white"
                  min="0"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">
                  Використань на 1 гравця (0 = Безлім):
                </label>
                <input
                  type="number"
                  value={promoForm.maxUserUses}
                  onChange={(e) => setPromoForm({ ...promoForm, maxUserUses: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white"
                  min="0"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-purple-600 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-purple-500 transition-colors"
            >
              Створити Код
            </button>
          </form>

          <div className="space-y-3">
            {allPromos.map((p) => (
              <div
                key={p.id}
                className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div>
                  <div className="text-lg font-black text-white font-mono tracking-widest">
                    {p.code}
                  </div>
                  <div className="text-sm text-yellow-500 font-bold">
                    Нагорода: {p.reward} <Coins size={14} className="inline" />
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right text-xs text-neutral-400">
                    <div>
                      Сервер:{' '}
                      <span className="text-white">
                        {p.currentGlobalUses} / {p.maxGlobalUses === 0 ? '∞' : p.maxGlobalUses}
                      </span>
                    </div>
                    <div>
                      На 1 гравця:{' '}
                      <span className="text-white">
                        {p.maxUserUses === 0 ? '∞' : p.maxUserUses}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => deletePromo(p.code)}
                    className="p-3 bg-red-900/40 text-red-400 hover:bg-red-900 rounded-lg transition-colors"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
            ))}
            {allPromos.length === 0 && (
              <p className="text-center text-neutral-500 py-6">Створених промокодів немає.</p>
            )}
          </div>
        </div>
      )}

      {/* --- Вкладка: ЛОГИ (Супер Адмін) --- */}
      {activeTab === 'logs' && currentProfile.isAdmin && (
        <div className="space-y-4 animate-in fade-in">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-red-400 flex items-center gap-2">
              <ScrollText /> Системні Логи
            </h3>
            {adminLogs.length > 0 && (
              <button
                onClick={clearAdminLogs}
                className="bg-red-900 hover:bg-red-800 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors flex items-center gap-2"
              >
                <Trash2 size={16} /> Очистити Логи
              </button>
            )}
          </div>

          {/* ОСЬ НАША НОВА КНОПКА ДЛЯ ОЧИЩЕННЯ РИНКУ */}
          <button
            onClick={clearAllMarketHistory}
            className="w-full bg-red-900/40 hover:bg-red-900 text-red-400 hover:text-white font-bold py-3 px-6 rounded-xl transition-colors border border-red-900/50 flex items-center justify-center gap-2"
          >
            <Trash2 size={18} /> Очистити всю Історію Ринку (Всі гравці)
          </button>

          {adminLogs.length === 0 ? (
            <div className="text-center py-10 bg-neutral-900 rounded-2xl border border-neutral-800">
              <Bug size={40} className="mx-auto mb-3 text-neutral-700" />
              <p className="text-neutral-500">Системних записів немає.</p>
            </div>
          ) : (
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
              {adminLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-4 border-b border-neutral-800 last:border-0 hover:bg-neutral-950 transition-colors flex flex-col sm:flex-row gap-2 sm:gap-6 sm:items-center"
                >
                  <div className="w-32 shrink-0">
                    <div className="text-xs text-neutral-500">{formatDate(log.timestamp)}</div>
                    <div
                      className={`text-xs font-bold uppercase tracking-wider mt-0.5 ${log.type === 'Помилка' ? 'text-red-500' : 'text-purple-400'}`}
                    >
                      {log.type}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="text-white text-sm break-words">{log.details}</div>
                    <div className="text-[10px] text-neutral-500 mt-1 flex items-center gap-1">
                      <User size={10} /> {log.userNickname}{' '}
                      <span className="text-neutral-700">({log.userUid})</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- Вкладка: АЧІВКИ (ДОСЯГНЕННЯ) --- */}
      {activeTab === 'achievements' && currentProfile.isAdmin && (
        <div className="space-y-6 animate-in fade-in">
          <form
            onSubmit={saveAchievement}
            className="bg-neutral-900 border border-yellow-900/50 p-6 rounded-2xl"
          >
            <h3 className="text-xl font-bold mb-4 text-yellow-500 flex items-center gap-2">
              <Trophy /> {editingAchievement ? 'Редагувати Ачівку' : 'Створити Ачівку'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">
                  Назва досягнення:
                </label>
                <input
                  type="text"
                  placeholder="Напр: Легенда Базового Паку"
                  value={achievementForm.name}
                  onChange={(e) => setAchievementForm({ ...achievementForm, name: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">
                  Короткий опис:
                </label>
                <input
                  type="text"
                  placeholder="Зібрати всі картки Базового Паку"
                  value={achievementForm.description}
                  onChange={(e) =>
                    setAchievementForm({ ...achievementForm, description: e.target.value })
                  }
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">
                  Іконка (URL або Пресет):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="https://... або пресет"
                    value={achievementForm.iconUrl}
                    onChange={(e) =>
                      setAchievementForm({ ...achievementForm, iconUrl: e.target.value })
                    }
                    className="flex-1 bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white"
                  />
                  <div className="relative group">
                    <button
                      type="button"
                      className="bg-neutral-800 p-2 rounded-xl border border-neutral-700 hover:bg-neutral-700 transition"
                    >
                      <AchievementIcon
                        iconUrl={achievementForm.iconUrl}
                        className="w-8 h-8 rounded-md"
                        size={18}
                      />
                    </button>
                    <div className="absolute top-full right-0 pt-2 z-50 hidden group-hover:block w-64">
                      <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-3 shadow-2xl flex flex-wrap gap-2">
                        {Object.keys(ACHIEVEMENT_PRESETS).map((key) => (
                          <button
                            type="button"
                            key={key}
                            onClick={() => setAchievementForm({ ...achievementForm, iconUrl: key })}
                            className={`p-1.5 rounded-lg transition-colors ${achievementForm.iconUrl === key ? 'bg-yellow-900/50' : 'hover:bg-neutral-800'}`}
                            title={key}
                          >
                            <AchievementIcon
                              iconUrl={key}
                              className="w-8 h-8 rounded-md"
                              size={18}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">
                  Пак для ачівки:
                </label>
                <select
                  value={achievementForm.packId}
                  onChange={(e) =>
                    setAchievementForm({ ...achievementForm, packId: e.target.value })
                  }
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white"
                  required
                >
                  <option value="" disabled>
                    Оберіть пак...
                  </option>
                  {packsCatalog.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                className="flex-1 bg-yellow-600 text-yellow-950 font-bold py-3 rounded-xl shadow-lg hover:bg-yellow-500 transition-colors"
              >
                Зберегти Ачівку
              </button>
              {editingAchievement && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingAchievement(null);
                    setAchievementForm({
                      id: '',
                      packId: packsCatalog[0]?.id || '',
                      name: '',
                      description: '',
                      iconUrl: '',
                    });
                  }}
                  className="bg-neutral-800 text-white font-bold py-3 px-6 rounded-xl text-center"
                >
                  Скасувати
                </button>
              )}
            </div>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allAchievements.map((a) => {
              const pack = packsCatalog.find((p) => p.id === a.packId);
              return (
                <div
                  key={a.id}
                  className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex gap-4 relative"
                >
                  <div className="absolute top-2 right-2 flex gap-2">
                    <button
                      onClick={() => {
                        setEditingAchievement(a);
                        setAchievementForm(a);
                      }}
                      className="text-blue-500 hover:bg-blue-900/30 p-1.5 rounded-lg transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => deleteAchievement(a.id)}
                      className="text-red-500 hover:bg-red-900/30 p-1.5 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <AchievementIcon
                    iconUrl={a.iconUrl}
                    className="w-16 h-16 rounded-lg shrink-0"
                    size={32}
                  />
                  <div className="flex-1 pr-16">
                    <div className="text-[10px] text-yellow-500 font-bold uppercase tracking-widest mb-1">
                      {pack ? pack.name : 'Невідомий пак'}
                    </div>
                    <div className="font-bold text-white mb-1">{a.name}</div>
                    <div className="text-xs text-neutral-400 line-clamp-2">{a.description}</div>
                  </div>
                </div>
              );
            })}
            {allAchievements.length === 0 && (
              <p className="col-span-full text-center text-neutral-500 py-6">
                Створених досягнень немає.
              </p>
            )}
          </div>
        </div>
      )}

      {/* --- Вкладка: ПАКИ --- */}
      {activeTab === 'packs' && (
        <div className="space-y-6 animate-in fade-in">
          <form
            onSubmit={savePack}
            className="bg-neutral-900 border border-purple-900/50 p-6 rounded-2xl"
          >
            <h3 className="text-xl font-bold mb-4 text-purple-400">
              {editingPack ? `Редагування Паку` : 'Створити Пак'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-4">
              <input
                type="text"
                placeholder="Назва Паку"
                value={packForm.name}
                onChange={(e) => setPackForm({ ...packForm, name: e.target.value })}
                className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white"
                required
              />
              <div className="relative">
                <input
                  type="text"
                  placeholder="Категорія (напр. Базові)"
                  value={packForm.category}
                  onChange={(e) => setPackForm({ ...packForm, category: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white"
                  required
                />
                {packsCatalog && packsCatalog.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[...new Set(packsCatalog.map((p) => p.category).filter(Boolean))].map(
                      (cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setPackForm({ ...packForm, category: cat })}
                          className="text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-2.5 py-1.5 rounded-lg transition-colors border border-neutral-700"
                        >
                          {cat}
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Вартість (Монети)"
                  value={packForm.cost}
                  onChange={(e) => setPackForm({ ...packForm, cost: e.target.value })}
                  className="w-1/2 bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white"
                  min="0"
                  required
                />
                <input
                  type="number"
                  placeholder="Ціна в Кристалах"
                  value={packForm.premiumCost || ''}
                  onChange={(e) => setPackForm({ ...packForm, premiumCost: e.target.value })}
                  className="w-1/2 bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-fuchsia-500"
                  min="0"
                />
              </div>
              <div className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-2 flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="URL Картинки (або файл)"
                  value={packForm.image}
                  onChange={(e) => setPackForm({ ...packForm, image: e.target.value })}
                  className="bg-transparent text-white outline-none w-full text-sm"
                  required={!packImageFile && !packForm.image}
                />
                <div className="h-px bg-neutral-800 w-full" />
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPackImageFile(e.target.files[0])}
                  className="text-xs text-neutral-400 file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-purple-900 file:text-purple-300 hover:file:bg-purple-800"
                />
              </div>

              <div className="col-span-1 sm:col-span-2 lg:col-span-3 xl:col-span-4 mt-4 p-5 border border-neutral-800 rounded-2xl bg-neutral-950/40 shadow-inner">
                <h4 className="text-neutral-300 text-sm font-bold mb-4 flex items-center gap-2">
                  <span>🎯</span> Кастомні шанси випадіння
                  <span className="text-neutral-500 font-normal text-xs ml-2">(залиште пустим для глобальних)</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  {rarities.map((r) => (
                    <div key={r.name} className="flex flex-col bg-neutral-900/50 p-3 rounded-xl border border-neutral-800/80">
                      <div className="flex justify-between items-center mb-2">
                        <label className={`text-xs font-bold text-neutral-300`}>{r.name}</label>
                        <span className="text-[10px] text-neutral-500 font-medium px-2 py-0.5 bg-neutral-800 rounded-full">
                          Глоб: {r.weight}
                        </span>
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Замовчування"
                        value={packForm.customWeights?.[r.name] || ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(',', '.');
                          setPackForm({
                            ...packForm,
                            customWeights: {
                              ...(packForm.customWeights || {}),
                              [r.name]: val,
                            },
                          })
                        }
                        }
                        className="bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-purple-500 outline-none transition-colors w-full"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {packForm.isGame && (
                <div className="col-span-1 sm:col-span-2 lg:col-span-3 xl:col-span-4 mt-4 p-5 border border-indigo-900/30 rounded-2xl bg-indigo-950/10 shadow-inner">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <h4 className="text-indigo-300 text-sm font-bold flex items-center gap-2">
                      <Zap size={16} className="text-yellow-500" />
                      Діапазони Характеристик (Сила / HP)
                      <span className="text-indigo-500/70 font-normal text-xs">(залиште пустими для стандартних)</span>
                    </h4>
                    <button
                      type="button"
                      onClick={applyPackAutoBalance}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-700/30 hover:bg-indigo-700/60 text-indigo-300 text-xs font-bold border border-indigo-600/40 transition-colors"
                    >
                      ⚖️ Авто-баланс
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {rarities.map((r) => (
                      <div key={`stats-${r.name}`} className="flex flex-col gap-3 p-3.5 bg-neutral-900/80 border border-neutral-700/50 rounded-xl relative overflow-hidden group hover:border-indigo-500/50 transition-colors">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <label className="text-sm font-bold text-center text-indigo-300 mb-1">{r.name}</label>

                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider pl-1">⚔️ Сила</span>
                            <input
                              type="number"
                              placeholder="Авто"
                              value={packForm.statsRanges?.[r.name]?.maxPower || ''}
                              onChange={(e) => {
                                updatePackStatsRange(r.name, 'maxPower', e.target.value);
                                updatePackStatsRange(r.name, 'minPower', e.target.value);
                              }}
                              className="bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-2 text-white text-sm focus:border-blue-500 outline-none w-full"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider pl-1">❤️ HP</span>
                            <input
                              type="number"
                              placeholder="Авто"
                              value={packForm.statsRanges?.[r.name]?.maxHp || ''}
                              onChange={(e) => {
                                updatePackStatsRange(r.name, 'maxHp', e.target.value);
                                updatePackStatsRange(r.name, 'minHp', e.target.value);
                              }}
                              className="bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-2 text-white text-sm focus:border-red-500 outline-none w-full"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="col-span-1 sm:col-span-2 lg:col-span-3 xl:col-span-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                <label className="flex items-center gap-3 text-sm text-neutral-300 font-medium cursor-pointer hover:bg-neutral-800/50 bg-neutral-900/50 p-3 rounded-lg border border-neutral-800 transition-colors">
                  <input
                    type="checkbox"
                    checked={packForm.isHidden || false}
                    onChange={(e) => setPackForm({ ...packForm, isHidden: e.target.checked })}
                    className="w-4 h-4 accent-purple-500 rounded"
                  />
                  Приховати пак (без видалення)
                </label>
                <label className="flex items-center gap-3 text-sm text-fuchsia-300 font-medium cursor-pointer hover:bg-fuchsia-900/20 bg-fuchsia-950/10 p-3 rounded-lg border border-fuchsia-900/30 transition-colors">
                  <input
                    type="checkbox"
                    checked={packForm.isPremiumOnly || false}
                    onChange={(e) => setPackForm({ ...packForm, isPremiumOnly: e.target.checked })}
                    className="w-4 h-4 accent-fuchsia-500 rounded"
                  />
                  <div className="flex items-center gap-1.5"><Gem size={16} /> Тільки Преміум</div>
                </label>
                <label className="flex items-center gap-3 text-sm text-green-300 font-medium cursor-pointer hover:bg-green-900/20 bg-green-950/10 p-3 rounded-lg border border-green-900/30 transition-colors">
                  <input
                    type="checkbox"
                    checked={packForm.isGame || false}
                    onChange={(e) => handlePackIsGameChange(e.target.checked)}
                    className="w-4 h-4 accent-green-500 rounded"
                  />
                  Ігровий Пак (Сили)
                  {packAutoBalanceApplied && <span className="text-[10px] text-green-400 font-bold ml-auto">⚖️ авто</span>}
                </label>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="flex-1 bg-purple-600 text-white font-bold py-3 rounded-xl"
              >
                Зберегти Пак
              </button>
              {editingPack && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingPack(null);
                    setPackImageFile(null);
                    setPackForm({
                      id: '',
                      name: '',
                      category: 'Базові',
                      cost: 50,
                      image: '',
                      customWeights: {},
                      isHidden: false,
                      isPremiumOnly: false,
                      isGame: false,
                    });
                  }}
                  className="bg-neutral-800 text-white font-bold py-3 px-6 rounded-xl"
                >
                  Скасувати
                </button>
              )}
            </div>
          </form>

          {/* Фільтр та список Паків */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
            <input
              type="text"
              placeholder="Пошук паку..."
              value={packSearchTerm}
              onChange={(e) => setPackSearchTerm(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-10 pr-4 py-3 text-white focus:border-purple-500 outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredPacks.map((pack) => (
              <div
                key={pack.id}
                className={`bg-neutral-900 rounded-xl p-4 border ${pack.isPremiumOnly ? 'border-fuchsia-900' : 'border-neutral-800'} relative group`}
              >
                {pack.isHidden && (
                  <span className="text-[10px] bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded border border-neutral-600 uppercase font-black tracking-widest absolute top-2 right-2 z-10">
                    Приховано
                  </span>
                )}
                {pack.isPremiumOnly && (
                  <span className="text-[10px] bg-fuchsia-900 text-fuchsia-100 px-2 py-0.5 rounded border border-fuchsia-500 uppercase font-black tracking-widest absolute top-2 left-2 z-10 flex items-center gap-1">
                    <Gem size={10} /> Преміум
                  </span>
                )}
                <img
                  src={pack.image}
                  alt={pack.name}
                  className={`w-24 h-24 object-cover rounded-lg mx-auto mb-3 ${pack.isHidden ? 'opacity-50 grayscale' : ''}`}
                  loading="lazy"
                />
                <div
                  className={`text-[10px] ${pack.isPremiumOnly ? 'text-fuchsia-400' : 'text-purple-400'} font-bold uppercase tracking-widest text-center mb-1`}
                >
                  {pack.category || 'Базові'}
                </div>
                <h4 className="text-center font-bold text-white mb-1">{pack.name}</h4>
                <div className="text-center text-yellow-500 font-bold text-sm mb-1">
                  {pack.cost} Монет
                </div>

                {/* Економічна статистика паку */}
                {(() => {
                  const ev = calculatePackEV(pack);
                  const roi = pack.cost > 0 ? (ev / pack.cost) * 100 : 0;
                  const isRisky = roi >= 100;
                  return (
                    <div className={`mb-4 px-2 py-1.5 rounded-lg border text-[10px] flex flex-col items-center gap-0.5 ${
                      isRisky 
                        ? 'bg-red-500/10 border-red-500/30 text-red-400' 
                        : 'bg-green-500/10 border-green-500/30 text-green-400'
                    }`}>
                      <div className="font-bold flex items-center gap-1 uppercase tracking-tighter">
                        {isRisky ? '⚠️ Збитковий' : '✅ Стабільний'}
                      </div>
                      <div className="flex gap-2 font-mono">
                        <span>EV: {ev.toFixed(0)}🪙</span>
                        <span className="opacity-50">|</span>
                        <span>ROI: {roi.toFixed(1)}%</span>
                      </div>
                    </div>
                  );
                })()}                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingPack(pack);
                      setPackForm({
                        ...pack,
                        customWeights: pack.customWeights || {},
                        category: pack.category || 'Базові',
                      });
                    }}
                    className="flex-1 py-2 bg-blue-600/20 text-blue-400 rounded-lg text-sm font-bold"
                  >
                    Редагувати
                  </button>
                  <button
                    onClick={() => deletePack(pack.id)}
                    className="flex-1 py-2 bg-red-600/20 text-red-400 rounded-lg text-sm font-bold"
                  >
                    Видалити
                  </button>
                </div>
              </div>
            ))}
            {filteredPacks.length === 0 && (
              <p className="col-span-full text-center text-neutral-500">Паків не знайдено.</p>
            )}
          </div>
        </div>
      )}

      {/* --- Вкладка: КАРТКИ --- */}
      {activeTab === 'cards' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="flex flex-col xl:flex-row gap-6">
            <form
              onSubmit={saveCard}
              className="flex-1 bg-neutral-900 border border-purple-900/50 p-6 rounded-2xl"
            >
            <h3 className="text-xl font-bold mb-6 text-purple-400 border-b border-purple-900/30 pb-2">
              {editingCard ? `Редагування Картки` : 'Додати Картку'}
            </h3>

            {/* --- СЕКЦІЯ 1: ОСНОВНЕ --- */}
            <div className="mb-8">
              <h4 className="text-xs font-black text-neutral-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="w-8 h-px bg-neutral-800"></span> Основна інформація
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase ml-1">Назва картки</label>
                  <input
                    type="text"
                    placeholder="Введіть назву..."
                    value={cardForm.name}
                    onChange={(e) => setCardForm({ ...cardForm, name: e.target.value })}
                    className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-purple-500 outline-none transition-colors"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase ml-1">Пакет (Колекція)</label>
                  <select
                    value={cardForm.packId}
                    onChange={(e) => setCardForm({ ...cardForm, packId: e.target.value })}
                    className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-purple-500 outline-none transition-colors"
                    required
                  >
                    <option value="" disabled>Оберіть пак...</option>
                    {packsCatalog.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase ml-1">Рідкість</label>
                  <select
                    value={cardForm.rarity}
                    onChange={(e) => handleRarityChange(e.target.value)}
                    className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-purple-500 outline-none transition-colors font-bold"
                  >
                    {rarities.map((r) => (
                      <option key={r.name} value={r.name}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* --- СЕКЦІЯ 2: ЕКОНОМІКА --- */}
            <div className="mb-8">
              <h4 className="text-xs font-black text-neutral-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="w-8 h-px bg-neutral-800"></span> Економіка та шанси
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase ml-1">Ліміт копій (0 = Безлім)</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={cardForm.maxSupply}
                    onChange={(e) => setCardForm({ ...cardForm, maxSupply: e.target.value })}
                    className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-purple-500 outline-none transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase ml-1">Шанс випадіння (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Авто"
                    value={cardForm.weight}
                    onChange={(e) => {
                      const val = e.target.value.replace(',', '.');
                      setCardForm({ ...cardForm, weight: val });
                    }}
                    className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-purple-500 outline-none transition-colors"
                    title="Ігнорує стандартні шанси рідкості, якщо вказано."
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase ml-1">Ціна продажу (Coins)</label>
                  <input
                    type="number"
                    placeholder="15"
                    value={cardForm.sellPrice}
                    onChange={(e) => setCardForm({ ...cardForm, sellPrice: e.target.value })}
                    className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-green-400 focus:border-green-500 outline-none transition-colors font-bold"
                  />
                </div>
              </div>
            </div>

            {/* --- СЕКЦІЯ 3: ВІЗУАЛ ТА МЕДІА --- */}
            <div className="mb-8 p-4 bg-neutral-950/30 border border-neutral-800 rounded-2xl">
              <h4 className="text-xs font-black text-neutral-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="w-8 h-px bg-neutral-800"></span> Зовнішній вигляд та медіа
              </h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase ml-1">Зображення картки</label>
                  <div className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 flex flex-col gap-2">
                    <input
                      type="text"
                      placeholder="URL зображення..."
                      value={cardForm.image}
                      onChange={(e) => setCardForm({ ...cardForm, image: e.target.value })}
                      className="bg-transparent text-white outline-none w-full text-sm"
                      required={!cardImageFile && !cardForm.image}
                    />
                    <div className="h-px bg-neutral-800 w-full" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setCardImageFile(e.target.files[0])}
                      className="text-xs text-neutral-500 file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-purple-900/50 file:text-purple-300 hover:file:bg-purple-800/50 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase ml-1">Звуковий супровід</label>
                  <div className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 flex flex-col gap-2">
                    <input
                      type="text"
                      placeholder="URL звуку (mp3)..."
                      value={cardForm.soundUrl || ''}
                      onChange={(e) => setCardForm({ ...cardForm, soundUrl: e.target.value })}
                      className="bg-transparent text-white outline-none w-full text-sm"
                    />
                    {cardForm.soundUrl && (
                      <div className="flex items-center gap-3 mt-1 pt-2 border-t border-neutral-800">
                        <span className="text-[9px] font-bold text-neutral-500 uppercase shrink-0">Гучність</span>
                        <input
                          type="range" min="0.1" max="1" step="0.1"
                          value={cardForm.soundVolume !== undefined ? cardForm.soundVolume : 0.5}
                          onChange={(e) => setCardForm({ ...cardForm, soundVolume: parseFloat(e.target.value) })}
                          className="accent-purple-500 flex-1 h-1.5"
                        />
                        <span className="text-[10px] font-mono text-purple-400 w-6 text-right">
                          {Math.round((cardForm.soundVolume || 0.5) * 100)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase ml-1">Рамка картки</label>
                  <select
                    value={cardForm.frame || 'normal'}
                    onChange={(e) => setCardForm({ ...cardForm, frame: e.target.value })}
                    className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-amber-500 focus:border-amber-500 outline-none transition-colors font-bold"
                  >
                    <option value="normal">Стандартна</option>
                    <option value="bronze">Бронзова</option>
                    <option value="silver">Срібна</option>
                    <option value="gold">Золота</option>
                    <option value="neon">Неонова</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase ml-1">Візуальний ефект</label>
                  <select
                    value={cardForm.effect}
                    onChange={(e) => setCardForm({ ...cardForm, effect: e.target.value })}
                    className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-purple-400 focus:border-purple-400 outline-none transition-colors font-bold"
                  >
                    {EFFECT_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase ml-1">Анімація випадіння</label>
                  <select
                    value={cardForm.dropAnim || ''}
                    onChange={(e) => setCardForm({ ...cardForm, dropAnim: e.target.value })}
                    className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-yellow-500 focus:border-yellow-500 outline-none transition-colors font-bold"
                  >
                    {DROP_ANIMATIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* --- СЕКЦІЯ 4: ІГРОВІ ПАРАМЕТРИ --- */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-black text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-8 h-px bg-neutral-800"></span> Ігрові параметри
                </h4>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-2 text-xs text-green-400 font-bold cursor-pointer bg-green-900/10 px-3 py-1.5 rounded-lg border border-green-900/30 hover:bg-green-900/20 transition-colors">
                    <input
                      type="checkbox"
                      checked={cardForm.isGame || false}
                      onChange={(e) => setCardForm({ ...cardForm, isGame: e.target.checked })}
                      className="w-3.5 h-3.5 accent-green-500 rounded"
                    />
                    Активувати ігрову логіку
                  </label>
                  {cardForm.isGame && (
                    <button
                      type="button"
                      onClick={handleApplyAutoBalance}
                      className="inline-flex items-center gap-1.5 text-xs text-amber-400 font-bold cursor-pointer bg-amber-900/10 px-3 py-1.5 rounded-lg border border-amber-700/40 hover:bg-amber-900/30 transition-colors"
                      title="Перерахувати баланс на основі рідкості та перку"
                    >
                      ⚖️ Авто-баланс
                    </button>
                  )}
                  {autoBalanceApplied && cardForm.isGame && (
                    <span className="text-[10px] text-amber-500/70 font-bold italic">⚖️ застосовано</span>
                  )}
                  <label className="inline-flex items-center gap-2 text-xs text-red-400 font-bold cursor-pointer bg-red-900/10 px-3 py-1.5 rounded-lg border border-red-900/30 hover:bg-red-900/20 transition-colors">
                    <input
                      type="checkbox"
                      checked={cardForm.blockGame || false}
                      onChange={(e) => setCardForm({ ...cardForm, blockGame: e.target.checked })}
                      className="w-3.5 h-3.5 accent-red-500 rounded"
                    />
                    Заблокувати ігровий статус
                  </label>
                </div>
              </div>

              <div className={`transition-all duration-300 ${cardForm.isGame ? 'opacity-100' : 'opacity-40 grayscale pointer-events-none'}`}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-blue-400 uppercase ml-1">⚔️ Сила (базова, Рів.1)</label>
                    <input
                      type="number" placeholder="Авто"
                      value={cardForm.maxPower ?? ''}
                      onChange={(e) => setCardForm({ ...cardForm, maxPower: e.target.value, minPower: e.target.value })}
                      className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-blue-400 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-red-400 uppercase ml-1">❤️ HP (базове, Рів.1)</label>
                    <input
                      type="number" placeholder="Авто"
                      value={cardForm.maxHp ?? ''}
                      onChange={(e) => setCardForm({ ...cardForm, maxHp: e.target.value, minHp: e.target.value })}
                      className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-red-400 focus:border-red-500 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-purple-950/10 border border-purple-900/20 rounded-2xl">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-purple-400 uppercase ml-1">Здібність (Перк)</label>
                    <select
                      value={cardForm.perk || ''}
                      onChange={(e) => handlePerkChange(e.target.value)}
                      className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-purple-500 outline-none"
                    >
                      <option value="">Без здібності</option>
                      <optgroup label="⚔️ Атакувальні">
                        <option value="crit">Крит (2× шкоди)</option>
                        <option value="cleave">Сплеск (по сусідах)</option>
                        <option value="poison">Отрута (3 ходи)</option>
                        <option value="lifesteal">Вампіризм (ліфстіл)</option>
                        <option value="burn">Опік (вогняна шкода)</option>
                      </optgroup>
                      <optgroup label="🛡️ Захисні">
                        <option value="dodge">Ухилення</option>
                        <option value="thorns">Шипи (повернення шкоди)</option>
                        <option value="armor">Броня (зниження шкоди)</option>
                        <option value="laststand">Виживання (1 HP)</option>
                        <option value="shield">Щит (відновлюється)</option>
                      </optgroup>
                      <optgroup label="🎯 Тактичні">
                        <option value="taunt">Провокація (таунт)</option>
                        <option value="healer">Цілитель</option>
                      </optgroup>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-purple-400 uppercase ml-1">Ефективність (%)</label>
                    <input
                      type="number" min="1" max="100"
                      placeholder={cardForm.perk === 'taunt' || cardForm.perk === 'laststand' ? 'Авто' : 'Напр: 25'}
                      disabled={!cardForm.perk || cardForm.perk === 'taunt' || cardForm.perk === 'laststand'}
                      value={cardForm.perkValue ?? ''}
                      onChange={(e) => setCardForm({ ...cardForm, perkValue: e.target.value })}
                      className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-purple-500 outline-none disabled:opacity-30"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* --- СЕКЦІЯ 5: ПРОКАЧКА (РІВНІ) --- */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-black text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-8 h-px bg-neutral-800"></span> Прокачка (Рівні 1-10)
                </h4>
              </div>

              <div className={`transition-all duration-300 p-4 bg-blue-950/10 border border-blue-900/20 rounded-2xl ${cardForm.isGame ? 'opacity-100' : 'opacity-40 grayscale pointer-events-none'}`}>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-blue-400 uppercase ml-1">Рівень розблокування перку</label>
                    <select
                      value={cardForm.bonusPerkLevel || ''}
                      onChange={(e) => setCardForm({ ...cardForm, bonusPerkLevel: e.target.value })}
                      className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none"
                    >
                      <option value="">Без додаткового перку</option>
                      {[2,3,4,5,6,7,8,9,10].map(lvl => (
                        <option key={lvl} value={lvl}>На {lvl} рівні</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-blue-400 uppercase ml-1">Додатковий перк</label>
                    <select
                      value={cardForm.bonusPerk || ''}
                      disabled={!cardForm.bonusPerkLevel}
                      onChange={(e) => setCardForm({ ...cardForm, bonusPerk: e.target.value })}
                      className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none disabled:opacity-30"
                    >
                      <option value="">Оберіть перк</option>
                      <optgroup label="⚔️ Атакувальні">
                        <option value="crit">Крит (2× шкоди)</option>
                        <option value="cleave">Сплеск (по сусідах)</option>
                        <option value="poison">Отрута (3 ходи)</option>
                        <option value="lifesteal">Вампіризм (ліфстіл)</option>
                        <option value="burn">Опік (вогняна шкода)</option>
                      </optgroup>
                      <optgroup label="🛡️ Захисні">
                        <option value="dodge">Ухилення</option>
                        <option value="thorns">Шипи (повернення шкоди)</option>
                        <option value="armor">Броня (зниження шкоди)</option>
                        <option value="laststand">Виживання (1 HP)</option>
                        <option value="shield">Щит (відновлюється)</option>
                      </optgroup>
                      <optgroup label="🎯 Тактичні">
                        <option value="taunt">Провокація (таунт)</option>
                        <option value="healer">Цілитель</option>
                      </optgroup>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-blue-400 uppercase ml-1">Ефективність перку (%)</label>
                    <input
                      type="number" min="1" max="100"
                      placeholder={cardForm.bonusPerk === 'taunt' || cardForm.bonusPerk === 'laststand' ? 'Авто' : 'Напр: 25'}
                      disabled={!cardForm.bonusPerk || cardForm.bonusPerk === 'taunt' || cardForm.bonusPerk === 'laststand'}
                      value={cardForm.bonusPerkValue ?? ''}
                      onChange={(e) => setCardForm({ ...cardForm, bonusPerkValue: e.target.value })}
                      className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none disabled:opacity-30"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => {
                    const lCfg = cardForm.levelingConfig?.[level] || { dupes: 0, cost: 0, currency: 'coins', powerAdd: 0, hpAdd: 0 };
                    return (
                      <div key={level} className="flex flex-col lg:flex-row items-center gap-2 bg-neutral-900 p-2 rounded-xl border border-neutral-800">
                        <div className="w-full lg:w-16 text-center font-bold text-blue-400">Лвл {level}</div>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 w-full">
                          <div className="flex flex-col">
                            <span className="text-[9px] text-neutral-500 uppercase px-1">Дублікатів</span>
                            <input type="number" min="0" value={lCfg.dupes} onChange={(e) => setCardForm({...cardForm, levelingConfig: {...(cardForm.levelingConfig || {}), [level]: {...lCfg, dupes: Number(e.target.value)}}})} className="bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none w-full" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] text-neutral-500 uppercase px-1">Вартість</span>
                            <input type="number" min="0" value={lCfg.cost} onChange={(e) => setCardForm({...cardForm, levelingConfig: {...(cardForm.levelingConfig || {}), [level]: {...lCfg, cost: Number(e.target.value)}}})} className="bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none w-full" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] text-neutral-500 uppercase px-1">Валюта</span>
                            <select value={lCfg.currency} onChange={(e) => setCardForm({...cardForm, levelingConfig: {...(cardForm.levelingConfig || {}), [level]: {...lCfg, currency: e.target.value}}})} className="bg-neutral-950 border border-neutral-700 rounded-lg px-1 py-1.5 text-xs text-white outline-none w-full">
                              <option value="coins">Монети</option>
                              <option value="crystals">Кристали</option>
                            </select>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] text-neutral-500 uppercase px-1">+Сила</span>
                            <input type="number" min="0" value={lCfg.powerAdd} onChange={(e) => setCardForm({...cardForm, levelingConfig: {...(cardForm.levelingConfig || {}), [level]: {...lCfg, powerAdd: Number(e.target.value)}}})} className="bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-1.5 text-xs text-green-400 outline-none w-full" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] text-neutral-500 uppercase px-1">+HP</span>
                            <input type="number" min="0" value={lCfg.hpAdd} onChange={(e) => setCardForm({...cardForm, levelingConfig: {...(cardForm.levelingConfig || {}), [level]: {...lCfg, hpAdd: Number(e.target.value)}}})} className="bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-1.5 text-xs text-red-400 outline-none w-full" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-4 pt-4 border-t border-neutral-800">
              <button
                type="submit"
                disabled={!cardForm.packId}
                className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:bg-neutral-700 text-white font-black py-4 rounded-2xl shadow-lg shadow-purple-900/20 transition-all transform active:scale-[0.98]"
              >
                {editingCard ? 'ЗБЕРЕГТИ ЗМІНИ' : 'СТВОРИТИ КАРТКУ'}
              </button>
              {editingCard && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingCard(null);
                    setCardImageFile(null);
                    setCardForm({
                      id: '',
                      packId: packsCatalog[0]?.id || '',
                      name: '',
                      rarity: rarities[0]?.name || 'Звичайна',
                      image: '',
                      dropAnim: '',
                      maxSupply: '',
                      weight: '',
                      sellPrice: '',
                      effect: '',
                      soundUrl: '',
                      soundVolume: 0.5,
                      frame: 'normal',
                      isGame: false,
                      blockGame: false,
                      minPower: '',
                      maxPower: '',
                      minHp: '',
                      maxHp: '',
                      perk: '',
                      perkValue: '',
                    });
                  }}
                  className="bg-neutral-800 text-white font-bold py-3 px-6 rounded-xl"
                >
                  Скасувати
                </button>
              )}
            </div>
          </form>

          {/* ПРЕВ'Ю (справа) */}
          <div className="w-full xl:w-80 shrink-0">
            <div className="bg-neutral-900 border border-purple-900/50 p-6 rounded-2xl sticky top-6">
              <h3 className="text-xl font-bold mb-4 text-purple-400 text-center">Прев'ю</h3>
              
              <div className="flex justify-center">
                <div
                  className={`w-48 bg-neutral-900 rounded-xl overflow-hidden border-2 ${
                    getCardStyle(cardForm.rarity || 'Звичайна', rarities).border
                  } group relative flex flex-col`}
                >
                  <div
                    className={`aspect-[2/3] w-full relative shrink-0 ${
                      cardForm.effect ? `effect-${cardForm.effect}` : ''
                    }`}
                  >
                    <CardFrame frame={cardForm.frame || 'normal'} effect={cardForm.effect}>
                      <img
                        src={cardPreviewUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    </CardFrame>
                    {cardForm.maxSupply > 0 && (
                      <div className="absolute top-1 left-1 bg-black/80 text-white text-[8px] px-1.5 py-0.5 rounded border border-neutral-700 z-10">
                        {editingCard ? (editingCard.maxSupply - (editingCard.pulledCount || 0)) : cardForm.maxSupply}/{cardForm.maxSupply}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 text-center">
                <p className="font-bold text-lg text-white break-words">
                  {cardForm.name || 'Без назви'}
                </p>
                <p className={`text-sm font-bold uppercase tracking-wider mt-1 ${getCardStyle(cardForm.rarity || 'Звичайна', rarities).text}`}>
                  {cardForm.rarity || 'Звичайна'}
                </p>
                {cardForm.packId && (
                  <p className="text-xs text-neutral-500 mt-2 bg-neutral-950 rounded py-1 px-2 inline-block border border-neutral-800">
                    {packsCatalog.find((p) => p.id === cardForm.packId)?.name || cardForm.packId}
                  </p>
                )}
                
                {cardForm.isGame && (
                  <div className="mt-3 text-xs bg-green-900/20 text-green-400 px-3 py-2 rounded-lg border border-green-900/30 flex flex-col gap-1 w-full text-center">
                    <span className="font-bold uppercase tracking-widest text-[10px] text-green-500">Ігрова Картка</span>
                    <div>⚔️ Сила (Рів.1): {cardForm.maxPower || '?'}</div>
                    <div>❤️ HP (Рів.1): {cardForm.maxHp || '?'}</div>
                  </div>
                )}
                {cardForm.perk && (
                  <div className="mt-2 text-xs bg-purple-900/20 text-purple-400 px-3 py-1.5 rounded-lg border border-purple-900/30 inline-block">
                    <span className="font-bold">Перк:</span> {cardForm.perk} {cardForm.perkValue ? `(${cardForm.perkValue}%)` : ''}
                  </div>
                )}
                {cardForm.effect && (
                  <div className="mt-2 text-[10px] text-fuchsia-400/70 uppercase tracking-widest">
                    Ефект: {EFFECT_OPTIONS.find(e => e.id === cardForm.effect)?.name || cardForm.effect}
                  </div>
                )}

                {cardForm.soundUrl && (
                  <button
                    type="button"
                    onClick={playCardSound}
                    className="mt-4 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 px-4 py-2 rounded-xl border border-purple-900/50 flex items-center justify-center gap-2 mx-auto transition-colors w-full"
                  >
                    <Volume2 size={16} /> Послухати звук
                  </button>
                )}
              </div>
            </div>
          </div>
          </div>

          {/* Фільтри Карток */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
              <input
                type="text"
                placeholder="Пошук картки..."
                value={cardSearchTerm}
                onChange={(e) => setCardSearchTerm(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-10 pr-4 py-3 text-white focus:border-purple-500 outline-none"
              />
            </div>
            <div className="relative w-full sm:w-64">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
              <select
                value={cardPackFilter}
                onChange={(e) => setCardPackFilter(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-10 pr-4 py-3 text-white focus:border-purple-500 outline-none appearance-none"
              >
                <option value="all">Усі паки</option>
                {packsCatalog.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Список Карток */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {filteredCards.map((card) => {
              const packInfo = packsCatalog.find((p) => p.id === card.packId);
              const style = getCardStyle(card.rarity, rarities);
              const effectClass = card.effect ? `effect-${card.effect}` : '';

              // РОЗРАХОВУЄМО ШАНС ДЛЯ КОЖНОЇ КАРТКИ
              const dropChance = calculateDropChance(card, packInfo);

              return (
                <div
                  key={card.id}
                  className={`bg-neutral-900 rounded-xl overflow-hidden border-2 ${style.border} group relative flex flex-col`}
                >
                  {/* ВЕРХНЯ ЧАСТИНА (Картинка та кнопки) */}
                  <div className={`aspect-[2/3] w-full relative shrink-0 ${effectClass}`}>
                    <CardFrame frame={card.frame} effect={card.effect}>
                      <img
                        src={card.image}
                        alt={card.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </CardFrame>
                    {card.maxSupply > 0 && (
                      <div className="absolute top-1 left-1 bg-black/80 text-white text-[8px] px-1.5 py-0.5 rounded border border-neutral-700 z-10">
                        {card.maxSupply - (card.pulledCount || 0)}/{card.maxSupply}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-20">
                      <button
                        onClick={() => {
                          setEditingCard(card);
                          setCardForm({
                            ...card,
                            maxSupply: card.maxSupply || '',
                            weight: card.weight || '',
                            sellPrice: card.sellPrice || '',
                            effect: card.effect || '',
                            dropAnim: card.dropAnim || '',
                            soundUrl: card.soundUrl || '',
                            soundVolume: card.soundVolume !== undefined ? card.soundVolume : 0.5,
                            frame: card.frame || 'normal',
                            minPower: card.minPower !== null ? card.minPower : '',
                            maxPower: card.maxPower !== null ? card.maxPower : '',
                            minHp: card.minHp !== null ? card.minHp : '',
                            maxHp: card.maxHp !== null ? card.maxHp : '',
                            perk: card.perk || '',
                            perkValue: card.perkValue !== null && card.perkValue !== undefined ? card.perkValue : '',
                            levelingConfig: card.levelingConfig || {},
                            bonusPerkLevel: card.bonusPerkLevel || '',
                            bonusPerk: card.bonusPerk || '',
                            bonusPerkValue: card.bonusPerkValue !== null && card.bonusPerkValue !== undefined ? card.bonusPerkValue : '',
                          });
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="p-2 bg-blue-600 rounded-lg text-white shadow-lg transform hover:scale-110 transition-transform"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => deleteCard(card.id)}
                        className="p-2 bg-red-600 rounded-lg text-white shadow-lg transform hover:scale-110 transition-transform"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  {/* НИЖНЯ ЧАСТИНА (Текст, відсотки, ціна, ефект) */}
                  <div className="p-2 text-center flex flex-col items-center flex-1 justify-between">
                    <div className="w-full">
                      {/* 1. Рідкість та Шанс */}
                      <div
                        className={`text-[10px] font-black uppercase ${style.text} flex justify-between px-1 mb-0.5`}
                      >
                        <span>{card.rarity}</span>
                        <span
                          className="text-white bg-black/40 px-1 rounded"
                          title="Шанс випадіння з паку"
                        >
                          {dropChance}
                        </span>
                      </div>

                      {/* 2. Назва картки */}
                      <div className="font-bold text-xs truncate mb-1 text-white w-full">
                        {card.name}
                      </div>

                      {/* 3. Ціна та Ефект / Звук */}
                      <div className="flex justify-between items-center w-full px-1 mb-1">
                        <span
                          className="text-[10px] text-green-400 font-bold flex items-center gap-0.5"
                          title="Ціна продажу"
                        >
                          {card.sellPrice || 15} <Coins size={10} />
                        </span>
                        <div className="flex items-center gap-1.5">
                          {card.soundUrl && (
                            <Volume2 size={10} className="text-purple-400" title="Має звук" />
                          )}
                          {card.effect && (
                            <span
                              className="text-[8px] text-purple-400 bg-purple-900/40 px-1 rounded border border-purple-800/50 uppercase tracking-wider"
                              title="Візуальний ефект"
                            >
                              {card.effect}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* 4. Назва паку */}
                      <div className="text-[9px] text-neutral-500 truncate bg-neutral-950 rounded py-0.5 px-1 inline-block w-full">
                        {packInfo ? packInfo.name : 'Без паку!'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredCards.length === 0 && (
              <p className="col-span-full text-center text-neutral-500 py-10">
                Карток не знайдено.
              </p>
            )}
          </div>
        </div>
      )}

      {/* --- Вкладка: СПОВІЩЕННЯ --- */}
      {activeTab === 'notifications' && (
        <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-6 animate-in fade-in slide-in-from-bottom-4">
          <h2 className="text-2xl font-black text-white mb-6 flex items-center gap-2">
            <Mail className="text-blue-500" /> Надіслати Сповіщення
          </h2>

          <form onSubmit={handleSendNotification} className="space-y-4 max-w-xl mx-auto">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">
                  Отримувач (Нікнейм):
                </label>
                <input
                  list="notif-user-list"
                  value={
                    notifForm.targetUid === 'ALL'
                      ? 'Всі гравці (Глобальне)'
                      : allUsers.find((u) => u.uid === notifForm.targetUid)?.nickname ||
                      notifForm.targetUid
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (
                      val === 'Всі гравці (Глобальне)' ||
                      val.toLowerCase() === 'all' ||
                      val.toLowerCase() === 'всі'
                    ) {
                      setNotifForm({ ...notifForm, targetUid: 'ALL' });
                    } else {
                      const foundUser = allUsers.find(
                        (u) => u.nickname.toLowerCase() === val.toLowerCase()
                      );
                      if (foundUser) {
                        setNotifForm({ ...notifForm, targetUid: foundUser.uid });
                      } else {
                        setNotifForm({ ...notifForm, targetUid: val });
                      }
                    }
                  }}
                  placeholder="Введіть нікнейм..."
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none"
                />
                <datalist id="notif-user-list">
                  <option value="Всі гравці (Глобальне)" />
                  {allUsers.map((u) => (
                    <option key={u.uid} value={u.nickname} />
                  ))}
                </datalist>
              </div>
              <div className="flex-1">
                <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">
                  Тип сповіщення:
                </label>
                <select
                  value={notifForm.type}
                  onChange={(e) => setNotifForm({ ...notifForm, type: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none"
                >
                  <option value="update">Оновлення сайту</option>
                  <option value="gift">Подарунок</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">
                Заголовок:
              </label>
              <input
                type="text"
                value={notifForm.title}
                onChange={(e) => setNotifForm({ ...notifForm, title: e.target.value })}
                required
                placeholder="Наприклад: Нове оновлення 1.2!"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">
                Текст сповіщення:
              </label>
              <textarea
                value={notifForm.message}
                onChange={(e) => setNotifForm({ ...notifForm, message: e.target.value })}
                required
                placeholder="Детальний опис..."
                rows={4}
                className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none resize-none"
              ></textarea>
            </div>

            {notifForm.type === 'gift' && (
              <div className="bg-green-900/10 border border-green-900/30 p-4 rounded-xl space-y-4">
                <h3 className="text-sm font-bold text-green-400 uppercase flex items-center gap-2">
                  <Gift size={16} /> Вкладення до подарунку
                </h3>
                <div>
                  <label className="text-xs font-bold text-neutral-400 mb-1 block">
                    Монети (за потреби):
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={notifForm.attachedCoins}
                    onChange={(e) =>
                      setNotifForm({ ...notifForm, attachedCoins: Number(e.target.value) })
                    }
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-green-500 outline-none"
                  />
                </div>
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-neutral-400 mb-1 block">
                      Картка (за потреби):
                    </label>
                    <select
                      value={notifForm.attachedCardId}
                      onChange={(e) =>
                        setNotifForm({ ...notifForm, attachedCardId: e.target.value })
                      }
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-green-500 outline-none"
                    >
                      <option value="">Без картки</option>
                      {cardsCatalog.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.rarity})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-full sm:w-32">
                    <label className="text-xs font-bold text-neutral-400 mb-1 block">
                      Кіл-ть карток:
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={notifForm.attachedCardAmount}
                      onChange={(e) =>
                        setNotifForm({ ...notifForm, attachedCardAmount: Number(e.target.value) })
                      }
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-green-500 outline-none"
                      disabled={!notifForm.attachedCardId}
                    />
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              className={`w-full font-black py-4 rounded-xl shadow-lg transition-transform transform active:scale-95 flex items-center justify-center gap-2 ${notifForm.type === 'gift' ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
            >
              {notifForm.type === 'gift' ? <Gift size={20} /> : <Mail size={20} />}
              Надіслати {notifForm.type === 'gift' ? 'Подарунок' : 'Сповіщення'}
            </button>
          </form>
        </div>
      )}

      {/* --- Вкладка: СМАРАГДИ --- */}
      {activeTab === 'emeralds' && currentProfile.isAdmin && (
        <div className="space-y-6 animate-in fade-in">
          {/* Box Settings */}
          <div className="bg-neutral-900 border border-emerald-900/40 rounded-2xl p-6">
            <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-5">
              💎 Налаштування Скрині
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800">
                <label className="text-xs font-bold text-neutral-400 uppercase mb-2 block">Вартість відкриття</label>
                <input
                  type="number"
                  min="0"
                  value={emeraldSettings.boxCostAmount}
                  onChange={(e) => setEmeraldSettings({ ...emeraldSettings, boxCostAmount: Number(e.target.value) })}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:border-emerald-500 outline-none font-bold"
                />
              </div>
              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800">
                <label className="text-xs font-bold text-neutral-400 uppercase mb-2 block">Валюта</label>
                <select
                  value={emeraldSettings.boxCostCurrency}
                  onChange={(e) => setEmeraldSettings({ ...emeraldSettings, boxCostCurrency: e.target.value })}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:border-emerald-500 outline-none font-bold"
                >
                  <option value="coins">Монети</option>
                  <option value="crystals">Кристали</option>
                </select>
              </div>
              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800">
                <label className="text-xs font-bold text-neutral-400 uppercase mb-2 block">Макс. відкриттів/день</label>
                <input
                  type="number"
                  min="1"
                  value={emeraldSettings.maxDailyOpens}
                  onChange={(e) => setEmeraldSettings({ ...emeraldSettings, maxDailyOpens: Number(e.target.value) })}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:border-emerald-500 outline-none font-bold"
                />
              </div>
            </div>
            <button
              onClick={async () => {
                try {
                  await saveEmeraldSettingsRequest(getToken(), emeraldSettings);
                  showToast('Налаштування скрині збережено!', 'success');
                } catch (e) {
                  showToast(e.message || 'Помилка збереження.', 'error');
                }
              }}
              className="bg-emerald-700 hover:bg-emerald-600 text-white font-bold px-6 py-3 rounded-xl transition-colors"
            >
              Зберегти Налаштування
            </button>
          </div>

          {/* Emerald Types */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
            <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-5">
              Типи Смарагдів
            </h3>

            {/* Type form */}
            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-5 mb-6">
              <h4 className="text-sm font-bold text-neutral-300 mb-4">
                {editingEmeraldType ? `Редагувати: ${editingEmeraldType.name}` : 'Новий тип смарагду'}
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div>
                  <label className="text-xs font-bold text-neutral-400 mb-1 block">Назва</label>
                  <input
                    type="text"
                    value={emeraldTypeForm.name}
                    onChange={(e) => setEmeraldTypeForm({ ...emeraldTypeForm, name: e.target.value })}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:border-emerald-500 outline-none text-sm"
                    placeholder="Назва смарагду"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-neutral-400 mb-1 block">Колір</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={emeraldTypeForm.color}
                      onChange={(e) => setEmeraldTypeForm({ ...emeraldTypeForm, color: e.target.value })}
                      className="w-10 h-10 rounded cursor-pointer border border-neutral-700 bg-neutral-900"
                    />
                    <input
                      type="text"
                      value={emeraldTypeForm.color}
                      onChange={(e) => setEmeraldTypeForm({ ...emeraldTypeForm, color: e.target.value })}
                      className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:border-emerald-500 outline-none text-sm font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-neutral-400 mb-1 block">Буст перку (%)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={emeraldTypeForm.perkBoostPercent}
                    onChange={(e) => setEmeraldTypeForm({ ...emeraldTypeForm, perkBoostPercent: Number(e.target.value) })}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:border-emerald-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-neutral-400 mb-1 block">Вага випадання</label>
                  <input
                    type="number"
                    min="1"
                    value={emeraldTypeForm.dropWeight}
                    onChange={(e) => setEmeraldTypeForm({ ...emeraldTypeForm, dropWeight: Number(e.target.value) })}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:border-emerald-500 outline-none text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  disabled={isSavingEmerald || !emeraldTypeForm.name}
                  onClick={async () => {
                    if (!emeraldTypeForm.name) return;
                    setIsSavingEmerald(true);
                    try {
                      const payload = editingEmeraldType
                        ? { ...emeraldTypeForm, id: editingEmeraldType.id }
                        : emeraldTypeForm;
                      const res = await saveEmeraldTypeRequest(getToken(), payload);
                      if (editingEmeraldType) {
                        setEmeraldTypes(emeraldTypes.map((t) => (t.id === res.emeraldType.id ? res.emeraldType : t)));
                      } else {
                        setEmeraldTypes([...emeraldTypes, res.emeraldType]);
                      }
                      setEditingEmeraldType(null);
                      setEmeraldTypeForm({ name: '', color: '#10b981', perkBoostPercent: 10, dropWeight: 50 });
                      showToast('Тип смарагду збережено!', 'success');
                    } catch (e) {
                      showToast(e.message || 'Помилка збереження.', 'error');
                    } finally {
                      setIsSavingEmerald(false);
                    }
                  }}
                  className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white font-bold px-5 py-2 rounded-xl transition-colors text-sm"
                >
                  {editingEmeraldType ? 'Оновити' : 'Додати'}
                </button>
                {editingEmeraldType && (
                  <button
                    onClick={() => {
                      setEditingEmeraldType(null);
                      setEmeraldTypeForm({ name: '', color: '#10b981', perkBoostPercent: 10, dropWeight: 50 });
                    }}
                    className="bg-neutral-700 hover:bg-neutral-600 text-white font-bold px-5 py-2 rounded-xl transition-colors text-sm"
                  >
                    Скасувати
                  </button>
                )}
              </div>
            </div>

            {/* Types table */}
            {emeraldTypes.length === 0 ? (
              <div className="text-center py-10 text-neutral-500 text-sm">Типи смарагдів ще не додані.</div>
            ) : (
              <div className="space-y-2">
                {emeraldTypes.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-4 bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3"
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: t.color }}
                    >
                      <Gem size={14} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-bold text-sm">{t.name}</div>
                      <div className="text-neutral-400 text-xs">
                        +{t.perkBoostPercent}% до перку · Вага: {t.dropWeight}
                      </div>
                    </div>
                    <div className="text-xs text-neutral-500 font-mono">{t.color}</div>
                    <button
                      onClick={() => {
                        setEditingEmeraldType(t);
                        setEmeraldTypeForm({
                          name: t.name,
                          color: t.color,
                          perkBoostPercent: t.perkBoostPercent,
                          dropWeight: t.dropWeight,
                        });
                      }}
                      className="text-blue-400 hover:text-blue-300 p-2 rounded-lg hover:bg-blue-900/20 transition-colors"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={async () => {
                        if (!window.confirm(`Видалити "${t.name}"?`)) return;
                        try {
                          await deleteEmeraldTypeRequest(getToken(), t.id);
                          setEmeraldTypes(emeraldTypes.filter((x) => x.id !== t.id));
                          showToast('Тип смарагду видалено.', 'success');
                        } catch (e) {
                          showToast(e.message || 'Помилка видалення.', 'error');
                        }
                      }}
                      className="text-red-400 hover:text-red-300 p-2 rounded-lg hover:bg-red-900/20 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
