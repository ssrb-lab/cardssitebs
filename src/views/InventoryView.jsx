import React, { useState, useEffect } from "react";
import { LayoutGrid, Star, Zap, Coins, PackageOpen, Trash2, GripHorizontal, ArrowLeft, Volume2 } from "lucide-react";
import { getCardStyle, getCardWeight, playCardSound } from "../utils/helpers";
import CardFrame from "../components/CardFrame";

export default function InventoryView({
  inventory, rarities, sellDuplicate, sellAllDuplicates, sellEveryDuplicate,
  sellPrice, catalogTotal, setViewingCard, setListingCard, packsCatalog,
  showcases, createShowcase, deleteShowcase, setMainShowcase, saveShowcaseCards, profile, cardsCatalog, cardStats
}) {
  const [tab, setTab] = useState("cards"); // "cards" or "showcases"

  // Фільтри для карток
  const [sortBy, setSortBy] = useState("rarity");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPack, setFilterPack] = useState("all");

  // Стейт для конструктора вітрин
  const [selectedShowcaseId, setSelectedShowcaseId] = useState(null);
  const [builderCards, setBuilderCards] = useState([]);

  const categories = ["all", ...new Set(packsCatalog.map(p => p.category || "Базові"))];
  const relevantPacks = filterCategory === "all" ? packsCatalog : packsCatalog.filter(p => (p.category || "Базові") === filterCategory);

  let filteredInventory = inventory.filter(item => {
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

  const duplicatesEarnedCoins = filteredInventory.reduce((sum, item) => {
    if (item.amount > 1) {
      const cardPrice = item.card.sellPrice ? Number(item.card.sellPrice) : sellPrice;
      return sum + (cardPrice * (item.amount - 1));
    }
    return sum;
  }, 0);

  const activeShowcase = showcases.find(s => s.id === selectedShowcaseId);

  useEffect(() => {
    if (activeShowcase) {
      setBuilderCards(activeShowcase.cardIds || []);
    } else {
      setBuilderCards([]);
    }
  }, [selectedShowcaseId, showcases]);

  const handleCreateShowcaseSubmit = (e) => {
    e.preventDefault();
    const name = e.target.showcaseName.value;
    createShowcase(name);
    e.target.reset();
  };

  const addCardToShowcase = (cardId) => {
    if (!activeShowcase) return;
    if (builderCards.length >= 10) return alert("Ліміт вітрини: 10 карток!");

    const ownedCount = inventory.find(i => i.card.id === cardId)?.amount || 0;
    const inShowcaseCount = builderCards.filter(id => id === cardId).length;

    if (inShowcaseCount < ownedCount) {
      const newCards = [...builderCards, cardId];
      setBuilderCards(newCards);
      saveShowcaseCards(activeShowcase.id, newCards);
    } else {
      alert("У вас більше немає копій цієї картки!");
    }
  };

  const removeCardFromShowcase = (indexToRemove) => {
    if (!activeShowcase) return;
    const newCards = [...builderCards];
    newCards.splice(indexToRemove, 1);
    setBuilderCards(newCards);
    saveShowcaseCards(activeShowcase.id, newCards);
  };

  const onDragStart = (e, cardId) => {
    e.dataTransfer.setData("cardId", cardId);
  };
  const onDragOver = (e) => {
    e.preventDefault();
  };
  const onDrop = (e) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData("cardId");
    if (cardId) addCardToShowcase(cardId);
  };

  const visibleCatalogTotal = cardsCatalog ? cardsCatalog.filter(card => {
    const pack = packsCatalog.find(p => p.id === card.packId);
    return pack && !pack.isHidden;
  }).length : catalogTotal;

  const visibleInventoryCount = inventory.filter(item => {
    const pack = packsCatalog.find(p => p.id === item.card.packId);
    return pack && !pack.isHidden;
  }).length;

  return (
    <div className="pb-10">
      <div className="flex bg-neutral-900 border border-neutral-800 rounded-xl p-1 max-w-sm mx-auto mb-6">
        <button onClick={() => setTab("cards")} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2 ${tab === "cards" ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"}`}>
          <LayoutGrid size={16} /> Всі Картки
        </button>
        <button onClick={() => setTab("showcases")} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2 ${tab === "showcases" ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"}`}>
          <Star size={16} /> Мої Вітрини
        </button>
      </div>

      {tab === "cards" ? (
        <div className="animate-in fade-in">
          <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 bg-neutral-900/80 p-5 rounded-2xl border border-neutral-800 shadow-lg">
            <h2 className="text-2xl font-black flex items-center gap-3 text-white uppercase tracking-wider shrink-0">
              <LayoutGrid className="text-yellow-500 w-8 h-8" /> Інвентар <span className="text-neutral-500 text-lg">({visibleInventoryCount}/{visibleCatalogTotal})</span>
            </h2>

            <div className="flex flex-wrap justify-center md:justify-end items-center gap-3 w-full">
              {duplicatesEarnedCoins > 0 && (
                <button
                  onClick={() => {
                    if (confirm(`Продати всі відображені дублікати та отримати ${duplicatesEarnedCoins} монет?`)) {
                      sellEveryDuplicate(filteredInventory);
                    }
                  }}
                  className="bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 text-white font-bold py-3 px-5 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center gap-2 whitespace-nowrap transition-transform transform hover:scale-105 order-last lg:order-first w-full lg:w-auto justify-center"
                  title="Залишити по 1 екземпляру кожної карти з поточного списку"
                >
                  <Zap size={18} /> Продати дублікати (+{duplicatesEarnedCoins} <Coins size={14} />)
                </button>
              )}

              <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setFilterPack("all"); }} className="bg-neutral-950 border border-neutral-700 text-sm font-medium rounded-xl px-4 py-3 w-full sm:w-auto focus:outline-none text-white cursor-pointer hover:bg-neutral-800 h-full">
                {categories.map(c => <option key={c} value={c}>{c === "all" ? "Всі Категорії" : c}</option>)}
              </select>

              <select value={filterPack} onChange={(e) => setFilterPack(e.target.value)} className="bg-neutral-950 border border-neutral-700 text-sm font-medium rounded-xl px-4 py-3 w-full sm:w-auto focus:outline-none text-white cursor-pointer hover:bg-neutral-800 h-full">
                <option value="all">Всі Паки</option>
                {relevantPacks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>

              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="bg-neutral-950 border border-purple-900/50 text-sm font-bold rounded-xl px-4 py-3 w-full sm:w-auto focus:outline-none text-purple-400 cursor-pointer hover:bg-neutral-800 h-full">
                <option value="rarity">За Рідкістю</option>
                <option value="pack">За Паком</option>
                <option value="amount">За Дублікатами</option>
                <option value="name">За Алфавітом</option>
              </select>
            </div>
          </div>

          {filteredInventory.length === 0 ? (
            <div className="text-center py-32 text-neutral-500 bg-neutral-900/30 rounded-3xl border-2 border-dashed border-neutral-800">
              <PackageOpen size={80} className="mx-auto mb-6 opacity-20" />
              <p className="text-xl font-medium mb-2 text-neutral-400">Картки не знайдено.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {filteredInventory.map((item, index) => {
                const style = getCardStyle(item.card.rarity, rarities);
                const effectClass = item.card.effect ? `effect-${item.card.effect}` : '';
                const currentSellPrice = item.card.sellPrice ? Number(item.card.sellPrice) : sellPrice;

                return (
                  <div key={item.card.id} className="flex flex-col items-center group cursor-pointer animate-in fade-in zoom-in-95 duration-500" style={{ animationDelay: `${index * 15}ms`, fillMode: "backwards" }}>
                    <div onClick={() => setViewingCard({ card: item.card, amount: item.amount })} className={`relative w-full aspect-[2/3] rounded-xl border-2 overflow-hidden bg-neutral-900 mb-3 transition-all duration-300 group-hover:-translate-y-2 group-hover:shadow-[0_15px_30px_rgba(0,0,0,0.6)] ${style.border}`}>
                      {Number(item.card.maxSupply) > 0 && (
                        <div className="absolute top-1 left-1 bg-black/90 text-white font-black text-[9px] px-1.5 py-0.5 rounded-sm z-10 border border-neutral-700 shadow-xl">
                          {item.card.maxSupply}
                        </div>
                      )}
                      {item.amount > 1 && (
                        <div className="absolute top-2 right-2 bg-neutral-950/90 backdrop-blur text-white font-black text-xs px-3 py-1.5 rounded-full z-10 border border-neutral-700 shadow-xl">
                          x{item.amount}
                        </div>
                      )}
                      <CardFrame frame={item.card.frame}>
                        <img src={item.card.image} alt={item.card.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                      </CardFrame>
                      {item.card.effect && <div className={`${item.card.effect} pointer-events-none z-10`} />}

                      {item.card.soundUrl && (
                        <button
                          onClick={(e) => { e.stopPropagation(); playCardSound(item.card.soundUrl, item.card.soundVolume); }}
                          className="absolute bottom-1 right-1 bg-black/80 text-white p-1.5 rounded-full hover:text-blue-400 z-30 transition-colors shadow-lg"
                          title="Відтворити звук"
                        >
                          <Volume2 size={12} />
                        </button>
                      )}
                    </div>
                    <div className="w-full flex flex-col items-center text-center px-1">
                      <div className={`text-[10px] font-black uppercase tracking-widest mb-1 ${style.text}`}>{item.card.rarity}</div>
                      <div className="font-bold text-sm leading-tight text-white mb-3 line-clamp-1 w-full group-hover:text-yellow-100 transition-colors" title={item.card.name}>{item.card.name}</div>

                      {item.amount > 1 ? (
                        <div className="w-full flex flex-col gap-1.5">
                          {Number(item.card.maxSupply) === 0 ? (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); sellDuplicate(item.card.id); }} className="w-full bg-neutral-800 hover:bg-neutral-700 text-xs py-2 rounded-lg text-neutral-200 font-bold transition-all hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]">
                                Продати (+{currentSellPrice} <Coins size={10} className="inline text-yellow-500" />)
                              </button>
                              <div className="flex gap-1.5 w-full">
                                {item.amount > 2 && (
                                  <button onClick={(e) => { e.stopPropagation(); sellAllDuplicates(item.card.id); }} className="flex-1 bg-neutral-800/80 hover:bg-red-900/50 text-[10px] py-1.5 rounded-lg text-neutral-400 font-bold transition-all border border-neutral-700 hover:border-red-900/50" title="Залишити лише 1">
                                    Всі (-1)
                                  </button>
                                )}
                                <button onClick={(e) => { e.stopPropagation(); setListingCard(item.card); }} className="flex-1 bg-blue-900/40 hover:bg-blue-600 text-[10px] py-1.5 rounded-lg text-blue-400 hover:text-white font-bold transition-all border border-blue-800/50">
                                  На Ринок
                                </button>
                              </div>
                            </>
                          ) : (
                            <button onClick={(e) => { e.stopPropagation(); setListingCard(item.card); }} className="w-full bg-blue-900/40 hover:bg-blue-600 text-[10px] py-2 rounded-lg text-blue-400 hover:text-white font-bold transition-all border border-blue-800/50">
                              На Ринок
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="w-full flex flex-col gap-1.5">
                          <div className="w-full text-xs py-1.5 text-neutral-500 font-medium">
                            Один екземпляр
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); setListingCard(item.card); }} className="w-full bg-blue-900/40 hover:bg-blue-600 text-xs py-2 rounded-lg text-blue-400 hover:text-white font-bold transition-all border border-blue-800/50">
                            Виставити на Ринок
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="animate-in fade-in">
          {!activeShowcase ? (
            <div>
              <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 mb-6 text-center">
                <h3 className="text-xl font-bold text-white mb-4"><Star className="inline text-yellow-500 mb-1" /> Створити нову вітрину</h3>
                <form onSubmit={handleCreateShowcaseSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                  <input type="text" name="showcaseName" placeholder="Назва вітрини..." required className="flex-1 bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-yellow-500 outline-none" />
                  <button type="submit" className="bg-yellow-600 hover:bg-yellow-500 text-yellow-950 font-bold py-3 px-6 rounded-xl transition-colors">Створити</button>
                </form>
                <p className="text-xs text-neutral-500 mt-3">Ліміт: 5 вітрин по 10 карток.</p>
              </div>

              {showcases.length === 0 ? (
                <div className="text-center py-20 text-neutral-500">У вас ще немає жодної вітрини.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {showcases.map(s => (
                    <div key={s.id} onClick={() => setSelectedShowcaseId(s.id)} className={`bg-neutral-900 border-2 rounded-2xl p-5 cursor-pointer transition-all hover:-translate-y-1 ${profile?.mainShowcaseId === s.id ? 'border-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.2)]' : 'border-neutral-800 hover:border-neutral-600'}`}>
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-black text-lg text-white truncate pr-2">{s.name}</h4>
                        {profile?.mainShowcaseId === s.id && <Star size={20} className="text-yellow-500 fill-yellow-500 shrink-0" />}
                      </div>
                      <div className="text-sm text-neutral-400 mb-4">{s.cardIds?.length || 0}/10 Карток</div>
                      <div className="flex -space-x-2 overflow-hidden h-12">
                        {(s.cardIds || []).slice(0, 5).map((cId, i) => {
                          const c = cardsCatalog.find(x => x.id === cId);
                          if (!c) return null;
                          return (
                            <div key={i} className="inline-block h-12 w-8 rounded border border-neutral-700 bg-neutral-950 overflow-hidden">
                              <CardFrame frame={c.frame}>
                                <img src={c.image} alt="m" className="w-full h-full object-cover" loading="lazy" />
                              </CardFrame>
                              {c.effect && <div className={`${c.effect} pointer-events-none z-10`} />}
                            </div>
                          );
                        })}
                        {(s.cardIds?.length || 0) > 5 && <div className="h-12 w-8 rounded border border-neutral-700 bg-neutral-900 flex items-center justify-center text-[10px] font-bold text-white z-10">+{s.cardIds.length - 5}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="animate-in slide-in-from-right-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 bg-neutral-900 p-5 rounded-2xl border border-neutral-800">
                <div>
                  <button onClick={() => setSelectedShowcaseId(null)} className="text-neutral-400 hover:text-white text-sm font-bold flex items-center gap-1 mb-2"><ArrowLeft size={16} /> До всіх вітрин</button>
                  <h2 className="text-2xl font-black text-white flex items-center gap-2">{activeShowcase.name} <span className="text-neutral-500 text-sm font-normal">({builderCards.length}/10)</span></h2>
                </div>
                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                  {profile?.mainShowcaseId !== activeShowcase.id ? (
                    <button onClick={() => setMainShowcase(activeShowcase.id)} className="bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-500 border border-yellow-600/50 px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-2 flex-1 md:flex-none justify-center">
                      <Star size={16} /> Зробити Головною
                    </button>
                  ) : (
                    <div className="bg-yellow-500 text-yellow-950 px-4 py-2 rounded-xl font-bold flex items-center gap-2 flex-1 md:flex-none justify-center">
                      <Star size={16} className="fill-yellow-950" /> Головна Вітрина
                    </div>
                  )}
                  <button onClick={() => { setSelectedShowcaseId(null); deleteShowcase(activeShowcase.id); }} className="bg-red-900/40 hover:bg-red-900 text-red-400 px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-2 flex-1 md:flex-none justify-center">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <p className="text-center text-neutral-400 text-sm mb-4">Натисніть на картку в інвентарі або перетягніть її сюди, щоб додати у вітрину.</p>

              {/* ЗОНА ВІТРИНИ (DROP ZONE) */}
              <div
                className={`bg-neutral-900/50 border-2 border-dashed ${builderCards.length < 10 ? 'border-purple-500/50' : 'border-neutral-700'} rounded-3xl p-6 min-h-[200px] mb-8 flex flex-wrap justify-center gap-4 transition-colors`}
                onDragOver={onDragOver}
                onDrop={onDrop}
              >
                {builderCards.map((cId, index) => {
                  const cData = cardsCatalog.find(c => c.id === cId);
                  if (!cData) return null;
                  const style = getCardStyle(cData.rarity, rarities);

                  return (
                    <div key={index} onClick={() => removeCardFromShowcase(index)} className="relative group cursor-pointer animate-in zoom-in-95">
                      <div className={`w-24 sm:w-32 aspect-[2/3] rounded-xl border-2 overflow-hidden bg-neutral-950 ${style.border}`}>
                        <CardFrame frame={cData.frame}>
                          <img src={cData.image} alt={cData.name} className="w-full h-full object-cover group-hover:opacity-50 transition-opacity" loading="lazy" />
                        </CardFrame>
                        {cData.effect && <div className={`${cData.effect} pointer-events-none z-10`} />}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="bg-red-600 text-white rounded-full p-2"><Trash2 size={20} /></div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Пусті слоти для візуалу */}
                {Array.from({ length: Math.max(0, 10 - builderCards.length) }).map((_, i) => (
                  <div key={`empty-${i}`} className="w-24 sm:w-32 aspect-[2/3] rounded-xl border-2 border-dashed border-neutral-800 bg-neutral-950/30 flex items-center justify-center opacity-50">
                    <GripHorizontal className="text-neutral-700" size={32} />
                  </div>
                ))}
              </div>

              {/* ІНВЕНТАР ДЛЯ ВИБОРУ */}
              <h3 className="text-lg font-bold text-white mb-4">Ваш Інвентар:</h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 opacity-90 hover:opacity-100 transition-opacity">
                {filteredInventory.map((item) => {
                  const style = getCardStyle(item.card.rarity, rarities);
                  // Розрахунок доступних
                  const inShowcaseCount = builderCards.filter(id => id === item.card.id).length;
                  const available = item.amount - inShowcaseCount;
                  const disabled = available <= 0 || builderCards.length >= 10;

                  return (
                    <div
                      key={item.card.id}
                      draggable={!disabled}
                      onDragStart={(e) => onDragStart(e, item.card.id)}
                      onClick={() => !disabled && addCardToShowcase(item.card.id)}
                      className={`relative aspect-[2/3] rounded-lg border-2 overflow-hidden bg-neutral-900 transition-all ${disabled ? 'opacity-30 grayscale cursor-not-allowed' : 'cursor-pointer hover:-translate-y-1 hover:border-purple-500'} ${style.border}`}
                    >
                      {available > 0 && (
                        <div className="absolute top-1 right-1 bg-black/80 text-white font-bold text-[9px] px-1.5 py-0.5 rounded-sm z-10 border border-neutral-700">
                          {available}
                        </div>
                      )}
                      <div className="w-full h-full relative group">
                        <CardFrame frame={item.card.frame}>
                          <img src={item.card.image} alt={item.card.name} className="w-full h-full object-cover pointer-events-none" loading="lazy" />
                        </CardFrame>
                        {item.card.effect && <div className={`${item.card.effect} pointer-events-none z-10`} />}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}