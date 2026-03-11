import React, { useEffect, useState } from 'react';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from 'tsparticles-slim';

export default function PlexusEffect() {
  const [init, setInit] = useState(false);

  // Ініціалізація рушія один раз
  useEffect(() => {
    initParticlesEngine(async (engine) => {
      // loadSlim завантажує базові можливості (включаючи лінії та частинки)
      await loadSlim(engine);
    }).then(() => {
      setInit(true);
    });
  }, []);

  const particlesConfig = {
    fullScreen: { enable: false }, // Важливо для використання всередині div, а не на весь екран
    fpsLimit: 60,
    particles: {
      color: {
        value: '#ffffff', // Білий колір частинок
      },
      links: {
        color: '#ffffff', // Колір ліній
        distance: 120, // Відстань, на якій утворюються зв'язки
        enable: true,
        opacity: 0.4,
        width: 1,
      },
      move: {
        direction: 'none',
        enable: true,
        outModes: {
          default: 'out', // Частинки виходять за межі
        },
        random: false,
        speed: 1.5, // Швидкість руху
        straight: false,
      },
      number: {
        density: {
          enable: false,
        },
        value: 20, // Оптимальна кількість для чистого вигляду
      },
      opacity: {
        value: 0.5,
      },
      shape: {
        type: 'circle',
      },
      size: {
        value: { min: 1, max: 2.5 },
      },
    },
    detectRetina: true,
  };

  if (!init) {
    return null;
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
      <Particles
        id={`plexus-${Math.random().toString(36).substr(2, 9)}`}
        className="w-full h-full"
        options={particlesConfig}
      />
    </div>
  );
}
