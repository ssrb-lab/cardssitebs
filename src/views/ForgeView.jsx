import React, { useState, useEffect, useMemo } from 'react';
import { Hammer, Zap, ArrowUpCircle, Sparkles, RefreshCw, AlertTriangle, Layers, Gem } from 'lucide-react';
import { getCardStyle, playCardSound, getCardWeight, parseGameStat } from '../utils/helpers';
import CardFrame from '../components/CardFrame';
import { upgradeCardRequest } from '../config/api';

const FORGE_CRYSTAL_COSTS = {
  Звичайна: 5,
  Рідкісна: 10,
  Епічна: 25,
  Легендарна: 50,
  Унікальна: 100,
};

export default function ForgeView({
  inventory,
  rarities,
  profile,
  showToast,
  getToken,
  reloadProfile,
}) {
  const [selectedMain, setSelectedMain] = useState(null);
  const [isForging, setIsForging] = useState(false);
  const [sortBy, setSortBy] = useState('rarity');

  // Витягуємо всі ігрові картки з інвентарю
  const allGameCards = useMemo(() => {
    const cards = [];
    inventory.forEach((item) => {
      if (!item.gameStats || !Array.isArray(item.gameStats) || item.gameStats.length === 0) {
        return;
      }
      item.gameStats.forEach((statVal, index) => {
        if (statVal && statVal.inSafe) return;
        const parsed = parseGameStat(statVal, item.card.rarity);
        cards.push({
          card: item.card,
          power: parsed.power,
          hp: parsed.hp,
          statsIndex: index,
          uniqueKey: `${item.card.id}-${index}-${parsed.power}-${parsed.hp}`,
        });
      });
    });

    cards.sort((a, b) => {
      if (sortBy === 'power') return b.power - a.power;
      if (sortBy === 'rarity')
        return getCardWeight(a.card.rarity, rarities) - getCardWeight(b.card.rarity, rarities);
      if (sortBy === 'name') return a.card.name.localeCompare(b.card.name);
      return 0;
    });

    return cards;
  }, [inventory, sortBy, rarities]);

  // Знаходимо матеріал для обраної головної картки
  const materialCard = useMemo(() => {
    if (!selectedMain) return null;
    // Шукаємо іншу картку з таким же ID, але НЕ ту саму (по унікальному ключу)
    // Обираємо найслабшу за сумою статів
    const duplicates = allGameCards.filter(
      (c) => c.card.id === selectedMain.card.id && c.uniqueKey !== selectedMain.uniqueKey
    );
    if (duplicates.length === 0) return null;

    return duplicates.sort((a, b) => (a.power + a.hp) - (b.power + b.hp))[0];
  }, [selectedMain, allGameCards]);

  useEffect(() => {
    if (selectedMain && !isForging) {
      const stillOwns = allGameCards.some((c) => c.uniqueKey === selectedMain.uniqueKey);
      if (!stillOwns) setSelectedMain(null);
    }
  }, [allGameCards, selectedMain, isForging]);

  const handleUpgrade = async () => {
    if (!selectedMain || !materialCard) return;

    const cost = FORGE_CRYSTAL_COSTS[selectedMain.card.rarity] || 5;
    if (profile.crystals < cost) {
      return showToast('Недостатньо кристалів!', 'error');
    }

    setIsForging(true);
    playCardSound('/sounds/anvil_strike.mp3', 0.5);

    try {
      const data = await upgradeCardRequest(
        getToken(),
        selectedMain.card.id,
        selectedMain.power,
        selectedMain.hp,
        materialCard.power,
        materialCard.hp
      );

      // Очікуємо трохи для драматизму
      setTimeout(() => {
        reloadProfile();
        setIsForging(false);

        if (data.isSuccess) {
          showToast(`Успіх! Картку покращено: ⚡${data.newPower} ❤️${data.newHp}`, 'success');
          playCardSound('/sounds/upgrade_success.mp3', 0.6);
          setSelectedMain(null); // Скидаємо вибір після успіху
        } else {
          showToast(`Невдача! Обидві картки було знищено...`, 'error');
          playCardSound('/sounds/break.mp3', 0.6);
          setSelectedMain(null);
        }
      }, 2000);
    } catch (e) {
      showToast(e.message || 'Помилка кування.', 'error');
      setIsForging(false);
    }
  };

  const crystalCost = selectedMain ? FORGE_CRYSTAL_COSTS[selectedMain.card.rarity] || 5 : 0;

  return (
    <div className="pb-10 pt-4 max-w-6xl mx-auto w-full px-4 animate-in fade-in zoom-in-95">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 lg:p-10 mb-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-gradient-to-b from-orange-600/5 to-transparent pointer-events-none" />

        <div className="flex flex-col lg:flex-row gap-12 items-center relative z-10">
          {/* Слот для головної картки та матеріалу */}
          <div className="flex flex-col items-center gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-orange-500">Головна</span>
            {selectedMain ? (
              <div className={`w-40 aspect-[2/3] transition-all duration-500 rounded-xl overflow-hidden shadow-2xl ${isForging ? 'animate-pulse scale-105 blur-[1px]' : ''}`}>        
                 <CardUI item={selectedMain} rarities={rarities} />
              </div>
            ) : (
              <div className="w-40 aspect-[2/3] border-2 border-dashed border-neutral-800 rounded-xl flex flex-col items-center justify-center bg-black/20 text-neutral-600">
                <Hammer size={32} className="mb-2 opacity-20" />
                <span className="text-[10px] font-bold uppercase">Оберіть карту</span>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center justify-center text-neutral-700">
            <Sparkles size={24} className={isForging ? 'animate-spin text-orange-500' : ''} />
            <div className="h-12 w-px bg-neutral-800 my-2" />
          </div>

          <div className="flex flex-col items-center gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Матеріал</span>
            {materialCard ? (
              <div className={`w-32 aspect-[2/3] opacity-60 grayscale transition-all duration-500 rounded-xl overflow-hidden ${isForging ? 'animate-ping scale-75 opacity-0' : ''}`}>
                 <CardUI item={materialCard} rarities={rarities} />
              </div>
            ) : (
              <div className="w-32 aspect-[2/3] border-2 border-dashed border-neutral-800 rounded-xl flex flex-col items-center justify-center bg-black/20 text-neutral-600">
                <Layers size={24} className="mb-2 opacity-20" />
                <span className="text-[10px] font-bold uppercase text-center px-2">Потрібен дублікат</span>
              </div>
            )}
          </div>

          {/* Інфо та Кнопка */}
          <div className="w-full lg:w-1/2 space-y-6">
            <div>
              <h1 className="text-4xl font-black text-white uppercase tracking-tight flex items-center gap-4 mb-2">
                <Hammer className="text-orange-500" size={36} />
                Королівська Кузня
              </h1>
              <p className="text-neutral-400 text-sm font-medium leading-relaxed">
                Пожертвуйте дублікатом картки, щоб покращити головну на <span className="text-green-400 font-bold">+15% до статів</span>. 
                Це ризикована справа, але справжні герої не бояться вогню.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="bg-black/40 border border-neutral-800 p-4 rounded-2xl">
                  <span className="text-[10px] font-black text-neutral-500 uppercase block mb-1">Шанс успіху</span>
                  <span className="text-2xl font-black text-green-500">75%</span>
               </div>
               <div className="bg-black/40 border border-neutral-800 p-4 rounded-2xl flex flex-col justify-center">
                  <span className="text-[10px] font-black text-neutral-500 uppercase block mb-1">Вартість</span>
                  <div className="flex items-center gap-2">
                    <Gem size={18} className="text-cyan-400" />
                    <span className={`text-2xl font-black ${profile?.crystals < crystalCost ? 'text-red-500' : 'text-cyan-400'}`}>
                      {crystalCost}
                    </span>
                  </div>
               </div>
            </div>

            <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-start gap-3">
               <AlertTriangle className="text-red-500 shrink-0" size={20} />
               <p className="text-[11px] text-red-400 leading-tight">
                 <span className="font-bold uppercase block mb-1">Небезпека:</span>
                 У разі невдачі (20%) <span className="font-bold">ОБИДВІ КАРТКИ</span> будуть безповоротно знищені у вогні кузні!
               </p>
            </div>

            <button
              onClick={handleUpgrade}
              disabled={!selectedMain || !materialCard || isForging || profile?.crystals < crystalCost}
              className="w-full h-16 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 disabled:from-neutral-800 disabled:to-neutral-900 disabled:text-neutral-600 disabled:border-neutral-800 text-white font-black text-xl rounded-2xl border-b-4 border-orange-800 active:border-b-0 active:translate-y-1 transition-all flex justify-center items-center gap-3 shadow-[0_10px_30px_rgba(234,88,12,0.3)] disabled:shadow-none"
            >
              {isForging ? (
                <>
                  <RefreshCw className="animate-spin" size={24} />
                  ВИКУВАЄТЬСЯ...
                </>
              ) : (
                <>
                  <Hammer size={24} />
                  ПОЧАТИ КУВАННЯ
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Список карток */}
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <h2 className="text-2xl font-black text-white flex items-center gap-2">
          Ваш Арсенал <span className="text-neutral-600">({allGameCards.length})</span>
        </h2>
        <div className="flex gap-2">
           <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-neutral-900 border border-neutral-800 text-xs font-bold rounded-xl px-4 py-2 text-neutral-400 focus:outline-none focus:border-orange-500 transition-colors"
          >
            <option value="rarity">За Рідкістю</option>
            <option value="power">За Силою</option>
            <option value="name">За Алфавітом</option>
          </select>
        </div>
      </div>

      {allGameCards.length === 0 ? (
        <div className="text-center py-20 bg-neutral-900/20 rounded-3xl border-2 border-dashed border-neutral-800">
          <ArrowUpCircle size={48} className="mx-auto mb-4 opacity-10" />
          <p className="text-neutral-500 font-bold uppercase tracking-widest">У вас немає ігрових карток</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {allGameCards.map((item) => {
            const isSelected = selectedMain?.uniqueKey === item.uniqueKey;
            const isDefending = profile?.defendingInstances?.some(inst => inst.cardId === item.card.id && inst.statsIndex === item.statsIndex);
            // Перевірка чи є дублікат для цієї картки (не враховуючи її саму)
            const hasDuplicate = allGameCards.some(c => c.card.id === item.card.id && c.uniqueKey !== item.uniqueKey);

            return (
              <div
                key={item.uniqueKey}
                onClick={() => !isForging && !isDefending && setSelectedMain(item)}
                className={`flex flex-col group cursor-pointer transition-all duration-300 ${isSelected ? '-translate-y-2' : 'hover:-translate-y-1'} ${isDefending ? 'grayscale opacity-40 cursor-not-allowed' : ''}`}
              >
                <div className={`relative aspect-[2/3] rounded-lg overflow-hidden border-2 transition-all ${isSelected ? 'border-orange-500 shadow-[0_0_15px_rgba(234,88,12,0.5)]' : 'border-neutral-800'}`}>
                   <CardUI item={item} rarities={rarities} />
                   {isDefending && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <span className="text-[8px] font-black text-white uppercase bg-red-600 px-1 py-0.5 rounded">Арена</span>
                      </div>
                   )}
                   {!hasDuplicate && !isDefending && (
                      <div className="absolute top-1 right-1 bg-black/80 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                         <Layers size={10} className="text-neutral-500" />
                      </div>
                   )}
                </div>
                <div className="mt-2 text-center">
                   <div className="text-[10px] font-bold text-white truncate px-1">{item.card.name}</div>
                   <div className="flex justify-center gap-1 mt-1">
                      <div className="flex items-center text-[9px] font-black text-yellow-500 bg-black/40 px-1 rounded"><Zap size={8} /> {item.power}</div>
                      <div className="text-[9px] font-black text-red-400 bg-black/40 px-1 rounded">❤️ {item.hp}</div>
                   </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Міні-компонент для рендеру самої картки
function CardUI({ item, rarities }) {
  const style = getCardStyle(item.card.rarity, rarities);
  const effectClass = item.card.effect ? `effect-${item.card.effect}` : '';
  return (
    <div className={`relative w-full h-full bg-black rounded-[inherit] overflow-hidden isolate ${effectClass}`}>
       <CardFrame frame={item.card.frame} effect={item.card.effect}>
          <img
            src={item.card.image}
            alt={item.card.name}
            className="w-full h-full object-cover rounded-[inherit]"
            loading="lazy"
          />
        </CardFrame>
        {/* Рарність текстом знизу з примусовим заокругленням нижніх кутів */}
        <div className={`absolute bottom-0 left-0 right-0 py-1 text-[7px] font-black uppercase text-center bg-black/80 backdrop-blur-sm ${style.text} border-t border-white/5`}>
           {item.card.rarity}
        </div>
    </div>
  );
}
