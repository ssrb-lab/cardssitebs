import React, { useId, memo } from 'react';
import Particles from '@tsparticles/react';

const PlexusEffect = memo(() => {
  const particlesId = useId();

  const particlesConfig = {
    fullScreen: { enable: false },
    fpsLimit: 60,
    particles: {
      color: {
        value: '#ffffff',
      },
      links: {
        color: '#ffffff',
        distance: 25, // 25% від розміру картки - тепер масштаб завжди однаковий!
        enable: true,
        opacity: 0.5,
        width: 1.5,
      },
      move: {
        direction: 'none',
        enable: true,
        outModes: {
          default: 'out',
        },
        random: false,
        speed: 1.2,
        straight: false,
      },
      number: {
        density: {
          enable: false, // Вимикаємо залежність від пікселів
        },
        value: 20, // Фіксована кількість часточок
      },
      opacity: {
        value: 0.5,
      },
      shape: {
        type: 'circle',
      },
      size: {
        value: { min: 0.5, max: 1.5 }, // Розмір тепер теж відносний (у відсотках)
      },
    },
    detectRetina: true,
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
      <Particles
        id={particlesId}
        className="w-full h-full"
        options={particlesConfig}
      />
    </div>
  );
});

export default PlexusEffect;
