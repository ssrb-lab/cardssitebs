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
        distance: "25%", // Тепер з символом %, щоб масштаб був відносним
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
          enable: false,
        },
        value: 20,
      },
      opacity: {
        value: 0.5,
      },
      shape: {
        type: 'circle',
      },
      size: {
        value: { min: 1, max: 3 }, // Повертаємо нормальний видимий розмір
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
