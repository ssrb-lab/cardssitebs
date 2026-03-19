import React, { useState, useMemo, useEffect } from 'react';
import { Sparkles, Gem } from 'lucide-react';
import { getCardStyle } from '../utils/helpers';
import CardFrame from './CardFrame';
import { PERK_META, PERK_RARITY_STYLE } from './PerkBadge';
import { safeFetch } from '../config/api';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const PERK_LEVEL_XP = [100, 250, 500, 1000];
const MAX_PERK_LEVEL = 5;

const EFFECT_LABEL = {
  power_percent: (v) => `+${Math.round(v * 100)}% АТК`,
  hp_percent:    (v) => `+${Math.round(v * 100)}% HP`,
  power_flat:    (v) => `+${Math.round(v)} АТК`,
  hp_flat:       (v) => `+${Math.round(v)} HP`,
};

let _emeraldTypesCache = null;
async function fetchEmeraldTypes() {
  if (_emeraldTypesCache) return _emeraldTypesCache;
  try {
    const res = await safeFetch(`${API_URL}/game/emerald-types`);
    const data = await res.json();
    _emeraldTypesCache = Array.isArray(data) ? data : [];
  } catch {
    _emeraldTypesCache = [];
  }
  return _emeraldTypesCache;
}

let _perkCatalogCache = null;

function InstancePerkRow({ perk, catalogEntry }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const rs = PERK_RARITY_STYLE[perk.rarity] || PERK_RARITY_STYLE['Звичайна'];
  const isMax = perk.level >= MAX_PERK_LEVEL;
  const xpThreshold = !isMax ? PERK_LEVEL_XP[perk.level - 1] : null;
  const xpProgress = xpThreshold ? Math.min(100, Math.round((perk.experience / xpThreshold) * 100)) : 100;
  const typeName = (perk.type || '').replace(/_/g, ' ');

  let currentBonus = null;
  let nextBonus = null;
  if (catalogEntry) {
    const fmt = EFFECT_LABEL[catalogEntry.effectType] || ((v) => `+${v}`);
    currentBonus = fmt(catalogEntry.effectPerLevel * perk.level);
    if (!isMax) nextBonus = fmt(catalogEntry.effectPerLevel * (perk.level + 1));
  }

  return (
    <div className="relative flex items-center gap-3 py-2 px-3 rounded-xl bg-white/5 border border-white/10">
      <div className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full border ${rs.bg} ${rs.border} ${rs.text} font-black text-sm`}>
        {perk.level}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-white text-xs font-semibold truncate capitalize">{typeName}</span>
          {currentBonus && (
            <span className="text-emerald-400 text-xs font-bold whitespace-nowrap">{currentBonus}</span>
          )}
        </div>
        {isMax ? (
          <div className="mt-0.5 text-xs text-amber-400 font-bold tracking-widest">MAX</div>
        ) : (
          <div className="mt-1">
            <div className="relative h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="absolute left-0 top-0 h-full bg-gradient-to-r from-violet-500 to-indigo-400 rounded-full transition-all duration-700"
                style={{ width: `${xpProgress}%` }}
              />
            </div>
            <div className="flex justify-between mt-0.5">
              <span className="text-neutral-500 text-[10px]">{perk.experience} / {xpThreshold} XP</span>
              {nextBonus && <span className="text-neutral-400 text-[10px]">→ {nextBonus}</span>}
            </div>
          </div>
        )}
      </div>

      <button
        className="flex-shrink-0 w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 text-neutral-400 hover:text-white transition-colors text-[11px] leading-none"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >?</button>

      {showTooltip && (
        <div className="absolute right-0 bottom-full mb-2 z-50 w-56 bg-neutral-900/95 border border-white/20 rounded-xl p-3 shadow-2xl text-xs pointer-events-none">
          <div className="font-bold text-white mb-1.5 capitalize">{typeName}</div>
          <div className="text-neutral-400">Рідкість: <span className={rs.text}>{perk.rarity}</span></div>
          <div className="text-neutral-400">Рівень: <span className="text-white">{perk.level} / {MAX_PERK_LEVEL}</span></div>
          {currentBonus && (
            <div className="mt-1.5 text-neutral-300">
              Поточний бонус: <span className="text-emerald-400 font-bold">{currentBonus}</span>
            </div>
          )}
          {nextBonus && (
            <div className="text-neutral-300">
              Наступний рівень: <span className="text-blue-400 font-bold">{nextBonus}</span>
            </div>
          )}
          {xpThreshold && (
            <div className="mt-1 text-neutral-500">{perk.experience} / {xpThreshold} XP до рівня {perk.level + 1}</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CardModal({ viewingCard, setViewingCard, rarities }) {
  const [tiltStyle, setTiltStyle] = useState({});
  const [isHovering, setIsHovering] = useState(false);
  const [perkCatalog, setPerkCatalog] = useState(_perkCatalogCache || []);
  const [emeraldTypes, setEmeraldTypes] = useState(_emeraldTypesCache || []);

  useEffect(() => {
    if (_perkCatalogCache) { setPerkCatalog(_perkCatalogCache); return; }
    safeFetch(`${API_URL}/game/perks`)
      .then(r => r.json())
      .then(data => {
        _perkCatalogCache = Array.isArray(data) ? data : [];
        setPerkCatalog(_perkCatalogCache);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchEmeraldTypes().then(setEmeraldTypes);
  }, []);

  if (!viewingCard) return null;

  const { card } = viewingCard;
  const instancePerks = Array.isArray(viewingCard.instancePerks) ? viewingCard.instancePerks : [];
  const style = getCardStyle(card.rarity, rarities);

  const hasElectricPerk = instancePerks.some(p => p.type === 'Electric' && p.level >= MAX_PERK_LEVEL);
  const effectiveEffect = hasElectricPerk ? 'electric' : card.effect;
  const effectiveEffectClass = effectiveEffect ? `effect-${effectiveEffect}` : '';

  const cardContent = useMemo(() => (
    <CardFrame
      frame={card.frame}
      effect={effectiveEffect}
      className={`w-full aspect-[2/3] rounded-3xl overflow-hidden relative group shadow-[0_20px_70px_rgba(0,0,0,0.8)] bg-neutral-900 ${
        !card.frame || card.frame === 'normal' ? `border-4 ${style.border}` : ''
      } ${effectiveEffectClass} isolate z-0`}
    >
      <img
        src={card.image}
        alt={card.name}
        className="w-full h-full object-cover transform-gpu will-change-transform"
        loading="lazy"
      />
    </CardFrame>
  ), [card.id, card.frame, effectiveEffect, card.image, style.border, effectiveEffectClass]);

  const handleMouseMove = (e) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const rotateX = ((y - rect.height / 2) / (rect.height / 2)) * -15;
    const rotateY = ((x - rect.width / 2) / (rect.width / 2)) * 15;
    setTiltStyle({
      transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.05, 1.05, 1.05)`,
      transition: 'transform 0.1s ease-out',
    });
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    setTiltStyle({
      transform: `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`,
      transition: 'transform 0.5s ease-out',
    });
  };

  const battlePerkMeta = card.perk ? PERK_META[card.perk] : null;
  const installedEmerald = viewingCard.emerald
    ? emeraldTypes.find((t) => t.id === Number(viewingCard.emerald)) || null
    : null;
  const emeraldBoostPct = installedEmerald ? installedEmerald.perkBoostPercent : 0;
  const boostedPerkValue = card.perkValue != null && emeraldBoostPct
    ? Math.round(card.perkValue * (1 + emeraldBoostPct / 100))
    : card.perkValue;

  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto bg-black/90 backdrop-blur-md animate-in fade-in duration-300"
      onClick={() => setViewingCard(null)}
    >
      <div
        className="flex min-h-full items-center justify-center px-10 py-8"
      >
      <div
        className="relative flex flex-col items-center w-full max-w-xs animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setViewingCard(null)}
          className="self-end mb-2 text-neutral-400 hover:text-white font-bold tracking-widest uppercase transition-colors"
        >
          Закрити ✕
        </button>

        <div
          className="preserve-3d w-full rounded-3xl"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onMouseEnter={() => setIsHovering(true)}
          onTouchMove={(e) => handleMouseMove(e.touches[0])}
          onTouchEnd={handleMouseLeave}
          style={tiltStyle}
        >
          {cardContent}
          {isHovering && (
            <div className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-30 bg-gradient-to-tr from-white/0 via-white to-white/0 z-30 rounded-3xl" />
          )}
        </div>

        <div className="mt-6 flex flex-col items-center text-center w-full">
          <div className={`text-sm font-black uppercase tracking-widest mb-2 ${style.text} flex items-center gap-1.5`}>
            <Sparkles size={16} /> {card.rarity}
          </div>
          <h3 className="font-black text-4xl text-white mb-2 drop-shadow-xl">{card.name}</h3>
        </div>

        {/* Battle perk from catalog */}
        {battlePerkMeta && (
          <div className="w-full mt-2">
            <div className="text-xs text-neutral-500 font-semibold uppercase tracking-widest mb-2">Перк бою</div>
            <div className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border border-white/10 ${battlePerkMeta.bg}`}>
              <div className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full bg-black/40 ${battlePerkMeta.color}`}>
                {React.createElement(battlePerkMeta.icon, { size: 16, strokeWidth: 2.5 })}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-bold ${battlePerkMeta.color}`}>{battlePerkMeta.label}</span>
                  {card.perkValue != null && (
                    <div className="flex items-center gap-1.5">
                      {installedEmerald ? (
                        <>
                          <span className="text-xs text-neutral-500 line-through">{card.perkValue}%</span>
                          <span className="text-xs font-black text-emerald-400">{boostedPerkValue}%</span>
                        </>
                      ) : (
                        <span className="text-xs text-neutral-400">{card.perkValue}%</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-xs text-neutral-400 mt-0.5">{battlePerkMeta.desc}</div>
              </div>
            </div>
            {/* Emerald badge */}
            {installedEmerald && (
              <div
                className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl border"
                style={{ backgroundColor: installedEmerald.color + '18', borderColor: installedEmerald.color + '55' }}
              >
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: installedEmerald.color }}
                >
                  <Gem size={10} className="text-white" />
                </div>
                <span className="text-xs font-bold" style={{ color: installedEmerald.color }}>
                  {installedEmerald.name}
                </span>
                <span className="text-xs text-neutral-400 ml-auto">
                  +{installedEmerald.perkBoostPercent}% до перку
                </span>
              </div>
            )}
          </div>
        )}

        {/* Instance perks from feeding system */}
        {instancePerks.length > 0 && (
          <div className="w-full mt-3">
            <div className="text-xs text-neutral-500 font-semibold uppercase tracking-widest mb-2">Перки прокачки</div>
            <div className="flex flex-col gap-2">
              {instancePerks.map((perk, i) => (
                <InstancePerkRow
                  key={i}
                  perk={perk}
                  catalogEntry={perkCatalog.find(p => p.type === perk.type)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
