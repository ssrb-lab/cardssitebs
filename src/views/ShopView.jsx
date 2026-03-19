import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  Sparkles,
  Zap,
  Coins,
  ArrowLeft,
  Gem,
  Loader2,
  Volume2,
  PackageOpen,
  HelpCircle,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  Bookmark,
} from 'lucide-react';
import { getCardStyle, getCardWeight, playCardSound } from '../utils/helpers';
import { SELL_PRICE } from '../config/constants';
import CardFrame from '../components/CardFrame';
import { PerkBadge } from '../components/PerkBadge';

const RARITY_POWER_RANGES = {
  Звичайна: '5–50',
  Рідкісна: '10–80',
  Епічна: '25–100',
  Легендарна: '50–125',
  Унікальна: '100–150',
};

export default function ShopView({
  profile,
  packs,
  cardsCatalog,
  cardStats,
  rarities,
  openPack,
  openingPackId,
  isRouletteSpinning,
  rouletteItems,
  pulledCards,
  setPulledCards,
  sellPulledCards,
  sellSinglePulledCard,
  selectedPackId,
  setSelectedPackId,
  setViewingCard,
  isAdmin,
  isProcessing,
  isPremiumActive,
  statsRanges,
}) {
  const [roulettePos, setRoulettePos] = useState(0);
  const [rouletteOffset, setRouletteOffset] = useState(0);
  const [activeCategory, setActiveCategory] = useState('all');

  useEffect(() => {
    if (isRouletteSpinning) {
      // Avoid calling setState synchronously during render by using setTimeout
      const initTimer = setTimeout(() => {
        setRoulettePos(0);
        setRouletteOffset(Math.floor(Math.random() * 100) - 50);
      }, 0);

      const animTimer = setTimeout(() => {
        setRoulettePos(1);
      }, 50);

      return () => {
        clearTimeout(initTimer);
        clearTimeout(animTimer);
      };
    }
  }, [isRouletteSpinning]);

  // Автоматичне відтворення звуку найрідкіснішої картки після відкриття паку
  useEffect(() => {
    // Відтворюємо звук ТІЛЬКИ якщо гравець НЕ вимкнув цю опцію
    if (pulledCards && pulledCards.length > 0 && profile?.autoSoundEnabled !== false) {
      const cardsWithSound = pulledCards.filter((c) => c.soundUrl);
      if (cardsWithSound.length > 0) {
        cardsWithSound.sort(
          (a, b) => getCardWeight(a.rarity, rarities) - getCardWeight(b.rarity, rarities)
        );
        playCardSound(cardsWithSound[0].soundUrl, cardsWithSound[0].soundVolume);
      }
    }
  }, [pulledCards, rarities, profile?.autoSoundEnabled]); // Додали залежність

  if (isRouletteSpinning && rouletteItems.length > 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[65vh] animate-in fade-in duration-500 w-full pb-10 overflow-hidden">
        <h2 className="text-3xl font-black mb-10 text-white uppercase tracking-widest text-center animate-pulse drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
          Відкриваємо пак...
        </h2>

        <div className="relative w-full max-w-4xl mx-auto bg-neutral-900 border-[4px] border-neutral-700 rounded-3xl h-72 shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden">
          <div className="absolute inset-y-0 left-0 w-16 sm:w-32 bg-gradient-to-r from-neutral-950 to-transparent z-20 pointer-events-none"></div>
          <div className="absolute inset-y-0 right-0 w-16 sm:w-32 bg-gradient-to-l from-neutral-950 to-transparent z-20 pointer-events-none"></div>

          <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-yellow-500 z-30 -translate-x-1/2 shadow-[0_0_15px_rgba(234,179,8,1)]"></div>
          <div className="absolute left-1/2 top-0 -translate-x-1/2 border-solid border-t-[20px] border-t-yellow-500 border-x-[15px] border-x-transparent z-40"></div>
          <div className="absolute left-1/2 bottom-0 -translate-x-1/2 border-solid border-b-[20px] border-b-yellow-500 border-x-[15px] border-x-transparent z-40"></div>

          <div
            className="absolute inset-y-0 flex items-center gap-4"
            style={{
              left: '50%',
              transition:
                roulettePos === 1 ? 'transform 4.5s cubic-bezier(0.1, 0.85, 0.1, 1)' : 'none',
              transform:
                roulettePos === 1
                  ? `translateX(-${35 * 176 + 80 + rouletteOffset}px)`
                  : `translateX(-80px)`,
            }}
          >
            {rouletteItems.map((item, i) => {
              const style = getCardStyle(item.rarity, rarities);
              const effectClass = item.effect ? `effect-${item.effect}` : '';
              return (
                <div
                  key={i}
                  className={`w-40 h-56 rounded-2xl border-4 shrink-0 bg-neutral-950 relative overflow-hidden shadow-xl ${style.border} ${effectClass} transform-gpu will-change-transform isolate z-0`}
                >
                  <CardFrame frame={item.frame} effect={item.effect}>
                    <img
                      src={item.image}
                      alt="card"
                      className="w-full h-full object-cover transform-gpu will-change-transform"
                      loading="lazy"
                    />
                  </CardFrame>
                  <PerkBadge perk={item.perk} />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/80 backdrop-blur text-center py-1.5 border-t border-neutral-800 z-10">
                    <span
                      className={`text-[10px] font-black uppercase tracking-widest ${style.text}`}
                    >
                      {item.rarity}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (pulledCards && pulledCards.length > 0) {
    const countsMap = {};
    pulledCards.forEach((c) => {
      countsMap[c.id] = (countsMap[c.id] || 0) + 1;
    });

    let duplicateSellPrice = 0;
    let hasDuplicates = false;

    Object.entries(countsMap).forEach(([id, pulledAmount]) => {
      const cardDef = pulledCards.find((c) => c.id === id);
      const isGameCard = cardDef?.isGame && !cardDef?.blockGame;
      if (isGameCard) return; // Ігрові картки заборонено продавати при відкритті паку

      const invItem = profile?.inventory?.find((i) => i.cardId === id || i.id === id);
      const invAmount = invItem ? invItem.amount : 0;
      const duplicateCount = Math.max(0, invAmount - 1);
      const sellAmount = Math.min(pulledAmount, duplicateCount);

      if (sellAmount > 0) {
        hasDuplicates = true;
        const price = cardDef?.sellPrice ? Number(cardDef.sellPrice) : SELL_PRICE;
        duplicateSellPrice += price * sellAmount;
      }
    });

    return (
      <div className="flex flex-col items-center min-h-[65vh] animate-in zoom-in-95 duration-700 w-full pb-10">
        <h2 className="text-3xl sm:text-4xl font-black mb-8 text-white uppercase tracking-widest text-center drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">
          Ви отримали {pulledCards.length > 1 ? `(${pulledCards.length} шт)` : '!'}
        </h2>

        <div className="flex flex-wrap justify-center gap-3 sm:gap-6 mb-6 sm:mb-10 w-full max-h-[60vh] overflow-y-auto hide-scrollbar p-2 sm:p-4">
          {pulledCards.map((card, index) => {
            const style = getCardStyle(card.rarity, rarities);
            const effectClass = card.effect ? `effect-${card.effect}` : '';

            // ЛОГІКА АНІМАЦІЙ: Спочатку кастомна, потім за рідкістю, потім стандартна
            let animClass = 'animate-in zoom-in slide-in-from-bottom-6';
            if (card.dropAnim) {
              animClass = `anim - ${card.dropAnim} `;
            } else if (card.rarity === 'Унікальна') {
              animClass = 'anim-epic';
            } else if (card.rarity === 'Легендарна') {
              animClass = 'anim-flash';
            } else if (card.rarity === 'Епічна') {
              animClass = 'anim-flip';
            }

            return (
              <div
                key={index}
                onClick={() => setViewingCard({ card, amount: 1 })}
                className={`flex flex-col items-center cursor-pointer group ${animClass}`}
                style={{
                  animationDelay: `${Math.min(index * 50, 2000)}ms`,
                  animationFillMode: 'both',
                }}
              >
                <div
                  className={`w-28 sm:w-40 md:w-56 aspect-[2/3] rounded-xl sm:rounded-2xl border-2 sm:border-4 overflow-hidden shadow-[0_0_20px_rgba(0,0,0,0.6)] sm:shadow-[0_0_40px_rgba(0,0,0,0.6)] transform transition-all group-hover:scale-105 group-hover:rotate-2 ${style.border} bg-neutral-900 relative mb-2 sm:mb-4 ${effectClass} transform-gpu will-change-transform isolate z-0`}
                >
                  <CardFrame frame={card.frame} effect={card.effect}>
                    <img
                      src={card.image}
                      alt={card.name}
                      className="w-full h-full object-cover transform-gpu will-change-transform"
                      loading="lazy"
                    />
                  </CardFrame>
                  <PerkBadge perk={card.perk} />
                  {Number(card.maxSupply) > 0 && (
                    <div className="absolute top-2 left-2 bg-black/90 text-white text-[8px] sm:text-[10px] px-2 py-1 rounded-md border border-neutral-700 font-black z-10">
                      {cardStats[card.id] || 0} / {card.maxSupply}
                    </div>
                  )}
                  {!(card.isGame && !card.blockGame) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        sellSinglePulledCard(card);
                      }}
                      className="absolute top-2 right-2 bg-red-600/90 text-white p-1.5 sm:p-2 rounded-lg hover:bg-red-500 z-30 transition-colors shadow-lg"
                      title="Продати картку"
                    >
                      <Coins size={14} className="sm:w-4 sm:h-4 w-[14px] h-[14px]" />
                    </button>
                  )}
                  {card.soundUrl && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        playCardSound(card.soundUrl, card.soundVolume);
                      }}
                      className="absolute bottom-2 right-2 bg-black/80 text-white p-2 rounded-full hover:text-blue-400 z-30 transition-colors shadow-lg"
                      title="Відтворити звук"
                    >
                      <Volume2 size={16} />
                    </button>
                  )}
                </div>
                <div className="text-center w-full px-2">
                  <div
                    className={`text-[10px] sm:text-xs font-black uppercase tracking-widest flex justify-center items-center gap-1 ${style.text}`}
                  >
                    <Sparkles size={12} /> {card.rarity}
                  </div>
                  {(card.generatedPower || card.generatedHp) && (
                    <div className="flex flex-col items-center justify-center gap-1 mt-1 mb-1 w-full">
                      {card.generatedPower && (
                        <div className="glass-badge w-full max-w-[80%] text-yellow-400 border-yellow-500/20">
                          <Zap size={12} strokeWidth={2.5} className="drop-shadow-[0_0_5px_rgba(250,204,21,0.8)]" /> {card.generatedPower}
                        </div>
                      )}
                      {card.generatedHp && (
                        <div className="glass-badge w-full max-w-[80%] text-red-400 border-red-500/20">
                          ❤️ {card.generatedHp}
                        </div>
                      )}
                    </div>
                  )}
                  <h3 className="font-bold text-white text-xs sm:text-sm truncate w-full group-hover:text-yellow-100 transition-colors">
                    {card.name}
                  </h3>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto px-4 sm:px-0">
          <button
            onClick={() => setPulledCards([])}
            className="px-6 sm:px-8 py-3 sm:py-4 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-xl transition-all shadow-lg border border-neutral-700 w-full sm:w-auto text-sm sm:text-base active:scale-95"
          >
            Забрати картки
          </button>
          {hasDuplicates && (
            <button
              onClick={sellPulledCards}
              disabled={isProcessing}
              className={`px-6 sm:px-8 py-3 sm:py-4 font-bold w-full sm:w-auto text-sm sm:text-base ${isProcessing ? 'bg-neutral-800 text-neutral-500 rounded-xl cursor-not-allowed opacity-70 flex items-center justify-center gap-2' : 'btn-game-secondary'}`}
            >
              Продати дублікати (+{duplicateSellPrice} <Coins size={14} className="sm:w-4 sm:h-4 w-3.5 h-3.5 text-yellow-400" />)
            </button>
          )}
        </div>
      </div>
    );
  }

  const selectedPack = packs.find((p) => p.id === selectedPackId);

  if (selectedPack) {
    const packCards = cardsCatalog
      .filter((c) => c.packId === selectedPackId)
      .sort((a, b) => getCardWeight(a.rarity, rarities) - getCardWeight(b.rarity, rarities));

    const maxPacksAffordable =
      profile?.coins && selectedPack?.cost ? Math.floor(profile.coins / selectedPack.cost) : 0;

    return (
      <div className="pb-10 animate-in fade-in slide-in-from-right-8 duration-500">
        <button
          onClick={() => setSelectedPackId(null)}
          className="mb-6 flex items-center gap-2 text-neutral-400 hover:text-white transition-colors font-bold px-4 py-2 bg-neutral-900 rounded-lg hover:bg-neutral-800 w-fit border border-neutral-800"
        >
          <ArrowLeft size={20} /> Назад
        </button>

        <div className="flex flex-col items-center mb-8 sm:mb-12 bg-neutral-900/50 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-neutral-800 max-w-3xl mx-4 sm:mx-auto">
          {selectedPack.isPremiumOnly && (
            <div className="bg-fuchsia-900/50 text-fuchsia-300 px-4 py-1.5 rounded-full font-bold uppercase tracking-widest text-xs flex items-center gap-2 mb-3 border border-fuchsia-500/30">
              <Gem size={14} /> Преміум Пак
            </div>
          )}
          {selectedPack.isGame && (
            <div className="bg-green-900/50 text-green-300 px-4 py-1.5 rounded-full font-bold uppercase tracking-widest text-xs flex items-center gap-2 mb-3 border border-green-500/30">
              Ігровий Пак (Дає сили)
            </div>
          )}
          <h2 className="text-xl sm:text-3xl font-black mb-4 sm:mb-6 text-white text-center">{selectedPack.name}</h2>

          <div className="relative w-32 h-32 sm:w-48 sm:h-48 mb-6 sm:mb-8 flex justify-center items-center perspective-1000">
            {openingPackId === selectedPack.id ? (
              <div className="w-full h-full bg-gradient-to-br from-indigo-900 to-purple-900 rounded-2xl border-4 border-indigo-500 shadow-[0_0_40px_rgba(99,102,241,0.6)] animate-pulse flex items-center justify-center">
                <Loader2 className="animate-spin text-indigo-300 w-12 h-12" />
              </div>
            ) : (
              <div
                className={`w-full h-full bg-neutral-800 rounded-2xl border-4 overflow-hidden ${selectedPack.isPremiumOnly ? 'border-fuchsia-600 shadow-[0_10px_40px_rgba(217,70,239,0.3)]' : 'border-neutral-700 shadow-[0_10px_40px_rgba(0,0,0,0.5)]'}`}
              >
                <img
                  src={selectedPack.image}
                  alt={selectedPack.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4 w-full items-center">
            {/* Базова валюта (Монети) */}
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap justify-center gap-2 sm:gap-3 w-full">
              <OpenButton
                amount={1}
                cost={selectedPack.cost}
                currency="coins"
                onClick={() => openPack(selectedPack.id, selectedPack.cost, 1, 'coins')}
                opening={openingPackId === selectedPack.id || isProcessing}
              />
              <OpenButton
                amount={5}
                cost={selectedPack.cost}
                currency="coins"
                onClick={() => openPack(selectedPack.id, selectedPack.cost, 5, 'coins')}
                opening={openingPackId === selectedPack.id || isProcessing}
                color="bg-orange-500 hover:bg-orange-400 text-white"
              />
              <OpenButton
                amount={10}
                cost={selectedPack.cost}
                currency="coins"
                onClick={() => openPack(selectedPack.id, selectedPack.cost, 10, 'coins')}
                opening={openingPackId === selectedPack.id || isProcessing}
                color="bg-red-500 hover:bg-red-400 text-white"
              />
              <OpenButton
                amount={100}
                cost={selectedPack.cost}
                currency="coins"
                onClick={() => openPack(selectedPack.id, selectedPack.cost, 100, 'coins')}
                opening={openingPackId === selectedPack.id || isProcessing}
                color="bg-purple-600 hover:bg-purple-500 text-white"
              />
              {maxPacksAffordable > 0 && (
                <OpenButton
                  amount={maxPacksAffordable}
                  cost={selectedPack.cost}
                  currency="coins"
                  label={`На всі (${maxPacksAffordable}x)`}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Ви впевнені, що хочете відкрити ${maxPacksAffordable} паків одразу за всі свої гроші?`
                      )
                    ) {
                      openPack(selectedPack.id, selectedPack.cost, maxPacksAffordable, 'coins');
                    }
                  }}
                  opening={openingPackId === selectedPack.id || isProcessing}
                  color="bg-green-600 hover:bg-green-500 text-white"
                />
              )}
            </div>

            {/* Преміум валюта (Кристали) */}
            {selectedPack.premiumCost > 0 && (
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap justify-center gap-2 sm:gap-3 w-full border-t border-fuchsia-900/40 pt-4 mt-2">
                <OpenButton
                  amount={1}
                  cost={selectedPack.premiumCost}
                  currency="crystals"
                  onClick={() => openPack(selectedPack.id, selectedPack.premiumCost, 1, 'crystals')}
                  opening={openingPackId === selectedPack.id || isProcessing}
                  color="bg-fuchsia-600 hover:bg-fuchsia-500 text-white"
                />
                <OpenButton
                  amount={5}
                  cost={selectedPack.premiumCost}
                  currency="crystals"
                  onClick={() => openPack(selectedPack.id, selectedPack.premiumCost, 5, 'crystals')}
                  opening={openingPackId === selectedPack.id || isProcessing}
                  color="bg-fuchsia-700 hover:bg-fuchsia-600 text-white"
                />
                <OpenButton
                  amount={10}
                  cost={selectedPack.premiumCost}
                  currency="crystals"
                  onClick={() => openPack(selectedPack.id, selectedPack.premiumCost, 10, 'crystals')}
                  opening={openingPackId === selectedPack.id || isProcessing}
                  color="bg-fuchsia-800 hover:bg-fuchsia-700 text-white"
                />
              </div>
            )}
          </div>

          {selectedPack.isPremiumOnly && !isPremiumActive && (
            <div className="mt-6 text-red-400 font-bold bg-red-900/20 px-4 py-2 rounded-xl border border-red-900/50">
              У вас немає Преміум-акаунту для відкриття цього паку.
            </div>
          )}
        </div>

        <div className="border-t border-neutral-800 pt-8 w-full">
          <h3 className="text-xl font-black mb-6 text-white text-center uppercase tracking-wider">
            Можливі картки в цьому паку (від найрідкісніших)
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-4 px-2 sm:px-0">
            {packCards.map((card) => {
              const style = getCardStyle(card.rarity, rarities);
              const effectClass = card.effect ? `effect-${card.effect}` : '';
              const maxSup = Number(card.maxSupply) || 0;
              const isSoldOut = maxSup > 0 && (cardStats[card.id] || 0) >= maxSup;
              const hasCard = profile?.inventory?.some(
                (item) => item.cardId === card.id || item.id === card.id
              );

              return (
                <div
                  key={card.id}
                  className={`flex flex-col items-center group ${isSoldOut ? 'opacity-50 grayscale' : 'cursor-pointer'}`}
                  onClick={() => !isSoldOut && setViewingCard({ card })}
                >
                  <div
                    className={`relative w-full aspect-[2/3] rounded-xl border-2 overflow-hidden bg-neutral-900 mb-2 transition-all duration-300 ${!isSoldOut ? 'group-hover:-translate-y-2 group-hover:shadow-[0_10px_20px_rgba(0,0,0,0.5)]' : ''} ${style.border} ${effectClass} transform-gpu will-change-transform isolate z-0`}
                  >
                    <CardFrame frame={card.frame} effect={card.effect}>
                      <img
                        src={card.image}
                        alt={card.name}
                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity transform-gpu will-change-transform"
                        loading="lazy"
                      />
                    </CardFrame>
                    <PerkBadge perk={card.perk} />
                    {maxSup > 0 && (
                      <div className="absolute top-1 right-1 bg-black/90 text-white text-[8px] px-1.5 py-0.5 rounded border border-neutral-700 font-bold z-10">
                        {isSoldOut
                          ? 'РОЗПРОДАНО'
                          : `${maxSup - (cardStats[card.id] || 0)}/${maxSup}`}
                      </div>
                    )}
                    {card.soundUrl && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playCardSound(card.soundUrl, card.soundVolume);
                        }}
                        className="absolute bottom-1 right-1 bg-black/80 text-white p-1.5 rounded-full hover:text-blue-400 z-30 transition-colors shadow-lg"
                        title="Відтворити звук"
                      >
                        <Volume2 size={12} />
                      </button>
                    )}
                    {hasCard && (
                      <div
                        className={`absolute bottom-1 ${card.soundUrl ? 'right-9' : 'right-1'} text-yellow-500 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] z-20`}
                        title="Вже є в інвентарі"
                      >
                        <Bookmark size={22} fill="currentColor" />
                        <div className="absolute inset-0 flex items-center justify-center top-[-1px] text-yellow-950">
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="text-center px-1 w-full">
                    <div
                      className={`text-[9px] font-black uppercase tracking-widest mb-0.5 ${style.text}`}
                    >
                      {card.rarity}
                    </div>
                    {selectedPack.isGame && (() => {
                      let minP = 5, maxP = 50;
                      let minH = 10, maxH = 100;
                      
                      let packRanges = {};
                      if (selectedPack.statsRanges) {
                         if (typeof selectedPack.statsRanges === 'string') {
                            try { packRanges = JSON.parse(selectedPack.statsRanges); } catch (e) {}
                         } else {
                            packRanges = selectedPack.statsRanges;
                         }
                      }
                      
                      if (card.minPower !== null) {
                         minP = card.minPower; maxP = card.maxPower !== null ? card.maxPower : card.minPower;
                      } else if (packRanges && packRanges[card.rarity] && packRanges[card.rarity].minPower !== undefined && packRanges[card.rarity].minPower !== '') {
                         minP = Number(packRanges[card.rarity].minPower);
                         maxP = (packRanges[card.rarity].maxPower !== undefined && packRanges[card.rarity].maxPower !== '') ? Number(packRanges[card.rarity].maxPower) : minP;
                      } else {
                         const RARITY_POWER_RANGES = { Звичайна: [5, 50], Рідкісна: [10, 80], Епічна: [25, 100], Легендарна: [50, 125], Унікальна: [100, 150] };
                         const rng = RARITY_POWER_RANGES[card.rarity] || [5, 50];
                         minP = rng[0]; maxP = rng[1];
                      }
                      
                      if (card.minHp !== null) {
                         minH = card.minHp; maxH = card.maxHp !== null ? card.maxHp : card.minHp;
                      } else if (packRanges && packRanges[card.rarity] && packRanges[card.rarity].minHp !== undefined && packRanges[card.rarity].minHp !== '') {
                         minH = Number(packRanges[card.rarity].minHp);
                         maxH = (packRanges[card.rarity].maxHp !== undefined && packRanges[card.rarity].maxHp !== '') ? Number(packRanges[card.rarity].maxHp) : minH;
                      } else {
                         minH = minP * 2;
                         maxH = maxP * 2;
                      }

                      return (
                        <div className="flex flex-col items-center justify-center gap-0.5 mt-0.5 mb-1 opacity-80">
                           <div className="text-[10px] sm:text-xs font-bold text-yellow-500 flex items-center justify-center gap-0.5 shadow-sm">
                             <Zap size={10} strokeWidth={2.5} /> {minP === maxP ? minP : `${minP}–${maxP}`}
                           </div>
                           <div className="text-[10px] sm:text-xs font-bold text-red-500 flex items-center justify-center gap-0.5 shadow-sm">
                             ❤️ {minH === maxH ? minH : `${minH}–${maxH}`}
                           </div>
                        </div>
                      );
                    })()}
                    <div
                      className="font-bold text-xs leading-tight text-white truncate w-full group-hover:text-yellow-100 transition-colors"
                      title={card.name}
                    >
                      {card.name}
                    </div>
                  </div>
                </div>
              );
            })}
            {packCards.length === 0 && (
              <p className="col-span-full text-center text-neutral-500 py-4">Картки відсутні.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const visiblePacks = isAdmin || profile?.isSuperAdmin ? packs : packs.filter((p) => !p.isHidden);
  const categoriesList = ['all', ...new Set(visiblePacks.map((p) => p.category || 'Базові'))];
  const displayedPacks = visiblePacks.filter(
    (p) => activeCategory === 'all' || (p.category || 'Базові') === activeCategory
  );

  return (
    <div className="pb-10 animate-in fade-in zoom-in-95 duration-500">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-black mb-2 text-white uppercase tracking-widest">
          Магазин Паків
        </h2>
        <p className="text-neutral-400 text-sm">Оберіть пак, Мій лорд, і випробуйте удачу!</p>
      </div>

      {categoriesList.length > 2 && (
        <div className="flex gap-2 overflow-x-auto pb-4 mb-4 hide-scrollbar justify-start sm:justify-center max-w-4xl mx-auto px-4 sm:px-0">
          {categoriesList.map((c) => (
            <button
              key={c}
              onClick={() => setActiveCategory(c)}
              className={`px-5 py-2.5 rounded-full font-bold whitespace-nowrap transition-colors border ${activeCategory === c ? 'bg-purple-600 border-purple-500 text-white' : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'}`}
            >
              {c === 'all' ? 'Всі Паки' : c}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6 max-w-4xl mx-auto px-3 sm:px-0">
        {displayedPacks.map((pack) => (
          <button
            key={pack.id}
            onClick={() => setSelectedPackId(pack.id)}
            className={`bg-neutral-900 border ${pack.isPremiumOnly ? 'border-fuchsia-900/50 hover:border-fuchsia-500' : 'border-neutral-800 hover:border-neutral-600'} rounded-2xl sm:rounded-3xl p-3 sm:p-6 flex flex-col items-center justify-between group transition-colors shadow-lg text-left w-full cursor-pointer hover:-translate-y-1 transform duration-300 relative overflow-hidden`}
          >
            {pack.isHidden && (
              <div className="absolute top-2 sm:top-3 left-2 sm:left-3 bg-red-900 text-red-100 text-[8px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border border-red-500 font-bold uppercase z-10 shadow-lg">
                Приховано
              </div>
            )}
            {pack.isPremiumOnly && (
              <div className="absolute top-2 sm:top-3 right-2 sm:right-3 bg-fuchsia-900 text-fuchsia-100 text-[8px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border border-fuchsia-500 font-bold uppercase z-10 shadow-lg flex items-center gap-1">
                <Gem size={8} className="sm:w-2.5 sm:h-2.5 w-2 h-2" /> <span className="hidden sm:inline">Преміум</span>
              </div>
            )}
            {pack.isGame && (
              <div
                className={`absolute ${pack.isHidden ? 'top-8 sm:top-10' : 'top-2 sm:top-3'} left-2 sm:left-3 bg-green-900 text-green-100 text-[8px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border border-green-500 font-bold uppercase z-10 shadow-lg flex items-center gap-1`}
              >
                ⚔ <span className="hidden sm:inline">Ігровий</span>
              </div>
            )}

            <div
              className={`text-[8px] sm:text-[10px] ${pack.isPremiumOnly ? 'text-fuchsia-400' : 'text-purple-400'} font-bold uppercase tracking-widest text-center mb-1 relative z-10`}
            >
              {pack.category || 'Базові'}
            </div>
            <h3 className="text-sm sm:text-xl font-bold text-white mb-2 text-center w-full relative z-10 line-clamp-2 sm:line-clamp-none leading-tight sm:leading-normal min-h-[2.5rem] sm:min-h-0 flex items-center justify-center">
              {pack.name}
            </h3>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 mb-3 sm:mb-4 w-full">
              <div className="flex items-center justify-center gap-1 sm:gap-1.5 text-yellow-500 font-bold bg-yellow-500/10 px-2 sm:px-4 py-1 sm:py-1.5 rounded-full border border-yellow-500/20 shadow-inner relative z-10 text-xs sm:text-base">
                {pack.cost} <Coins size={14} className="sm:w-4 sm:h-4 w-3.5 h-3.5" />
              </div>
              {pack.premiumCost > 0 && (
                <div className="flex items-center justify-center gap-1 sm:gap-1.5 text-fuchsia-400 font-bold bg-fuchsia-500/10 px-2 sm:px-4 py-1 sm:py-1.5 rounded-full border border-fuchsia-500/20 shadow-inner relative z-10 text-xs sm:text-base">
                  {pack.premiumCost} <Gem size={14} className="sm:w-4 sm:h-4 w-3.5 h-3.5" />
                </div>
              )}
            </div>

            <div className="relative w-20 h-20 sm:w-40 sm:h-40 mb-3 sm:mb-6 flex justify-center items-center perspective-1000">
              <div
                className={`w-full h-full bg-neutral-800 rounded-xl sm:rounded-2xl border-2 sm:border-4 ${pack.isPremiumOnly ? 'border-fuchsia-800/50' : 'border-neutral-700'} shadow-xl overflow-hidden group-hover:shadow-[0_0_30px_rgba(255,255,255,0.1)] transition-all duration-300 isolate z-0`}
              >
                <img
                  src={pack.image}
                  alt={pack.name}
                  className={`w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity group-hover:scale-105 duration-500 ${pack.isHidden ? 'grayscale' : ''}`}
                  loading="lazy"
                />
              </div>
            </div>
            <div
              className={`w-full py-2 sm:py-3 text-[10px] sm:text-base rounded-lg sm:rounded-xl font-bold text-neutral-400 group-hover:text-white bg-neutral-950 border ${pack.isPremiumOnly ? 'border-fuchsia-900/30' : 'border-neutral-800'} group-hover:border-neutral-700 flex items-center justify-center gap-1 sm:gap-2 transition-all relative z-10`}
            >
              Детальніше
            </div>
          </button>
        ))}
        {displayedPacks.length === 0 && (
          <div className="col-span-full text-center text-neutral-500 py-10">
            У цій категорії паків ще немає.
          </div>
        )}
      </div>
    </div>
  );
}

// Допоміжний компонент для кнопки відкриття
function OpenButton({
  amount,
  cost,
  currency = 'coins',
  onClick,
  opening,
  color,
  label,
}) {
  const disabled = opening;
  
  // Визначаємо клас на основі валюти та кількості
  let btnClass = 'btn-game-primary';
  if (currency === 'crystals') {
    btnClass = 'btn-game-epic';
  } else if (amount === 5) {
    btnClass = 'btn-game bg-gradient-to-b from-orange-400 to-orange-600 text-orange-950 border-orange-300/50 hover:from-orange-300 hover:to-orange-500 hover:shadow-[0_0_20px_rgba(249,115,22,0.4)]';
  } else if (amount === 10) {
    btnClass = 'btn-game-danger';
  } else if (amount === 100) {
    btnClass = 'btn-game bg-gradient-to-b from-indigo-500 to-purple-700 text-white border-indigo-400/50 hover:from-indigo-400 hover:to-purple-600 hover:shadow-[0_0_20px_rgba(99,102,241,0.4)]';
  } else if (amount > 100) {
    btnClass = 'btn-game bg-gradient-to-b from-emerald-500 to-green-700 text-white border-green-400/50 hover:from-emerald-400 hover:to-green-600 hover:shadow-[0_0_20px_rgba(16,185,129,0.4)]';
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2 py-2 sm:px-6 sm:py-3 font-black flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-xs sm:text-base flex-1 sm:flex-none ${disabled
          ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed opacity-70 rounded-xl'
          : btnClass
        }`}
    >
      <span className="text-center drop-shadow-md">{label ? label : `Відкрити ${amount}x`}</span>
      <span className="flex items-center text-[10px] sm:text-sm bg-black/40 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-md sm:ml-1 mt-0.5 sm:mt-0 shadow-inner">
        {cost * amount} {currency === 'crystals' ? <Gem size={12} className="ml-1 sm:w-[14px] sm:h-[14px] text-fuchsia-400 drop-shadow-[0_0_5px_rgba(217,70,239,0.8)]" /> : <Coins size={12} className="ml-1 sm:w-[14px] sm:h-[14px] text-yellow-400 drop-shadow-[0_0_5px_rgba(250,204,21,0.8)]" />}
      </span>
    </button>
  );
}
