import React, { useState, useRef } from "react";
import { doc, updateDoc, increment, getDoc, collection, writeBatch } from "firebase/firestore";
import { Gift, Ticket, Settings, LogOut, CalendarDays, Coins, LayoutGrid, PackageOpen, Zap, Star, Gem, Swords } from "lucide-react";
import { formatDate, getCardStyle } from "../utils/helpers";
import PlayerAvatar from "../components/PlayerAvatar";

export default function ProfileView({ profile, user, db, appId, handleLogout, showToast, inventoryCount, canClaimDaily, dailyRewards, premiumDailyRewards, isPremiumActive, showcases, cardsCatalog, rarities, fullInventory, setViewingCard, cardStats }) {
    const [avatarInput, setAvatarInput] = useState("");
    const [promoInput, setPromoInput] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    
    // БРОНЬОВАНИЙ ЗАМОК ВІД АВТОКЛІКЕРІВ
    const actionLock = useRef(false);
    
    const mainShowcase = showcases?.find(s => s.id === profile?.mainShowcaseId);
    
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
        if (actionLock.current || isProcessing || !canClaimDaily) return;
        
        actionLock.current = true;
        setIsProcessing(true);
        try {
            let serverDate = new Date();
            try {
                const timeRes = await fetch("https://worldtimeapi.org/api/timezone/Etc/UTC");
                if (timeRes.ok) {
                    const timeData = await timeRes.json();
                    serverDate = new Date(timeData.utc_datetime);
                }
            } catch (e) { /* Fallback */ }

            if (profile.lastDailyClaim) {
                const last = new Date(profile.lastDailyClaim);
                if (last.getDate() === serverDate.getDate() && last.getMonth() === serverDate.getMonth() && last.getFullYear() === serverDate.getFullYear()) {
                    showToast("Ви вже забирали нагороду сьогодні.", "error");
                    return;
                }
            }

            const streak = profile.dailyStreak || 0;
            const rewardsArr = isPremiumActive ? premiumDailyRewards : dailyRewards;
            const dayIndex = streak % rewardsArr.length;
            const reward = rewardsArr[dayIndex];

            const newStreak = streak + 1;
            await updateDoc(doc(db, "artifacts", appId, "public", "data", "profiles", user.uid), {
                coins: increment(reward),
                lastDailyClaim: serverDate.toISOString(),
                dailyStreak: newStreak
            });
            showToast(`Мій лорд, Ви отримали щоденну нагороду: ${reward} монет!`, "success");
        } catch (e) {
            console.error(e);
            showToast("Помилка отримання нагороди");
        } finally {
            actionLock.current = false;
            setIsProcessing(false);
        }
    };

    const handleAvatarUpdate = async (e) => {
        e.preventDefault();
        if (actionLock.current || isProcessing) return;
        
        actionLock.current = true;
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
            actionLock.current = false;
            setIsProcessing(false);
        }
    };

    const redeemPromo = async (e) => {
        e.preventDefault();
        if (actionLock.current || isProcessing || !promoInput.trim()) return;
        
        actionLock.current = true;
        setIsProcessing(true);
        const codeId = promoInput.trim().toUpperCase();
        
        try {
            const promoRef = doc(db, "artifacts", appId, "public", "data", "promoCodes", codeId);
            const promoSnap = await getDoc(promoRef);
            if (!promoSnap.exists()) {
                showToast("Промокод не знайдено!", "error");
                return;
            }
            const promoData = promoSnap.data();

            const usesRef = collection(db, "artifacts", appId, "users", user.uid, "promoUses");
            const userUseDoc = await getDoc(doc(usesRef, codeId));
            const userUsesCount = userUseDoc.exists() ? userUseDoc.data().count : 0;

            if (promoData.maxGlobalUses > 0 && promoData.currentGlobalUses >= promoData.maxGlobalUses) {
                showToast("Ліміт використання промокоду вичерпано!", "error");
                return;
            }
            if (promoData.maxUserUses > 0 && userUsesCount >= promoData.maxUserUses) {
                showToast("Ви вже використали цей промокод максимальну кількість разів!", "error");
                return;
            }

            const batch = writeBatch(db);
            batch.update(promoRef, { currentGlobalUses: increment(1) });
            batch.set(doc(usesRef, codeId), { count: increment(1) }, { merge: true });
            batch.update(doc(db, "artifacts", appId, "public", "data", "profiles", user.uid), {
                coins: increment(promoData.reward)
            });
            await batch.commit();
            showToast(`Промокод застосовано! Отримано: ${promoData.reward} монет`, "success");
            setPromoInput("");
        } catch (e) {
            console.error(e);
            showToast("Помилка застосування промокоду");
        } finally {
            actionLock.current = false;
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