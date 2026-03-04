import React, { useState, useEffect, useMemo } from 'react';
import { Hammer, Zap, Coins, ArrowUpCircle, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { getCardStyle, playCardSound, getCardWeight } from '../utils/helpers';
import CardFrame from '../components/CardFrame';
import { rerollPowerRequest } from '../config/api';

const FORGE_COSTS = {
  Звичайна: 100,
  Рідкісна: 300,
  Епічна: 1000,
  Легендарна: 5000,
  Унікальна: 15000,
};

const RARITY_POWER_RANGES = {
  Звичайна: '5–50',
  Рідкісна: '10–80',
  Епічна: '25–100',
  Легендарна: '50–125',
  Унікальна: '100–150',
};

export default function ForgeView({
  inventory,
  rarities,
  profile,
  showToast,
  getToken,
  reloadProfile,
}) {
  const [selectedCard, setSelectedCard] = useState(null);
  const [isForging, setIsForging] = useState(false);
  const [rollingPower, setRollingPower] = useState(null);
  const [sortBy, setSortBy] = useState('rarity');

  // Витягуємо всі ігрові картки з інвентарю по одній штуці
  const forgeableCards = useMemo(() => {
    const cards = [];
    inventory.forEach((item) => {
      if (!item.gameStats || !Array.isArray(item.gameStats) || item.gameStats.length === 0) {
        return;
      }
      item.gameStats.forEach((statVal, index) => {
        cards.push({
          card: item.card,
          power: Number(statVal),
          uniqueKey: `${item.card.id}-${index}-${statVal}`,
        });
      });
    });

    // Сортування
    cards.sort((a, b) => {
      if (sortBy === 'power') return b.power - a.power;
      if (sortBy === 'rarity')
        return getCardWeight(a.card.rarity, rarities) - getCardWeight(b.card.rarity, rarities);
      if (sortBy === 'name') return a.card.name.localeCompare(b.card.name);
      return 0;
    });

    return cards;
  }, [inventory, sortBy, rarities]);

  // Перевіряємо, чи користувач досі має хоча б якусь копію цієї картки
  // (на випадок, якщо він її повністю продав або втратив)
  useEffect(() => {
    if (selectedCard && !isForging) {
      const ownsAnyCopy = forgeableCards.some((c) => c.card.id === selectedCard.card.id);
      if (!ownsAnyCopy) {
        setSelectedCard(null);
      }
    }
  }, [forgeableCards, selectedCard, isForging]);

  const handleReroll = async () => {
    if (!selectedCard) return;

    const cost = FORGE_COSTS[selectedCard.card.rarity] || 50;
    if (profile.coins < cost) {
      return showToast('Недостатньо монет для кування!', 'error');
    }

    setIsForging(true);
    playCardSound('/sounds/anvil_strike.mp3', 0.5); // Optional: add an anvil sound if available

    try {
      const data = await rerollPowerRequest(getToken(), selectedCard.card.id, selectedCard.power);

      // Оновлюємо дані одразу після успішної транзакції (знімаються монети)
      reloadProfile();

      // Анімація прокрутки цифр
      let rolls = 0;
      const rollInterval = setInterval(() => {
        setRollingPower(Math.floor(Math.random() * 100) + 10);
        rolls++;
        if (rolls > 30) {
          clearInterval(rollInterval);
          setRollingPower(data.newPower);
          setSelectedCard({ ...selectedCard, power: data.newPower });

          // Видалено довгу затримку - одразу фіксуємо результат
          setIsForging(false);
          showToast(`Успішно сковано! Нова сила: ${data.newPower}`, 'success');
        }
      }, 40);
    } catch (e) {
      showToast(e.message || 'Помилка кування.', 'error');
      setIsForging(false);
      setRollingPower(null);
    }
  };

  const currentCost = selectedCard ? FORGE_COSTS[selectedCard.card.rarity] || 50 : 0;

  return (
    <div className="pb-10 pt-4 max-w-5xl mx-auto w-full px-4 animate-in fade-in zoom-in-95">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 lg:p-10 mb-8 shadow-2xl relative overflow-hidden">
        {/* Background effects */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-orange-600/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="flex flex-col lg:flex-row gap-8 items-center justify-between relative z-10">
          <div className="w-full lg:w-1/3 flex flex-col items-center justify-center">
            {selectedCard ? (
              <div
                className={`flex flex-col items-center relative transition-transform duration-500 w-full max-w-[200px] ${isForging ? 'animate-pulse scale-105 drop-shadow-[0_0_20px_rgba(234,88,12,0.6)]' : ''}`}
              >
                <div
                  className={`relative w-full aspect-[2/3] rounded-xl border-2 overflow-hidden bg-neutral-900 shadow-[0_15px_30px_rgba(0,0,0,0.6)] ${getCardStyle(selectedCard.card.rarity, rarities).border}`}
                >
                  <CardFrame frame={selectedCard.card.frame}>
                    <img
                      src={selectedCard.card.image}
                      alt={selectedCard.card.name}
                      className="w-full h-full object-cover"
                    />
                  </CardFrame>
                  {selectedCard.card.effect && (
                    <div className={`${selectedCard.card.effect} pointer-events-none z-10`} />
                  )}
                </div>
                <div className="mt-4 bg-black/60 px-4 py-2 rounded-xl border border-neutral-800 flex items-center justify-center gap-2 shadow-lg min-w-[100px] h-[48px]">
                  <Zap size={20} className="text-green-400 shrink-0" />
                  <div className="w-[60px] flex justify-center items-center h-full">
                    <span
                      className={`text-2xl font-black text-center transition-all duration-75 block ${isForging ? 'text-amber-100 scale-125 blur-[1px]' : 'text-white scale-100 blur-none'}`}
                      style={{ willChange: 'transform, filter' }}
                    >
                      {isForging ? rollingPower : selectedCard.power}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full max-w-[200px] aspect-[2/3] border-2 border-dashed border-neutral-700/50 rounded-xl flex flex-col items-center justify-center bg-neutral-900/50 text-neutral-500">
                <Hammer size={48} className="mb-4 opacity-50" />
                <span className="text-sm font-bold text-center px-4">Оберіть картку внизу</span>
              </div>
            )}
          </div>

          <div className="w-full lg:w-2/3 flex flex-col justify-center items-center lg:items-start text-center lg:text-left space-y-6">
            <div>
              <h1 className="text-4xl lg:text-5xl font-black text-white uppercase tracking-tight flex items-center justify-center lg:justify-start gap-4 mb-2">
                <Hammer className="text-orange-500" size={40} />
                Кузня
              </h1>
              <p className="text-neutral-400 font-medium mb-3">
                Викуйте заново силу ваших ігрових карток. Вартість залежить від рідкості картки.
              </p>
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2 rounded-lg inline-flex items-center gap-2">
                Увага: нова сила може бути меншою за поточну. Стара сила буде втрачена!
              </div>
            </div>

            <div className="bg-neutral-950 p-6 rounded-2xl border border-neutral-800 w-full max-w-md">
              <div className="flex justify-between items-center mb-6">
                <div className="flex flex-col">
                  <span className="text-neutral-400 font-bold uppercase text-sm">Вартість:</span>
                  {selectedCard && (
                    <span className="text-neutral-500 text-xs mt-1">
                      Можлива сила: {RARITY_POWER_RANGES[selectedCard.card.rarity]}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 bg-yellow-950/30 px-4 py-2 rounded-xl border border-yellow-900/40">
                  <Coins size={24} className="text-yellow-500" />
                  <span
                    className={`text-2xl font-black ${profile?.coins < currentCost ? 'text-red-500' : 'text-yellow-500'}`}
                  >
                    {currentCost}
                  </span>
                </div>
              </div>

              <button
                onClick={handleReroll}
                disabled={!selectedCard || isForging || profile?.coins < currentCost}
                className="w-full bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 disabled:from-neutral-800 disabled:to-neutral-900 disabled:text-neutral-600 disabled:border-neutral-800 text-white font-black text-lg py-4 px-6 rounded-xl border border-orange-500 transition-all flex justify-center items-center gap-2 hover:scale-[1.02] shadow-[0_0_30px_rgba(234,88,12,0.3)] disabled:shadow-none"
              >
                {isForging ? (
                  <>
                    <RefreshCw className="animate-spin" size={24} />
                    Кування...
                  </>
                ) : (
                  <>
                    <Sparkles size={24} />
                    Перекувати
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <h2 className="text-2xl font-black text-white flex items-center gap-2">
          Ваші Ігрові Картки{' '}
          <span className="text-neutral-500 text-lg">({forgeableCards.length})</span>
        </h2>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="bg-neutral-900 border border-neutral-800 text-sm font-bold rounded-xl px-4 py-3 focus:outline-none text-neutral-300 w-full sm:w-auto"
        >
          <option value="rarity">За Рідкістю</option>
          <option value="power">За Силою</option>
          <option value="name">За Алфавітом</option>
        </select>
      </div>

      {forgeableCards.length === 0 ? (
        <div className="text-center py-20 text-neutral-500 bg-neutral-900/30 rounded-3xl border-2 border-dashed border-neutral-800 flex flex-col items-center">
          <ArrowUpCircle size={64} className="mb-4 opacity-20" />
          <p className="text-xl font-medium mb-2 text-neutral-400">
            У вас немає ігрових карток для кування.
          </p>
          <p className="text-sm">Отримайте картки з «GameStats» з паків.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {forgeableCards.map((item, index) => {
            const style = getCardStyle(item.card.rarity, rarities);
            const isSelected =
              selectedCard?.card.id === item.card.id && selectedCard?.power === item.power;

            return (
              <div
                key={item.uniqueKey}
                onClick={() => !isForging && setSelectedCard(item)}
                className={`flex flex-col items-center group cursor-pointer animate-in fade-in duration-300 relative ${isSelected ? '-translate-y-2' : ''}`}
                style={{ animationDelay: `${index * 15}ms`, fillMode: 'backwards' }}
              >
                <div
                  className={`relative w-full aspect-[2/3] rounded-xl border-2 overflow-hidden bg-neutral-900 mb-2 transition-all duration-300 ${isSelected ? 'border-orange-500 shadow-[0_0_20px_rgba(234,88,12,0.4)]' : `${style.border} hover:border-neutral-400`}`}
                >
                  <CardFrame frame={item.card.frame}>
                    <img
                      src={item.card.image}
                      alt={item.card.name}
                      className={`w-full h-full object-cover transition-transform duration-500 ${isSelected ? 'scale-105' : 'group-hover:scale-105'}`}
                      loading="lazy"
                    />
                  </CardFrame>
                  {item.card.effect && (
                    <div className={`${item.card.effect} pointer-events-none z-10`} />
                  )}
                  {isSelected && (
                    <div className="absolute inset-0 bg-orange-500/10 pointer-events-none z-20" />
                  )}
                </div>

                <div className="w-full text-center px-1">
                  <div
                    className={`text-[9px] font-black uppercase tracking-widest mb-0.5 ${style.text}`}
                  >
                    {item.card.rarity}
                  </div>
                  <div className="font-bold text-xs text-white mb-1 line-clamp-1 group-hover:text-orange-400 transition-colors">
                    {item.card.name}
                  </div>
                  <div className="bg-black/50 rounded-lg py-1 px-2 inline-flex items-center gap-1 border border-neutral-800 font-bold text-green-400 text-xs">
                    <Zap size={10} /> {item.power}
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
