import React, { useState, useEffect, useRef } from 'react';
import { Rocket, Coins, Loader2, Play, Flame } from 'lucide-react';
import { startCrashGameRequest, claimCrashRewardRequest } from '../config/api';

export default function GameCrash({ profile, setProfile, goBack, showToast }) {
  const [bet, setBet] = useState(10);
  const [multiplier, setMultiplier] = useState(1.0);
  const [status, setStatus] = useState('idle'); // idle, playing, crashed
  const [gameId, setGameId] = useState(null);
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [winStatus, setWinStatus] = useState(null);
  const [cashedOutAt, setCashedOutAt] = useState(null);

  const animationRef = useRef(null);
  const startTimeRef = useRef(0);
  const hasCashedOutRef = useRef(false);
  const canvasRef = useRef(null);
  const rocketRef = useRef(null);
  const pathRef = useRef([]);

  useEffect(() => {
    return () => cancelAnimationFrame(animationRef.current);
  }, []);

  const handleStart = async () => {
    if (bet < 10) return showToast('Мінімальна ставка 10 монет.', 'error');
    if ((profile?.coins || 0) < bet) return showToast('Недостатньо монет.', 'error');

    setIsLoading(true);
    setWinStatus(null);
    setCashedOutAt(null);
    hasCashedOutRef.current = false;

    try {
      const data = await startCrashGameRequest(localStorage.getItem('token'), bet);
      if (setProfile) setProfile(data.profile);
      setGameId(data.gameId);
      setStatus('playing');
      pathRef.current = [];

      let lastFrameTime = Date.now();
      let simulatedTimeElapsed = 0;

      const animate = () => {
        if (!canvasRef.current || !rocketRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const rocket = rocketRef.current;

        // Синхროнізуємо розмір canvas з його відображенням
        if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
          canvas.width = canvas.offsetWidth;
          canvas.height = canvas.offsetHeight;
        }

        const width = canvas.width;
        const height = canvas.height;

        const now = Date.now();
        const deltaTime = now - lastFrameTime;
        lastFrameTime = now;

        // Якщо гравець вже забрав гроші, пришвидшуємо час у 5 разів
        const timeScale = hasCashedOutRef.current ? 5 : 1;
        simulatedTimeElapsed += deltaTime * timeScale;

        // Розрахунок множника
        const M = Math.max(1.0, Math.exp(0.00006 * simulatedTimeElapsed));

        if (M >= data.crashPoint) {
          setMultiplier(data.crashPoint);
          setStatus('crashed');
          setHistory((prev) => [data.crashPoint, ...prev].slice(0, 5));
          if (!hasCashedOutRef.current) {
            setWinStatus({ result: 'loss', amount: bet });
          }

          // Останній кадр крашу: перемальовуємо лінію червоним
          // Окрім цього, треба не забути, що canvas поточного кадру міг не встигнути оновитись
          // для M=crashPoint (бо M < crashPoint було в минулому).
          // Але для простоти ми просто поверх малюємо червону лінію по існуючому path
          ctx.beginPath();
          if (pathRef.current && pathRef.current.length > 0) {
            // Відтворюємо scaledPath для останнього M
            const currentMaxM = Math.max(2.0, data.crashPoint);
            const currentMaxTime = Math.max(10000, simulatedTimeElapsed);
            const finalPath = pathRef.current.map((p) => {
              let px = p.time / currentMaxTime;
              const x = 10 + width * 0.85 * px;
              const progressY = (p.m - 1) / (currentMaxM - 1);
              const y = height - 10 - height * 0.8 * progressY;
              return { x, y };
            });

            if (finalPath.length > 0) {
              ctx.moveTo(finalPath[0].x, finalPath[0].y);
              for (let i = 1; i < finalPath.length; i++) {
                ctx.lineTo(finalPath[i].x, finalPath[i].y);
              }
              ctx.strokeStyle = '#ef4444'; // червоний
              ctx.lineWidth = 4;
              ctx.stroke();

              // Переміщуємо і ракету туди ж, щоб вогонь був у кінці лінії
              const lastP = finalPath[finalPath.length - 1];
              rocket.style.transform = `translate(${lastP.x}px, ${lastP.y - height + 10}px)`;
            }
          }

          return;
        }

        setMultiplier(M);

        // Зберігаємо не фізичні координати екрану, а координати [0...1] (прогрес часу і множника)
        // замість жорсткої прив'язки до Х.
        // Логіка: графік має відмальовувати реальну функцію M = e^(k*t).
        pathRef.current.push({ time: simulatedTimeElapsed, m: M });

        // Очищаємо canvas
        ctx.clearRect(0, 0, width, height);

        // --- Логіка відмальовки графіка ---
        // Визначаємо динамічний масштаб для графіка.
        const currentMaxM = Math.max(2.0, M);
        const currentMaxTime = Math.max(10000, simulatedTimeElapsed); // Спочатку Х фіксований до 10 сек (доки йде розгін)

        // Перераховуємо ВСІ попередні точки з новим масштабом, щоб графік "стягувався"
        const scaledPath = pathRef.current.map((p) => {
          // X залежить тільки від часу. Коли час > 10с, графік починає стискатися по Х (ілюзія польоту вперед)
          let px = p.time / currentMaxTime;
          // Робимо відступ 10% справа, щоб ракета не билася в екран
          const x = 10 + width * 0.85 * px;

          // Y залежить напряму від поточного значення M відносно currentMaxM
          // Оскільки M росте експоненційно, графік теж буде експоненціально загинатися вгору.
          const progressY = (p.m - 1) / (currentMaxM - 1);
          const y = height - 10 - height * 0.8 * progressY;

          return { x, y };
        });

        // Малюємо лінію
        if (scaledPath.length > 1) {
          ctx.beginPath();
          ctx.moveTo(scaledPath[0].x, scaledPath[0].y);
          for (let i = 1; i < scaledPath.length; i++) {
            ctx.lineTo(scaledPath[i].x, scaledPath[i].y);
          }

          const lastPoint = scaledPath[scaledPath.length - 1];

          // Градієнт сліду
          const gradient = ctx.createLinearGradient(0, height, width, 0);
          gradient.addColorStop(0, '#f43f5e'); // rose-500
          gradient.addColorStop(1, '#eab308'); // yellow-500

          ctx.strokeStyle = gradient;
          ctx.lineWidth = 6;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.shadowColor = 'rgba(234, 179, 8, 0.5)';
          ctx.shadowBlur = 15;
          ctx.stroke();

          // Заливка під графіком
          ctx.lineTo(lastPoint.x, height);
          ctx.lineTo(10, height);
          ctx.closePath();

          const fillGradient = ctx.createLinearGradient(0, 0, 0, height);
          fillGradient.addColorStop(0, 'rgba(244, 63, 94, 0.2)');
          fillGradient.addColorStop(1, 'rgba(244, 63, 94, 0)');
          ctx.fillStyle = fillGradient;
          ctx.fill();

          // Пунктирна лінія від самої ракети вниз
          ctx.beginPath();
          ctx.setLineDash([6, 6]);
          ctx.moveTo(lastPoint.x, lastPoint.y);
          ctx.lineTo(lastPoint.x, height);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.lineWidth = 2;
          ctx.stroke();

          // Пунктирні лінії (слід), залишені на графіку кожні 0.2x
          ctx.beginPath();
          for (let markM = 1.2; markM <= M; markM += 0.2) {
            // Знайдемо відповідну точку X і Y для цього множника markM
            // X лінійно залежить від часу, який потрібен щоб досягти markM.
            // Із M = exp(0.00006 * time), time = ln(M) / 0.00006
            const markTime = Math.log(markM) / 0.00006;

            // Якщо час маркера раптом більший за поточний час гри, пропускаємо (хоча цикл це страхує)
            if (markTime > simulatedTimeElapsed) continue;

            const px = markTime / currentMaxTime;
            const x = 10 + width * 0.85 * px;

            const py = (markM - 1) / (currentMaxM - 1);
            const y = height - 10 - height * 0.8 * py;

            ctx.moveTo(x, y);
            ctx.lineTo(x, height);
          }
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'; // трохи тьмяніше за основний
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.setLineDash([]); // Скидаємо пунктир

          // Розрахунок кута нахилу ракети
          let angle = 0; // В градусах (x, y координати. y зростає вниз)
          if (scaledPath.length > 1) {
            const p1 = scaledPath[scaledPath.length - 2];
            const p2 = scaledPath[scaledPath.length - 1];
            // Math.atan2(y2 - y1, x2 - x1)
            // Але так як Y йде зверху вниз, то чим вище - тим Y менший.
            const dy = p2.y - p1.y;
            const dx = p2.x - p1.x;
            // Конвертація в градуси (+90 оскільки іконка ракети початково дивиться вгору (або під кутом 45).
            // Іконка Lucide Rocket за замовчуванням дивиться вправо-вгору під 45 градусів.
            // Нам треба компенсувати її базовий нахил
            angle = Math.atan2(dy, dx) * (180 / Math.PI) + 45;
          }

          // Рухаємо саму ракету (DOM елемент) на останню відмальовану точку з обертанням
          rocket.style.transform = `translate(${lastPoint.x}px, ${lastPoint.y - height + 10}px) rotate(${angle}deg)`;
        }

        animationRef.current = requestAnimationFrame(animate);
      };

      animationRef.current = requestAnimationFrame(animate);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCashout = async () => {
    if (status !== 'playing' || hasCashedOutRef.current) return;

    hasCashedOutRef.current = true;
    const currentM = multiplier;
    setCashedOutAt(currentM);

    try {
      const data = await claimCrashRewardRequest(localStorage.getItem('token'), gameId, currentM);
      if (setProfile) setProfile(data.profile);
      setWinStatus({ result: 'win', amount: data.winAmount });
      showToast(`Виграш: ${data.winAmount} монет!`, 'success');
    } catch (err) {
      showToast(err.message || 'Помилка!', 'error');
      hasCashedOutRef.current = false;
      setCashedOutAt(null);
    }
  };

  const getMultiplierColor = (m) => {
    if (m < 2) return 'text-neutral-400';
    if (m < 5) return 'text-purple-400';
    if (m < 10) return 'text-green-400';
    return 'text-yellow-400 font-extrabold shadow-yellow-500/50 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]';
  };

  return (
    <div className="w-full flex justify-center pb-10 animate-in fade-in zoom-in-95 duration-500 p-2">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 w-full max-w-2xl shadow-xl mt-4">
        <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 p-4">
          {/* Заголовок та Історія */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <Rocket size={32} className="text-red-500" />
              <h1 className="text-3xl font-black text-white tracking-widest uppercase">Crash</h1>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full sm:w-auto">
              {history.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 w-full sm:w-auto scrollbar-hide py-2 px-1">
                  {history.map((m, idx) => (
                    <div
                      key={idx}
                      className={`px-3 py-1 rounded-lg text-sm font-bold shadow-md ${getMultiplierColor(m)}`}
                    >
                      {m.toFixed(2)}x
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={goBack}
                className="text-neutral-400 hover:text-white transition-colors text-sm font-bold ml-auto"
              >
                Повернутися
              </button>
            </div>
          </div>
        </div>

        {/* Екран гри */}
        <div className="relative bg-neutral-950 rounded-2xl h-64 sm:h-80 w-full mb-6 border-2 flex-shrink-0 border-neutral-800 overflow-hidden shadow-inner">
          {/* Сітка на фоні */}
          <div
            className="absolute inset-0 opacity-[0.15]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
              backgroundSize: '30px 30px',
              backgroundPosition: 'center bottom',
            }}
          />

          {/* Canvas для відмальовки сліду ракети */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full z-0"
            style={{ opacity: status !== 'idle' ? 1 : 0 }}
          />

          {/* Множник в центрі екрану */}
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center z-10 transition-transform ${status === 'crashed' ? 'scale-110' : ''}`}
          >
            <div
              className={`text-6xl sm:text-7xl font-black font-mono tracking-tighter ${status === 'crashed' ? 'text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.5)]' : getMultiplierColor(multiplier)}`}
            >
              {multiplier.toFixed(2)}x
            </div>
            {status === 'crashed' && (
              <div className="text-red-500 mt-2 font-black tracking-widest uppercase animate-pulse">
                КРАШ!
              </div>
            )}
            {cashedOutAt && status !== 'crashed' && (
              <div className="text-green-500 mt-2 font-black tracking-widest uppercase bg-green-900/30 px-4 py-1 rounded-full border border-green-500/30">
                Забрано на {cashedOutAt.toFixed(2)}x
              </div>
            )}
          </div>

          {/* Ракета (встановлюється через canvas) */}
          <div
            ref={rocketRef}
            className="absolute pointer-events-none z-20 transition-opacity duration-300"
            style={{
              opacity: status !== 'idle' ? 1 : 0,
              left: '10px',
              bottom: '10px',
            }}
          >
            <div className="relative -ml-4 -mb-4">
              {status === 'crashed' ? (
                <Flame size={56} className="text-red-500 animate-ping absolute bottom-0 left-0" />
              ) : (
                <Rocket
                  size={48}
                  className={`text-white drop-shadow-[0_10px_15px_rgba(220,38,38,0.6)] ${multiplier > 5 ? 'animate-bounce' : ''}`}
                  style={{}}
                />
              )}
            </div>
          </div>
        </div>

        {/* Результат раунду */}
        {winStatus && status === 'crashed' && (
          <div
            className={`mb-4 p-4 rounded-xl text-center font-bold text-lg animate-in slide-in-from-bottom-2 ${winStatus.result === 'win' ? 'bg-green-900/40 text-green-400 border border-green-500/50' : 'bg-red-900/40 text-red-500 border border-red-500/50'}`}
          >
            {winStatus.result === 'win'
              ? `🎉 Ви виграли ${winStatus.amount} монет!`
              : `💻 Ви програли ${winStatus.amount} монет.`}
          </div>
        )}

        {/* Панель управління */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="w-full sm:w-1/3">
            <label className="text-neutral-500 font-bold text-xs uppercase tracking-wider mb-2 block">
              Ставка (Монети)
            </label>
            <div className="flex flex-col gap-2">
              <div className="relative group">
                <input
                  type="number"
                  value={bet}
                  onChange={(e) => setBet(Number(e.target.value))}
                  disabled={status === 'playing' || isLoading}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 sm:py-4 text-white font-black text-lg outline-none focus:border-red-500 transition-colors pl-10 placeholder-neutral-700 disabled:opacity-50"
                  min="10"
                />
                <Coins
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-yellow-500"
                  size={20}
                />
              </div>

              <div className="flex gap-2 w-full">
                <button
                  disabled={status === 'playing' || isLoading}
                  onClick={() => setBet((b) => Math.max(10, Math.floor(b / 2)))}
                  className="flex-1 bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700 py-2 rounded-xl font-bold transition-colors disabled:opacity-50"
                >
                  /2
                </button>
                <button
                  disabled={status === 'playing' || isLoading}
                  onClick={() => setBet((b) => b * 2)}
                  className="flex-1 bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700 py-2 rounded-xl font-bold transition-colors disabled:opacity-50"
                >
                  x2
                </button>
                <button
                  disabled={status === 'playing' || isLoading}
                  onClick={() => setBet(Math.max(10, profile?.coins || 0))}
                  className="flex-1 bg-red-900/30 text-red-400 hover:text-white hover:bg-red-600 py-2 rounded-xl font-bold border border-red-500/20 transition-colors disabled:opacity-50"
                >
                  MAX
                </button>
              </div>
            </div>
          </div>

          <div className="w-full sm:w-2/3 flex items-end">
            {status === 'playing' ? (
              <button
                onClick={handleCashout}
                disabled={hasCashedOutRef.current}
                className={`w-full h-14 sm:h-auto sm:aspect-[4/1] rounded-xl font-black text-lg uppercase tracking-widest transition-all ${hasCashedOutRef.current ? 'bg-neutral-800 text-neutral-600 border border-neutral-700' : 'bg-green-600 hover:bg-green-500 text-white shadow-[0_0_30px_rgba(22,163,74,0.5)] transform hover:-translate-y-1'}`}
              >
                {hasCashedOutRef.current
                  ? 'Очікування...'
                  : `Забрати ${(bet * multiplier).toFixed(0)}`}
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={isLoading}
                className="w-full h-14 sm:h-auto sm:aspect-[4/1] rounded-xl font-black text-lg uppercase tracking-widest transition-all text-white bg-red-600 hover:bg-red-500 shadow-[0_0_30px_rgba(220,38,38,0.5)] transform hover:-translate-y-1 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:transform-none disabled:shadow-none"
              >
                {isLoading ? (
                  <Loader2 size={24} className="animate-spin" />
                ) : (
                  <>
                    <Rocket
                      size={20}
                      className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform"
                    />{' '}
                    Запуск
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

