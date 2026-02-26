import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { getCardStyle } from '../utils/helpers';
import CardFrame from "./CardFrame";

export default function CardModal({ viewingCard, setViewingCard, rarities }) {
  const [tiltStyle, setTiltStyle] = useState({});
  const [isHovering, setIsHovering] = useState(false);

  if (!viewingCard) return null;
  const { card } = viewingCard;
  const style = getCardStyle(card.rarity, rarities);
  const effectClass = card.effect ? `effect-${card.effect}` : '';

  const handleMouseMove = (e) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -15;
    const rotateY = ((x - centerX) / centerX) * 15;

    setTiltStyle({
      transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.05, 1.05, 1.05)`,
      transition: 'transform 0.1s ease-out'
    });
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    setTiltStyle({
      transform: `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`,
      transition: 'transform 0.5s ease-out'
    });
  };

  const handleMouseEnter = () => {
    setIsHovering(true);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300 perspective-1000" onClick={() => setViewingCard(null)}>
      <div className="relative flex flex-col items-center w-full max-w-sm animate-in zoom-in-95 slide-in-from-bottom-10 duration-500" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setViewingCard(null)} className="absolute -top-12 right-0 text-neutral-400 hover:text-white font-bold tracking-widest uppercase transition-colors">Закрити ✕</button>

        <div
          className="preserve-3d w-full"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onMouseEnter={handleMouseEnter}
          onTouchMove={(e) => handleMouseMove(e.touches[0])}
          onTouchEnd={handleMouseLeave}
          style={tiltStyle}
        >
          <div
            className={`w-full aspect-[2/3] rounded-3xl border-4 overflow-hidden ${style.border} ${effectClass} relative group shadow-[0_20px_70px_rgba(0,0,0,0.8)]`}
          >
            <CardFrame frame={card.frame}>
              <img src={card.image} alt={card.name} className="w-full h-full object-cover" />
            </CardFrame>
            {card.effect && <div className={`${card.effect} pointer-events-none z-10`} />}
            {/* Відблиск світла при нахилі */}
            {isHovering && (
              <div className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-30 bg-gradient-to-tr from-white/0 via-white to-white/0"></div>
            )}
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center text-center w-full">
          <div className={`text-sm font-black uppercase tracking-widest mb-2 ${style.text} flex items-center gap-1.5`}>
            <Sparkles size={16} /> {card.rarity}
          </div>
          <h3 className="font-black text-4xl text-white mb-2 drop-shadow-xl">{card.name}</h3>
        </div>
      </div>
    </div>
  );
}