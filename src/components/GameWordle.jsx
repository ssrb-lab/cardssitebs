import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Keyboard, Loader2, Play } from 'lucide-react';
import { getToken } from '../config/api';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const UKRAINIAN_ALPHABET = [
  ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х'],
  ['ф', 'і', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'є'],
  ['я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю', 'ї', 'ґ'],
];

export default function GameWordle({ profile, setProfile, goBack, showToast, wordleEntryCost }) {
  const cost = wordleEntryCost !== undefined ? Number(wordleEntryCost) : 0;
  const [gameState, setGameState] = useState(null);
  const [dailyAttempts, setDailyAttempts] = useState(0);
  const [currentGuess, setCurrentGuess] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    loadState();
  }, []);

  const loadState = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/wordle/state`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        const parsedState = typeof data.state === 'string' ? JSON.parse(data.state) : data.state;
        setGameState(parsedState);
        setDailyAttempts(data.dailyAttempts || 0);
      }
    } catch (e) {
      console.error(e);
      showToast('Помилка завантаження гри.', 'error');
    }
    setIsLoading(false);
  };

  const startGame = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/wordle/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const parsedState = typeof data.state === 'string' ? JSON.parse(data.state) : data.state;
      setGameState(parsedState);
      setDailyAttempts(data.dailyAttempts);
      if (data.profile) setProfile(data.profile);
      setCurrentGuess('');
    } catch (e) {
      showToast(e.message || 'Помилка початку гри', 'error');
    }
    setIsProcessing(false);
  };

  const submitGuess = async () => {
    if (currentGuess.length !== 5 || isProcessing) return;

    setIsProcessing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/wordle/guess`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ guess: currentGuess }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const parsedState = typeof data.state === 'string' ? JSON.parse(data.state) : data.state;
      setGameState(parsedState);
      setCurrentGuess('');
      if (data.profile) setProfile(data.profile);

      if (parsedState.status === 'won') {
        showToast(`Перемога! Ви вгадали слово і отримали ${data.reward} монет!`, 'success');
      } else if (parsedState.status === 'lost') {
        showToast(
          `На жаль, ви програли. Загадане слово було: ${parsedState.word.toUpperCase()}`,
          'error'
        );
      }
    } catch (e) {
      showToast(e.message || 'Помилка перевірки слова', 'error');
    }
    setIsProcessing(false);
  };

  const handleKeyPress = useCallback(
    (key) => {
      if (gameState?.status !== 'playing' || isProcessing) return;

      if (key === 'Enter') {
        submitGuess();
      } else if (key === 'Backspace') {
        setCurrentGuess((prev) => prev.slice(0, -1));
      } else if (currentGuess.length < 5) {
        const lowerKey = key.toLowerCase();
        // Check if it's a valid cyrillic letter
        if (/^[а-яіїєґ]$/.test(lowerKey)) {
          setCurrentGuess((prev) => prev + lowerKey);
        }
      }
    },
    [currentGuess, gameState, isProcessing]
  );

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Prevent handling if typing in an input
      if (document.activeElement.tagName === 'INPUT') return;

      if (e.key === 'Enter' || e.key === 'Backspace') {
        handleKeyPress(e.key);
      } else if (/^[а-яіїєґa-zA-Z]$/.test(e.key.toLowerCase())) {
        // Simple mapping for english keyboards to cyrillic (optional, but good for UX)
        const enToUaMap = {
          q: 'й',
          w: 'ц',
          e: 'у',
          r: 'к',
          t: 'е',
          y: 'н',
          u: 'г',
          i: 'ш',
          o: 'щ',
          p: 'з',
          '[': 'х',
          ']': 'ї',
          a: 'ф',
          s: 'і',
          d: 'в',
          f: 'а',
          g: 'п',
          h: 'р',
          j: 'о',
          k: 'л',
          l: 'д',
          ';': 'ж',
          "'": 'є',
          z: 'я',
          x: 'ч',
          c: 'с',
          v: 'м',
          b: 'и',
          n: 'т',
          m: 'ь',
          ',': 'б',
          '.': 'ю',
          '`': 'ґ',
        };
        const mappedKey = enToUaMap[e.key.toLowerCase()] || e.key.toLowerCase();
        handleKeyPress(mappedKey);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyPress]);

  // Compute keyboard letter states
  const letterStates = {};
  if (gameState && gameState.guesses) {
    gameState.guesses.forEach((guessObj) => {
      const letters = guessObj.word.split('');
      letters.forEach((l, idx) => {
        const color = guessObj.colors[idx];
        const currentBest = letterStates[l];
        if (color === 'green') letterStates[l] = 'green';
        else if (color === 'yellow' && currentBest !== 'green') letterStates[l] = 'yellow';
        else if (color === 'gray' && currentBest !== 'green' && currentBest !== 'yellow')
          letterStates[l] = 'gray';
      });
    });
  }

  const getLetterColorClass = (color) => {
    switch (color) {
      case 'green':
        return 'bg-green-600 text-white border-green-500 shadow-[0_0_15px_rgba(22,163,74,0.4)]';
      case 'yellow':
        return 'bg-yellow-500 text-white border-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.4)]';
      case 'gray':
        return 'bg-neutral-800 text-neutral-400 border-neutral-700';
      default:
        return 'bg-neutral-900 border-neutral-700 text-white';
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-20 text-neutral-500 max-w-lg mx-auto pb-32">
        <Loader2 className="animate-spin mx-auto w-10 h-10 mb-4" /> Завантаження гри...
      </div>
    );
  }

  return (
    <div
      className="pb-32 animate-in fade-in zoom-in-95 duration-500 max-w-lg mx-auto"
      ref={containerRef}
    >
      <button
        onClick={goBack}
        className="mb-6 flex items-center gap-2 text-neutral-400 hover:text-white font-bold transition-colors px-2"
      >
        <ArrowLeft size={20} /> Повернутися до вибору гри
      </button>

      <div className="flex justify-between items-center mb-6 px-2">
        <h2 className="text-3xl font-black text-white uppercase tracking-widest flex items-center gap-3 drop-shadow-lg">
          <Keyboard className="text-blue-500" size={32} /> Слівце
        </h2>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2 shadow-inner">
          <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">
            Спроб сьогодні
          </div>
          <div
            className={`font-black text-lg ${dailyAttempts >= 5 ? 'text-red-500' : 'text-blue-500'}`}
          >
            {dailyAttempts} / 5
          </div>
        </div>
      </div>

      {!gameState || gameState.status !== 'playing' ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 sm:p-10 text-center shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <Keyboard size={150} />
          </div>

          <h3 className="text-2xl font-black text-white mb-4 uppercase tracking-wider relative z-10">
            Що таке Слівце?
          </h3>
          <p className="text-neutral-400 text-sm mb-6 leading-relaxed relative z-10">
            Вгадайте українське слово з 5 літер за 6 спроб. Після кожної спроби колір літер
            зміниться, щоб показати наскільки ви близькі до правильного слова.
            <br />
            <br />
            <span className="text-green-500 font-bold">Зелений</span> - літера є і на правильному
            місці.
            <br />
            <span className="text-yellow-500 font-bold">Жовтий</span> - літера є, але не на своєму
            місці.
            <br />
            <span className="text-neutral-500 font-bold">Сірий</span> - літери немає в слові.
          </p>

          {gameState && gameState.status === 'won' && (
            <div className="mb-6 bg-green-900/30 border border-green-500/50 rounded-xl p-4 text-green-400 font-bold">
              Ви виграли минулу гру! Слово було: {gameState.word.toUpperCase()}
            </div>
          )}
          {gameState && gameState.status === 'lost' && (
            <div className="mb-6 bg-red-900/30 border border-red-500/50 rounded-xl p-4 text-red-400 font-bold">
              Ви програли минулу гру. Слово було: {gameState.word.toUpperCase()}
            </div>
          )}

          <button
            onClick={startGame}
            disabled={isProcessing || dailyAttempts >= 5}
            className={`w-full py-4 rounded-xl font-black uppercase tracking-widest transition-all shadow-lg flex justify-center items-center gap-2 relative z-10
              ${dailyAttempts >= 5 || isProcessing
                ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:scale-105'
              }`}
          >
            {isProcessing ? <Loader2 size={24} className="animate-spin" /> : <Play size={24} />}
            {dailyAttempts >= 5
              ? 'Ліміт вичерпано на сьогодні'
              : cost > 0
                ? `Почати гру (${cost} монет)`
                : 'Почати гру'}
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center max-w-sm mx-auto w-full">
          {/* Grid */}
          <div className="grid grid-rows-6 gap-2 mb-8 w-full">
            {Array.from({ length: 6 }).map((_, rowIdx) => {
              const guessObj = gameState.guesses[rowIdx];
              const isCurrentRow = rowIdx === gameState.guesses.length;
              let rowLetters = [];
              let rowColors = [];

              if (guessObj) {
                rowLetters = guessObj.word.split('');
                rowColors = guessObj.colors;
              } else if (isCurrentRow) {
                rowLetters = currentGuess.split('').concat(Array(5 - currentGuess.length).fill(''));
                rowColors = Array(5).fill('none');
              } else {
                rowLetters = Array(5).fill('');
                rowColors = Array(5).fill('none');
              }

              return (
                <div key={rowIdx} className="grid grid-cols-5 gap-2 w-full aspect-[5/1]">
                  {Array.from({ length: 5 }).map((_, colIdx) => {
                    const letter = rowLetters[colIdx] || '';
                    const color = rowColors[colIdx];
                    let cellClass =
                      'border-2 rounded-xl flex items-center justify-center text-2xl font-black uppercase transition-all duration-300 transform-gpu will-change-transform';

                    if (color === 'green')
                      cellClass +=
                        ' bg-green-600 border-green-500 text-white shadow-[0_0_15px_rgba(22,163,74,0.4)]';
                    else if (color === 'yellow')
                      cellClass +=
                        ' bg-yellow-500 border-yellow-400 text-white shadow-[0_0_15px_rgba(234,179,8,0.4)]';
                    else if (color === 'gray')
                      cellClass += ' bg-neutral-800 border-neutral-700 text-neutral-500';
                    else if (letter !== '')
                      cellClass +=
                        ' bg-neutral-900 border-neutral-500 text-white scale-105 shadow-inner';
                    else cellClass += ' bg-neutral-900 border-neutral-800 text-white shadow-inner';

                    return (
                      <div key={colIdx} className={cellClass}>
                        {letter}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Keyboard */}
          <div className="w-full flex-col gap-2 relative z-10 hidden sm:flex">
            {UKRAINIAN_ALPHABET.map((row, rowIdx) => (
              <div key={rowIdx} className="flex justify-center gap-1.5 outline-none">
                {rowIdx === 2 && (
                  <button
                    onClick={() => handleKeyPress('Enter')}
                    className="flex-[1.5] h-12 bg-neutral-800 rounded-lg text-xs font-bold uppercase text-white 
                    hover:bg-indigo-600 transition-colors shadow-md border border-neutral-700 active:scale-95"
                  >
                    ВВІД
                  </button>
                )}
                {row.map((letter) => {
                  const stateClass = getLetterColorClass(letterStates[letter]);
                  return (
                    <button
                      key={letter}
                      onClick={() => handleKeyPress(letter)}
                      className={`flex-1 min-w-[30px] h-12 rounded-lg text-sm md:text-base font-black uppercase flex items-center justify-center
                       border shadow-md transition-all active:scale-95 ${stateClass}`}
                    >
                      {letter}
                    </button>
                  );
                })}
                {rowIdx === 2 && (
                  <button
                    onClick={() => handleKeyPress('Backspace')}
                    className="flex-[1.5] h-12 bg-neutral-800 rounded-lg text-xs font-bold text-white 
                    hover:bg-red-600 transition-colors shadow-md border border-neutral-700 flex items-center justify-center active:scale-95"
                  >
                    <ArrowLeft size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Mobile Keyboard */}
          <div className="w-full relative z-10 flex flex-col gap-1.5 sm:hidden px-1">
            <input
              type="text"
              readOnly
              className="h-0 w-0 opacity-0 absolute"
              ref={(input) => input && input.focus()}
            />
            {UKRAINIAN_ALPHABET.map((row, rowIdx) => (
              <div key={rowIdx} className="flex justify-center gap-1">
                {rowIdx === 2 && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleKeyPress('Enter');
                    }}
                    className="flex-[1.5] h-12 bg-neutral-800 rounded-md text-[10px] font-bold uppercase text-white 
                    active:bg-indigo-600 transition-colors border border-neutral-700 active:scale-95"
                  >
                    Enter
                  </button>
                )}
                {row.map((letter) => {
                  const stateClass = getLetterColorClass(letterStates[letter]);
                  return (
                    <button
                      key={letter}
                      onClick={(e) => {
                        e.preventDefault();
                        handleKeyPress(letter);
                      }}
                      className={`flex-1 h-12 rounded-md text-sm font-black uppercase flex items-center justify-center
                       border transition-all active:scale-95 ${stateClass}`}
                    >
                      {letter}
                    </button>
                  );
                })}
                {rowIdx === 2 && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleKeyPress('Backspace');
                    }}
                    className="flex-[1.5] h-12 bg-neutral-800 rounded-md flex items-center justify-center text-white 
                    active:bg-red-600 transition-colors border border-neutral-700 active:scale-95"
                  >
                    <ArrowLeft size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
