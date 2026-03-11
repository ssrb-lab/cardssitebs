import React, { useState } from 'react';
import CardFrame from '../components/CardFrame';
import { FRAME_OPTIONS, EFFECT_OPTIONS, DEFAULT_RARITIES, COLOR_PRESETS } from '../config/constants';
import { Sparkles } from 'lucide-react';

export default function EffectsPreview() {
  const [isTiltEnabled, setIsTiltEnabled] = useState(true);
  const sampleImage = 'https://placehold.co/400x600/1a1a1a/ffffff?text=Preview\nCard';

  return (
    <div className="min-h-screen bg-black text-white p-8 pb-20">
      <div className="max-w-7xl mx-auto">
        <header className="mb-12 border-b border-neutral-800 pb-8">
          <h1 className="text-5xl font-black mb-4 bg-gradient-to-r from-purple-500 to-fuchsia-500 bg-clip-text text-transparent uppercase tracking-tighter">
            Card Effects Showcase
          </h1>
          <p className="text-neutral-400 text-lg max-w-2xl mb-6">
            Тут зібрані всі можливі рамки та візуальні ефекти. Використовуй цю сторінку для 
            фінального налаштування дизайну карток перед продакшном.
          </p>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsTiltEnabled(!isTiltEnabled)}
              className={`px-6 py-3 rounded-xl font-bold transition-all ${
                isTiltEnabled ? 'bg-fuchsia-600 text-white shadow-[0_0_20px_rgba(217,70,239,0.5)]' : 'bg-neutral-800 text-neutral-400'
              }`}
            >
              Ефект нахилу (Tilt): {isTiltEnabled ? 'УВІМКНЕНО' : 'ВИМКНЕНО'}
            </button>
          </div>
        </header>

        {/* SECTION: FRAMES */}
        <section className="mb-20">
          <h2 className="text-3xl font-black mb-8 flex items-center gap-3 uppercase tracking-tight">
            <span className="text-amber-500">01.</span> Рамки (Frames)
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8">
            {FRAME_OPTIONS.map((frame) => (
              <div key={frame.id} className="flex flex-col items-center">
                <div className="w-full aspect-[2/3] mb-4">
                  <TiltWrapper isEnabled={isTiltEnabled}>
                    <CardFrame frame={frame.id} className="w-full h-full shadow-2xl">
                      <img src={sampleImage} alt={frame.name} className="w-full h-full object-cover" />
                    </CardFrame>
                  </TiltWrapper>
                </div>
                <div className="text-center">
                  <div className="font-black text-sm uppercase tracking-widest text-neutral-500 mb-1">ID: {frame.id}</div>
                  <div className="text-lg font-bold">{frame.name}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION: EFFECTS */}
        <section className="mb-20">
          <h2 className="text-3xl font-black mb-8 flex items-center gap-3 uppercase tracking-tight">
            <span className="text-purple-500">02.</span> Візуальні Ефекти (Effects)
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-8">
            {EFFECT_OPTIONS.map((effect) => (
              <div key={effect.id} className="flex flex-col items-center">
                <div className="w-full aspect-[2/3] mb-4">
                  <TiltWrapper isEnabled={isTiltEnabled}>
                    <CardFrame 
                      effect={effect.id}
                      className={`w-full h-full shadow-2xl effect-${effect.id}`}
                    >
                      <img src={sampleImage} alt={effect.name} className="w-full h-full object-cover" />
                    </CardFrame>
                  </TiltWrapper>
                </div>
                <div className="text-center">
                  <div className="font-black text-sm uppercase tracking-widest text-neutral-500 mb-1">ID: {effect.id || 'none'}</div>
                  <div className="text-sm font-bold leading-tight">{effect.name}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION: COMBINATIONS */}
        <section>
          <h2 className="text-3xl font-black mb-8 flex items-center gap-3 uppercase tracking-tight">
            <span className="text-cyan-500">03.</span> Преміум комбінації
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-8">
            {[
              { f: 'gold', e: 'liquid-gold', n: 'Royal Gold', r: 'Легендарна' },
              { f: 'neon', e: 'glitch', n: 'Cyber Glitch', r: 'Унікальна' },
              { f: 'silver', e: 'cosmos', n: 'Star Voyager', r: 'Епічна' },
              { f: 'bronze', e: 'ember', n: 'Ancient Fire', r: 'Рідкісна' },
            ].map((combo, idx) => {
              const style = COLOR_PRESETS[DEFAULT_RARITIES.find(x => x.name === combo.r)?.color || 'gray'];
              return (
                <div key={idx} className="flex flex-col items-center">
                   <div className="w-full aspect-[2/3] mb-4">
                    <TiltWrapper isEnabled={isTiltEnabled}>
                      <CardFrame 
                        frame={combo.f}
                        effect={combo.e}
                        className={`w-full h-full shadow-2xl effect-${combo.e}`}
                      >
                        <img src={sampleImage} alt={combo.n} className="w-full h-full object-cover" />
                      </CardFrame>
                    </TiltWrapper>
                  </div>
                  <div className="text-center">
                    <div className={`text-[10px] font-black uppercase tracking-widest ${style.text} mb-1 flex items-center justify-center gap-1`}>
                      <Sparkles size={10} /> {combo.r}
                    </div>
                    <div className="text-xl font-black italic">{combo.n}</div>
                    <div className="text-xs text-neutral-500 mt-1 uppercase">{combo.f} + {combo.e}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function TiltWrapper({ children, isEnabled }) {
  const [tiltStyle, setTiltStyle] = useState({});

  if (!isEnabled) return <div className="w-full h-full">{children}</div>;

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
      transition: 'transform 0.1s ease-out',
    });
  };

  const handleMouseLeave = () => {
    setTiltStyle({
      transform: `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`,
      transition: 'transform 0.5s ease-out',
    });
  };

  return (
    <div
      className="w-full h-full cursor-pointer preserve-3d"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={tiltStyle}
    >
      {children}
    </div>
  );
}
