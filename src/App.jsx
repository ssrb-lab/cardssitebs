import React, { useState, useEffect, useRef } from 'react';
import {
  Coins,
  PackageOpen,
  LayoutGrid,
  AlertCircle,
  Loader2,
  Mail,
  User,
  CheckCircle2,
  Shield,
  KeyRound,
  Trophy,
  Store,
  Hexagon,
  Gem,
  Swords,
  Gift,
  Volume2,
  VolumeX,
  Hammer,
} from 'lucide-react';

import {
  loginUser,
  createAdminLogRequest,
  registerUser,
  googleLoginRequest,
  setToken,
  removeToken,
  setMainShowcaseRequest,
  fetchCatalog,
  openPackRequest,
  getToken,
  sellCardsRequest,
  fetchMarket,
  listCardRequest,
  buyCardRequest,
  cancelListingRequest,
  fetchSettings,
  createShowcaseRequest,
  deleteShowcaseRequest,
  saveShowcaseCardsRequest,
  fetchNotifications,
  toggleSafeRequest,
  safeFetch,
} from './config/api';
import NotificationsModal from './components/NotificationsModal';
import { GoogleLogin } from '@react-oauth/google';
import { isToday, getCardWeight } from './utils/helpers';
import { DEFAULT_PACKS, DEFAULT_BOSSES, DEFAULT_RARITIES, SELL_PRICE } from './config/constants';

import logo1 from './assets/logo1.png';
import PlayerAvatar from './components/PlayerAvatar';
import CardModal from './components/CardModal';
import ListingModal from './components/ListingModal';
import NavButton from './components/NavButton';

import FarmView from './views/FarmView';
import ShopView from './views/ShopView';
import PremiumShopView from './views/PremiumShopView';
import InventoryView from './views/InventoryView';
import MarketView from './views/MarketView';
import ForgeView from './views/ForgeView';
import ProfileView from './views/ProfileView';
import RatingView from './views/RatingView';
import PublicProfileView from './views/PublicProfileView';
import AdminView from './views/AdminView';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export default function App() {
  const [user, setUser] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [dbInventory, setDbInventory] = useState([]);
  const [marketListings, setMarketListings] = useState([]);
  const [showcases, setShowcases] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isProcessing, setIsProcessing] = useState(false);
  const actionLock = useRef(false);
  const lastCheckRef = useRef(null);

  const [needsRegistration, setNeedsRegistration] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login', 'register', 'forgotPassword', 'resetPassword'
  const [dbError, setDbError] = useState('');

  const [bosses, setBosses] = useState([]);
  const [statsRanges, setStatsRanges] = useState({});
  const [cardsCatalog, setCardsCatalog] = useState([]);
  const [packsCatalog, setPacksCatalog] = useState([]);
  const [achievementsCatalog, setAchievementsCatalog] = useState([]);
  const [cardStats, setCardStats] = useState({});
  const [rarities] = useState(DEFAULT_RARITIES);
  const [dailyRewards, setDailyRewards] = useState([1000, 2000, 3000, 4000, 5000, 6000, 7000]);
  const [premiumDailyRewards, setPremiumDailyRewards] = useState([
    2000, 4000, 6000, 8000, 10000, 12000, 15000,
  ]);
  const [premiumPrice, setPremiumPrice] = useState(10000);
  const [premiumDurationDays, setPremiumDurationDays] = useState(30);
  const [premiumShopItems, setPremiumShopItems] = useState([]);
  const [wordleEntryCost, setWordleEntryCost] = useState(0);

  const [currentView, setCurrentView] = useState(() => {
    // Намагаємось отримати збережену вкладку, якщо її немає — за замовчуванням "shop"
    return localStorage.getItem('lastActiveView') || 'shop';
  });

  // Додаємо useEffect, який буде зберігати вкладку в localStorage щоразу, коли вона змінюється
  useEffect(() => {
    localStorage.setItem('lastActiveView', currentView);
  }, [currentView]);
  const [selectedPackId, setSelectedPackId] = useState(null);
  const [openingPackId, setOpeningPackId] = useState(null);
  const [isRouletteSpinning, setIsRouletteSpinning] = useState(false);
  const [rouletteItems, setRouletteItems] = useState([]);
  const [pulledCards, setPulledCards] = useState([]);
  const [viewingCard, setViewingCard] = useState(null);
  const [viewingPlayerProfile, setViewingPlayerProfile] = useState(null);
  const [toastMsg, setToastMsg] = useState({ text: '', type: '' });
  const [listingCard, setListingCard] = useState(null);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const canClaimDaily = profile && !isToday(profile.lastDailyClaim);

  const checkIsPremiumActive = (prof) => {
    if (!prof || !prof.isPremium || !prof.premiumUntil) return false;
    const d = new Date(prof.premiumUntil);
    return !isNaN(d) && d > new Date();
  };
  const isPremiumActive = checkIsPremiumActive(profile);

  useEffect(() => {
    document.title = 'Card Game';
  }, []);

  const addSystemLog = async (type, details) => {
    try {
      await createAdminLogRequest(getToken(), type, details);
    } catch (e) {
      console.error('Помилка логування:', e);
    }
  };

  useEffect(() => {
    let timeout;
    if (loading && user !== undefined && !profile && !needsRegistration) {
      timeout = setTimeout(() => {
        setDbError("Зв'язок з сервером втрачено. Перевірте підключення до інтернету.");
        setLoading(false);
      }, 8000);
    }
    return () => clearTimeout(timeout);
  }, [loading, profile, needsRegistration, user]);

  useEffect(() => {
    const initAuth = async () => {
      const params = new URLSearchParams(window.location.search);
      const resetToken = params.get('token');
      const isResetPath = window.location.pathname === '/reset-password';

      if (isResetPath && resetToken) {
        setAuthMode('resetPassword');
        setUser(null);
        setNeedsRegistration(true);
        setLoading(false);
        return;
      }

      const token = localStorage.getItem('token');

      if (!token) {
        setUser(null);
        setNeedsRegistration(true);
        setLoading(false);
        return;
      }

      try {
        const res = await safeFetch(`${API_BASE_URL}/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const userData = await res.json();
          const autoSound = localStorage.getItem('autoSoundEnabled');
          if (autoSound !== null) {
            userData.autoSoundEnabled = autoSound === 'true';
          }
          setUser({ uid: userData.uid, email: userData.email });
          setProfile(userData);
          if (userData.inventory) {
            setDbInventory(
              userData.inventory.map((i) => ({
                id: i.cardId,
                amount: i.amount,
                gameStats: i.gameStats || [],
              }))
            );
          }
          if (userData.showcases) {
            setShowcases(userData.showcases);
          }
          setNeedsRegistration(false);
        } else {
          throw new Error('Токен застарів або недійсний');
        }
      } catch (error) {
        console.error('Помилка авторизації:', error);
        localStorage.removeItem('token');
        setUser(null);
        setNeedsRegistration(true);
      }

      setLoading(false);
    };

    initAuth();
  }, []);

  const reloadSettings = async () => {
    try {
      const settings = await fetchSettings();
      setBosses(settings.bosses || DEFAULT_BOSSES);
      setStatsRanges(settings.statsRanges || {});
      setDailyRewards(settings.dailyRewards || [1000, 2000, 3000, 4000, 5000, 6000, 7000]);
      setPremiumDailyRewards(
        settings.premiumDailyRewards || [2000, 4000, 6000, 8000, 10000, 12000, 15000]
      );
      setPremiumPrice(settings.premiumPrice !== undefined ? settings.premiumPrice : 10000);
      setPremiumDurationDays(
        settings.premiumDurationDays !== undefined ? settings.premiumDurationDays : 30
      );
      setPremiumShopItems(settings.premiumShopItems || []);
      setWordleEntryCost(
        settings.wordleEntryCost !== undefined ? Number(settings.wordleEntryCost) : 0
      );
    } catch (e) {
      console.error('Помилка завантаження налаштувань:', e);
    }
  };

  useEffect(() => {
    const loadMySqlData = async () => {
      try {
        const { cards, packs, achievements } = await fetchCatalog();
        setCardsCatalog(cards || []);
        setPacksCatalog(packs || []);
        setAchievementsCatalog(achievements || []);

        // Генеруємо статистику з MySQL бази
        if (cards && cards.length > 0) {
          const stats = {};
          cards.forEach((c) => {
            stats[c.id] = c.pulledCount || 0;
          });
          setCardStats(stats);
        }

        const marketData = await fetchMarket();
        setMarketListings(marketData || []);

        await reloadSettings();
      } catch (err) {
        console.error('Помилка завантаження даних MySQL', err);
      }
    };
    loadMySqlData();
  }, []);

  // --- ФОНОВА ПЕРЕВІРКА ПРОДАЖІВ НА РИНКУ ---
  useEffect(() => {
    if (!user || !profile || needsRegistration) return;

    const checkMarketNotifications = async () => {
      try {
        const res = await safeFetch(
          `${API_BASE_URL}/game/market/notifications?lastCheck=${lastCheckRef.current}`,
          {
            headers: { Authorization: `Bearer ${getToken()}` },
          }
        );

        if (res.ok) {
          const data = await res.json();

          if (data.isBanned) {
            console.log('MARKET NOTIFICATION: BANNED=TRUE, merging data.profile', data.profile);
            setProfile((prev) => ({ ...prev, ...data.profile }));
            return;
          }

          if (data.serverTime) {
            lastCheckRef.current = data.serverTime;
          }

          if (data.sales && data.sales.length > 0) {
            data.sales.forEach((sale) => {
              showToast(
                `Гравець купив вашу картку "${sale.card?.name || 'Невідомо'}" за ${sale.price} монет!`,
                'success'
              );
            });

            if (data.profile) {
              setProfile((prev) => ({ ...data.profile, autoSoundEnabled: prev?.autoSoundEnabled }));
              if (data.profile.inventory) {
                setDbInventory(
                  data.profile.inventory.map((i) => ({
                    id: i.cardId,
                    amount: i.amount,
                    gameStats: i.gameStats,
                  }))
                );
              }
            }
          }
        }

        try {
          const notifs = await fetchNotifications(getToken());
          setNotifications(notifs);
        } catch (err) {}
      } catch (e) {
        console.error('Помилка фонового опитування:', e);
      }
    };

    // Initial check on load
    checkMarketNotifications();

    // Підключення до SSE для персональних сповіщень (наприклад, продажі на ринку)
    const token = getToken();
    if (!token) return;

    const eventSource = new EventSource(`${API_BASE_URL}/notifications/stream?token=${token}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'MARKET_SALE' || data.type === 'BANNED') {
          checkMarketNotifications();
        }
      } catch (e) {
        console.error('Помилка обробки SSE:', e);
      }
    };

    eventSource.onerror = (e) => {
      console.warn('Помилка підключення SSE до персональних сповіщень', e);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [user, profile, needsRegistration]);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    const email = e.target.email.value.trim();
    setLoading(true);
    setDbError('');

    try {
      if (authMode === 'forgotPassword') {
        const res = await safeFetch(`${API_BASE_URL}/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Помилка відновлення паролю');
        showToast(data.message, 'success');
        setAuthMode('login'); // Redirect to login after success
      } else if (authMode === 'resetPassword') {
        const password = e.target.password.value;
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token') || '';

        const res = await safeFetch(`${API_BASE_URL}/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, newPassword: password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Помилка скидання паролю');

        showToast(data.message, 'success');
        window.history.replaceState({}, document.title, '/');
        setAuthMode('login');
      } else if (authMode === 'register') {
        const password = e.target.password.value;
        const nickname = e.target.nickname.value.trim();
        if (!nickname) throw new Error('Введіть нікнейм!');
        const data = await registerUser(nickname, email, password);
        setToken(data.token);
        const autoSound = localStorage.getItem('autoSoundEnabled');
        if (autoSound !== null) data.user.autoSoundEnabled = autoSound === 'true';
        setUser({ uid: data.user.uid, email: data.user.email });
        setProfile(data.user);
        setNeedsRegistration(false);
      } else {
        const password = e.target.password.value;
        const data = await loginUser(email, password);
        setToken(data.token);
        const autoSound = localStorage.getItem('autoSoundEnabled');
        if (autoSound !== null) data.user.autoSoundEnabled = autoSound === 'true';
        setUser({ uid: data.user.uid, email: data.user.email });
        setProfile(data.user);
        setNeedsRegistration(false);
      }
    } catch (err) {
      setDbError(err.message);
    }
    setLoading(false);
  };

  const toggleAutoSound = async () => {
    if (!user || actionLock.current) return;
    const newValue = profile?.autoSoundEnabled === false ? true : false;
    setProfile((prev) => ({ ...prev, autoSoundEnabled: newValue }));
    localStorage.setItem('autoSoundEnabled', newValue);
    showToast(newValue ? 'Автозвук увімкнено' : 'Автозвук вимкнено', 'success');
  };

  const handleLogout = async () => {
    setLoading(true);
    localStorage.removeItem('token');
    setUser(null);
    setProfile(null);
    setDbInventory([]);
    setShowcases([]);
    setCurrentView('shop');
    setAuthMode('login');
    setNeedsRegistration(true);
    setLoading(false);
  };

  // Use a ref to store the timeout ID so it persists across renders
  const toastTimeoutRef = useRef(null);

  const showToast = (msg, type = 'error') => {
    setToastMsg({ text: msg, type });
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToastMsg({ text: '', type: '' }), 3000);
  };

  const reloadMarket = async () => {
    try {
      const marketData = await fetchMarket();
      setMarketListings(marketData || []);
    } catch (e) {
      console.error(e);
    }
  };

  const reloadProfile = async () => {
    try {
      const res = await safeFetch(`${API_BASE_URL}/profile`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const userData = await res.json();
        const autoSound = localStorage.getItem('autoSoundEnabled');
        if (autoSound !== null) userData.autoSoundEnabled = autoSound === 'true';
        setProfile(userData);
        if (userData.inventory) {
          setDbInventory(
            userData.inventory.map((i) => ({
              id: i.cardId,
              amount: i.amount,
              gameStats: i.gameStats || [],
            }))
          );
        }
        if (userData.showcases) {
          setShowcases(userData.showcases);
        }
      }
    } catch (e) {
      console.error('Помилка оновлення профілю:', e);
    }
  };

  const listOnMarket = async (cardId, price) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setIsProcessing(true);
    try {
      const power = listingCard?.targetPowerToSell || null;
      const hp = listingCard?.targetHpToSell || null;
      const data = await listCardRequest(getToken(), cardId, price, power, hp);
      setProfile((prev) => ({ ...data.profile, autoSoundEnabled: prev?.autoSoundEnabled }));
      setDbInventory(
        data.profile.inventory.map((i) => ({
          id: i.cardId,
          amount: i.amount,
          gameStats: i.gameStats,
        }))
      );
      showToast('Картку успішно виставлено на Ринок!', 'success');
      setListingCard(null);
      await reloadMarket();
    } catch (e) {
      showToast(`Помилка: ${e.message}`);
    } finally {
      actionLock.current = false;
      setIsProcessing(false);
    }
  };

  const buyFromMarket = async (listing) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setIsProcessing(true);
    try {
      const data = await buyCardRequest(getToken(), listing.id);
      setProfile((prev) => ({ ...data.profile, autoSoundEnabled: prev?.autoSoundEnabled }));
      setDbInventory(
        data.profile.inventory.map((i) => ({
          id: i.cardId,
          amount: i.amount,
          gameStats: i.gameStats,
        }))
      );
      showToast(`Картку успішно придбано за ${listing.price} монет!`, 'success');
      await reloadMarket();
    } catch (e) {
      showToast(e.message || 'Помилка покупки.');
    } finally {
      actionLock.current = false;
      setIsProcessing(false);
    }
  };

  const cancelMarketListing = async (listing) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setIsProcessing(true);
    try {
      const data = await cancelListingRequest(getToken(), listing.id);
      setProfile((prev) => ({ ...data.profile, autoSoundEnabled: prev?.autoSoundEnabled }));
      setDbInventory(
        data.profile.inventory.map((i) => ({
          id: i.cardId,
          amount: i.amount,
          gameStats: i.gameStats,
        }))
      );
      showToast(
        listing.sellerUid === user.uid ? 'Лот знято з продажу.' : 'Лот примусово видалено.',
        'success'
      );
      await reloadMarket();
    } catch (e) {
      showToast(e.message || 'Помилка скасування лоту.');
    } finally {
      actionLock.current = false;
      setIsProcessing(false);
    }
  };

  const openPack = async (packId, cost, amountToOpen = 1) => {
    if (actionLock.current || !profile || openingPackId || isRouletteSpinning) return;
    actionLock.current = true;
    setIsProcessing(true);

    try {
      const totalCost = cost * amountToOpen;
      if (profile.coins < totalCost) {
        showToast('Недостатньо монет!');
        actionLock.current = false;
        setIsProcessing(false);
        return;
      }

      setOpeningPackId(packId);
      setPulledCards([]);

      try {
        const data = await openPackRequest(getToken(), packId, amountToOpen);
        const results = data.pulledCards;

        if (amountToOpen === 1) {
          const availablePackCards = cardsCatalog.filter((c) => c.packId === packId);
          const fakeCards = Array.from(
            { length: 45 },
            () => availablePackCards[Math.floor(Math.random() * availablePackCards.length)]
          );
          fakeCards[35] = results[0];
          setRouletteItems(fakeCards);
          setIsRouletteSpinning(true);
          setOpeningPackId(null);

          setTimeout(() => {
            setIsRouletteSpinning(false);
            const mappedResults = results.map((c) => ({
              ...c,
              generatedPower: c.generatedStats?.power,
              generatedHp: c.generatedStats?.hp,
            }));
            const sortedResults = [...mappedResults].sort(
              (a, b) => getCardWeight(a.rarity, rarities) - getCardWeight(b.rarity, rarities)
            );
            setPulledCards(sortedResults);
            setProfile((prev) => ({ ...data.profile, autoSoundEnabled: prev?.autoSoundEnabled }));
            setDbInventory(
              data.profile.inventory.map((i) => ({
                id: i.cardId,
                amount: i.amount,
                gameStats: i.gameStats,
              }))
            );
            if (data.unlockedAchievements && data.unlockedAchievements.length > 0) {
              data.unlockedAchievements.forEach((ach) => {
                showToast(`🏆 Досягнення розблоковано: ${ach.name}!`, 'success');
              });
            }
            actionLock.current = false;
            setIsProcessing(false);
          }, 5000);
        } else {
          setOpeningPackId(null);
          const mappedResults = results.map((c) => ({
            ...c,
            generatedPower: c.generatedStats?.power,
            generatedHp: c.generatedStats?.hp,
          }));
          const sortedResults = [...mappedResults].sort(
            (a, b) => getCardWeight(a.rarity, rarities) - getCardWeight(b.rarity, rarities)
          );
          setPulledCards(sortedResults);
          setProfile((prev) => ({ ...data.profile, autoSoundEnabled: prev?.autoSoundEnabled }));
          setDbInventory(
            data.profile.inventory.map((i) => ({
              id: i.cardId,
              amount: i.amount,
              gameStats: i.gameStats,
            }))
          );
          if (data.unlockedAchievements && data.unlockedAchievements.length > 0) {
            data.unlockedAchievements.forEach((ach) => {
              showToast(`🏆 Досягнення розблоковано: ${ach.name}!`, 'success');
            });
          }
          actionLock.current = false;
          setIsProcessing(false);
        }
      } catch (err) {
        console.error(err);
        showToast(`Помилка: ${err.message}`);
        setOpeningPackId(null);
        actionLock.current = false;
        setIsProcessing(false);
      }
    } catch (e) {
      actionLock.current = false;
      setIsProcessing(false);
    }
  };

  const sellPulledCards = async () => {
    if (actionLock.current || pulledCards.length === 0) return;
    actionLock.current = true;
    setIsProcessing(true);

    const countsMap = {};
    pulledCards.forEach((c) => {
      countsMap[c.id] = (countsMap[c.id] || 0) + 1;
    });

    const itemsToSell = [];

    for (const [id, pulledAmount] of Object.entries(countsMap)) {
      const invItem = dbInventory.find((i) => i.id === id || i.cardId === id);
      const invAmount = invItem ? invItem.amount : 0;

      const isGameCard = pulledCards.find((c) => c.id === id)?.isGame;
      const keepAmount = isGameCard ? 3 : 1;
      const duplicateCount = Math.max(0, invAmount - keepAmount);
      const sellAmount = Math.min(pulledAmount, duplicateCount);

      if (sellAmount > 0) {
        itemsToSell.push({ cardId: id, amount: sellAmount });
      }
    }

    if (itemsToSell.length === 0) {
      showToast('Серед отриманих карток немає дублікатів!', 'error');
      actionLock.current = false;
      setIsProcessing(false);
      return;
    }

    try {
      const data = await sellCardsRequest(getToken(), itemsToSell);
      setProfile((prev) => ({ ...data.profile, autoSoundEnabled: prev?.autoSoundEnabled }));
      setDbInventory(
        data.profile.inventory.map((i) => ({
          id: i.cardId,
          amount: i.amount,
          gameStats: i.gameStats,
        }))
      );
      showToast(`Успішно продано дублікати! Отримано ${data.earned} монет.`, 'success');

      const newPulledCards = [];
      const soldMap = {};
      itemsToSell.forEach((item) => {
        soldMap[item.cardId] = item.amount;
      });

      pulledCards.forEach((c) => {
        if (soldMap[c.id] > 0) {
          soldMap[c.id]--;
        } else {
          newPulledCards.push(c);
        }
      });
      setPulledCards(newPulledCards);
    } catch (e) {
      showToast(e.message || 'Помилка продажу карток.');
    } finally {
      actionLock.current = false;
      setIsProcessing(false);
    }
  };

  const sellSinglePulledCard = async (card) => {
    if (actionLock.current) return;

    const countInPack = pulledCards.filter((c) => c.id === card.id).length;
    const invItem = dbInventory.find((i) => i.id === card.id || i.cardId === card.id);
    const invAmount = invItem ? invItem.amount : 0;

    if (invAmount <= 1) {
      if (
        !window.confirm(
          `Ви намагаєтесь продати картку "${card.name}", якої ще немає у вашій колекції. Продати її?`
        )
      ) {
        return;
      }
    }

    actionLock.current = true;
    setIsProcessing(true);
    try {
      const data = await sellCardsRequest(getToken(), [{ cardId: card.id, amount: 1 }]);
      setProfile((prev) => ({ ...data.profile, autoSoundEnabled: prev?.autoSoundEnabled }));
      setDbInventory(
        data.profile.inventory.map((i) => ({
          id: i.cardId,
          amount: i.amount,
          gameStats: i.gameStats,
        }))
      );
      showToast(`Продано за ${data.earned} монет!`, 'success');

      const index = pulledCards.findIndex((c) => c.id === card.id);
      if (index !== -1) {
        const newPulled = [...pulledCards];
        newPulled.splice(index, 1);
        setPulledCards(newPulled);
      }
    } catch (e) {
      showToast(e.message || 'Помилка продажу.');
    } finally {
      actionLock.current = false;
      setIsProcessing(false);
    }
  };

  const toggleSafe = async (cardId, statsIndex, amount, isSafe) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setIsProcessing(true);
    try {
      const data = await toggleSafeRequest(getToken(), cardId, statsIndex, amount, isSafe);
      setProfile((prev) => ({ ...data.profile, autoSoundEnabled: prev?.autoSoundEnabled }));
      setDbInventory(
        data.profile.inventory.map((i) => ({
          id: i.cardId,
          amount: i.amount,
          gameStats: i.gameStats,
        }))
      );
      showToast(isSafe ? 'Додано до сейфу 🔒' : 'Забрано з сейфу 🔓', 'success');
    } catch (e) {
      showToast(e.message || 'Помилка!', 'error');
    } finally {
      actionLock.current = false;
      setIsProcessing(false);
    }
  };

  const sellDuplicate = async (cardId, power = undefined, hp = undefined) => {
    if (actionLock.current) return false;
    actionLock.current = true;
    setIsProcessing(true);

    try {
      const payload = { cardId, amount: 1 };
      if (power !== undefined) {
        payload.power = power;
      }
      if (hp !== undefined) {
        payload.hp = hp;
      }
      const data = await sellCardsRequest(getToken(), [payload]);
      setProfile((prev) => ({ ...data.profile, autoSoundEnabled: prev?.autoSoundEnabled }));
      setDbInventory(
        data.profile.inventory.map((i) => ({
          id: i.cardId,
          amount: i.amount,
          gameStats: i.gameStats,
        }))
      );
      showToast(`Продано за ${data.earned} монет!`, 'success');
      return true;
    } catch (e) {
      showToast(e.message || 'Помилка під час продажу.');
      return false;
    } finally {
      actionLock.current = false;
      setIsProcessing(false);
    }
  };

  const sellAllDuplicates = async (cardId) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setIsProcessing(true);

    try {
      const existing = dbInventory.find((i) => i.id === cardId);
      const cardData = cardsCatalog.find((c) => c.id === cardId);

      // Ігноруємо лімітовані картки
      if (cardData?.maxSupply > 0) {
        showToast('Лімітовані картки можна продати лише на ринку гравцям.', 'error');
        actionLock.current = false;
        setIsProcessing(false);
        return;
      }

      const isGameCard = cardData?.isGame;
      const keepAmount = isGameCard ? 3 : 1;

      if (!existing || existing.amount <= keepAmount) {
        showToast(
          `Для масового продажу потрібно більше ніж ${keepAmount} шт. цієї картки.`,
          'error'
        );
        actionLock.current = false;
        setIsProcessing(false);
        return;
      }

      const sellCount = existing.amount - keepAmount;
      const data = await sellCardsRequest(getToken(), [{ cardId, amount: sellCount }]);
      setProfile((prev) => ({ ...data.profile, autoSoundEnabled: prev?.autoSoundEnabled }));
      setDbInventory(
        data.profile.inventory.map((i) => ({
          id: i.cardId,
          amount: i.amount,
          gameStats: i.gameStats,
        }))
      );

      // Перевіряємо чи сервер продав менше ніж ми просили (заблоковані картки)
      const actualSold = data.totalRemoved || sellCount;
      if (actualSold < sellCount) {
        showToast(`Продано ${actualSold} шт. за ${data.earned} монет! (${sellCount - actualSold} пропущено — Сейф/Арена)`, 'success');
      } else {
        showToast(`Продано ${actualSold} шт. за ${data.earned} монет!`, 'success');
      }
    } catch (e) {
      showToast(e.message || 'Помилка під час масового продажу.');
    } finally {
      actionLock.current = false;
      setIsProcessing(false);
    }
  };

  const sellEveryDuplicate = async (specificInventory = null) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setIsProcessing(true);

    try {
      const baseList =
        specificInventory ||
        dbInventory
          .map((item) => {
            const cardData = cardsCatalog.find((c) => c.id === item.id);
            return cardData && item.amount > 0 ? { card: cardData, amount: item.amount } : null;
          })
          .filter(Boolean);

      const duplicates = baseList.filter((item) => {
        const keepAmount = item.card?.isGame ? 3 : 1;
        // Ігноруємо лімітовані картки (вони продаються лише на ринку)
        if (item.card?.maxSupply > 0) return false;
        return item.amount > keepAmount;
      });
      if (duplicates.length === 0) {
        showToast('Немає дублікатів для продажу!', 'error');
        actionLock.current = false;
        setIsProcessing(false);
        return;
      }

      const itemsToSell = duplicates.map((item) => {
        const keepAmount = item.card?.isGame ? 3 : 1;
        return {
          cardId: item.card?.id || item.id,
          amount: item.amount - keepAmount,
        };
      });

      const totalRequested = itemsToSell.reduce((s, i) => s + i.amount, 0);

      const data = await sellCardsRequest(getToken(), itemsToSell);
      setProfile((prev) => ({ ...data.profile, autoSoundEnabled: prev?.autoSoundEnabled }));
      setDbInventory(
        data.profile.inventory.map((i) => ({
          id: i.cardId,
          amount: i.amount,
          gameStats: i.gameStats,
        }))
      );

      const actualSold = data.totalRemoved || totalRequested;
      if (actualSold < totalRequested) {
        showToast(`Продано дублікати! Отримано ${data.earned} монет. (${totalRequested - actualSold} карт пропущено — Сейф/Арена)`, 'success');
      } else {
        showToast(`Продано всі дублікати! Отримано ${data.earned} монет.`, 'success');
      }
    } catch (e) {
      showToast(e.message || 'Помилка під час масового продажу інвентарю.');
    } finally {
      actionLock.current = false;
      setIsProcessing(false);
    }
  };

  // --- ЛОГІКА ВІТРИН ---
  const createShowcase = async (name) => {
    if (!name.trim()) return showToast('Введіть назву вітрини!');
    if (showcases.length >= 5 && !profile.isSuperAdmin)
      return showToast('Досягнуто ліміт вітрин (5 шт).');
    try {
      const data = await createShowcaseRequest(getToken(), name.trim());
      setShowcases((prev) => [...prev, data.showcase]);
      showToast('Вітрину успішно створено!', 'success');
    } catch (e) {
      showToast(e.message || 'Помилка створення вітрини.');
    }
  };

  const deleteShowcase = async (showcaseId) => {
    if (!confirm('Видалити цю вітрину? Картки залишаться у вашому інвентарі.')) return;
    try {
      await deleteShowcaseRequest(getToken(), showcaseId);
      setShowcases((prev) => prev.filter((s) => s.id !== showcaseId));
      if (profile.mainShowcaseId === showcaseId) {
        setProfile((prev) => ({ ...prev, mainShowcaseId: null }));
      }
      showToast('Вітрину видалено.', 'success');
    } catch (e) {
      showToast(e.message || 'Помилка видалення.');
    }
  };

  const setMainShowcase = async (showcaseId) => {
    try {
      const data = await setMainShowcaseRequest(getToken(), showcaseId);
      setProfile((prev) => ({ ...data.profile, autoSoundEnabled: prev?.autoSoundEnabled }));
      showToast(showcaseId ? 'Головну вітрину оновлено!' : 'Головну вітрину знято.', 'success');
    } catch (e) {
      showToast('Помилка оновлення вітрини.');
    }
  };

  const saveShowcaseCards = async (showcaseId, newCardIds) => {
    try {
      await saveShowcaseCardsRequest(getToken(), showcaseId, newCardIds);
      setShowcases((prev) =>
        prev.map((s) => (s.id === showcaseId ? { ...s, cardIds: newCardIds } : s))
      );
      showToast('Картки збережено!', 'success');
    } catch (e) {
      showToast(e.message || 'Помилка збереження карток у вітрині.');
    }
  };

  // --- ЕКРАНИ ---
  if (dbError && user !== undefined)
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-6 text-center text-white">
        <div className="bg-red-950/40 border-2 border-red-900 p-8 rounded-3xl max-w-lg w-full">
          <h1 className="text-2xl font-black mb-4 uppercase">Помилка</h1>
          <p className="mb-6">{dbError}</p>
          {(!user || needsRegistration) && (
            <button
              onClick={() => {
                setDbError('');
                setLoading(false);
              }}
              className="bg-neutral-800 px-6 py-3 rounded-xl font-bold"
            >
              Спробувати ще раз
            </button>
          )}
        </div>
      </div>
    );

  if (profile?.isBanned)
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-6 text-center text-white">
        <div className="bg-red-950/30 border-2 border-red-900/50 p-10 rounded-3xl max-w-md w-full animate-in zoom-in-95">
          <h1 className="text-4xl font-black mb-2 text-white">ВИ ЗАБАНЕНІ</h1>
          <p className="text-red-400 font-bold uppercase mb-6 text-sm">Доступ обмежено</p>

          <div className="bg-black/40 rounded-xl p-4 mb-8 text-left space-y-3">
            <div>
              <span className="text-xs text-neutral-500 font-bold block uppercase mb-0.5">
                Причина блокування:
              </span>
              <span className="text-white font-medium">
                {profile.banReason || 'Причина не вказана'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-neutral-500 font-bold block uppercase mb-0.5">
                  Адміністратор:
                </span>
                <span className="text-white font-medium">
                  {profile.bannedBy || 'Адміністратор'}
                </span>
              </div>
              <div>
                <span className="text-xs text-neutral-500 font-bold block uppercase mb-0.5">
                  Бан діє до:
                </span>
                <span className="text-white font-medium">
                  {profile.banUntil ? new Date(profile.banUntil).toLocaleString() : 'Назавжди'}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full bg-neutral-900 hover:bg-neutral-800 transition-colors text-white font-bold py-4 rounded-xl border border-neutral-800"
          >
            Вийти з акаунту
          </button>
        </div>
      </div>
    );

  if (loading || user === undefined)
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center text-yellow-500">
        <Loader2 className="animate-spin w-16 h-16 mb-4" />
      </div>
    );

  if (!user || needsRegistration) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4 font-sans text-neutral-100 relative overflow-hidden">
        {toastMsg.text && (
          <div
            className={`fixed top-20 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full flex items-center gap-2 shadow-lg z-[100] text-white font-medium ${toastMsg.type === 'success' ? 'bg-green-600' : 'bg-red-900'}`}
          >
            {toastMsg.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}{' '}
            {toastMsg.text}
          </div>
        )}
        <div className="bg-neutral-900 p-8 rounded-3xl max-w-md w-full relative z-10">
          <h1 className="text-3xl font-black mb-6 text-center text-white">
            {authMode === 'login'
              ? 'Вхід'
              : authMode === 'register'
                ? 'Реєстрація'
                : authMode === 'resetPassword'
                  ? 'Встановлення паролю'
                  : 'Відновлення паролю'}
          </h1>
          <form id="auth-form" onSubmit={handleAuthSubmit} className="space-y-4">
            {authMode === 'register' && (
              <input
                type="text"
                name="nickname"
                required
                placeholder="Нікнейм"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-xl p-4 text-white focus:border-yellow-500 outline-none"
              />
            )}
            {authMode !== 'resetPassword' && (
              <input
                type="email"
                name="email"
                required
                placeholder="Електронна пошта"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-xl p-4 text-white focus:border-yellow-500 outline-none"
              />
            )}
            {authMode !== 'forgotPassword' && (
              <input
                type="password"
                name="password"
                required
                placeholder="Пароль"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-xl p-4 text-white focus:border-yellow-500 outline-none"
                minLength="6"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') document.getElementById('auth-submit-btn').click();
                }}
              />
            )}
            <button
              id="auth-submit-btn"
              type="submit"
              className="w-full bg-yellow-500 hover:bg-yellow-400 text-yellow-950 font-black py-4 px-4 rounded-xl mt-4"
            >
              {authMode === 'login'
                ? 'Увійти в гру'
                : authMode === 'register'
                  ? 'Створити акаунт'
                  : authMode === 'resetPassword'
                    ? 'Зберегти новий пароль'
                    : 'Відновити пароль'}
            </button>
          </form>
          <div className="mt-4 flex justify-center w-full">
            <GoogleLogin
              onSuccess={async (credentialResponse) => {
                setLoading(true);
                setDbError('');
                try {
                  const data = await googleLoginRequest(credentialResponse.credential);
                  setToken(data.token);
                  const autoSound = localStorage.getItem('autoSoundEnabled');
                  if (autoSound !== null) data.user.autoSoundEnabled = autoSound === 'true';
                  setUser({ uid: data.user.uid, email: data.user.email });
                  setProfile(data.user);
                  setNeedsRegistration(false);
                } catch (err) {
                  showToast(err.message || 'Помилка входу через Google.');
                }
                setLoading(false);
              }}
              onError={() => {
                setDbError('Помилка підключення до Google.');
              }}
              theme="filled_black"
              shape="pill"
              size="large"
              text="continue_with"
              width="100%"
            />
          </div>
          <div className="w-full flex flex-col gap-2 mt-6">
            <button
              onClick={() => {
                window.history.replaceState({}, document.title, '/');
                setAuthMode(authMode === 'login' ? 'register' : 'login');
                setDbError('');
              }}
              className="text-neutral-400 font-bold"
            >
              {authMode === 'login' ? 'Немає акаунту? Зареєструватися' : 'Вже є акаунт? Увійти'}
            </button>
            {(authMode === 'login' || authMode === 'register') && (
              <button
                onClick={() => {
                  setAuthMode('forgotPassword');
                  setDbError('');
                }}
                className="text-neutral-500 hover:text-white transition-colors text-sm"
              >
                Забули пароль?
              </button>
            )}
            {(authMode === 'forgotPassword' || authMode === 'resetPassword') && (
              <button
                onClick={() => {
                  window.history.replaceState({}, document.title, '/');
                  setAuthMode('login');
                  setDbError('');
                }}
                className="text-neutral-500 hover:text-white transition-colors text-sm"
              >
                Повернутись до входу
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const fullInventory = dbInventory
    .map((item) => {
      const cardData = cardsCatalog.find((c) => c.id === item.id);
      let parsedStats = item.gameStats || [];
      if (typeof parsedStats === 'string') {
        try {
          parsedStats = JSON.parse(parsedStats);
        } catch (e) {
          parsedStats = [];
        }
      }
      return cardData && item.amount > 0
        ? { card: cardData, amount: item.amount, gameStats: parsedStats }
        : null;
    })
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans pb-24 relative overflow-x-hidden flex flex-col">
      <header className="bg-neutral-900 border-b border-neutral-800 sticky top-0 z-50 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex justify-between items-center">
          <div
            className="flex items-center gap-2 sm:gap-3 text-white font-black text-lg tracking-wider cursor-pointer"
            onClick={() => setCurrentView('shop')}
          >
            <img
              src={logo1}
              alt="Card Game Logo"
              className="w-10 h-10 object-contain rounded-xl"
              loading="lazy"
            />
            <span className="hidden sm:block">Card Game</span>
          </div>

          <div className="flex items-center gap-3 sm:gap-6">
            <button
              onClick={() => setCurrentView('profile')}
              className="flex items-center gap-3 hover:bg-neutral-800 p-1.5 pr-3 rounded-full text-left"
            >
              <PlayerAvatar profile={profile} className="w-10 h-10 rounded-full" iconSize={20} />
              <div className="hidden md:block text-left">
                <div className="font-bold text-sm text-white flex items-center gap-1">
                  {profile?.nickname}
                  <span className="bg-red-900/50 text-red-400 text-[10px] px-1.5 py-0.5 rounded-md border border-red-800 flex items-center gap-0.5 ml-1">
                    <Swords size={10} /> {profile?.farmLevel || 1}
                  </span>
                </div>
                <div className="text-xs text-neutral-400">
                  {isPremiumActive ? (
                    <span className="text-fuchsia-400 font-bold">Преміум</span>
                  ) : (
                    'Профіль'
                  )}
                </div>
              </div>
            </button>

            <div className="flex items-center gap-2 sm:gap-4">
              {canClaimDaily && (
                <button
                  onClick={() => setCurrentView('profile')}
                  className="bg-orange-500/20 text-orange-400 p-2.5 rounded-xl border border-orange-500/30"
                >
                  <Gift size={20} />
                </button>
              )}

              <button
                onClick={() => setShowNotifications(true)}
                className="relative bg-neutral-950 p-2.5 rounded-xl border border-neutral-800 text-neutral-400 hover:text-white transition-colors"
                title="Сповіщення"
              >
                <Mail size={20} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border border-neutral-900 shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              <button
                onClick={toggleAutoSound}
                className="bg-neutral-950 p-2.5 rounded-xl border border-neutral-800 text-neutral-400 hover:text-white transition-colors"
                title={
                  profile?.autoSoundEnabled !== false
                    ? 'Вимкнути автозвук карток'
                    : 'Увімкнути автозвук карток'
                }
              >
                {profile?.autoSoundEnabled !== false ? (
                  <Volume2 size={20} />
                ) : (
                  <VolumeX size={20} />
                )}
              </button>

              <div className="bg-neutral-950 px-4 py-2 rounded-xl border border-neutral-800 flex gap-2 items-center">
                <Coins size={18} className="text-yellow-500" />
                <span className="text-yellow-500 font-black">{profile?.coins}</span>
              </div>
              <div className="bg-neutral-950 px-4 py-2 rounded-xl border border-neutral-800 flex gap-2 items-center">
                <Gem size={18} className="text-fuchsia-500" />
                <span className="text-fuchsia-500 font-black">{profile?.crystals || 0}</span>
              </div>
              <button
                onClick={() => setCurrentView('premium')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border bg-neutral-950 border-neutral-800 text-fuchsia-400"
              >
                <Gem size={18} /> <span className="hidden sm:block font-bold text-sm">Преміум</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {toastMsg.text && (
        <div
          className={`fixed top-20 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full flex items-center gap-2 shadow-lg z-50 text-white font-medium ${toastMsg.type === 'success' ? 'bg-green-600' : 'bg-red-900'}`}
        >
          {toastMsg.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}{' '}
          {toastMsg.text}
        </div>
      )}

      <main className="max-w-5xl w-full mx-auto p-4 mt-4 flex-grow">
        {currentView === 'farm' && (
          <FarmView
            profile={profile}
            setProfile={setProfile}
            cardsCatalog={cardsCatalog}
            showToast={showToast}
            bosses={bosses}
            rarities={rarities}
            wordleEntryCost={wordleEntryCost}
          />
        )}
        {currentView === 'shop' && (
          <ShopView
            profile={profile}
            cardStats={cardStats}
            packs={packsCatalog}
            cardsCatalog={cardsCatalog}
            rarities={rarities}
            openPack={openPack}
            openingPackId={openingPackId}
            isRouletteSpinning={isRouletteSpinning}
            rouletteItems={rouletteItems}
            pulledCards={pulledCards}
            setPulledCards={setPulledCards}
            sellPulledCards={sellPulledCards}
            sellSinglePulledCard={sellSinglePulledCard}
            selectedPackId={selectedPackId}
            setSelectedPackId={setSelectedPackId}
            setViewingCard={setViewingCard}
            isPremiumActive={isPremiumActive}
            isAdmin={profile?.isAdmin}
            isProcessing={isProcessing}
            statsRanges={statsRanges}
          />
        )}
        {currentView === 'premium' && (
          <PremiumShopView
            profile={profile}
            setProfile={setProfile}
            user={user}
            premiumPrice={premiumPrice}
            premiumDurationDays={premiumDurationDays}
            premiumShopItems={premiumShopItems}
            showToast={showToast}
            isProcessing={isProcessing}
            setIsProcessing={setIsProcessing}
            addSystemLog={addSystemLog}
            isPremiumActive={isPremiumActive}
            cardsCatalog={cardsCatalog}
            setViewingCard={setViewingCard}
            rarities={rarities}
            cardStats={cardStats}
          />
        )}
        {currentView === 'inventory' && (
          <InventoryView
            inventory={fullInventory}
            rarities={rarities}
            catalogTotal={cardsCatalog.length}
            setViewingCard={setViewingCard}
            setListingCard={setListingCard}
            packsCatalog={packsCatalog}
            showcases={showcases}
            profile={profile}
            cardsCatalog={cardsCatalog}
            cardStats={cardStats}
            sellDuplicate={sellDuplicate}
            sellAllDuplicates={sellAllDuplicates}
            sellEveryDuplicate={sellEveryDuplicate}
            toggleSafe={toggleSafe}
            sellPrice={SELL_PRICE}
            deleteShowcase={deleteShowcase}
            setMainShowcase={setMainShowcase}
            saveShowcaseCards={saveShowcaseCards}
          />
        )}
        {currentView === 'forge' && (
          <ForgeView
            inventory={fullInventory}
            cardsCatalog={cardsCatalog}
            packsCatalog={packsCatalog}
            rarities={rarities}
            profile={profile}
            showToast={showToast}
            getToken={getToken}
            reloadProfile={reloadProfile}
          />
        )}
        {currentView === 'market' && (
          <MarketView
            marketListings={marketListings}
            cardsCatalog={cardsCatalog}
            rarities={rarities}
            currentUserUid={user.uid}
            setViewingCard={setViewingCard}
            isAdmin={profile?.isAdmin}
            buyFromMarket={buyFromMarket}
            cancelMarketListing={cancelMarketListing}
            reloadMarket={reloadMarket}
          />
        )}
        {currentView === 'profile' && (
          <ProfileView
            profile={profile}
            setProfile={setProfile}
            user={user}
            handleLogout={handleLogout}
            showToast={showToast}
            inventoryCount={fullInventory.length}
            canClaimDaily={canClaimDaily}
            dailyRewards={dailyRewards}
            premiumDailyRewards={premiumDailyRewards}
            isPremiumActive={isPremiumActive}
            showcases={showcases}
            cardsCatalog={cardsCatalog}
            rarities={rarities}
            fullInventory={fullInventory}
            setViewingCard={setViewingCard}
            cardStats={cardStats}
            achievementsCatalog={achievementsCatalog}
            packsCatalog={packsCatalog}
          />
        )}
        {currentView === 'rating' && (
          <RatingView
            currentUid={user.uid}
            setViewingPlayerProfile={(uid) => {
              setViewingPlayerProfile(uid);
              setCurrentView('publicProfile');
            }}
          />
        )}
        {currentView === 'publicProfile' && viewingPlayerProfile && (
          <PublicProfileView
            targetUid={viewingPlayerProfile}
            goBack={() => setCurrentView('rating')}
            cardsCatalog={cardsCatalog}
            rarities={rarities}
            setViewingCard={setViewingCard}
            packsCatalog={packsCatalog}
            cardStats={cardStats}
            achievementsCatalog={achievementsCatalog}
          />
        )}
        {currentView === 'admin' && (profile?.isAdmin || profile?.isSuperAdmin) && (
          <AdminView
            reloadSettings={reloadSettings}
            currentProfile={profile}
            setProfile={setProfile}
            cardsCatalog={cardsCatalog}
            packsCatalog={packsCatalog}
            setCardsCatalog={setCardsCatalog}
            setPacksCatalog={setPacksCatalog}
            rarities={rarities}
            showToast={showToast}
            addSystemLog={addSystemLog}
            dailyRewards={dailyRewards}
            premiumDailyRewards={premiumDailyRewards}
            premiumPrice={premiumPrice}
            premiumDurationDays={premiumDurationDays}
            premiumShopItems={premiumShopItems}
            setViewingPlayerProfile={setViewingPlayerProfile}
            setCurrentView={setCurrentView}
            setViewingCard={setViewingCard}
            bosses={bosses}
            setBosses={setBosses}
            wordleEntryCost={wordleEntryCost}
          />
        )}
      </main>

      <footer className="w-full text-center text-neutral-600 text-xs py-8 mt-auto px-4 relative z-10">
        <p>&copy; {new Date().getFullYear()} Card Game. Всі права захищені.</p>
        <div className="flex justify-center gap-4 mt-2">
          <button
            onClick={() => setShowTerms(true)}
            className="hover:text-neutral-300 transition-colors"
          >
            Правила користування
          </button>
          <button
            onClick={() => setShowPrivacy(true)}
            className="hover:text-neutral-300 transition-colors"
          >
            Політика конфіденційності
          </button>
        </div>
      </footer>

      {showTerms && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-700 rounded-3xl p-6 md:p-8 max-w-lg w-full relative shadow-2xl">
            <h2 className="text-2xl font-black text-white mb-4">Правила користування</h2>
            <div className="text-neutral-300 text-sm space-y-3 mb-6">
              <p>Ця гра створена виключно з розважальною метою.</p>
              <p>
                1. Усі ігрові цінності (монети, картки, преміум-статуси тощо) не мають реальної
                грошової вартості і не можуть бути продані за реальні фіатні гроші.
              </p>
              <p>
                2. Адміністрація залишає за собою право блокувати акаунти за порушення правил:
                використання стороннього ПЗ, ботів, використання багів, образи інших гравців або
                спроби шахрайства.
              </p>
              <p>
                3. Адміністрація не несе відповідальності за втрату акаунту або ігрового майна
                внаслідок передачі реєстраційних даних третім особам.
              </p>
              <p>
                4. Гра та її правила можуть бути змінені або доповнені адміністрацією в будь-який
                час.
              </p>
              <p>Продовжуючи грати, ви автоматично погоджуєтесь із цими умовами.</p>
            </div>
            <button
              onClick={() => setShowTerms(false)}
              className="w-full bg-yellow-500 hover:bg-yellow-400 text-yellow-950 text-base font-black py-3 rounded-xl transition-colors"
            >
              Зрозуміло
            </button>
          </div>
        </div>
      )}

      {showPrivacy && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-700 rounded-3xl p-6 md:p-8 max-w-lg w-full relative shadow-2xl">
            <h2 className="text-2xl font-black text-white mb-4">Політика конфіденційності</h2>
            <div className="text-neutral-300 text-sm space-y-3 mb-6">
              <p>
                Ми відповідально ставимося до ваших даних і збираємо лише необхідний мінімум для
                функціонування гри.
              </p>
              <p>
                1. <strong>Збір даних:</strong> Ми збираємо вашу електронну адресу (яку ви вказуєте
                при реєстрації або через Google) виключно для ідентифікації вашого акаунту та
                збереження прогресу.
              </p>
              <p>
                2. <strong>Захист даних:</strong> Ваші паролі зберігаються в базі даних виключно у
                зашифрованому вигляді. Ми не маємо доступу до ваших паролів.
              </p>
              <p>
                3. <strong>Використання:</strong> Ми не передаємо ваші персональні дані третім
                особам і не використовуємо їх для рекламних розсилок.
              </p>
              <p>
                4. <strong>Видалення:</strong> Ви маєте право запросити повне видалення вашого
                акаунту та всіх пов'язаних з ним ігрових даних, звернувшись до адміністрації.
              </p>
            </div>
            <button
              onClick={() => setShowPrivacy(false)}
              className="w-full bg-yellow-500 hover:bg-yellow-400 text-yellow-950 text-base font-black py-3 rounded-xl transition-colors"
            >
              Зрозуміло
            </button>
          </div>
        </div>
      )}

      {viewingCard && (
        <CardModal viewingCard={viewingCard} setViewingCard={setViewingCard} rarities={rarities} />
      )}
      {listingCard && (
        <ListingModal
          listingCard={listingCard}
          setListingCard={setListingCard}
          isProcessing={isProcessing}
          listOnMarket={listOnMarket}
        />
      )}
      {showNotifications && (
        <NotificationsModal
          notifications={notifications}
          setNotifications={setNotifications}
          onClose={() => setShowNotifications(false)}
          getToken={getToken}
          reloadProfile={reloadProfile}
          showToast={showToast}
        />
      )}

      <nav className="fixed bottom-0 w-full bg-neutral-900 border-t border-neutral-800 px-2 py-2 z-40 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] overflow-x-auto hide-scrollbar">
        <div className="min-w-max mx-auto flex justify-center sm:gap-2">
          <NavButton
            icon={<Swords size={22} />}
            label="Фарм"
            isActive={currentView === 'farm'}
            onClick={() => setCurrentView('farm')}
          />
          <NavButton
            icon={<PackageOpen size={22} />}
            label="Магазин"
            isActive={currentView === 'shop'}
            onClick={() => {
              setCurrentView('shop');
              setPulledCards([]);
              setSelectedPackId(null);
            }}
          />
          <NavButton
            icon={<LayoutGrid size={22} />}
            label="Інвентар"
            isActive={currentView === 'inventory'}
            onClick={() => {
              setCurrentView('inventory');
              reloadProfile(); // Примусово оновлюємо дані з сервера
            }}
          />
          <NavButton
            icon={<Hammer size={22} />}
            label="Кузня"
            isActive={currentView === 'forge'}
            onClick={() => {
              setCurrentView('forge');
              reloadProfile();
            }}
          />
          <NavButton
            icon={<Store size={22} />}
            label="Ринок"
            isActive={currentView === 'market'}
            onClick={() => {
              setCurrentView('market');
              reloadMarket(); // Викликаємо оновлення даних ринку
            }}
          />
          <NavButton
            icon={<Trophy size={22} />}
            label="Рейтинг"
            isActive={currentView === 'rating' || currentView === 'publicProfile'}
            onClick={() => setCurrentView('rating')}
          />
          <NavButton
            icon={<User size={22} />}
            label="Профіль"
            isActive={currentView === 'profile'}
            onClick={() => setCurrentView('profile')}
          />

          {(profile?.isAdmin || profile?.isSuperAdmin) && (
            <button
              onClick={() => setCurrentView('admin')}
              className={`flex flex-col items-center p-2 rounded-lg w-16 sm:w-20 transition-colors ${currentView === 'admin' ? 'text-purple-500' : 'text-neutral-500'}`}
            >
              <Shield size={22} />
              <span className="text-[9px] sm:text-[10px] mt-1 font-bold uppercase tracking-wider">
                Адмінка
              </span>
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}
