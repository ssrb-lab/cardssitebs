import React, { useState, useEffect } from "react";
import { Trophy, LayoutGrid, Coins, ArrowLeft, Ban, Swords, Loader2 } from "lucide-react";
import PlayerAvatar from "../components/PlayerAvatar";
import { fetchLeaderboard } from "../config/api";

export default function RatingView({ currentUid, setViewingPlayerProfile }) {
  const [allProfiles, setAllProfiles] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [ratingSort, setRatingSort] = useState("cards");

  useEffect(() => {
    const loadLeaderboard = async () => {
      try {
        const data = await fetchLeaderboard();
        setAllProfiles(data || []);
      } catch (e) {
        console.error("Помилка завантаження бази гравців", e);
      }
      setLoading(false);
    };
    loadLeaderboard();
  }, []);

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
        {filteredLeaders.map((leader) => {
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