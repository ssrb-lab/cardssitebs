import React, { useState, useRef } from "react";
import { Gem, CheckCircle2, Edit2, Coins, Star, Eye, Trash2 } from "lucide-react";
import { doc, updateDoc, increment, collection, getDocs, writeBatch } from "firebase/firestore";
import { buyPremiumRequest, getToken } from "../config/api";
import { formatDate } from "../utils/helpers";

export default function PremiumShopView({ profile, setProfile, cardStats, user, db, appId, premiumPrice, premiumDurationDays, premiumShopItems, showToast, isProcessing, setIsProcessing, addSystemLog, isPremiumActive, cardsCatalog, rarities, setViewingCard }) {
    
    const [newNickname, setNewNickname] = useState("");
    
    // БРОНЬОВАНИЙ ЗАМОК ВІД АВТОКЛІКЕРІВ
    const actionLock = useRef(false);

    const handleBuyPremium = async () => {
      if (isProcessing) return;
      setIsProcessing(true);
      try {
          const data = await buyPremiumRequest(getToken());
          setProfile(data.profile); // Оновлюємо профіль, монети знімуться миттєво
          showToast("Преміум успішно придбано!", "success");
          if (addSystemLog) addSystemLog("Магазин", `Гравець ${profile.nickname} придбав Преміум`);
      } catch (e) {
          showToast(e.message || "Помилка покупки.");
      } finally {
          setIsProcessing(false);
      }
  };

    const handleNicknameChange = async (e) => {
        e.preventDefault();
        if (actionLock.current || isProcessing) return;
        
        const nn = newNickname.trim();
        if (!nn) return showToast("Введіть новий нікнейм!");
        if (profile.coins < 100000) return showToast("Недостатньо монет!");
        
        actionLock.current = true;
        setIsProcessing(true);
        try {
            const profilesSnap = await getDocs(collection(db, "artifacts", appId, "public", "data", "profiles"));
            let exists = false;
            profilesSnap.forEach(d => {
                if (d.data().nickname?.toLowerCase() === nn.toLowerCase()) exists = true;
            });
            
            if (exists) {
                showToast("Цей нікнейм вже зайнятий іншим гравцем!", "error");
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
            actionLock.current = false;
            setIsProcessing(false);
        }
    };

    const buyItem = async (item) => {
        if (actionLock.current || isProcessing) return;
        if (!isPremiumActive) return showToast("Цей товар доступний лише для власників Преміум-акаунту!");
        if (profile.coins < item.price) return showToast("Недостатньо монет!");

        actionLock.current = true;
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
            actionLock.current = false;
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
                    onClick={handleBuyPremium} 
                    disabled={isProcessing}
                    className="w-full sm:w-auto bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white font-black text-lg py-4 px-12 rounded-2xl shadow-xl transition-transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 mx-auto"
                >
                    {isPremiumActive ? `Продовжити ще на ${premiumDurationDays} днів` : "Придбати Преміум"}
                    <span className="bg-black/30 px-3 py-1 rounded-lg text-sm flex items-center gap-1">
                        {premiumPrice} <Coins size={16}/>
                    </span>
                </button>
            </div>

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

            {premiumShopItems && premiumShopItems.length > 0 && (
                <div>
                    <h3 className="text-2xl font-black text-white text-center mb-8 uppercase tracking-widest flex items-center justify-center gap-2">
                        <Star className="text-fuchsia-500" /> Ексклюзивні Товари
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                        {premiumShopItems.map((item, idx) => {
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