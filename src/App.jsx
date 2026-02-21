import React, { useState, useEffect } from "react";
import {
  Coins, PackageOpen, LayoutGrid, AlertCircle, Loader2, Mail, User,
  CheckCircle2, Shield, KeyRound, Trophy, Store, Hexagon, Gem, Swords, Gift
} from "lucide-react";
import { onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { doc, setDoc, collection, onSnapshot, updateDoc, getDocs, getDoc, query, where, writeBatch, increment, deleteDoc } from "firebase/firestore";

// Конфіги та утиліти
import { auth, db, GAME_ID } from "./config/firebase";
import { DEFAULT_PACKS, DEFAULT_BOSSES, DEFAULT_RARITIES, SELL_PRICE } from "./config/constants";
import { isToday } from "./utils/helpers";

// Компоненти
import PlayerAvatar from "./components/PlayerAvatar";
import CardModal from "./components/CardModal";
import ListingModal from "./components/ListingModal";
import NavButton from "./components/NavButton";

// Сторінки (Views)
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

  // Авторизація
  const [needsRegistration, setNeedsRegistration] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [dbError, setDbError] = useState("");

  // Глобальні налаштування
  const [bosses, setBosses] = useState([]);
  const [cardsCatalog, setCardsCatalog] = useState([]);
  const [packsCatalog, setPacksCatalog] = useState([]);
  const [cardStats, setCardStats] = useState({});
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
  
  const checkIsPremiumActive = (prof) => {
      if (!prof || !prof.isPremium || !prof.premiumUntil) return false;
      const d = new Date(prof.premiumUntil);
      return !isNaN(d) && d > new Date();
  };
  const isPremiumActive = checkIsPremiumActive(profile);

// АВТОМАТИЧНЕ ВІДСТЕЖЕННЯ IP (ФІНАЛЬНИЙ ФІКС ЗАПУСКУ)
  useEffect(() => {
    console.log("🛠️ [ШПИГУН] useEffect спрацював! Стан: User є?", !!user, "| Profile є?", !!profile);

    if (!user || !profile) {
        console.log("💤 [ШПИГУН] Ще вантажимось, чекаю...");
        return;
    }

    const trackIp = async () => {
      console.log(`🕵️‍♂️ [ШПИГУН] Профіль завантажено! Починаю пошук IP для: ${profile.nickname}`);
      
      try {
        let currentIp = null;
        
        const apis = [
            { url: 'https://checkip.amazonaws.com/', type: 'text' },
            { url: 'https://api.ipify.org?format=json', type: 'json', field: 'ip' },
            { url: 'https://api.seeip.org/jsonip', type: 'json', field: 'ip' }
        ];

        for (const api of apis) {
            try {
                console.log(`⏳ [ШПИГУН] Стукаю до ${api.url}...`);
                const response = await fetch(api.url);
                
                if (api.type === 'text') {
                    const text = await response.text();
                    currentIp = text.trim();
                } else {
                    const data = await response.json();
                    currentIp = data[api.field];
                }
                
                if (currentIp) {
                    console.log(`✅ [ШПИГУН] БІНГО! IP отримано: ${currentIp}`);
                    break;
                }
            } catch (e) { 
                console.warn(`❌ [ШПИГУН] Провал з ${api.url}. Причина:`, e.message);
            }
        }

        if (!currentIp) {
            console.error("⛔ [ШПИГУН] Всі запити заблоковані браузером (CORS або AdBlock).");
            return; 
        }

        console.log(`🕵️‍♂️ [ШПИГУН] Поточний IP: ${currentIp}. В базі: ${profile.lastIp || "порожньо"}`);

        if (profile.lastIp !== currentIp) {
          console.log("🚨 [ШПИГУН] IP змінився! Пишу в базу та шукаю твінків...");
          
          const q = query(collection(db, "artifacts", GAME_ID, "public", "data", "profiles"), where("lastIp", "==", currentIp));
          const snap = await getDocs(q);
          
          let altAccounts = [];
          snap.forEach(d => {
              if (d.id !== user.uid) altAccounts.push(d.data().nickname);
          });

          if (altAccounts.length > 0) {
              addSystemLog("⚠️ Мультиакаунт", `Гравець ${profile.nickname} зайшов з IP (${currentIp}), який використовують: ${altAccounts.join(", ")}`);
          } else if (!profile.lastIp) {
              addSystemLog("ℹ️ Новий IP", `Гравець ${profile.nickname} вперше зафіксував IP: ${currentIp}`);
          } else {
              addSystemLog("ℹ️ Зміна мережі", `Гравець ${profile.nickname} змінив IP на: ${currentIp}`);
          }

          await updateDoc(doc(db, "artifacts", GAME_ID, "public", "data", "profiles", user.uid), {
              lastIp: currentIp
          });
          
          console.log("💾 [ШПИГУН] Успішно збережено в Firebase!");
        } else {
            console.log("💤 [ШПИГУН] IP не змінився. Нічого не роблю.");
        }
      } catch (e) {
        console.error("💥 [ШПИГУН] КРИТИЧНА ПОМИЛКА КОДУ:", e);
      }
    };

    trackIp();
  }, [user, profile?.uid, profile?.lastIp]); // <-- ОСЬ ТЕПЕР ВІН ТОЧНО ЗАПУСТИТЬСЯ

  useEffect(() => { document.title = "Card Game"; }, []);

  const addSystemLog = async (type, details) => {
    try {
        const logRef = doc(db, "artifacts", GAME_ID, "public", "data", "adminLogs", "log_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5));
        await setDoc(logRef, { type, details, userUid: user?.uid || "Система", userNickname: profile?.nickname || "Гість", timestamp: new Date().toISOString() });
    } catch(e) { console.error("Помилка логування:", e); }
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
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) { setNeedsRegistration(true); setLoading(false); }
    });
    return () => unsubscribe();
  }, []);

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
      }
    }, (err) => { setDbError("Помилка доступу до бази."); setLoading(false); });

    const profileRef = doc(db, "artifacts", GAME_ID, "public", "data", "profiles", user.uid);
    const unsubProfile = onSnapshot(profileRef, (docSnap) => {
      if (docSnap.exists()) {
        const pData = docSnap.data();
        let needsUpdate = false;
        if (pData.isBanned && pData.banUntil) {
          if (new Date().getTime() > new Date(pData.banUntil).getTime()) {
             pData.isBanned = false; pData.banReason = null; pData.banUntil = null; needsUpdate = true;
          }
        }
        if (pData.isPremium && pData.premiumUntil) {
            if (new Date().getTime() > new Date(pData.premiumUntil).getTime()) {
                pData.isPremium = false; pData.premiumUntil = null; needsUpdate = true;
            }
        }
        if (needsUpdate) updateDoc(profileRef, { isBanned: pData.isBanned, banReason: pData.banReason, banUntil: pData.banUntil, isPremium: pData.isPremium, premiumUntil: pData.premiumUntil });
        setProfile(pData);
        setNeedsRegistration(false);
      } else { setNeedsRegistration(true); }
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
      snapshot.forEach((doc) => { stats[doc.id] = doc.data().pulledCount || 0; });
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

    return () => { unsubSettings(); unsubProfile(); unsubInv(); unsubMarket(); unsubShowcases(); unsubCardStats(); };
  }, [user]);

  useEffect(() => {
    if (user && profile && dbInventory) {
      if (profile.uniqueCardsCount !== dbInventory.length) {
        updateDoc(doc(db, "artifacts", GAME_ID, "public", "data", "profiles", user.uid), { uniqueCardsCount: dbInventory.length }).catch(console.error);
      }
    }
  }, [user, profile?.uniqueCardsCount, dbInventory.length]);

  useEffect(() => {
    if (!user || !showcases || showcases.length === 0) return;
    showcases.forEach(showcase => {
        if (!showcase.cardIds || showcase.cardIds.length === 0) return;
        let isChanged = false;
        const validCardIds = [];
        const inventoryTracker = {};
        dbInventory.forEach(item => { inventoryTracker[item.id] = item.amount; });

        showcase.cardIds.forEach(cardId => {
            if (inventoryTracker[cardId] && inventoryTracker[cardId] > 0) {
                validCardIds.push(cardId);
                inventoryTracker[cardId] -= 1;
            } else { isChanged = true; }
        });

        if (isChanged) {
            updateDoc(doc(db, "artifacts", GAME_ID, "users", user.uid, "showcases", showcase.id), { cardIds: validCardIds }).catch(console.error);
        }
    });
  }, [dbInventory, showcases, user]);

  useEffect(() => {
    if (!user || !profile) return;
    const trackIp = async () => {
      try {
        let currentIp = null;
        const apis = ['https://api.ipify.org?format=json', 'https://ipwho.is/', 'https://api.myip.com'];
        for (const url of apis) {
            try {
                const response = await fetch(url);
                const data = await response.json();
                currentIp = data.ip || data.ip_addr || data.query; 
                if (currentIp) break;
            } catch (e) { }
        }
        if (!currentIp || profile.lastIp === currentIp) return;

        const q = query(collection(db, "artifacts", GAME_ID, "public", "data", "profiles"), where("lastIp", "==", currentIp));
        const snap = await getDocs(q);
        let altAccounts = [];
        snap.forEach(d => { if (d.id !== user.uid) altAccounts.push(d.data().nickname); });

        if (altAccounts.length > 0) {
            addSystemLog("⚠️ Мультиакаунт", `Гравець ${profile.nickname} зайшов з IP (${currentIp}), який використовують: ${altAccounts.join(", ")}`);
        } else if (!profile.lastIp) {
            addSystemLog("ℹ️ Новий IP", `Гравець ${profile.nickname} вперше зафіксував IP: ${currentIp}`);
        } else {
            addSystemLog("ℹ️ Зміна мережі", `Гравець ${profile.nickname} змінив IP на: ${currentIp}`);
        }

        await updateDoc(doc(db, "artifacts", GAME_ID, "public", "data", "profiles", user.uid), { lastIp: currentIp });
      } catch (e) { console.error("Помилка IP", e); }
    };
    trackIp();
  }, [user, profile?.lastIp]);

  // --- ЛОГІКА АВТОРИЗАЦІЇ ---
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    const email = e.target.email.value.trim();
    const password = e.target.password.value;
    setLoading(true); setDbError("");
    try {
      if (authMode === "register") {
        const nickname = e.target.nickname.value.trim();
        if (!nickname) throw new Error("Введіть нікнейм!");

        const allProfilesSnap = await getDocs(collection(db, "artifacts", GAME_ID, "public", "data", "profiles"));
        let exists = false;
        allProfilesSnap.forEach(d => { if (d.data().nickname?.toLowerCase() === nickname.toLowerCase()) exists = true; });
        if (exists) { setDbError("Цей нікнейм вже зайнятий іншим гравцем!"); setLoading(false); return; }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "artifacts", GAME_ID, "public", "data", "profiles", userCredential.user.uid), {
          uid: userCredential.user.uid, nickname, email, coins: 200, totalCards: 0, uniqueCardsCount: 0, packsOpened: 0, coinsSpentOnPacks: 0, coinsEarnedFromPacks: 0, lastDailyClaim: null, dailyStreak: 0, createdAt: new Date().toISOString(), promoUsed: false, isAdmin: false, isSuperAdmin: false, isBanned: false, isPremium: false, premiumUntil: null, avatarUrl: "", mainShowcaseId: null
        });
      } else { await signInWithEmailAndPassword(auth, email, password); }
    } catch (err) { setDbError("Помилка: " + err.message); }
    setLoading(false);
  };

  const handleGoogleAuth = async () => {
    setLoading(true); setDbError("");
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      const profileRef = doc(db, "artifacts", GAME_ID, "public", "data", "profiles", result.user.uid);
      const profileSnap = await getDoc(profileRef);
      if (!profileSnap.exists()) {
        let baseNickname = result.user.displayName || "Гість";
        const allProfilesSnap = await getDocs(collection(db, "artifacts", GAME_ID, "public", "data", "profiles"));
        let exists = false;
        allProfilesSnap.forEach(d => { if (d.data().nickname?.toLowerCase() === baseNickname.toLowerCase()) exists = true; });
        if (exists) baseNickname = `${baseNickname}_${result.user.uid.substring(0,4)}`;

        await setDoc(profileRef, {
          uid: result.user.uid, nickname: baseNickname, email: result.user.email || "", coins: 200, totalCards: 0, uniqueCardsCount: 0, packsOpened: 0, coinsSpentOnPacks: 0, coinsEarnedFromPacks: 0, lastDailyClaim: null, dailyStreak: 0, createdAt: new Date().toISOString(), promoUsed: false, isAdmin: false, isSuperAdmin: false, isBanned: false, isPremium: false, premiumUntil: null, avatarUrl: result.user.photoURL || "", mainShowcaseId: null
        });
      }
    } catch (err) { setDbError("Помилка Google: " + err.message); }
    setLoading(false);
  };

  const handleLogout = async () => {
    setLoading(true); await signOut(auth); setProfile(null); setDbInventory([]); setShowcases([]); setCurrentView("shop"); setAuthMode("login");
  };

  const showToast = (msg, type = "error") => {
    setToastMsg({ text: msg, type });
    setTimeout(() => setToastMsg({ text: "", type: "" }), 3000);
  };

  // --- ЛОГІКА РИНКУ ---
  const listOnMarket = async (cardId, price) => {
      if (isProcessing) return;
      const existing = dbInventory.find((i) => i.id === cardId);
      if (!existing || existing.amount < 1) return showToast("У вас немає цієї картки!");
      if (price < 1 || !Number.isInteger(price)) return showToast("Невірна ціна!");

      setIsProcessing(true);
      try {
          const batch = writeBatch(db);
          const invDocRef = doc(db, "artifacts", GAME_ID, "users", user.uid, "inventory", cardId);
          if (existing.amount === 1) batch.delete(invDocRef);
          else batch.update(invDocRef, { amount: increment(-1) });

          const profileRef = doc(db, "artifacts", GAME_ID, "public", "data", "profiles", user.uid);
          batch.update(profileRef, { totalCards: increment(-1) });

          const marketRef = doc(db, "artifacts", GAME_ID, "public", "data", "market", "m_" + Date.now() + "_" + user.uid);
          batch.set(marketRef, {
              cardId, sellerUid: user.uid, sellerNickname: profile.nickname,
              price: Number(price), createdAt: new Date().toISOString(), status: "active"
          });

          await batch.commit();
          showToast("Картку успішно виставлено на Ринок!", "success");
          setListingCard(null);
      } catch(e) {
          console.error(e);
          showToast(`Помилка: ${e.message}`);
      } finally { setIsProcessing(false); }
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
          batch.update(marketRef, { status: "sold", buyerUid: user.uid, buyerNickname: profile.nickname, soldAt: new Date().toISOString() });

          await batch.commit();
          showToast(`Картку успішно придбано за ${listing.price} монет!`, "success");
      } catch (e) {
          console.error(e);
          showToast("Помилка покупки. Можливо, лот вже продано.");
      } finally { setIsProcessing(false); }
  };

  const cancelMarketListing = async (listing) => {
      if (isProcessing) return;
      if (listing.sellerUid !== user.uid && !profile.isAdmin) return;

      setIsProcessing(true);
      try {
          const batch = writeBatch(db);
          batch.delete(doc(db, "artifacts", GAME_ID, "public", "data", "market", listing.id));

          const sellerProfileRef = doc(db, "artifacts", GAME_ID, "public", "data", "profiles", listing.sellerUid);
          batch.update(sellerProfileRef, { totalCards: increment(1) });

          const sellerInvRef = doc(db, "artifacts", GAME_ID, "users", listing.sellerUid, "inventory", listing.cardId);
          batch.set(sellerInvRef, { amount: increment(1) }, { merge: true });

          await batch.commit();
          showToast(listing.sellerUid === user.uid ? "Лот знято з продажу." : "Лот примусово видалено.", "success");
      } catch (e) { console.error(e); showToast("Помилка скасування лоту."); } 
      finally { setIsProcessing(false); }
  };

  // --- ЛОГІКА ВІДКРИТТЯ ПАКІВ ---
  const openPack = async (packId, cost, amountToOpen = 1) => {
    if (isProcessing || !profile || openingPackId || isRouletteSpinning) return;
    const selectedPackDef = packsCatalog.find(p => p.id === packId);
    if (selectedPackDef?.isPremiumOnly && !isPremiumActive) {
        return showToast("Цей пак доступний тільки для Преміум гравців!", "error");
    }

    const totalCost = cost * amountToOpen;
    if (profile.coins < totalCost) return showToast("Недостатньо монет, Мій лорд!");

    setIsProcessing(true);
    setOpeningPackId(packId);
    setPulledCards([]);

    setTimeout(async () => {
      let tempCatalog = JSON.parse(JSON.stringify(cardsCatalog));
      let results = [];
      let countsMap = {};
      let totalEarnedCoins = 0; 

      for (let i = 0; i < amountToOpen; i++) {
        const availableNow = tempCatalog.filter(c => c.packId === packId && (!c.maxSupply || (c.pulledCount || 0) < c.maxSupply));
        if (availableNow.length === 0) {
          if (i === 0) {
            setOpeningPackId(null); setIsProcessing(false);
            return showToast("У цьому паку не залишилось доступних карток!");
          }
          break;
        }

        let totalWeight = 0;
        const activeWeights = [];

        for (const c of availableNow) {
            let w = 1;
            const globalRObj = rarities.find(r => r.name === c.rarity);
            if (c.weight !== undefined && c.weight !== "") w = Number(c.weight);
            else if (selectedPackDef?.customWeights?.[c.rarity] !== undefined && selectedPackDef?.customWeights?.[c.rarity] !== "") w = Number(selectedPackDef.customWeights[c.rarity]);
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
        totalEarnedCoins += (newCard.sellPrice ? Number(newCard.sellPrice) : SELL_PRICE);
      }

      if (results.length === 0) { setOpeningPackId(null); setIsProcessing(false); return; }

      try {
        const batch = writeBatch(db);
        const profileRef = doc(db, "artifacts", GAME_ID, "public", "data", "profiles", user.uid);
        batch.update(profileRef, { 
          coins: increment(-totalCost), totalCards: increment(results.length), packsOpened: increment(amountToOpen),
          coinsSpentOnPacks: increment(totalCost), coinsEarnedFromPacks: increment(totalEarnedCoins)
        });

        for (const card of results) {
          if (Number(card.maxSupply) > 0) {
            batch.set(doc(db, "artifacts", GAME_ID, "public", "data", "cardStats", card.id), { pulledCount: increment(1) }, { merge: true });
          }
        }

        for (const [cardId, count] of Object.entries(countsMap)) {
          batch.set(doc(db, "artifacts", GAME_ID, "users", user.uid, "inventory", cardId), { amount: increment(count) }, { merge: true });
        }

        await batch.commit();

        if (amountToOpen === 1) {
            const availablePackCards = tempCatalog.filter((c) => c.packId === packId);
            const fakeCards = Array.from({length: 45}, () => availablePackCards[Math.floor(Math.random() * availablePackCards.length)]);
            fakeCards[35] = results[0]; 
            setRouletteItems(fakeCards);
            setIsRouletteSpinning(true);
            setOpeningPackId(null);
            setTimeout(() => {
                setIsRouletteSpinning(false); setPulledCards(results); setIsProcessing(false);
            }, 5000); 
        } else {
            setOpeningPackId(null); setPulledCards(results); setIsProcessing(false);
        }
      } catch (err) {
        console.error(err); showToast(`Помилка: ${err.message}`);
        setOpeningPackId(null); setIsProcessing(false);
      }
    }, amountToOpen === 1 ? 100 : 1500);
  };

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
           if (existing && existing.amount <= count) batch.delete(invDocRef);
           else batch.update(invDocRef, { amount: increment(-count) });
        }
        batch.update(doc(db, "artifacts", GAME_ID, "public", "data", "profiles", user.uid), {
          coins: increment(totalEarned), totalCards: increment(-totalCardsRemoved)
        });
        await batch.commit();
        showToast(`Успішно продано всі отримані картки! Отримано ${totalEarned} монет.`, "success");
        setPulledCards([]);
      } catch(e) { showToast("Помилка продажу карток."); } 
      finally { setIsProcessing(false); }
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
      batch.update(doc(db, "artifacts", GAME_ID, "users", user.uid, "inventory", cardId), { amount: increment(-1) });
      batch.update(doc(db, "artifacts", GAME_ID, "public", "data", "profiles", user.uid), { coins: increment(cardPrice), totalCards: increment(-1) });
      await batch.commit();
      showToast(`Продано за ${cardPrice} монет!`, "success");
    } catch (e) { showToast("Помилка під час продажу."); } 
    finally { setIsProcessing(false); }
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
      batch.update(doc(db, "artifacts", GAME_ID, "users", user.uid, "inventory", cardId), { amount: 1 });
      batch.update(doc(db, "artifacts", GAME_ID, "public", "data", "profiles", user.uid), { coins: increment(earnedCoins), totalCards: increment(-sellCount) });
      await batch.commit();
      showToast(`Продано ${sellCount} шт. за ${earnedCoins} монет!`, "success");
    } catch (e) { showToast("Помилка під час масового продажу."); } 
    finally { setIsProcessing(false); }
  };

  const sellEveryDuplicate = async (specificInventory = null) => {
    if (isProcessing) return;
    const baseList = specificInventory || dbInventory.map(item => {
        const cardData = cardsCatalog.find((c) => c.id === item.id);
        return cardData && item.amount > 0 ? { card: cardData, amount: item.amount } : null;
    }).filter(Boolean);

    const duplicates = baseList.filter(item => item.amount > 1);
    if (duplicates.length === 0) return showToast("У вибраному списку немає дублікатів для продажу!", "error");

    setIsProcessing(true);
    let totalEarned = 0; let totalCardsRemoved = 0;
    const batch = writeBatch(db);

    duplicates.forEach(item => {
      const idToUpdate = item.card?.id || item.id;
      const cardDef = cardsCatalog.find(c => c.id === idToUpdate);
      const cardPrice = cardDef?.sellPrice ? Number(cardDef.sellPrice) : SELL_PRICE;
      const sellCount = item.amount - 1;

      totalEarned += sellCount * cardPrice;
      totalCardsRemoved += sellCount;
      batch.update(doc(db, "artifacts", GAME_ID, "users", user.uid, "inventory", idToUpdate), { amount: 1 });
    });

    batch.update(doc(db, "artifacts", GAME_ID, "public", "data", "profiles", user.uid), { 
      coins: increment(totalEarned), totalCards: increment(-totalCardsRemoved)
    });

    try {
      await batch.commit();
      showToast(`Продано всі дублікати! Отримано ${totalEarned} монет.`, "success");
    } catch (e) { showToast("Помилка під час масового продажу інвентарю."); } 
    finally { setIsProcessing(false); }
  };

  // --- ЛОГІКА ВІТРИН ---
  const createShowcase = async (name) => {
      if (!name.trim()) return showToast("Введіть назву вітрини!");
      if (showcases.length >= 5 && !profile.isSuperAdmin) return showToast("Досягнуто ліміт вітрин (5 шт).");
      try {
          await setDoc(doc(collection(db, "artifacts", GAME_ID, "users", user.uid, "showcases")), {
              name: name.trim(), cardIds: [], createdAt: new Date().toISOString()
          });
          showToast("Вітрину успішно створено!", "success");
      } catch (e) { showToast("Помилка створення вітрини."); }
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
      } catch (e) { showToast("Помилка видалення."); }
  };

  const setMainShowcase = async (showcaseId) => {
      try {
          await updateDoc(doc(db, "artifacts", GAME_ID, "public", "data", "profiles", user.uid), { mainShowcaseId: showcaseId });
          showToast("Головну вітрину оновлено!", "success");
      } catch (e) { showToast("Помилка оновлення профілю."); }
  };

  const saveShowcaseCards = async (showcaseId, newCardIds) => {
      try {
          await updateDoc(doc(db, "artifacts", GAME_ID, "users", user.uid, "showcases", showcaseId), { cardIds: newCardIds });
      } catch (e) { showToast("Помилка збереження карток у вітрині."); }
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
          <button onClick={handleGoogleAuth} className="w-full bg-white text-neutral-900 font-bold p-4 rounded-xl mt-4">Увійти через Google</button>
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
        {currentView === "farm" && <FarmView profile={profile} db={db} appId={GAME_ID} cardsCatalog={cardsCatalog} showToast={showToast} bosses={bosses} rarities={rarities} />}
        {currentView === "shop" && <ShopView cardStats={cardStats} packs={packsCatalog} cardsCatalog={cardsCatalog} rarities={rarities} openPack={openPack} openingPackId={openingPackId} isRouletteSpinning={isRouletteSpinning} rouletteItems={rouletteItems} pulledCards={pulledCards} setPulledCards={setPulledCards} sellPulledCards={sellPulledCards} selectedPackId={selectedPackId} setSelectedPackId={setSelectedPackId} setViewingCard={setViewingCard} isPremiumActive={isPremiumActive} isAdmin={profile?.isAdmin} isProcessing={isProcessing} />}
        {currentView === "premium" && <PremiumShopView profile={profile} user={user} db={db} appId={GAME_ID} premiumPrice={premiumPrice} premiumDurationDays={premiumDurationDays} premiumShopItems={premiumShopItems} showToast={showToast} isProcessing={isProcessing} setIsProcessing={setIsProcessing} addSystemLog={addSystemLog} isPremiumActive={isPremiumActive} cardsCatalog={cardsCatalog} setViewingCard={setViewingCard} rarities={rarities} cardStats={cardStats} />}
        {currentView === "inventory" && <InventoryView inventory={fullInventory} rarities={rarities} catalogTotal={cardsCatalog.length} setViewingCard={setViewingCard} setListingCard={setListingCard} packsCatalog={packsCatalog} showcases={showcases} profile={profile} cardsCatalog={cardsCatalog} cardStats={cardStats} sellDuplicate={sellDuplicate} sellAllDuplicates={sellAllDuplicates} sellEveryDuplicate={sellEveryDuplicate} sellPrice={SELL_PRICE} createShowcase={createShowcase} deleteShowcase={deleteShowcase} setMainShowcase={setMainShowcase} saveShowcaseCards={saveShowcaseCards} />}
        {currentView === "market" && <MarketView marketListings={marketListings} cardsCatalog={cardsCatalog} rarities={rarities} currentUserUid={user.uid} setViewingCard={setViewingCard} isAdmin={profile?.isAdmin} buyFromMarket={buyFromMarket} cancelMarketListing={cancelMarketListing} />}
        {currentView === "profile" && <ProfileView profile={profile} user={user} db={db} appId={GAME_ID} handleLogout={handleLogout} showToast={showToast} inventoryCount={fullInventory.length} canClaimDaily={canClaimDaily} dailyRewards={dailyRewards} premiumDailyRewards={premiumDailyRewards} isPremiumActive={isPremiumActive} showcases={showcases} cardsCatalog={cardsCatalog} rarities={rarities} fullInventory={fullInventory} setViewingCard={setViewingCard} cardStats={cardStats} />}
        {currentView === "rating" && <RatingView db={db} appId={GAME_ID} currentUid={user.uid} setViewingPlayerProfile={(uid) => { setViewingPlayerProfile(uid); setCurrentView("publicProfile"); }} />}
        {currentView === "publicProfile" && viewingPlayerProfile && <PublicProfileView db={db} appId={GAME_ID} targetUid={viewingPlayerProfile} goBack={() => setCurrentView("rating")} cardsCatalog={cardsCatalog} rarities={rarities} setViewingCard={setViewingCard} packsCatalog={packsCatalog} cardStats={cardStats} />}
        {currentView === "admin" && profile?.isAdmin && <AdminView db={db} appId={GAME_ID} currentProfile={profile} cardsCatalog={cardsCatalog} packsCatalog={packsCatalog} rarities={rarities} showToast={showToast} addSystemLog={addSystemLog} dailyRewards={dailyRewards} premiumDailyRewards={premiumDailyRewards} premiumPrice={premiumPrice} premiumDurationDays={premiumDurationDays} premiumShopItems={premiumShopItems} setViewingPlayerProfile={setViewingPlayerProfile} setCurrentView={setCurrentView} bosses={bosses} setBosses={setBosses} />}
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