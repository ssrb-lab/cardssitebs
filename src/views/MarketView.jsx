import React, { useState } from "react";
import { Store, Tag, Volume2, User, Coins, Trash2, RefreshCw } from "lucide-react";
import { getCardStyle, playCardSound } from "../utils/helpers";

export default function MarketView({ marketListings, cardsCatalog, rarities, currentUserUid, buyFromMarket, cancelMarketListing, setViewingCard, isAdmin, reloadMarket }) {
   const [tab, setTab] = useState("all");
   const [isRefreshing, setIsRefreshing] = useState(false);

   const activeListings = marketListings.filter(l => (!l.status || l.status === "active") && (tab === "my" ? l.sellerUid === currentUserUid : true));

   const handleRefresh = async () => {
      if (isRefreshing) return;
      setIsRefreshing(true);
      await reloadMarket();
      setIsRefreshing(false);
   };

   return (
      <div className="pb-10 animate-in fade-in zoom-in-95 duration-500">
         <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
            <div className="text-center sm:text-left">
               <h2 className="text-3xl font-black text-white uppercase tracking-widest flex items-center justify-center sm:justify-start gap-3">
                  <Store className="text-blue-500 w-8 h-8" /> Ринок Карток
               </h2>
               <p className="text-neutral-400 text-sm">Купуйте рідкісні лоти в інших гравців!</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto items-center">
               <div className="flex bg-neutral-900 border border-neutral-800 rounded-xl p-1 w-full sm:w-auto">
                  <button onClick={() => setTab("all")} className={`flex-1 sm:px-6 py-2 rounded-lg font-bold text-sm transition-colors ${tab === "all" ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"}`}>
                     Всі лоти
                  </button>
                  <button onClick={() => setTab("my")} className={`flex-1 sm:px-6 py-2 rounded-lg font-bold text-sm transition-colors ${tab === "my" ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"}`}>
                     Мої продажі
                  </button>
               </div>

               <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="bg-neutral-900 border border-neutral-800 p-2.5 rounded-xl hover:bg-neutral-800 transition-colors flex items-center justify-center w-full sm:w-auto group gap-2"
                  title="Оновити ринок"
               >
                  <RefreshCw size={20} className={`text-neutral-400 group-hover:text-blue-400 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
                  <span className="sm:hidden text-sm font-bold text-neutral-400 group-hover:text-white">Оновити</span>
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
                                    Купити ({listing.price} <Coins size={10} />)
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