import React, { useId, memo, useRef, useState, useLayoutEffect } from 'react';
import Particles from '@tsparticles/react';

const PlexusEffect = memo(() => {
  const particlesId = useId();
  const containerRef = useRef();
  const [options, setOptions] = useState(null);

  useLayoutEffect(() => {
    if (containerRef.current) {
      // Вимірюємо реальну ширину контейнера
      const width = containerRef.current.offsetWidth || 200;
      
      // Базовий масштаб відносно стандартної ширини картки (200px)
      const scale = width / 200;

      setOptions({
        fullScreen: { enable: false },
        fpsLimit: 60,
        particles: {
          color: {
            value: '#ffffff',
          },
          links: {
            color: '#ffffff',
            distance: 100 * scale, // Дистанція масштабується пропорційно картці
            enable: true,
            opacity: 0.5,
            width: 1.5 * scale, // Товщина ліній теж масштабується
          },
          move: {
            direction: 'none',
            enable: true,
            outModes: {
              default: 'out',
            },
            random: false,
            speed: 1.2 * scale, // Швидкість масштабується
            straight: false,
          },
          number: {
            density: {
              enable: false, // Вимикаємо авто-щільність, бо ми самі все масштабуємо
            },
            value: 25, // Трохи збільшена кількість часточок
          },
          opacity: {
            value: 0.5,
          },
          shape: {
            type: 'circle',
          },
          size: {
            value: { min: 1 * scale, max: 3 * scale }, // Розмір часточок масштабується
          },
        },
        detectRetina: true,
      });
    }
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
      {options && (
        <Particles
          id={particlesId}
          className="w-full h-full"
          options={options}
        />
      )}
    </div>
  );
});

export default PlexusEffect;
