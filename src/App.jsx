import React, { useState, useEffect, useRef } from "react";
import {
  Coins, PackageOpen, LayoutGrid, AlertCircle, Loader2, Mail, User,
  CheckCircle2, Shield, KeyRound, Trophy, Store, Hexagon, Gem, Swords, Gift, Volume2, VolumeX
} from "lucide-react";

import { loginUser, createAdminLogRequest, registerUser, googleLoginRequest, setToken, removeToken, setMainShowcaseRequest, fetchCatalog, openPackRequest, getToken, sellCardsRequest, fetchMarket, listCardRequest, buyCardRequest, cancelListingRequest, fetchSettings, createShowcaseRequest, deleteShowcaseRequest, saveShowcaseCardsRequest } from "./config/api";
import { GoogleLogin } from '@react-oauth/google';
import { getGlobalTime, isToday } from "./utils/helpers";
import { DEFAULT_PACKS, DEFAULT_BOSSES, DEFAULT_RARITIES, SELL_PRICE } from "./config/constants";

import PlayerAvatar from "./components/PlayerAvatar";
import CardModal from "./components/CardModal";
import ListingModal from "./components/ListingModal";
import NavButton from "./components/NavButton";

import FarmView from "./views/FarmView";
import ShopView from "./views/ShopView";
import PremiumShopView from "./views/PremiumShopView";
import InventoryView from "./views/InventoryView";
import MarketView from "./views/MarketView";
import ProfileView from "./views/ProfileView";
import RatingView from "./views/RatingView";
import PublicProfileView from "./views/PublicProfileView";
import AdminView from "./views/AdminView";

export default function App() {
  const [user, setUser] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [dbInventory, setDbInventory] = useState([]);
  const [marketListings, setMarketListings] = useState([]);
  const [showcases, setShowcases] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isProcessing, setIsProcessing] = useState(false);
  const actionLock = useRef(false);

  const [needsRegistration, setNeedsRegistration] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [dbError, setDbError] = useState("");

  const [bosses, setBosses] = useState([]);
  const [cardsCatalog, setCardsCatalog] = useState([]);
  const [packsCatalog, setPacksCatalog] = useState([]);
  const [cardStats, setCardStats] = useState({});
  const [rarities, setRarities] = useState(DEFAULT_RARITIES);
  const [dailyRewards, setDailyRewards] = useState([1000, 2000, 3000, 4000, 5000, 6000, 7000]);
  const [premiumDailyRewards, setPremiumDailyRewards] = useState([2000, 4000, 6000, 8000, 10000, 12000, 15000]);
  const [premiumPrice, setPremiumPrice] = useState(10000);
  const [premiumDurationDays, setPremiumDurationDays] = useState(30);
  const [premiumShopItems, setPremiumShopItems] = useState([]);

  const [currentView, setCurrentView] = useState("shop");
  const [selectedPackId, setSelectedPackId] = useState(null);
  const [openingPackId, setOpeningPackId] = useState(null);
  const [isRouletteSpinning, setIsRouletteSpinning] = useState(false);
  const [rouletteItems, setRouletteItems] = useState([]);
  const [pulledCards, setPulledCards] = useState([]);
  const [viewingCard, setViewingCard] = useState(null);
  const [viewingPlayerProfile, setViewingPlayerProfile] = useState(null);
  const [toastMsg, setToastMsg] = useState({ text: "", type: "" });
  const [listingCard, setListingCard] = useState(null);

  const canClaimDaily = profile && !isToday(profile.lastDailyClaim);

  const checkIsPremiumActive = (prof) => {
    if (!prof || !prof.isPremium || !prof.premiumUntil) return false;
    const d = new Date(prof.premiumUntil);
    return !isNaN(d) && d > new Date();
  };
  const isPremiumActive = checkIsPremiumActive(profile);

  useEffect(() => { document.title = "Card Game"; }, []);

  const addSystemLog = async (type, details) => {
    try {
        await createAdminLogRequest(getToken(), type, details);
    } catch (e) { console.error("Помилка логування:", e); }
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
      const token = localStorage.getItem('token');

      if (!token) {
        setUser(null);
        setNeedsRegistration(true);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch('https://cardgameapp.space/api/profile', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
          const userData = await res.json();
          setUser({ uid: userData.uid, email: userData.email });
          setProfile(userData);
          if (userData.inventory) {
            setDbInventory(userData.inventory.map(i => ({ id: i.cardId, amount: i.amount })));
          }
          if (userData.showcases) {
            setShowcases(userData.showcases);
          }
          setNeedsRegistration(false);
        } else {
          throw new Error('Токен застарів або недійсний');
        }
      } catch (error) {
        console.error("Помилка авторизації:", error);
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
      setDailyRewards(settings.dailyRewards || [1000, 2000, 3000, 4000, 5000, 6000, 7000]);
      setPremiumDailyRewards(settings.premiumDailyRewards || [2000, 4000, 6000, 8000, 10000, 12000, 15000]);
      setPremiumPrice(settings.premiumPrice !== undefined ? settings.premiumPrice : 10000);
      setPremiumDurationDays(settings.premiumDurationDays !== undefined ? settings.premiumDurationDays : 30);
      setPremiumShopItems(settings.premiumShopItems || []);
    } catch (e) { console.error("Помилка завантаження налаштувань:", e); }
  };

  useEffect(() => {
    const loadMySqlData = async () => {
      try {
        const { cards, packs } = await fetchCatalog();
        setCardsCatalog(cards || []);
        setPacksCatalog(packs || []);

        // Генеруємо статистику з MySQL бази
        if (cards && cards.length > 0) {
            const stats = {};
            cards.forEach(c => { stats[c.id] = c.pulledCount || 0; });
            setCardStats(stats);
        }

        const marketData = await fetchMarket();
        setMarketListings(marketData || []);

        await reloadSettings();
      } catch (err) {
        console.error("Помилка завантаження даних MySQL", err);
      }
    };
    loadMySqlData();
  }, []);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    const email = e.target.email.value.trim();
    const password = e.target.password.value;
    setLoading(true); setDbError("");

    try {
      if (authMode === "register") {
        const nickname = e.target.nickname.value.trim();
        if (!nickname) throw new Error("Введіть нікнейм!");
        const data = await registerUser(nickname, email, password);
        setToken(data.token);
        setUser({ uid: data.user.uid, email: data.user.email });
        setProfile(data.user);
      } else {
        const data = await loginUser(email, password);
        setToken(data.token);
        setUser({ uid: data.user.uid, email: data.user.email });
        setProfile(data.user);
      }
      setNeedsRegistration(false);
    } catch (err) {
      setDbError(err.message);
    }
    setLoading(false);
  };

  const toggleAutoSound = async () => {
    if (!user || actionLock.current) return;
    const newValue = profile?.autoSoundEnabled === false ? true : false;
    setProfile(prev => ({ ...prev, autoSoundEnabled: newValue }));
    showToast(newValue ? "Автозвук увімкнено" : "Автозвук вимкнено", "success");
  };

  const handleLogout = async () => {
    setLoading(true);
    localStorage.removeItem('token');
    setUser(null);
    setProfile(null);
    setDbInventory([]);
    setShowcases([]);
    setCurrentView("shop");
    setAuthMode("login");
    setNeedsRegistration(true);
    setLoading(false);
  };

  const showToast = (msg, type = "error") => {
    setToastMsg({ text: msg, type });
    setTimeout(() => setToastMsg({ text: "", type: "" }), 3000);
  };

  const reloadMarket = async () => {
    try {
      const marketData = await fetchMarket();
      setMarketListings(marketData || []);
    } catch (e) { console.error(e); }
  };

  const listOnMarket = async (cardId, price) => {
    if (actionLock.current) return;
    actionLock.current = true; setIsProcessing(true);
    try {
      const data = await listCardRequest(getToken(), cardId, price);
      setProfile(prev => ({ ...data.profile, autoSoundEnabled: prev?.autoSoundEnabled }));
      setDbInventory(data.profile.inventory.map(i => ({ id: i.cardId, amount: i.amount })));
      showToast("Картку успішно виставлено на Ринок!", "success");
      setListingCard(null);
      await reloadMarket();
    } catch (e) {
      showToast(`Помилка: ${e.message}`);
    } finally { actionLock.current = false; setIsProcessing(false); }
  };

  const buyFromMarket = async (listing) => {
    if (actionLock.current) return;
    actionLock.current = true; setIsProcessing(true);
    try {
      const data = await buyCardRequest(getToken(), listing.id);
      setProfile(prev => ({ ...data.profile, autoSoundEnabled: prev?.autoSoundEnabled }));
      setDbInventory(data.profile.inventory.map(i => ({ id: i.cardId, amount: i.amount })));
      showToast(`Картку успішно придбано за ${listing.price} монет!`, "success");
      await reloadMarket();
    } catch (e) {
      showToast(e.message || "Помилка покупки.");
    } finally { actionLock.current = false; setIsProcessing(false); }
  };

  const cancelMarketListing = async (listing) => {
    if (actionLock.current) return;
    actionLock.current = true; setIsProcessing(true);
    try {
      const data = await cancelListingRequest(getToken(), listing.id);
      setProfile(prev => ({ ...data.profile, autoSoundEnabled: prev?.autoSoundEnabled }));
      setDbInventory(data.profile.inventory.map(i => ({ id: i.cardId, amount: i.amount })));
      showToast(listing.sellerUid === user.uid ? "Лот знято з продажу." : "Лот примусово видалено.", "success");
      await reloadMarket();
    } catch (e) {
      showToast(e.message || "Помилка скасування лоту.");
    } finally { actionLock.current = false; setIsProcessing(false); }
  };

  const openPack = async (packId, cost, amountToOpen = 1) => {
    if (actionLock.current || !profile || openingPackId || isRouletteSpinning) return;
    actionLock.current = true; setIsProcessing(true);

    try {
      const totalCost = cost * amountToOpen;
      if (profile.coins < totalCost) { showToast("Недостатньо монет!"); actionLock.current = false; setIsProcessing(false); return; }

      setOpeningPackId(packId);
      setPulledCards([]);

      try {
        const data = await openPackRequest(getToken(), packId, amountToOpen);
        const results = data.pulledCards;

        if (amountToOpen === 1) {
          const availablePackCards = cardsCatalog.filter((c) => c.packId === packId);
          const fakeCards = Array.from({ length: 45 }, () => availablePackCards[Math.floor(Math.random() * availablePackCards.length)]);
          fakeCards[35] = results[0];
          setRouletteItems(fakeCards);
          setIsRouletteSpinning(true);
          setOpeningPackId(null);

          setTimeout(() => {
            setIsRouletteSpinning(false);
            setPulledCards(results);
            setProfile(prev => ({ ...data.profile, autoSoundEnabled: prev?.autoSoundEnabled }));
            setDbInventory(data.profile.inventory.map(i => ({ id: i.cardId, amount: i.amount })));
            actionLock.current = false; setIsProcessing(false);
          }, 5000);
        } else {
          setOpeningPackId(null);
          setPulledCards(results);
          setProfile(prev => ({ ...data.profile, autoSoundEnabled: prev?.autoSoundEnabled }));
          setDbInventory(data.profile.inventory.map(i => ({ id: i.cardId, amount: i.amount })));
          actionLock.current = false; setIsProcessing(false);
        }
      } catch (err) {
        console.error(err); showToast(`Помилка: ${err.message}`);
        setOpeningPackId(null); actionLock.current = false; setIsProcessing(false);
      }
    } catch (e) {
      actionLock.current = false; setIsProcessing(false);
    }
  };

  const sellPulledCards = async () => {
    if (actionLock.current || pulledCards.length === 0) return;
    actionLock.current = true; setIsProcessing(true);

    const cardsToSell = [...pulledCards];
    setPulledCards([]);

    const countsMap = {};
    cardsToSell.forEach(c => { countsMap[c.id] = (countsMap[c.id] || 0) + 1; });
    const itemsToSell = Object.entries(countsMap).map(([id, amount]) => ({ cardId: id, amount }));

    try {
      const data = await sellCardsRequest(getToken(), itemsToSell);
      setProfile(prev => ({ ...data.profile, autoSoundEnabled: prev?.autoSoundEnabled }));
      setDbInventory(data.profile.inventory.map(i => ({ id: i.cardId, amount: i.amount })));
      showToast(`Успішно продано всі отримані картки! Отримано ${data.earned} монет.`, "success");
    } catch (e) {
      showToast(e.message || "Помилка продажу карток.");
      setPulledCards(cardsToSell);
    }
    finally { actionLock.current = false; setIsProcessing(false); }
  };

  const sellDuplicate = async (cardId) => {
    if (actionLock.current) return;
    actionLock.current = true; setIsProcessing(true);

    try {
      const data = await sellCardsRequest(getToken(), [{ cardId, amount: 1 }]);
      setProfile(prev => ({ ...data.profile, autoSoundEnabled: prev?.autoSoundEnabled }));
      setDbInventory(data.profile.inventory.map(i => ({ id: i.cardId, amount: i.amount })));
      showToast(`Продано за ${data.earned} монет!`, "success");
    } catch (e) { showToast(e.message || "Помилка під час продажу."); }
    finally { actionLock.current = false; setIsProcessing(false); }
  };

  const sellAllDuplicates = async (cardId) => {
    if (actionLock.current) return;
    actionLock.current = true; setIsProcessing(true);

    try {
      const existing = dbInventory.find((i) => i.id === cardId);
      if (!existing || existing.amount <= 1) { actionLock.current = false; setIsProcessing(false); return; }

      const sellCount = existing.amount - 1;
      const data = await sellCardsRequest(getToken(), [{ cardId, amount: sellCount }]);
      setProfile(prev => ({ ...data.profile, autoSoundEnabled: prev?.autoSoundEnabled }));
      setDbInventory(data.profile.inventory.map(i => ({ id: i.cardId, amount: i.amount })));
      showToast(`Продано ${sellCount} шт. за ${data.earned} монет!`, "success");
    } catch (e) { showToast(e.message || "Помилка під час масового продажу."); }
    finally { actionLock.current = false; setIsProcessing(false); }
  };

  const sellEveryDuplicate = async (specificInventory = null) => {
    if (actionLock.current) return;
    actionLock.current = true; setIsProcessing(true);

    try {
      const baseList = specificInventory || dbInventory.map(item => {
        const cardData = cardsCatalog.find((c) => c.id === item.id);
        return cardData && item.amount > 0 ? { card: cardData, amount: item.amount } : null;
      }).filter(Boolean);

      const duplicates = baseList.filter(item => item.amount > 1);
      if (duplicates.length === 0) { showToast("Немає дублікатів для продажу!", "error"); actionLock.current = false; setIsProcessing(false); return; }

      const itemsToSell = duplicates.map(item => ({ cardId: item.card?.id || item.id, amount: item.amount - 1 }));

      const data = await sellCardsRequest(getToken(), itemsToSell);
      setProfile(prev => ({ ...data.profile, autoSoundEnabled: prev?.autoSoundEnabled }));
      setDbInventory(data.profile.inventory.map(i => ({ id: i.cardId, amount: i.amount })));
      showToast(`Продано всі дублікати! Отримано ${data.earned} монет.`, "success");
    } catch (e) { showToast(e.message || "Помилка під час масового продажу інвентарю."); }
    finally { actionLock.current = false; setIsProcessing(false); }
  };

  // --- ЛОГІКА ВІТРИН ---
  const createShowcase = async (name) => {
    if (!name.trim()) return showToast("Введіть назву вітрини!");
    if (showcases.length >= 5 && !profile.isSuperAdmin) return showToast("Досягнуто ліміт вітрин (5 шт).");
    try {
      const data = await createShowcaseRequest(getToken(), name.trim());
      setShowcases(prev => [...prev, data.showcase]);
      showToast("Вітрину успішно створено!", "success");
    } catch (e) { showToast(e.message || "Помилка створення вітрини."); }
  };

  const deleteShowcase = async (showcaseId) => {
    if (!confirm("Видалити цю вітрину? Картки залишаться у вашому інвентарі.")) return;
    try {
      await deleteShowcaseRequest(getToken(), showcaseId);
      setShowcases(prev => prev.filter(s => s.id !== showcaseId));
      if (profile.mainShowcaseId === showcaseId) {
        setProfile(prev => ({ ...prev, mainShowcaseId: null }));
      }
      showToast("Вітрину видалено.", "success");
    } catch (e) { showToast(e.message || "Помилка видалення."); }
  };

  const setMainShowcase = async (showcaseId) => {
    try {
      const data = await setMainShowcaseRequest(getToken(), showcaseId);
      setProfile(prev => ({ ...data.profile, autoSoundEnabled: prev?.autoSoundEnabled })); 
      showToast(showcaseId ? "Головну вітрину оновлено!" : "Головну вітрину знято.", "success");
    } catch (e) { showToast("Помилка оновлення вітрини."); }
  };

  const saveShowcaseCards = async (showcaseId, newCardIds) => {
    try {
      await saveShowcaseCardsRequest(getToken(), showcaseId, newCardIds);
      setShowcases(prev => prev.map(s => s.id === showcaseId ? { ...s, cardIds: newCardIds } : s));
      showToast("Картки збережено!", "success");
    } catch (e) { showToast(e.message || "Помилка збереження карток у вітрині."); }
  };

  // --- ЕКРАНИ ---
  if (dbError && user !== undefined) return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-6 text-center text-white">
      <div className="bg-red-950/40 border-2 border-red-900 p-8 rounded-3xl max-w-lg w-full">
        <h1 className="text-2xl font-black mb-4 uppercase">Помилка</h1>
        <p className="mb-6">{dbError}</p>
        {(!user || needsRegistration) && <button onClick={() => { setDbError(""); setLoading(false); }} className="bg-neutral-800 px-6 py-3 rounded-xl font-bold">Спробувати ще раз</button>}
      </div>
    </div>
  );

  if (profile?.isBanned) return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-6 text-center text-white">
      <div className="bg-red-950/30 border-2 border-red-900/50 p-10 rounded-3xl max-w-md w-full">
        <h1 className="text-4xl font-black mb-2 text-white">ВИ ЗАБАНЕНІ</h1>
        <p className="text-red-400 font-bold uppercase mb-8 text-sm">Доступ обмежено</p>
        <button onClick={handleLogout} className="w-full bg-neutral-900 text-white font-bold py-4 rounded-xl">Вийти з акаунту</button>
      </div>
    </div>
  );

  if (loading || user === undefined) return <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center text-yellow-500"><Loader2 className="animate-spin w-16 h-16 mb-4" /></div>;

  if (!user || needsRegistration) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4 font-sans text-neutral-100 relative overflow-hidden">
        <div className="bg-neutral-900 p-8 rounded-3xl max-w-md w-full relative z-10">
          <h1 className="text-3xl font-black mb-6 text-center text-white">{authMode === "login" ? "Вхід" : "Реєстрація"}</h1>
          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authMode === "register" && <input type="text" name="nickname" required placeholder="Нікнейм" className="w-full bg-neutral-950 border border-neutral-700 rounded-xl p-4 text-white focus:border-yellow-500 outline-none" />}
            <input type="email" name="email" required placeholder="Електронна пошта" className="w-full bg-neutral-950 border border-neutral-700 rounded-xl p-4 text-white focus:border-yellow-500 outline-none" />
            <input type="password" name="password" required placeholder="Пароль" className="w-full bg-neutral-950 border border-neutral-700 rounded-xl p-4 text-white focus:border-yellow-500 outline-none" minLength="6" />
            <button type="submit" className="w-full bg-yellow-500 hover:bg-yellow-400 text-yellow-950 font-black py-4 px-4 rounded-xl mt-4">{authMode === "login" ? "Увійти в гру" : "Створити акаунт"}</button>
          </form>
          <div className="mt-4 flex justify-center w-full">
            <GoogleLogin
              onSuccess={async (credentialResponse) => {
                setLoading(true); setDbError("");
                try {
                  const data = await googleLoginRequest(credentialResponse.credential);
                  setToken(data.token);
                  setUser({ uid: data.user.uid, email: data.user.email });
                  setProfile(data.user);
                  setNeedsRegistration(false);
                } catch (err) {
                  setDbError(err.message);
                }
                setLoading(false);
              }}
              onError={() => {
                setDbError("Помилка підключення до Google.");
              }}
              theme="filled_black"
              shape="pill"
              size="large"
              text="continue_with"
              width="100%"
            />
          </div>
          <button onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setDbError(""); }} className="w-full text-neutral-400 mt-6 font-bold">{authMode === "login" ? "Немає акаунту? Зареєструватися" : "Вже є акаунт? Увійти"}</button>
        </div>
      </div>
    );
  }

  const fullInventory = dbInventory.map((item) => {
    const cardData = cardsCatalog.find((c) => c.id === item.id);
    return cardData && item.amount > 0 ? { card: cardData, amount: item.amount } : null;
  }).filter(Boolean);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans pb-24 relative overflow-x-hidden">
      <header className="bg-neutral-900 border-b border-neutral-800 sticky top-0 z-50 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2 sm:gap-3 text-white font-black text-lg tracking-wider cursor-pointer" onClick={() => setCurrentView("shop")}>
            <div className="bg-gradient-to-br from-purple-600 to-blue-600 p-2 rounded-xl"><Hexagon className="text-white w-5 h-5" /></div>
            <span className="hidden sm:block">Card Game</span>
          </div>

          <div className="flex items-center gap-3 sm:gap-6">
            <button onClick={() => setCurrentView("profile")} className="flex items-center gap-3 hover:bg-neutral-800 p-1.5 pr-3 rounded-full text-left">
              <PlayerAvatar profile={profile} className="w-10 h-10 rounded-full" iconSize={20} />
              <div className="hidden md:block text-left">
                <div className="font-bold text-sm text-white flex items-center gap-1">
                  {profile?.nickname}
                  <span className="bg-red-900/50 text-red-400 text-[10px] px-1.5 py-0.5 rounded-md border border-red-800 flex items-center gap-0.5 ml-1"><Swords size={10} /> {profile?.farmLevel || 1}</span>
                </div>
                <div className="text-xs text-neutral-400">{isPremiumActive ? <span className="text-fuchsia-400 font-bold">Преміум</span> : "Профіль"}</div>
              </div>
            </button>

            <div className="flex items-center gap-2 sm:gap-4">
              {canClaimDaily && (
                <button onClick={() => setCurrentView("profile")} className="bg-orange-500/20 text-orange-400 p-2.5 rounded-xl border border-orange-500/30"><Gift size={20} /></button>
              )}

              <button onClick={toggleAutoSound} className="bg-neutral-950 p-2.5 rounded-xl border border-neutral-800 text-neutral-400 hover:text-white transition-colors" title={profile?.autoSoundEnabled !== false ? "Вимкнути автозвук карток" : "Увімкнути автозвук карток"}>
                {profile?.autoSoundEnabled !== false ? <Volume2 size={20} /> : <VolumeX size={20} />}
              </button>

              <div className="bg-neutral-950 px-4 py-2 rounded-xl border border-neutral-800 flex gap-2 items-center">
                <Coins size={18} className="text-yellow-500" />
                <span className="text-yellow-500 font-black">{profile?.coins}</span>
              </div>
              <button onClick={() => setCurrentView("premium")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border bg-neutral-950 border-neutral-800 text-fuchsia-400">
                <Gem size={18} /> <span className="hidden sm:block font-bold text-sm">Преміум</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {toastMsg.text && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full flex items-center gap-2 shadow-lg z-50 text-white font-medium ${toastMsg.type === "success" ? "bg-green-600" : "bg-red-900"}`}>
          {toastMsg.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />} {toastMsg.text}
        </div>
      )}

      <main className="max-w-5xl mx-auto p-4 mt-4">
        {currentView === "farm" && <FarmView profile={profile} setProfile={setProfile} cardsCatalog={cardsCatalog} showToast={showToast} bosses={bosses} rarities={rarities} />}
        {currentView === "shop" && <ShopView profile={profile} cardStats={cardStats} packs={packsCatalog} cardsCatalog={cardsCatalog} rarities={rarities} openPack={openPack} openingPackId={openingPackId} isRouletteSpinning={isRouletteSpinning} rouletteItems={rouletteItems} pulledCards={pulledCards} setPulledCards={setPulledCards} sellPulledCards={sellPulledCards} selectedPackId={selectedPackId} setSelectedPackId={setSelectedPackId} setViewingCard={setViewingCard} isPremiumActive={isPremiumActive} isAdmin={profile?.isAdmin} isProcessing={isProcessing} />}
        {currentView === "premium" && <PremiumShopView profile={profile} setProfile={setProfile} user={user} premiumPrice={premiumPrice} premiumDurationDays={premiumDurationDays} premiumShopItems={premiumShopItems} showToast={showToast} isProcessing={isProcessing} setIsProcessing={setIsProcessing} addSystemLog={addSystemLog} isPremiumActive={isPremiumActive} cardsCatalog={cardsCatalog} setViewingCard={setViewingCard} rarities={rarities} cardStats={cardStats} />}
        {currentView === "inventory" && <InventoryView inventory={fullInventory} rarities={rarities} catalogTotal={cardsCatalog.length} setViewingCard={setViewingCard} setListingCard={setListingCard} packsCatalog={packsCatalog} showcases={showcases} profile={profile} cardsCatalog={cardsCatalog} cardStats={cardStats} sellDuplicate={sellDuplicate} sellAllDuplicates={sellAllDuplicates} sellEveryDuplicate={sellEveryDuplicate} sellPrice={SELL_PRICE} createShowcase={createShowcase} deleteShowcase={deleteShowcase} setMainShowcase={setMainShowcase} saveShowcaseCards={saveShowcaseCards} />}
        {currentView === "market" && <MarketView marketListings={marketListings} cardsCatalog={cardsCatalog} rarities={rarities} currentUserUid={user.uid} setViewingCard={setViewingCard} isAdmin={profile?.isAdmin} buyFromMarket={buyFromMarket} cancelMarketListing={cancelMarketListing} />}
        {currentView === "profile" && <ProfileView profile={profile} setProfile={setProfile} user={user} handleLogout={handleLogout} showToast={showToast} inventoryCount={fullInventory.length} canClaimDaily={canClaimDaily} dailyRewards={dailyRewards} premiumDailyRewards={premiumDailyRewards} isPremiumActive={isPremiumActive} showcases={showcases} cardsCatalog={cardsCatalog} rarities={rarities} fullInventory={fullInventory} setViewingCard={setViewingCard} cardStats={cardStats} />}
        {currentView === "rating" && <RatingView currentUid={user.uid} setViewingPlayerProfile={(uid) => { setViewingPlayerProfile(uid); setCurrentView("publicProfile"); }} />}
        {currentView === "publicProfile" && viewingPlayerProfile && <PublicProfileView targetUid={viewingPlayerProfile} goBack={() => setCurrentView("rating")} cardsCatalog={cardsCatalog} rarities={rarities} setViewingCard={setViewingCard} packsCatalog={packsCatalog} cardStats={cardStats} />}
        {currentView === "admin" && profile?.isAdmin && <AdminView reloadSettings={reloadSettings} currentProfile={profile} setProfile={setProfile} cardsCatalog={cardsCatalog} packsCatalog={packsCatalog} setCardsCatalog={setCardsCatalog} setPacksCatalog={setPacksCatalog} rarities={rarities} showToast={showToast} addSystemLog={addSystemLog} dailyRewards={dailyRewards} premiumDailyRewards={premiumDailyRewards} premiumPrice={premiumPrice} premiumDurationDays={premiumDurationDays} premiumShopItems={premiumShopItems} setViewingPlayerProfile={setViewingPlayerProfile} setCurrentView={setCurrentView} bosses={bosses} setBosses={setBosses} />}
      </main>

      {viewingCard && <CardModal viewingCard={viewingCard} setViewingCard={setViewingCard} rarities={rarities} />}
      {listingCard && <ListingModal listingCard={listingCard} setListingCard={setListingCard} isProcessing={isProcessing} listOnMarket={listOnMarket} />}

      <nav className="fixed bottom-0 w-full bg-neutral-900 border-t border-neutral-800 px-2 py-2 z-40 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] overflow-x-auto hide-scrollbar">
        <div className="min-w-max mx-auto flex justify-center sm:gap-2">
          <NavButton icon={<Swords size={22} />} label="Фарм" isActive={currentView === "farm"} onClick={() => setCurrentView("farm")} />
          <NavButton icon={<PackageOpen size={22} />} label="Магазин" isActive={currentView === "shop"} onClick={() => { setCurrentView("shop"); setPulledCards([]); setSelectedPackId(null); }} />
          <NavButton icon={<LayoutGrid size={22} />} label="Інвентар" isActive={currentView === "inventory"} onClick={() => setCurrentView("inventory")} />
          <NavButton icon={<Store size={22} />} label="Ринок" isActive={currentView === "market"} onClick={() => setCurrentView("market")} />
          <NavButton icon={<Trophy size={22} />} label="Рейтинг" isActive={currentView === "rating" || currentView === "publicProfile"} onClick={() => setCurrentView("rating")} />
          <NavButton icon={<User size={22} />} label="Профіль" isActive={currentView === "profile"} onClick={() => setCurrentView("profile")} />

          {profile?.isAdmin && (
            <button onClick={() => setCurrentView("admin")} className={`flex flex-col items-center p-2 rounded-lg w-16 sm:w-20 transition-colors ${currentView === "admin" ? "text-purple-500" : "text-neutral-500"}`}>
              <Shield size={22} />
              <span className="text-[9px] sm:text-[10px] mt-1 font-bold uppercase tracking-wider">Адмінка</span>
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}