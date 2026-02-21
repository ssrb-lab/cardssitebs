import React, { useState, useEffect } from "react";
import { ArrowLeft, Gem, Ban, CalendarDays, Coins, LayoutGrid, PackageOpen, Zap, Star, Loader2, Volume2 } from "lucide-react";
import { collection, getDocs, doc, getDoc, query } from "firebase/firestore";
import { formatDate, getCardStyle, getCardWeight, playCardSound } from "../utils/helpers";
import PlayerAvatar from "../components/PlayerAvatar";
import { Swords } from "lucide-react";

export default function PublicProfileView({ cardStats, db, appId, targetUid, goBack, cardsCatalog, rarities, setViewingCard, packsCatalog }) {
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

  // Відображення карток вітрини
  const validShowcaseCards = [];
  if (mainShowcase && mainShowcase.cardIds) {
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