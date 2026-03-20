import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Loader2, Coins, Play, RefreshCw, Hand, Plus, Minus, Info } from 'lucide-react';
import {
  startBlackjackGameRequest,
  hitBlackjackRequest,
  standBlackjackRequest,
  getBlackjackStateRequest,
  getToken,
} from '../config/api';

export default function GameBlackjack({ profile, setProfile, goBack, showToast }) {
  const [playerHand, setPlayerHand] = useState([]);
  const [dealerHand, setDealerHand] = useState([]);
  const [betAmount, setBetAmount] = useState(10);

  const [gameState, setGameState] = useState('betting'); // betting, playing, game_over
  const [gameResult, setGameResult] = useState(null); // win, lose, push, blackjack
  const [earnedCoins, setEarnedCoins] = useState(0);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load state from backend on mount
  useEffect(() => {
    const loadState = async () => {
      try {
        const data = await getBlackjackStateRequest(getToken());
        if (data.state && data.state.gameState && data.state.gameState !== 'betting') {
          const { state } = data;
          setPlayerHand(state.playerHand || []);
          setDealerHand(state.dealerHand || []);
          setBetAmount(state.betAmount || 10);
          setGameState(state.gameState);
          setGameResult(state.gameResult || null);
          setEarnedCoins(state.earnedCoins || 0);
        }
      } catch (e) {
        console.error('Failed to load saved blackjack state:', e);
      } finally {
        setIsLoaded(true);
      }
    };
    loadState();
  }, []);

  const getCardValue = (rank) => {
    if (['jack', 'queen', 'king'].includes(rank)) return 10;
    if (rank === 'ace') return 11;
    return parseInt(rank, 10);
  };

  const getHandScore = (hand) => {
    let score = 0;
    let aces = 0;

    for (const card of hand) {
      score += card.value;
      if (card.rank === 'ace') aces += 1;
    }

    while (score > 21 && aces > 0) {
      score -= 10;
      aces -= 1;
    }

    return score;
  };

  const startGame = async () => {
    if (betAmount < 10) return showToast('Мінімальна ставка 10 монет!', 'error');
    if (profile.coins < betAmount) return showToast('Недостатньо монет!', 'error');

    setIsProcessing(true);
    try {
      const data = await startBlackjackGameRequest(getToken(), betAmount);
      setProfile(data.profile);

      const { state } = data;
      setPlayerHand(state.playerHand);
      setDealerHand(state.dealerHand);
      setBetAmount(state.betAmount);
      setGameState(state.gameState);
      setGameResult(state.gameResult);
      setEarnedCoins(state.earnedCoins);

      if (
        state.gameResult === 'win' ||
        state.gameResult === 'blackjack' ||
        state.gameResult === 'push'
      ) {
        if (state.earnedCoins > 0 && state.gameResult !== 'push') {
          showToast(`Ви виграли ${state.earnedCoins} монет!`, 'success');
        }
      } else if (state.gameResult === 'lose') {
        showToast('Ви програли ставку.', 'error');
      }
    } catch (e) {
      showToast(e.message || 'Помилка початку гри.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const hit = async () => {
    if (gameState !== 'playing' || isProcessing) return;

    setIsProcessing(true);
    try {
      const data = await hitBlackjackRequest(getToken());
      setProfile(data.profile);

      const { state } = data;
      setPlayerHand(state.playerHand);
      setDealerHand(state.dealerHand);
      setGameState(state.gameState);
      setGameResult(state.gameResult);
      setEarnedCoins(state.earnedCoins);

      if (state.gameState === 'game_over') {
        showToast('Ви програли ставку (Перебір).', 'error');
      }
    } catch (e) {
      showToast(e.message || 'Помилка.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const stand = async () => {
    if (gameState !== 'playing' || isProcessing) return;

    setIsProcessing(true);
    // Show dealer turn state locally for a bit of suspense while waiting for the request optionally
    // But since it's backend, we just wait for response
    try {
      const data = await standBlackjackRequest(getToken());
      setProfile(data.profile);

      const { state } = data;
      setDealerHand(state.dealerHand);
      setGameState(state.gameState);
      setGameResult(state.gameResult);
      setEarnedCoins(state.earnedCoins);

      if (state.gameResult === 'win' || state.gameResult === 'blackjack') {
        showToast(`Ви виграли ${state.earnedCoins} монет!`, 'success');
      } else if (state.gameResult === 'lose') {
        showToast('Ви програли ставку.', 'error');
      }
    } catch (e) {
      showToast(e.message || 'Помилка.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetGame = () => {
    setPlayerHand([]);
    setDealerHand([]);
    setGameState('betting');
    setGameResult(null);
    setEarnedCoins(0);
  };

  const adjustBet = (amount) => {
    let newBet = betAmount + amount;
    if (newBet > profile.coins) newBet = profile.coins;
    if (newBet < 10) newBet = profile.coins >= 10 ? 10 : profile.coins;
    setBetAmount(newBet);
  };

  const setMaxBet = () => {
    if (profile.coins >= 10) {
      setBetAmount(profile.coins > 100000 ? 100000 : profile.coins);
    }
  };

  return (
    <div className="pb-10 animate-in fade-in zoom-in-95 max-w-2xl mx-auto relative select-none">
      <div className="flex justify-between items-center mb-4 sm:mb-6">
        <button
          onClick={goBack}
          disabled={isProcessing}
          className="flex items-center gap-2 text-neutral-400 hover:text-white font-bold transition-colors"
        >
          <ArrowLeft size={20} /> Покинути гру
        </button>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2 flex items-center gap-2">
          <Coins size={18} className="text-yellow-500" />
          <span className="font-black text-white">{profile.coins}</span>
        </div>
      </div>

      <div className="bg-[#0b291d] border-2 sm:border-4 border-[#12422e] rounded-2xl sm:rounded-3xl p-3 sm:p-6 shadow-2xl relative overflow-hidden min-h-[300px] sm:min-h-[400px] flex flex-col justify-between">
        {/* Dealer Area */}
        {gameState !== 'betting' && (
          <div className="mb-2 sm:mb-4">
            <div className="flex justify-between items-end mb-2">
              <h3 className="text-white/80 font-bold uppercase tracking-widest text-sm">Дилер</h3>
              <span className="bg-black/50 px-3 py-1 rounded-full font-black text-white/90 text-sm">
                {gameState === 'playing'
                  ? getCardValue(dealerHand[0].rank)
                  : getHandScore(dealerHand)}
              </span>
            </div>

            <div className="flex justify-center -space-x-10 sm:-space-x-14">
              {dealerHand.map((card, idx) => {
                const isHiddenCard = gameState === 'playing' && idx === 1;
                // Завжди показуємо flip-контейнер для другої карти, щоб анімувати переворот
                const useFlipAnimation = idx === 1;

                return (
                  <div
                    key={idx}
                    className={`relative transform transition-all duration-300 transform-gpu will-change-transform ${isHiddenCard ? '' : 'hover:-translate-y-2'}`}
                    style={{
                      zIndex: idx,
                      animation: `flyInTop 0.5s ease-out ${idx < 2 ? 0.15 + idx * 0.3 : 0}s backwards`,
                      perspective: '1000px',
                    }}
                  >
                    {useFlipAnimation ? (
                      <div
                        className={`w-20 sm:w-24 h-[116px] sm:h-[139px] relative transition-transform duration-700 preserve-3d`}
                        style={{
                          transform: isHiddenCard ? 'rotateY(180deg)' : 'rotateY(0deg)',
                          transformStyle: 'preserve-3d'
                        }}
                      >
                        {/* Front of the card (visible when rotateY is 0deg) */}
                        <img
                          src={card.image}
                          alt="card front"
                          className="absolute inset-0 w-20 sm:w-24 h-auto rounded-xl shadow-xl border border-white/10"
                          style={{ backfaceVisibility: 'hidden' }}
                        />
                        {/* Back of the card (visible when rotateY is 180deg) */}
                        <img
                          src="/png/cardBack_blue1.png"
                          alt="card back"
                          className="absolute inset-0 w-20 sm:w-24 h-auto rounded-xl shadow-xl border border-white/10"
                          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                        />
                      </div>
                    ) : (
                      <img
                        src={card.image}
                        alt="card"
                        className="w-20 sm:w-24 h-auto rounded-xl shadow-xl border border-white/10 transform-gpu will-change-transform"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Center / Messages */}
        <div className="flex-1 flex items-center justify-center my-2 min-h-[40px]">
          {gameState === 'game_over' && (
            <div
              className={`px-6 py-3 rounded-2xl font-black text-xl sm:text-2xl uppercase tracking-widest shadow-2xl animate-in zoom-in ${gameResult === 'win'
                ? 'bg-green-500 text-green-950'
                : gameResult === 'blackjack'
                  ? 'bg-fuchsia-500 text-white'
                  : gameResult === 'push'
                    ? 'bg-blue-500 text-white'
                    : 'bg-red-600 text-white'
                }`}
            >
              {gameResult === 'win'
                ? 'Перемога!'
                : gameResult === 'blackjack'
                  ? 'Блекджек!'
                  : gameResult === 'push'
                    ? 'Нічия'
                    : 'Поразка'}
            </div>
          )}
          {gameState === 'dealer_turn' && (
            <div className="bg-black/50 text-white px-6 py-3 rounded-full font-bold animate-pulse flex items-center gap-3">
              <Loader2 size={18} className="animate-spin" /> Хід дилера...
            </div>
          )}
        </div>

        {/* Player Area */}
        {gameState !== 'betting' && (
          <div className="mt-2 sm:mt-4">
            <div className="flex justify-between items-end mb-2">
              <h3 className="text-white/80 font-bold uppercase tracking-widest text-sm">
                Ваша Рука
              </h3>
              <span className="bg-black/50 px-3 py-1 rounded-full font-black text-white/90 text-sm">
                {getHandScore(playerHand)}
              </span>
            </div>

            <div className="flex justify-center -space-x-10 sm:-space-x-14">
              {playerHand.map((card, idx) => (
                <div
                  key={idx}
                  className="relative transform transition-all duration-300 hover:-translate-y-4 transform-gpu will-change-transform"
                  style={{
                    zIndex: idx,
                    animation: `flyInBottom 0.5s ease-out ${idx < 2 ? idx * 0.3 : 0}s backwards`,
                  }}
                >
                  <img
                    src={card.image}
                    alt="card"
                    className="w-20 sm:w-24 h-auto rounded-xl shadow-xl border border-white/10 transform-gpu will-change-transform"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Betting Screen */}
        {gameState === 'betting' && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-16 h-16 sm:w-24 sm:h-24 bg-[#12422e] rounded-full flex items-center justify-center shadow-inner mb-4 sm:mb-6 border-4 border-[#0d3021]">
              <Coins size={28} className="sm:w-10 sm:h-10 text-yellow-500" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white mb-6 sm:mb-8 tracking-wider uppercase">
              Зробіть ставку
            </h2>

            <div className="flex items-center gap-2 sm:gap-4 bg-black/40 p-3 rounded-2xl mb-6 sm:mb-8 border border-white/5">
              <button
                onClick={() => adjustBet(-100)}
                className="w-12 h-12 bg-red-500/20 text-red-400 rounded-xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
              >
                <Minus size={20} />
              </button>
              <input
                type="number"
                value={betAmount === 0 ? '' : betAmount}
                onChange={(e) => {
                  let val = parseInt(e.target.value, 10);
                  if (isNaN(val) || val < 0) val = 0;
                  if (val > profile.coins) val = profile.coins;
                  setBetAmount(val);
                }}
                onBlur={() => {
                  if (betAmount < 10 && profile.coins >= 10) setBetAmount(10);
                  else if (profile.coins < 10) setBetAmount(profile.coins);
                }}
                className="w-24 sm:w-32 text-center text-2xl sm:text-3xl font-black text-yellow-500 bg-transparent border-none outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                onClick={() => adjustBet(100)}
                className="w-12 h-12 bg-green-500/20 text-green-400 rounded-xl flex items-center justify-center hover:bg-green-500 hover:text-white transition-colors"
              >
                <Plus size={20} />
              </button>
            </div>

            <div className="flex flex-wrap justify-center gap-3 mb-6 sm:mb-8 w-full max-w-[300px]">
              <button
                onClick={() => setBetAmount(10)}
                className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-white font-bold py-2 px-3 rounded-lg text-sm transition-colors border border-white/10"
              >
                Мін.
              </button>
              <button
                onClick={() => adjustBet(500)}
                className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-white font-bold py-2 px-3 rounded-lg text-sm transition-colors border border-white/10"
              >
                +500
              </button>
              <button
                onClick={setMaxBet}
                className="flex-1 bg-orange-600/20 hover:bg-orange-600 text-orange-400 hover:text-white font-bold py-2 px-3 rounded-lg text-sm transition-colors border border-orange-500/30"
              >
                Макс
              </button>
            </div>

            <button
              onClick={startGame}
              disabled={isProcessing}
              className="w-full max-w-[300px] bg-green-600 hover:bg-green-500 text-white font-black py-4 rounded-2xl flex justify-center items-center gap-2 shadow-[0_0_20px_rgba(22,163,74,0.4)] transition-all hover:scale-105"
            >
              {isProcessing ? (
                <Loader2 size={24} className="animate-spin" />
              ) : (
                <Play size={24} fill="currentColor" />
              )}
              Грати ({betAmount})
            </button>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {gameState === 'playing' && (
        <div className="mt-3 sm:mt-4 flex justify-center gap-3 sm:gap-4">
          <button
            onClick={hit}
            disabled={isProcessing}
            className="flex-1 max-w-[200px] bg-blue-600 hover:bg-blue-500 text-white font-black py-3 sm:py-4 rounded-xl sm:rounded-2xl flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(37,99,235,0.4)] transition-transform hover:scale-105"
          >
            <Plus size={20} /> Взяти
          </button>

          <button
            onClick={stand}
            disabled={isProcessing}
            className="flex-1 max-w-[200px] bg-red-600 hover:bg-red-500 text-white font-black py-3 sm:py-4 rounded-xl sm:rounded-2xl flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(220,38,38,0.4)] transition-transform hover:scale-105"
          >
            <Hand size={20} /> Зупинитись
          </button>
        </div>
      )}

      {gameState === 'game_over' && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={resetGame}
            className="bg-yellow-500 hover:bg-yellow-400 text-yellow-950 font-black py-4 px-10 rounded-2xl flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(234,179,8,0.4)] transition-transform hover:scale-105"
          >
            <RefreshCw size={20} /> Нова ставка
          </button>
        </div>
      )}
    </div>
  );
}
