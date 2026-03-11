import React, { useCallback } from 'react';
import Particles from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";

export default function EmberEffect() {
  // Генеруємо унікальний ID для кожного екземпляра ефекту
  const instanceId = React.useId().replace(/:/g, "");
  
  const particlesInit = useCallback(async (engine) => {
    await loadSlim(engine);
  }, []);

  const options = {
    fullScreen: { enable: false },
    fpsLimit: 60,
    particles: {
      number: {
        value: 20,
        density: { enable: false }
      },
      color: {
        value: ["#ff4500", "#ff8c00", "#ff0000", "#ffffff"]
      },
      shape: {
        type: "circle"
      },
      opacity: {
        value: { min: 0.2, max: 0.9 },
        animation: {
          enable: true,
          speed: 1,
          sync: false
        }
      },
      size: {
        value: { min: 0.5, max: 2 } // Зменшено розмір іскор
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
      shadow: {
        enable: true,
        color: "#ff4500",
        blur: 6 // Трохи зменшено світіння відповідно до розміру
      }
    },
    detectRetina: true,
    background: {
      color: "transparent"
    }
  };

  return (
    <div 
      className="absolute inset-0 pointer-events-none z-10 overflow-hidden rounded-[inherit] mix-blend-screen animate-[ember-glow_2.5s_infinite_alternate]"
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
        id={`tsparticles-ember-${instanceId}`}
        init={particlesInit}
        options={options}
        className="w-full h-full"
      />
    </div>
  );
}
