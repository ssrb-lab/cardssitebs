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
        distance: 120,
        enable: true,
        opacity: 0.4,
        width: 1.5,
      },
      move: {
        direction: 'none',
        enable: true,
        outModes: {
          default: 'out',
        },
        random: false,
        speed: 1.5,
        straight: false,
      },
      number: {
        density: {
          enable: true,
          area: 250, // Налаштування площі для збереження масштабу
        },
        value: 15, // Базова кількість точок на одиницю площі
      },
      opacity: {
        value: 0.5,
      },
      shape: {
        type: 'circle',
      },
      size: {
        value: { min: 1, max: 3 },
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
