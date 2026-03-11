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
        distance: 150, // Збільшена дистанція для кращих зв'язків
        enable: true,
        opacity: 0.6, // Більш помітні лінії
        width: 1.5,
      },
      move: {
        direction: 'none',
        enable: true,
        outModes: {
          default: 'out', // Часточки вилітають і з'являються з іншого боку
        },
        random: false,
        speed: 1.2,
        straight: false,
      },
      number: {
        density: {
          enable: true,
          area: 800, // Стандартний знаменник площі
        },
        value: 180, // Це дасть ~20 часточок на маленькій картці та ~80 на великій
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
