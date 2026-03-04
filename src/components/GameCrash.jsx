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
      setMultiplier(1.0);
      startTimeRef.current = Date.now();

      const animate = () => {
        const timeElapsed = Date.now() - startTimeRef.current;
        const M = Math.max(1.0, Math.exp(0.00006 * timeElapsed));

        if (M >= data.crashPoint) {
          setMultiplier(data.crashPoint);
          setStatus('crashed');
          setHistory((prev) => [data.crashPoint, ...prev].slice(0, 5));
          if (!hasCashedOutRef.current) {
            setWinStatus({ result: 'loss', amount: bet });
          }
          return;
        }

        setMultiplier(M);
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
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-black text-white uppercase tracking-widest flex items-center gap-2">
            <Rocket className="text-red-500" size={32} /> Crash
          </h2>
          <button
            onClick={goBack}
            className="text-sm font-bold text-neutral-400 hover:text-white transition-colors"
          >
            Повернутися
          </button>
        </div>

        {/* Історія */}
        {history.length > 0 && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
            {history.map((h, i) => (
              <span
                key={i}
                className={`px-3 py-1 bg-neutral-950 rounded-lg text-xs font-mono font-bold border border-neutral-800 ${getMultiplierColor(h)}`}
              >
                {h.toFixed(2)}x
              </span>
            ))}
          </div>
        )}

        {/* Екран гри */}
        <div className="relative bg-neutral-950 rounded-2xl h-64 sm:h-80 w-full mb-6 border-2 flex-shrink-0 border-neutral-800 overflow-hidden flex flex-col justify-end items-center shadow-inner">
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

          {/* Анімація ракети */}
          {status !== 'idle' && (
            <div
              className="absolute left-[20%] transition-all duration-75 ease-linear pointer-events-none"
              style={{ bottom: `${Math.min(80, (multiplier - 1) * 20)}%` }}
            >
              {status === 'crashed' ? (
                <Flame size={56} className="text-red-500 animate-ping -ml-2" />
              ) : (
                <Rocket
                  size={48}
                  className={`text-white drop-shadow-[0_10px_15px_rgba(220,38,38,0.6)] ${multiplier > 5 ? 'animate-bounce' : ''}`}
                />
              )}
            </div>
          )}
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

              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  disabled={status === 'playing' || isLoading}
                  onClick={() => setBet((b) => Math.max(10, Math.floor(b / 2)))}
                  className="bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700 text-xs px-2 py-1 rounded-md font-bold transition-colors"
                >
                  /2
                </button>
                <button
                  disabled={status === 'playing' || isLoading}
                  onClick={() => setBet((b) => b * 2)}
                  className="bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700 text-xs px-2 py-1 rounded-md font-bold transition-colors"
                >
                  x2
                </button>
                <button
                  disabled={status === 'playing' || isLoading}
                  onClick={() => setBet(Math.max(10, profile?.coins || 0))}
                  className="bg-red-900/30 text-red-400 hover:text-white hover:bg-red-600 text-xs px-2 py-1 rounded-md font-bold border border-red-500/20 transition-colors"
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
}
