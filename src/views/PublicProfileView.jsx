import React, { useState, useEffect } from "react";
import { ArrowLeft, Gem, Ban, CalendarDays, Coins, LayoutGrid, PackageOpen, Zap, Star, Loader2, Volume2, Layers, TrendingDown, TrendingUp, Swords, User, Award, Clock, Trophy, AlertCircle, ShieldAlert, Key, Lock } from "lucide-react";
import { formatDate, getCardStyle, getCardWeight, playCardSound } from "../utils/helpers";
import PlayerAvatar from "../components/PlayerAvatar";
import CardFrame from "../components/CardFrame";
import AchievementIcon from "../components/AchievementIcon";
import { fetchPublicProfileRequest } from "../config/api";

export default function PublicProfileView({ db, appId, targetUid, goBack, cardsCatalog, rarities, setViewingCard, packsCatalog, cardStats, achievementsCatalog = [] }) {
  const [playerInfo, setPlayerInfo] = useState(null);
  const [playerInventory, setPlayerInventory] = useState([]);
  const [mainShowcase, setMainShowcase] = useState(null);
  const [loading, setLoading] = useState(true);

  const [sortBy, setSortBy] = useState("rarity");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPack, setFilterPack] = useState("all");

  const categories = ["all", ...new Set(packsCatalog.map(p => p.category || "Базові"))];
  const relevantPacks = filterCategory === "all" ? packsCatalog : packsCatalog.filter(p => (p.category || "Базові") === filterCategory);

  useEffect(() => {
    const fetchPlayerData = async () => {
      try {
        const profileData = await fetchPublicProfileRequest(targetUid);
        setPlayerInfo(profileData);

        const inv = (profileData.inventory || []).map(i => {
          const c = cardsCatalog.find(cat => cat.id === i.cardId);
          return c ? { card: c, amount: i.amount } : null;
        }).filter(Boolean);
        setPlayerInventory(inv);

        if (profileData.mainShowcaseId && profileData.showcases) {
          const showcaseFound = profileData.showcases.find(s => s.id === profileData.mainShowcaseId);
          if (showcaseFound) {
            const showcaseCards = [];
            const tempInv = JSON.parse(JSON.stringify(inv));
            const cardIdsArray = typeof showcaseFound.cardIds === 'string' ? JSON.parse(showcaseFound.cardIds) : showcaseFound.cardIds;

            for (const cid of (cardIdsArray || [])) {
              const invItem = tempInv.find(i => i.card.id === cid);
              if (invItem && invItem.amount > 0) {
                showcaseCards.push(invItem.card);
                invItem.amount -= 1;
              }
            }
            setMainShowcase({ ...showcaseFound, validCards: showcaseCards });
          }
        }
      } catch (e) {
        console.error("Помилка завантаження гравця", e);
      }
      setLoading(false);
    };
    fetchPlayerData();
  }, [targetUid, db, appId, cardsCatalog]);

  if (loading) return <div className="text-center py-20"><Loader2 className="animate-spin mx-auto w-12 h-12 text-yellow-500 mb-4" /> Шукаємо гравця...</div>;
  if (!playerInfo) return <div className="text-center py-20 text-neutral-500"><Ban className="mx-auto w-12 h-12 mb-4" />Гравця не знайдено.</div>;

  const isPremiumActive = playerInfo.isPremium && playerInfo.premiumUntil && new Date(playerInfo.premiumUntil) > new Date();

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

  return (
    <div className="pb-10 animate-in fade-in slide-in-from-right-8 duration-500">
      <button onClick={goBack} className="mb-6 flex items-center gap-2 text-neutral-400 hover:text-white font-bold transition-colors">
        <ArrowLeft size={20} /> Повернутися до Рейтингу
      </button>

      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 text-center relative overflow-hidden mb-8 shadow-xl">
        <div className={`absolute top-0 left-0 w-full h-32 bg-gradient-to-b ${playerInfo.isSuperAdmin ? "from-orange-900/40" : playerInfo.isAdmin ? "from-purple-900/40" : isPremiumActive ? "from-fuchsia-900/30" : "from-blue-900/20"} to-transparent`}></div>

        <div className="relative w-24 h-24 mx-auto mb-4 z-10">
          <PlayerAvatar profile={playerInfo} className={`w-full h-full rounded-full text-4xl ${isPremiumActive ? 'border-4 border-fuchsia-500 shadow-[0_0_20px_rgba(217,70,239,0.5)]' : ''}`} iconSize={48} />
          {isPremiumActive && (
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-neutral-900 rounded-full p-1 border-2 border-fuchsia-500 z-20">
              <Gem size={16} className="text-fuchsia-400 fill-fuchsia-400" />
            </div>
          )}
        </div>

        <h2 className="text-3xl font-black text-white mb-1 relative z-10 flex justify-center items-center gap-2">
          {playerInfo.nickname}
          <span className="bg-red-600/20 text-red-400 text-sm px-2 py-1 rounded-xl border border-red-500/50 flex items-center gap-1" title="Рівень Фарму">
            <Swords size={16} /> {playerInfo.farmLevel || 1}
          </span>
          {isPremiumActive && <Gem size={18} className="text-fuchsia-400 fill-fuchsia-400" title="Преміум Гравець" />}
          {playerInfo.isBanned && <Ban size={18} className="text-red-500" title="Забанений" />}
        </h2>
        <div className="text-neutral-500 text-sm flex justify-center gap-4 mt-2 mb-6 relative z-10">
          <span className="flex items-center gap-1"><CalendarDays size={14} /> З нами від: {formatDate(playerInfo.createdAt)}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4 mb-8">
          <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl flex flex-col items-center justify-center text-center shadow-md">
            <Coins className="text-yellow-500 mb-2" size={24} />
            <span className="text-xl sm:text-2xl font-black text-white">{playerInfo.coins || 0}</span>
            <span className="text-[10px] sm:text-xs text-neutral-500 font-bold uppercase mt-1">Баланс</span>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl flex flex-col items-center justify-center text-center shadow-md">
            <Layers className="text-blue-500 mb-2" size={24} />
            <span className="text-xl sm:text-2xl font-black text-white">{playerInfo.uniqueCardsCount || 0}</span>
            <span className="text-[10px] sm:text-xs text-neutral-500 font-bold uppercase mt-1">Унікальних</span>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl flex flex-col items-center justify-center text-center shadow-md">
            <PackageOpen className="text-purple-500 mb-2" size={24} />
            <span className="text-xl sm:text-2xl font-black text-white">{playerInfo.packsOpened || 0}</span>
            <span className="text-[10px] sm:text-xs text-neutral-500 font-bold uppercase mt-1">Відкрито паків</span>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl flex flex-col items-center justify-center text-center shadow-md">
            <TrendingDown className="text-red-500 mb-2" size={24} />
            <span className="text-xl sm:text-2xl font-black text-white">{playerInfo.coinsSpentOnPacks || 0}</span>
            <span className="text-[10px] sm:text-xs text-neutral-500 font-bold uppercase mt-1">Витрачено</span>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl flex flex-col items-center justify-center text-center shadow-md">
            <TrendingUp className="text-green-500 mb-2" size={24} />
            <span className="text-xl sm:text-2xl font-black text-white">{playerInfo.coinsEarnedFromPacks || 0}</span>
            <span className="text-[10px] sm:text-xs text-neutral-500 font-bold uppercase mt-1">Зароблено</span>
          </div>
        </div>
      </div>

      {mainShowcase && (
        <div className="mb-10">
          <h3 className="text-2xl font-black text-white mb-4 flex items-center gap-2"><Star className="text-yellow-500" /> Головна Вітрина: {mainShowcase.name}</h3>
          <div className="bg-neutral-900 border border-yellow-600/30 rounded-3xl p-6 flex flex-wrap justify-center gap-4 shadow-[0_0_30px_rgba(234,179,8,0.1)]">
            {mainShowcase.validCards.length === 0 ? (
              <p className="text-neutral-500 py-4">Вітрина порожня.</p>
            ) : (
              mainShowcase.validCards.map((c, index) => {
                const style = getCardStyle(c.rarity, rarities);
                const effectClass = c.effect ? `effect-${c.effect}` : '';
                return (
                  <div key={index} onClick={() => setViewingCard({ card: c, amount: 1 })} className="relative group cursor-pointer animate-in zoom-in-95">
                    <div className={`w-24 sm:w-32 aspect-[2/3] rounded-xl border-2 overflow-hidden bg-neutral-950 ${style.border} ${effectClass} transition-transform group-hover:-translate-y-2`}>
                      <CardFrame frame={c.frame}>
                        <img src={c.image} alt={c.name} className="w-full h-full object-cover" loading="lazy" />
                      </CardFrame>
                      {c.effect && <div className={`${c.effect} pointer-events-none z-10`} />}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ДОСЯГНЕННЯ ГРАВЦЯ */}
      {achievementsCatalog && achievementsCatalog.length > 0 && (
        <div className="mb-10 bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-xl">
          <h3 className="text-2xl font-black text-white mb-4 flex items-center gap-2"><Trophy className="text-yellow-500" /> Досягнення ({playerInfo?.achievements?.length || 0} / {achievementsCatalog.length})</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {achievementsCatalog.map((ach) => {
              const isUnlocked = playerInfo?.achievements?.find(ua => ua.achievementId === ach.id);

              // Calculate progress for locked achievements
              let progressText = null;
              if (!isUnlocked) {
                const pack = packsCatalog.find(p => p.id === ach.packId);
                if (pack) {
                  const packCards = cardsCatalog.filter(c => c.packId === pack.id);
                  const totalInPack = packCards.length;

                  const userCardsInPack = new Set();
                  playerInventory.forEach(inv => {
                    const card = cardsCatalog.find(c => c.id === inv.cardId);
                    if (card && card.packId === pack.id) {
                      userCardsInPack.add(inv.cardId);
                    }
                  });
                  progressText = `${userCardsInPack.size} / ${totalInPack}`;
                }
              }

              return (
                <div key={ach.id} className={`bg-neutral-950 border ${isUnlocked ? 'border-yellow-900/40' : 'border-neutral-800 opacity-50 grayscale'} rounded-xl p-3 flex flex-col items-center text-center relative group overflow-hidden`}>
                  {isUnlocked ? (
                    <div className="absolute inset-0 bg-yellow-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  ) : (
                    <div className="absolute inset-0 bg-neutral-900/40 z-10 flex flex-col items-center justify-center transition-opacity opacity-0 group-hover:opacity-100 gap-1">
                      <div className="bg-black/80 text-white text-[10px] px-2 py-1 flex items-center gap-1 rounded font-bold"><Lock size={10} /> Заблоковано</div>
                      {progressText && <div className="bg-black/80 text-yellow-500 text-[10px] px-2 py-1 rounded font-bold">{progressText}</div>}
                    </div>
                  )}
                  <AchievementIcon iconUrl={ach.iconUrl} className="w-16 h-16 rounded-lg mb-2" size={32} />
                  <div className="text-xs font-bold text-white mb-1 line-clamp-1 w-full" title={ach.name}>{ach.name}</div>
                  <div className="text-[9px] text-neutral-400 line-clamp-2 leading-tight" title={ach.description}>{ach.description}</div>
                  {isUnlocked && <div className="text-[8px] text-yellow-600/60 mt-2">{formatDate(isUnlocked.createdAt)}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h3 className="text-2xl font-black text-white flex items-center gap-2 shrink-0">
          <LayoutGrid className="text-blue-500" /> Колекція Гравця
        </h3>
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setFilterPack("all"); }} className="bg-neutral-900 border border-neutral-700 text-sm font-medium rounded-xl px-4 py-3 focus:outline-none text-white flex-1 min-w-[140px]">
            {categories.map(c => <option key={c} value={c}>{c === "all" ? "Всі Категорії" : c}</option>)}
          </select>
          <select value={filterPack} onChange={(e) => setFilterPack(e.target.value)} className="bg-neutral-900 border border-neutral-700 text-sm font-medium rounded-xl px-4 py-3 focus:outline-none text-white flex-1 min-w-[140px]">
            <option value="all">Всі Паки</option>
            {relevantPacks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="bg-neutral-900 border border-purple-900/50 text-sm font-bold rounded-xl px-4 py-3 focus:outline-none text-purple-400 flex-1 min-w-[140px]">
            <option value="rarity">За Рідкістю</option>
            <option value="pack">За Паком</option>
            <option value="amount">За Дублікатами</option>
            <option value="name">За Алфавітом</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-4">
        {filteredInventory.map((item, index) => {
          const style = getCardStyle(item.card.rarity, rarities);
          const effectClass = item.card.effect ? `effect-${item.card.effect}` : '';
          return (
            <div key={item.card.id} className="flex flex-col items-center group cursor-pointer animate-in fade-in zoom-in-95 duration-300" style={{ animationDelay: `${index * 15}ms`, fillMode: "backwards" }}>
              <div onClick={() => setViewingCard({ card: item.card, amount: item.amount })} className={`relative w-full aspect-[2/3] rounded-xl border-2 overflow-hidden bg-neutral-900 mb-2 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_10px_20px_rgba(0,0,0,0.5)] ${style.border} ${effectClass}`}>
                {Number(item.card.maxSupply) > 0 && (
                  <div className="absolute top-1 left-1 bg-black/90 text-white font-black text-[8px] sm:text-[9px] px-1.5 py-0.5 rounded-sm z-10 border border-neutral-700">
                    {item.card.maxSupply}
                  </div>
                )}
                {item.amount > 1 && (
                  <div className="absolute top-1 right-1 bg-neutral-950/90 text-white font-black text-[10px] px-2 py-0.5 rounded-full z-10 border border-neutral-700 shadow-xl">
                    x{item.amount}
                  </div>
                )}
                <CardFrame frame={item.card.frame}>
                  <img src={item.card.image} alt={item.card.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                </CardFrame>
                {item.card.effect && <div className={`${item.card.effect} pointer-events-none z-10`} />}
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
      {filteredInventory.length === 0 && <p className="text-center text-neutral-500 py-10">Картки не знайдено.</p>}
    </div>
  );
}