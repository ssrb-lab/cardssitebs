import React, { useRef, useEffect } from 'react';

export default function ElectricEffect() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let width, height;

    const resize = () => {
      const parent = canvas.parentElement;
      width = parent.clientWidth;
      height = parent.clientHeight;
      canvas.width = width;
      canvas.height = height;
    };

    window.addEventListener('resize', resize);
    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) {
      observer.observe(canvas.parentElement);
    }
    resize();

    // Масив для зберігання активних блискавок
    let bolts = [];

    const createBolt = (startX, startY, destX, destY, thickness) => {
      const bolt = [];
      let currentX = startX;
      let currentY = startY;
      bolt.push({ x: currentX, y: currentY });

      const dx = destX - startX;
      const dy = destY - startY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Кількість кроків залежить від розміру (масштабування)
      const steps = Math.max(5, Math.floor(dist / (width * 0.1))); 
      
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const targetX = startX + dx * t;
        const targetY = startY + dy * t;
        
        // Відхилення пропорційне ширині (масштабування)
        const deviation = (Math.random() - 0.5) * (width * 0.25);
        
        currentX = targetX + deviation;
        currentY = targetY + deviation;
        bolt.push({ x: currentX, y: currentY });
      }
      bolt.push({ x: destX, y: destY });
      return { path: bolt, thickness, alpha: 1 };
    };

    const draw = () => {
      // Повністю очищуємо канвас, щоб не було накопичення кольору (перманентного висвітлення)
      ctx.shadowBlur = 0;
      ctx.clearRect(0, 0, width, height);

      // Випадкове створення нової блискавки (шанс 4% на кадр)
      if (Math.random() < 0.04) {
        // Починаємо зверху або збоку
        const isTop = Math.random() > 0.5;
        const startX = isTop ? Math.random() * width : (Math.random() > 0.5 ? 0 : width);
        const startY = isTop ? 0 : Math.random() * height;
        
        const destX = startX + (Math.random() - 0.5) * width;
        const destY = height;
        
        // Товщина блискавки залежить від розміру картки
        const mainThickness = Math.max(1, width * 0.015);
        bolts.push(createBolt(startX, startY, destX, destY, mainThickness));
        
        // Генерація побічного відгалуження
        if (Math.random() < 0.6) {
          const midY = height * (0.3 + Math.random() * 0.4);
          const branchDestX = destX + (Math.random() - 0.5) * width;
          bolts.push(createBolt(startX, startY, branchDestX, midY, mainThickness * 0.5));
        }
      }

      // Відмальовування блискавок
      for (let i = bolts.length - 1; i >= 0; i--) {
        const bolt = bolts[i];
        if (bolt.alpha <= 0.05) {
          bolts.splice(i, 1);
          continue;
        }

        ctx.beginPath();
        ctx.moveTo(bolt.path[0].x, bolt.path[0].y);
        for (let j = 1; j < bolt.path.length; j++) {
          ctx.lineTo(bolt.path[j].x, bolt.path[j].y);
        }

        // Синє світіння
        ctx.strokeStyle = `rgba(100, 200, 255, ${bolt.alpha})`;
        ctx.lineWidth = bolt.thickness;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.shadowBlur = width * 0.05; // Bloom масштабується
        ctx.shadowColor = '#00ffff';
        ctx.stroke();

        // Біле ядро блискавки
        ctx.strokeStyle = `rgba(255, 255, 255, ${bolt.alpha * 1.5})`;
        ctx.lineWidth = bolt.thickness * 0.3;
        ctx.shadowBlur = width * 0.02;
        ctx.stroke();

        bolt.alpha -= 0.08; // Швидкість затухання спалаху
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden rounded-[inherit] mix-blend-screen animate-[electric-pulse_0.4s_infinite_alternate]">
      <style>{`
        @keyframes electric-pulse {
          0% { box-shadow: inset 0 0 8px rgba(0, 255, 255, 0.4); }
          100% { box-shadow: inset 0 0 25px rgba(0, 255, 255, 0.8); }
        }
      `}</style>
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
