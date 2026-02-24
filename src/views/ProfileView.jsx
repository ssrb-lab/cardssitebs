import React, { useState, useRef } from "react";
import { Gift, Ticket, Settings, LogOut, CalendarDays, Coins, LayoutGrid, PackageOpen, Zap, Star, Gem, Swords } from "lucide-react";
import PlayerAvatar from "../components/PlayerAvatar";
import { formatDate, getCardStyle } from "../utils/helpers";
import { claimDailyRequest, usePromoRequest, updateAvatarRequest, getToken } from "../config/api";

export default function ProfileView({ profile, setProfile, handleLogout, showToast, inventoryCount, isPremiumActive, showcases, cardsCatalog, rarities, fullInventory, setViewingCard, cardStats }) {
    const [avatarInput, setAvatarInput] = useState("");
    const [promoInput, setPromoInput] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const actionLock = useRef(false);
    
    const canClaimDaily = profile && (!profile.lastDailyClaim || new Date(profile.lastDailyClaim).getUTCDate() !== new Date().getUTCDate());
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
        actionLock.current = true; setIsProcessing(true);
        try {
            const data = await claimDailyRequest(getToken());
            setProfile(data.profile);
            showToast(`Мій лорд, Ви отримали щоденну нагороду: ${data.reward} монет!`, "success");
        } catch (e) {
            showToast(e.message || "Помилка отримання нагороди", "error");
        } finally { actionLock.current = false; setIsProcessing(false); }
    };

    const handleAvatarUpdate = async (e) => {
        e.preventDefault();
        if (actionLock.current || isProcessing || !avatarInput.trim()) return;
        actionLock.current = true; setIsProcessing(true);
        try {
            const data = await updateAvatarRequest(getToken(), avatarInput.trim());
            setProfile(prev => ({ ...prev, avatarUrl: avatarInput.trim() }));
            showToast("Аватар успішно оновлено!", "success");
            setAvatarInput("");
        } catch (e) { showToast("Помилка оновлення аватару"); } 
        finally { actionLock.current = false; setIsProcessing(false); }
    };

    const redeemPromo = async (e) => {
        e.preventDefault();
        if (actionLock.current || isProcessing || !promoInput.trim()) return;
        actionLock.current = true; setIsProcessing(true);
        try {
            const data = await usePromoRequest(getToken(), promoInput.trim().toUpperCase());
            setProfile(data.profile);
            showToast(`Промокод застосовано! Отримано: ${data.reward} монет`, "success");
            setPromoInput("");
        } catch (e) { showToast(e.message || "Помилка промокоду", "error"); } 
        finally { actionLock.current = false; setIsProcessing(false); }
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
                        <span className="text-xl font-black text-white">{profile?.coins || 0}</span>
                        <span className="text-[10px] text-neutral-500 font-bold uppercase mt-1">Монети</span>
                    </div>
                    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col items-center">
                        <LayoutGrid className="text-blue-500 mb-2 w-6 h-6" />
                        <span className="text-xl font-black text-white">{inventoryCount || 0}</span>
                        <span className="text-[10px] text-neutral-500 font-bold uppercase mt-1">Унікальних</span>
                    </div>
                    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col items-center">
                        <PackageOpen className="text-purple-500 mb-2 w-6 h-6" />
                        <span className="text-xl font-black text-white">{profile?.packsOpened || 0}</span>
                        <span className="text-[10px] text-neutral-500 font-bold uppercase mt-1">Відкрито паків</span>
                    </div>
                    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col items-center">
                        <Zap className="text-red-500 mb-2 w-6 h-6" />
                        <span className="text-xl font-black text-white">{profile?.coinsSpentOnPacks || 0}</span>
                        <span className="text-[10px] text-neutral-500 font-bold uppercase mt-1">Витрачено</span>
                    </div>
                    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col items-center sm:col-span-1 col-span-2">
                        <Star className="text-green-500 mb-2 w-6 h-6" />
                        <span className="text-xl font-black text-white">{profile?.coinsEarnedFromPacks || 0}</span>
                        <span className="text-[10px] text-neutral-500 font-bold uppercase mt-1">Зароблено</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-8">
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 relative overflow-hidden group">
                    <h3 className="text-xl font-black text-white mb-2 flex items-center gap-2 relative z-10"><Gift className="text-orange-500" /> Щоденна Нагорода</h3>
                    <button 
                        onClick={claimDaily} 
                        disabled={!canClaimDaily || isProcessing}
                        className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all relative z-10 ${
                            canClaimDaily 
                            ? "bg-gradient-to-r from-orange-600 to-yellow-500 text-yellow-950 shadow-[0_0_20px_rgba(249,115,22,0.4)]" 
                            : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                        }`}
                    >
                        {canClaimDaily ? "Отримати нагороду" : "Вже отримано (Чекайте завтра)"}
                    </button>
                </div>

                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 relative overflow-hidden group">
                    <h3 className="text-xl font-black text-white mb-2 flex items-center gap-2 relative z-10"><Ticket className="text-purple-500" /> Промокоди</h3>
                    <form onSubmit={redeemPromo} className="flex gap-2 relative z-10">
                        <input 
                            type="text" 
                            value={promoInput} 
                            onChange={(e) => setPromoInput(e.target.value.toUpperCase())} 
                            placeholder="Код..." 
                            className="flex-1 bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-purple-500 outline-none" 
                        />
                        <button type="submit" disabled={isProcessing || !promoInput.trim()} className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-6 py-3 rounded-xl">Ок</button>
                    </form>
                </div>
            </div>

            <div className="max-w-4xl mx-auto">
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
                    <h3 className="text-xl font-black text-white mb-4 flex items-center gap-2"><Settings className="text-blue-500" /> Налаштування</h3>
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1">
                            <label className="block text-sm font-bold text-neutral-400 mb-2">URL Аватарки (Необов'язково)</label>
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