import React, { useCallback } from 'react';
import Particles from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";

export default function EmberEffect() {
  const particlesInit = useCallback(async (engine) => {
    await loadSlim(engine);
  }, []);

  const options = {
    fullScreen: { enable: false },
    fpsLimit: 60,
    particles: {
      number: {
        value: 20, // Зменшено кількість для чистоти
        density: { enable: false }
      },
      color: {
        value: ["#ff4500", "#ff8c00", "#ff0000", "#ffffff"]
      },
      shape: {
        type: "circle"
      },
      opacity: {
        value: { min: 0.2, max: 0.9 }, // Трохи яскравіші
        animation: {
          enable: true,
          speed: 1,
          sync: false
        }
      },
      size: {
        value: { min: 1.5, max: 3.5 } // Трохи більші для видимості світіння
      },
      move: {
        enable: true,
        speed: { min: 1, max: 3 },
        direction: "top",
        random: true,
        straight: false,
        outModes: {
          default: "out"
        },
        wobble: {
          enable: true,
          distance: 5,
          speed: 8
        }
      },
      // Посилене світіння навколо кожної жаринки
      shadow: {
        enable: true,
        color: "#ff4500",
        blur: 8 // Збільшено розмиття для м'якого світла
      }
    },
    detectRetina: true,
    background: {
      color: "transparent"
    }
  };

  return (
    <div 
      className="absolute inset-0 pointer-events-none z-10 overflow-hidden rounded-[inherit] animate-[ember-glow_2.5s_infinite_alternate]"
      style={{
        background: 'linear-gradient(to top, rgba(255, 50, 0, 0.1), transparent)'
      }}
    >
      <style>{`
        @keyframes ember-glow {
          0% { box-shadow: inset 0 -5px 15px rgba(255, 50, 0, 0.15); }
          100% { box-shadow: inset 0 -20px 45px rgba(255, 50, 0, 0.6); }
        }
      `}</style>
      <Particles
        id="tsparticles-ember"
        init={particlesInit}
        options={options}
        className="w-full h-full"
      />
    </div>
  );
}
