import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Coins,
  Trophy,
  Loader2,
  RotateCcw,
  Heart,
  Zap,
  Pause,
  Play,
  X,
} from 'lucide-react';
import { claimFuseRewardRequest, startFuseGameRequest, getToken } from '../config/api';

const GRID_SIZE = 25; // 5x5
const INITIAL_LIVES = 3;

export default function GameFuse({ profile, setProfile, goBack, showToast }) {
  const [board, setBoard] = useState([]);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(INITIAL_LIVES);
  const [gameOver, setGameOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [nextHeartScore, setNextHeartScore] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Memory Mechanics States
  const [phase, setPhase] = useState('memorize'); // 'memorize' or 'play'
  const [timeLeft, setTimeLeft] = useState(0);

  // States for visual feedback on click
  const [clickedError, setClickedError] = useState(null);

  const getLevelProgress = () => {
    const points = (profile?.fuseRepairedPoints || 0) + score;
    let virtualLevel = profile?.fuseLevel || 1;

    // Calculate dynamic level if they leveled up mid-game
    if (points >= 30000) virtualLevel = 5;
    else if (points >= 15000) virtualLevel = 4;
    else if (points >= 5000) virtualLevel = 3;
    else if (points >= 2000) virtualLevel = 2;

    let maxPoints = 0;
    if (virtualLevel === 1) maxPoints = 2000;
    else if (virtualLevel === 2) maxPoints = 5000;
    else if (virtualLevel === 3) maxPoints = 15000;
    else if (virtualLevel === 4) maxPoints = 30000;
    else return { current: points, max: 'MAX', percentage: 100, level: virtualLevel };

    const percentage = Math.min((points / maxPoints) * 100, 100).toFixed(1);
    return { current: points, max: maxPoints, percentage, level: virtualLevel };
  };

  const progressInfo = getLevelProgress();

  const generateLevel = () => {
    const currentLevel = progressInfo.level;
    let numDamaged;
    if (currentLevel === 1 || currentLevel === 2) {
      numDamaged = 5;
    } else if (currentLevel === 3 || currentLevel === 4) {
      numDamaged = 4;
    } else {
      numDamaged = 3;
    }

    const newBoard = Array(GRID_SIZE).fill({
      isDamaged: false,
      isFound: false,
      memoryFlipped: false,
    });

    let damagedCount = 0;
    while (damagedCount < numDamaged) {
      const idx = Math.floor(Math.random() * GRID_SIZE);
      if (!newBoard[idx].isDamaged) {
        newBoard[idx] = { isDamaged: true, isFound: false, memoryFlipped: false };
        damagedCount++;
      }
    }

    setBoard(newBoard);
    setClickedError(null);
    startMemorizePhase();
  };

  const startMemorizePhase = () => {
    setPhase('memorize');
    setTimeLeft(3); // 3 seconds to memorize
  };

  const togglePause = () => {
    // Cannot pause if game over or not initialized or processing
    if (gameOver || !isInitialized || isProcessing) return;

    setIsPaused((prev) => {
      const newPausedState = !prev;
      if (!newPausedState) {
        // Resuming game: regenerate level and restart memorize phase
        generateLevel();
      }
      return newPausedState;
    });
  };

  // Countdown logic for memorize phase
  useEffect(() => {
    if (phase === 'memorize' && timeLeft > 0 && !gameOver && !isPaused) {
      const timerId = setTimeout(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
      return () => clearTimeout(timerId);
    } else if (phase === 'memorize' && timeLeft === 0 && !gameOver && !isPaused) {
      // Timer ended, enter play phase and flip specific tiles visually
      setPhase('play');
      // We just need phase to trigger the visual hide in renderFuse
    }
  }, [phase, timeLeft, gameOver, isPaused]);

  const startGame = async (forceNew = false) => {
    setIsProcessing(true);
    try {
      let savedState = null;
      if (!forceNew) {
        try {
          const savedStr = localStorage.getItem('fuseGameSave');
          if (savedStr) {
            savedState = JSON.parse(savedStr);
          }
        } catch (err) {
          console.error('Error parsing save', err);
        }
      }

      await startFuseGameRequest(getToken());

      if (savedState && savedState.score !== undefined) {
        setScore(savedState.score);
        setLives(savedState.lives ?? INITIAL_LIVES);
        setNextHeartScore(savedState.nextHeartScore ?? 7);
        setGameOver(false);
        setPhase('memorize');
        setIsPaused(true);
        generateLevel();
        setIsInitialized(true);
      } else {
        setScore(0);
        setLives(INITIAL_LIVES);
        setGameOver(false);
        setPhase('memorize');
        const randomTarget = Math.floor(Math.random() * (15 - 7 + 1)) + 7;
        setNextHeartScore(randomTarget);
        setIsPaused(false);
        generateLevel();
        setIsInitialized(true);
      }
    } catch (e) {
      showToast(e.message || 'Не вдалося почати гру.', 'error');
      goBack();
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    startGame();
    // eslint-disable-next-line
  }, []);

  // Save progress dynamically
  useEffect(() => {
    if (isInitialized && !gameOver) {
      const saveData = { score, lives, nextHeartScore };
      localStorage.setItem('fuseGameSave', JSON.stringify(saveData));
    }
  }, [score, lives, nextHeartScore, isInitialized, gameOver]);

  const handleTileClick = (index) => {
    if (gameOver || isProcessing || phase === 'memorize' || isPaused) return;

    const tile = board[index];
    if (tile.isFound || tile.memoryFlipped) return; // Already clicked correctly

    if (tile.isDamaged) {
      // Correct click
      const newBoard = [...board];
      newBoard[index] = { ...tile, isFound: true, memoryFlipped: true };
      setBoard(newBoard);

      // Check if all damaged fuses are found
      const remainingDamaged = newBoard.filter((t) => t.isDamaged && !t.isFound).length;
      if (remainingDamaged === 0) {
        // Level complete!
        const newScore = score + 1;
        setScore(newScore);

        // Heart restoration logic
        if (newScore === nextHeartScore) {
          if (lives < INITIAL_LIVES) {
            setLives((prev) => prev + 1);
            showToast('+1 Життя!', 'success');
          }
          const nextTarget = newScore + Math.floor(Math.random() * (15 - 7 + 1)) + 7;
          setNextHeartScore(nextTarget);
        }

        setTimeout(() => {
          generateLevel();
        }, 1000); // Delay to let them see the last green highlight
      }
    } else {
      // Wrong click
      setClickedError(index);

      // Temporarily reveal the wrong fuse
      const newBoard = [...board];
      newBoard[index] = { ...tile, memoryFlipped: true };
      setBoard(newBoard);

      setTimeout(() => {
        setClickedError(null);
        // Hide it again
        setBoard((prevBoard) => {
          const b = [...prevBoard];
          b[index] = { ...b[index], memoryFlipped: false };
          return b;
        });
      }, 1000);

      const newLives = lives - 1;
      setLives(newLives);

      if (newLives <= 0) {
        setGameOver(true);
        // Reveal all
        setBoard(board.map((t) => ({ ...t, memoryFlipped: true })));
        localStorage.removeItem('fuseGameSave');
      }
    }
  };

  const getEarnedCoins = () => {
    return Math.floor(
      score *
      (progressInfo.level === 1
        ? 86
        : progressInfo.level === 2
          ? 172
          : progressInfo.level === 3
            ? 230
            : progressInfo.level === 4
              ? 431
              : 402) *
      (1 + Math.floor(score / 5) * 0.1)
    );
  };

  const claimReward = async () => {
    if (score < 1) {
      showToast('Ви не полагодили жодної плати!');
      return goBack();
    }
    setIsProcessing(true);
    try {
      const data = await claimFuseRewardRequest(getToken(), score);
      if (setProfile && data.profile) {
        setProfile(data.profile);
      }
      if (data.earned > 0) {
        showToast(`Ви отримали ${data.earned} монет за ремонт!`, 'success');
      } else {
        showToast('Ліміт фарму вичерпано, але прогрес гри збережено!', 'success');
      }
      localStorage.removeItem('fuseGameSave');
      goBack();
    } catch (e) {
      showToast(e.message || 'Помилка отримання нагороди.');
      setIsProcessing(false);
    }
  };

  if (!isInitialized) return null;

  // Render a Single Fuse SVG/CSS
  const renderFuse = (isDamaged, isFound, memoryFlipped) => {
    // If in memorize phase, show actual state.
    // If in play phase, only show if it was clicked (memoryFlipped)
    const showDamaged = phase === 'memorize' ? isDamaged : isDamaged && (isFound || memoryFlipped);

    // To handle the visual of clicking a wrong healthy fuse
    if (phase === 'play' && !isDamaged && memoryFlipped) {
      return (
        <div className="w-[70%] h-3 bg-red-100 relative rounded-sm rotate-45 flex items-center shadow-sm">
          {/* Just a simple clean fuse to show they clicked wrong but it was healthy */}
          <div className="absolute left-0 w-[20%] h-full bg-slate-300 border-r border-slate-400"></div>
          <div className="absolute right-0 w-[20%] h-full bg-slate-300 border-l border-slate-400"></div>
        </div>
      );
    }

    if (showDamaged) {
      return (
        <div
          className={`w-[70%] h-3 bg-orange-100 relative rounded-sm rotate-45 flex items-center shadow-sm overflow-hidden opacity-90 transition-transform duration-500`}
        >
          {/* Left Cap Rusty */}
          <div className="absolute left-0 w-[20%] h-full bg-orange-900 border-r border-orange-950"></div>
          {/* Center Break */}
          <div className="absolute inset-x-[20%] inset-y-0 flex items-center justify-center">
            <div className="w-full h-[2px] bg-black/40 rotate-[15deg]"></div>
            <div className="absolute inset-0 bg-orange-700/30 mix-blend-multiply"></div>
          </div>
          {/* Right Cap Metallic */}
          <div className="absolute right-0 w-[20%] h-full bg-slate-400 border-l border-slate-500"></div>
        </div>
      );
    }

    return (
      <div className="w-[70%] h-3 bg-white relative rounded-sm rotate-45 flex items-center shadow-sm transition-transform duration-500">
        {/* Left Cap */}
        <div className="absolute left-0 w-[20%] h-full bg-slate-300 border-r border-slate-400"></div>
        {/* Right Cap */}
        <div className="absolute right-0 w-[20%] h-full bg-slate-300 border-l border-slate-400"></div>
      </div>
    );
  };

  return (
    <div className="pb-10 animate-in fade-in zoom-in-95 max-w-4xl mx-auto relative select-none">
      {/* Floating Memorize Alert */}
      <div
        className={`absolute top-0 left-1/2 -translate-x-1/2 mt-2 z-20 transition-all duration-300 ${phase === 'memorize' && !isPaused ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}`}
      >
        <div className="bg-red-500/20 backdrop-blur-md text-red-500 px-4 py-2 rounded-xl border border-red-500/50 font-black shadow-lg flex items-center gap-2 animate-pulse whitespace-nowrap">
          Запам'ятайте! {timeLeft}с
        </div>
      </div>

      <div className="flex justify-between items-center mb-4 px-2 mt-4 sm:mt-0">
        <button
          onClick={goBack}
          disabled={isProcessing}
          className="flex items-center gap-2 text-neutral-400 hover:text-white font-bold transition-colors"
        >
          <ArrowLeft size={20} /> Покинути
        </button>
        <div className="flex items-center gap-2 sm:gap-4">
          {score > 0 && !gameOver && (
            <button
              onClick={claimReward}
              disabled={isProcessing || isPaused || phase === 'memorize'}
              className="flex items-center gap-1 sm:gap-2 font-bold transition-colors px-2 sm:px-3 py-1.5 rounded-lg border text-yellow-500 hover:text-yellow-400 bg-yellow-900/20 border-yellow-900/50"
            >
              {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Coins size={16} />}
              <span className="hidden sm:inline">Забрати</span> {getEarnedCoins()}
            </button>
          )}
          <button
            onClick={togglePause}
            disabled={isProcessing || gameOver}
            className={`flex items-center gap-2 font-bold transition-colors px-3 py-1.5 rounded-lg border ${isPaused
              ? 'text-yellow-400 hover:text-yellow-300 bg-yellow-900/20 border-yellow-900/50'
              : 'text-neutral-400 hover:text-white bg-neutral-900/20 border-neutral-800'
              }`}
          >
            {isPaused ? <Play size={16} /> : <Pause size={16} />}
            {isPaused ? 'Продовжити' : 'Пауза'}
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-8 items-center md:items-start justify-center">
        {/* Game Area */}
        <div className="flex-1 w-full max-w-md">
          <div className="flex justify-between items-center mb-6 bg-neutral-900 border border-neutral-800 p-4 rounded-2xl">
            <div>
              <div className="text-xs text-neutral-500 uppercase font-bold mb-1">Рівень</div>
              <div className="text-2xl font-black text-white">{score + 1}</div>
            </div>
            <div className="flex gap-1 text-red-500">
              {Array.from({ length: 3 }).map((_, i) => (
                <Heart
                  key={i}
                  size={24}
                  fill={i < lives ? 'currentColor' : 'transparent'}
                  className={i >= lives ? 'text-neutral-700' : ''}
                />
              ))}
            </div>
          </div>

          <div className="bg-[#0f172a] p-3 sm:p-4 rounded-3xl border border-slate-800/50 shadow-2xl relative overflow-hidden">
            {/* Background decorative circuits pattern (very simple css version) */}
            <div
              className="absolute inset-0 opacity-[0.03] pointer-events-none"
              style={{
                backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
                backgroundSize: '30px 30px',
              }}
            ></div>

            <div className="grid grid-cols-5 gap-2 sm:gap-3 relative z-10">
              {board.map((tile, idx) => {
                const isError = clickedError === idx;
                const bgColor = tile.isFound
                  ? 'bg-green-500/20 border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.3)]'
                  : isError
                    ? 'bg-red-500/40 border-red-500'
                    : 'bg-[#1e293b] border-[#334155] hover:bg-[#334155]/80';

                return (
                  <button
                    key={idx}
                    onClick={() => handleTileClick(idx)}
                    disabled={tile.isFound || gameOver || phase === 'memorize'}
                    className={`aspect-square rounded-xl border flex items-center justify-center transition-all duration-200 w-full active:scale-95 ${bgColor} ${phase === 'memorize' ? 'cursor-not-allowed opacity-90' : ''}`}
                  >
                    {renderFuse(tile.isDamaged, tile.isFound, tile.memoryFlipped)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Info Panel side */}
        <div className="flex-1 w-full max-w-sm flex flex-col justify-center text-center md:text-left mt-4 md:mt-20 px-4">
          <h2 className="text-3xl sm:text-4xl font-black text-white leading-tight uppercase tracking-wide mb-4 flex items-center justify-center md:justify-start gap-3">
            <Zap className="text-yellow-500" size={32} />
            Відмітьте всі
            <br />
            пошкоджені
            <br />
            запобіжники
          </h2>
          <p className="text-neutral-400 text-sm font-medium mb-6">
            Спочатку запам'ятайте їх розташування. Коли вони сховаються - натискайте по пам'яті. За
            кожну помилку ви втрачаєте 1 життя.
          </p>

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
            <div className="text-xs text-neutral-500 uppercase font-bold mb-2">
              Рівень навички: {progressInfo.level}
            </div>

            {progressInfo.max === 'MAX' ? (
              <div className="text-green-400 font-bold bg-green-900/20 py-2 rounded-xl text-center border border-green-900/50">
                Максимальний рівень навички! (Лише 3 запобіжника)
              </div>
            ) : (
              <div>
                <div className="flex justify-between text-xs text-neutral-400 mb-1 font-bold">
                  <span>Прогрес до {progressInfo.level + 1} рівня:</span>
                  <span>
                    {progressInfo.current} / {progressInfo.max} плат
                  </span>
                </div>
                <div className="w-full h-3 bg-neutral-800 rounded-full overflow-hidden border border-neutral-700">
                  <div
                    className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all duration-500"
                    style={{ width: `${progressInfo.percentage}%` }}
                  ></div>
                </div>
                <div className="text-center text-blue-400 text-xs mt-1 font-bold">
                  {progressInfo.percentage}%
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isPaused && !gameOver && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-40 flex flex-col items-center justify-center rounded-3xl animate-in fade-in p-6 text-center">
          <Pause size={60} className="text-yellow-500 mb-4" />
          <h2 className="text-3xl font-black mb-2 uppercase text-white">Пауза</h2>
          <p className="text-neutral-300 mb-6">
            Гру призупинено. Коли ви повернетеся, положення запобіжників буде{' '}
            <strong>змінено</strong>.
          </p>

          <button
            onClick={togglePause}
            className="bg-blue-500 hover:bg-blue-400 text-white font-black py-4 px-8 rounded-2xl flex items-center gap-2 shadow-[0_0_20px_rgba(59,130,246,0.5)] transition-all transform hover:scale-105 active:scale-95"
          >
            <Play size={20} />
            Продовжити гру
          </button>
        </div>
      )}

      {gameOver && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center rounded-3xl animate-in fade-in p-6 text-center">
          <button
            onClick={claimReward}
            disabled={isProcessing}
            className="absolute top-4 right-4 text-neutral-400 hover:text-white transition-colors p-2 z-50"
          >
            <X size={28} />
          </button>
          <Trophy size={60} className="text-yellow-500 mb-4" />
          <h2 className="text-3xl font-black mb-2 uppercase text-white">Гру закінчено!</h2>
          <p className="text-neutral-300 mb-6">
            Відремонтовано плат: <span className="text-white font-bold">{score}</span>
          </p>

          <button
            onClick={claimReward}
            disabled={isProcessing}
            className="bg-yellow-500 hover:bg-yellow-400 text-yellow-950 font-black py-4 px-8 rounded-2xl flex items-center gap-2 shadow-[0_0_20px_rgba(234,179,8,0.5)]"
          >
            {isProcessing ? <Loader2 size={20} className="animate-spin" /> : <Coins size={20} />}
            Забрати {getEarnedCoins()} монет
          </button>
        </div>
      )}
    </div>
  );
}
