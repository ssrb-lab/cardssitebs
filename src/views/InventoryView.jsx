import React, { useState, useEffect } from 'react';
import {
  LayoutGrid,
  Star,
  Zap,
  Coins,
  PackageOpen,
  Trash2,
  GripHorizontal,
  ArrowLeft,
  Volume2,
  Lock,
  Unlock,
  Store,
  RefreshCw,
} from 'lucide-react';
import { getCardStyle, getCardWeight, playCardSound, parseGameStat } from '../utils/helpers';
import CardFrame from '../components/CardFrame';
import { PerkBadge } from '../components/PerkBadge';

// Мінімальна сила за рідкістю для старих карток без записаної сили
const RARITY_MIN_POWER = {
  Унікальна: 100,
  Легендарна: 50,
  Епічна: 25,
  Рідкісна: 10,
  Звичайна: 5,
};

// Повертає масив об'єктів { power, hp, isRecorded, statsIndex, inSafe } для картки.
// isRecorded=false: сила не записана в БД (мінімальний заповнювач).
function getEffectivePowers(item, packsCatalog = []) {
  const recorded = Array.isArray(item.gameStats) ? item.gameStats.map((s, idx) => ({ ...parseGameStat(s, item.card.rarity), statsIndex: idx, inSafe: !!s?.inSafe })) : [];
  const pack = packsCatalog.find((p) => p.id === item.card.packId);
  const isGameCard = (item.card.isGame || (pack && pack.isGame)) && !item.card.blockGame;
  if (!isGameCard) return [];
  const minPower = RARITY_MIN_POWER[item.card.rarity] || 5;
  const parsedDefault = parseGameStat(minPower, item.card.rarity);
  
  const powers = recorded.map((v) => ({ power: v.power, hp: v.hp, level: v.level || 1, isRecorded: true, statsIndex: v.statsIndex, inSafe: v.inSafe }));
  while (powers.length < item.amount) {
    powers.push({ power: parsedDefault.power, hp: parsedDefault.hp, level: 1, isRecorded: false, statsIndex: powers.length, inSafe: false });
  }
  return powers;
}

export default function InventoryView({
  inventory,
  rarities,
  sellDuplicate,
  sellAllDuplicates,
  sellEveryDuplicate,
  sellPrice,
  catalogTotal,
  setViewingCard,
  setListingCard,
  packsCatalog,
  showcases,
  createShowcase,
  deleteShowcase,
  setMainShowcase,
  saveShowcaseCards,
  profile,
  cardsCatalog,
  cardStats,
  toggleSafe,
  listDuplicatesOnMarket,
  showToast,
}) {
  const [tab, setTab] = useState('cards'); // "cards" or "showcases"
  const [showPackPicker, setShowPackPicker] = useState(true);

  // Фільтри для карток
  const [sortBy, setSortBy] = useState('rarity');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterPack, setFilterPack] = useState('all');

  // Стейт для конструктора вітрин
  const [selectedShowcaseId, setSelectedShowcaseId] = useState(null);
  const [builderCards, setBuilderCards] = useState([]);

  // Стейт для Сейфу
  const [isSafeOpen, setIsSafeOpen] = useState(false);
  const [safeTransferModal, setSafeTransferModal] = useState(null);

  // Стейт для продажу ігрових карток на ринок
  const [sellGameDupeModal, setSellGameDupeModal] = useState(null);
  const [sellGameDupeAmount, setSellGameDupeAmount] = useState(1);
  const [sellGameDupePrice, setSellGameDupePrice] = useState('');
  const [isSellGameDupes, setIsSellGameDupes] = useState(false);

  const categories = ['all', ...new Set(packsCatalog.map((p) => p.category || 'Базові'))];
  const relevantPacks =
    filterCategory === 'all'
      ? packsCatalog
      : packsCatalog.filter((p) => (p.category || 'Базові') === filterCategory);

  // Витягуємо картки з Сейфу
  const safeCards = [];
  const inventoryWithMeta = inventory.map((item) => {
    const pack = packsCatalog.find((p) => p.id === item.card.packId);
    const isGame = (item.card.isGame || (pack && pack.isGame)) && !item.card.blockGame;

    let safeCount = 0;
    let playableAmount = item.amount;

    if (isGame) {
      const powers = getEffectivePowers(item, packsCatalog);
      const safePowers = powers.filter((p) => p.inSafe);
      safeCount = safePowers.length;
      safePowers.forEach((sp) => {
        safeCards.push({
          card: item.card,
          isGameCard: true,
          power: sp.power,
          hp: sp.hp,
          statsIndex: sp.statsIndex,
          isRecorded: sp.isRecorded,
          count: 1,
        });
      });
      playableAmount = powers.filter((p) => !p.inSafe).length;
    } else {
      const statsArray = Array.isArray(item.gameStats)
        ? item.gameStats
        : typeof item.gameStats === 'string'
          ? JSON.parse(item.gameStats)
          : [];
      safeCount = statsArray.filter((s) => s && s.inSafe).length;
      if (safeCount > 0) {
        safeCards.push({ card: item.card, isGameCard: false, count: safeCount });
      }
      playableAmount = Math.max(0, item.amount - safeCount);
    }

    return {
      ...item,
      isGameCard: !!isGame,
      safeCount,
      totalAmount: item.amount,
      playableAmount,
    };
  });

  const inventoryMinusSafe = inventoryWithMeta
    .map((item) => ({ ...item, amount: item.playableAmount }))
    .filter((i) => i.amount > 0);

  let filteredInventory = inventoryMinusSafe.filter((item) => {
    const pack = packsCatalog.find((p) => p.id === item.card.packId);
    const cat = pack ? pack.category || 'Базові' : 'Базові';

    if (filterCategory !== 'all' && cat !== filterCategory) return false;
    if (filterPack !== 'all' && item.card.packId !== filterPack) return false;
    return true;
  });

  filteredInventory.sort((a, b) => {
    if (sortBy === 'power') {
      const getPower = (item) => {
        const powers = getEffectivePowers(item, packsCatalog) || [];
        return powers.length > 0 ? Math.max(...powers.map(p => p.power)) : 0;
      };
      return getPower(b) - getPower(a);
    }
    if (sortBy === 'rarity')
      return getCardWeight(a.card.rarity, rarities) - getCardWeight(b.card.rarity, rarities);
    if (sortBy === 'amount') return b.amount - a.amount;
    if (sortBy === 'name') return a.card.name.localeCompare(b.card.name);
    if (sortBy === 'pack') {
      const pA = packsCatalog.find((p) => p.id === a.card.packId)?.name || '';
      const pB = packsCatalog.find((p) => p.id === b.card.packId)?.name || '';
      return pA.localeCompare(pB);
    }
    return 0;
  });

  const duplicatesEarnedCoins = filteredInventory.reduce((sum, item) => {
    const meta = inventoryWithMeta.find((m) => m.card.id === item.card.id);
    const isGame = meta?.isGameCard || getEffectivePowers(item, packsCatalog).length > 0;

    // Ігрові картки з рівнем 10 можна продавати як звичайні
    if (isGame) {
      const powers = getEffectivePowers(item, packsCatalog);
      const bestLevel = powers.reduce((max, p) => Math.max(max, p.level || 1), 1);
      if (bestLevel < 10) return sum;
    }

    const totalAmount = meta?.totalAmount ?? item.amount;
    const safeCount = meta?.safeCount ?? 0;
    const defendingCount =
      profile?.defendingInstances?.filter((inst) => inst.cardId === item.card.id).length || 0;

    const totalDuplicates = Math.max(0, totalAmount - 1);
    const sellableDuplicates = Math.max(0, totalDuplicates - safeCount - defendingCount);
    const cardPrice = item.card.sellPrice ? Number(item.card.sellPrice) : sellPrice;
    return sum + cardPrice * sellableDuplicates;
  }, 0);

  const hasBlockedDuplicatesInView = filteredInventory.some((item) => {
    const meta = inventoryWithMeta.find((m) => m.card.id === item.card.id);
    const isGame = meta?.isGameCard || getEffectivePowers(item, packsCatalog).length > 0;

    const totalAmount = meta?.totalAmount ?? item.amount;
    if (totalAmount <= 1) return false;

    // Ігрові картки з рівнем < 10 — блокуємо продаж
    if (isGame) {
      const powers = getEffectivePowers(item, packsCatalog);
      const bestLevel = powers.reduce((max, p) => Math.max(max, p.level || 1), 1);
      if (bestLevel < 10) return true;
    }

    const safeCount = meta?.safeCount ?? 0;
    const defendingCount =
      profile?.defendingInstances?.filter((inst) => inst.cardId === item.card.id).length || 0;

    const totalDuplicates = Math.max(0, totalAmount - 1);
    const sellableDuplicates = Math.max(0, totalDuplicates - safeCount - defendingCount);
    return sellableDuplicates !== totalDuplicates;
  });

  const activeShowcase = showcases.find((s) => s.id === selectedShowcaseId);

  useEffect(() => {
    if (activeShowcase) {
      setBuilderCards(activeShowcase.cardIds || []);
    } else {
      setBuilderCards([]);
    }
  }, [selectedShowcaseId, showcases]);

  useEffect(() => {
    if (tab !== 'cards') return;
    setShowPackPicker(filterPack === 'all');
  }, [tab, filterPack]);

  const handleCreateShowcaseSubmit = (e) => {
    e.preventDefault();
    const name = e.target.showcaseName.value;
    createShowcase(name);
    e.target.reset();
  };

  const addCardToShowcase = (cardId) => {
    if (!activeShowcase) return;
    if (builderCards.length >= 10) return alert('Ліміт вітрини: 10 карток!');

    const ownedCount = inventory.find((i) => i.card.id === cardId)?.amount || 0;
    const inShowcaseCount = builderCards.filter((id) => id === cardId).length;

    if (inShowcaseCount < ownedCount) {
      const newCards = [...builderCards, cardId];
      setBuilderCards(newCards);
      saveShowcaseCards(activeShowcase.id, newCards);
    } else {
      alert('У вас більше немає копій цієї картки!');
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
    e.dataTransfer.setData('cardId', cardId);
  };
  const onDragOver = (e) => {
    e.preventDefault();
  };
  const onDrop = (e) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('cardId');
    if (cardId) addCardToShowcase(cardId);
  };

  const visibleCatalogTotal = cardsCatalog
    ? cardsCatalog.filter((card) => {
      const pack = packsCatalog.find((p) => p.id === card.packId);
      return pack && !pack.isHidden;
    }).length
    : catalogTotal;

  const visibleInventoryCount = inventory.filter((item) => {
    const pack = packsCatalog.find((p) => p.id === item.card.packId);
    return pack && !pack.isHidden;
  }).length;

  return (
    <div className="pb-10">
      <div className="flex bg-neutral-900 border border-neutral-800 rounded-xl p-1 max-w-md mx-auto mb-4 sm:mb-6 relative z-40">
        <button
          onClick={() => setTab('cards')}
          className={`flex-1 py-2 rounded-lg font-bold text-xs sm:text-sm transition-colors flex items-center justify-center gap-1 sm:gap-2 ${tab === 'cards' ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white'}`}
        >
          <LayoutGrid size={16} /> <span className="hidden xs:inline">Всі</span> Картки
        </button>
        <button
          onClick={() => setTab('showcases')}
          className={`flex-1 py-2 rounded-lg font-bold text-xs sm:text-sm transition-colors flex items-center justify-center gap-1 sm:gap-2 ${tab === 'showcases' ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white'}`}
        >
          <Star size={16} /> Вітрини
        </button>
        <button
          onClick={() => setIsSafeOpen(!isSafeOpen)}
          className={`px-2 sm:px-4 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-1 sm:gap-2 border-l border-neutral-700 ml-1 ${isSafeOpen ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50' : 'text-neutral-400 hover:text-yellow-400 hover:bg-neutral-800'}`}
          title="Сейф (захист від продажу)"
        >
          {isSafeOpen ? <Unlock size={18} /> : <Lock size={18} />}
        </button>
      </div>

      {tab === 'cards' ? (
        <div className="animate-in fade-in">
          <div className="flex flex-col md:flex-row justify-between items-center mb-4 sm:mb-8 gap-3 sm:gap-4 bg-neutral-900/80 p-3 sm:p-5 rounded-2xl border border-neutral-800 shadow-lg">
            <h2 className="text-xl sm:text-2xl font-black flex items-center gap-2 sm:gap-3 text-white uppercase tracking-wider shrink-0">
              <LayoutGrid className="text-yellow-500 w-6 h-6 sm:w-8 sm:h-8" /> Інвентар{' '}
              <span className="text-neutral-500 text-lg">
                ({visibleInventoryCount}/{visibleCatalogTotal})
              </span>
            </h2>

            <div className="flex flex-wrap justify-center md:justify-end items-center gap-3 w-full">
              {!showPackPicker && duplicatesEarnedCoins > 0 && !hasBlockedDuplicatesInView && (
                <button
                  onClick={() => {
                    if (
                      confirm(
                        `Продати всі відображені дублікати та отримати ${duplicatesEarnedCoins} монет?`
                      )
                    ) {
                      sellEveryDuplicate(filteredInventory);
                    }
                  }}
                  className="bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 text-white font-bold py-3 px-5 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center gap-2 whitespace-nowrap transition-transform transform hover:scale-105 order-last lg:order-first w-full lg:w-auto justify-center"
                  title="Залишити по 1 екземпляру кожної карти з поточного списку"
                >
                  <Zap size={18} /> Продати дублікати (+{duplicatesEarnedCoins} <Coins size={14} />)
                </button>
              )}

              {tab === 'cards' && (
                <button
                  onClick={() => {
                    setFilterCategory('all');
                    setFilterPack('all');
                    setShowPackPicker(true);
                  }}
                  className={`bg-neutral-950 border border-neutral-700 text-sm font-bold rounded-xl px-4 py-3 w-full sm:w-auto focus:outline-none text-white cursor-pointer hover:bg-neutral-800 h-full ${
                    showPackPicker ? 'hidden' : ''
                  }`}
                  title="Повернутись до вибору паку"
                >
                  <ArrowLeft size={16} className="inline mr-2" />
                  До паків
                </button>
              )}

              <select
                value={filterCategory}
                onChange={(e) => {
                  setFilterCategory(e.target.value);
                  setFilterPack('all');
                  setShowPackPicker(true);
                }}
                className="bg-neutral-950 border border-neutral-700 text-sm font-medium rounded-xl px-4 py-3 w-full sm:w-auto focus:outline-none text-white cursor-pointer hover:bg-neutral-800 h-full"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c === 'all' ? 'Всі Категорії' : c}
                  </option>
                ))}
              </select>

              {!showPackPicker && (
                <select
                  value={filterPack}
                  onChange={(e) => setFilterPack(e.target.value)}
                  className="bg-neutral-950 border border-neutral-700 text-sm font-medium rounded-xl px-4 py-3 w-full sm:w-auto focus:outline-none text-white cursor-pointer hover:bg-neutral-800 h-full"
                >
                  <option value="all">Всі Паки</option>
                  {relevantPacks.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}

              {!showPackPicker && (
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-neutral-950 border border-purple-900/50 text-sm font-bold rounded-xl px-4 py-3 w-full sm:w-auto focus:outline-none text-purple-400 cursor-pointer hover:bg-neutral-800 h-full"
                >
                  <option value="rarity">За Рідкістю</option>
                  <option value="power">За Силою</option>
                  <option value="pack">За Паком</option>
                  <option value="amount">За Дублікатами</option>
                  <option value="name">За Алфавітом</option>
                </select>
              )}
            </div>
          </div>

          {showPackPicker ? (
            <div className="animate-in fade-in">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-6">
                <div className="text-neutral-400 text-sm">
                  Оберіть пак, щоб подивитись картки всередині.
                </div>
                <button
                  onClick={() => {
                    setFilterCategory('all');
                    setFilterPack('all');
                    setShowPackPicker(false);
                  }}
                  className="bg-blue-900/40 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-800/50 px-4 py-3 rounded-xl font-bold transition-colors w-full sm:w-auto"
                >
                  Показати всі картки
                </button>
              </div>

              {relevantPacks.filter((p) => !p.isHidden).length === 0 ? (
                <div className="text-center py-24 text-neutral-500 bg-neutral-900/30 rounded-3xl border-2 border-dashed border-neutral-800">
                  <PackageOpen size={80} className="mx-auto mb-6 opacity-20" />
                  <p className="text-xl font-medium mb-2 text-neutral-400">Паків не знайдено.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {relevantPacks
                    .filter((p) => !p.isHidden)
                    .map((p) => {
                      const totalInPack = cardsCatalog
                        ? cardsCatalog.filter((c) => c.packId === p.id).length
                        : 0;
                      const ownedInPack = inventoryWithMeta.filter(
                        (i) => i.card?.packId === p.id && (i.totalAmount || 0) > 0
                      ).length;
                      const pct = totalInPack > 0 ? Math.round((ownedInPack / totalInPack) * 100) : 0;

                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            setFilterPack(p.id);
                            setShowPackPicker(false);
                          }}
                          className="group text-left bg-neutral-900 border border-neutral-800 hover:border-blue-600/50 rounded-2xl overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(0,0,0,0.55)] relative min-h-[360px]"
                        >
                          <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-blue-600/10 via-transparent to-purple-600/10" />

                          <div className="relative flex flex-col h-full">
                            <div className="h-40 sm:h-52 bg-neutral-950">
                              {p.image ? (
                                <img
                                  src={p.image}
                                  alt={p.name}
                                  className="w-full h-full object-cover opacity-85 group-hover:opacity-100 group-hover:scale-[1.02] transition-all duration-500"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-neutral-700">
                                  <PackageOpen size={42} className="opacity-50" />
                                </div>
                              )}
                              <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 via-black/20 to-transparent pointer-events-none" />
                              <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-neutral-950 via-neutral-950/30 to-transparent pointer-events-none" />

                              <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                                <div className="bg-black/60 backdrop-blur text-white text-[10px] px-2 py-1 rounded-lg border border-white/10 font-black uppercase tracking-widest">
                                  {p.category || 'Базові'}
                                </div>
                                {p.isPremiumOnly && (
                                  <div className="bg-fuchsia-900/60 backdrop-blur text-fuchsia-200 text-[10px] px-2 py-1 rounded-lg border border-fuchsia-500/20 font-black uppercase tracking-widest">
                                    Преміум
                                  </div>
                                )}
                                {p.isGame && (
                                  <div className="bg-green-900/60 backdrop-blur text-green-200 text-[10px] px-2 py-1 rounded-lg border border-green-500/20 font-black uppercase tracking-widest">
                                    Ігровий
                                  </div>
                                )}
                              </div>

                            </div>

                            <div className="p-3 sm:p-5 flex-1">
                              <div className="text-white font-black text-lg leading-tight line-clamp-2 min-h-[2.5rem] mb-3">
                                {p.name}
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <div>
                                  <div className="text-xs text-neutral-500 font-bold uppercase tracking-wider">
                                    Прогрес
                                  </div>
                                  <div className="text-sm text-neutral-200 font-black">
                                    {ownedInPack}/{totalInPack || '—'} карток
                                    {totalInPack > 0 && (
                                      <span className="text-neutral-500 font-bold"> • {pct}%</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 bg-neutral-950 border border-neutral-800 px-3 py-2 rounded-xl text-neutral-300 font-black text-xs">
                                  <PackageOpen size={16} className="text-purple-400" />
                                  Відкрити
                                </div>
                              </div>

                              <div className="mt-4">
                                <div className="h-2.5 bg-neutral-950 border border-neutral-800 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-gradient-to-r from-blue-600 to-purple-600 rounded-full transition-all duration-700"
                                    style={{ width: `${totalInPack > 0 ? (ownedInPack / totalInPack) * 100 : 0}%` }}
                                  />
                                </div>
                                {totalInPack > 0 && ownedInPack === totalInPack && (
                                  <div className="mt-2 text-[10px] font-black uppercase tracking-widest text-yellow-500">
                                    Зібрано повністю
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          ) : filteredInventory.length === 0 ? (
            <div className="text-center py-32 text-neutral-500 bg-neutral-900/30 rounded-3xl border-2 border-dashed border-neutral-800">
              <PackageOpen size={80} className="mx-auto mb-6 opacity-20" />
              <p className="text-xl font-medium mb-2 text-neutral-400">Картки не знайдено.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-6">
              {filteredInventory.map((item, index) => {
                const style = getCardStyle(item.card.rarity, rarities);
                const effectClass = item.card.effect ? `effect-${item.card.effect}` : '';
                const currentSellPrice = item.card.sellPrice
                  ? Number(item.card.sellPrice)
                  : sellPrice;

                return (() => {
                  const powers = getEffectivePowers(item, packsCatalog);
                  const isGameItem = powers.length > 0;
                  const powerValues = powers.map((p) => p.value);

                  const defendingCountForCard = profile?.defendingInstances?.filter(inst => inst.cardId === item.card.id).length || 0;
                  const basicDefendingDisabled = !isGameItem && (item.amount - 1 < defendingCountForCard);
                  const allBasicDefending = !isGameItem && item.amount <= defendingCountForCard;
                  const defendingStatsSet = new Set(
                    (profile?.defendingInstances || [])
                      .filter((inst) => inst.cardId === item.card.id)
                      .map((inst) => inst.statsIndex)
                  );
                  const sellableGameCount = isGameItem
                    ? powers.filter((p) => !p.inSafe && !defendingStatsSet.has(p.statsIndex)).length
                    : 0;
                  const canSellGameToMarket = isGameItem && sellableGameCount > 0;
                  const hasMaxLevel = isGameItem && powers.reduce((max, p) => Math.max(max, p.level || 1), 1) >= 10;

                  return (
                    <div
                      key={item.card.id}
                      className="flex flex-col items-center group cursor-pointer animate-in fade-in zoom-in-95 duration-500"
                      style={{ animationDelay: `${index * 15}ms`, fillMode: 'backwards' }}
                    >
                      <div
                      onClick={() => {
                        if (allBasicDefending) return;
                        if (isSafeOpen) {
                          setSafeTransferModal({ item, isEnteringSafe: true, maxAmount: item.amount });
                        } else {
                          setViewingCard({ card: item.card, amount: item.amount, instancePerks: Array.isArray(item.gameStats) ? (item.gameStats[0]?.perks || []) : [], emerald: Array.isArray(item.gameStats) ? (item.gameStats[0]?.emerald ?? null) : null });
                        }
                      }}
                      className={`relative w-full aspect-[2/3] rounded-xl border-2 overflow-hidden bg-neutral-900 mb-3 transition-all duration-300 group-hover:-translate-y-2 group-hover:shadow-[0_15px_30px_rgba(0,0,0,0.6)] ${style.border} ${effectClass} transform-gpu will-change-transform isolate z-0 ${allBasicDefending ? 'grayscale opacity-80' : ''}`}
                      >                        {allBasicDefending && (
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-red-900/90 text-white font-black text-[10px] px-2 py-1 rounded-full z-20 border border-red-700 shadow-xl text-center whitespace-nowrap">
                            Захищає Арену
                          </div>
                        )}
                        {safeCards.some(sc => sc.card.id === item.card.id) && (
                          <div className="absolute top-1 left-1 bg-yellow-900/90 text-yellow-500 font-black text-[10px] px-1.5 py-1.5 rounded-full z-10 border border-yellow-700 shadow-xl" title="Має екземпляри у сейфі">
                            <Lock size={12} strokeWidth={3} />
                          </div>
                        )}
                        {Number(item.card.maxSupply) > 0 && !safeCards.some(sc => sc.card.id === item.card.id) && (
                          <div className="absolute top-1 left-1 bg-black/90 text-white font-black text-[9px] px-1.5 py-0.5 rounded-sm z-10 border border-neutral-700 shadow-xl">
                            {item.card.maxSupply}
                          </div>
                        )}
                        {item.amount > 1 && (
                          <div className="absolute top-2 right-2 bg-neutral-950/90 backdrop-blur text-white font-black text-xs px-3 py-1.5 rounded-full z-10 border border-neutral-700 shadow-xl">
                            x{item.amount}
                          </div>
                        )}
                        <CardFrame frame={item.card.frame} effect={item.card.effect}>
                          <img
                            src={item.card.image}
                            alt={item.card.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 transform-gpu will-change-transform"
                            loading="lazy"
                          />
                        </CardFrame>
                        <PerkBadge perk={item.card.perk} />
                        

                        {item.card.soundUrl && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              playCardSound(item.card.soundUrl, item.card.soundVolume);
                            }}
                            className="absolute bottom-1 right-1 bg-black/80 text-white p-1.5 rounded-full hover:text-blue-400 z-30 transition-colors shadow-lg"
                            title="Відтворити звук"
                          >
                            <Volume2 size={12} />
                          </button>
                        )}
                      </div>
                      <div className="w-full flex flex-col items-center text-center px-1">
                        <div
                          className={`text-[10px] font-black uppercase tracking-widest mb-0.5 mt-1 ${style.text}`}
                        >
                          {item.card.rarity}
                        </div>
                        <div
                          className="font-bold text-sm leading-tight text-white mb-0.5 line-clamp-1 w-full group-hover:text-yellow-100 transition-colors"
                          title={item.card.name}
                        >
                          {item.card.name}
                        </div>

                        {isGameItem && (
                          <div className="flex flex-col items-center justify-center gap-0.5 mb-2">
                            {powers[0] && (() => {
                              // Show the main card (highest level instance)
                              const main = powers.reduce((best, p) => (p.level || 1) > (best.level || 1) ? p : best, powers[0]);
                              const isMax = (main.level || 1) >= 10;
                              return (
                                <>
                                  <div className={`inline-flex items-center gap-1 text-white font-black text-[9px] px-2 py-0.5 rounded-full mb-0.5 ${isMax ? 'bg-gradient-to-r from-yellow-600 to-amber-500 shadow-[0_0_8px_rgba(234,179,8,0.5)] border border-yellow-400/40' : 'bg-gradient-to-r from-blue-600 to-indigo-600 shadow-[0_0_6px_rgba(99,102,241,0.5)] border border-blue-400/30'}`}>
                                    {isMax ? '★ ' : ''}Lv.{main.level || 1}
                                  </div>
                                  <div className="flex items-center gap-1 text-xs font-bold text-yellow-500">
                                    <Zap size={12} strokeWidth={2.5} />
                                    {main.power}
                                  </div>
                                  <div className="flex items-center gap-1.5 text-xs font-bold text-red-500">
                                    ❤️ {main.hp}
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        )}

                        {item.amount > 1 ? (
                          <div className="w-full flex flex-col gap-1.5 mt-0.5">
                            {!isGameItem ? (
                              <>
                                <button
                                  disabled={basicDefendingDisabled}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    sellDuplicate(item.card.id);
                                  }}
                                  className={`w-full ${basicDefendingDisabled ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed' : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]'} text-xs py-2 rounded-lg font-bold transition-all`}
                                >
                                  Продати (+{currentSellPrice}{' '}
                                  <Coins size={10} className="inline text-yellow-500" />)
                                </button>
                                <div className="flex gap-1.5 w-full">
                                  {item.amount > 2 && (
                                    <button
                                      disabled={basicDefendingDisabled}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        sellAllDuplicates(item.card.id);
                                      }}
                                      className={`flex-1 ${basicDefendingDisabled ? 'bg-neutral-800/50 text-neutral-600 border-neutral-800 cursor-not-allowed' : 'bg-neutral-800/80 hover:bg-red-900/50 text-neutral-400 hover:border-red-900/50 border-neutral-700'} text-[10px] py-1.5 rounded-lg font-bold transition-all border`}
                                      title="Залишити лише 1"
                                    >
                                      Всі (-1)
                                    </button>
                                  )}
                                  <button
                                    disabled={allBasicDefending || item.card.isGame}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setListingCard(item.card);
                                    }}
                                    className={`flex-1 ${allBasicDefending || item.card.isGame ? 'bg-neutral-800/50 text-neutral-600 border-neutral-800 cursor-not-allowed hidden' : 'bg-blue-900/40 hover:bg-blue-600 text-blue-400 hover:text-white border-blue-800/50'} text-[10px] py-1.5 rounded-lg font-bold transition-all border`}
                                  >
                                    На Ринок
                                  </button>
                                </div>
                              </>
                            ) : (
                              <div className="flex flex-col gap-1.5 w-full">
                                {hasMaxLevel ? (
                                  <>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        sellDuplicate(item.card.id);
                                      }}
                                      className="w-full bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] text-xs py-2 rounded-lg font-bold transition-all"
                                    >
                                      Продати (+{currentSellPrice}{' '}
                                      <Coins size={10} className="inline text-yellow-500" />)
                                    </button>
                                    <div className="flex gap-1.5 w-full">
                                      {item.amount > 1 && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            sellEveryDuplicate([item]);
                                          }}
                                          className="flex-1 bg-neutral-800/80 hover:bg-red-900/50 text-neutral-400 hover:border-red-900/50 border-neutral-700 text-[10px] py-1.5 rounded-lg font-bold transition-all border"
                                          title="Залишити лише 1"
                                        >
                                          Всі (-1)
                                        </button>
                                      )}
                                      {canSellGameToMarket && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSellGameDupeModal({ item, maxSellable: Math.max(0, item.amount - defendingCountForCard - 1) });
                                            setSellGameDupeAmount(1);
                                            setSellGameDupePrice('');
                                          }}
                                          className="flex-1 bg-blue-900/40 hover:bg-blue-600 text-blue-400 hover:text-white border-blue-800/50 text-[10px] py-1.5 rounded-lg font-bold transition-all border"
                                        >
                                          На Ринок
                                        </button>
                                      )}
                                    </div>
                                  </>
                                ) : canSellGameToMarket ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const gameDupesAvailable = item.amount - defendingCountForCard;
                                      const maxGameSellable = Math.max(0, gameDupesAvailable - 1);
                                      if (maxGameSellable > 0) {
                                        setSellGameDupeModal({ item, maxSellable: maxGameSellable });
                                        setSellGameDupeAmount(1);
                                        setSellGameDupePrice('');
                                      } else {
                                        setListingCard(item.card);
                                      }
                                    }}
                                    className="w-full bg-blue-900/40 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-800/50 text-[10px] py-1.5 rounded-lg font-bold transition-all"
                                  >
                                    <Store size={10} className="inline mr-1" />На Ринок
                                  </button>
                                ) : null}
                              </div>
                            )}
                          </div>
                        ) : (
                          (isGameItem ? (
                            <div className="w-full flex flex-col gap-1.5 mt-0.5">
                              <button
                                disabled={!canSellGameToMarket}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setListingCard(item.card);
                                }}
                                className={`w-full ${
                                  !canSellGameToMarket
                                    ? 'bg-neutral-800/50 text-neutral-600 border-neutral-800 cursor-not-allowed'
                                    : 'bg-blue-900/40 hover:bg-blue-600 text-blue-400 hover:text-white border-blue-800/50'
                                } text-xs py-2 rounded-lg font-bold transition-all border`}
                                title={!canSellGameToMarket ? 'Не можна виставити (сейф або захист точки)' : 'Виставити на Ринок'}
                              >
                                Виставити на Ринок
                              </button>
                            </div>
                          ) : (
                            <div className="w-full flex flex-col gap-1.5 mt-0.5">
                              <button
                                disabled={allBasicDefending}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setListingCard(item.card);
                                }}
                                className={`w-full ${allBasicDefending ? 'bg-neutral-800/50 text-neutral-600 border-neutral-800 cursor-not-allowed' : 'bg-blue-900/40 hover:bg-blue-600 text-blue-400 hover:text-white border-blue-800/50'} text-xs py-2 rounded-lg font-bold transition-all border`}
                              >
                                Виставити на Ринок
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })();
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="animate-in fade-in">
          {!activeShowcase ? (
            <div>
              <div className="bg-neutral-900 p-3 sm:p-6 rounded-2xl border border-neutral-800 mb-6 text-center">
                <h3 className="text-xl font-bold text-white mb-4">
                  <Star className="inline text-yellow-500 mb-1" /> Створити нову вітрину
                </h3>
                <form
                  onSubmit={handleCreateShowcaseSubmit}
                  className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
                >
                  <input
                    type="text"
                    name="showcaseName"
                    placeholder="Назва вітрини..."
                    required
                    className="flex-1 bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-yellow-500 outline-none"
                  />
                  <button
                    type="submit"
                    className="btn-game-primary py-3 px-6"
                  >
                    Створити
                  </button>
                </form>
                <p className="text-xs text-neutral-500 mt-3">Ліміт: 5 вітрин по 10 карток.</p>
              </div>

              {showcases.length === 0 ? (
                <div className="text-center py-20 text-neutral-500">
                  У вас ще немає жодної вітрини.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {showcases.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => setSelectedShowcaseId(s.id)}
                      className={`bg-neutral-900 border-2 rounded-2xl p-3 sm:p-5 cursor-pointer transition-all hover:-translate-y-1 ${profile?.mainShowcaseId === s.id ? 'border-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.2)]' : 'border-neutral-800 hover:border-neutral-600'}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-black text-lg text-white truncate pr-2">{s.name}</h4>
                        {profile?.mainShowcaseId === s.id && (
                          <Star size={20} className="text-yellow-500 fill-yellow-500 shrink-0" />
                        )}
                      </div>
                      <div className="text-sm text-neutral-400 mb-4">
                        {s.cardIds?.length || 0}/10 Карток
                      </div>
                      <div className="flex -space-x-2 overflow-hidden h-12">
                        {(s.cardIds || []).slice(0, 5).map((cId, i) => {
                          const c = cardsCatalog.find((x) => x.id === cId);
                          if (!c) return null;
                          return (
                            <div
                              key={i}
                              className="inline-block h-12 w-8 rounded border border-neutral-700 bg-neutral-950 overflow-hidden isolate z-0"
                            >
                              <CardFrame frame={c.frame} effect={c.effect}>
                                <img
                                  src={c.image}
                                  alt="m"
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              </CardFrame>
                              <PerkBadge perk={c.perk} />
                            </div>
                          );
                        })}
                        {(s.cardIds?.length || 0) > 5 && (
                          <div className="h-12 w-8 rounded border border-neutral-700 bg-neutral-900 flex items-center justify-center text-[10px] font-bold text-white z-10">
                            +{s.cardIds.length - 5}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="animate-in slide-in-from-right-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-3 sm:gap-4 bg-neutral-900 p-3 sm:p-5 rounded-2xl border border-neutral-800">
                <div>
                  <button
                    onClick={() => setSelectedShowcaseId(null)}
                    className="text-neutral-400 hover:text-white text-sm font-bold flex items-center gap-1 mb-2"
                  >
                    <ArrowLeft size={16} /> До всіх вітрин
                  </button>
                  <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                    {activeShowcase.name}{' '}
                    <span className="text-neutral-500 text-sm font-normal">
                      ({builderCards.length}/10)
                    </span>
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                  {profile?.mainShowcaseId !== activeShowcase.id ? (
                    <button
                      onClick={() => setMainShowcase(activeShowcase.id)}
                      className="bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-500 border border-yellow-600/50 px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-2 flex-1 md:flex-none justify-center"
                    >
                      <Star size={16} /> Зробити Головною
                    </button>
                  ) : (
                    <div className="bg-yellow-500 text-yellow-950 px-4 py-2 rounded-xl font-bold flex items-center gap-2 flex-1 md:flex-none justify-center">
                      <Star size={16} className="fill-yellow-950" /> Головна Вітрина
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setSelectedShowcaseId(null);
                      deleteShowcase(activeShowcase.id);
                    }}
                    className="bg-red-900/40 hover:bg-red-900 text-red-400 px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-2 flex-1 md:flex-none justify-center"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <p className="text-center text-neutral-400 text-sm mb-4">
                Натисніть на картку в інвентарі або перетягніть її сюди, щоб додати у вітрину.
              </p>

              {/* ЗОНА ВІТРИНИ (DROP ZONE) */}
              <div
                className={`bg-neutral-900/50 border-2 border-dashed ${builderCards.length < 10 ? 'border-purple-500/50' : 'border-neutral-700'} rounded-3xl p-3 sm:p-6 min-h-[160px] sm:min-h-[200px] mb-4 sm:mb-8 flex flex-wrap justify-center gap-2 sm:gap-4 transition-colors`}
                onDragOver={onDragOver}
                onDrop={onDrop}
              >
                {builderCards.map((cId, index) => {
                  const cData = cardsCatalog.find((c) => c.id === cId);
                  if (!cData) return null;
                  const style = getCardStyle(cData.rarity, rarities);
                  const effectClass = cData.effect ? `effect-${cData.effect}` : '';

                  return (
                    <div
                      key={index}
                      onClick={() => removeCardFromShowcase(index)}
                      className="relative group cursor-pointer animate-in zoom-in-95"
                    >
                      <div
                        className={`w-16 xs:w-20 sm:w-32 aspect-[2/3] rounded-xl border-2 overflow-hidden bg-neutral-950 ${style.border} ${effectClass} isolate z-0`}
                      >
                        <CardFrame frame={cData.frame} effect={cData.effect}>
                          <img
                            src={cData.image}
                            alt={cData.name}
                            className="w-full h-full object-cover group-hover:opacity-50 transition-opacity"
                            loading="lazy"
                          />
                        </CardFrame>
                        <PerkBadge perk={cData.perk} />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="bg-red-600 text-white rounded-full p-2">
                            <Trash2 size={20} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Пусті слоти для візуалу */}
                {Array.from({ length: Math.max(0, 10 - builderCards.length) }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="w-16 xs:w-20 sm:w-32 aspect-[2/3] rounded-xl border-2 border-dashed border-neutral-800 bg-neutral-950/30 flex items-center justify-center opacity-50"
                  >
                    <GripHorizontal className="text-neutral-700" size={32} />
                  </div>
                ))}
              </div>

              {/* ІНВЕНТАР ДЛЯ ВИБОРУ */}
              <h3 className="text-lg font-bold text-white mb-4">Ваш Інвентар:</h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 sm:gap-3 opacity-90 hover:opacity-100 transition-opacity">
                {filteredInventory.map((item) => {
                  const style = getCardStyle(item.card.rarity, rarities);
                  // Розрахунок доступних
                  const inShowcaseCount = builderCards.filter((id) => id === item.card.id).length;
                  const available = item.amount - inShowcaseCount;
                  const disabled = available <= 0 || builderCards.length >= 10;

                  return (
                    <div
                      key={item.card.id}
                      draggable={!disabled}
                      onDragStart={(e) => onDragStart(e, item.card.id)}
                      onClick={() => !disabled && addCardToShowcase(item.card.id)}
                      className={`relative aspect-[2/3] rounded-lg border-2 overflow-hidden bg-neutral-900 transition-all isolate z-0 ${disabled ? 'opacity-30 grayscale cursor-not-allowed' : 'cursor-pointer hover:-translate-y-1 hover:border-purple-500'} ${style.border}`}
                    >
                      {available > 0 && (
                        <div className="absolute top-1 right-1 bg-black/80 text-white font-bold text-[9px] px-1.5 py-0.5 rounded-sm z-10 border border-neutral-700">
                          {available}
                        </div>
                      )}
                      <div className="w-full h-full relative group">
                        <CardFrame frame={item.card.frame} effect={item.card.effect}>
                          <img
                            src={item.card.image}
                            alt={item.card.name}
                            className="w-full h-full object-cover pointer-events-none"
                            loading="lazy"
                          />
                        </CardFrame>
                        <PerkBadge perk={item.card.perk} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* МОДАЛКА ПЕРЕКАЗУ В СЕЙФ/З СЕЙФУ */}
      {safeTransferModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-sm p-4 sm:p-6 shadow-2xl relative">
            <h3 className="text-xl font-black text-white mb-4 flex items-center gap-2">
              {safeTransferModal.isEnteringSafe ? <Lock className="text-yellow-500" /> : <Unlock className="text-yellow-500" />}
              {safeTransferModal.isEnteringSafe ? 'Сховати в Сейф' : 'Дістати з Сейфу'}
            </h3>

            <form onSubmit={(e) => {
              e.preventDefault();
              const amt = parseInt(e.target.amount.value, 10);
              if (amt > 0 && amt <= safeTransferModal.maxAmount) {
                toggleSafe(safeTransferModal.item.card.id, null, amt, safeTransferModal.isEnteringSafe);
                setSafeTransferModal(null);
              }
            }}>
              <p className="text-sm text-neutral-400 mb-4">
                Скільки карток "{safeTransferModal.item.card.name}" {safeTransferModal.isEnteringSafe ? 'покласти в сейф' : 'повернути в інвентар'}?
                (Доступно: {safeTransferModal.maxAmount})
              </p>
              <input
                type="number"
                name="amount"
                min="1"
                max={safeTransferModal.maxAmount}
                defaultValue="1"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white font-bold mb-4 focus:outline-none focus:border-yellow-500"
              />
              <div className="flex gap-3">
                <button type="button" onClick={() => setSafeTransferModal(null)} className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-white font-bold py-3 rounded-xl transition-colors">
                  Скасувати
                </button>
                <button type="submit" className="flex-1 btn-game-primary py-3">
                  Підтвердити
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DRAWER СЕЙФУ */}
      {isSafeOpen && (
        <div className="fixed top-0 bottom-0 left-0 z-50 pointer-events-none">
          {/* bg-black/60 pointer-events-auto removed to allow clicking cards */}
          <div className="relative w-72 sm:w-80 max-w-[85vw] h-full bg-neutral-900 border-r border-neutral-700 shadow-[20px_0_50px_rgba(0,0,0,0.8)] flex flex-col pt-[72px] animate-in slide-in-from-left duration-300 pointer-events-auto">
            <div className="px-3 sm:px-6 py-3 sm:py-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/50 backdrop-blur sticky top-0 z-20">
              <h2 className="text-lg sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-br from-yellow-300 to-yellow-600 flex items-center gap-2">
                <Lock className="text-yellow-500" strokeWidth={2.5} /> Сейф
              </h2>
              <button onClick={() => setIsSafeOpen(false)} className="text-neutral-500 hover:text-white p-2">✕</button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto">
              <p className="text-xs text-neutral-400 mb-4 px-1 leading-relaxed">
                Захищені картки неможливо випадково продати чи виставити на ринок. Натисніть на картку в інвентарі, щоб додати її сюди.
              </p>

              {safeCards.length === 0 ? (
                <div className="text-center py-10 opacity-50">
                  <Lock size={40} className="mx-auto mb-3 text-neutral-600" />
                  <p className="text-sm">Сейф порожній</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {safeCards.map((pSafe, idx) => {
                    const style = getCardStyle(pSafe.card.rarity, rarities);
                    const effectClass = pSafe.card.effect ? `effect-${pSafe.card.effect}` : '';
                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          if (!pSafe.isGameCard) {
                            if (pSafe.count > 1) {
                              setSafeTransferModal({ item: { card: pSafe.card }, isEnteringSafe: false, maxAmount: pSafe.count });
                            } else {
                              toggleSafe(pSafe.card.id, null, 1, false);
                            }
                          } else {
                            toggleSafe(pSafe.card.id, pSafe.statsIndex, 1, false);
                          }
                        }}
                        className="relative cursor-pointer group hover:scale-105 transition-transform"
                      >
                        <div className={`relative w-full aspect-[2/3] rounded-lg border-2 bg-neutral-950 overflow-hidden ${style.border} ${effectClass} isolate z-0`}>
                          {pSafe.count > 1 && (
                            <div className="absolute top-1 right-1 bg-black/80 text-white font-black text-[9px] px-1 py-0.5 rounded-sm z-10 border border-neutral-700">
                              x{pSafe.count}
                            </div>
                          )}
                          <CardFrame frame={pSafe.card.frame} effect={pSafe.card.effect}>
                            <img src={pSafe.card.image} alt="card" className="w-full h-full object-cover" />
                          </CardFrame>
                        </div>
                        {pSafe.isGameCard && (
                          <div className="mt-1 flex justify-center gap-2 text-[10px] bg-neutral-900 rounded p-1">
                            <span className="text-yellow-500 font-bold flex items-center gap-0.5"><Zap size={8} />{pSafe.power}</span>
                            <span className="text-red-500 font-bold">❤️{pSafe.hp}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Модаль продажу ігрових карток-дублікатів на ринок */}
      {sellGameDupeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => !isSellGameDupes && setSellGameDupeModal(null)}
        >
          <div
            className="bg-neutral-900 border border-neutral-700 rounded-2xl p-4 sm:p-6 w-full max-w-sm mx-3 sm:mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white font-black text-lg mb-1 flex items-center gap-2">
              <Store size={18} className="text-blue-400" />
              Продати на Ринок
            </h3>
            <p className="text-neutral-400 text-sm mb-4 font-bold">{sellGameDupeModal.item.card.name}</p>
            <p className="text-neutral-500 text-xs mb-4 leading-relaxed">
              Дублікати продаються без характеристик. Покупець отримає картку з базовими параметрами.
            </p>
            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <label className="text-[10px] text-neutral-500 uppercase font-bold block mb-1">
                  Кількість (макс {sellGameDupeModal.maxSellable})
                </label>
                <input
                  type="number"
                  min={1}
                  max={sellGameDupeModal.maxSellable}
                  value={sellGameDupeAmount}
                  onChange={(e) =>
                    setSellGameDupeAmount(
                      Math.min(sellGameDupeModal.maxSellable, Math.max(1, Number(e.target.value) || 1))
                    )
                  }
                  className="w-full bg-black/40 border border-neutral-700 rounded-xl px-3 py-2 text-white text-sm font-bold focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-neutral-500 uppercase font-bold block mb-1">
                  Ціна (разом)
                </label>
                <input
                  type="number"
                  min={1}
                  placeholder="монет"
                  value={sellGameDupePrice}
                  onChange={(e) => setSellGameDupePrice(e.target.value)}
                  className="w-full bg-black/40 border border-neutral-700 rounded-xl px-3 py-2 text-white text-sm font-bold focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            {sellGameDupePrice && Number(sellGameDupePrice) > 0 && sellGameDupeAmount > 0 && (
              <div className="text-[10px] text-neutral-500 mb-4">
                По {Math.round(Number(sellGameDupePrice) / sellGameDupeAmount)} монет за дублікат
              </div>
            )}
            <div className="flex gap-2">
              <button
                disabled={isSellGameDupes}
                onClick={() => setSellGameDupeModal(null)}
                className="flex-1 py-2.5 text-sm font-bold bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-400 rounded-xl transition-colors"
              >
                Скасувати
              </button>
              <button
                disabled={isSellGameDupes || !sellGameDupePrice || Number(sellGameDupePrice) < 1}
                onClick={async () => {
                  const price = Number(sellGameDupePrice);
                  const amt = Number(sellGameDupeAmount);
                  if (!price || price < 1) {
                    if (showToast) showToast('Введіть коректну ціну.', 'error');
                    return;
                  }
                  setIsSellGameDupes(true);
                  try {
                    await listDuplicatesOnMarket(sellGameDupeModal.item.card.id, amt, price);
                    setSellGameDupeModal(null);
                  } finally {
                    setIsSellGameDupes(false);
                  }
                }}
                className="flex-1 py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex items-center justify-center gap-1.5"
              >
                {isSellGameDupes ? <RefreshCw size={13} className="animate-spin" /> : 'Виставити'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
