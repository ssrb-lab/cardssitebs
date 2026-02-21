import React, { useState, useEffect } from "react";
import { 
  Users, Layers, LayoutGrid, Ticket, Settings, ScrollText, Bug, Edit2, 
  Trash2, Ban, Database, Loader2, ArrowLeft, Coins, Gem, Swords, Search, Filter, User,
  Eye, CheckCircle2, CalendarDays, Gift // <-- Додано пропущені іконки!
} from "lucide-react";
import { collection, onSnapshot, updateDoc, doc, deleteDoc, writeBatch, getDocs, query, where, increment, setDoc } from "firebase/firestore";
import { formatDate, getCardStyle, playCardSound } from "../utils/helpers";
import { EFFECT_OPTIONS, SELL_PRICE } from "../config/constants";
import PlayerAvatar from "../components/PlayerAvatar";

export default function AdminView({ db, appId, currentProfile, cardsCatalog, packsCatalog, rarities, showToast, addSystemLog, dailyRewards, premiumDailyRewards, premiumPrice, premiumDurationDays, premiumShopItems, setViewingPlayerProfile, setCurrentView, bosses, setBosses }) {
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
  
  const [rewardsForm, setRewardsForm] = useState(dailyRewards || [1000, 2000, 3000, 4000, 5000, 6000, 7000]);
  const [premiumRewardsForm, setPremiumRewardsForm] = useState(premiumDailyRewards || [2000, 4000, 6000, 8000, 10000, 12000, 15000]);
  const [priceForm, setPriceForm] = useState(premiumPrice !== undefined ? premiumPrice : 10000);
  const [durationDaysForm, setDurationDaysForm] = useState(premiumDurationDays !== undefined ? premiumDurationDays : 30);
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
          await updateDoc(doc(db, "artifacts", appId, "public", "data", "profiles", banModalUser.uid), {
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
          await updateDoc(doc(db, "artifacts", appId, "public", "data", "profiles", uid), {
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
          await updateDoc(doc(db, "artifacts", appId, "public", "data", "profiles", userObj.uid), {
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
        const profileRef = doc(db, "artifacts", appId, "public", "data", "profiles", viewingUser.uid);
        await updateDoc(profileRef, { farmLevel: val });
        
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

  const [newBoss, setNewBoss] = useState({
        id: null, level: (bosses?.length || 0) + 1, cardId: cardsCatalog?.[0]?.id || "", maxHp: 1000, damagePerClick: 10, rewardPerClick: 2, killBonus: 500, cooldownHours: 4
  });

  const resetBossForm = () => setNewBoss({
        id: null, level: (bosses?.length || 0) + 1, cardId: cardsCatalog?.[0]?.id || "", maxHp: 1000, damagePerClick: 10, rewardPerClick: 2, killBonus: 500, cooldownHours: 4
  });

  const handleAddBoss = async (e) => {
      e.preventDefault();
      if (!newBoss.cardId) return showToast("Виберіть картку!", "error");
      const bossData = {
          id: newBoss.id || `boss_${Date.now()}`,
          level: Number(newBoss.level), cardId: newBoss.cardId, maxHp: Number(newBoss.maxHp),
          damagePerClick: Number(newBoss.damagePerClick), rewardPerClick: Number(newBoss.rewardPerClick),
          killBonus: Number(newBoss.killBonus), cooldownHours: Number(newBoss.cooldownHours)
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
                  isPremium: false, premiumUntil: null
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
                  isPremium: true, premiumUntil: currentExp.toISOString()
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
        packId: cardForm.packId, name: cardForm.name, rarity: cardForm.rarity, image: cardForm.image,
        maxSupply: cardForm.maxSupply ? Number(cardForm.maxSupply) : 0,
        weight: cardForm.weight ? Number(cardForm.weight) : "",
        sellPrice: cardForm.sellPrice ? Number(cardForm.sellPrice) : SELL_PRICE,
        effect: cardForm.effect || "", soundUrl: cardForm.soundUrl || "",
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
              code: codeId, reward: Number(promoForm.reward), maxGlobalUses: Number(promoForm.maxGlobalUses),
              maxUserUses: Number(promoForm.maxUserUses), currentGlobalUses: 0, version: Date.now()
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
              dailyRewards: rewardsForm, premiumDailyRewards: premiumRewardsForm,
              premiumPrice: Number(priceForm), premiumDurationDays: Number(durationDaysForm)
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
          const newItem = { id: "si_" + Date.now(), type: shopItemForm.type, itemId: shopItemForm.itemId, price: Number(shopItemForm.price), description: shopItemForm.description };
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
        return wA - wB; 
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

      {/* НАВІГАЦІЯ АДМІНКИ */}
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

              <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      Інвентар: <span className="text-yellow-500">{viewingUser.nickname}</span> ({viewingUser.coins} <Coins size={16} />)
                  </h3>
                  <div className="text-[11px] text-neutral-500 font-mono mb-4 mt-1 bg-neutral-900 inline-block px-2 py-1 rounded border border-neutral-800">
                      Останній IP: <span className="text-red-400">{viewingUser.lastIp || "Ще не заходив"}</span>
                  </div>
              </div>
              
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
                                <Edit2 size={18} />
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
                      <label className={`text-xs font-bold mb-1`}>{r.name} (Глоб: {r.weight})</label>
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