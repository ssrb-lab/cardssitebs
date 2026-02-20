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
  Ticket
} from "lucide-react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithCustomToken,
  signInAnonymously,
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
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
    cost: 50,
    image: "https://placehold.co/400x400/222/aaa?text=Базовий\nПак",
    customWeights: {} 
  },
  {
    id: "p2",
    name: "Елітний Шинобі",
    cost: 100,
    image: "https://placehold.co/400x400/581c87/fff?text=Елітний\nПак",
    customWeights: {}
  },
];

const DEFAULT_CARDS_DB = [
  { id: "c1", packId: "p1", name: "Учень Академії", rarity: "Звичайна", image: "https://placehold.co/400x600/222/aaa?text=Учень\nАкадемії", maxSupply: 0, pulledCount: 0, sellPrice: 15 },
  { id: "c2", packId: "p1", name: "Тренувальний манекен", rarity: "Звичайна", image: "https://placehold.co/400x600/222/aaa?text=Манекен", maxSupply: 0, pulledCount: 0, sellPrice: 15 },
  { id: "c4", packId: "p1", name: "Генін", rarity: "Рідкісна", image: "https://placehold.co/400x600/1e3a8a/ccc?text=Генін", maxSupply: 0, pulledCount: 0, sellPrice: 30 },
  { id: "c6", packId: "p2", name: "Елітний Джонін", rarity: "Епічна", image: "https://placehold.co/400x600/581c87/eee?text=Елітний\nДжонін", maxSupply: 500, pulledCount: 0, sellPrice: 100 },
  { id: "c8", packId: "p2", name: "Легендарний Хокаге", rarity: "Легендарна", image: "https://placehold.co/400x600/854d0e/fff?text=Легендарний\nХокаге", maxSupply: 10, pulledCount: 0, sellPrice: 500 },
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

export default function App() {
  const [user, setUser] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [dbInventory, setDbInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Авторизація
  const [needsRegistration, setNeedsRegistration] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [dbError, setDbError] = useState("");

  // Глобальні налаштування
  const [cardsCatalog, setCardsCatalog] = useState([]);
  const [packsCatalog, setPacksCatalog] = useState([]);
  const [rarities, setRarities] = useState([]);

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

  // --- СИСТЕМА ЗАХИСТУ ВІД ВІЧНОЇ ЗАГРУЗКИ ---
  useEffect(() => {
    let timeout;
    if (loading && user !== undefined && !profile && !needsRegistration) {
      timeout = setTimeout(() => {
        setDbError("Зв'язок з сервером втрачено. Перевірте підключення до інтернету або налаштування Firebase.");
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
        setCardsCatalog(data.cards || []);
        setPacksCatalog(data.packs || DEFAULT_PACKS);
        setRarities(data.rarities || DEFAULT_RARITIES);
      } else {
        setDoc(settingsRef, {
          cards: DEFAULT_CARDS_DB,
          packs: DEFAULT_PACKS,
          rarities: DEFAULT_RARITIES,
        }).catch((e) => console.error(e));
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
        
        // Автоматичне зняття тимчасового бану, якщо час вийшов
        if (pData.isBanned && pData.banUntil) {
          const now = new Date().getTime();
          const banEnd = new Date(pData.banUntil).getTime();
          if (now > banEnd) {
             updateDoc(profileRef, { isBanned: false, banReason: null, banUntil: null });
             pData.isBanned = false;
          }
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

    return () => {
      unsubSettings();
      unsubProfile();
      unsubInv();
    };
  }, [user]);

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

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const newUid = userCredential.user.uid;

        await setDoc(doc(db, "artifacts", GAME_ID, "public", "data", "profiles", newUid), {
          uid: newUid,
          nickname,
          email,
          coins: 200,
          totalCards: 0,
          createdAt: new Date().toISOString(),
          promoUsed: false,
          isAdmin: false,
          isSuperAdmin: false,
          isBanned: false,
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

  const handleLogout = async () => {
    setLoading(true);
    await signOut(auth);
    setProfile(null);
    setDbInventory([]);
    setCurrentView("shop");
    setAuthMode("login");
  };

  const showToast = (msg, type = "error") => {
    setToastMsg({ text: msg, type });
    setTimeout(() => setToastMsg({ text: "", type: "" }), 3000);
  };

  // --- ЛОГІКА ГРИ (ВІДКРИТТЯ ПАКУ) ---
  const openPack = async (packId, cost, amountToOpen = 1) => {
    if (!profile || openingPackId || isRouletteSpinning) return;
    const totalCost = cost * amountToOpen;

    if (profile.coins < totalCost) {
      showToast("Недостатньо монет, Мій лорд!");
      return;
    }

    setOpeningPackId(packId);
    setPulledCards([]);

    const selectedPackDef = packsCatalog.find(p => p.id === packId);

    setTimeout(async () => {
      let tempCatalog = JSON.parse(JSON.stringify(cardsCatalog));
      let results = [];
      let countsMap = {};
      const availablePackCards = tempCatalog.filter((c) => c.packId === packId);

      for (let i = 0; i < amountToOpen; i++) {
        const availableNow = tempCatalog.filter(
          (c) => c.packId === packId && (!c.maxSupply || (c.pulledCount || 0) < c.maxSupply)
        );

        if (availableNow.length === 0) {
          if (i === 0) {
            setOpeningPackId(null);
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

        if (newCard.maxSupply > 0) {
          let catalogRef = tempCatalog.find(c => c.id === newCard.id);
          if (catalogRef) catalogRef.pulledCount = (catalogRef.pulledCount || 0) + 1;
        }

        results.push(newCard);
        countsMap[newCard.id] = (countsMap[newCard.id] || 0) + 1;
      }

      if (results.length === 0) {
        setOpeningPackId(null);
        return;
      }

      try {
        const batch = writeBatch(db);

        const profileRef = doc(db, "artifacts", GAME_ID, "public", "data", "profiles", user.uid);
        batch.update(profileRef, { 
          coins: increment(-totalCost),
          totalCards: increment(results.length)
        });

        const settingsRef = doc(db, "artifacts", GAME_ID, "public", "data", "gameSettings", "main");
        batch.update(settingsRef, { cards: tempCatalog });

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
            }, 5000); 
        } else {
            setOpeningPackId(null);
            setPulledCards(results);
        }

      } catch (err) {
        console.error("Помилка під час відкриття:", err);
        showToast("Виникла помилка під час збереження карток.");
        setOpeningPackId(null);
      }
    }, amountToOpen === 1 ? 100 : 1500);
  };

  const sellDuplicate = async (cardId) => {
    const existing = dbInventory.find((i) => i.id === cardId);
    if (!existing || existing.amount <= 1) return;
    
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
    }
  };

  const sellAllDuplicates = async (cardId, currentAmount) => {
    if (currentAmount <= 1) return;
    
    const cardDef = cardsCatalog.find(c => c.id === cardId);
    const cardPrice = cardDef?.sellPrice ? Number(cardDef.sellPrice) : SELL_PRICE;
    
    const sellCount = currentAmount - 1;
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
    }
  };

  const sellEveryDuplicate = async () => {
    const duplicates = dbInventory.filter(item => item.amount > 1);
    if (duplicates.length === 0) {
      return showToast("У вас немає дублікатів для продажу!", "error");
    }

    let totalEarned = 0;
    let totalCardsRemoved = 0;
    const batch = writeBatch(db);

    duplicates.forEach(item => {
      const cardDef = cardsCatalog.find(c => c.id === item.id);
      const cardPrice = cardDef?.sellPrice ? Number(cardDef.sellPrice) : SELL_PRICE;
      const sellCount = item.amount - 1;

      totalEarned += sellCount * cardPrice;
      totalCardsRemoved += sellCount;

      const invDocRef = doc(db, "artifacts", GAME_ID, "users", user.uid, "inventory", item.id);
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
    }
  };

  const fullInventory = dbInventory
    .map((item) => {
      const cardData = cardsCatalog.find((c) => c.id === item.id);
      return cardData ? { card: cardData, amount: item.amount } : null;
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
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans pb-24">
      <header className="bg-neutral-900 border-b border-neutral-800 sticky top-0 z-50 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex justify-between items-center">
          <button
            onClick={() => setCurrentView("profile")}
            className="flex items-center gap-3 hover:bg-neutral-800 p-1.5 pr-3 rounded-full transition-colors border border-transparent hover:border-neutral-700"
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold border shadow-sm ${
                profile?.isSuperAdmin ? "bg-red-900 border-red-500 text-red-200" :
                profile?.isAdmin ? "bg-purple-900 border-purple-500 text-purple-200" : "bg-neutral-800 border-neutral-700 text-yellow-500"
              }`}
            >
              {profile?.isSuperAdmin ? <Crown size={20} /> : profile?.isAdmin ? <Shield size={20} /> : profile?.nickname?.charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:block text-left">
              <div className="font-bold text-sm leading-tight text-white">{profile?.nickname}</div>
              <div className="text-xs text-neutral-400 leading-tight">Профіль</div>
            </div>
          </button>
          <div className="bg-neutral-950 px-5 py-2 rounded-xl border border-neutral-800 shadow-inner flex gap-2 items-center">
            <Coins size={20} className="text-yellow-500" />
            <span className="text-yellow-500 font-black text-lg">{profile?.coins}</span>
          </div>
        </div>
      </header>

      {toastMsg.text && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full flex items-center gap-2 shadow-lg z-50 animate-bounce text-white font-medium ${
            toastMsg.type === "success" ? "bg-green-600/90" : "bg-red-900/90"
          }`}
        >
          {toastMsg.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          {toastMsg.text}
        </div>
      )}

      <main className="max-w-5xl mx-auto p-4 mt-4 animate-in fade-in duration-500">
        {currentView === "shop" && (
          <ShopView
            packs={packsCatalog}
            cardsCatalog={cardsCatalog}
            rarities={rarities}
            openPack={openPack}
            openingPackId={openingPackId}
            isRouletteSpinning={isRouletteSpinning}
            rouletteItems={rouletteItems}
            pulledCards={pulledCards}
            setPulledCards={setPulledCards}
            selectedPackId={selectedPackId}
            setSelectedPackId={setSelectedPackId}
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
          />
        )}
        {currentView === "profile" && (
          <ProfileView
            profile={profile}
            user={user}
            db={db}
            appId={GAME_ID}
            handleLogout={handleLogout}
            showToast={showToast}
            inventoryCount={fullInventory.length}
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
            db={db}
            appId={GAME_ID}
            targetUid={viewingPlayerProfile}
            goBack={() => setCurrentView("rating")}
            cardsCatalog={cardsCatalog}
            rarities={rarities}
            setViewingCard={setViewingCard}
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
          />
        )}
      </main>

      {viewingCard && (
        <CardModal viewingCard={viewingCard} setViewingCard={setViewingCard} rarities={rarities} />
      )}

      <nav className="fixed bottom-0 w-full bg-neutral-900 border-t border-neutral-800 px-4 py-2 z-40 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        <div className="max-w-md mx-auto flex justify-around relative">
          <NavButton icon={<PackageOpen size={24} />} label="Магазин" isActive={currentView === "shop"} onClick={() => { setCurrentView("shop"); setPulledCards([]); setSelectedPackId(null); }} />
          <NavButton icon={<LayoutGrid size={24} />} label="Інвентар" isActive={currentView === "inventory"} onClick={() => setCurrentView("inventory")} />
          <NavButton icon={<Trophy size={24} />} label="Рейтинг" isActive={currentView === "rating" || currentView === "publicProfile"} onClick={() => setCurrentView("rating")} />
          <NavButton icon={<User size={24} />} label="Профіль" isActive={currentView === "profile"} onClick={() => setCurrentView("profile")} />
          
          {profile?.isAdmin && (
            <button
              onClick={() => setCurrentView("admin")}
              className={`flex flex-col items-center p-2 rounded-lg w-20 transition-colors ${
                currentView === "admin" ? "text-purple-500" : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <Shield size={24} />
              <span className="text-[10px] mt-1 font-bold uppercase tracking-wider">Адмінка</span>
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

// --- МАГАЗИН ---
function ShopView({ packs, cardsCatalog, rarities, openPack, openingPackId, isRouletteSpinning, rouletteItems, pulledCards, setPulledCards, selectedPackId, setSelectedPackId, setViewingCard }) {
  
  const [roulettePos, setRoulettePos] = useState(0);
  const [rouletteOffset, setRouletteOffset] = useState(0);

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
                  return (
                      <div key={i} className={`w-40 h-56 rounded-2xl border-4 shrink-0 bg-neutral-950 relative overflow-hidden shadow-xl ${style.border}`}>
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
    return (
      <div className="flex flex-col items-center min-h-[65vh] animate-in zoom-in-95 duration-700 w-full pb-10">
        <h2 className="text-3xl sm:text-4xl font-black mb-8 text-white uppercase tracking-widest text-center drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">
          Ви отримали {pulledCards.length > 1 ? `(${pulledCards.length} шт)` : "!"}
        </h2>
        
        <div className="flex flex-wrap justify-center gap-6 mb-10 w-full">
          {pulledCards.map((card, index) => {
            const style = getCardStyle(card.rarity, rarities);
            return (
              <div key={index} className="flex flex-col items-center animate-in zoom-in slide-in-from-bottom-6" style={{ animationDelay: `${index * 150}ms`, fillMode: 'both' }}>
                <div className={`w-40 sm:w-56 aspect-[2/3] rounded-2xl border-4 overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.6)] transform transition-all hover:scale-105 hover:rotate-2 ${style.border} bg-neutral-900 relative mb-4`}>
                  <img src={card.image} alt={card.name} className="w-full h-full object-cover" />
                  {card.maxSupply > 0 && (
                    <div className="absolute top-2 right-2 bg-black/90 text-white text-[10px] px-2 py-1 rounded-md border border-neutral-700 font-black">
                      Лімітка
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <div className={`text-xs font-black uppercase tracking-widest flex justify-center items-center gap-1 ${style.text}`}>
                    <Sparkles size={14} /> {card.rarity}
                  </div>
                  <h3 className="font-bold text-white max-w-[150px] truncate">{card.name}</h3>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={() => setPulledCards([])}
          className="px-10 py-4 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-xl transition-all hover:-translate-y-1 shadow-lg border border-neutral-700"
        >
          Забрати картки
        </button>
      </div>
    );
  }

  const selectedPack = packs.find((p) => p.id === selectedPackId);

  if (selectedPack) {
    const packCards = cardsCatalog.filter((c) => c.packId === selectedPackId);

    return (
      <div className="pb-10 animate-in fade-in slide-in-from-right-8 duration-500">
        <button onClick={() => setSelectedPackId(null)} className="mb-6 flex items-center gap-2 text-neutral-400 hover:text-white transition-colors font-bold px-4 py-2 bg-neutral-900 rounded-lg hover:bg-neutral-800 w-fit border border-neutral-800">
          <ArrowLeft size={20} /> Назад
        </button>

        <div className="flex flex-col items-center mb-12 bg-neutral-900/50 p-6 rounded-3xl border border-neutral-800 max-w-2xl mx-auto">
          <h2 className="text-3xl font-black mb-6 text-white text-center">{selectedPack.name}</h2>
          
          <div className="relative w-48 h-48 mb-8 flex justify-center items-center perspective-1000">
            {openingPackId === selectedPack.id ? (
              <div className="w-full h-full bg-gradient-to-br from-indigo-900 to-purple-900 rounded-2xl border-4 border-indigo-500 shadow-[0_0_40px_rgba(99,102,241,0.6)] animate-pulse flex items-center justify-center">
                <Loader2 className="animate-spin text-indigo-300 w-12 h-12" />
              </div>
            ) : (
              <div className="w-full h-full bg-neutral-800 rounded-2xl border-4 border-neutral-700 shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden">
                <img src={selectedPack.image} alt={selectedPack.name} className="w-full h-full object-cover" />
              </div>
            )}
          </div>

          <div className="flex flex-wrap justify-center gap-3 w-full">
            <OpenButton amount={1} cost={selectedPack.cost} onClick={() => openPack(selectedPack.id, selectedPack.cost, 1)} opening={openingPackId === selectedPack.id} />
            <OpenButton amount={5} cost={selectedPack.cost} onClick={() => openPack(selectedPack.id, selectedPack.cost, 5)} opening={openingPackId === selectedPack.id} color="bg-orange-500 hover:bg-orange-400 text-orange-950" />
            <OpenButton amount={10} cost={selectedPack.cost} onClick={() => openPack(selectedPack.id, selectedPack.cost, 10)} opening={openingPackId === selectedPack.id} color="bg-red-500 hover:bg-red-400 text-red-950" />
          </div>
        </div>

        <div className="border-t border-neutral-800 pt-8 w-full">
          <h3 className="text-xl font-black mb-6 text-white text-center uppercase tracking-wider">
            Можливі картки в цьому паку
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
            {packCards.map((card) => {
              const style = getCardStyle(card.rarity, rarities);
              const isSoldOut = card.maxSupply > 0 && (card.pulledCount || 0) >= card.maxSupply;
              return (
                <div key={card.id} className={`flex flex-col items-center group ${isSoldOut ? "opacity-50 grayscale" : "cursor-pointer"}`} onClick={() => !isSoldOut && setViewingCard({ card })}>
                  <div className={`relative w-full aspect-[2/3] rounded-xl border-2 overflow-hidden bg-neutral-900 mb-2 transition-all duration-300 ${!isSoldOut && "group-hover:-translate-y-2 group-hover:shadow-[0_10px_20px_rgba(0,0,0,0.5)]"} ${style.border}`}>
                    <img src={card.image} alt={card.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                    {card.maxSupply > 0 && (
                      <div className="absolute top-1 right-1 bg-black/90 text-white text-[8px] px-1.5 py-0.5 rounded border border-neutral-700 font-bold z-10">
                        {isSoldOut ? "РОЗПРОДАНО" : `${card.maxSupply - (card.pulledCount || 0)}/${card.maxSupply}`}
                      </div>
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

  return (
    <div className="pb-10 animate-in fade-in zoom-in-95 duration-500">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-black mb-2 text-white uppercase tracking-widest">Магазин Паків</h2>
        <p className="text-neutral-400 text-sm">Оберіть пак, Мій лорд, і випробуйте удачу!</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        {packs.map((pack) => (
          <button key={pack.id} onClick={() => setSelectedPackId(pack.id)} className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 flex flex-col items-center justify-between group hover:border-neutral-600 transition-colors shadow-lg text-left w-full cursor-pointer hover:-translate-y-1 transform duration-300">
            <h3 className="text-xl font-bold text-white mb-2 text-center w-full">{pack.name}</h3>
            
            <div className="flex items-center justify-center gap-1.5 text-yellow-500 font-bold mb-4 bg-yellow-500/10 px-4 py-1.5 rounded-full border border-yellow-500/20 shadow-inner">
              {pack.cost} <Coins size={16} />
            </div>

            <div className="relative w-40 h-40 mb-6 flex justify-center items-center perspective-1000">
              <div className="w-full h-full bg-neutral-800 rounded-2xl border-4 border-neutral-700 shadow-xl overflow-hidden group-hover:shadow-[0_0_30px_rgba(255,255,255,0.1)] transition-all duration-300">
                <img src={pack.image} alt={pack.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity group-hover:scale-105 duration-500" />
              </div>
            </div>
            <div className="w-full py-3 rounded-xl font-bold text-neutral-400 group-hover:text-white bg-neutral-950 border border-neutral-800 group-hover:border-neutral-700 flex items-center justify-center gap-2 transition-all">
              Детальніше
            </div>
          </button>
        ))}
        {packs.length === 0 && <div className="col-span-full text-center text-neutral-500 py-10">Паки відсутні.</div>}
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

// --- ІНВЕНТАР ---
function InventoryView({ inventory, rarities, sellDuplicate, sellAllDuplicates, sellEveryDuplicate, sellPrice, catalogTotal, setViewingCard }) {
  const [sortBy, setSortBy] = useState("rarity");

  const sortedInventory = [...inventory].sort((a, b) => {
    const getWeight = (rName) => rarities.find((x) => x.name === rName)?.weight || 100;
    if (sortBy === "rarity") return getWeight(a.card.rarity) - getWeight(b.card.rarity);
    if (sortBy === "amount") return b.amount - a.amount;
    if (sortBy === "name") return a.card.name.localeCompare(b.card.name);
    return 0;
  });

  const duplicatesEarnedCoins = inventory.reduce((sum, item) => {
    if (item.amount > 1) {
        const cardPrice = item.card.sellPrice ? Number(item.card.sellPrice) : sellPrice;
        return sum + (cardPrice * (item.amount - 1));
    }
    return sum;
  }, 0);

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4 bg-neutral-900/80 p-5 rounded-2xl border border-neutral-800 shadow-lg">
        <h2 className="text-2xl font-black flex items-center gap-3 text-white uppercase tracking-wider">
          <LayoutGrid className="text-yellow-500 w-8 h-8" /> Моя Колекція <span className="text-neutral-500 text-lg">({inventory.length}/{catalogTotal})</span>
        </h2>
        
        <div className="flex flex-wrap justify-center sm:justify-end items-center gap-3 w-full sm:w-auto">
          {duplicatesEarnedCoins > 0 && (
            <button 
              onClick={() => {
                  if (confirm(`Продати всі дублікати та отримати ${duplicatesEarnedCoins} монет?`)) {
                      sellEveryDuplicate();
                  }
              }} 
              className="bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 text-white font-bold py-3 px-5 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center gap-2 whitespace-nowrap transition-transform transform hover:scale-105"
              title="Залишити по 1 екземпляру кожної карти"
            >
              <Zap size={18} /> Продати дублікати (+{duplicatesEarnedCoins} <Coins size={14}/>)
            </button>
          )}

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-neutral-950 border border-neutral-700 text-sm font-medium rounded-xl px-4 py-3 w-full sm:w-auto focus:outline-none text-white cursor-pointer hover:bg-neutral-800 h-full"
          >
            <option value="rarity">Сортувати за Рідкістю</option>
            <option value="amount">Сортувати за Дублікатами</option>
            <option value="name">Сортувати за Алфавітом</option>
          </select>
        </div>
      </div>

      {inventory.length === 0 ? (
        <div className="text-center py-32 text-neutral-500 bg-neutral-900/30 rounded-3xl border-2 border-dashed border-neutral-800">
          <PackageOpen size={80} className="mx-auto mb-6 opacity-20" />
          <p className="text-xl font-medium mb-2 text-neutral-400">Ваш інвентар порожній.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {sortedInventory.map((item, index) => {
            const style = getCardStyle(item.card.rarity, rarities);
            const currentSellPrice = item.card.sellPrice ? Number(item.card.sellPrice) : sellPrice;

            return (
              <div key={item.card.id} className="flex flex-col items-center group cursor-pointer animate-in fade-in zoom-in-95 duration-500" style={{ animationDelay: `${index * 20}ms`, fillMode: "backwards" }} onClick={() => setViewingCard({ card: item.card, amount: item.amount })}>
                <div className={`relative w-full aspect-[2/3] rounded-xl border-2 overflow-hidden bg-neutral-900 mb-3 transition-all duration-300 group-hover:-translate-y-2 group-hover:shadow-[0_15px_30px_rgba(0,0,0,0.6)] ${style.border}`}>
                  {item.amount > 1 && (
                    <div className="absolute top-2 right-2 bg-neutral-950/90 backdrop-blur text-white font-black text-xs px-3 py-1.5 rounded-full z-10 border border-neutral-700 shadow-xl">
                      x{item.amount}
                    </div>
                  )}
                  <img src={item.card.image} alt={item.card.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="w-full flex flex-col items-center text-center px-1">
                  <div className={`text-[10px] font-black uppercase tracking-widest mb-1 ${style.text}`}>{item.card.rarity}</div>
                  <div className="font-bold text-sm leading-tight text-white mb-3 line-clamp-1 w-full group-hover:text-yellow-100 transition-colors" title={item.card.name}>{item.card.name}</div>
                  
                  {item.amount > 1 ? (
                    <div className="w-full flex flex-col gap-1.5">
                      <button onClick={(e) => { e.stopPropagation(); sellDuplicate(item.card.id); }} className="w-full bg-neutral-800 hover:bg-neutral-700 text-xs py-2 rounded-lg text-neutral-200 font-bold transition-all hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]">
                        Продати 1 шт. (+{currentSellPrice} <Coins size={10} className="inline text-yellow-500" />)
                      </button>
                      {item.amount > 2 && (
                        <button onClick={(e) => { e.stopPropagation(); sellAllDuplicates(item.card.id, item.amount); }} className="w-full bg-neutral-800/80 hover:bg-red-900/50 text-[10px] py-1.5 rounded-lg text-neutral-400 font-bold transition-all border border-neutral-700 hover:border-red-900/50">
                          Залишити одну (+{(item.amount - 1) * currentSellPrice} <Coins size={10} className="inline text-yellow-500" />)
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="w-full flex justify-center items-center text-xs py-2.5 text-neutral-600 bg-neutral-950/50 rounded-lg border border-neutral-800 font-medium">
                        Один екземпляр ({currentSellPrice} <Coins size={12} className="inline ml-1 opacity-50" />)
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

// --- РЕЙТИНГ ТА ПОШУК ---
function RatingView({ db, appId, currentUid, setViewingPlayerProfile }) {
  const [allProfiles, setAllProfiles] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAllProfiles = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "artifacts", appId, "public", "data", "profiles"));
        const list = [];
        querySnapshot.forEach((doc) => list.push(doc.data()));
        
        list.sort((a, b) => (b.totalCards || 0) - (a.totalCards || 0));
        setAllProfiles(list);
      } catch (e) {
        console.error("Помилка завантаження бази гравців", e);
      }
      setLoading(false);
    };
    fetchAllProfiles();
  }, [db, appId]);

  const filteredLeaders = searchTerm.trim() === "" 
    ? allProfiles.slice(0, 50)
    : allProfiles.filter(p => p.nickname?.toLowerCase().includes(searchTerm.toLowerCase()));

  if (loading) return <div className="text-center py-20 text-neutral-500"><Loader2 className="animate-spin mx-auto mb-4 w-12 h-12"/> Завантаження Залу Слави...</div>;

  return (
    <div className="max-w-3xl mx-auto pb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center mb-8">
        <Trophy size={48} className="mx-auto text-yellow-500 mb-4 drop-shadow-[0_0_15px_rgba(234,179,8,0.5)]" />
        <h2 className="text-3xl font-black text-white uppercase tracking-widest">Зал Слави</h2>
        <p className="text-neutral-400 text-sm mt-2 mb-6">Знайдіть гравців або змагайтеся за першість</p>
        
        <div className="relative max-w-md mx-auto">
          <input
            type="text"
            placeholder="Пошук гравця за нікнеймом..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-700 rounded-2xl py-3 px-5 text-white focus:outline-none focus:border-yellow-500 transition-colors shadow-inner"
          />
        </div>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-xl">
        {filteredLeaders.map((leader, index) => {
          const realRank = allProfiles.findIndex(p => p.uid === leader.uid) + 1;

          return (
            <div 
              key={leader.uid} 
              onClick={() => setViewingPlayerProfile(leader.uid)}
              className={`flex items-center justify-between p-4 border-b border-neutral-800/50 last:border-0 transition-colors cursor-pointer group ${leader.uid === currentUid ? "bg-yellow-900/10" : "hover:bg-neutral-800/80"} ${leader.isBanned ? "opacity-50" : ""}`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 flex items-center justify-center font-black text-lg rounded-xl border transition-transform group-hover:scale-110 ${
                  realRank === 1 ? "bg-yellow-500 text-yellow-950 border-yellow-400" :
                  realRank === 2 ? "bg-gray-300 text-gray-800 border-gray-100" :
                  realRank === 3 ? "bg-amber-700 text-orange-100 border-amber-600" :
                  "bg-neutral-950 text-neutral-500 border-neutral-800"
                }`}>
                  {realRank}
                </div>
                <div>
                  <div className="font-bold text-white flex items-center gap-2 text-lg">
                    {leader.nickname} 
                    {leader.isSuperAdmin && <Crown size={14} className="text-red-500" title="Супер Адмін" />}
                    {leader.isAdmin && !leader.isSuperAdmin && <Shield size={14} className="text-purple-500" title="Адмін" />}
                    {leader.isBanned && <Ban size={14} className="text-red-600" title="Забанений" />}
                    {leader.uid === currentUid && <span className="text-[10px] bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded-full ml-2">ВИ</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-xs text-neutral-500 font-bold uppercase">Картки</div>
                  <div className="text-xl font-black text-blue-400">{leader.totalCards || 0}</div>
                </div>
                <ArrowLeft size={16} className="text-neutral-600 group-hover:text-yellow-500 transform rotate-180 transition-colors" />
              </div>
            </div>
          );
        })}
        {filteredLeaders.length === 0 && <div className="p-8 text-center text-neutral-500">Гравців не знайдено.</div>}
      </div>
    </div>
  );
}

// --- ПУБЛІЧНИЙ ПРОФІЛЬ ---
function PublicProfileView({ db, appId, targetUid, goBack, cardsCatalog, rarities, setViewingCard }) {
  const [playerInfo, setPlayerInfo] = useState(null);
  const [playerInventory, setPlayerInventory] = useState([]);
  const [loading, setLoading] = useState(true);

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
          const invSnap = await getDocs(collection(db, "artifacts", appId, "users", targetUid, "inventory"));
          const invList = [];
          invSnap.forEach((doc) => invList.push({ id: doc.id, ...doc.data() }));
          
          const fullInv = invList.map(item => {
            const cardData = cardsCatalog.find(c => c.id === item.id);
            return cardData ? { card: cardData, amount: item.amount } : null;
          }).filter(Boolean);

          fullInv.sort((a, b) => {
            const getW = (rName) => rarities.find(x => x.name === rName)?.weight || 100;
            return getW(a.card.rarity) - getW(b.card.rarity);
          });
          
          setPlayerInventory(fullInv);
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

  return (
    <div className="animate-in slide-in-from-right-8 duration-500">
      <button onClick={goBack} className="mb-6 flex items-center gap-2 text-neutral-400 hover:text-white transition-colors font-bold px-4 py-2 bg-neutral-900 rounded-lg hover:bg-neutral-800 w-fit border border-neutral-800">
        <ArrowLeft size={20} /> До Рейтингу
      </button>

      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 text-center relative overflow-hidden mb-8">
        <div className={`absolute top-0 left-0 w-full h-32 bg-gradient-to-b ${playerInfo.isBanned ? "from-red-900/40" : playerInfo.isSuperAdmin ? "from-orange-900/40" : playerInfo.isAdmin ? "from-purple-900/40" : "from-blue-900/20"} to-transparent`}></div>
        <div className={`w-24 h-24 bg-neutral-800 rounded-full flex items-center justify-center font-black text-4xl border-4 shadow-xl mx-auto relative z-10 mb-4 ${playerInfo.isBanned ? "text-red-600 border-red-800" : playerInfo.isSuperAdmin ? "text-red-400 border-red-500" : playerInfo.isAdmin ? "text-purple-400 border-purple-500" : "text-blue-500 border-neutral-700"}`}>
          {playerInfo.isBanned ? <Ban size={48} /> : playerInfo.isSuperAdmin ? <Crown size={48} /> : playerInfo.isAdmin ? <Shield size={48} /> : playerInfo.nickname?.charAt(0).toUpperCase()}
        </div>
        <h2 className="text-3xl font-black text-white mb-1 relative z-10 flex justify-center items-center gap-2">
            {playerInfo.nickname}
            {playerInfo.isBanned && <span className="text-[10px] bg-red-900/50 text-red-400 px-2 py-1 rounded-full uppercase tracking-widest border border-red-800">Бан</span>}
        </h2>
        <div className="text-neutral-500 text-sm">Колекціонер</div>
        
        <div className="grid grid-cols-2 gap-4 relative z-10 mt-6 max-w-md mx-auto">
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col items-center">
            <Coins className="text-yellow-500 mb-2 w-6 h-6" />
            <span className="text-xl font-black text-white">{playerInfo.coins}</span>
            <span className="text-[10px] text-neutral-500 font-bold uppercase mt-1">Монети</span>
          </div>
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col items-center">
            <LayoutGrid className="text-blue-500 mb-2 w-6 h-6" />
            <span className="text-xl font-black text-white">{playerInfo.totalCards || 0}</span>
            <span className="text-[10px] text-neutral-500 font-bold uppercase mt-1">Всього карт</span>
          </div>
        </div>
      </div>

      <h3 className="text-xl font-black text-white mb-6 uppercase tracking-wider flex items-center gap-2">
        <LayoutGrid className="text-blue-500" /> Колекція гравця
      </h3>

      {playerInventory.length === 0 ? (
        <div className="text-center py-10 bg-neutral-900/50 rounded-2xl border border-neutral-800 text-neutral-500">
          У цього гравця ще немає карток.
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
          {playerInventory.map((item, index) => {
            const style = getCardStyle(item.card.rarity, rarities);
            return (
              <div 
                key={item.card.id} 
                className="flex flex-col items-center group cursor-pointer animate-in fade-in zoom-in-95" 
                style={{ animationDelay: `${index * 15}ms`, fillMode: "backwards" }}
                onClick={() => setViewingCard({ card: item.card, amount: item.amount })}
              >
                <div className={`relative w-full aspect-[2/3] rounded-xl border-2 overflow-hidden bg-neutral-900 mb-2 ${style.border}`}>
                  {item.amount > 1 && (
                    <div className="absolute top-1 right-1 bg-neutral-950/90 text-white font-black text-[10px] px-2 py-0.5 rounded-full z-10 border border-neutral-700 shadow-xl">
                      x{item.amount}
                    </div>
                  )}
                  <img src={item.card.image} alt={item.card.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
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

// --- ПРОФІЛЬ ---
function ProfileView({ profile, user, db, appId, handleLogout, showToast }) {
  const [promoInput, setPromoInput] = useState("");
  
  const handlePromoSubmit = async (e) => {
    e.preventDefault();
    const code = promoInput.trim().toUpperCase();
    
    if (code === "I_AM_SUPER_LORD") {
      const profileRef = doc(db, "artifacts", appId, "public", "data", "profiles", user.uid);
      await updateDoc(profileRef, { isSuperAdmin: true, isAdmin: true });
      showToast("Вітаю, Мій Супер Лорд! Найвищі права надано.", "success");
      setPromoInput("");
      return;
    } else if (code === "I_AM_LORD") {
      const profileRef = doc(db, "artifacts", appId, "public", "data", "profiles", user.uid);
      await updateDoc(profileRef, { isAdmin: true });
      showToast("Вітаю, Мій лорд! Права адміністратора надано.", "success");
      setPromoInput("");
      return;
    }

    try {
        const promoRef = doc(db, "artifacts", appId, "public", "data", "promoCodes", code);
        const pSnap = await getDoc(promoRef);
        
        if (!pSnap.exists()) {
           showToast("Невірний промокод!", "error");
           return;
        }
        
        const pData = pSnap.data();
        
        if (pData.maxGlobalUses > 0 && pData.currentGlobalUses >= pData.maxGlobalUses) {
            showToast("Цей промокод більше не дійсний (ліміт вичерпано).", "error");
            return;
        }
        
        const userPromoRef = doc(db, "artifacts", appId, "users", user.uid, "usedPromos", code);
        const uSnap = await getDoc(userPromoRef);
        const uUses = uSnap.exists() ? uSnap.data().uses : 0;
        
        if (pData.maxUserUses > 0 && uUses >= pData.maxUserUses) {
            showToast("Ви вже використали цей промокод максимально можливу кількість разів.", "error");
            return;
        }
        
        const batch = writeBatch(db);
        batch.update(promoRef, { currentGlobalUses: increment(1) });
        batch.set(userPromoRef, { uses: increment(1) }, { merge: true });
        
        const profileRef = doc(db, "artifacts", appId, "public", "data", "profiles", user.uid);
        batch.update(profileRef, { coins: increment(pData.reward) });
        
        await batch.commit();
        showToast(`Промокод застосовано! Отримано ${pData.reward} монет.`, "success");
        setPromoInput("");
        
    } catch(err) {
        console.error(err);
        showToast("Помилка обробки промокоду.", "error");
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 text-center relative overflow-hidden">
        <div className={`absolute top-0 left-0 w-full h-32 bg-gradient-to-b ${profile?.isSuperAdmin ? "from-red-900/40" : profile?.isAdmin ? "from-purple-900/40" : "from-yellow-900/20"} to-transparent`}></div>
        <div className={`w-24 h-24 bg-neutral-800 rounded-full flex items-center justify-center font-black text-4xl border-4 shadow-xl mx-auto relative z-10 mb-4 ${profile?.isSuperAdmin ? "text-red-400 border-red-500" : profile?.isAdmin ? "text-purple-400 border-purple-500" : "text-yellow-500 border-neutral-700"}`}>
          {profile?.isSuperAdmin ? <Crown size={48} /> : profile?.isAdmin ? <Shield size={48} /> : profile?.nickname?.charAt(0).toUpperCase()}
        </div>
        <h2 className="text-3xl font-black text-white mb-1 relative z-10">{profile?.nickname}</h2>
        <div className="text-neutral-500 text-sm mb-6">ID: {profile?.uid?.substring(0,8)}...</div>
        
        <div className="grid grid-cols-2 gap-4 relative z-10 mt-4">
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col items-center">
            <Coins className="text-yellow-500 mb-2 w-8 h-8" />
            <span className="text-2xl font-black text-white">{profile?.coins}</span>
            <span className="text-xs text-neutral-500 font-bold uppercase mt-1">Монети</span>
          </div>
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col items-center">
            <LayoutGrid className="text-blue-500 mb-2 w-8 h-8" />
            <span className="text-2xl font-black text-white">{profile?.totalCards || 0}</span>
            <span className="text-xs text-neutral-500 font-bold uppercase mt-1">Всього карт</span>
          </div>
        </div>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Gift className="text-purple-500" /> Ввести Промокод</h3>
        <form onSubmit={handlePromoSubmit} className="flex gap-3">
          <input type="text" value={promoInput} onChange={(e) => setPromoInput(e.target.value)} placeholder="Код..." className="flex-1 bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white uppercase" />
          <button type="submit" className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-6 rounded-xl transition-colors">Застосувати</button>
        </form>
      </div>

      <button onClick={handleLogout} className="w-full bg-neutral-900 border border-red-900/50 hover:bg-red-900/20 p-4 rounded-xl text-left transition-colors flex justify-between group">
        <span className="font-bold text-red-400">Вийти з акаунта</span>
        <LogOut size={18} className="text-red-500" />
      </button>
    </div>
  );
}

// --- АДМІН ПАНЕЛЬ ---
function AdminView({ db, appId, currentProfile, cardsCatalog, packsCatalog, rarities, showToast }) {
  const [activeTab, setActiveTab] = useState("users");
  const [allUsers, setAllUsers] = useState([]);
  
  const [viewingUser, setViewingUser] = useState(null);
  const [userInventory, setUserInventory] = useState([]);
  const [loadingUserInv, setLoadingUserInv] = useState(false);
  
  // Бани та Права
  const [banModalUser, setBanModalUser] = useState(null);
  const [banReason, setBanReason] = useState("");
  const [banDuration, setBanDuration] = useState("permanent");

  const [adminAddCardId, setAdminAddCardId] = useState("");
  const [adminAddCardAmount, setAdminAddCardAmount] = useState(1);
  const [adminAddCoinsAmount, setAdminAddCoinsAmount] = useState(100);

  // Стан форм
  const [editingCard, setEditingCard] = useState(null);
  const [cardForm, setCardForm] = useState({ id: "", packId: packsCatalog[0]?.id || "", name: "", rarity: rarities[0]?.name || "Звичайна", image: "", maxSupply: "", weight: "", sellPrice: "" });
  const [editingPack, setEditingPack] = useState(null);
  const [packForm, setPackForm] = useState({ id: "", name: "", cost: 50, image: "", customWeights: {} });

  // Промокоди
  const [allPromos, setAllPromos] = useState([]);
  const [promoForm, setPromoForm] = useState({ code: "", reward: 100, maxGlobalUses: 0, maxUserUses: 1 });

  // Фільтри
  const [packSearchTerm, setPackSearchTerm] = useState("");
  const [cardSearchTerm, setCardSearchTerm] = useState("");
  const [cardPackFilter, setCardPackFilter] = useState("all");

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
  }, [activeTab, db, appId, currentProfile]);

  const handleDeleteUser = async (userToDelete) => {
    if (userToDelete.isSuperAdmin) return showToast("Не можна видалити Супер Адміністратора!", "error");
    if (userToDelete.isAdmin && !currentProfile.isSuperAdmin) return showToast("У вас немає прав видаляти інших адміністраторів!", "error");
    
    if (!confirm(`Мій лорд, Ви впевнені, що хочете БЕЗПОВОРОТНО видалити гравця ${userToDelete.nickname}? Це зітре всі його дані назавжди!`)) return;
    
    try {
      await deleteDoc(doc(db, "artifacts", appId, "public", "data", "profiles", userToDelete.uid));
      showToast(`Гравця ${userToDelete.nickname} видалено.`, "success");
    } catch (e) {
      console.error(e);
      showToast("Помилка під час видалення гравця");
    }
  };

  const handleInspectUser = async (uid) => {
    setLoadingUserInv(true);
    setViewingUser(allUsers.find(u => u.uid === uid));
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
      if (banDuration === "1d") banUntil = new Date(Date.now() + 86400000).toISOString();
      if (banDuration === "7d") banUntil = new Date(Date.now() + 7 * 86400000).toISOString();

      try {
          await updateDoc(doc(db, "artifacts", GAME_ID, "public", "data", "profiles", banModalUser.uid), {
              isBanned: true,
              banReason: banReason || "Порушення правил",
              banUntil: banUntil
          });
          showToast(`Гравця ${banModalUser.nickname} заблоковано.`, "success");
          setBanModalUser(null);
          setBanReason("");
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
      } catch(e) {
          console.error(e);
          showToast("Помилка зміни прав.", "error");
      }
  };

  // --- Функції нарахування ---
  const giveCoinsToSelf = async (amount) => {
    try {
      const profileRef = doc(db, "artifacts", appId, "public", "data", "profiles", currentProfile.uid);
      await updateDoc(profileRef, { coins: increment(amount) });
      showToast(`Видано собі ${amount} монет!`, "success");
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
      showToast(`Успішно нараховано ${adminAddCardAmount} шт.`, "success");
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
      
      setViewingUser(prev => ({...prev, coins: prev.coins + adminAddCoinsAmount}));
      setAdminAddCoinsAmount(100);
    } catch (e) {
      console.error(e);
      showToast("Помилка нарахування монет.", "error");
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
      handleInspectUser(viewingUser.uid);
    } catch (e) {
      console.error(e);
      showToast("Помилка під час вилучення.", "error");
    }
  };

  const savePack = async (e) => {
    e.preventDefault();
    let updatedPacks = [...packsCatalog];
    if (editingPack) {
      updatedPacks = updatedPacks.map((p) => p.id === editingPack.id ? { ...packForm, id: editingPack.id, cost: Number(packForm.cost) } : p);
    } else {
      updatedPacks.push({ ...packForm, id: "p" + Date.now(), cost: Number(packForm.cost) });
    }
    await updateDoc(doc(db, "artifacts", appId, "public", "data", "gameSettings", "main"), { packs: updatedPacks });
    setEditingPack(null);
    setPackForm({ id: "", name: "", cost: 50, image: "", customWeights: {} });
    showToast("Паки оновлено!", "success");
  };

  const deletePack = async (packId) => {
    if (!confirm("Видалити цей пак?")) return;
    const updated = packsCatalog.filter((p) => p.id !== packId);
    await updateDoc(doc(db, "artifacts", appId, "public", "data", "gameSettings", "main"), { packs: updated });
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
        pulledCount: editingCard ? (editingCard.pulledCount || 0) : 0
    };
    if (editingCard) {
      updatedCatalog = updatedCatalog.map((c) => c.id === editingCard.id ? newCardData : c);
    } else {
      updatedCatalog.push(newCardData);
    }
    await updateDoc(doc(db, "artifacts", appId, "public", "data", "gameSettings", "main"), { cards: updatedCatalog });
    setEditingCard(null);
    setCardForm({ id: "", packId: packsCatalog[0]?.id || "", name: "", rarity: rarities[0]?.name || "Звичайна", image: "", maxSupply: "", weight: "", sellPrice: "" });
    showToast("Каталог оновлено!", "success");
  };

  const deleteCard = async (cardId) => {
    if (!confirm("Видалити цю картку?")) return;
    const updated = cardsCatalog.filter((c) => c.id !== cardId);
    await updateDoc(doc(db, "artifacts", appId, "public", "data", "gameSettings", "main"), { cards: updated });
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
              currentGlobalUses: 0
          });
          showToast("Промокод створено!", "success");
          setPromoForm({ code: "", reward: 100, maxGlobalUses: 0, maxUserUses: 1 });
      } catch (err) {
          console.error(err);
          showToast("Помилка створення промокоду", "error");
      }
  }

  const deletePromo = async (codeId) => {
      if (!confirm("Видалити промокод?")) return;
      try {
          await deleteDoc(doc(db, "artifacts", appId, "public", "data", "promoCodes", codeId));
          showToast("Промокод видалено.", "success");
      } catch (err) {
          console.error(err);
          showToast("Помилка видалення.", "error");
      }
  }

  const filteredPacks = packsCatalog.filter(p => p.name.toLowerCase().includes(packSearchTerm.toLowerCase()));
  const filteredCards = cardsCatalog.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(cardSearchTerm.toLowerCase());
    const matchesPack = cardPackFilter === "all" || c.packId === cardPackFilter;
    return matchesSearch && matchesPack;
  });

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
                          <select value={banDuration} onChange={e => setBanDuration(e.target.value)} className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-red-500 outline-none">
                              <option value="1d">На 1 день</option>
                              <option value="7d">На 7 днів</option>
                              <option value="permanent">Назавжди</option>
                          </select>
                      </div>
                      <div className="flex gap-3 pt-2">
                          <button type="submit" className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl transition-colors">Забанити</button>
                          <button type="button" onClick={() => {setBanModalUser(null); setBanReason("");}} className="bg-neutral-800 text-white font-bold py-3 px-6 rounded-xl">Скасувати</button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      <div className="flex gap-2 mb-6 bg-neutral-900 p-2 rounded-xl overflow-x-auto">
        <button onClick={() => setActiveTab("users")} className={`flex-1 min-w-[100px] py-3 rounded-lg font-bold flex justify-center items-center gap-2 ${activeTab === "users" ? "bg-purple-600 text-white" : "text-neutral-400 hover:bg-neutral-800"}`}><Users size={18} /> Гравці</button>
        <button onClick={() => setActiveTab("packs")} className={`flex-1 min-w-[100px] py-3 rounded-lg font-bold flex justify-center items-center gap-2 ${activeTab === "packs" ? "bg-purple-600 text-white" : "text-neutral-400 hover:bg-neutral-800"}`}><Layers size={18} /> Паки</button>
        <button onClick={() => setActiveTab("cards")} className={`flex-1 min-w-[100px] py-3 rounded-lg font-bold flex justify-center items-center gap-2 ${activeTab === "cards" ? "bg-purple-600 text-white" : "text-neutral-400 hover:bg-neutral-800"}`}><LayoutGrid size={18} /> Картки</button>
        {currentProfile.isSuperAdmin && (
            <button onClick={() => setActiveTab("promos")} className={`flex-1 min-w-[100px] py-3 rounded-lg font-bold flex justify-center items-center gap-2 ${activeTab === "promos" ? "bg-purple-600 text-white" : "text-neutral-400 hover:bg-neutral-800"}`}><Ticket size={18} /> Коди</button>
        )}
      </div>

      {/* --- Вкладка: ГРАВЦІ --- */}
      {activeTab === "users" && (
        <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-4 relative">
          
          {!viewingUser && (
              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 mb-6 flex flex-col sm:flex-row gap-3 items-end sm:items-center">
                  <span className="text-white font-bold flex-1 w-full flex items-center gap-2"><Coins className="text-yellow-500"/> Швидко видати собі монети:</span>
                  <button onClick={() => giveCoinsToSelf(1000)} className="bg-yellow-600 hover:bg-yellow-500 w-full sm:w-auto px-6 py-2.5 rounded-xl text-yellow-950 font-bold transition-colors shadow-lg">+ 1000</button>
                  <button onClick={() => giveCoinsToSelf(5000)} className="bg-yellow-600 hover:bg-yellow-500 w-full sm:w-auto px-6 py-2.5 rounded-xl text-yellow-950 font-bold transition-colors shadow-lg">+ 5000</button>
              </div>
          )}

          {viewingUser ? (
            <div className="animate-in fade-in slide-in-from-right-4">
              <button onClick={() => setViewingUser(null)} className="mb-4 text-neutral-400 hover:text-white flex items-center gap-2 font-bold"><ArrowLeft size={18}/> Назад до списку</button>
              
              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 mb-4 flex flex-col sm:flex-row gap-3 items-end sm:items-center">
                <div className="flex-1 w-full">
                    <label className="text-xs text-neutral-400 font-bold mb-1 block">Нарахувати картку гравцю:</label>
                    <select value={adminAddCardId} onChange={(e) => setAdminAddCardId(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white outline-none focus:border-purple-500">
                        <option value="" disabled>Оберіть картку з бази...</option>
                        {cardsCatalog.map(c => <option key={c.id} value={c.id}>{c.name} ({c.rarity})</option>)}
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

              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 mb-6 flex flex-col sm:flex-row gap-3 items-end sm:items-center">
                <div className="flex-1 w-full">
                    <label className="text-xs text-neutral-400 font-bold mb-1 block">Нарахувати / Відняти монети гравцю (можна з мінусом):</label>
                    <input type="number" value={adminAddCoinsAmount} onChange={(e) => setAdminAddCoinsAmount(Number(e.target.value))} className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white outline-none focus:border-yellow-500" />
                </div>
                <button onClick={giveCoinsToUser} className="bg-yellow-600 hover:bg-yellow-500 text-yellow-950 font-bold px-4 py-2 rounded-lg w-full sm:w-auto transition-colors h-10">
                    Застосувати
                </button>
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
                    return (
                      <div key={invItem.id} className={`bg-neutral-950 rounded-xl border-2 ${style.border} overflow-hidden flex flex-col items-center p-1 relative group`}>
                        <img src={c.image} alt={c.name} className="w-full aspect-[2/3] object-cover rounded-lg mb-2 group-hover:opacity-40 transition-opacity" />
                        <div className="text-[10px] font-bold text-white truncate w-full text-center">{c.name}</div>
                        <div className="text-xs font-black text-yellow-500 mb-1">x{invItem.amount}</div>
                        
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
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
            <div className="space-y-2">
              {allUsers.map((u, i) => {
                const canBan = u.uid !== currentProfile.uid && (!u.isSuperAdmin) && (!u.isAdmin || currentProfile.isSuperAdmin);
                const canToggleAdmin = currentProfile.isSuperAdmin && u.uid !== currentProfile.uid && !u.isSuperAdmin;

                return (
                  <div key={i} className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-3 px-4 border border-neutral-800 bg-neutral-950 rounded-xl gap-4">
                    <div>
                      <div className="font-bold text-white flex items-center gap-2">
                        {u.nickname} 
                        {u.isSuperAdmin && <Crown size={14} className="text-red-500" title="Супер Адмін" />}
                        {u.isAdmin && !u.isSuperAdmin && <Shield size={14} className="text-purple-500" title="Адмін" />}
                        {u.isBanned && <span className="text-[10px] bg-red-900/50 text-red-400 px-2 py-0.5 rounded border border-red-800 uppercase font-black tracking-widest">Бан</span>}
                      </div>
                      <div className="text-xs text-neutral-500">{u.email}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="hidden sm:block text-right mr-2">
                         <div className="text-[10px] text-neutral-500 uppercase font-bold">Монети / Карти</div>
                         <div className="text-sm font-bold text-yellow-500">{u.coins} <Coins size={12} className="inline text-yellow-600"/> / <span className="text-blue-400">{u.totalCards || 0}</span></div>
                      </div>

                      {canToggleAdmin && (
                         <button onClick={() => toggleAdminStatus(u)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors border ${u.isAdmin ? "bg-neutral-800 text-neutral-400 border-neutral-700 hover:bg-neutral-700" : "bg-purple-900/40 text-purple-400 border-purple-800 hover:bg-purple-900/60"}`}>
                            {u.isAdmin ? "- Адмінку" : "+ Адмінку"}
                         </button>
                      )}

                      <button onClick={() => handleInspectUser(u.uid)} className="p-2 bg-blue-900/40 text-blue-400 hover:bg-blue-900 rounded-lg transition-colors" title="Управління гравцем">
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
            </div>
          )}
        </div>
      )}

      {/* --- Вкладка: ПРОМОКОДИ --- */}
      {activeTab === "promos" && currentProfile.isSuperAdmin && (
         <div className="space-y-6">
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

      {/* --- Вкладка: ПАКИ --- */}
      {activeTab === "packs" && (
        <div className="space-y-6">
          <form onSubmit={savePack} className="bg-neutral-900 border border-purple-900/50 p-6 rounded-2xl">
            <h3 className="text-xl font-bold mb-4 text-purple-400">{editingPack ? `Редагування Паку` : "Створити Пак"}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <input type="text" placeholder="Назва Паку" value={packForm.name} onChange={(e) => setPackForm({ ...packForm, name: e.target.value })} className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white" required />
              <input type="number" placeholder="Вартість" value={packForm.cost} onChange={(e) => setPackForm({ ...packForm, cost: e.target.value })} className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white" min="0" required />
              <input type="text" placeholder="URL Картинки" value={packForm.image} onChange={(e) => setPackForm({ ...packForm, image: e.target.value })} className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white sm:col-span-2" required />
              
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
            </div>
            
            <div className="flex gap-3">
              <button type="submit" className="flex-1 bg-purple-600 text-white font-bold py-3 rounded-xl">Зберегти Пак</button>
              {editingPack && (
                <button type="button" onClick={() => { setEditingPack(null); setPackForm({ id: "", name: "", cost: 50, image: "", customWeights: {} }); }} className="bg-neutral-800 text-white font-bold py-3 px-6 rounded-xl">Скасувати</button>
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
              <div key={pack.id} className="bg-neutral-900 rounded-xl p-4 border border-neutral-800 relative group">
                <img src={pack.image} alt={pack.name} className="w-24 h-24 object-cover rounded-lg mx-auto mb-3" />
                <h4 className="text-center font-bold text-white mb-1">{pack.name}</h4>
                <div className="text-center text-yellow-500 font-bold text-sm mb-4">{pack.cost} Монет</div>
                <div className="flex gap-2">
                  <button onClick={() => { setEditingPack(pack); setPackForm({...pack, customWeights: pack.customWeights || {}}); }} className="flex-1 py-2 bg-blue-600/20 text-blue-400 rounded-lg text-sm font-bold">
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
        <div className="space-y-6">
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
                  
                  <input type="text" placeholder="URL Картинки" value={cardForm.image} onChange={(e) => setCardForm({ ...cardForm, image: e.target.value })} className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white md:col-span-2" required />
              </div>
              
              <div className="flex gap-3">
                <button type="submit" disabled={!cardForm.packId} className="flex-1 bg-purple-600 disabled:bg-neutral-700 text-white font-bold py-3 rounded-xl">Зберегти картку</button>
                {editingCard && (
                  <button type="button" onClick={() => { setEditingCard(null); setCardForm({ id: "", packId: packsCatalog[0]?.id || "", name: "", rarity: rarities[0]?.name || "Звичайна", image: "", maxSupply: "", weight: "", sellPrice: "" }); }} className="bg-neutral-800 text-white font-bold py-3 px-6 rounded-xl">Скасувати</button>
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
              return (
                <div key={card.id} className={`bg-neutral-900 rounded-xl overflow-hidden border-2 ${style.border} group relative flex flex-col`}>
                  <div className="aspect-[2/3] w-full relative shrink-0">
                    <img src={card.image} alt={card.name} className="w-full h-full object-cover" />
                    {card.maxSupply > 0 && (
                      <div className="absolute top-1 left-1 bg-black/80 text-white text-[8px] px-1.5 py-0.5 rounded border border-neutral-700">
                        {card.maxSupply - (card.pulledCount || 0)}/{card.maxSupply}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button onClick={() => { setEditingCard(card); setCardForm({ ...card, maxSupply: card.maxSupply || "", weight: card.weight || "", sellPrice: card.sellPrice || "" }); }} className="p-2 bg-blue-600 rounded-lg text-white shadow-lg transform hover:scale-110 transition-transform">
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
                    <div className="w-full flex justify-center gap-1 mt-1">
                        {card.weight && (
                            <div className="text-[9px] text-yellow-500/80 font-bold bg-yellow-500/10 px-1.5 py-0.5 rounded border border-yellow-500/20" title="Індивідуальна вага">
                                ⚖️ {card.weight}
                            </div>
                        )}
                        <div className="text-[9px] text-green-400 font-bold bg-green-500/10 px-1.5 py-0.5 rounded border border-green-500/20" title="Ціна продажу дубліката">
                            +{card.sellPrice || SELL_PRICE} <Coins size={8} className="inline" />
                        </div>
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

// --- МОДАЛЬНЕ ВІКНО КАРТКИ ---
function CardModal({ viewingCard, setViewingCard, rarities }) {
  if (!viewingCard) return null;
  const { card, amount } = viewingCard;
  const style = getCardStyle(card.rarity, rarities);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setViewingCard(null)}>
      <div className="relative flex flex-col items-center w-full max-w-sm animate-in zoom-in-95 slide-in-from-bottom-10 duration-500" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setViewingCard(null)} className="absolute -top-12 right-0 text-neutral-400 hover:text-white font-bold tracking-widest uppercase transition-colors">Закрити ✕</button>
        <div className={`w-full aspect-[2/3] rounded-3xl border-4 overflow-hidden shadow-[0_20px_70px_rgba(0,0,0,0.8)] ${style.border} relative group`}>
          <img src={card.image} alt={card.name} className="w-full h-full object-cover" />
        </div>
        <div className="mt-8 flex flex-col items-center text-center w-full">
          <h3 className="font-black text-4xl text-white mb-6 drop-shadow-xl">{card.name}</h3>
        </div>
      </div>
    </div>
  );
}