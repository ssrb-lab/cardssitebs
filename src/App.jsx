import React, { useState, useEffect } from "react";
import {
  Coins,
  PackageOpen,
  LayoutGrid,
  LogOut,
  Sparkles,
  AlertCircle,
  Loader2,
  Mail,
  User,
  Gift,
  CheckCircle2,
  Shield,
  Edit2,
  Trash2,
  Ban,
  Layers,
  ArrowLeft,
  Database,
  KeyRound,
  Trophy,
  Eye,
  Users,
  Crown,
  Search,
  Filter,
  Zap,
  Ticket,
  Store,
  Tag,
  History,
  CalendarDays,
  ShoppingCart,
  Link,
  ScrollText,
  Bug,
  Camera,
  Star,
  GripHorizontal,
  Hexagon,
  Volume2,
  Settings,
  Gem
} from "lucide-react";
import { initializeApp } from "firebase/app";
import { Swords, Edit } from "lucide-react";
import FarmView from './Farm';
import {
  getAuth,
  signInWithCustomToken,
  signInAnonymously,
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  linkWithPopup
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  collection,
  onSnapshot,
  updateDoc,
  deleteDoc,
  writeBatch,
  increment,
  getDocs,
  getDoc,
  query,
  orderBy,
  limit
} from "firebase/firestore";

// --- ГЛОБАЛЬНІ ФУНКЦІЇ ---
const isToday = (dateString) => {
  if (!dateString) return false;
  const d = new Date(dateString);
  const today = new Date();
  return d.getDate() === today.getDate() &&
         d.getMonth() === today.getMonth() &&
         d.getFullYear() === today.getFullYear();
};

const formatDate = (dateString) => {
  if (!dateString) return "Невідомо";
  const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };
  return new Date(dateString).toLocaleDateString('uk-UA', options);
};

const playCardSound = (url, volume = 0.5) => {
    if (!url) return;
    try {
        const audio = new Audio(url);
        audio.volume = volume;
        audio.play().catch(e => console.log("Audio play blocked by browser:", e));
    } catch (err) {
        console.log("Audio error", err);
    }
};

const getCardWeight = (rName, raritiesList) => {
    const r = raritiesList?.find((x) => x.name === rName);
    return r && r.weight !== undefined ? Number(r.weight) : 100;
};

// --- CSS ДЛЯ КРУТИХ ЕФЕКТІВ КАРТОК ТА 3D ---
const globalStyles = `
  .effect-holo::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(105deg, transparent 20%, rgba(255,215,0,0.15) 30%, rgba(255,0,0,0.15) 45%, rgba(0,255,255,0.15) 60%, transparent 80%);
    background-size: 300% 300%;
    animation: holo-shine 6s infinite linear;
    mix-blend-mode: screen;
    pointer-events: none;
    z-index: 5;
    opacity: 0.7;
  }
  @keyframes holo-shine {
    0% { background-position: 300% 0; }
    100% { background-position: -300% 0; }
  }

  .effect-foil::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(110deg, transparent 25%, rgba(255, 255, 255, 0.2) 40%, rgba(255, 255, 255, 0.8) 50%, rgba(255, 255, 255, 0.2) 60%, transparent 75%);
    background-size: 400% 400%;
    animation: foil-glint 4s infinite ease-in-out;
    mix-blend-mode: overlay;
    pointer-events: none;
    z-index: 5;
  }
  @keyframes foil-glint {
    0% { background-position: 100% 100%; }
    50% { background-position: 0% 0%; }
    100% { background-position: 100% 100%; }
  }

  .effect-glow::after {
    content: "";
    position: absolute;
    inset: 0;
    box-shadow: inset 0 0 30px rgba(255, 215, 0, 0.8);
    animation: inner-glow 2s infinite alternate;
    pointer-events: none;
    z-index: 5;
  }
  @keyframes inner-glow {
    0% { opacity: 0.3; }
    100% { opacity: 1; }
  }
  
  .effect-glitch {
    animation: glitch-anim 4s infinite;
  }
  @keyframes glitch-anim {
    0%, 96%, 100% { filter: hue-rotate(0deg); transform: skewX(0deg); }
    97% { filter: hue-rotate(90deg); transform: skewX(5deg); }
    98% { filter: hue-rotate(-90deg); transform: skewX(-5deg); }
    99% { filter: hue-rotate(180deg); transform: skewX(2deg); }
  }
  
  .hide-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .hide-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .preserve-3d {
    transform-style: preserve-3d;
  }
`;

// --- НАЛАШТУВАННЯ FIREBASE ---
const firebaseConfig = typeof __firebase_config !== "undefined" 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: "AIzaSyAF0XD16LUmsVFF0q5perWadlU9RWoCpLs",
      authDomain: "narutocardgame-a4017.firebaseapp.com",
      projectId: "narutocardgame-a4017",
      storageBucket: "narutocardgame-a4017.firebasestorage.app",
      messagingSenderId: "1061146381013",
      appId: "1:1061146381013:web:38941af7656858ce55b05c",
      measurementId: "G-36ZECLRRLE",
    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const GAME_ID = typeof __app_id !== "undefined" ? __app_id : "narutocardgame";

// --- ДЕФОЛТНІ ДАНІ ---
const DEFAULT_PACKS = [
  {
    id: "p1",
    name: "Наруто Базовий",
    category: "Базові",
    cost: 50,
    image: "https://placehold.co/400x400/222/aaa?text=Базовий\nПак",
    customWeights: {},
    isHidden: false,
    isPremiumOnly: false
  }
];

const DEFAULT_BOSSES = [
  {
    id: "boss_1",
    cardId: "c1", // Беремо вашу першу картку "Учень Академії"
    maxHp: 1000,
    rewardPerClick: 2,
    killBonus: 500,
    cooldownHours: 4
  }
];

const DEFAULT_CARDS_DB = [
  { id: "c1", packId: "p1", name: "Учень Академії", rarity: "Звичайна", image: "https://placehold.co/400x600/222/aaa?text=Учень\nАкадемії", maxSupply: 0, pulledCount: 0, sellPrice: 15, effect: "", soundUrl: "", soundVolume: 0.5 },
];

const EFFECT_OPTIONS = [
  { id: "", name: "Без ефекту" },
  { id: "holo", name: "Голограма (Holo)" },
  { id: "foil", name: "Металік (Foil)" },
  { id: "glow", name: "Золоте світіння (Glow)" },
  { id: "glitch", name: "Глітч (Glitch)" }
];

const COLOR_PRESETS = {
  gray: { border: "border-gray-500 shadow-gray-500/30", text: "text-gray-400" },
  blue: { border: "border-blue-500 shadow-blue-500/40", text: "text-blue-400" },
  purple: { border: "border-purple-500 shadow-purple-500/50", text: "text-purple-400" },
  yellow: { border: "border-yellow-400 shadow-yellow-500/80", text: "text-yellow-400" },
  red: { border: "border-red-500 shadow-red-500/50", text: "text-red-400" },
  green: { border: "border-green-500 shadow-green-500/40", text: "text-green-400" },
  cyan: { border: "border-cyan-400 shadow-cyan-400/50", text: "text-cyan-400" },
};

const DEFAULT_RARITIES = [
  { name: "Звичайна", weight: 70, color: "gray" },
  { name: "Рідкісна", weight: 25, color: "blue" },
  { name: "Епічна", weight: 4, color: "purple" },
  { name: "Легендарна", weight: 1, color: "yellow" },
  { name: "Унікальна", weight: 0.1, color: "red" },
];

const getCardStyle = (rName, raritiesList) => {
  const r = raritiesList?.find((x) => x.name === rName);
  return r && COLOR_PRESETS[r.color] ? COLOR_PRESETS[r.color] : COLOR_PRESETS["gray"];
};

const SELL_PRICE = 15;

// Компонент-помічник для Аватарок (БЕЗПЕЧНИЙ)
function PlayerAvatar({ profile, className = "", iconSize = 24 }) {
    if (profile?.avatarUrl) {
        return (
            <div className={`overflow-hidden bg-neutral-800 ${className} flex items-center justify-center border-2 border-neutral-700 shadow-md relative shrink-0`}>
                <img src={profile.avatarUrl} alt="avatar" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                {profile.isSuperAdmin && <Crown size={14} className="absolute top-0 right-0 text-red-500 bg-neutral-900 rounded-full" title="Супер Адмін" />}
            </div>
        );
    }
    
    const bgClass = profile?.isSuperAdmin ? "bg-red-900 border-red-500 text-red-200" :
                    profile?.isAdmin ? "bg-purple-900 border-purple-500 text-purple-200" : "bg-neutral-800 border-neutral-700 text-yellow-500";
    
    // БЕЗПЕЧНА перевірка нікнейму для запобігання білому екрану (крашу)
    let initial = "U";
    if (profile?.nickname && typeof profile.nickname === "string" && profile.nickname.length > 0) {
        initial = profile.nickname.charAt(0).toUpperCase();
    }

    return (
        <div className={`flex items-center justify-center font-bold border-2 shadow-sm shrink-0 ${bgClass} ${className}`}>
            {profile?.isSuperAdmin ? <Crown size={iconSize} /> : profile?.isAdmin ? <Shield size={iconSize} /> : initial}
        </div>
    );
}

export default function App() {
  const [user, setUser] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [dbInventory, setDbInventory] = useState([]);
  const [marketListings, setMarketListings] = useState([]);
  const [showcases, setShowcases] = useState([]); 
  const [loading, setLoading] = useState(true);
  
  // ЗАХИСТ ВІД ШВИДКИХ КЛІКІВ (Race Conditions)
  const [isProcessing, setIsProcessing] = useState(false);

  // Авторизація
  const [needsRegistration, setNeedsRegistration] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [dbError, setDbError] = useState("");

  // Глобальні налаштування
  const [bosses, setBosses] = useState([]);
  const [cardsCatalog, setCardsCatalog] = useState([]);
  const [packsCatalog, setPacksCatalog] = useState([]);
  const [cardStats, setCardStats] = useState({}); // Сюди будемо зберігати лічильники ліміток
  const [rarities, setRarities] = useState([]);
  const [dailyRewards, setDailyRewards] = useState([1000, 2000, 3000, 4000, 5000, 6000, 7000]); 
  const [premiumDailyRewards, setPremiumDailyRewards] = useState([2000, 4000, 6000, 8000, 10000, 12000, 15000]); 
  const [premiumPrice, setPremiumPrice] = useState(10000);
  const [premiumDurationDays, setPremiumDurationDays] = useState(30);
  const [premiumShopItems, setPremiumShopItems] = useState([]);

  // Стан Гри
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
  
  // Безпечна перевірка преміум статусу з датою
  const checkIsPremiumActive = (prof) => {
      if (!prof || !prof.isPremium || !prof.premiumUntil) return false;
      const d = new Date(prof.premiumUntil);
      return !isNaN(d) && d > new Date();
  };
  const isPremiumActive = checkIsPremiumActive(profile);

  useEffect(() => {
    document.title = "Card Game";
  }, []);

  // --- ЛОГУВАННЯ СИСТЕМИ ---
  const addSystemLog = async (type, details) => {
    try {
        const logRef = doc(db, "artifacts", GAME_ID, "public", "data", "adminLogs", "log_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5));
        await setDoc(logRef, {
            type: type,
            details: details,
            userUid: user?.uid || "Система",
            userNickname: profile?.nickname || "Гість",
            timestamp: new Date().toISOString()
        });
    } catch(e) { console.error("Помилка логування:", e); }
  };

  // --- СИСТЕМА ЗАХИСТУ ВІД ВІЧНОЇ ЗАГРУЗКИ ---
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

  // --- ІНІЦІАЛІЗАЦІЯ АВТОРИЗАЦІЇ ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== "undefined" && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        }
      } catch (error) {
        console.error("Помилка ініціалізації:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setNeedsRegistration(true);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // --- ЗАВАНТАЖЕННЯ ДАНИХ ---
  useEffect(() => {
    if (!user) return;

    const settingsRef = doc(db, "artifacts", GAME_ID, "public", "data", "gameSettings", "main");
    const unsubSettings = onSnapshot(settingsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setBosses(data.bosses || DEFAULT_BOSSES);
        setCardsCatalog(data.cards || []);
        setPacksCatalog(data.packs || DEFAULT_PACKS);
        setRarities(data.rarities || DEFAULT_RARITIES);
        setDailyRewards(data.dailyRewards || [1000, 2000, 3000, 4000, 5000, 6000, 7000]);
        setPremiumDailyRewards(data.premiumDailyRewards || [2000, 4000, 6000, 8000, 10000, 12000, 15000]);
        setPremiumPrice(data.premiumPrice !== undefined ? data.premiumPrice : 10000);
        setPremiumDurationDays(data.premiumDurationDays !== undefined ? data.premiumDurationDays : 30);
        setPremiumShopItems(data.premiumShopItems || []);
      } else {
        console.warn("Каталог порожній або ще не створений Адміном.");
      }
    }, (err) => {
      console.error("БД Помилка:", err);
      setDbError("Помилка доступу до бази.");
      setLoading(false);
    });

    const profileRef = doc(db, "artifacts", GAME_ID, "public", "data", "profiles", user.uid);
    const unsubProfile = onSnapshot(profileRef, (docSnap) => {
      if (docSnap.exists()) {
        const pData = docSnap.data();
        
        let needsUpdate = false;
        
        // Перевірка Бану
        if (pData.isBanned && pData.banUntil) {
          const now = new Date().getTime();
          const banEnd = new Date(pData.banUntil).getTime();
          if (now > banEnd) {
             pData.isBanned = false;
             pData.banReason = null;
             pData.banUntil = null;
             needsUpdate = true;
          }
        }

        // Перевірка Преміуму
        if (pData.isPremium && pData.premiumUntil) {
            const now = new Date().getTime();
            const premEnd = new Date(pData.premiumUntil).getTime();
            if (now > premEnd) {
                pData.isPremium = false;
                pData.premiumUntil = null;
                needsUpdate = true;
            }
        }
        
        if (needsUpdate) {
            updateDoc(profileRef, { 
                isBanned: pData.isBanned, banReason: pData.banReason, banUntil: pData.banUntil,
                isPremium: pData.isPremium, premiumUntil: pData.premiumUntil
            });
        }
        
        setProfile(pData);
        setNeedsRegistration(false);
      } else {
        setNeedsRegistration(true);
      }
      setLoading(false);
    });

    const invRef = collection(db, "artifacts", GAME_ID, "users", user.uid, "inventory");
    const unsubInv = onSnapshot(invRef, (snapshot) => {
      const items = [];
      snapshot.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
      setDbInventory(items);
    });

    const statsRef = collection(db, "artifacts", GAME_ID, "public", "data", "cardStats");
    const unsubCardStats = onSnapshot(statsRef, (snapshot) => {
      const stats = {};
      snapshot.forEach((doc) => {
        stats[doc.id] = doc.data().pulledCount || 0;
      });
      setCardStats(stats);
    });

    const marketRef = collection(db, "artifacts", GAME_ID, "public", "data", "market");
    const unsubMarket = onSnapshot(marketRef, (snapshot) => {
      const listings = [];
      snapshot.forEach((doc) => listings.push({ id: doc.id, ...doc.data() }));
      setMarketListings(listings.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)));
    });

    const showcasesRef = collection(db, "artifacts", GAME_ID, "users", user.uid, "showcases");
    const unsubShowcases = onSnapshot(showcasesRef, (snapshot) => {
        const list = [];
        snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
        setShowcases(list);
    });

    return () => {
      unsubSettings();
      unsubProfile();
      unsubInv();
      unsubMarket();
      unsubShowcases();
      unsubCardStats();
    };
  }, [user]);

  // АВТОМАТИЧНА СИНХРОНІЗАЦІЯ КІЛЬКОСТІ УНІКАЛЬНИХ КАРТОК
  useEffect(() => {
    if (user && profile && dbInventory) {
      if (profile.uniqueCardsCount !== dbInventory.length) {
        const profileRef = doc(db, "artifacts", GAME_ID, "public", "data", "profiles", user.uid);
        updateDoc(profileRef, { uniqueCardsCount: dbInventory.length }).catch(e => console.error("Помилка синхронізації:", e));
      }
    }
  }, [user, profile?.uniqueCardsCount, dbInventory.length]);

  // АВТОМАТИЧНЕ ОЧИЩЕННЯ ВІТРИН ВІД ПРОДАНИХ КАРТОК
  useEffect(() => {
    if (!user || !showcases || showcases.length === 0) return;

    showcases.forEach(showcase => {
        if (!showcase.cardIds || showcase.cardIds.length === 0) return;

        let isChanged = false;
        const validCardIds = [];
        const inventoryTracker = {};

        // Робимо зліпок інвентарю (скільки штук кожної картки є)
        dbInventory.forEach(item => {
            inventoryTracker[item.id] = item.amount;
        });

        // Проходимо по картках у вітрині
        showcase.cardIds.forEach(cardId => {
            if (inventoryTracker[cardId] && inventoryTracker[cardId] > 0) {
                validCardIds.push(cardId);
                inventoryTracker[cardId] -= 1; // Резервуємо 1 шт. для відображення
            } else {
                isChanged = true; // Картки не вистачає (продана або виставлена на ринок)
            }
        });

        // Якщо знайдено нестачу - оновлюємо вітрину в базі
        if (isChanged) {
            const showcaseRef = doc(db, "artifacts", GAME_ID, "users", user.uid, "showcases", showcase.id);
            updateDoc(showcaseRef, { cardIds: validCardIds }).catch(console.error);
        }
    });
  }, [dbInventory, showcases, user]);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    const email = e.target.email.value.trim();
    const password = e.target.password.value;

    setLoading(true);
    setDbError("");

    try {
      if (authMode === "register") {
        const nickname = e.target.nickname.value.trim();
        if (!nickname) throw new Error("Введіть нікнейм!");

        // ПЕРЕВІРКА НА УНІКАЛЬНІСТЬ НІКНЕЙМА
        const allProfilesSnap = await getDocs(collection(db, "artifacts", GAME_ID, "public", "data", "profiles"));
        let exists = false;
        allProfilesSnap.forEach(d => {
            if (d.data().nickname?.toLowerCase() === nickname.toLowerCase()) exists = true;
        });
        if (exists) {
            setDbError("Цей нікнейм вже зайнятий іншим гравцем!");
            setLoading(false);
            return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const newUid = userCredential.user.uid;

        await setDoc(doc(db, "artifacts", GAME_ID, "public", "data", "profiles", newUid), {
          uid: newUid,
          nickname,
          email,
          coins: 200,
          totalCards: 0,
          uniqueCardsCount: 0,
          packsOpened: 0,
          coinsSpentOnPacks: 0,
          coinsEarnedFromPacks: 0,
          lastDailyClaim: null,
          dailyStreak: 0,
          createdAt: new Date().toISOString(),
          promoUsed: false,
          isAdmin: false,
          isSuperAdmin: false,
          isBanned: false,
          isPremium: false,
          premiumUntil: null,
          avatarUrl: "",
          mainShowcaseId: null
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      if (err.code === "auth/invalid-credential") setDbError("Невірна пошта або пароль.");
      else if (err.code === "auth/email-already-in-use") setDbError("Акаунт з такою поштою вже існує.");
      else if (err.code === "auth/weak-password") setDbError("Пароль надто короткий (мінімум 6 символів).");
      else if (err.code === "auth/invalid-email") setDbError("Неправильний формат пошти.");
      else setDbError("Помилка: " + err.message);
    }
    setLoading(false);
  };

  const handleGoogleAuth = async () => {
    setLoading(true);
    setDbError("");
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const googleUser = result.user;

      const profileRef = doc(db, "artifacts", GAME_ID, "public", "data", "profiles", googleUser.uid);
      const profileSnap = await getDoc(profileRef);

      if (!profileSnap.exists()) {
        let baseNickname = googleUser.displayName || "Гість";
        
        // ПЕРЕВІРКА НА УНІКАЛЬНІСТЬ НІКНЕЙМА ДЛЯ GOOGLE
        const allProfilesSnap = await getDocs(collection(db, "artifacts", GAME_ID, "public", "data", "profiles"));
        let exists = false;
        allProfilesSnap.forEach(d => {
            if (d.data().nickname?.toLowerCase() === baseNickname.toLowerCase()) exists = true;
        });
        
        if (exists) {
            baseNickname = `${baseNickname}_${googleUser.uid.substring(0,4)}`;
        }

        await setDoc(profileRef, {
          uid: googleUser.uid,
          nickname: baseNickname,
          email: googleUser.email || "",
          coins: 200,
          totalCards: 0,
          uniqueCardsCount: 0,
          packsOpened: 0,
          coinsSpentOnPacks: 0,
          coinsEarnedFromPacks: 0,
          lastDailyClaim: null,
          dailyStreak: 0,
          createdAt: new Date().toISOString(),
          promoUsed: false,
          isAdmin: false,
          isSuperAdmin: false,
          isBanned: false,
          isPremium: false,
          premiumUntil: null,
          avatarUrl: googleUser.photoURL || "",
          mainShowcaseId: null
        });
      }
    } catch (err) {
      if (err.code !== "auth/popup-closed-by-user") {
        setDbError("Помилка входу через Google: " + err.message);
      }
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    setLoading(true);
    await signOut(auth);
    setProfile(null);
    setDbInventory([]);
    setShowcases([]);
    setCurrentView("shop");
    setAuthMode("login");
  };

  const showToast = (msg, type = "error") => {
    setToastMsg({ text: msg, type });
    setTimeout(() => setToastMsg({ text: "", type: "" }), 3000);
  };

  // --- ЛОГІКА РИНКУ ТА ІНВЕНТАРЮ ---
  const listOnMarket = async (cardId, price) => {
      if (isProcessing) return;
      const existing = dbInventory.find((i) => i.id === cardId);
      if (!existing || existing.amount < 1) return showToast("У вас немає цієї картки!");
      if (price < 1 || !Number.isInteger(price)) return showToast("Невірна ціна!");

      setIsProcessing(true);
      try {
          const batch = writeBatch(db);
          const invDocRef = doc(db, "artifacts", GAME_ID, "users", user.uid, "inventory", cardId);
          
          if (existing.amount === 1) {
              batch.delete(invDocRef);
          } else {
              batch.update(invDocRef, { amount: increment(-1) });
          }

          const profileRef = doc(db, "artifacts", GAME_ID, "public", "data", "profiles", user.uid);
          batch.update(profileRef, { totalCards: increment(-1) });

          const marketRef = doc(db, "artifacts", GAME_ID, "public", "data", "market", "m_" + Date.now() + "_" + user.uid);
          batch.set(marketRef, {
              cardId,
              sellerUid: user.uid,
              sellerNickname: profile.nickname,
              price: Number(price),
              createdAt: new Date().toISOString(),
              status: "active"
          });

          await batch.commit();
          showToast("Картку успішно виставлено на Ринок!", "success");
          setListingCard(null);
      } catch(e) {
          console.error(e);
          showToast(`Помилка: ${e.message}`);
          addSystemLog("Помилка", `Виставлення на ринок: ${e.message}`);
      } finally {
          setIsProcessing(false);
      }
  };

  const buyFromMarket = async (listing) => {
      if (isProcessing) return;
      if (profile.coins < listing.price) return showToast("Недостатньо монет, Мій лорд!");
      if (listing.sellerUid === user.uid) return showToast("Ви не можете купити власний лот!");

      setIsProcessing(true);
      try {
          const batch = writeBatch(db);
          
          const buyerProfileRef = doc(db, "artifacts", GAME_ID, "public", "data", "profiles", user.uid);
          batch.update(buyerProfileRef, { coins: increment(-listing.price), totalCards: increment(1) });
          
          const buyerInvRef = doc(db, "artifacts", GAME_ID, "users", user.uid, "inventory", listing.cardId);
          batch.set(buyerInvRef, { amount: increment(1) }, { merge: true });

          const sellerProfileRef = doc(db, "artifacts", GAME_ID, "public", "data", "profiles", listing.sellerUid);
          batch.update(sellerProfileRef, { coins: increment(listing.price) });

          const marketRef = doc(db, "artifacts", GAME_ID, "public", "data", "market", listing.id);
          batch.update(marketRef, {
              status: "sold",
              buyerUid: user.uid,
              buyerNickname: profile.nickname,
              soldAt: new Date().toISOString()
          });

          await batch.commit();
          showToast(`Картку успішно придбано за ${listing.price} монет!`, "success");
      } catch (e) {
          console.error(e);
          showToast("Помилка покупки. Можливо, лот вже продано іншому гравцю.");
          addSystemLog("Помилка", `Покупка на ринку: ${e.message}`);
      } finally {
          setIsProcessing(false);
      }
  };

  const cancelMarketListing = async (listing) => {
      if (isProcessing) return;
      if (listing.sellerUid !== user.uid && !profile.isAdmin) return;

      setIsProcessing(true);
      try {
          const batch = writeBatch(db);
          
          const marketRef = doc(db, "artifacts", GAME_ID, "public", "data", "market", listing.id);
          batch.delete(marketRef);

          const sellerProfileRef = doc(db, "artifacts", GAME_ID, "public", "data", "profiles", listing.sellerUid);
          batch.update(sellerProfileRef, { totalCards: increment(1) });

          const sellerInvRef = doc(db, "artifacts", GAME_ID, "users", listing.sellerUid, "inventory", listing.cardId);
          batch.set(sellerInvRef, { amount: increment(1) }, { merge: true });

          await batch.commit();
          showToast(listing.sellerUid === user.uid ? "Ваш лот знято з продажу." : "Лот гравця примусово видалено.", "success");
          if (listing.sellerUid !== user.uid) {
             addSystemLog("Адмін", `Адмін ${profile.nickname} примусово видалив лот гравця ${listing.sellerNickname}`);
          }
      } catch (e) {
          console.error(e);
          showToast("Помилка скасування лоту.");
      } finally {
          setIsProcessing(false);
      }
  };

  // --- ЛОГІКА ГРИ (ВІДКРИТТЯ ПАКУ) ---
  const openPack = async (packId, cost, amountToOpen = 1) => {
    if (isProcessing || !profile || openingPackId || isRouletteSpinning) return;
    
    const selectedPackDef = packsCatalog.find(p => p.id === packId);
    if (selectedPackDef?.isPremiumOnly && !isPremiumActive) {
        showToast("Цей пак доступний тільки для Преміум гравців!", "error");
        return;
    }

    const totalCost = cost * amountToOpen;

    if (profile.coins < totalCost) {
      showToast("Недостатньо монет, Мій лорд!");
      return;
    }

    setIsProcessing(true);
    setOpeningPackId(packId);
    setPulledCards([]);

    setTimeout(async () => {
      let tempCatalog = JSON.parse(JSON.stringify(cardsCatalog));
      let results = [];
      let countsMap = {};
      //let needsCatalogUpdate = false; 
      let totalEarnedCoins = 0; 
      const availablePackCards = tempCatalog.filter((c) => c.packId === packId);

      for (let i = 0; i < amountToOpen; i++) {
        const availableNow = tempCatalog.filter(
          (c) => c.packId === packId && (!c.maxSupply || (c.pulledCount || 0) < c.maxSupply)
        );

        if (availableNow.length === 0) {
          if (i === 0) {
            setOpeningPackId(null);
            setIsProcessing(false);
            showToast("У цьому паку не залишилось доступних карток!");
            return;
          }
          break;
        }

        let totalWeight = 0;
        const activeWeights = [];

        for (const c of availableNow) {
            let w = 1;
            const globalRObj = rarities.find(r => r.name === c.rarity);
            
            if (c.weight !== undefined && c.weight !== "") {
                w = Number(c.weight);
            } else if (selectedPackDef?.customWeights?.[c.rarity] !== undefined && selectedPackDef?.customWeights?.[c.rarity] !== "") {
                w = Number(selectedPackDef.customWeights[c.rarity]);
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

        results.push(newCard);
        countsMap[newCard.id] = (countsMap[newCard.id] || 0) + 1;
        totalEarnedCoins += (newCard.sellPrice ? Number(newCard.sellPrice) : SELL_PRICE);
      }

      if (results.length === 0) {
        setOpeningPackId(null);
        setIsProcessing(false);
        return;
      }

      try {
        const batch = writeBatch(db);

        const profileRef = doc(db, "artifacts", GAME_ID, "public", "data", "profiles", user.uid);
        batch.update(profileRef, { 
          coins: increment(-totalCost),
          totalCards: increment(results.length),
          packsOpened: increment(amountToOpen),
          coinsSpentOnPacks: increment(totalCost),
          coinsEarnedFromPacks: increment(totalEarnedCoins)
        });

        for (const card of results) {
          if (Number(card.maxSupply) > 0) {
            const statDocRef = doc(db, "artifacts", GAME_ID, "public", "data", "cardStats", card.id);
            // Додаємо +1 до лічильника конкретної картки в безпечній папці
            batch.set(statDocRef, { pulledCount: increment(1) }, { merge: true });
          }
        }

        for (const [cardId, count] of Object.entries(countsMap)) {
          const invDocRef = doc(db, "artifacts", GAME_ID, "users", user.uid, "inventory", cardId);
          batch.set(invDocRef, { amount: increment(count) }, { merge: true });
        }

        await batch.commit();

        if (amountToOpen === 1) {
            const fakeCards = Array.from({length: 45}, () => availablePackCards[Math.floor(Math.random() * availablePackCards.length)]);
            fakeCards[35] = results[0]; 

            setRouletteItems(fakeCards);
            setIsRouletteSpinning(true);
            setOpeningPackId(null);

            setTimeout(() => {
                setIsRouletteSpinning(false);
                setPulledCards(results);
                setIsProcessing(false);
            }, 5000); 
        } else {
            setOpeningPackId(null);
            setPulledCards(results);
            setIsProcessing(false);
        }

      } catch (err) {
        console.error("Помилка під час відкриття:", err);
        showToast(`Виникла помилка під час збереження: ${err.message}`);
        addSystemLog("Помилка", `Відкриття паку: ${err.message}`);
        setOpeningPackId(null);
        setIsProcessing(false);
      }
    }, amountToOpen === 1 ? 100 : 1500);
  };

  // ПРОДАТИ ТІЛЬКИ ЩО ОТРИМАНІ КАРТКИ З ПАКУ
  const sellPulledCards = async () => {
      if (isProcessing || pulledCards.length === 0) return;
      setIsProcessing(true);

      let totalEarned = 0;
      let totalCardsRemoved = pulledCards.length;
      const countsMap = {};
      
      pulledCards.forEach(c => {
         countsMap[c.id] = (countsMap[c.id] || 0) + 1;
         totalEarned += (c.sellPrice ? Number(c.sellPrice) : SELL_PRICE);
      });

      try {
        const batch = writeBatch(db);
        
        for (const [cardId, count] of Object.entries(countsMap)) {
           const invDocRef = doc(db, "artifacts", GAME_ID, "users", user.uid, "inventory", cardId);
           const existing = dbInventory.find(i => i.id === cardId);
           
           if (existing && existing.amount <= count) {
               batch.delete(invDocRef); // Якщо продаємо всі екземпляри що маємо
           } else {
               batch.update(invDocRef, { amount: increment(-count) });
           }
        }
        
        const profileRef = doc(db, "artifacts", GAME_ID, "public", "data", "profiles", user.uid);
        batch.update(profileRef, {
          coins: increment(totalEarned),
          totalCards: increment(-totalCardsRemoved)
        });

        await batch.commit();
        showToast(`Успішно продано всі отримані картки! Отримано ${totalEarned} монет.`, "success");
        setPulledCards([]);
      } catch(e) {
         console.error(e);
         showToast("Помилка продажу карток.");
      } finally {
         setIsProcessing(false);
      }
  };

  const sellDuplicate = async (cardId) => {
    if (isProcessing) return;
    const existing = dbInventory.find((i) => i.id === cardId);
    if (!existing || existing.amount <= 1) return;
    
    setIsProcessing(true);
    const cardDef = cardsCatalog.find(c => c.id === cardId);
    const cardPrice = cardDef?.sellPrice ? Number(cardDef.sellPrice) : SELL_PRICE;

    try {
      const batch = writeBatch(db);
      const invDocRef = doc(db, "artifacts", GAME_ID, "users", user.uid, "inventory", cardId);
      batch.update(invDocRef, { amount: increment(-1) });

      const profileRef = doc(db, "artifacts", GAME_ID, "public", "data", "profiles", user.uid);
      batch.update(profileRef, { 
        coins: increment(cardPrice),
        totalCards: increment(-1)
      });

      await batch.commit();
      showToast(`Продано за ${cardPrice} монет!`, "success");
    } catch (e) {
      console.error(e);
      showToast("Помилка під час продажу.");
    } finally {
      setIsProcessing(false);
    }
  };

  const sellAllDuplicates = async (cardId) => {
    if (isProcessing) return;
    const existing = dbInventory.find((i) => i.id === cardId);
    if (!existing || existing.amount <= 1) return;
    
    setIsProcessing(true);
    const cardDef = cardsCatalog.find(c => c.id === cardId);
    const cardPrice = cardDef?.sellPrice ? Number(cardDef.sellPrice) : SELL_PRICE;
    
    const sellCount = existing.amount - 1;
    const earnedCoins = sellCount * cardPrice;

    try {
      const batch = writeBatch(db);
      const invDocRef = doc(db, "artifacts", GAME_ID, "users", user.uid, "inventory", cardId);
      batch.update(invDocRef, { amount: 1 });

      const profileRef = doc(db, "artifacts", GAME_ID, "public", "data", "profiles", user.uid);
      batch.update(profileRef, { 
        coins: increment(earnedCoins),
        totalCards: increment(-sellCount)
      });

      await batch.commit();
      showToast(`Продано ${sellCount} шт. за ${earnedCoins} монет!`, "success");
    } catch (e) {
      console.error(e);
      showToast("Помилка під час масового продажу.");
    } finally {
      setIsProcessing(false);
    }
  };

  const sellEveryDuplicate = async (specificInventory = null) => {
    if (isProcessing) return;
    
    const baseList = specificInventory || dbInventory.map(item => {
        const cardData = cardsCatalog.find((c) => c.id === item.id);
        return cardData && item.amount > 0 ? { card: cardData, amount: item.amount } : null;
    }).filter(Boolean);

    const duplicates = baseList.filter(item => item.amount > 1);
    if (duplicates.length === 0) {
      return showToast("У вибраному списку немає дублікатів для продажу!", "error");
    }

    setIsProcessing(true);
    let totalEarned = 0;
    let totalCardsRemoved = 0;
    const batch = writeBatch(db);

    duplicates.forEach(item => {
      const idToUpdate = item.card?.id || item.id;
      const cardDef = cardsCatalog.find(c => c.id === idToUpdate);
      const cardPrice = cardDef?.sellPrice ? Number(cardDef.sellPrice) : SELL_PRICE;
      const sellCount = item.amount - 1;

      totalEarned += sellCount * cardPrice;
      totalCardsRemoved += sellCount;

      const invDocRef = doc(db, "artifacts", GAME_ID, "users", user.uid, "inventory", idToUpdate);
      batch.update(invDocRef, { amount: 1 });
    });

    const profileRef = doc(db, "artifacts", GAME_ID, "public", "data", "profiles", user.uid);
    batch.update(profileRef, { 
      coins: increment(totalEarned),
      totalCards: increment(-totalCardsRemoved)
    });

    try {
      await batch.commit();
      showToast(`Продано всі дублікати! Отримано ${totalEarned} монет.`, "success");
    } catch (e) {
      console.error(e);
      showToast("Помилка під час масового продажу інвентарю.");
    } finally {
      setIsProcessing(false);
    }
  };

  // --- ЛОГІКА ВІТРИН ---
  const createShowcase = async (name) => {
      if (!name.trim()) return showToast("Введіть назву вітрини!");
      if (showcases.length >= 5 && !profile.isSuperAdmin) return showToast("Досягнуто ліміт вітрин (5 шт).");
      
      try {
          const newRef = doc(collection(db, "artifacts", GAME_ID, "users", user.uid, "showcases"));
          await setDoc(newRef, {
              name: name.trim(),
              cardIds: [],
              createdAt: new Date().toISOString()
          });
          showToast("Вітрину успішно створено!", "success");
      } catch (e) {
          console.error(e);
          showToast("Помилка створення вітрини.");
      }
  };

  const deleteShowcase = async (showcaseId) => {
      if (!confirm("Видалити цю вітрину? Картки залишаться у вашому інвентарі.")) return;
      try {
          const batch = writeBatch(db);
          batch.delete(doc(db, "artifacts", GAME_ID, "users", user.uid, "showcases", showcaseId));
          
          if (profile.mainShowcaseId === showcaseId) {
              batch.update(doc(db, "artifacts", GAME_ID, "public", "data", "profiles", user.uid), { mainShowcaseId: null });
          }
          await batch.commit();
          showToast("Вітрину видалено.", "success");
      } catch (e) {
          console.error(e);
          showToast("Помилка видалення.");
      }
  };

  const setMainShowcase = async (showcaseId) => {
      try {
          await updateDoc(doc(db, "artifacts", GAME_ID, "public", "data", "profiles", user.uid), {
              mainShowcaseId: showcaseId
          });
          showToast("Головну вітрину оновлено!", "success");
      } catch (e) {
          console.error(e);
          showToast("Помилка оновлення профілю.");
      }
  };

  const saveShowcaseCards = async (showcaseId, newCardIds) => {
      try {
          await updateDoc(doc(db, "artifacts", GAME_ID, "users", user.uid, "showcases", showcaseId), {
              cardIds: newCardIds
          });
      } catch (e) {
          console.error(e);
          showToast("Помилка збереження карток у вітрині.");
      }
  };

  const fullInventory = dbInventory
    .map((item) => {
      const cardData = cardsCatalog.find((c) => c.id === item.id);
      return cardData && item.amount > 0 ? { card: cardData, amount: item.amount } : null;
    })
    .filter(Boolean);

  // --- ЕКРАНИ ---
  if (dbError && user !== undefined) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-500">
        <div className="bg-red-950/40 border-2 border-red-900 p-8 rounded-3xl max-w-lg w-full shadow-[0_0_50px_rgba(220,38,38,0.3)] relative overflow-hidden">
          <Database size={64} className="mx-auto mb-6 text-red-500 animate-bounce" />
          <h1 className="text-2xl font-black mb-4 text-white uppercase tracking-widest drop-shadow-md">Увага!</h1>
          <p className="text-neutral-300 font-medium leading-relaxed mb-6">{dbError}</p>
          {(!user || needsRegistration) && (
            <button
              onClick={() => { setDbError(""); setLoading(false); }}
              className="bg-neutral-800 text-white px-6 py-3 rounded-xl font-bold hover:bg-neutral-700 transition-colors"
            >
              Спробувати ще раз
            </button>
          )}
        </div>
      </div>
    );
  }

  if (profile?.isBanned) {
    const isTempBan = profile.banUntil !== null;
    const banDateStr = isTempBan ? new Date(profile.banUntil).toLocaleString('uk-UA') : "";

    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-500 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-900/20 via-neutral-950 to-neutral-950"></div>
        <div className="bg-red-950/30 border-2 border-red-900/50 p-10 rounded-3xl max-w-md w-full relative z-10 shadow-[0_0_80px_rgba(220,38,38,0.15)]">
            <Ban size={80} className="mx-auto mb-6 text-red-500 drop-shadow-[0_0_15px_rgba(220,38,38,0.8)]" />
            <h1 className="text-4xl font-black mb-2 text-white tracking-wider">ВИ ЗАБАНЕНІ</h1>
            <p className="text-red-400 font-bold uppercase tracking-widest mb-8 text-sm">Доступ до гри обмежено</p>
            
            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-5 mb-8 text-left">
                <div className="mb-4">
                    <div className="text-xs text-neutral-500 uppercase font-bold mb-1">Причина блокування:</div>
                    <div className="text-white text-lg">{profile.banReason || "Порушення правил гри."}</div>
                </div>
                <div>
                    <div className="text-xs text-neutral-500 uppercase font-bold mb-1">Термін дії:</div>
                    <div className="text-red-400 font-bold text-lg">{isTempBan ? `До ${banDateStr}` : "Назавжди (Перманентно)"}</div>
                </div>
            </div>

            <button onClick={handleLogout} className="w-full bg-neutral-900 hover:bg-neutral-800 text-white border border-neutral-700 font-bold py-4 rounded-xl transition-colors flex justify-center items-center gap-2">
                <LogOut size={18} /> Вийти з акаунту
            </button>
        </div>
      </div>
    );
  }

  if (loading || user === undefined) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center text-yellow-500">
        <Loader2 className="animate-spin w-16 h-16 mb-4" />
        <p className="text-neutral-500 font-bold uppercase tracking-widest animate-pulse">З'єднання...</p>
      </div>
    );
  }

  // Екран Авторизації
  if (!user || needsRegistration) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4 font-sans text-neutral-100 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-yellow-900/20 via-neutral-950 to-neutral-950"></div>
        <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.8)] max-w-md w-full relative z-10 animate-in slide-in-from-bottom-8 duration-500">
          <div className="w-20 h-20 bg-gradient-to-br from-yellow-600 to-yellow-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-yellow-500/20">
            <KeyRound className="text-yellow-950 w-10 h-10" />
          </div>
          <h1 className="text-3xl font-black mb-2 text-center text-white tracking-wider">
            {authMode === "login" ? "З поверненням!" : "Створення профілю"}
          </h1>
          <p className="text-neutral-400 text-center text-sm mb-8">
            {authMode === "login"
              ? "Увійдіть, щоб продовжити збір колекції."
              : "Створіть акаунт, щоб зберегти свій прогрес назавжди."}
          </p>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authMode === "register" && (
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
                <input
                  type="text"
                  name="nickname"
                  required
                  placeholder="Ваш Нікнейм"
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl pl-12 pr-4 py-4 text-white focus:border-yellow-500 outline-none transition-colors"
                  autoComplete="off"
                />
              </div>
            )}
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
              <input
                type="email"
                name="email"
                required
                placeholder="Електронна пошта"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-xl pl-12 pr-4 py-4 text-white focus:border-yellow-500 outline-none transition-colors"
              />
            </div>
            <div className="relative">
              <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
              <input
                type="password"
                name="password"
                required
                placeholder="Пароль (мін. 6 символів)"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-xl pl-12 pr-4 py-4 text-white focus:border-yellow-500 outline-none transition-colors"
                minLength="6"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-yellow-500 hover:bg-yellow-400 text-yellow-950 font-black py-4 px-4 rounded-xl mt-4 shadow-lg shadow-yellow-500/20 transition-all hover:-translate-y-1"
            >
              {authMode === "login" ? "Увійти в гру" : "Створити акаунт"}
            </button>
          </form>

          <div className="mt-4">
              <button onClick={handleGoogleAuth} type="button" className="w-full bg-white text-neutral-900 hover:bg-gray-100 font-bold py-4 px-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Увійти через Google
              </button>
          </div>

          <div className="mt-8 pt-6 border-t border-neutral-800 text-center">
            <button
              onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setDbError(""); }}
              className="text-neutral-400 hover:text-white font-bold transition-colors text-sm"
            >
              {authMode === "login" ? "Немає акаунту? Зареєструватися" : "Вже є акаунт? Увійти"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans pb-24 relative overflow-x-hidden">
      <style>{globalStyles}</style>
      
      <header className="bg-neutral-900 border-b border-neutral-800 sticky top-0 z-50 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex justify-between items-center">
          
          {/* Логотип Бренду */}
          <div className="flex items-center gap-2 sm:gap-3 text-white font-black text-lg tracking-wider cursor-pointer group" onClick={() => setCurrentView("shop")}>
             <div className="bg-gradient-to-br from-purple-600 to-blue-600 p-1.5 sm:p-2 rounded-xl shadow-[0_0_15px_rgba(147,51,234,0.4)] group-hover:scale-105 transition-transform">
                <Hexagon className="text-white w-5 h-5 sm:w-6 sm:h-6 fill-white/20" />
             </div>
             <span className="hidden sm:block bg-clip-text text-transparent bg-gradient-to-r from-white to-neutral-400 group-hover:to-white transition-colors">Card Game</span>
          </div>

          <div className="flex items-center gap-3 sm:gap-6">
            <button
              onClick={() => setCurrentView("profile")}
              className="flex items-center gap-3 hover:bg-neutral-800 p-1.5 pr-3 rounded-full transition-colors border border-transparent hover:border-neutral-700 text-left relative"
            >
              <PlayerAvatar profile={profile} className="w-10 h-10 rounded-full" iconSize={20} />
              {isPremiumActive && (
                  <div className="absolute -top-1 -left-1 bg-neutral-900 rounded-full p-0.5 shadow-lg border border-fuchsia-500/50 animate-pulse">
                      <Gem size={14} className="text-fuchsia-400 fill-fuchsia-400/20" />
                  </div>
              )}
              <div className="hidden md:block text-left">
                <div className="font-bold text-sm leading-tight text-white flex items-center gap-1">
                    {profile?.nickname}
                    <span className="bg-red-900/50 text-red-400 text-[10px] px-1.5 py-0.5 rounded-md border border-red-800 flex items-center gap-0.5 ml-1" title="Рівень Фарму">
                        <Swords size={10} /> {profile?.farmLevel || 1}
                    </span>
                </div>
                <div className="text-xs text-neutral-400 leading-tight">
                    {isPremiumActive ? <span className="text-fuchsia-400 font-bold">Преміум</span> : "Профіль"}
                </div>
              </div>
            </button>

            <div className="flex items-center gap-2 sm:gap-4">
               {canClaimDaily && (
                  <button 
                     onClick={() => setCurrentView("profile")} 
                     className="relative bg-orange-500/20 text-orange-400 p-2.5 rounded-xl border border-orange-500/30 hover:bg-orange-500/30 transition-colors flex items-center justify-center group" 
                     title="Забрати щоденний бонус!"
                  >
                     <Gift size={20} className="animate-pulse group-hover:animate-none" />
                     <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5">
                         <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                         <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-orange-500"></span>
                     </span>
                  </button>
               )}
               <div className="bg-neutral-950 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl border border-neutral-800 shadow-inner flex gap-2 items-center">
                 <Coins size={18} className="text-yellow-500" />
                 <span className="text-yellow-500 font-black text-base sm:text-lg">{profile?.coins}</span>
               </div>
               <button
                 onClick={() => setCurrentView("premium")}
                 className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl border transition-all ${currentView === "premium" ? "bg-fuchsia-900/40 border-fuchsia-500/60 shadow-[0_0_15px_rgba(217,70,239,0.3)]" : "bg-neutral-950 border-neutral-800 hover:border-fuchsia-500/50"}`}
                 title="Преміум Магазин"
               >
                 <Gem size={18} className="text-fuchsia-400 animate-pulse" />
                 <span className="hidden sm:block text-fuchsia-400 font-bold text-sm tracking-wide">Преміум</span>
               </button>
            </div>
          </div>
        </div>
      </header>

      {toastMsg.text && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full flex items-center gap-2 shadow-lg z-50 animate-bounce text-white font-medium whitespace-nowrap ${
            toastMsg.type === "success" ? "bg-green-600/90" : "bg-red-900/90"
          }`}
        >
          {toastMsg.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          {toastMsg.text}
        </div>
      )}

      <main className="max-w-5xl mx-auto p-4 mt-4 animate-in fade-in duration-500">
        {currentView === "farm" && (
          <FarmView
            profile={profile}
            db={db}
            appId={GAME_ID}
            cardsCatalog={cardsCatalog}
            rarities={rarities}
            showToast={showToast}
            bosses={bosses}
          />
        )}
        {currentView === "shop" && (
          <ShopView
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
            selectedPackId={selectedPackId}
            setSelectedPackId={setSelectedPackId}
            setViewingCard={setViewingCard}
            isAdmin={profile?.isAdmin}
            isProcessing={isProcessing}
            isPremiumActive={isPremiumActive}
          />
        )}
        {currentView === "premium" && (
          <PremiumShopView
            cardStats={cardStats}
             profile={profile}
             user={user}
             db={db}
             appId={GAME_ID}
             premiumPrice={premiumPrice}
             premiumDurationDays={premiumDurationDays}
             premiumShopItems={premiumShopItems}
             showToast={showToast}
             isProcessing={isProcessing}
             setIsProcessing={setIsProcessing}
             addSystemLog={addSystemLog}
             isPremiumActive={isPremiumActive}
             cardsCatalog={cardsCatalog}
             rarities={rarities}
             setViewingCard={setViewingCard}
          />
        )}
        {currentView === "inventory" && (
          <InventoryView
            inventory={fullInventory}
            rarities={rarities}
            sellDuplicate={sellDuplicate}
            sellAllDuplicates={sellAllDuplicates}
            sellEveryDuplicate={sellEveryDuplicate}
            sellPrice={SELL_PRICE}
            catalogTotal={cardsCatalog.length}
            setViewingCard={setViewingCard}
            setListingCard={setListingCard}
            packsCatalog={packsCatalog}
            showcases={showcases}
            createShowcase={createShowcase}
            deleteShowcase={deleteShowcase}
            setMainShowcase={setMainShowcase}
            saveShowcaseCards={saveShowcaseCards}
            profile={profile}
            cardsCatalog={cardsCatalog}
          />
        )}
        {currentView === "market" && (
          <MarketView
            marketListings={marketListings}
            cardsCatalog={cardsCatalog}
            rarities={rarities}
            currentUserUid={user.uid}
            buyFromMarket={buyFromMarket}
            cancelMarketListing={cancelMarketListing}
            setViewingCard={setViewingCard}
            isAdmin={profile?.isAdmin}
          />
        )}
        {currentView === "profile" && (
          <ProfileView
            cardStats = {cardStats}
            profile={profile}
            user={user}
            db={db}
            appId={GAME_ID}
            handleLogout={handleLogout}
            showToast={showToast}
            inventoryCount={fullInventory.length}
            canClaimDaily={canClaimDaily}
            marketListings={marketListings}
            cardsCatalog={cardsCatalog}
            rarities={rarities}
            showcases={showcases}
            fullInventory={fullInventory}
            setViewingCard={setViewingCard}
            dailyRewards={dailyRewards}
            premiumDailyRewards={premiumDailyRewards}
            isPremiumActive={isPremiumActive}
          />
        )}
        {currentView === "rating" && (
          <RatingView 
            db={db} 
            appId={GAME_ID} 
            currentUid={user.uid} 
            setViewingPlayerProfile={(uid) => { setViewingPlayerProfile(uid); setCurrentView("publicProfile"); }} 
          />
        )}
        {currentView === "publicProfile" && viewingPlayerProfile && (
          <PublicProfileView
            cardStats={cardStats}
            db={db}
            appId={GAME_ID}
            targetUid={viewingPlayerProfile}
            goBack={() => setCurrentView("rating")}
            cardsCatalog={cardsCatalog}
            rarities={rarities}
            setViewingCard={setViewingCard}
            packsCatalog={packsCatalog}
          />
        )}
        {currentView === "admin" && profile?.isAdmin && (
          <AdminView
            db={db}
            appId={GAME_ID}
            currentProfile={profile}
            cardsCatalog={cardsCatalog}
            packsCatalog={packsCatalog}
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
            bosses={bosses}
            setBosses={setBosses}
          />
        )}
      </main>

      {/* Модалка для великого перегляду картки з 3D ефектом */}
      {viewingCard && (
        <CardModal viewingCard={viewingCard} setViewingCard={setViewingCard} rarities={rarities} />
      )}

      {/* Модалка для виставлення картки на Ринок */}
      {listingCard && (
         <ListingModal listingCard={listingCard} setListingCard={setListingCard} listOnMarket={listOnMarket} isProcessing={isProcessing} />
      )}

      <nav className="fixed bottom-0 w-full bg-neutral-900 border-t border-neutral-800 px-2 py-2 z-40 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] overflow-x-auto hide-scrollbar">
        <div className="min-w-max mx-auto flex justify-center sm:gap-2">
          <NavButton icon={<Swords size={22} />} label="Фарм" isActive={currentView === "farm"} onClick={() => setCurrentView("farm")} />
          <NavButton icon={<PackageOpen size={22} />} label="Магазин" isActive={currentView === "shop"} onClick={() => { setCurrentView("shop"); setPulledCards([]); setSelectedPackId(null); }} />
          <NavButton icon={<LayoutGrid size={22} />} label="Інвентар" isActive={currentView === "inventory"} onClick={() => setCurrentView("inventory")} />
          <NavButton icon={<Store size={22} />} label="Ринок" isActive={currentView === "market"} onClick={() => setCurrentView("market")} />
          <NavButton icon={<Trophy size={22} />} label="Рейтинг" isActive={currentView === "rating" || currentView === "publicProfile"} onClick={() => setCurrentView("rating")} />
          <NavButton icon={<User size={22} />} label="Профіль" isActive={currentView === "profile"} onClick={() => setCurrentView("profile")} />
          
          {profile?.isAdmin && (
            <button
              onClick={() => setCurrentView("admin")}
              className={`flex flex-col items-center p-2 rounded-lg w-16 sm:w-20 transition-colors ${
                currentView === "admin" ? "text-purple-500" : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <Shield size={22} />
              <span className="text-[9px] sm:text-[10px] mt-1 font-bold uppercase tracking-wider">Адмінка</span>
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}

function NavButton({ icon, label, isActive, onClick }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center p-2 rounded-lg w-16 sm:w-20 transition-colors ${isActive ? "text-yellow-500" : "text-neutral-500 hover:text-neutral-300"}`}>
      {icon}
      <span className="text-[9px] sm:text-[10px] mt-1 font-bold uppercase tracking-wider">{label}</span>
    </button>
  );
}

// --- ПРОФІЛЬ ГРАВЦЯ ---
function ProfileView({ profile, user, db, appId, handleLogout, showToast, inventoryCount, canClaimDaily, dailyRewards, premiumDailyRewards, isPremiumActive, showcases, cardsCatalog, rarities, fullInventory, setViewingCard, cardStats }) {
    const [avatarInput, setAvatarInput] = useState("");
    const [promoInput, setPromoInput] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    // Шукаємо головну вітрину
    const mainShowcase = showcases?.find(s => s.id === profile?.mainShowcaseId);
    
    // Перевіряємо, чи є ці картки у вашому інвентарі
    const validShowcaseCards = [];
    if (mainShowcase && mainShowcase.cardIds) {
        const tempInv = JSON.parse(JSON.stringify(fullInventory));
        for (const cid of mainShowcase.cardIds) {
            const invItem = tempInv.find(i => i.card.id === cid);
            if (invItem && invItem.amount > 0) {
                validShowcaseCards.push(invItem.card);
                invItem.amount -= 1;
            }
        }
    }

    const claimDaily = async () => {
        if (isProcessing || !canClaimDaily) return;
        setIsProcessing(true);
        try {
            const streak = profile.dailyStreak || 0;
            const rewardsArr = isPremiumActive ? premiumDailyRewards : dailyRewards;
            const dayIndex = streak % rewardsArr.length;
            const reward = rewardsArr[dayIndex];

            const newStreak = streak + 1;
            await updateDoc(doc(db, "artifacts", appId, "public", "data", "profiles", user.uid), {
                coins: increment(reward),
                lastDailyClaim: new Date().toISOString(),
                dailyStreak: newStreak
            });
            showToast(`Мій лорд, Ви отримали щоденну нагороду: ${reward} монет!`, "success");
        } catch (e) {
            console.error(e);
            showToast("Помилка отримання нагороди");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleAvatarUpdate = async (e) => {
        e.preventDefault();
        if (isProcessing) return;
        setIsProcessing(true);
        try {
            await updateDoc(doc(db, "artifacts", appId, "public", "data", "profiles", user.uid), {
                avatarUrl: avatarInput
            });
            showToast("Аватар успішно оновлено!", "success");
            setAvatarInput("");
        } catch (e) {
            console.error(e);
            showToast("Помилка оновлення аватару");
        } finally {
            setIsProcessing(false);
        }
    };

    const redeemPromo = async (e) => {
        e.preventDefault();
        if (isProcessing || !promoInput.trim()) return;
        setIsProcessing(true);
        const codeId = promoInput.trim().toUpperCase();
        try {
            const promoRef = doc(db, "artifacts", appId, "public", "data", "promoCodes", codeId);
            const promoSnap = await getDoc(promoRef);
            if (!promoSnap.exists()) {
                showToast("Промокод не знайдено!", "error");
                setIsProcessing(false);
                return;
            }
            const promoData = promoSnap.data();

            const usesRef = collection(db, "artifacts", appId, "users", user.uid, "promoUses");
            const userUseDoc = await getDoc(doc(usesRef, codeId));
            const userUsesCount = userUseDoc.exists() ? userUseDoc.data().count : 0;

            if (promoData.maxGlobalUses > 0 && promoData.currentGlobalUses >= promoData.maxGlobalUses) {
                showToast("Ліміт використання промокоду на сервері вичерпано!", "error");
                setIsProcessing(false);
                return;
            }
            if (promoData.maxUserUses > 0 && userUsesCount >= promoData.maxUserUses) {
                showToast("Ви вже використали цей промокод максимальну кількість разів!", "error");
                setIsProcessing(false);
                return;
            }

            const batch = writeBatch(db);
            batch.update(promoRef, { currentGlobalUses: increment(1) });
            batch.set(doc(usesRef, codeId), { count: increment(1) }, { merge: true });
            batch.update(doc(db, "artifacts", appId, "public", "data", "profiles", user.uid), {
                coins: increment(promoData.reward)
            });
            await batch.commit();
            showToast(`Промокод успішно застосовано! Отримано: ${promoData.reward} монет`, "success");
            setPromoInput("");
        } catch (e) {
            console.error(e);
            showToast("Помилка застосування промокоду");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="pb-10 animate-in fade-in zoom-in-95 duration-500">
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 text-center relative overflow-hidden mb-8 shadow-xl">
                <div className={`absolute top-0 left-0 w-full h-32 bg-gradient-to-b ${profile?.isSuperAdmin ? "from-orange-900/40" : profile?.isAdmin ? "from-purple-900/40" : isPremiumActive ? "from-fuchsia-900/30" : "from-blue-900/20"} to-transparent`}></div>
                
                <div className="relative w-24 h-24 mx-auto mb-4 z-10">
                    <PlayerAvatar profile={profile} className={`w-full h-full rounded-full text-4xl ${isPremiumActive ? 'border-4 border-fuchsia-500 shadow-[0_0_20px_rgba(217,70,239,0.5)]' : ''}`} iconSize={48} />
                    {isPremiumActive && (
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-neutral-900 rounded-full p-1 border-2 border-fuchsia-500 z-20">
                            <Gem size={16} className="text-fuchsia-400 fill-fuchsia-400" />
                        </div>
                    )}
                </div>
                
                <h2 className="text-3xl font-black text-white mb-1 relative z-10 flex justify-center items-center gap-2">
                    {profile?.nickname}
                    <span className="bg-red-600/20 text-red-400 text-sm px-2 py-1 rounded-xl border border-red-500/50 flex items-center gap-1" title="Ваш рівень Фарму">
                        <Swords size={16} /> {profile?.farmLevel || 1}
                    </span>
                    {isPremiumActive && <Gem size={18} className="text-fuchsia-400 fill-fuchsia-400" title="Преміум Гравець" />}
                </h2>
                <div className="text-neutral-500 text-sm flex justify-center gap-4 mt-2 mb-6">
                    <span className="flex items-center gap-1"><CalendarDays size={14}/> З нами від: {formatDate(profile?.createdAt)}</span>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 relative z-10 max-w-2xl mx-auto">
                    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col items-center">
                        <Coins className="text-yellow-500 mb-2 w-6 h-6" />
                        <span className="text-xl font-black text-white">{profile?.coins}</span>
                        <span className="text-[10px] text-neutral-500 font-bold uppercase mt-1">Монети</span>
                    </div>
                    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col items-center">
                        <LayoutGrid className="text-blue-500 mb-2 w-6 h-6" />
                        <span className="text-xl font-black text-white">{inventoryCount}</span>
                        <span className="text-[10px] text-neutral-500 font-bold uppercase mt-1">Унікальних карт</span>
                    </div>
                    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col items-center">
                        <PackageOpen className="text-purple-500 mb-2 w-6 h-6" />
                        <span className="text-xl font-black text-white">{profile?.packsOpened || 0}</span>
                        <span className="text-[10px] text-neutral-500 font-bold uppercase mt-1">Відкрито паків</span>
                    </div>
                    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col items-center">
                        <Coins className="text-red-500 mb-2 w-6 h-6" />
                        <span className="text-xl font-black text-white">{profile?.coinsSpentOnPacks || 0}</span>
                        <span className="text-[10px] text-neutral-500 font-bold uppercase mt-1">Витрачено <Coins size={8} className="inline"/></span>
                    </div>
                    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col items-center">
                        <Zap className="text-green-500 mb-2 w-6 h-6" />
                        <span className="text-xl font-black text-white">{profile?.coinsEarnedFromPacks || 0}</span>
                        <span className="text-[10px] text-neutral-500 font-bold uppercase mt-1">Виграно <Coins size={8} className="inline"/></span>
                    </div>
                </div>
            </div>
                    {/* ВІТРИНА ГРАВЦЯ */}
            {mainShowcase && validShowcaseCards.length > 0 && (
                <div className="mb-10 max-w-4xl mx-auto">
                    <div className="flex items-center gap-3 mb-4 justify-center">
                        <Star className="text-yellow-500 fill-yellow-500" size={24} />
                        <h3 className="text-2xl font-black text-white uppercase tracking-widest">{mainShowcase.name}</h3>
                    </div>
                    <div className="bg-neutral-900 border-2 border-yellow-500/30 rounded-3xl p-6 flex flex-wrap justify-center gap-4 shadow-[0_0_30px_rgba(234,179,8,0.1)]">
                        {validShowcaseCards.map((card, idx) => {
                            const style = getCardStyle(card.rarity, rarities);
                            const effectClass = card.effect ? `effect-${card.effect}` : '';
                            return (
                                <div key={idx} onClick={() => setViewingCard({ card, amount: 1 })} className="relative group cursor-pointer animate-in zoom-in-95 hover:-translate-y-2 transition-transform">
                                    <div className={`w-28 sm:w-36 aspect-[2/3] rounded-xl border-2 overflow-hidden bg-neutral-950 shadow-lg ${style.border} ${effectClass}`}>
                                        {Number(card.maxSupply) > 0 && (
                                            <div className="absolute top-1 left-1 bg-black/90 text-white text-[8px] sm:text-[10px] px-2 py-1 rounded-md border border-neutral-700 font-black z-10">
                                                {cardStats?.[card.id] || 0} / {card.maxSupply}
                                            </div>
                                        )}
                                        <img src={card.image} alt={card.name} className="w-full h-full object-cover" />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                {/* Щоденна нагорода */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 relative overflow-hidden group">
                    <div className="absolute -right-6 -bottom-6 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Gift size={120} />
                    </div>
                    <h3 className="text-xl font-black text-white mb-2 flex items-center gap-2 relative z-10"><Gift className="text-orange-500" /> Щоденна Нагорода</h3>
                    <p className="text-sm text-neutral-400 mb-4 relative z-10">Отримуйте монети кожного дня! {isPremiumActive ? 'Преміум дає більше нагород.' : ''}</p>
                    <button 
                        onClick={claimDaily} 
                        disabled={!canClaimDaily || isProcessing}
                        className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all relative z-10 ${
                            canClaimDaily 
                            ? "bg-gradient-to-r from-orange-600 to-yellow-500 text-yellow-950 hover:from-orange-500 hover:to-yellow-400 shadow-[0_0_20px_rgba(249,115,22,0.4)]" 
                            : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                        }`}
                    >
                        {canClaimDaily ? "Отримати нагороду" : "Вже отримано (Чекайте завтра)"}
                    </button>
                </div>

                {/* Промокоди */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 relative overflow-hidden group">
                    <div className="absolute -right-6 -bottom-6 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Ticket size={120} />
                    </div>
                    <h3 className="text-xl font-black text-white mb-2 flex items-center gap-2 relative z-10"><Ticket className="text-purple-500" /> Промокоди</h3>
                    <p className="text-sm text-neutral-400 mb-4 relative z-10">Введіть код для отримання бонусів.</p>
                    <form onSubmit={redeemPromo} className="flex gap-2 relative z-10">
                        <input 
                            type="text" 
                            value={promoInput} 
                            onChange={(e) => setPromoInput(e.target.value.toUpperCase())} 
                            placeholder="Код..." 
                            className="flex-1 bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white uppercase focus:border-purple-500 outline-none" 
                        />
                        <button type="submit" disabled={isProcessing || !promoInput.trim()} className="bg-purple-600 hover:bg-purple-500 disabled:bg-neutral-800 text-white font-bold px-6 py-3 rounded-xl transition-colors">
                            Ок
                        </button>
                    </form>
                </div>

                {/* Налаштування профілю */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 relative overflow-hidden group md:col-span-2">
                    <h3 className="text-xl font-black text-white mb-2 flex items-center gap-2 relative z-10"><Settings className="text-blue-500" /> Налаштування</h3>
                    <div className="flex flex-col sm:flex-row gap-6 mt-4">
                        <div className="flex-1">
                            <label className="text-xs font-bold text-neutral-400 uppercase mb-2 block">Змінити Аватар (URL картинки):</label>
                            <form onSubmit={handleAvatarUpdate} className="flex gap-2 relative z-10">
                                <input 
                                    type="text" 
                                    value={avatarInput} 
                                    onChange={(e) => setAvatarInput(e.target.value)} 
                                    placeholder="https://..." 
                                    className="flex-1 bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none text-sm" 
                                />
                                <button type="submit" disabled={isProcessing} className="bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 text-white font-bold px-4 py-3 rounded-xl transition-colors text-sm">
                                    Зберегти
                                </button>
                            </form>
                        </div>
                        <div className="flex-1 flex items-end">
                            <button onClick={handleLogout} className="w-full bg-red-900/40 hover:bg-red-900 text-red-400 hover:text-white font-bold py-3 px-6 rounded-xl transition-colors flex justify-center items-center gap-2 border border-red-900/50">
                                <LogOut size={18} /> Вийти з акаунту
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- ПРЕМІУМ МАГАЗИН ---
function PremiumShopView({ profile, cardStats, user, db, appId, premiumPrice, premiumDurationDays, premiumShopItems, showToast, isProcessing, setIsProcessing, addSystemLog, isPremiumActive, cardsCatalog, rarities, setViewingCard }) {
    
    const [newNickname, setNewNickname] = useState("");

    const buyPremium = async () => {
        if (isProcessing) return;
        if (profile.coins < premiumPrice) return showToast("Недостатньо монет для покупки Преміум-акаунту!");

        setIsProcessing(true);
        try {
            const now = new Date();
            // Якщо вже є преміум, додаємо дні до поточного терміну, якщо ні - від сьогодні
            const currentExp = isPremiumActive ? new Date(profile.premiumUntil) : now;
            currentExp.setDate(currentExp.getDate() + premiumDurationDays);
            
            const profileRef = doc(db, "artifacts", appId, "public", "data", "profiles", user.uid);
            await updateDoc(profileRef, {
                coins: increment(-premiumPrice),
                isPremium: true,
                premiumUntil: currentExp.toISOString()
            });

            showToast(`Ви успішно придбали Преміум-акаунт на ${premiumDurationDays} днів!`, "success");
            addSystemLog("Магазин", `Гравець ${profile.nickname} купив Преміум за ${premiumPrice} монет.`);
        } catch (e) {
            console.error(e);
            showToast("Помилка під час покупки преміуму.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleNicknameChange = async (e) => {
        e.preventDefault();
        if (isProcessing) return;
        const nn = newNickname.trim();
        if (!nn) return showToast("Введіть новий нікнейм!");
        if (profile.coins < 100000) return showToast("Недостатньо монет!");
        
        setIsProcessing(true);
        try {
            // Перевірка на унікальність
            const profilesSnap = await getDocs(collection(db, "artifacts", appId, "public", "data", "profiles"));
            let exists = false;
            profilesSnap.forEach(d => {
                if (d.data().nickname?.toLowerCase() === nn.toLowerCase()) exists = true;
            });
            
            if (exists) {
                showToast("Цей нікнейм вже зайнятий іншим гравцем!", "error");
                setIsProcessing(false);
                return;
            }
            
            const profileRef = doc(db, "artifacts", appId, "public", "data", "profiles", user.uid);
            await updateDoc(profileRef, {
                nickname: nn,
                coins: increment(-100000)
            });
            
            showToast("Мій лорд, ваш нікнейм успішно змінено!", "success");
            addSystemLog("Магазин", `Гравець змінив нікнейм на ${nn} за 100000 монет.`);
            setNewNickname("");
        } catch (err) {
            console.error(err);
            showToast("Помилка зміни нікнейму.");
        } finally {
            setIsProcessing(false);
        }
    };

    const buyItem = async (item) => {
        if (isProcessing) return;
        if (!isPremiumActive) return showToast("Цей товар доступний лише для власників Преміум-акаунту!");
        if (profile.coins < item.price) return showToast("Недостатньо монет!");

        setIsProcessing(true);
        try {
            const batch = writeBatch(db);
            const profileRef = doc(db, "artifacts", appId, "public", "data", "profiles", user.uid);

            if (item.type === "card") {
                const invRef = doc(db, "artifacts", appId, "users", user.uid, "inventory", item.itemId);
                batch.set(invRef, { amount: increment(1) }, { merge: true });
                batch.update(profileRef, { coins: increment(-item.price), totalCards: increment(1) });
            }

            await batch.commit();
            showToast(`Ви успішно придбали ${item.name}!`, "success");
            addSystemLog("Магазин", `Гравець ${profile.nickname} купив ексклюзив ${item.name} за ${item.price} монет.`);
        } catch (e) {
            console.error(e);
            showToast("Помилка під час покупки товару.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="pb-10 animate-in fade-in zoom-in-95 duration-500">
            <div className="text-center mb-10">
                <h2 className="text-4xl font-black mb-2 text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-purple-600 uppercase tracking-widest flex items-center justify-center gap-3">
                    <Gem className="text-fuchsia-500 w-10 h-10" /> Преміум Магазин
                </h2>
                <p className="text-neutral-400">Ексклюзивні пропозиції для елітних лордів.</p>
            </div>

            {/* БЛОК КУПІВЛІ ПРЕМІУМУ */}
            <div className="bg-gradient-to-br from-neutral-900 to-purple-950/30 border-2 border-fuchsia-500/30 rounded-3xl p-6 sm:p-10 text-center max-w-2xl mx-auto shadow-[0_0_40px_rgba(217,70,239,0.15)] mb-12 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-fuchsia-600 via-purple-600 to-fuchsia-600"></div>
                <Gem size={60} className="mx-auto text-fuchsia-400 mb-6 drop-shadow-[0_0_20px_rgba(217,70,239,0.5)] animate-pulse" />
                <h3 className="text-3xl font-black text-white mb-4">Преміум Акаунт ({premiumDurationDays} Днів)</h3>
                
                <div className="text-left max-w-sm mx-auto mb-8 space-y-3">
                    <div className="flex items-center gap-3 text-neutral-200">
                        <CheckCircle2 className="text-fuchsia-500" size={20}/>
                        <span>Ексклюзивна іконка у профілі та рейтингу</span>
                    </div>
                    <div className="flex items-center gap-3 text-neutral-200">
                        <CheckCircle2 className="text-fuchsia-500" size={20}/>
                        <span>Підвищені щоденні нагороди (+200% в середньому)</span>
                    </div>
                    <div className="flex items-center gap-3 text-neutral-200">
                        <CheckCircle2 className="text-fuchsia-500" size={20}/>
                        <span>Доступ до Преміум-паків у магазині</span>
                    </div>
                    <div className="flex items-center gap-3 text-neutral-200">
                        <CheckCircle2 className="text-fuchsia-500" size={20}/>
                        <span>Доступ до унікальних карток нижче</span>
                    </div>
                </div>

                {isPremiumActive ? (
                    <div className="bg-fuchsia-900/30 border border-fuchsia-500/50 p-4 rounded-xl text-fuchsia-100 font-bold mb-4">
                        Ваш преміум активний до: {formatDate(profile.premiumUntil)}
                    </div>
                ) : null}

                <button 
                    onClick={buyPremium} 
                    disabled={isProcessing}
                    className="w-full sm:w-auto bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white font-black text-lg py-4 px-12 rounded-2xl shadow-xl transition-transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 mx-auto"
                >
                    {isPremiumActive ? `Продовжити ще на ${premiumDurationDays} днів` : "Придбати Преміум"}
                    <span className="bg-black/30 px-3 py-1 rounded-lg text-sm flex items-center gap-1">
                        {premiumPrice} <Coins size={16}/>
                    </span>
                </button>
            </div>

            {/* БЛОК ЗМІНИ НІКНЕЙМУ */}
            <div className="bg-gradient-to-br from-neutral-900 to-blue-950/30 border-2 border-blue-500/30 rounded-3xl p-6 sm:p-10 text-center max-w-2xl mx-auto shadow-[0_0_40px_rgba(59,130,246,0.15)] mb-12 relative overflow-hidden">
                <Edit2 size={48} className="mx-auto text-blue-400 mb-4 drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]" />
                <h3 className="text-2xl font-black text-white mb-2">Зміна Нікнейму</h3>
                <p className="text-neutral-400 text-sm mb-6">Бажаєте нове ім'я, Мій лорд? Унікальне ім'я коштує 100,000 монет.</p>
                
                <form onSubmit={handleNicknameChange} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                    <input type="text" value={newNickname} onChange={(e) => setNewNickname(e.target.value)} placeholder="Новий нікнейм" required className="flex-1 bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none" />
                    <button type="submit" disabled={isProcessing} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                        Купити <span className="bg-black/30 px-2 py-1 rounded-lg text-xs flex items-center gap-1">100k <Coins size={12}/></span>
                    </button>
                </form>
            </div>

            {/* ТОВАРИ ПРЕМІУМ МАГАЗИНУ */}
            {premiumShopItems && premiumShopItems.length > 0 && (
                <div>
                    <h3 className="text-2xl font-black text-white text-center mb-8 uppercase tracking-widest flex items-center justify-center gap-2">
                        <Star className="text-fuchsia-500" /> Ексклюзивні Товари
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                        {premiumShopItems.map((item, idx) => {
                            // Якщо це картка, дістаємо її дані
                            let cDef = null;
                            if (item.type === "card") {
                                cDef = cardsCatalog.find(c => c.id === item.itemId);
                            }

                            return (
                                <div key={idx} className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 flex flex-col items-center justify-between relative group hover:border-fuchsia-900 transition-colors shadow-lg">
                                    {!isPremiumActive && (
                                        <div className="absolute inset-0 bg-neutral-950/80 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center rounded-3xl border-2 border-neutral-800">
                                            <Gem className="text-fuchsia-900/50 w-16 h-16 mb-2" />
                                            <span className="font-bold text-neutral-500 uppercase tracking-widest text-sm">Тільки для Преміум</span>
                                        </div>
                                    )}

                                    <div className="text-[10px] text-fuchsia-400 font-bold uppercase tracking-widest text-center mb-1">Ексклюзив</div>
                                    <h3 className="text-xl font-bold text-white mb-2 text-center w-full">{item.name || (cDef ? cDef.name : "Невідомий товар")}</h3>
                                    
                                    <div className="relative w-32 aspect-[2/3] mb-6 flex justify-center items-center shadow-xl rounded-xl overflow-hidden border-2 border-fuchsia-500/50">
                                        <img src={item.image || (cDef ? cDef.image : "")} alt="item" className="w-full h-full object-cover" />
                                        {cDef && (
                                            <button onClick={() => setViewingCard({ card: cDef, amount: 1 })} className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity z-10">
                                                <Eye className="text-white w-8 h-8" />
                                            </button>
                                        )}
                                    </div>
                                    
                                    <div className="text-center text-sm text-neutral-400 mb-4 h-10 overflow-hidden line-clamp-2">
                                        {item.description}
                                    </div>

                                    <button onClick={() => buyItem(item)} className="w-full py-3 rounded-xl font-black text-white bg-blue-600 hover:bg-blue-500 flex items-center justify-center gap-2 transition-all">
                                        Купити за {item.price} <Coins size={16} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

// --- РИНОК ГРАВЦІВ ---
function MarketView({ marketListings, cardsCatalog, rarities, currentUserUid, buyFromMarket, cancelMarketListing, setViewingCard, isAdmin }) {
  const [tab, setTab] = useState("all");

  const activeListings = marketListings.filter(l => (!l.status || l.status === "active") && (tab === "my" ? l.sellerUid === currentUserUid : true));

  return (
     <div className="pb-10 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
           <div className="text-center sm:text-left">
              <h2 className="text-3xl font-black text-white uppercase tracking-widest flex items-center justify-center sm:justify-start gap-3">
                 <Store className="text-blue-500 w-8 h-8" /> Ринок Карток
              </h2>
              <p className="text-neutral-400 text-sm">Купуйте рідкісні лоти в інших гравців!</p>
           </div>
           
           <div className="flex bg-neutral-900 border border-neutral-800 rounded-xl p-1 w-full sm:w-auto">
              <button onClick={() => setTab("all")} className={`flex-1 sm:px-6 py-2 rounded-lg font-bold text-sm transition-colors ${tab === "all" ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"}`}>
                 Всі лоти
              </button>
              <button onClick={() => setTab("my")} className={`flex-1 sm:px-6 py-2 rounded-lg font-bold text-sm transition-colors ${tab === "my" ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"}`}>
                 Мої продажі
              </button>
           </div>
        </div>

        {activeListings.length === 0 ? (
           <div className="text-center py-20 bg-neutral-900/30 rounded-3xl border-2 border-dashed border-neutral-800">
             <Tag size={60} className="mx-auto mb-4 text-neutral-600 opacity-50" />
             <p className="text-lg font-bold text-neutral-400">Активних лотів не знайдено.</p>
             {tab === "my" && <p className="text-sm text-neutral-500 mt-2">Перейдіть в Інвентар, щоб виставити картку на продаж.</p>}
           </div>
        ) : (
           <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {activeListings.map(listing => {
                 const card = cardsCatalog.find(c => c.id === listing.cardId);
                 if (!card) return null;
                 const style = getCardStyle(card.rarity, rarities);
                 const effectClass = card.effect ? `effect-${card.effect}` : '';
                 const isMine = listing.sellerUid === currentUserUid;

                 return (
                    <div key={listing.id} className="flex flex-col items-center animate-in zoom-in-95 group">
                        <div onClick={() => setViewingCard({ card })} className={`relative w-full aspect-[2/3] rounded-xl border-2 overflow-hidden bg-neutral-900 mb-3 cursor-pointer transition-all duration-300 group-hover:-translate-y-2 group-hover:shadow-[0_15px_30px_rgba(0,0,0,0.6)] ${style.border} ${effectClass}`}>
                            <img src={card.image} alt={card.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                            {card.soundUrl && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); playCardSound(card.soundUrl, card.soundVolume); }}
                                  className="absolute bottom-1 right-1 bg-black/80 text-white p-1.5 rounded-full hover:text-blue-400 z-30 transition-colors shadow-lg"
                                  title="Відтворити звук"
                                >
                                  <Volume2 size={12} />
                                </button>
                            )}
                        </div>
                        
                        <div className="w-full px-1 text-center flex flex-col items-center">
                            <div className="font-bold text-xs text-white truncate w-full mb-1">{card.name}</div>
                            <div className="text-[10px] text-neutral-500 mb-2 truncate w-full flex items-center justify-center gap-1">
                               <User size={10} /> {listing.sellerNickname}
                            </div>
                            
                            {isMine ? (
                               <button onClick={() => cancelMarketListing(listing)} className="w-full bg-red-900/50 hover:bg-red-600 text-red-200 hover:text-white text-xs font-bold py-2 rounded-lg transition-colors border border-red-800">
                                   Зняти з продажу
                               </button>
                            ) : (
                               <div className="w-full flex gap-1">
                                   <button onClick={() => buyFromMarket(listing)} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 rounded-lg transition-colors shadow-lg shadow-blue-900/20 flex justify-center items-center gap-1">
                                       Купити ({listing.price} <Coins size={10}/>)
                                   </button>
                                   {isAdmin && (
                                       <button onClick={() => cancelMarketListing(listing)} className="bg-red-900 text-red-400 hover:bg-red-600 hover:text-white p-2 rounded-lg" title="Примусово видалити лот (Адмін)">
                                          <Trash2 size={14} />
                                       </button>
                                   )}
                               </div>
                            )}
                        </div>
                    </div>
                 );
              })}
           </div>
        )}
     </div>
  );
}

// --- МОДАЛКА ВИСТАВЛЕННЯ НА РИНОК ---
function ListingModal({ listingCard, setListingCard, listOnMarket, isProcessing }) {
    const [price, setPrice] = useState("");

    const handleSubmit = (e) => {
        e.preventDefault();
        listOnMarket(listingCard.id, Number(price));
    };

    return (
       <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => !isProcessing && setListingCard(null)}>
           <div className="bg-neutral-900 border border-blue-900/50 p-6 rounded-3xl shadow-[0_0_50px_rgba(37,99,235,0.2)] max-w-sm w-full animate-in zoom-in-95 relative" onClick={e => e.stopPropagation()}>
               <div className="flex items-center gap-3 mb-6 border-b border-neutral-800 pb-4">
                   <div className="w-16 h-24 rounded-lg overflow-hidden border border-neutral-700 shrink-0">
                       <img src={listingCard.image} alt={listingCard.name} className="w-full h-full object-cover" />
                   </div>
                   <div>
                       <h3 className="text-lg font-black text-white leading-tight">{listingCard.name}</h3>
                       <div className="text-xs text-neutral-400 mt-1">Виставлення на Ринок</div>
                   </div>
               </div>

               <form onSubmit={handleSubmit} className="space-y-4">
                   <div>
                       <label className="text-xs font-bold text-neutral-400 uppercase mb-2 block">Ваша ціна (Монети):</label>
                       <div className="relative">
                           <Coins className="absolute left-4 top-1/2 -translate-y-1/2 text-yellow-500 w-5 h-5" />
                           <input type="number" min="1" value={price} onChange={e => setPrice(e.target.value)} placeholder="Наприклад: 1000" required className="w-full bg-neutral-950 border border-neutral-700 rounded-xl pl-12 pr-4 py-4 text-white focus:border-blue-500 outline-none text-lg font-bold" />
                       </div>
                   </div>
                   <div className="flex gap-3 pt-2">
                       <button type="submit" disabled={isProcessing} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-black py-4 rounded-xl transition-colors shadow-lg shadow-blue-900/20">Продати</button>
                       <button type="button" disabled={isProcessing} onClick={() => setListingCard(null)} className="bg-neutral-800 hover:bg-neutral-700 text-white font-bold py-4 px-6 rounded-xl transition-colors">Скасувати</button>
                   </div>
               </form>
           </div>
       </div>
    );
}

// --- МАГАЗИН ПАКІВ ---
function ShopView({ packs, cardsCatalog, cardStats, rarities, openPack, openingPackId, isRouletteSpinning, rouletteItems, pulledCards, setPulledCards, sellPulledCards, selectedPackId, setSelectedPackId, setViewingCard, isAdmin, isProcessing, isPremiumActive }) {
  
  const [roulettePos, setRoulettePos] = useState(0);
  const [rouletteOffset, setRouletteOffset] = useState(0);
  const [activeCategory, setActiveCategory] = useState("all");

  useEffect(() => {
    if (isRouletteSpinning) {
      setRoulettePos(0);
      setRouletteOffset(Math.floor(Math.random() * 100) - 50); 
      
      const timer = setTimeout(() => {
        setRoulettePos(1); 
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isRouletteSpinning]);

  // Автоматичне відтворення звуку найрідкіснішої картки після відкриття паку
  useEffect(() => {
      if (pulledCards && pulledCards.length > 0) {
          const cardsWithSound = pulledCards.filter(c => c.soundUrl);
          if (cardsWithSound.length > 0) {
              cardsWithSound.sort((a,b) => getCardWeight(a.rarity, rarities) - getCardWeight(b.rarity, rarities));
              playCardSound(cardsWithSound[0].soundUrl, cardsWithSound[0].soundVolume);
          }
      }
  }, [pulledCards, rarities]);

  if (isRouletteSpinning && rouletteItems.length > 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[65vh] animate-in fade-in duration-500 w-full pb-10 overflow-hidden">
        <h2 className="text-3xl font-black mb-10 text-white uppercase tracking-widest text-center animate-pulse drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
          Відкриваємо пак...
        </h2>

        <div className="relative w-full max-w-4xl mx-auto bg-neutral-900 border-[4px] border-neutral-700 rounded-3xl h-72 shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden">
          <div className="absolute inset-y-0 left-0 w-16 sm:w-32 bg-gradient-to-r from-neutral-950 to-transparent z-20 pointer-events-none"></div>
          <div className="absolute inset-y-0 right-0 w-16 sm:w-32 bg-gradient-to-l from-neutral-950 to-transparent z-20 pointer-events-none"></div>

          <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-yellow-500 z-30 -translate-x-1/2 shadow-[0_0_15px_rgba(234,179,8,1)]"></div>
          <div className="absolute left-1/2 top-0 -translate-x-1/2 border-solid border-t-[20px] border-t-yellow-500 border-x-[15px] border-x-transparent z-40"></div>
          <div className="absolute left-1/2 bottom-0 -translate-x-1/2 border-solid border-b-[20px] border-b-yellow-500 border-x-[15px] border-x-transparent z-40"></div>

          <div
              className="absolute inset-y-0 flex items-center gap-4"
              style={{
                  left: '50%', 
                  transition: roulettePos === 1 ? 'transform 4.5s cubic-bezier(0.1, 0.85, 0.1, 1)' : 'none',
                  transform: roulettePos === 1
                      ? `translateX(-${35 * 176 + 80 + rouletteOffset}px)`
                      : `translateX(-80px)`
              }}
          >
              {rouletteItems.map((item, i) => {
                  const style = getCardStyle(item.rarity, rarities);
                  const effectClass = item.effect ? `effect-${item.effect}` : '';
                  return (
                      <div key={i} className={`w-40 h-56 rounded-2xl border-4 shrink-0 bg-neutral-950 relative overflow-hidden shadow-xl ${style.border} ${effectClass}`}>
                          <img src={item.image} alt="card" className="absolute inset-0 w-full h-full object-cover" />
                          <div className="absolute bottom-0 left-0 right-0 bg-black/80 backdrop-blur text-center py-1.5 border-t border-neutral-800 z-10">
                             <span className={`text-[10px] font-black uppercase tracking-widest ${style.text}`}>{item.rarity}</span>
                          </div>
                      </div>
                  );
              })}
          </div>
        </div>
      </div>
    );
  }

  if (pulledCards && pulledCards.length > 0) {
    const totalSellPrice = pulledCards.reduce((acc, c) => acc + (c.sellPrice ? Number(c.sellPrice) : SELL_PRICE), 0);

    return (
      <div className="flex flex-col items-center min-h-[65vh] animate-in zoom-in-95 duration-700 w-full pb-10">
        <h2 className="text-3xl sm:text-4xl font-black mb-8 text-white uppercase tracking-widest text-center drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">
          Ви отримали {pulledCards.length > 1 ? `(${pulledCards.length} шт)` : "!"}
        </h2>
        
        <div className="flex flex-wrap justify-center gap-6 mb-10 w-full max-h-[60vh] overflow-y-auto hide-scrollbar p-4">
          {pulledCards.map((card, index) => {
            const style = getCardStyle(card.rarity, rarities);
            const effectClass = card.effect ? `effect-${card.effect}` : '';
            return (
              <div 
                key={index} 
                onClick={() => setViewingCard({ card, amount: 1 })}
                className="flex flex-col items-center animate-in zoom-in slide-in-from-bottom-6 cursor-pointer group" 
                style={{ animationDelay: `${Math.min(index * 50, 2000)}ms`, fillMode: 'both' }}
              >
                <div className={`w-32 sm:w-40 md:w-56 aspect-[2/3] rounded-2xl border-4 overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.6)] transform transition-all group-hover:scale-105 group-hover:rotate-2 ${style.border} bg-neutral-900 relative mb-4 ${effectClass}`}>
                  <img src={card.image} alt={card.name} className="w-full h-full object-cover" />
                  {Number(card.maxSupply) > 0 && (
                    <div className="absolute top-2 right-2 bg-black/90 text-white text-[8px] sm:text-[10px] px-2 py-1 rounded-md border border-neutral-700 font-black z-10">
                      {cardStats[card.id] || 0} / {card.maxSupply}
                    </div>
                  )}
                  {card.soundUrl && (
                      <button
                        onClick={(e) => { e.stopPropagation(); playCardSound(card.soundUrl, card.soundVolume); }}
                        className="absolute bottom-2 right-2 bg-black/80 text-white p-2 rounded-full hover:text-blue-400 z-30 transition-colors shadow-lg"
                        title="Відтворити звук"
                      >
                        <Volume2 size={16} />
                      </button>
                  )}
                </div>
                <div className="text-center w-full px-2">
                  <div className={`text-[10px] sm:text-xs font-black uppercase tracking-widest flex justify-center items-center gap-1 ${style.text}`}>
                    <Sparkles size={12} /> {card.rarity}
                  </div>
                  <h3 className="font-bold text-white text-xs sm:text-sm truncate w-full group-hover:text-yellow-100 transition-colors">{card.name}</h3>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => setPulledCards([])}
              className="px-8 py-4 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-xl transition-all hover:-translate-y-1 shadow-lg border border-neutral-700"
            >
              Забрати картки
            </button>
            <button
              onClick={sellPulledCards}
              disabled={isProcessing}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-bold rounded-xl transition-all hover:-translate-y-1 shadow-lg flex items-center justify-center gap-2"
            >
              Продати всі (+{totalSellPrice} <Coins size={16}/>)
            </button>
        </div>
      </div>
    );
  }

  const selectedPack = packs.find((p) => p.id === selectedPackId);

  if (selectedPack) {
    const packCards = cardsCatalog
      .filter((c) => c.packId === selectedPackId)
      .sort((a, b) => getCardWeight(a.rarity, rarities) - getCardWeight(b.rarity, rarities));

    return (
      <div className="pb-10 animate-in fade-in slide-in-from-right-8 duration-500">
        <button onClick={() => setSelectedPackId(null)} className="mb-6 flex items-center gap-2 text-neutral-400 hover:text-white transition-colors font-bold px-4 py-2 bg-neutral-900 rounded-lg hover:bg-neutral-800 w-fit border border-neutral-800">
          <ArrowLeft size={20} /> Назад
        </button>

        <div className="flex flex-col items-center mb-12 bg-neutral-900/50 p-6 rounded-3xl border border-neutral-800 max-w-3xl mx-auto">
          {selectedPack.isPremiumOnly && (
              <div className="bg-fuchsia-900/50 text-fuchsia-300 px-4 py-1.5 rounded-full font-bold uppercase tracking-widest text-xs flex items-center gap-2 mb-3 border border-fuchsia-500/30">
                  <Gem size={14}/> Преміум Пак
              </div>
          )}
          <h2 className="text-3xl font-black mb-6 text-white text-center">{selectedPack.name}</h2>
          
          <div className="relative w-48 h-48 mb-8 flex justify-center items-center perspective-1000">
            {openingPackId === selectedPack.id ? (
              <div className="w-full h-full bg-gradient-to-br from-indigo-900 to-purple-900 rounded-2xl border-4 border-indigo-500 shadow-[0_0_40px_rgba(99,102,241,0.6)] animate-pulse flex items-center justify-center">
                <Loader2 className="animate-spin text-indigo-300 w-12 h-12" />
              </div>
            ) : (
              <div className={`w-full h-full bg-neutral-800 rounded-2xl border-4 overflow-hidden ${selectedPack.isPremiumOnly ? 'border-fuchsia-600 shadow-[0_10px_40px_rgba(217,70,239,0.3)]' : 'border-neutral-700 shadow-[0_10px_40px_rgba(0,0,0,0.5)]'}`}>
                <img src={selectedPack.image} alt={selectedPack.name} className="w-full h-full object-cover" />
              </div>
            )}
          </div>

          <div className="flex flex-wrap justify-center gap-3 w-full">
            <OpenButton amount={1} cost={selectedPack.cost} onClick={() => openPack(selectedPack.id, selectedPack.cost, 1)} opening={openingPackId === selectedPack.id || isProcessing} />
            <OpenButton amount={5} cost={selectedPack.cost} onClick={() => openPack(selectedPack.id, selectedPack.cost, 5)} opening={openingPackId === selectedPack.id || isProcessing} color="bg-orange-500 hover:bg-orange-400 text-orange-950" />
            <OpenButton amount={10} cost={selectedPack.cost} onClick={() => openPack(selectedPack.id, selectedPack.cost, 10)} opening={openingPackId === selectedPack.id || isProcessing} color="bg-red-500 hover:bg-red-400 text-red-950" />
            <OpenButton amount={100} cost={selectedPack.cost} onClick={() => openPack(selectedPack.id, selectedPack.cost, 100)} opening={openingPackId === selectedPack.id || isProcessing} color="bg-purple-600 hover:bg-purple-500 text-white" />
          </div>
          
          {selectedPack.isPremiumOnly && !isPremiumActive && (
              <div className="mt-6 text-red-400 font-bold bg-red-900/20 px-4 py-2 rounded-xl border border-red-900/50">
                  У вас немає Преміум-акаунту для відкриття цього паку.
              </div>
          )}
        </div>

        <div className="border-t border-neutral-800 pt-8 w-full">
          <h3 className="text-xl font-black mb-6 text-white text-center uppercase tracking-wider">
            Можливі картки в цьому паку (від найрідкісніших)
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
            {packCards.map((card) => {
              const style = getCardStyle(card.rarity, rarities);
              const effectClass = card.effect ? `effect-${card.effect}` : '';
              const maxSup = Number(card.maxSupply) || 0;
              const isSoldOut = maxSup > 0 && (cardStats[card.id] || 0) >= maxSup;

              return (
                <div key={card.id} className={`flex flex-col items-center group ${isSoldOut ? "opacity-50 grayscale" : "cursor-pointer"}`} onClick={() => !isSoldOut && setViewingCard({ card })}>
                  <div className={`relative w-full aspect-[2/3] rounded-xl border-2 overflow-hidden bg-neutral-900 mb-2 transition-all duration-300 ${!isSoldOut ? "group-hover:-translate-y-2 group-hover:shadow-[0_10px_20px_rgba(0,0,0,0.5)]" : ""} ${style.border} ${effectClass}`}>
                    <img src={card.image} alt={card.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                    {maxSup > 0 && (
                      <div className="absolute top-1 right-1 bg-black/90 text-white text-[8px] px-1.5 py-0.5 rounded border border-neutral-700 font-bold z-10">
                        {isSoldOut ? "РОЗПРОДАНО" : `${maxSup - (cardStats[card.id] || 0)}/${maxSup}`}
                      </div>
                    )}
                    {card.soundUrl && (
                        <button
                          onClick={(e) => { e.stopPropagation(); playCardSound(card.soundUrl, card.soundVolume); }}
                          className="absolute bottom-1 right-1 bg-black/80 text-white p-1.5 rounded-full hover:text-blue-400 z-30 transition-colors shadow-lg"
                          title="Відтворити звук"
                        >
                          <Volume2 size={12} />
                        </button>
                    )}
                  </div>
                  <div className="text-center px-1 w-full">
                    <div className={`text-[9px] font-black uppercase tracking-widest mb-0.5 ${style.text}`}>{card.rarity}</div>
                    <div className="font-bold text-xs leading-tight text-white truncate w-full group-hover:text-yellow-100 transition-colors" title={card.name}>{card.name}</div>
                  </div>
                </div>
              );
            })}
            {packCards.length === 0 && <p className="col-span-full text-center text-neutral-500 py-4">Картки відсутні.</p>}
          </div>
        </div>
      </div>
    );
  }

  const visiblePacks = isAdmin ? packs : packs.filter(p => !p.isHidden);
  const categoriesList = ["all", ...new Set(visiblePacks.map(p => p.category || "Базові"))];
  const displayedPacks = visiblePacks.filter(p => activeCategory === "all" || (p.category || "Базові") === activeCategory);

  return (
    <div className="pb-10 animate-in fade-in zoom-in-95 duration-500">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-black mb-2 text-white uppercase tracking-widest">Магазин Паків</h2>
        <p className="text-neutral-400 text-sm">Оберіть пак, Мій лорд, і випробуйте удачу!</p>
      </div>

      {categoriesList.length > 2 && (
         <div className="flex gap-2 overflow-x-auto pb-4 mb-4 hide-scrollbar justify-center max-w-4xl mx-auto">
            {categoriesList.map(c => (
               <button 
                 key={c} 
                 onClick={() => setActiveCategory(c)}
                 className={`px-5 py-2.5 rounded-full font-bold whitespace-nowrap transition-colors border ${activeCategory === c ? "bg-purple-600 border-purple-500 text-white" : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"}`}
               >
                 {c === "all" ? "Всі Паки" : c}
               </button>
            ))}
         </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        {displayedPacks.map((pack) => (
          <button key={pack.id} onClick={() => setSelectedPackId(pack.id)} className={`bg-neutral-900 border ${pack.isPremiumOnly ? 'border-fuchsia-900/50 hover:border-fuchsia-500' : 'border-neutral-800 hover:border-neutral-600'} rounded-3xl p-6 flex flex-col items-center justify-between group transition-colors shadow-lg text-left w-full cursor-pointer hover:-translate-y-1 transform duration-300 relative overflow-hidden`}>
            {pack.isHidden && (
                <div className="absolute top-3 left-3 bg-red-900 text-red-100 text-[10px] px-2 py-1 rounded border border-red-500 font-bold uppercase z-10 shadow-lg">
                    Приховано
                </div>
            )}
            {pack.isPremiumOnly && (
                <div className="absolute top-3 right-3 bg-fuchsia-900 text-fuchsia-100 text-[10px] px-2 py-1 rounded border border-fuchsia-500 font-bold uppercase z-10 shadow-lg flex items-center gap-1">
                    <Gem size={10}/> Преміум
                </div>
            )}
            
            <div className={`text-[10px] ${pack.isPremiumOnly ? 'text-fuchsia-400' : 'text-purple-400'} font-bold uppercase tracking-widest text-center mb-1 relative z-10`}>{pack.category || "Базові"}</div>
            <h3 className="text-xl font-bold text-white mb-2 text-center w-full relative z-10">{pack.name}</h3>
            
            <div className="flex items-center justify-center gap-1.5 text-yellow-500 font-bold mb-4 bg-yellow-500/10 px-4 py-1.5 rounded-full border border-yellow-500/20 shadow-inner relative z-10">
              {pack.cost} <Coins size={16} />
            </div>

            <div className="relative w-40 h-40 mb-6 flex justify-center items-center perspective-1000">
              <div className={`w-full h-full bg-neutral-800 rounded-2xl border-4 ${pack.isPremiumOnly ? 'border-fuchsia-800/50' : 'border-neutral-700'} shadow-xl overflow-hidden group-hover:shadow-[0_0_30px_rgba(255,255,255,0.1)] transition-all duration-300`}>
                <img src={pack.image} alt={pack.name} className={`w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity group-hover:scale-105 duration-500 ${pack.isHidden ? 'grayscale' : ''}`} />
              </div>
            </div>
            <div className={`w-full py-3 rounded-xl font-bold text-neutral-400 group-hover:text-white bg-neutral-950 border ${pack.isPremiumOnly ? 'border-fuchsia-900/30' : 'border-neutral-800'} group-hover:border-neutral-700 flex items-center justify-center gap-2 transition-all relative z-10`}>
              Детальніше
            </div>
          </button>
        ))}
        {displayedPacks.length === 0 && <div className="col-span-full text-center text-neutral-500 py-10">У цій категорії паків ще немає.</div>}
      </div>
    </div>
  );
}

function OpenButton({ amount, cost, onClick, opening, color = "bg-yellow-500 hover:bg-yellow-400 text-yellow-950" }) {
  const disabled = opening;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-6 py-3 rounded-xl font-black flex items-center justify-center gap-2 transition-all shadow-lg ${
        disabled ? "bg-neutral-800 text-neutral-600 cursor-not-allowed opacity-70" : `${color} transform hover:-translate-y-1`
      }`}
    >
      Відкрити {amount}x
      <span className="flex items-center text-sm bg-black/20 px-2 py-1 rounded ml-1">
        {cost * amount} <Coins size={14} className="ml-1" />
      </span>
    </button>
  );
}

// --- ІНВЕНТАР ТА ВІТРИНИ ---
function InventoryView({ 
    inventory, rarities, sellDuplicate, sellAllDuplicates, sellEveryDuplicate, 
    sellPrice, catalogTotal, setViewingCard, setListingCard, packsCatalog, 
    showcases, createShowcase, deleteShowcase, setMainShowcase, saveShowcaseCards, profile, cardsCatalog, cardStats
}) {
  const [tab, setTab] = useState("cards"); // "cards" or "showcases"
  
  // Фільтри для карток
  const [sortBy, setSortBy] = useState("rarity");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPack, setFilterPack] = useState("all");

  // Стейт для конструктора вітрин
  const [selectedShowcaseId, setSelectedShowcaseId] = useState(null);
  const [builderCards, setBuilderCards] = useState([]);
  
  const categories = ["all", ...new Set(packsCatalog.map(p => p.category || "Базові"))];
  const relevantPacks = filterCategory === "all" ? packsCatalog : packsCatalog.filter(p => (p.category || "Базові") === filterCategory);

  let filteredInventory = inventory.filter(item => {
     const pack = packsCatalog.find(p => p.id === item.card.packId);
     const cat = pack ? (pack.category || "Базові") : "Базові";
     
     if (filterCategory !== "all" && cat !== filterCategory) return false;
     if (filterPack !== "all" && item.card.packId !== filterPack) return false;
     return true;
  });

  filteredInventory.sort((a, b) => {
    if (sortBy === "rarity") return getCardWeight(a.card.rarity, rarities) - getCardWeight(b.card.rarity, rarities);
    if (sortBy === "amount") return b.amount - a.amount;
    if (sortBy === "name") return a.card.name.localeCompare(b.card.name);
    if (sortBy === "pack") {
        const pA = packsCatalog.find(p => p.id === a.card.packId)?.name || "";
        const pB = packsCatalog.find(p => p.id === b.card.packId)?.name || "";
        return pA.localeCompare(pB);
    }
    return 0;
  });

  const duplicatesEarnedCoins = filteredInventory.reduce((sum, item) => {
    if (item.amount > 1) {
        const cardPrice = item.card.sellPrice ? Number(item.card.sellPrice) : sellPrice;
        return sum + (cardPrice * (item.amount - 1));
    }
    return sum;
  }, 0);

  const activeShowcase = showcases.find(s => s.id === selectedShowcaseId);

  useEffect(() => {
     if (activeShowcase) {
         setBuilderCards(activeShowcase.cardIds || []);
     } else {
         setBuilderCards([]);
     }
  }, [selectedShowcaseId, showcases]);

  const handleCreateShowcaseSubmit = (e) => {
      e.preventDefault();
      const name = e.target.showcaseName.value;
      createShowcase(name);
      e.target.reset();
  };

  const addCardToShowcase = (cardId) => {
      if (!activeShowcase) return;
      if (builderCards.length >= 10) return alert("Ліміт вітрини: 10 карток!");
      
      const ownedCount = inventory.find(i => i.card.id === cardId)?.amount || 0;
      const inShowcaseCount = builderCards.filter(id => id === cardId).length;
      
      if (inShowcaseCount < ownedCount) {
          const newCards = [...builderCards, cardId];
          setBuilderCards(newCards);
          saveShowcaseCards(activeShowcase.id, newCards);
      } else {
          alert("У вас більше немає копій цієї картки!");
      }
  };

  const removeCardFromShowcase = (indexToRemove) => {
      if (!activeShowcase) return;
      const newCards = [...builderCards];
      newCards.splice(indexToRemove, 1);
      setBuilderCards(newCards);
      saveShowcaseCards(activeShowcase.id, newCards);
  };

  const onDragStart = (e, cardId) => {
      e.dataTransfer.setData("cardId", cardId);
  };
  const onDragOver = (e) => {
      e.preventDefault();
  };
  const onDrop = (e) => {
      e.preventDefault();
      const cardId = e.dataTransfer.getData("cardId");
      if (cardId) addCardToShowcase(cardId);
  };

  return (
    <div className="pb-10">
      <div className="flex bg-neutral-900 border border-neutral-800 rounded-xl p-1 max-w-sm mx-auto mb-6">
         <button onClick={() => setTab("cards")} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2 ${tab === "cards" ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"}`}>
            <LayoutGrid size={16}/> Всі Картки
         </button>
         <button onClick={() => setTab("showcases")} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2 ${tab === "showcases" ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"}`}>
            <Star size={16}/> Мої Вітрини
         </button>
      </div>

      {tab === "cards" ? (
        <div className="animate-in fade-in">
          <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 bg-neutral-900/80 p-5 rounded-2xl border border-neutral-800 shadow-lg">
            <h2 className="text-2xl font-black flex items-center gap-3 text-white uppercase tracking-wider shrink-0">
              <LayoutGrid className="text-yellow-500 w-8 h-8" /> Інвентар <span className="text-neutral-500 text-lg">({inventory.length}/{catalogTotal})</span>
            </h2>
            
            <div className="flex flex-wrap justify-center md:justify-end items-center gap-3 w-full">
              {duplicatesEarnedCoins > 0 && (
                <button 
                  onClick={() => {
                      if (confirm(`Продати всі відображені дублікати та отримати ${duplicatesEarnedCoins} монет?`)) {
                          sellEveryDuplicate(filteredInventory);
                      }
                  }} 
                  className="bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 text-white font-bold py-3 px-5 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center gap-2 whitespace-nowrap transition-transform transform hover:scale-105 order-last lg:order-first w-full lg:w-auto justify-center"
                  title="Залишити по 1 екземпляру кожної карти з поточного списку"
                >
                  <Zap size={18} /> Продати дублікати (+{duplicatesEarnedCoins} <Coins size={14}/>)
                </button>
              )}

              <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setFilterPack("all"); }} className="bg-neutral-950 border border-neutral-700 text-sm font-medium rounded-xl px-4 py-3 w-full sm:w-auto focus:outline-none text-white cursor-pointer hover:bg-neutral-800 h-full">
                 {categories.map(c => <option key={c} value={c}>{c === "all" ? "Всі Категорії" : c}</option>)}
              </select>
              
              <select value={filterPack} onChange={(e) => setFilterPack(e.target.value)} className="bg-neutral-950 border border-neutral-700 text-sm font-medium rounded-xl px-4 py-3 w-full sm:w-auto focus:outline-none text-white cursor-pointer hover:bg-neutral-800 h-full">
                 <option value="all">Всі Паки</option>
                 {relevantPacks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>

              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="bg-neutral-950 border border-purple-900/50 text-sm font-bold rounded-xl px-4 py-3 w-full sm:w-auto focus:outline-none text-purple-400 cursor-pointer hover:bg-neutral-800 h-full">
                <option value="rarity">За Рідкістю</option>
                <option value="pack">За Паком</option>
                <option value="amount">За Дублікатами</option>
                <option value="name">За Алфавітом</option>
              </select>
            </div>
          </div>

          {filteredInventory.length === 0 ? (
            <div className="text-center py-32 text-neutral-500 bg-neutral-900/30 rounded-3xl border-2 border-dashed border-neutral-800">
              <PackageOpen size={80} className="mx-auto mb-6 opacity-20" />
              <p className="text-xl font-medium mb-2 text-neutral-400">Картки не знайдено.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {filteredInventory.map((item, index) => {
                const style = getCardStyle(item.card.rarity, rarities);
                const effectClass = item.card.effect ? `effect-${item.card.effect}` : '';
                const currentSellPrice = item.card.sellPrice ? Number(item.card.sellPrice) : sellPrice;

                return (
                  <div key={item.card.id} className="flex flex-col items-center group cursor-pointer animate-in fade-in zoom-in-95 duration-500" style={{ animationDelay: `${index * 15}ms`, fillMode: "backwards" }}>
                    <div onClick={() => setViewingCard({ card: item.card, amount: item.amount })} className={`relative w-full aspect-[2/3] rounded-xl border-2 overflow-hidden bg-neutral-900 mb-3 transition-all duration-300 group-hover:-translate-y-2 group-hover:shadow-[0_15px_30px_rgba(0,0,0,0.6)] ${style.border} ${effectClass}`}>
                      {Number(item.card.maxSupply) > 0 && (
                          <div className="absolute top-1 left-1 bg-black/90 text-white font-black text-[9px] px-1.5 py-0.5 rounded-sm z-10 border border-neutral-700 shadow-xl">
                              {item.card.maxSupply}
                          </div>
                      )}
                      {item.amount > 1 && (
                        <div className="absolute top-2 right-2 bg-neutral-950/90 backdrop-blur text-white font-black text-xs px-3 py-1.5 rounded-full z-10 border border-neutral-700 shadow-xl">
                          x{item.amount}
                        </div>
                      )}
                      <img src={item.card.image} alt={item.card.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      
                      {item.card.soundUrl && (
                          <button
                            onClick={(e) => { e.stopPropagation(); playCardSound(item.card.soundUrl, item.card.soundVolume); }}
                            className="absolute bottom-1 right-1 bg-black/80 text-white p-1.5 rounded-full hover:text-blue-400 z-30 transition-colors shadow-lg"
                            title="Відтворити звук"
                          >
                            <Volume2 size={12} />
                          </button>
                      )}
                    </div>
                    <div className="w-full flex flex-col items-center text-center px-1">
                      <div className={`text-[10px] font-black uppercase tracking-widest mb-1 ${style.text}`}>{item.card.rarity}</div>
                      <div className="font-bold text-sm leading-tight text-white mb-3 line-clamp-1 w-full group-hover:text-yellow-100 transition-colors" title={item.card.name}>{item.card.name}</div>
                      
                      {item.amount > 1 ? (
                        <div className="w-full flex flex-col gap-1.5">
                          <button onClick={(e) => { e.stopPropagation(); sellDuplicate(item.card.id); }} className="w-full bg-neutral-800 hover:bg-neutral-700 text-xs py-2 rounded-lg text-neutral-200 font-bold transition-all hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]">
                            Продати (+{currentSellPrice} <Coins size={10} className="inline text-yellow-500" />)
                          </button>
                          <div className="flex gap-1.5 w-full">
                             {item.amount > 2 && (
                                <button onClick={(e) => { e.stopPropagation(); sellAllDuplicates(item.card.id); }} className="flex-1 bg-neutral-800/80 hover:bg-red-900/50 text-[10px] py-1.5 rounded-lg text-neutral-400 font-bold transition-all border border-neutral-700 hover:border-red-900/50" title="Залишити лише 1">
                                   Всі (-1)
                                </button>
                             )}
                             <button onClick={(e) => { e.stopPropagation(); setListingCard(item.card); }} className="flex-1 bg-blue-900/40 hover:bg-blue-600 text-[10px] py-1.5 rounded-lg text-blue-400 hover:text-white font-bold transition-all border border-blue-800/50">
                                На Ринок
                             </button>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full flex flex-col gap-1.5">
                            <div className="w-full text-xs py-1.5 text-neutral-500 font-medium">
                                Один екземпляр
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); setListingCard(item.card); }} className="w-full bg-blue-900/40 hover:bg-blue-600 text-xs py-2 rounded-lg text-blue-400 hover:text-white font-bold transition-all border border-blue-800/50">
                                Виставити на Ринок
                            </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="animate-in fade-in">
           {!activeShowcase ? (
               <div>
                  <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 mb-6 text-center">
                      <h3 className="text-xl font-bold text-white mb-4"><Star className="inline text-yellow-500 mb-1"/> Створити нову вітрину</h3>
                      <form onSubmit={handleCreateShowcaseSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                          <input type="text" name="showcaseName" placeholder="Назва вітрини..." required className="flex-1 bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-yellow-500 outline-none" />
                          <button type="submit" className="bg-yellow-600 hover:bg-yellow-500 text-yellow-950 font-bold py-3 px-6 rounded-xl transition-colors">Створити</button>
                      </form>
                      <p className="text-xs text-neutral-500 mt-3">Ліміт: 5 вітрин по 10 карток.</p>
                  </div>

                  {showcases.length === 0 ? (
                      <div className="text-center py-20 text-neutral-500">У вас ще немає жодної вітрини.</div>
                  ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {showcases.map(s => (
                              <div key={s.id} onClick={() => setSelectedShowcaseId(s.id)} className={`bg-neutral-900 border-2 rounded-2xl p-5 cursor-pointer transition-all hover:-translate-y-1 ${profile?.mainShowcaseId === s.id ? 'border-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.2)]' : 'border-neutral-800 hover:border-neutral-600'}`}>
                                  <div className="flex justify-between items-start mb-2">
                                     <h4 className="font-black text-lg text-white truncate pr-2">{s.name}</h4>
                                     {profile?.mainShowcaseId === s.id && <Star size={20} className="text-yellow-500 fill-yellow-500 shrink-0"/>}
                                  </div>
                                  <div className="text-sm text-neutral-400 mb-4">{s.cardIds?.length || 0}/10 Карток</div>
                                  <div className="flex -space-x-2 overflow-hidden h-12">
                                      {(s.cardIds || []).slice(0,5).map((cId, i) => {
                                          const c = cardsCatalog.find(x => x.id === cId);
                                          if (!c) return null;
                                          return <img key={i} src={c.image} alt="m" className="inline-block h-12 w-8 object-cover rounded border border-neutral-700 bg-neutral-950" />
                                      })}
                                      {(s.cardIds?.length || 0) > 5 && <div className="h-12 w-8 rounded border border-neutral-700 bg-neutral-900 flex items-center justify-center text-[10px] font-bold text-white z-10">+{s.cardIds.length - 5}</div>}
                                  </div>
                              </div>
                          ))}
                      </div>
                  )}
               </div>
           ) : (
               <div className="animate-in slide-in-from-right-4">
                   <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 bg-neutral-900 p-5 rounded-2xl border border-neutral-800">
                       <div>
                           <button onClick={() => setSelectedShowcaseId(null)} className="text-neutral-400 hover:text-white text-sm font-bold flex items-center gap-1 mb-2"><ArrowLeft size={16}/> До всіх вітрин</button>
                           <h2 className="text-2xl font-black text-white flex items-center gap-2">{activeShowcase.name} <span className="text-neutral-500 text-sm font-normal">({builderCards.length}/10)</span></h2>
                       </div>
                       <div className="flex flex-wrap gap-2 w-full md:w-auto">
                           {profile?.mainShowcaseId !== activeShowcase.id ? (
                               <button onClick={() => setMainShowcase(activeShowcase.id)} className="bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-500 border border-yellow-600/50 px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-2 flex-1 md:flex-none justify-center">
                                  <Star size={16}/> Зробити Головною
                               </button>
                           ) : (
                               <div className="bg-yellow-500 text-yellow-950 px-4 py-2 rounded-xl font-bold flex items-center gap-2 flex-1 md:flex-none justify-center">
                                  <Star size={16} className="fill-yellow-950"/> Головна Вітрина
                               </div>
                           )}
                           <button onClick={() => { setSelectedShowcaseId(null); deleteShowcase(activeShowcase.id); }} className="bg-red-900/40 hover:bg-red-900 text-red-400 px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-2 flex-1 md:flex-none justify-center">
                               <Trash2 size={16}/>
                           </button>
                       </div>
                   </div>

                   <p className="text-center text-neutral-400 text-sm mb-4">Натисніть на картку в інвентарі або перетягніть її сюди, щоб додати у вітрину.</p>

                   {/* ЗОНА ВІТРИНИ (DROP ZONE) */}
                   <div 
                      className={`bg-neutral-900/50 border-2 border-dashed ${builderCards.length < 10 ? 'border-purple-500/50' : 'border-neutral-700'} rounded-3xl p-6 min-h-[200px] mb-8 flex flex-wrap justify-center gap-4 transition-colors`}
                      onDragOver={onDragOver}
                      onDrop={onDrop}
                   >
                       {builderCards.map((cId, index) => {
                           const cData = cardsCatalog.find(c => c.id === cId);
                           if (!cData) return null;
                           const style = getCardStyle(cData.rarity, rarities);
                           const effectClass = cData.effect ? `effect-${cData.effect}` : '';
                           
                           return (
                               <div key={index} onClick={() => removeCardFromShowcase(index)} className="relative group cursor-pointer animate-in zoom-in-95">
                                   <div className={`w-24 sm:w-32 aspect-[2/3] rounded-xl border-2 overflow-hidden bg-neutral-950 ${style.border} ${effectClass}`}>
                                       <img src={cData.image} alt={cData.name} className="w-full h-full object-cover group-hover:opacity-50 transition-opacity" />
                                       <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                           <div className="bg-red-600 text-white rounded-full p-2"><Trash2 size={20}/></div>
                                       </div>
                                   </div>
                               </div>
                           );
                       })}
                       
                       {/* Пусті слоти для візуалу */}
                       {Array.from({ length: Math.max(0, 10 - builderCards.length) }).map((_, i) => (
                           <div key={`empty-${i}`} className="w-24 sm:w-32 aspect-[2/3] rounded-xl border-2 border-dashed border-neutral-800 bg-neutral-950/30 flex items-center justify-center opacity-50">
                               <GripHorizontal className="text-neutral-700" size={32}/>
                           </div>
                       ))}
                   </div>

                   {/* ІНВЕНТАР ДЛЯ ВИБОРУ */}
                   <h3 className="text-lg font-bold text-white mb-4">Ваш Інвентар:</h3>
                   <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 opacity-90 hover:opacity-100 transition-opacity">
                       {filteredInventory.map((item) => {
                          const style = getCardStyle(item.card.rarity, rarities);
                          // Розрахунок доступних
                          const inShowcaseCount = builderCards.filter(id => id === item.card.id).length;
                          const available = item.amount - inShowcaseCount;
                          const disabled = available <= 0 || builderCards.length >= 10;

                          return (
                              <div 
                                key={item.card.id} 
                                draggable={!disabled}
                                onDragStart={(e) => onDragStart(e, item.card.id)}
                                onClick={() => !disabled && addCardToShowcase(item.card.id)} 
                                className={`relative aspect-[2/3] rounded-lg border-2 overflow-hidden bg-neutral-900 transition-all ${disabled ? 'opacity-30 grayscale cursor-not-allowed' : 'cursor-pointer hover:-translate-y-1 hover:border-purple-500'} ${style.border}`}
                              >
                                  {available > 0 && (
                                    <div className="absolute top-1 right-1 bg-black/80 text-white font-bold text-[9px] px-1.5 py-0.5 rounded-sm z-10 border border-neutral-700">
                                      {available}
                                    </div>
                                  )}
                                  <img src={item.card.image} alt={item.card.name} className="w-full h-full object-cover pointer-events-none" />
                              </div>
                          )
                       })}
                   </div>
               </div>
           )}
        </div>
      )}

    </div>
  );
}

// --- РЕЙТИНГ ТА ПОШУК ---
function RatingView({ db, appId, currentUid, setViewingPlayerProfile }) {
  const [allProfiles, setAllProfiles] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [ratingSort, setRatingSort] = useState("cards");

  useEffect(() => {
    const fetchAllProfiles = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "artifacts", appId, "public", "data", "profiles"));
        const list = [];
        querySnapshot.forEach((doc) => list.push(doc.data()));
        setAllProfiles(list);
      } catch (e) {
        console.error("Помилка завантаження бази гравців", e);
      }
      setLoading(false);
    };
    fetchAllProfiles();
  }, [db, appId]);

  const sortedProfiles = [...allProfiles].sort((a, b) => {
      if (ratingSort === "coins") return (b.coins || 0) - (a.coins || 0);
      return (b.uniqueCardsCount || 0) - (a.uniqueCardsCount || 0);
  });

  const filteredLeaders = searchTerm.trim() === "" 
    ? sortedProfiles.slice(0, 50)
    : sortedProfiles.filter(p => p.nickname?.toLowerCase().includes(searchTerm.toLowerCase()));

  if (loading) return <div className="text-center py-20 text-neutral-500"><Loader2 className="animate-spin mx-auto mb-4 w-12 h-12"/> Завантаження Залу Слави...</div>;

  return (
    <div className="max-w-3xl mx-auto pb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center mb-8">
        <Trophy size={48} className="mx-auto text-yellow-500 mb-4 drop-shadow-[0_0_15px_rgba(234,179,8,0.5)]" />
        <h2 className="text-3xl font-black text-white uppercase tracking-widest">Зал Слави</h2>
        <p className="text-neutral-400 text-sm mt-2 mb-6">Знайдіть гравців або змагайтеся за першість</p>
        
        <div className="relative max-w-md mx-auto mb-4">
          <input
            type="text"
            placeholder="Пошук гравця за нікнеймом..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-700 rounded-2xl py-3 px-5 text-white focus:outline-none focus:border-yellow-500 transition-colors shadow-inner"
          />
        </div>

        <div className="flex bg-neutral-900 border border-neutral-800 rounded-xl p-1 max-w-md mx-auto">
           <button onClick={() => setRatingSort("cards")} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2 ${ratingSort === "cards" ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"}`}>
              <LayoutGrid size={16}/> За Колекцією
           </button>
           <button onClick={() => setRatingSort("coins")} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2 ${ratingSort === "coins" ? "bg-yellow-600 text-white" : "text-neutral-400 hover:text-white"}`}>
              <Coins size={16}/> За Монетами
           </button>
        </div>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-xl">
        {filteredLeaders.map((leader, index) => {
          const realRank = sortedProfiles.findIndex(p => p.uid === leader.uid) + 1;

          return (
            <div 
              key={leader.uid} 
              onClick={() => setViewingPlayerProfile(leader.uid)}
              className={`flex items-center justify-between p-4 border-b border-neutral-800/50 last:border-0 transition-colors cursor-pointer group ${leader.uid === currentUid ? "bg-yellow-900/10" : "hover:bg-neutral-800/80"} ${leader.isBanned ? "opacity-50" : ""}`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 flex items-center justify-center font-black text-lg rounded-xl border transition-transform group-hover:scale-110 shrink-0 ${
                  realRank === 1 ? "bg-yellow-500 text-yellow-950 border-yellow-400" :
                  realRank === 2 ? "bg-gray-300 text-gray-800 border-gray-100" :
                  realRank === 3 ? "bg-amber-700 text-orange-100 border-amber-600" :
                  "bg-neutral-950 text-neutral-500 border-neutral-800"
                }`}>
                  {realRank}
                </div>
                
                <PlayerAvatar profile={leader} className="w-10 h-10 rounded-full shrink-0" iconSize={18} />

                <div className="min-w-0">
                  <div className="font-bold text-white flex items-center gap-2 text-base sm:text-lg truncate">
                    {leader.nickname} 
                    <span className="bg-red-900/40 text-red-400 text-xs px-2 py-0.5 rounded-lg border border-red-800 flex items-center gap-1 shrink-0" title={`Рівень мисливця: ${leader.farmLevel || 1}`}>
                        <Swords size={12} /> {leader.farmLevel || 1}
                    </span>
                    {leader.isBanned && <Ban size={14} className="text-red-600 shrink-0" title="Забанений" />}
                    {leader.uid === currentUid && <span className="text-[10px] bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded-full shrink-0">ВИ</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <div className="text-xs text-neutral-500 font-bold uppercase">{ratingSort === "cards" ? "Унікальні карти" : "Монети"}</div>
                  <div className={`text-xl font-black ${ratingSort === "cards" ? "text-blue-400" : "text-yellow-500"}`}>
                      {ratingSort === "cards" ? (leader.uniqueCardsCount || 0) : (leader.coins || 0)}
                  </div>
                </div>
                <ArrowLeft size={16} className="text-neutral-600 group-hover:text-yellow-500 transform rotate-180 transition-colors hidden sm:block" />
              </div>
            </div>
          );
        })}
        {filteredLeaders.length === 0 && <div className="p-8 text-center text-neutral-500">Гравців не знайдено.</div>}
      </div>
    </div>
  );
}

// --- ПУБЛІЧНИЙ ПРОФІЛЬ ІНШОГО ГРАВЦЯ ---
function PublicProfileView({ cardStats, db, appId, targetUid, goBack, cardsCatalog, rarities, setViewingCard, packsCatalog }) {
  const [playerInfo, setPlayerInfo] = useState(null);
  const [playerInventory, setPlayerInventory] = useState([]);
  const [mainShowcase, setMainShowcase] = useState(null);
  const [loading, setLoading] = useState(true);

  const [sortBy, setSortBy] = useState("rarity");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPack, setFilterPack] = useState("all");

  useEffect(() => {
    const fetchPlayerData = async () => {
      try {
        const profileSnap = await getDocs(query(collection(db, "artifacts", appId, "public", "data", "profiles")));
        let foundProfile = null;
        profileSnap.forEach((doc) => {
          if (doc.id === targetUid) foundProfile = doc.data();
        });
        setPlayerInfo(foundProfile);

        if (foundProfile) {
          // Завантажуємо інвентар
          const invSnap = await getDocs(collection(db, "artifacts", appId, "users", targetUid, "inventory"));
          const invList = [];
          invSnap.forEach((doc) => invList.push({ id: doc.id, ...doc.data() }));
          
          const fullInv = invList.map(item => {
            const cardData = cardsCatalog.find(c => c.id === item.id);
            return cardData && item.amount > 0 ? { card: cardData, amount: item.amount } : null;
          }).filter(Boolean);
          
          setPlayerInventory(fullInv);

          // Завантажуємо головну вітрину
          if (foundProfile.mainShowcaseId) {
             const showcaseDoc = await getDoc(doc(db, "artifacts", appId, "users", targetUid, "showcases", foundProfile.mainShowcaseId));
             if (showcaseDoc.exists()) {
                 setMainShowcase(showcaseDoc.data());
             }
          }
        }
      } catch (err) {
        console.error("Помилка завантаження профілю гравця", err);
      }
      setLoading(false);
    };

    fetchPlayerData();
  }, [db, appId, targetUid, cardsCatalog, rarities]);

  if (loading) return <div className="text-center py-20 text-neutral-500"><Loader2 className="animate-spin mx-auto w-12 h-12 mb-4" /> Завантажуємо дані гравця...</div>;
  if (!playerInfo) return <div className="text-center py-20 text-red-500">Гравець не знайдений або його акаунт видалено. <button onClick={goBack} className="block mx-auto mt-4 underline">Повернутись</button></div>;

  const categories = ["all", ...new Set(packsCatalog.map(p => p.category || "Базові"))];
  const relevantPacks = filterCategory === "all" ? packsCatalog : packsCatalog.filter(p => (p.category || "Базові") === filterCategory);

  let filteredInventory = playerInventory.filter(item => {
     const pack = packsCatalog.find(p => p.id === item.card.packId);
     const cat = pack ? (pack.category || "Базові") : "Базові";
     
     if (filterCategory !== "all" && cat !== filterCategory) return false;
     if (filterPack !== "all" && item.card.packId !== filterPack) return false;
     return true;
  });

  filteredInventory.sort((a, b) => {
    if (sortBy === "rarity") return getCardWeight(a.card.rarity, rarities) - getCardWeight(b.card.rarity, rarities);
    if (sortBy === "amount") return b.amount - a.amount;
    if (sortBy === "name") return a.card.name.localeCompare(b.card.name);
    if (sortBy === "pack") {
        const pA = packsCatalog.find(p => p.id === a.card.packId)?.name || "";
        const pB = packsCatalog.find(p => p.id === b.card.packId)?.name || "";
        return pA.localeCompare(pB);
    }
    return 0;
  });

  // Відображення карток вітрини (з перевіркою чи вони досі є в інвентарі гравця)
  const validShowcaseCards = [];
  if (mainShowcase && mainShowcase.cardIds) {
      // Робимо копію інвентарю для коректного підрахунку кількостей
      const tempInv = JSON.parse(JSON.stringify(playerInventory));
      for (const cid of mainShowcase.cardIds) {
          const invItem = tempInv.find(i => i.card.id === cid);
          if (invItem && invItem.amount > 0) {
              validShowcaseCards.push(invItem.card);
              invItem.amount -= 1;
          }
      }
  }
  
  const isPlayerPremium = playerInfo.isPremium && playerInfo.premiumUntil && new Date(playerInfo.premiumUntil) > new Date();

  return (
    <div className="animate-in slide-in-from-right-8 duration-500">
      <button onClick={goBack} className="mb-6 flex items-center gap-2 text-neutral-400 hover:text-white transition-colors font-bold px-4 py-2 bg-neutral-900 rounded-lg hover:bg-neutral-800 w-fit border border-neutral-800">
        <ArrowLeft size={20} /> До Рейтингу
      </button>

      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 text-center relative overflow-hidden mb-8 shadow-xl">
        <div className={`absolute top-0 left-0 w-full h-32 bg-gradient-to-b ${playerInfo.isBanned ? "from-red-900/40" : playerInfo.isSuperAdmin ? "from-orange-900/40" : playerInfo.isAdmin ? "from-purple-900/40" : isPlayerPremium ? "from-fuchsia-900/30" : "from-blue-900/20"} to-transparent`}></div>
        
        <div className="relative w-24 h-24 mx-auto mb-4 z-10">
           <PlayerAvatar profile={playerInfo} className={`w-full h-full rounded-full text-4xl ${isPlayerPremium ? 'border-4 border-fuchsia-500 shadow-[0_0_20px_rgba(217,70,239,0.5)]' : ''}`} iconSize={48} />
           {isPlayerPremium && (
               <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-neutral-900 rounded-full p-1 border-2 border-fuchsia-500 z-20">
                   <Gem size={16} className="text-fuchsia-400 fill-fuchsia-400" />
               </div>
           )}
        </div>
        
        <h2 className="text-3xl font-black text-white mb-1 relative z-10 flex justify-center items-center gap-2">
            {playerInfo.nickname}
            <span className="bg-red-600/20 text-red-400 text-sm px-2 py-1 rounded-xl border border-red-500/50 flex items-center gap-1" title="Рівень мисливця">
                <Swords size={16} /> {playerInfo.farmLevel || 1}
            </span>
            {isPlayerPremium && <Gem size={18} className="text-fuchsia-400 fill-fuchsia-400" title="Преміум Гравець" />}
            {playerInfo.isBanned && <span className="text-[10px] bg-red-900/50 text-red-400 px-2 py-1 rounded-full uppercase tracking-widest border border-red-800">Бан</span>}
        </h2>
        <div className="text-neutral-500 text-sm flex justify-center gap-4 mt-2">
            <span className="flex items-center gap-1"><CalendarDays size={14}/> З нами від: {formatDate(playerInfo.createdAt)}</span>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 relative z-10 mt-6 max-w-2xl mx-auto">
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col items-center">
            <Coins className="text-yellow-500 mb-2 w-6 h-6" />
            <span className="text-xl font-black text-white">{playerInfo.coins}</span>
            <span className="text-[10px] text-neutral-500 font-bold uppercase mt-1">Монети</span>
          </div>
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col items-center">
            <LayoutGrid className="text-blue-500 mb-2 w-6 h-6" />
            <span className="text-xl font-black text-white">{playerInfo.uniqueCardsCount || playerInventory.length}</span>
            <span className="text-[10px] text-neutral-500 font-bold uppercase mt-1">Унікальних карт</span>
          </div>
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col items-center">
            <PackageOpen className="text-purple-500 mb-2 w-6 h-6" />
            <span className="text-xl font-black text-white">{playerInfo.packsOpened || 0}</span>
            <span className="text-[10px] text-neutral-500 font-bold uppercase mt-1">Відкрито паків</span>
          </div>
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col items-center">
            <Coins className="text-red-500 mb-2 w-6 h-6" />
            <span className="text-xl font-black text-white">{playerInfo.coinsSpentOnPacks || 0}</span>
            <span className="text-[10px] text-neutral-500 font-bold uppercase mt-1">Витрачено <Coins size={8} className="inline"/></span>
          </div>
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col items-center">
            <Zap className="text-green-500 mb-2 w-6 h-6" />
            <span className="text-xl font-black text-white">{playerInfo.coinsEarnedFromPacks || 0}</span>
            <span className="text-[10px] text-neutral-500 font-bold uppercase mt-1">Виграно <Coins size={8} className="inline"/></span>
          </div>
        </div>
      </div>

      {/* ВІТРИНА ГРАВЦЯ */}
      {mainShowcase && validShowcaseCards.length > 0 && (
         <div className="mb-10">
             <div className="flex items-center gap-3 mb-4 justify-center">
                 <Star className="text-yellow-500 fill-yellow-500" size={24} />
                 <h3 className="text-2xl font-black text-white uppercase tracking-widest">{mainShowcase.name}</h3>
             </div>
             <div className="bg-neutral-900 border-2 border-yellow-500/30 rounded-3xl p-6 flex flex-wrap justify-center gap-4 shadow-[0_0_30px_rgba(234,179,8,0.1)]">
                 {validShowcaseCards.map((card, idx) => {
                    const style = getCardStyle(card.rarity, rarities);
                    const effectClass = card.effect ? `effect-${card.effect}` : '';
                    return (
                        <div key={idx} onClick={() => setViewingCard({ card, amount: 1 })} className="relative group cursor-pointer animate-in zoom-in-95 hover:-translate-y-2 transition-transform">
                            <div className={`w-28 sm:w-36 aspect-[2/3] rounded-xl border-2 overflow-hidden bg-neutral-950 shadow-lg ${style.border} ${effectClass}`}>
                                {Number(card.maxSupply) > 0 && (
                                    <div className="absolute top-1 left-1 bg-black/90 text-white text-[8px] sm:text-[10px] px-2 py-1 rounded-md border border-neutral-700 font-black z-10">
                                        {card.maxSupply} шт.
                                    </div>
                                )}
                                <img src={card.image} alt={card.name} className="w-full h-full object-cover" />
                                {card.soundUrl && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); playCardSound(card.soundUrl, card.soundVolume); }}
                                    className="absolute bottom-1 right-1 bg-black/80 text-white p-1.5 rounded-full hover:text-blue-400 z-30 transition-colors shadow-lg"
                                    title="Відтворити звук"
                                  >
                                    <Volume2 size={12} />
                                  </button>
                                )}
                            </div>
                        </div>
                    );
                 })}
             </div>
         </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h3 className="text-xl font-black text-white uppercase tracking-wider flex items-center gap-2">
          <LayoutGrid className="text-blue-500" /> Колекція гравця
        </h3>
        
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setFilterPack("all"); }} className="bg-neutral-900 border border-neutral-700 text-sm font-medium rounded-xl px-4 py-2 w-full sm:w-auto focus:outline-none text-white cursor-pointer hover:bg-neutral-800">
             {categories.map(c => <option key={c} value={c}>{c === "all" ? "Всі Категорії" : c}</option>)}
          </select>
          <select value={filterPack} onChange={(e) => setFilterPack(e.target.value)} className="bg-neutral-900 border border-neutral-700 text-sm font-medium rounded-xl px-4 py-2 w-full sm:w-auto focus:outline-none text-white cursor-pointer hover:bg-neutral-800 h-full">
             <option value="all">Всі Паки</option>
             {relevantPacks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="bg-neutral-900 border border-purple-900/50 text-sm font-bold rounded-xl px-4 py-2 w-full sm:w-auto focus:outline-none text-purple-400 cursor-pointer hover:bg-neutral-800">
            <option value="rarity">За Рідкістю</option>
            <option value="pack">За Паком</option>
            <option value="amount">За Дублікатами</option>
            <option value="name">За Алфавітом</option>
          </select>
        </div>
      </div>

      {filteredInventory.length === 0 ? (
        <div className="text-center py-10 bg-neutral-900/50 rounded-2xl border border-neutral-800 text-neutral-500">
          Картки за цим фільтром відсутні.
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
          {filteredInventory.map((item, index) => {
            const style = getCardStyle(item.card.rarity, rarities);
            const effectClass = item.card.effect ? `effect-${item.card.effect}` : '';
            return (
              <div 
                key={item.card.id} 
                className="flex flex-col items-center group cursor-pointer animate-in fade-in zoom-in-95" 
                style={{ animationDelay: `${index * 15}ms`, fillMode: "backwards" }}
                onClick={() => setViewingCard({ card: item.card, amount: item.amount })}
              >
                <div className={`relative w-full aspect-[2/3] rounded-xl border-2 overflow-hidden bg-neutral-900 mb-2 ${style.border} ${effectClass}`}>
                  {Number(item.card.maxSupply) > 0 && (
                    <div className="absolute top-1 left-1 bg-black/90 text-white font-black text-[9px] px-1.5 py-0.5 rounded-sm z-10 border border-neutral-700 shadow-xl">
                        {cardStats[item.card.id] || 0} / {item.card.maxSupply}
                    </div>
                  )}
                  {item.amount > 1 && (
                    <div className="absolute top-1 right-1 bg-neutral-950/90 text-white font-black text-[10px] px-2 py-0.5 rounded-full z-10 border border-neutral-700 shadow-xl">
                      x{item.amount}
                    </div>
                  )}
                  <img src={item.card.image} alt={item.card.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  {item.card.soundUrl && (
                      <button
                        onClick={(e) => { e.stopPropagation(); playCardSound(item.card.soundUrl, item.card.soundVolume); }}
                        className="absolute bottom-1 right-1 bg-black/80 text-white p-1 rounded-full hover:text-blue-400 z-30 transition-colors shadow-lg"
                        title="Відтворити звук"
                      >
                        <Volume2 size={12} />
                      </button>
                  )}
                </div>
                <div className="w-full text-center px-1">
                  <div className={`text-[8px] font-black uppercase tracking-widest mb-0.5 ${style.text}`}>{item.card.rarity}</div>
                  <div className="font-bold text-[10px] sm:text-xs leading-tight text-white truncate w-full">{item.card.name}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- АДМІН ПАНЕЛЬ ---
function AdminView({ db, appId, currentProfile, cardsCatalog, packsCatalog, rarities, showToast, addSystemLog, dailyRewards, premiumDailyRewards, premiumPrice, premiumDurationDays, premiumShopItems, setViewingPlayerProfile, setCurrentView, bosses, setBosses }) {
  const [activeTab, setActiveTab] = useState("users");
  const [allUsers, setAllUsers] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [adminSetFarmLevel, setAdminSetFarmLevel] = useState("");
  
  const [viewingUser, setViewingUser] = useState(null);
  const [userInventory, setUserInventory] = useState([]);
  const [loadingUserInv, setLoadingUserInv] = useState(false);
  const [adminUserSearchTerm, setAdminUserSearchTerm] = useState("");
  
  const [banModalUser, setBanModalUser] = useState(null);
  const [banReason, setBanReason] = useState("");
  const [banDurationValue, setBanDurationValue] = useState("");
  const [banDurationUnit, setBanDurationUnit] = useState("h"); 

  const [premiumModalUser, setPremiumModalUser] = useState(null);
  const [premiumGiveDays, setPremiumGiveDays] = useState(30);

  // Для зміни нікнейму гравця
  const [adminNewNickname, setAdminNewNickname] = useState("");

  const [adminAddCardId, setAdminAddCardId] = useState("");
  const [adminAddCardAmount, setAdminAddCardAmount] = useState(1);
  const [adminAddCoinsAmount, setAdminAddCoinsAmount] = useState(100);
  const [adminSetCoinsAmount, setAdminSetCoinsAmount] = useState(0);

  const [editingCard, setEditingCard] = useState(null);
  const [cardForm, setCardForm] = useState({ id: "", packId: packsCatalog[0]?.id || "", name: "", rarity: rarities[0]?.name || "Звичайна", image: "", maxSupply: "", weight: "", sellPrice: "", effect: "", soundUrl: "", soundVolume: 0.5 });
  const [editingPack, setEditingPack] = useState(null);
  const [packForm, setPackForm] = useState({ id: "", name: "", category: "Базові", cost: 50, image: "", customWeights: {}, isHidden: false, isPremiumOnly: false });

  const [allPromos, setAllPromos] = useState([]);
  const [promoForm, setPromoForm] = useState({ code: "", reward: 100, maxGlobalUses: 0, maxUserUses: 1 });

  const [packSearchTerm, setPackSearchTerm] = useState("");
  const [cardSearchTerm, setCardSearchTerm] = useState("");
  const [cardPackFilter, setCardPackFilter] = useState("all");

  const [adminLogs, setAdminLogs] = useState([]);
  
  // Стейти для налаштувань (Settings)
  const [rewardsForm, setRewardsForm] = useState(dailyRewards);
  const [premiumRewardsForm, setPremiumRewardsForm] = useState(premiumDailyRewards);
  const [priceForm, setPriceForm] = useState(premiumPrice);
  const [durationDaysForm, setDurationDaysForm] = useState(premiumDurationDays);
  const [shopItemForm, setShopItemForm] = useState({ type: "card", itemId: "", price: 500, description: "" });

  useEffect(() => {
    setRewardsForm(dailyRewards || [1000, 2000, 3000, 4000, 5000, 6000, 7000]);
    setPremiumRewardsForm(premiumDailyRewards || [2000, 4000, 6000, 8000, 10000, 12000, 15000]);
    setPriceForm(premiumPrice !== undefined ? premiumPrice : 10000);
    setDurationDaysForm(premiumDurationDays !== undefined ? premiumDurationDays : 30);
  }, [dailyRewards, premiumDailyRewards, premiumPrice, premiumDurationDays]);

  useEffect(() => {
    if (activeTab === "users") {
      const unsub = onSnapshot(collection(db, "artifacts", appId, "public", "data", "profiles"), (snap) => {
        const uList = [];
        snap.forEach((d) => uList.push(d.data()));
        setAllUsers(uList);
      });
      return () => unsub();
    }
    
    if (activeTab === "promos" && currentProfile.isSuperAdmin) {
      const unsub = onSnapshot(collection(db, "artifacts", appId, "public", "data", "promoCodes"), (snap) => {
          const pList = [];
          snap.forEach(d => pList.push({ id: d.id, ...d.data() }));
          setAllPromos(pList);
      });
      return () => unsub();
    }

    if (activeTab === "logs" && currentProfile.isSuperAdmin) {
      const unsub = onSnapshot(collection(db, "artifacts", appId, "public", "data", "adminLogs"), (snap) => {
          const lList = [];
          snap.forEach(d => lList.push({ id: d.id, ...d.data() }));
          lList.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
          setAdminLogs(lList);
      });
      return () => unsub();
    }
  }, [activeTab, db, appId, currentProfile]);

  const syncAllProfiles = async () => {
    if (!confirm("Це може зайняти певний час. Продовжити?")) return;
    setIsSyncing(true);
    showToast("Синхронізація розпочата...", "success");

    try {
        const usersSnap = await getDocs(collection(db, "artifacts", appId, "public", "data", "profiles"));
        const batch = writeBatch(db);
        let operations = 0;
        
        for (const userDoc of usersSnap.docs) {
            const uid = userDoc.id;
            const invSnap = await getDocs(collection(db, "artifacts", appId, "users", uid, "inventory"));
            
            let totalCardsCount = 0;
            invSnap.forEach(d => { totalCardsCount += (d.data().amount || 0); });
            
            const uniqueCardsCount = invSnap.size;
            
            batch.update(userDoc.ref, { 
                uniqueCardsCount: uniqueCardsCount,
                totalCards: totalCardsCount
            });
            operations++;
            
            if (operations >= 450) {
                await batch.commit();
                operations = 0;
            }
        }
        
        if (operations > 0) {
            await batch.commit();
        }
        
        showToast("Синхронізацію успішно завершено!", "success");
        addSystemLog("Адмін", "Масова синхронізація профілів завершена.");
    } catch (e) {
        console.error(e);
        showToast("Сталася помилка під час синхронізації.", "error");
    }
    setIsSyncing(false);
  };

  const handleDeleteUser = async (userToDelete) => {
    if (userToDelete.isSuperAdmin) return showToast("Не можна видалити Супер Адміністратора!", "error");
    if (userToDelete.isAdmin && !currentProfile.isSuperAdmin) return showToast("У вас немає прав видаляти інших адміністраторів!", "error");
    
    if (!confirm(`Мій лорд, Ви впевнені, що хочете БЕЗПОВОРОТНО видалити гравця ${userToDelete.nickname}?`)) return;
    
    try {
      await deleteDoc(doc(db, "artifacts", appId, "public", "data", "profiles", userToDelete.uid));
      showToast(`Гравця ${userToDelete.nickname} видалено.`, "success");
      addSystemLog("Адмін", `Видалено акаунт гравця: ${userToDelete.nickname} (${userToDelete.uid})`);
    } catch (e) {
      console.error(e);
      showToast("Помилка під час видалення гравця");
    }
  };

  const handleInspectUser = async (uid) => {
    setLoadingUserInv(true);
    const u = allUsers.find(x => x.uid === uid);
    setViewingUser(u);
    if(u) {
        setAdminSetCoinsAmount(u.coins || 0);
        setAdminNewNickname(u.nickname || "");
        setAdminSetFarmLevel(u.farmLevel || 1);
    }
    try {
      const invRef = collection(db, "artifacts", appId, "users", uid, "inventory");
      const snap = await getDocs(invRef);
      const items = [];
      snap.forEach(d => items.push({ id: d.id, ...d.data() }));
      setUserInventory(items);
    } catch (e) {
      console.error(e);
      showToast("Помилка доступу до інвентарю.");
    }
    setLoadingUserInv(false);
  };

  const submitBan = async (e) => {
      e.preventDefault();
      if (!banModalUser) return;
      
      let banUntil = null;
      if (banDurationUnit !== "perm") {
          const val = parseInt(banDurationValue, 10);
          if (isNaN(val) || val <= 0) return showToast("Введіть коректний час бану!", "error");
          
          let multiplier = 1;
          if (banDurationUnit === 'm') multiplier = 60 * 1000;
          if (banDurationUnit === 'h') multiplier = 60 * 60 * 1000;
          if (banDurationUnit === 'd') multiplier = 24 * 60 * 60 * 1000;
          
          banUntil = new Date(Date.now() + val * multiplier).toISOString();
      }

      try {
          await updateDoc(doc(db, "artifacts", GAME_ID, "public", "data", "profiles", banModalUser.uid), {
              isBanned: true,
              banReason: banReason || "Порушення правил",
              banUntil: banUntil
          });
          showToast(`Гравця ${banModalUser.nickname} заблоковано.`, "success");
          addSystemLog("Адмін", `БАН: Гравець ${banModalUser.nickname}. Причина: ${banReason}. Термін: ${banUntil ? banUntil : 'Назавжди'}`);
          setBanModalUser(null);
          setBanReason("");
          setBanDurationValue("");
      } catch (e) {
          console.error(e);
          showToast("Помилка під час блокування.", "error");
      }
  };

  const handleUnban = async (uid) => {
      try {
          await updateDoc(doc(db, "artifacts", GAME_ID, "public", "data", "profiles", uid), {
              isBanned: false,
              banReason: null,
              banUntil: null
          });
          showToast("Гравця успішно розблоковано.", "success");
          const targetUser = allUsers.find(u => u.uid === uid);
          addSystemLog("Адмін", `РОЗБАН: Гравець ${targetUser?.nickname || uid}`);
      } catch (e) {
          console.error(e);
          showToast("Помилка під час розблокування.", "error");
      }
  };

  const toggleAdminStatus = async (userObj) => {
      if (!currentProfile.isSuperAdmin) return;
      try {
          const newStatus = !userObj.isAdmin;
          await updateDoc(doc(db, "artifacts", GAME_ID, "public", "data", "profiles", userObj.uid), {
              isAdmin: newStatus
          });
          showToast(`Права адміна ${newStatus ? 'надано' : 'забрано'}.`, "success");
          addSystemLog("Адмін", `Зміна прав: ${userObj.nickname} тепер ${newStatus ? 'Адмін' : 'Гравець'}`);
      } catch(e) {
          console.error(e);
          showToast("Помилка зміни прав.", "error");
      }
  };

  const changeUserNickname = async () => {
      if (!adminNewNickname.trim() || adminNewNickname.trim() === viewingUser.nickname) return;
      try {
          const profilesSnap = await getDocs(collection(db, "artifacts", appId, "public", "data", "profiles"));
          let exists = false;
          profilesSnap.forEach(d => {
              if (d.data().nickname?.toLowerCase() === adminNewNickname.trim().toLowerCase() && d.id !== viewingUser.uid) exists = true;
          });
          
          if (exists) return showToast("Цей нікнейм вже зайнятий іншим гравцем!", "error");

          await updateDoc(doc(db, "artifacts", appId, "public", "data", "profiles", viewingUser.uid), {
              nickname: adminNewNickname.trim()
          });
          showToast("Нікнейм успішно змінено!", "success");
          addSystemLog("Адмін", `Змінено нікнейм гравцю з ${viewingUser.nickname} на ${adminNewNickname.trim()}`);
          setViewingUser(prev => ({...prev, nickname: adminNewNickname.trim()}));
      } catch (e) {
          console.error(e);
          showToast("Помилка зміни нікнейму.", "error");
      }
  };

  const giveCoinsToSelf = async (amount) => {
    try {
      const profileRef = doc(db, "artifacts", appId, "public", "data", "profiles", currentProfile.uid);
      await updateDoc(profileRef, { coins: increment(amount) });
      showToast(`Видано собі ${amount} монет!`, "success");
      addSystemLog("Адмін", `Видано собі ${amount} монет.`);
    } catch (e) {
      console.error(e);
      showToast("Помилка нарахування собі.", "error");
    }
  };

  const giveCardToUser = async () => {
    if (!adminAddCardId || adminAddCardAmount < 1) return;
    try {
      const batch = writeBatch(db);
      const invRef = doc(db, "artifacts", appId, "users", viewingUser.uid, "inventory", adminAddCardId);
      batch.set(invRef, { amount: increment(adminAddCardAmount) }, { merge: true });

      const profileRef = doc(db, "artifacts", appId, "public", "data", "profiles", viewingUser.uid);
      batch.update(profileRef, { totalCards: increment(adminAddCardAmount) });

      await batch.commit();
      
      const cDef = cardsCatalog.find(c => c.id === adminAddCardId);
      showToast(`Успішно нараховано ${adminAddCardAmount} шт.`, "success");
      addSystemLog("Адмін", `Видано ${adminAddCardAmount} шт. картки '${cDef?.name}' гравцю ${viewingUser.nickname}`);
      
      setAdminAddCardAmount(1);
      handleInspectUser(viewingUser.uid); 
    } catch (e) {
      console.error(e);
      showToast("Помилка нарахування картки.", "error");
    }
  };

  const giveCoinsToUser = async () => {
    if (!adminAddCoinsAmount || adminAddCoinsAmount === 0) return;
    try {
      const profileRef = doc(db, "artifacts", appId, "public", "data", "profiles", viewingUser.uid);
      await updateDoc(profileRef, { coins: increment(adminAddCoinsAmount) });
      
      const actionText = adminAddCoinsAmount > 0 ? "нараховано" : "віднято";
      showToast(`Успішно ${actionText} ${Math.abs(adminAddCoinsAmount)} монет.`, "success");
      addSystemLog("Адмін", `${actionText} ${Math.abs(adminAddCoinsAmount)} монет гравцю ${viewingUser.nickname}`);
      
      setViewingUser(prev => ({...prev, coins: prev.coins + adminAddCoinsAmount}));
      setAdminSetCoinsAmount(prev => prev + adminAddCoinsAmount);
      setAdminAddCoinsAmount(100);
    } catch (e) {
      console.error(e);
      showToast("Помилка нарахування монет.", "error");
    }
  };

  const setExactCoinsToUser = async () => {
    if (adminSetCoinsAmount === "" || isNaN(adminSetCoinsAmount) || adminSetCoinsAmount < 0) return;
    try {
      const val = parseInt(adminSetCoinsAmount, 10);
      const profileRef = doc(db, "artifacts", appId, "public", "data", "profiles", viewingUser.uid);
      await updateDoc(profileRef, { coins: val });
      
      showToast(`Баланс змінено на рівно ${val} монет.`, "success");
      addSystemLog("Адмін", `Встановлено точний баланс ${val} монет гравцю ${viewingUser.nickname}`);
      setViewingUser(prev => ({...prev, coins: val}));
    } catch (e) {
      console.error(e);
      showToast("Помилка встановлення балансу.", "error");
    }
  };

  const setPlayerFarmLevel = async () => {
    const val = parseInt(adminSetFarmLevel, 10);
    if (isNaN(val) || val < 1) return;
    try {
        // Змінюємо рівень
        const profileRef = doc(db, "artifacts", appId, "public", "data", "profiles", viewingUser.uid);
        await updateDoc(profileRef, { farmLevel: val });
        
        // Скидаємо прогрес арени, щоб бос нового рівня з'явився свіжим
        const farmRef = doc(db, "artifacts", appId, "users", viewingUser.uid, "farmState", "main");
        await setDoc(farmRef, { bossId: null, currentHp: null, pendingCoins: 0, cooldownUntil: null }, { merge: true });

        showToast(`Рівень Фарму змінено на ${val}`, "success");
        addSystemLog("Адмін", `Встановлено рівень фарму ${val} гравцю ${viewingUser.nickname}`);
        setViewingUser(prev => ({...prev, farmLevel: val}));
    } catch (e) {
        console.error(e);
        showToast("Помилка встановлення рівня.", "error");
    }
  };

  const removeCardFromUser = async (cardId, currentAmount) => {
    if (!confirm("Відібрати 1 таку картку в гравця?")) return;
    try {
      const batch = writeBatch(db);
      const invRef = doc(db, "artifacts", appId, "users", viewingUser.uid, "inventory", cardId);
      
      if (currentAmount <= 1) {
        batch.delete(invRef);
      } else {
        batch.update(invRef, { amount: increment(-1) });
      }

      const profileRef = doc(db, "artifacts", appId, "public", "data", "profiles", viewingUser.uid);
      batch.update(profileRef, { totalCards: increment(-1) });

      await batch.commit();
      showToast("Картку вилучено.", "success");
      const cDef = cardsCatalog.find(c => c.id === cardId);
      addSystemLog("Адмін", `Вилучено 1 шт. картки '${cDef?.name}' у гравця ${viewingUser.nickname}`);
      handleInspectUser(viewingUser.uid);
    } catch (e) {
      console.error(e);
      showToast("Помилка під час вилучення.", "error");
    }
  };

// --- СТАНИ ДЛЯ БОСІВ ---
    const [newBoss, setNewBoss] = useState({
        id: null,
        level: (bosses?.length || 0) + 1,
        cardId: cardsCatalog?.[0]?.id || "",
        maxHp: 1000,
        damagePerClick: 10,
        rewardPerClick: 2,
        killBonus: 500,
        cooldownHours: 4
    });

    const resetBossForm = () => setNewBoss({
        id: null, level: (bosses?.length || 0) + 1, cardId: cardsCatalog?.[0]?.id || "", maxHp: 1000, damagePerClick: 10, rewardPerClick: 2, killBonus: 500, cooldownHours: 4
    });

    const handleAddBoss = async (e) => {
            e.preventDefault();
            if (!newBoss.cardId) return showToast("Виберіть картку!", "error");

            const bossData = {
                id: newBoss.id || `boss_${Date.now()}`,
                level: Number(newBoss.level),
                cardId: newBoss.cardId,
                maxHp: Number(newBoss.maxHp),
                damagePerClick: Number(newBoss.damagePerClick),
                rewardPerClick: Number(newBoss.rewardPerClick),
                killBonus: Number(newBoss.killBonus),
                cooldownHours: Number(newBoss.cooldownHours)
            };

            let updatedBosses;
            if (newBoss.id) {
                updatedBosses = bosses.map(b => b.id === newBoss.id ? bossData : b).sort((a, b) => a.level - b.level);
            } else {
                updatedBosses = [...(bosses || []), bossData].sort((a, b) => a.level - b.level);
            }

            try {
                setIsSyncing(true);
                const settingsRef = doc(db, "artifacts", appId, "public", "data", "gameSettings", "main");
                await updateDoc(settingsRef, { bosses: updatedBosses });
                setBosses(updatedBosses);
                showToast(newBoss.id ? "Боса оновлено!" : `Боса ${bossData.level} рівня додано!`, "success");
                resetBossForm();
            } catch (error) {
                console.error(error);
                showToast("Помилка збереження боса", "error");
            }
            setIsSyncing(false);
        };


    const handleDeleteBoss = async (bossId) => {
        if (!confirm("Ви впевнені, що хочете видалити цього боса?")) return;
        const updatedBosses = bosses.filter(b => b.id !== bossId);
        try {
            setIsSyncing(true);
            const settingsRef = doc(db, "artifacts", appId, "public", "data", "gameSettings", "main");
            await updateDoc(settingsRef, { bosses: updatedBosses });
            setBosses(updatedBosses);
            showToast("Боса успішно видалено", "success");
        } catch (error) {
            console.error(error);
            showToast("Помилка видалення", "error");
        }
        setIsSyncing(false);
    };

  const handlePremiumAction = async (e, action) => {
      e.preventDefault();
      if (!premiumModalUser) return;
      
      try {
          if (action === "revoke") {
              await updateDoc(doc(db, "artifacts", appId, "public", "data", "profiles", premiumModalUser.uid), {
                  isPremium: false,
                  premiumUntil: null
              });
              showToast(`Преміум забрано у гравця ${premiumModalUser.nickname}`, "success");
              addSystemLog("Адмін", `Забрано Преміум у гравця ${premiumModalUser.nickname}`);
          } else {
              const days = Number(premiumGiveDays);
              if (days <= 0) return showToast("Кількість днів має бути більше 0", "error");
              
              let currentExp = new Date();
              if (premiumModalUser.isPremium && premiumModalUser.premiumUntil) {
                  const existingExp = new Date(premiumModalUser.premiumUntil);
                  if (!isNaN(existingExp) && existingExp > currentExp) currentExp = existingExp;
              }
              currentExp.setDate(currentExp.getDate() + days);

              await updateDoc(doc(db, "artifacts", appId, "public", "data", "profiles", premiumModalUser.uid), {
                  isPremium: true,
                  premiumUntil: currentExp.toISOString()
              });
              showToast(`Преміум (${days} днів) видано гравцю ${premiumModalUser.nickname}!`, "success");
              addSystemLog("Адмін", `Видано Преміум на ${days} днів гравцю ${premiumModalUser.nickname}`);
          }
          setPremiumModalUser(null);
      } catch (err) {
          console.error(err);
          showToast("Помилка операції з преміумом.", "error");
      }
  };

  const globalWipe = async () => {
      // Подвійний захист від випадкового натискання
      if (!confirm("УВАГА, МІЙ ЛОРД! Це повністю видалить всі інвентарі, лоти на ринку, вітрини та скине баланс і статистику всіх гравців. Продовжити?")) return;
      if (!confirm("ВИ ВПЕВНЕНІ? Цю дію неможливо буде скасувати!")) return;

      // Використовуємо setIsSyncing, щоб показати завантаження на кнопці
      setIsSyncing(true);
      showToast("Розпочато Велику Чистку...", "success");

      try {
          // 1. Видаляємо всі лоти на ринку
          const marketSnap = await getDocs(collection(db, "artifacts", appId, "public", "data", "market"));
          marketSnap.forEach((d) => deleteDoc(d.ref));

          // 2. Очищаємо лічильники ліміток (якщо вони там вже створилися)
          const statsSnap = await getDocs(collection(db, "artifacts", appId, "public", "data", "cardStats"));
          statsSnap.forEach((d) => deleteDoc(d.ref));

          // 3. Проходимося по кожному гравцю
          const profilesSnap = await getDocs(collection(db, "artifacts", appId, "public", "data", "profiles"));

          for (const profileDoc of profilesSnap.docs) {
              const uid = profileDoc.id;

              // Обнуляємо статистику та гроші (залишаємо нікнейм, бани, адмінку і преміум)
              await updateDoc(profileDoc.ref, {
                  coins: 200, // Початкові монети (змініть, якщо треба)
                  totalCards: 0,
                  uniqueCardsCount: 0,
                  packsOpened: 0,
                  coinsSpentOnPacks: 0,
                  coinsEarnedFromPacks: 0,
                  mainShowcaseId: null
              });

              // Видаляємо старий інвентар гравця
              const invSnap = await getDocs(collection(db, "artifacts", appId, "users", uid, "inventory"));
              invSnap.forEach((d) => deleteDoc(d.ref));

              // Видаляємо старі вітрини гравця
              const showcasesSnap = await getDocs(collection(db, "artifacts", appId, "users", uid, "showcases"));
              showcasesSnap.forEach((d) => deleteDoc(d.ref));
          }

          showToast("Королівство успішно очищено від старих карток!", "success");
          addSystemLog("Адмін", "ГЛОБАЛЬНИЙ ВАЙП: інвентарі, ринок, статистика та баланс скинуті до нуля.");
      } catch (error) {
          console.error(error);
          showToast("Помилка під час очищення!", "error");
      }
      
      setIsSyncing(false);
  };

  const savePack = async (e) => {
    e.preventDefault();
    let updatedPacks = [...packsCatalog];
    if (editingPack) {
      updatedPacks = updatedPacks.map((p) => p.id === editingPack.id ? { ...packForm, id: editingPack.id, cost: Number(packForm.cost), isHidden: !!packForm.isHidden, isPremiumOnly: !!packForm.isPremiumOnly, category: packForm.category || "Базові" } : p);
    } else {
      updatedPacks.push({ ...packForm, id: "p" + Date.now(), cost: Number(packForm.cost), isHidden: !!packForm.isHidden, isPremiumOnly: !!packForm.isPremiumOnly, category: packForm.category || "Базові" });
    }
    await updateDoc(doc(db, "artifacts", appId, "public", "data", "gameSettings", "main"), { packs: updatedPacks });
    addSystemLog("Адмін", `${editingPack ? 'Оновлено' : 'Створено'} пак: ${packForm.name}`);
    setEditingPack(null);
    setPackForm({ id: "", name: "", category: "Базові", cost: 50, image: "", customWeights: {}, isHidden: false, isPremiumOnly: false });
    showToast("Паки оновлено!", "success");
  };

  const deletePack = async (packId) => {
    if (!confirm("Видалити цей пак?")) return;
    const pDef = packsCatalog.find(p => p.id === packId);
    const updated = packsCatalog.filter((p) => p.id !== packId);
    await updateDoc(doc(db, "artifacts", appId, "public", "data", "gameSettings", "main"), { packs: updated });
    addSystemLog("Адмін", `Видалено пак: ${pDef?.name}`);
    showToast("Пак видалено!", "success");
  };

  const saveCard = async (e) => {
    e.preventDefault();
    let updatedCatalog = [...cardsCatalog];
    
    const newCardData = {
        id: editingCard ? editingCard.id : "c" + Date.now(),
        packId: cardForm.packId,
        name: cardForm.name,
        rarity: cardForm.rarity,
        image: cardForm.image,
        maxSupply: cardForm.maxSupply ? Number(cardForm.maxSupply) : 0,
        weight: cardForm.weight ? Number(cardForm.weight) : "",
        sellPrice: cardForm.sellPrice ? Number(cardForm.sellPrice) : SELL_PRICE,
        effect: cardForm.effect || "",
        soundUrl: cardForm.soundUrl || "",
        soundVolume: cardForm.soundVolume !== undefined ? Number(cardForm.soundVolume) : 0.5,
        pulledCount: editingCard ? (editingCard.pulledCount || 0) : 0
    };

    if (editingCard) {
      updatedCatalog = updatedCatalog.map((c) => c.id === editingCard.id ? newCardData : c);
    } else {
      updatedCatalog.push(newCardData);
    }
    
    await updateDoc(doc(db, "artifacts", appId, "public", "data", "gameSettings", "main"), { cards: updatedCatalog });
    addSystemLog("Адмін", `${editingCard ? 'Оновлено' : 'Створено'} картку: ${cardForm.name}`);
    
    setEditingCard(null);
    setCardForm({ id: "", packId: packsCatalog[0]?.id || "", name: "", rarity: rarities[0]?.name || "Звичайна", image: "", maxSupply: "", weight: "", sellPrice: "", effect: "", soundUrl: "", soundVolume: 0.5 });
    showToast("Каталог оновлено!", "success");
  };

  const deleteCard = async (cardId) => {
    if (!confirm("Видалити цю картку?")) return;
    const cDef = cardsCatalog.find(c => c.id === cardId);
    const updated = cardsCatalog.filter((c) => c.id !== cardId);
    await updateDoc(doc(db, "artifacts", appId, "public", "data", "gameSettings", "main"), { cards: updated });
    addSystemLog("Адмін", `Видалено картку: ${cDef?.name}`);
    showToast("Картку видалено!", "success");
  };

  const savePromo = async (e) => {
      e.preventDefault();
      const codeId = promoForm.code.trim().toUpperCase();
      if (!codeId) return;
      try {
          await setDoc(doc(db, "artifacts", appId, "public", "data", "promoCodes", codeId), {
              code: codeId,
              reward: Number(promoForm.reward),
              maxGlobalUses: Number(promoForm.maxGlobalUses),
              maxUserUses: Number(promoForm.maxUserUses),
              currentGlobalUses: 0,
              version: Date.now()
          });
          showToast("Промокод створено!", "success");
          addSystemLog("Адмін", `Створено промокод: ${codeId} (нагорода ${promoForm.reward})`);
          setPromoForm({ code: "", reward: 100, maxGlobalUses: 0, maxUserUses: 1 });
      } catch (err) {
          console.error(err);
          showToast("Помилка створення промокоду", "error");
      }
  };

  const deletePromo = async (codeId) => {
      if (!confirm("Видалити промокод?")) return;
      try {
          await deleteDoc(doc(db, "artifacts", appId, "public", "data", "promoCodes", codeId));
          addSystemLog("Адмін", `Видалено промокод: ${codeId}`);
          showToast("Промокод видалено.", "success");
      } catch (err) {
          console.error(err);
          showToast("Помилка видалення.", "error");
      }
  };

  const saveSettings = async (e) => {
      e.preventDefault();
      try {
          await updateDoc(doc(db, "artifacts", appId, "public", "data", "gameSettings", "main"), { 
              dailyRewards: rewardsForm,
              premiumDailyRewards: premiumRewardsForm,
              premiumPrice: Number(priceForm),
              premiumDurationDays: Number(durationDaysForm)
          });
          addSystemLog("Адмін", "Оновлено налаштування гри (Нагороди / Ціна Преміуму / Термін).");
          showToast("Налаштування оновлено!", "success");
      } catch (err) {
          console.error(err);
          showToast("Помилка оновлення налаштувань.", "error");
      }
  };

  const addPremiumShopItem = async (e) => {
      e.preventDefault();
      try {
          const newItem = {
              id: "si_" + Date.now(),
              type: shopItemForm.type,
              itemId: shopItemForm.itemId,
              price: Number(shopItemForm.price),
              description: shopItemForm.description
          };
          const updatedItems = [...premiumShopItems, newItem];
          await updateDoc(doc(db, "artifacts", appId, "public", "data", "gameSettings", "main"), { premiumShopItems: updatedItems });
          addSystemLog("Адмін", `Додано товар у Преміум Магазин.`);
          showToast("Товар додано!", "success");
          setShopItemForm({ type: "card", itemId: "", price: 500, description: "" });
      } catch(err) {
          console.error(err);
          showToast("Помилка додавання товару.", "error");
      }
  };

  const deletePremiumShopItem = async (itemId) => {
      if (!confirm("Видалити товар з магазину?")) return;
      try {
          const updated = premiumShopItems.filter(i => i.id !== itemId);
          await updateDoc(doc(db, "artifacts", appId, "public", "data", "gameSettings", "main"), { premiumShopItems: updated });
          showToast("Товар видалено.", "success");
      } catch(err) {
          console.error(err);
          showToast("Помилка видалення.", "error");
      }
  }

  const clearAdminLogs = async () => {
    if (!confirm("Очистити всі системні логи? Це безповоротно!")) return;
    try {
        const batch = writeBatch(db);
        adminLogs.forEach(log => {
            const ref = doc(db, "artifacts", appId, "public", "data", "adminLogs", log.id);
            batch.delete(ref);
        });
        await batch.commit();
        showToast("Логи успішно очищено!", "success");
    } catch(e) {
        console.error(e);
        showToast("Помилка очищення логів.", "error");
    }
  };

  const filteredPacks = packsCatalog.filter(p => p.name.toLowerCase().includes(packSearchTerm.toLowerCase()));
  
  const filteredCards = cardsCatalog
    .filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(cardSearchTerm.toLowerCase());
      const matchesPack = cardPackFilter === "all" || c.packId === cardPackFilter;
      return matchesSearch && matchesPack;
    })
    .sort((a, b) => {
        const wA = rarities.find(r => r.name === a.rarity)?.weight || 100;
        const wB = rarities.find(r => r.name === b.rarity)?.weight || 100;
        return wA - wB; // Менша вага (рідкісніші) йдуть першими
    });
    
  const filteredAdminUsers = allUsers.filter(u => u.nickname?.toLowerCase().includes(adminUserSearchTerm.toLowerCase()));

  return (
    <div className="max-w-4xl mx-auto pb-10 relative">

      {/* МОДАЛКА БАНУ */}
      {banModalUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
              <div className="bg-neutral-900 border border-red-900/50 p-6 rounded-3xl shadow-2xl max-w-sm w-full animate-in zoom-in-95">
                  <h3 className="text-xl font-black text-red-500 mb-4 flex items-center gap-2"><Ban /> Заблокувати {banModalUser.nickname}</h3>
                  <form onSubmit={submitBan} className="space-y-4">
                      <div>
                          <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">Причина блокування:</label>
                          <input type="text" value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="Наприклад: Чіти, Образи..." required className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-red-500 outline-none" />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">Термін:</label>
                          <div className="flex gap-2">
                             {banDurationUnit !== "perm" && (
                                <input type="number" min="1" value={banDurationValue} onChange={e => setBanDurationValue(e.target.value)} placeholder="Час..." required className="w-1/2 bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-red-500 outline-none" />
                             )}
                             <select value={banDurationUnit} onChange={e => {setBanDurationUnit(e.target.value); if(e.target.value==="perm") setBanDurationValue("");}} className="w-1/2 flex-1 bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-red-500 outline-none">
                                 <option value="m">Хвилин</option>
                                 <option value="h">Годин</option>
                                 <option value="d">Днів</option>
                                 <option value="perm">Назавжди</option>
                             </select>
                          </div>
                      </div>
                      <div className="flex gap-3 pt-2">
                          <button type="submit" className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl transition-colors">Забанити</button>
                          <button type="button" onClick={() => {setBanModalUser(null); setBanReason(""); setBanDurationValue("");}} className="bg-neutral-800 text-white font-bold py-3 px-6 rounded-xl">Скасувати</button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* МОДАЛКА ПРЕМІУМУ */}
      {premiumModalUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
              <div className="bg-neutral-900 border border-fuchsia-900/50 p-6 rounded-3xl shadow-2xl max-w-sm w-full animate-in zoom-in-95">
                  <h3 className="text-xl font-black text-fuchsia-400 mb-4 flex items-center gap-2"><Gem /> Преміум: {premiumModalUser.nickname}</h3>
                  <div className="space-y-4">
                      {premiumModalUser.isPremium && premiumModalUser.premiumUntil && new Date(premiumModalUser.premiumUntil) > new Date() && (
                          <div className="bg-fuchsia-900/20 border border-fuchsia-500/30 p-3 rounded-xl text-fuchsia-300 text-sm mb-4">
                              Поточний преміум до: <br/><span className="font-bold">{formatDate(premiumModalUser.premiumUntil)}</span>
                          </div>
                      )}
                      <form onSubmit={(e) => handlePremiumAction(e, "give")}>
                          <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">Додати/Видати днів:</label>
                          <input type="number" min="1" value={premiumGiveDays} onChange={e => setPremiumGiveDays(e.target.value)} required className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-fuchsia-500 outline-none mb-4" />
                          <button type="submit" className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold py-3 rounded-xl transition-colors shadow-lg">Видати / Продовжити</button>
                      </form>
                      
                      {premiumModalUser.isPremium && (
                          <button onClick={(e) => handlePremiumAction(e, "revoke")} className="w-full bg-red-900/40 hover:bg-red-900 text-red-400 font-bold py-3 rounded-xl transition-colors border border-red-900/50 mt-2">Забрати Преміум</button>
                      )}
                      <button onClick={() => setPremiumModalUser(null)} className="w-full bg-neutral-800 text-white font-bold py-3 rounded-xl mt-2 hover:bg-neutral-700 transition-colors">Скасувати</button>
                  </div>
              </div>
          </div>
      )}

      <div className="flex gap-2 mb-6 bg-neutral-900 p-2 rounded-xl overflow-x-auto hide-scrollbar">
        <button onClick={() => setActiveTab("users")} className={`flex-1 min-w-[100px] py-3 rounded-lg font-bold flex justify-center items-center gap-2 ${activeTab === "users" ? "bg-purple-600 text-white" : "text-neutral-400 hover:bg-neutral-800"}`}><Users size={18} /> Гравці</button>
        <button onClick={() => setActiveTab("packs")} className={`flex-1 min-w-[100px] py-3 rounded-lg font-bold flex justify-center items-center gap-2 ${activeTab === "packs" ? "bg-purple-600 text-white" : "text-neutral-400 hover:bg-neutral-800"}`}><Layers size={18} /> Паки</button>
        <button onClick={() => setActiveTab("cards")} className={`flex-1 min-w-[100px] py-3 rounded-lg font-bold flex justify-center items-center gap-2 ${activeTab === "cards" ? "bg-purple-600 text-white" : "text-neutral-400 hover:bg-neutral-800"}`}><LayoutGrid size={18} /> Картки</button>
        {currentProfile.isAdmin && (
            <>
                <button onClick={() => setActiveTab("bosses")} className={`whitespace-nowrap flex items-center gap-2 px-4 py-2 sm:py-3 rounded-xl font-bold transition-all text-sm sm:text-base ${activeTab === "bosses" ? "bg-red-600/20 text-red-500 border border-red-500/50" : "bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white"}`}>
            <Swords size={18} /> Боси
        </button>
                <button onClick={() => setActiveTab("promos")} className={`flex-1 min-w-[100px] py-3 rounded-lg font-bold flex justify-center items-center gap-2 ${activeTab === "promos" ? "bg-purple-600 text-white" : "text-neutral-400 hover:bg-neutral-800"}`}><Ticket size={18} /> Коди</button>
                <button onClick={() => setActiveTab("premiumShop")} className={`flex-1 min-w-[100px] py-3 rounded-lg font-bold flex justify-center items-center gap-2 ${activeTab === "premiumShop" ? "bg-fuchsia-600 text-white" : "text-fuchsia-400/70 hover:bg-neutral-800"}`}><Gem size={18} /> Прем Товари</button>
                <button onClick={() => setActiveTab("settings")} className={`flex-1 min-w-[100px] py-3 rounded-lg font-bold flex justify-center items-center gap-2 ${activeTab === "settings" ? "bg-purple-600 text-white" : "text-neutral-400 hover:bg-neutral-800"}`}><Settings size={18} /> Налаштування</button>
                <button onClick={() => setActiveTab("logs")} className={`flex-1 min-w-[100px] py-3 rounded-lg font-bold flex justify-center items-center gap-2 ${activeTab === "logs" ? "bg-red-900/80 text-white border-red-500 border" : "text-red-400 hover:bg-neutral-800"}`}><ScrollText size={18} /> Логи</button>
            </>
        )}
      </div>

      {/* --- Вкладка: ГРАВЦІ --- */}
      {activeTab === "users" && (
        <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-4 relative">
          
          {!viewingUser && (
              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 mb-6 flex flex-col sm:flex-row gap-3 items-end sm:items-center">
                  <div className="flex-1 w-full text-left">
                     <span className="text-white font-bold flex items-center gap-2"><Coins className="text-yellow-500"/> Швидко видати собі монети:</span>
                  </div>
                  <button onClick={() => giveCoinsToSelf(1000)} className="bg-yellow-600 hover:bg-yellow-500 w-full sm:w-auto px-6 py-2.5 rounded-xl text-yellow-950 font-bold transition-colors shadow-lg">+ 1000</button>
                  <button onClick={() => giveCoinsToSelf(5000)} className="bg-yellow-600 hover:bg-yellow-500 w-full sm:w-auto px-6 py-2.5 rounded-xl text-yellow-950 font-bold transition-colors shadow-lg">+ 5000</button>
                  
                  <div className="w-full sm:w-px h-px sm:h-8 bg-neutral-800 mx-2"></div>

                  <button onClick={syncAllProfiles} disabled={isSyncing} className="bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 w-full sm:w-auto px-6 py-2.5 rounded-xl text-white font-bold transition-colors shadow-lg flex items-center justify-center gap-2">
                      {isSyncing ? <Loader2 size={18} className="animate-spin" /> : <Database size={18} />}
                      Синхронізувати Профілі
                  </button>
              </div>
          )}
      
          {viewingUser ? (
            <div className="animate-in fade-in slide-in-from-right-4">
              <button onClick={() => setViewingUser(null)} className="mb-4 text-neutral-400 hover:text-white flex items-center gap-2 font-bold"><ArrowLeft size={18}/> Назад до списку</button>
              
              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 mb-4 flex flex-col sm:flex-row gap-3 items-end sm:items-center">
                  <div className="flex-1 w-full">
                      <label className="text-xs text-neutral-400 font-bold mb-1 block">Змінити нікнейм гравцю:</label>
                      <input type="text" value={adminNewNickname} onChange={(e) => setAdminNewNickname(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white outline-none focus:border-blue-500" />
                  </div>
                  <button onClick={changeUserNickname} disabled={!adminNewNickname.trim() || adminNewNickname === viewingUser.nickname} className="bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 text-white font-bold px-4 py-2 rounded-lg w-full sm:w-auto transition-colors h-10">
                      Змінити
                  </button>
              </div>

              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 mb-4 flex flex-col sm:flex-row gap-3 items-end sm:items-center">
                <div className="flex-1 w-full">
                    <label className="text-xs text-neutral-400 font-bold mb-1 block">Нарахувати картку гравцю:</label>
                    <select value={adminAddCardId} onChange={(e) => setAdminAddCardId(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white outline-none focus:border-purple-500">
                        <option value="" disabled>Оберіть картку (найрідкісніші зверху)...</option>
                        {filteredCards.map(c => <option key={c.id} value={c.id}>{c.name} ({c.rarity})</option>)}
                    </select>
                </div>
                <div className="w-full sm:w-24">
                    <label className="text-xs text-neutral-400 font-bold mb-1 block">Кількість:</label>
                    <input type="number" min="1" value={adminAddCardAmount} onChange={(e) => setAdminAddCardAmount(Number(e.target.value))} className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white outline-none focus:border-purple-500" />
                </div>
                <button onClick={giveCardToUser} disabled={!adminAddCardId} className="bg-green-600 hover:bg-green-500 disabled:bg-neutral-700 text-white font-bold px-4 py-2 rounded-lg w-full sm:w-auto transition-colors h-10">
                    Надати
                </button>
              </div>

              <div className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 flex-1 flex flex-col gap-3 justify-end">
                    <div>
                        <label className="text-xs text-neutral-400 font-bold mb-1 block">Встановити точний баланс:</label>
                        <input type="number" value={adminSetCoinsAmount} onChange={(e) => setAdminSetCoinsAmount(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white outline-none focus:border-yellow-500" />
                    </div>
                    <button onClick={setExactCoinsToUser} className="bg-yellow-600 hover:bg-yellow-500 text-yellow-950 font-bold px-4 py-2 rounded-lg w-full transition-colors h-10">
                        Встановити
                    </button>
                </div>

                <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 flex-1 flex flex-col gap-3 justify-end">
                    <div>
                        <label className="text-xs text-neutral-400 font-bold mb-1 block">Рівень Босів (Фарм):</label>
                        <input type="number" min="1" value={adminSetFarmLevel} onChange={(e) => setAdminSetFarmLevel(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white outline-none focus:border-red-500" />
                    </div>
                    <button onClick={setPlayerFarmLevel} className="bg-red-600 hover:bg-red-500 text-white font-bold px-4 py-2 rounded-lg w-full transition-colors h-10">
                        Встановити рівень
                    </button>
                </div>

                <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 flex-1 flex flex-col gap-3 justify-end">
                    <div>
                        <label className="text-xs text-neutral-400 font-bold mb-1 block">Нарахувати / Відняти монети (можна з мінусом):</label>
                        <input type="number" value={adminAddCoinsAmount} onChange={(e) => setAdminAddCoinsAmount(Number(e.target.value))} className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white outline-none focus:border-yellow-500" />
                    </div>
                    <button onClick={giveCoinsToUser} className="bg-yellow-600 hover:bg-yellow-500 text-yellow-950 font-bold px-4 py-2 rounded-lg w-full transition-colors h-10">
                        Додати/Відняти
                    </button>
                </div>
              </div>

              <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">Інвентар: <span className="text-yellow-500">{viewingUser.nickname}</span> ({viewingUser.coins} <Coins size={16} />)</h3>
              
              {loadingUserInv ? (
                 <div className="py-10 text-center text-neutral-500"><Loader2 className="animate-spin mx-auto w-8 h-8"/></div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 mt-6">
                  {userInventory.map(invItem => {
                    const c = cardsCatalog.find(cat => cat.id === invItem.id);
                    if (!c) return null;
                    const style = getCardStyle(c.rarity, rarities);
                    const effectClass = c.effect ? `effect-${c.effect}` : '';

                    return (
                      <div key={invItem.id} className={`bg-neutral-950 rounded-xl border-2 ${style.border} overflow-hidden flex flex-col items-center p-1 relative group ${effectClass}`}>
                        <img src={c.image} alt={c.name} className="w-full aspect-[2/3] object-cover rounded-lg mb-2 group-hover:opacity-40 transition-opacity" />
                        <div className="text-[10px] font-bold text-white truncate w-full text-center">{c.name}</div>
                        <div className="text-xs font-black text-yellow-500 mb-1 z-10">x{invItem.amount}</div>
                        
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20">
                            <button onClick={() => removeCardFromUser(invItem.id, invItem.amount)} className="bg-red-600 hover:bg-red-500 text-white p-2 rounded-full font-bold shadow-[0_0_15px_rgba(220,38,38,0.8)] transform hover:scale-110 transition-transform" title="Вилучити 1 шт.">
                                <Trash2 size={18} />
                            </button>
                        </div>
                      </div>
                    )
                  })}
                  {userInventory.length === 0 && <p className="col-span-full text-neutral-500">Інвентар порожній.</p>}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
                <input type="text" placeholder="Пошук гравця за нікнеймом..." value={adminUserSearchTerm} onChange={(e) => setAdminUserSearchTerm(e.target.value)} className="w-full bg-neutral-950 border border-neutral-700 rounded-xl pl-10 pr-4 py-3 text-white focus:border-purple-500 outline-none" />
              </div>
              
              <div className="space-y-2">
                  {filteredAdminUsers.map((u, i) => {
                    const canBan = u.uid !== currentProfile.uid && (!u.isSuperAdmin) && (!u.isAdmin || currentProfile.isSuperAdmin);
                    const canToggleAdmin = currentProfile.isSuperAdmin && u.uid !== currentProfile.uid && !u.isSuperAdmin;
                    const isUserPremium = u.isPremium && u.premiumUntil && new Date(u.premiumUntil) > new Date();

                    return (
                      <div key={i} className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-3 px-4 border border-neutral-800 bg-neutral-950 rounded-xl gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <PlayerAvatar profile={u} className="w-10 h-10 rounded-full shrink-0" iconSize={18} />
                          <div className="min-w-0">
                            <div 
                                className="font-bold text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-2 truncate cursor-pointer transition-colors"
                                onClick={() => {
                                    setViewingPlayerProfile(u.uid);
                                    setCurrentView("publicProfile");
                                }}
                            >
                              {u.nickname} 
                              {isUserPremium && <Gem size={14} className="text-fuchsia-400 fill-fuchsia-400 shrink-0" title="Преміум" />}
                              {u.isBanned && <span className="text-[10px] bg-red-900/50 text-red-400 px-2 py-0.5 rounded border border-red-800 uppercase font-black tracking-widest shrink-0">Бан</span>}
                            </div>
                            <div className="text-xs text-neutral-500 truncate">{u.email || "Приховано (Google)"}</div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <div className="hidden sm:block text-right mr-2">
                             <div className="text-[10px] text-neutral-500 uppercase font-bold">Монети / Карти</div>
                             <div className="text-sm font-bold text-yellow-500">{u.coins} <Coins size={12} className="inline text-yellow-600"/> / <span className="text-blue-400">{u.uniqueCardsCount || 0}</span></div>
                          </div>

                          {currentProfile.isSuperAdmin && (
                              <button onClick={() => {setPremiumModalUser(u); setPremiumGiveDays(premiumDurationDays);}} className={`p-2 rounded-lg transition-colors ${isUserPremium ? 'bg-fuchsia-600 text-white' : 'bg-fuchsia-900/40 text-fuchsia-400 hover:bg-fuchsia-900'}`} title="Управління Преміумом">
                                  <Gem size={18} />
                              </button>
                          )}

                          {canToggleAdmin && (
                             <button onClick={() => toggleAdminStatus(u)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors border ${u.isAdmin ? "bg-neutral-800 text-neutral-400 border-neutral-700 hover:bg-neutral-700" : "bg-purple-900/40 text-purple-400 border-purple-800 hover:bg-purple-900/60"}`}>
                                {u.isAdmin ? "- Адмінку" : "+ Адмінку"}
                             </button>
                          )}

                          <button onClick={() => handleInspectUser(u.uid)} className="p-2 bg-blue-900/40 text-blue-400 hover:bg-blue-900 rounded-lg transition-colors" title="Управління гравцем (Інвентар)">
                            <Eye size={18} />
                          </button>
                          
                          {canBan && (
                            <>
                                {u.isBanned ? (
                                    <button onClick={() => handleUnban(u.uid)} className="p-2 bg-green-900/40 text-green-400 hover:bg-green-900 rounded-lg transition-colors" title="Розбанити">
                                        <CheckCircle2 size={18} />
                                    </button>
                                ) : (
                                    <button onClick={() => setBanModalUser(u)} className="p-2 bg-orange-900/40 text-orange-400 hover:bg-orange-900 rounded-lg transition-colors" title="Заблокувати (Бан)">
                                        <Ban size={18} />
                                    </button>
                                )}
                                <button onClick={() => handleDeleteUser(u)} className="p-2 bg-red-900/40 text-red-500 hover:bg-red-900 rounded-lg transition-colors ml-1" title="Видалити акаунт назавжди">
                                    <Trash2 size={18} />
                                </button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {filteredAdminUsers.length === 0 && <div className="text-center py-8 text-neutral-500">Гравців за запитом не знайдено.</div>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- Вкладка: НАЛАШТУВАННЯ (Щоденні нагороди) --- */}
      {activeTab === "settings" && currentProfile.isAdmin && (
         <div className="space-y-6 animate-in fade-in">

             <form onSubmit={saveSettings} className="bg-neutral-900 border border-purple-900/50 p-6 rounded-2xl">
                 <h3 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
                     <Settings className="text-blue-500"/> Глобальні Налаштування
                 </h3>
                 
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                     <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800">
                         <label className="text-xs font-bold text-neutral-400 uppercase mb-2 block">Ціна Преміум-Акаунту (Монети):</label>
                         <div className="relative">
                             <Coins className="absolute left-3 top-1/2 -translate-y-1/2 text-yellow-500 w-5 h-5" />
                             <input type="number" min="0" value={priceForm} onChange={e => setPriceForm(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded-lg pl-10 pr-4 py-3 text-white focus:border-purple-500 outline-none font-bold" />
                         </div>
                     </div>
                     <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800">
                         <label className="text-xs font-bold text-neutral-400 uppercase mb-2 block">Термін Преміум-Акаунту (Дні):</label>
                         <div className="relative">
                             <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500 w-5 h-5" />
                             <input type="number" min="1" value={durationDaysForm} onChange={e => setDurationDaysForm(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded-lg pl-10 pr-4 py-3 text-white focus:border-blue-500 outline-none font-bold" />
                         </div>
                     </div>
                 </div>

                 <div className="mb-6">
                     <h4 className="text-sm font-bold text-orange-400 mb-2 flex items-center gap-2"><Gift size={16}/> Щоденні Нагороди (Звичайні)</h4>
                     <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                         {rewardsForm.map((val, idx) => (
                             <div key={`norm-${idx}`} className="bg-neutral-950 p-2 rounded-xl border border-neutral-800">
                                 <label className="text-[10px] font-bold text-neutral-500 uppercase block mb-1">День {idx + 1}</label>
                                 <input type="number" min="0" value={val} onChange={(e) => { const newArr = [...rewardsForm]; newArr[idx] = Number(e.target.value); setRewardsForm(newArr); }} className="w-full bg-transparent text-white font-bold outline-none text-sm" />
                             </div>
                         ))}
                     </div>
                 </div>

                 <div className="mb-6">
                     <h4 className="text-sm font-bold text-fuchsia-400 mb-2 flex items-center gap-2"><Gem size={16}/> Щоденні Нагороди (Преміум)</h4>
                     <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                         {premiumRewardsForm.map((val, idx) => (
                             <div key={`prem-${idx}`} className="bg-neutral-950 p-2 rounded-xl border border-fuchsia-900/50">
                                 <label className="text-[10px] font-bold text-fuchsia-500 uppercase block mb-1">День {idx + 1}</label>
                                 <input type="number" min="0" value={val} onChange={(e) => { const newArr = [...premiumRewardsForm]; newArr[idx] = Number(e.target.value); setPremiumRewardsForm(newArr); }} className="w-full bg-transparent text-white font-bold outline-none text-sm" />
                             </div>
                         ))}
                     </div>
                 </div>

                 <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl shadow-lg transition-colors">
                     Зберегти Налаштування
                 </button>
             </form>
         </div>
      )}
      {/* --- Вкладка: БОСИ --- */}
          {activeTab === "bosses" && currentProfile.isAdmin && (
            <div className="space-y-6 animate-in fade-in">
                <h2 className="text-2xl font-black text-white uppercase tracking-widest flex items-center gap-2 mb-6">
                    <Swords className="text-red-500" /> Налаштування Босів
                </h2>

                {/* Форма створення Боса */}
                <form onSubmit={handleAddBoss} className="bg-neutral-900 border border-red-900/50 p-6 rounded-2xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs text-neutral-500 uppercase font-bold mb-1">Рівень Боса</label>
                        <input type="number" required value={newBoss.level} onChange={e => setNewBoss({...newBoss, level: e.target.value})} className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500" />
                    </div>
                    <div>
                        <label className="block text-xs text-neutral-500 uppercase font-bold mb-1">Картка (Обмеження: Звичайна-Рідкісна)</label>
                        <select required value={newBoss.cardId} onChange={e => setNewBoss({...newBoss, cardId: e.target.value})} className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500">
                            {cardsCatalog.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-neutral-500 uppercase font-bold mb-1">Здоров'я (Max HP)</label>
                        <input type="number" required value={newBoss.maxHp} onChange={e => setNewBoss({...newBoss, maxHp: e.target.value})} className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500" />
                    </div>
                    <div>
                        <label className="block text-xs text-neutral-500 uppercase font-bold mb-1">Урон від 1 кліку гравця</label>
                        <input type="number" required value={newBoss.damagePerClick} onChange={e => setNewBoss({...newBoss, damagePerClick: e.target.value})} className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500" title="Скільки ХП знімає один тап (наприклад, 10)" />
                    </div>
                    <div>
                        <label className="block text-xs text-neutral-500 uppercase font-bold mb-1">Монет за 1 клік</label>
                        <input type="number" required value={newBoss.rewardPerClick} onChange={e => setNewBoss({...newBoss, rewardPerClick: e.target.value})} className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500" />
                    </div>
                    <div>
                        <label className="block text-xs text-neutral-500 uppercase font-bold mb-1">Бонус за вбивство</label>
                        <input type="number" required value={newBoss.killBonus} onChange={e => setNewBoss({...newBoss, killBonus: e.target.value})} className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500" />
                    </div>
                    <div>
                        <label className="block text-xs text-neutral-500 uppercase font-bold mb-1">Кулдаун (Годин)</label>
                        <input type="number" required step="0.5" value={newBoss.cooldownHours} onChange={e => setNewBoss({...newBoss, cooldownHours: e.target.value})} className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500" />
                    </div>
                    
                <div className="sm:col-span-2 md:col-span-3 flex items-end gap-2">
                    <button type="submit" disabled={isSyncing} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-6 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                        {isSyncing ? <Loader2 size={20} className="animate-spin" /> : <Swords size={20} />} 
                        {newBoss.id ? "Зберегти зміни" : "Додати Боса"}
                    </button>
                    {newBoss.id && (
                        <button type="button" onClick={resetBossForm} className="bg-neutral-800 hover:bg-neutral-700 text-white font-bold py-3 px-6 rounded-xl transition-colors">
                            Скасувати
                        </button>
                    )}
                </div>
                </form>

                {/* Список існуючих Босів */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                    {[...(bosses || [])].sort((a, b) => a.level - b.level).map((boss) => {
                        const bCard = cardsCatalog.find(c => c.id === boss.cardId);
                        return (
                            <div key={boss.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex gap-4 relative overflow-hidden group">
                                <div className="w-20 aspect-[2/3] rounded-lg border border-neutral-700 overflow-hidden flex-shrink-0 relative">
                                    {bCard && <img src={bCard.image} alt="boss" className="w-full h-full object-cover" />}
                                    <div className="absolute top-0 left-0 w-full bg-black/80 text-center text-[10px] font-black text-red-500 py-0.5">LVL {boss.level}</div>
                                </div>
                                <div className="flex-1">
                                    <h4 className="text-white font-black text-lg">{bCard?.name || "Невідомо"}</h4>
                                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-2 text-xs text-neutral-400">
                                        <div>HP: <span className="text-white">{boss.maxHp}</span></div>
                                        <div>Урон: <span className="text-red-400">-{boss.damagePerClick}</span></div>
                                        <div>За тап: <span className="text-yellow-500">+{boss.rewardPerClick} 🪙</span></div>
                                        <div>Бонус: <span className="text-yellow-500">+{boss.killBonus} 🪙</span></div>
                                        <div className="col-span-2">Кулдаун: <span className="text-blue-400">{boss.cooldownHours} год.</span></div>
                                    </div>
                                </div>
                                <button onClick={() => { setNewBoss(boss); window.scrollTo({top: 0, behavior: 'smooth'}); }} className="absolute top-3 right-10 text-neutral-500 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100">
                                <Edit size={18} />
                                </button>
                                <button onClick={() => handleDeleteBoss(boss.id)} className="absolute top-3 right-3 text-neutral-500 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
          )}
      {/* --- Вкладка: ТОВАРИ ПРЕМІУМ МАГАЗИНУ --- */}
      {activeTab === "premiumShop" && currentProfile.isAdmin && (
          <div className="space-y-6 animate-in fade-in">
              <form onSubmit={addPremiumShopItem} className="bg-neutral-900 border border-fuchsia-900/50 p-6 rounded-2xl">
                  <h3 className="text-xl font-bold mb-4 text-fuchsia-400 flex items-center gap-2"><Gem /> Додати товар у Прем. Магазин</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                          <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">Оберіть картку (ексклюзив):</label>
                          <select value={shopItemForm.itemId} onChange={(e) => setShopItemForm({ ...shopItemForm, itemId: e.target.value })} className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white outline-none focus:border-fuchsia-500" required>
                              <option value="" disabled>Оберіть...</option>
                              {filteredCards.map(c => <option key={c.id} value={c.id}>{c.name} ({c.rarity})</option>)}
                          </select>
                      </div>
                      <div>
                          <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">Ціна (Монети):</label>
                          <input type="number" value={shopItemForm.price} onChange={(e) => setShopItemForm({ ...shopItemForm, price: e.target.value })} className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white outline-none focus:border-fuchsia-500" min="1" required />
                      </div>
                      <div className="sm:col-span-2">
                          <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">Короткий опис товару:</label>
                          <input type="text" placeholder="Наприклад: Легендарна лімітована картка тільки для преміум-гравців!" value={shopItemForm.description} onChange={(e) => setShopItemForm({ ...shopItemForm, description: e.target.value })} className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white outline-none focus:border-fuchsia-500" required />
                      </div>
                  </div>
                  <button type="submit" className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold py-3 rounded-xl shadow-lg transition-colors">Додати товар</button>
              </form>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {premiumShopItems.map(item => {
                      const cDef = cardsCatalog.find(c => c.id === item.itemId);
                      return (
                          <div key={item.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex gap-4 relative">
                              <button onClick={() => deletePremiumShopItem(item.id)} className="absolute top-2 right-2 text-red-500 hover:bg-red-900/30 p-1.5 rounded-lg transition-colors"><Trash2 size={16}/></button>
                              <div className="w-16 h-24 bg-neutral-950 border border-neutral-700 rounded-md shrink-0 overflow-hidden">
                                  <img src={cDef?.image} className="w-full h-full object-cover" alt="" />
                              </div>
                              <div className="flex-1 min-w-0 pr-6">
                                  <div className="text-[10px] text-fuchsia-400 font-bold uppercase tracking-widest mb-1">Картка</div>
                                  <div className="font-bold text-white text-sm truncate">{cDef?.name || "Невідомо"}</div>
                                  <div className="text-xs text-yellow-500 font-bold mt-1 mb-2">{item.price} <Coins size={10} className="inline"/></div>
                                  <div className="text-[10px] text-neutral-500 line-clamp-2 leading-tight">{item.description}</div>
                              </div>
                          </div>
                      );
                  })}
              </div>
          </div>
      )}

      {/* --- Вкладка: ПРОМОКОДИ --- */}
      {activeTab === "promos" && currentProfile.isAdmin && (
         <div className="space-y-6 animate-in fade-in">
            <form onSubmit={savePromo} className="bg-neutral-900 border border-purple-900/50 p-6 rounded-2xl">
              <h3 className="text-xl font-bold mb-4 text-purple-400 flex items-center gap-2"><Ticket /> Створити Промокод</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                      <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">Код (латиницею):</label>
                      <input type="text" placeholder="Наприклад: NEW_YEAR" value={promoForm.code} onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })} className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white uppercase" required />
                  </div>
                  <div>
                      <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">Нагорода (Монети):</label>
                      <input type="number" value={promoForm.reward} onChange={(e) => setPromoForm({ ...promoForm, reward: e.target.value })} className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white" min="1" required />
                  </div>
                  <div>
                      <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">Всього використань сервером (0 = Безлім):</label>
                      <input type="number" value={promoForm.maxGlobalUses} onChange={(e) => setPromoForm({ ...promoForm, maxGlobalUses: e.target.value })} className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white" min="0" required />
                  </div>
                  <div>
                      <label className="text-xs font-bold text-neutral-400 uppercase mb-1 block">Використань на 1 гравця (0 = Безлім):</label>
                      <input type="number" value={promoForm.maxUserUses} onChange={(e) => setPromoForm({ ...promoForm, maxUserUses: e.target.value })} className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white" min="0" required />
                  </div>
              </div>
              <button type="submit" className="w-full bg-purple-600 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-purple-500 transition-colors">Створити Код</button>
            </form>

            <div className="space-y-3">
               {allPromos.map(p => (
                   <div key={p.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                       <div>
                           <div className="text-lg font-black text-white font-mono tracking-widest">{p.code}</div>
                           <div className="text-sm text-yellow-500 font-bold">Нагорода: {p.reward} <Coins size={14} className="inline"/></div>
                       </div>
                       <div className="flex items-center gap-6">
                           <div className="text-right text-xs text-neutral-400">
                               <div>Сервер: <span className="text-white">{p.currentGlobalUses} / {p.maxGlobalUses === 0 ? "∞" : p.maxGlobalUses}</span></div>
                               <div>На 1 гравця: <span className="text-white">{p.maxUserUses === 0 ? "∞" : p.maxUserUses}</span></div>
                           </div>
                           <button onClick={() => deletePromo(p.code)} className="p-3 bg-red-900/40 text-red-400 hover:bg-red-900 rounded-lg transition-colors">
                               <Trash2 size={20} />
                           </button>
                       </div>
                   </div>
               ))}
               {allPromos.length === 0 && <p className="text-center text-neutral-500 py-6">Створених промокодів немає.</p>}
            </div>
         </div>
      )}

      {/* --- Вкладка: ЛОГИ (Супер Адмін) --- */}
      {activeTab === "logs" && currentProfile.isAdmin && (
         <div className="space-y-4 animate-in fade-in">
             <div className="flex justify-between items-center mb-4">
                 <h3 className="text-xl font-bold text-red-400 flex items-center gap-2"><ScrollText /> Системні Логи</h3>
                 {adminLogs.length > 0 && (
                     <button onClick={clearAdminLogs} className="bg-red-900 hover:bg-red-800 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors flex items-center gap-2">
                         <Trash2 size={16} /> Очистити Логи
                     </button>
                 )}
             </div>

             {adminLogs.length === 0 ? (
                 <div className="text-center py-10 bg-neutral-900 rounded-2xl border border-neutral-800">
                     <Bug size={40} className="mx-auto mb-3 text-neutral-700" />
                     <p className="text-neutral-500">Системних записів немає.</p>
                 </div>
             ) : (
                 <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
                     {adminLogs.map((log) => (
                         <div key={log.id} className="p-4 border-b border-neutral-800 last:border-0 hover:bg-neutral-950 transition-colors flex flex-col sm:flex-row gap-2 sm:gap-6 sm:items-center">
                             <div className="w-32 shrink-0">
                                 <div className="text-xs text-neutral-500">{formatDate(log.timestamp)}</div>
                                 <div className={`text-xs font-bold uppercase tracking-wider mt-0.5 ${log.type === 'Помилка' ? 'text-red-500' : 'text-purple-400'}`}>
                                     {log.type}
                                 </div>
                             </div>
                             <div className="flex-1">
                                 <div className="text-white text-sm break-words">{log.details}</div>
                                 <div className="text-[10px] text-neutral-500 mt-1 flex items-center gap-1">
                                    <User size={10} /> {log.userNickname} <span className="text-neutral-700">({log.userUid})</span>
                                 </div>
                             </div>
                         </div>
                     ))}
                 </div>
             )}
         </div>
      )}
      {/* --- Вкладка: ПАКИ --- */}
      {activeTab === "packs" && (
        <div className="space-y-6 animate-in fade-in">
          <form onSubmit={savePack} className="bg-neutral-900 border border-purple-900/50 p-6 rounded-2xl">
            <h3 className="text-xl font-bold mb-4 text-purple-400">{editingPack ? `Редагування Паку` : "Створити Пак"}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <input type="text" placeholder="Назва Паку" value={packForm.name} onChange={(e) => setPackForm({ ...packForm, name: e.target.value })} className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white" required />
              <input type="text" placeholder="Категорія (напр. Базові)" value={packForm.category} onChange={(e) => setPackForm({ ...packForm, category: e.target.value })} className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white" required />
              <input type="number" placeholder="Вартість" value={packForm.cost} onChange={(e) => setPackForm({ ...packForm, cost: e.target.value })} className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white" min="0" required />
              <input type="text" placeholder="URL Картинки" value={packForm.image} onChange={(e) => setPackForm({ ...packForm, image: e.target.value })} className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white" required />
              
              <div className="sm:col-span-2 mt-2 p-4 border border-neutral-800 rounded-xl bg-neutral-950/50">
                <h4 className="text-neutral-400 text-sm font-bold mb-3">Кастомні шанси випадіння (залиште пустим, щоб використовувати глобальні):</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {rarities.map(r => (
                    <div key={r.name} className="flex flex-col">
                      <label className={`text-xs font-bold mb-1 ${COLOR_PRESETS[r.color]?.text}`}>{r.name} (Глоб: {r.weight})</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Замовчування"
                        value={packForm.customWeights?.[r.name] || ""}
                        onChange={(e) => setPackForm({...packForm, customWeights: {...(packForm.customWeights || {}), [r.name]: e.target.value}})}
                        className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                  <label className="flex items-center gap-2 text-white font-bold cursor-pointer bg-neutral-950 p-4 rounded-xl border border-neutral-800">
                    <input type="checkbox" checked={packForm.isHidden || false} onChange={e => setPackForm({...packForm, isHidden: e.target.checked})} className="w-5 h-5 accent-purple-600" />
                    Приховати пак від гравців (не видаляти)
                  </label>
                  <label className="flex items-center gap-2 text-fuchsia-400 font-bold cursor-pointer bg-fuchsia-950/20 p-4 rounded-xl border border-fuchsia-900/50">
                    <input type="checkbox" checked={packForm.isPremiumOnly || false} onChange={e => setPackForm({...packForm, isPremiumOnly: e.target.checked})} className="w-5 h-5 accent-fuchsia-600" />
                    <Gem size={18}/> Тільки для Преміум гравців
                  </label>
              </div>

            </div>
            
            <div className="flex gap-3">
              <button type="submit" className="flex-1 bg-purple-600 text-white font-bold py-3 rounded-xl">Зберегти Пак</button>
              {editingPack && (
                <button type="button" onClick={() => { setEditingPack(null); setPackForm({ id: "", name: "", category: "Базові", cost: 50, image: "", customWeights: {}, isHidden: false, isPremiumOnly: false }); }} className="bg-neutral-800 text-white font-bold py-3 px-6 rounded-xl">Скасувати</button>
              )}
            </div>
          </form>

          {/* Фільтр та список Паків */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
            <input type="text" placeholder="Пошук паку..." value={packSearchTerm} onChange={(e) => setPackSearchTerm(e.target.value)} className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-10 pr-4 py-3 text-white focus:border-purple-500 outline-none" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {filteredPacks.map((pack) => (
              <div key={pack.id} className={`bg-neutral-900 rounded-xl p-4 border ${pack.isPremiumOnly ? 'border-fuchsia-900' : 'border-neutral-800'} relative group`}>
                {pack.isHidden && <span className="text-[10px] bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded border border-neutral-600 uppercase font-black tracking-widest absolute top-2 right-2 z-10">Приховано</span>}
                {pack.isPremiumOnly && <span className="text-[10px] bg-fuchsia-900 text-fuchsia-100 px-2 py-0.5 rounded border border-fuchsia-500 uppercase font-black tracking-widest absolute top-2 left-2 z-10 flex items-center gap-1"><Gem size={10}/> Преміум</span>}
                <img src={pack.image} alt={pack.name} className={`w-24 h-24 object-cover rounded-lg mx-auto mb-3 ${pack.isHidden ? 'opacity-50 grayscale' : ''}`} />
                <div className={`text-[10px] ${pack.isPremiumOnly ? 'text-fuchsia-400' : 'text-purple-400'} font-bold uppercase tracking-widest text-center mb-1`}>{pack.category || "Базові"}</div>
                <h4 className="text-center font-bold text-white mb-1">{pack.name}</h4>
                <div className="text-center text-yellow-500 font-bold text-sm mb-4">{pack.cost} Монет</div>
                <div className="flex gap-2">
                  <button onClick={() => { setEditingPack(pack); setPackForm({...pack, customWeights: pack.customWeights || {}, category: pack.category || "Базові"}); }} className="flex-1 py-2 bg-blue-600/20 text-blue-400 rounded-lg text-sm font-bold">
                    Редагувати
                  </button>
                  <button onClick={() => deletePack(pack.id)} className="flex-1 py-2 bg-red-600/20 text-red-400 rounded-lg text-sm font-bold">
                    Видалити
                  </button>
                </div>
              </div>
            ))}
            {filteredPacks.length === 0 && <p className="col-span-full text-center text-neutral-500">Паків не знайдено.</p>}
          </div>
        </div>
      )}

      {/* --- Вкладка: КАРТКИ --- */}
      {activeTab === "cards" && (
        <div className="space-y-6 animate-in fade-in">
           <form onSubmit={saveCard} className="bg-neutral-900 border border-purple-900/50 p-6 rounded-2xl">
              <h3 className="text-xl font-bold mb-4 text-purple-400">{editingCard ? `Редагування Картки` : "Додати Картку"}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <input type="text" placeholder="Назва картки" value={cardForm.name} onChange={(e) => setCardForm({ ...cardForm, name: e.target.value })} className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white" required />
                  <select value={cardForm.packId} onChange={(e) => setCardForm({ ...cardForm, packId: e.target.value })} className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white" required>
                    <option value="" disabled>Оберіть пак...</option>
                    {packsCatalog.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <select value={cardForm.rarity} onChange={(e) => setCardForm({ ...cardForm, rarity: e.target.value })} className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white">
                    {rarities.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
                  </select>
                  <input type="number" placeholder="Ліміт (0=Безлім)" value={cardForm.maxSupply} onChange={(e) => setCardForm({ ...cardForm, maxSupply: e.target.value })} className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white" />
                  
                  <input type="number" step="0.01" placeholder="Індивід. Шанс (Вага)" value={cardForm.weight} onChange={(e) => setCardForm({ ...cardForm, weight: e.target.value })} className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white" title="Якщо заповнено - ігнорує глобальний шанс рідкості" />
                  <input type="number" placeholder="Ціна продажу (замовч. 15)" value={cardForm.sellPrice} onChange={(e) => setCardForm({ ...cardForm, sellPrice: e.target.value })} className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white text-green-400" title="Скільки монет отримає гравець за дублікат" />
                  
                  <select value={cardForm.effect} onChange={(e) => setCardForm({ ...cardForm, effect: e.target.value })} className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white md:col-span-2 text-purple-400 font-bold">
                    {EFFECT_OPTIONS.map(opt => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
                  </select>

                  <input type="text" placeholder="URL Картинки" value={cardForm.image} onChange={(e) => setCardForm({ ...cardForm, image: e.target.value })} className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white md:col-span-4" required />
                  
                  <div className="md:col-span-4 flex flex-col sm:flex-row gap-4 bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3">
                      <input type="text" placeholder="URL Звуку (mp3/wav) необов'язково" value={cardForm.soundUrl || ""} onChange={(e) => setCardForm({ ...cardForm, soundUrl: e.target.value })} className="flex-1 bg-transparent text-white outline-none" />
                      {cardForm.soundUrl && (
                          <div className="w-full sm:w-40 flex flex-col justify-center sm:border-l sm:border-neutral-800 sm:pl-4 pt-2 sm:pt-0 border-t border-neutral-800 sm:border-t-0 mt-2 sm:mt-0">
                              <label className="text-[10px] font-bold text-neutral-400 uppercase mb-1">Гучність: {cardForm.soundVolume !== undefined ? cardForm.soundVolume : 0.5}</label>
                              <input type="range" min="0.1" max="1" step="0.1" value={cardForm.soundVolume !== undefined ? cardForm.soundVolume : 0.5} onChange={(e) => setCardForm({ ...cardForm, soundVolume: parseFloat(e.target.value) })} className="accent-purple-500 w-full" />
                          </div>
                      )}
                  </div>
              </div>
              
              <div className="flex gap-3">
                <button type="submit" disabled={!cardForm.packId} className="flex-1 bg-purple-600 disabled:bg-neutral-700 text-white font-bold py-3 rounded-xl">Зберегти картку</button>
                {editingCard && (
                  <button type="button" onClick={() => { setEditingCard(null); setCardForm({ id: "", packId: packsCatalog[0]?.id || "", name: "", rarity: rarities[0]?.name || "Звичайна", image: "", maxSupply: "", weight: "", sellPrice: "", effect: "", soundUrl: "", soundVolume: 0.5 }); }} className="bg-neutral-800 text-white font-bold py-3 px-6 rounded-xl">Скасувати</button>
                )}
              </div>
           </form>

           {/* Фільтри Карток */}
           <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
                <input type="text" placeholder="Пошук картки..." value={cardSearchTerm} onChange={(e) => setCardSearchTerm(e.target.value)} className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-10 pr-4 py-3 text-white focus:border-purple-500 outline-none" />
              </div>
              <div className="relative w-full sm:w-64">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
                <select value={cardPackFilter} onChange={(e) => setCardPackFilter(e.target.value)} className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-10 pr-4 py-3 text-white focus:border-purple-500 outline-none appearance-none">
                    <option value="all">Усі паки</option>
                    {packsCatalog.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
           </div>

           {/* Список Карток */}
           <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {filteredCards.map((card) => {
              const packInfo = packsCatalog.find((p) => p.id === card.packId);
              const style = getCardStyle(card.rarity, rarities);
              const effectClass = card.effect ? `effect-${card.effect}` : '';
              
              return (
                <div key={card.id} className={`bg-neutral-900 rounded-xl overflow-hidden border-2 ${style.border} group relative flex flex-col`}>
                  <div className={`aspect-[2/3] w-full relative shrink-0 ${effectClass}`}>
                    <img src={card.image} alt={card.name} className="w-full h-full object-cover" />
                    {card.maxSupply > 0 && (
                      <div className="absolute top-1 left-1 bg-black/80 text-white text-[8px] px-1.5 py-0.5 rounded border border-neutral-700 z-10">
                        {card.maxSupply - (card.pulledCount || 0)}/{card.maxSupply}
                      </div>
                    )}
                    {card.soundUrl && (
                        <button
                          onClick={(e) => { e.stopPropagation(); playCardSound(card.soundUrl, card.soundVolume); }}
                          className="absolute bottom-1 right-1 bg-black/80 text-white p-1 rounded-full hover:text-blue-400 z-30 transition-colors shadow-lg"
                          title="Відтворити звук"
                        >
                          <Volume2 size={12} />
                        </button>
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-20">
                      <button onClick={() => { setEditingCard(card); setCardForm({ ...card, maxSupply: card.maxSupply || "", weight: card.weight || "", sellPrice: card.sellPrice || "", effect: card.effect || "", soundUrl: card.soundUrl || "", soundVolume: card.soundVolume !== undefined ? card.soundVolume : 0.5 }); }} className="p-2 bg-blue-600 rounded-lg text-white shadow-lg transform hover:scale-110 transition-transform">
                        <Edit2 size={18} />
                      </button>
                      <button onClick={() => deleteCard(card.id)} className="p-2 bg-red-600 rounded-lg text-white shadow-lg transform hover:scale-110 transition-transform">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="p-2 text-center flex flex-col items-center flex-1 justify-between">
                    <div className="w-full">
                        <div className={`text-[10px] font-black uppercase ${style.text}`}>{card.rarity}</div>
                        <div className="font-bold text-xs truncate mb-1 text-white w-full">{card.name}</div>
                        <div className="text-[9px] text-neutral-500 truncate bg-neutral-950 rounded py-0.5 px-1 inline-block w-full">
                        {packInfo ? packInfo.name : "Без паку!"}
                        </div>
                    </div>
                    <div className="w-full flex flex-wrap justify-center gap-1 mt-1">
                        {card.weight && (
                            <div className="text-[9px] text-yellow-500/80 font-bold bg-yellow-500/10 px-1.5 py-0.5 rounded border border-yellow-500/20" title="Індивідуальна вага">
                                ⚖️ {card.weight}
                            </div>
                        )}
                        <div className="text-[9px] text-green-400 font-bold bg-green-500/10 px-1.5 py-0.5 rounded border border-green-500/20" title="Ціна продажу дубліката">
                            +{card.sellPrice || SELL_PRICE} <Coins size={8} className="inline" />
                        </div>
                        {card.effect && (
                            <div className="text-[9px] text-purple-400 font-bold bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20 w-full mt-0.5 uppercase tracking-widest">
                                {card.effect}
                            </div>
                        )}
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredCards.length === 0 && <p className="col-span-full text-center text-neutral-500 py-10">Карток не знайдено.</p>}
          </div>
        </div>
      )}

    </div>
  );
}

// --- МОДАЛЬНЕ ВІКНО КАРТКИ З 3D ПАРАЛАКСОМ ---
function CardModal({ viewingCard, setViewingCard, rarities }) {
  const [tiltStyle, setTiltStyle] = useState({});
  const [isHovering, setIsHovering] = useState(false);

  if (!viewingCard) return null;
  const { card } = viewingCard;
  const style = getCardStyle(card.rarity, rarities);
  const effectClass = card.effect ? `effect-${card.effect}` : '';

  const handleMouseMove = (e) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    const rotateX = ((y - centerY) / centerY) * -15; 
    const rotateY = ((x - centerX) / centerX) * 15;

    setTiltStyle({
      transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.05, 1.05, 1.05)`,
      transition: 'transform 0.1s ease-out'
    });
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    setTiltStyle({
      transform: `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`,
      transition: 'transform 0.5s ease-out'
    });
  };

  const handleMouseEnter = () => {
    setIsHovering(true);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300 perspective-1000" onClick={() => setViewingCard(null)}>
      <div className="relative flex flex-col items-center w-full max-w-sm animate-in zoom-in-95 slide-in-from-bottom-10 duration-500" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setViewingCard(null)} className="absolute -top-12 right-0 text-neutral-400 hover:text-white font-bold tracking-widest uppercase transition-colors">Закрити ✕</button>
        
        <div 
          className="preserve-3d w-full"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onMouseEnter={handleMouseEnter}
          onTouchMove={(e) => handleMouseMove(e.touches[0])}
          onTouchEnd={handleMouseLeave}
        >
            <div 
                className={`w-full aspect-[2/3] rounded-3xl border-4 overflow-hidden ${style.border} ${effectClass} relative group shadow-[0_20px_70px_rgba(0,0,0,0.8)]`}
                style={tiltStyle}
            >
              <img src={card.image} alt={card.name} className="w-full h-full object-cover" />
              
              {/* Відблиск світла при нахилі */}
              {isHovering && (
                  <div className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-30 bg-gradient-to-tr from-white/0 via-white to-white/0"></div>
              )}
            </div>
        </div>
        
        <div className="mt-8 flex flex-col items-center text-center w-full">
          <div className={`text-sm font-black uppercase tracking-widest mb-2 ${style.text} flex items-center gap-1.5`}>
             <Sparkles size={16} /> {card.rarity}
          </div>
          <h3 className="font-black text-4xl text-white mb-2 drop-shadow-xl">{card.name}</h3>
        </div>
      </div>
    </div>
  );
}