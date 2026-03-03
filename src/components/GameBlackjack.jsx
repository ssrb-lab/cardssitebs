import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Loader2, Coins, Play, RefreshCw, Hand, Plus, Minus, Info } from 'lucide-react';
import { startBlackjackGameRequest, claimBlackjackRewardRequest, getToken } from '../config/api';

const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king', 'ace'];

export default function GameBlackjack({ profile, setProfile, goBack, showToast }) {
  const [deck, setDeck] = useState([]);
  const [playerHand, setPlayerHand] = useState([]);
  const [dealerHand, setDealerHand] = useState([]);
  const [betAmount, setBetAmount] = useState(10);

  const [gameState, setGameState] = useState('betting'); // betting, playing, dealer_turn, game_over
  const [gameResult, setGameResult] = useState(null); // win, lose, push, blackjack
  const [earnedCoins, setEarnedCoins] = useState(0);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Save/Load state to localStorage based on profile.uid
  const storageKey = `blackjack_state_${profile?.uid || 'guest'}`;

  useEffect(() => {
    const savedState = localStorage.getItem(storageKey);
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        if (parsed.gameState && parsed.gameState !== 'betting') {
          setDeck(parsed.deck || []);
          setPlayerHand(parsed.playerHand || []);
          setDealerHand(parsed.dealerHand || []);
          setBetAmount(parsed.betAmount || 10);
          setGameState(parsed.gameState);
          setGameResult(parsed.gameResult || null);
          setEarnedCoins(parsed.earnedCoins || 0);
        }
      } catch (e) {
        console.error('Failed to parse saved blackjack state:', e);
        localStorage.removeItem(storageKey);
      }
    }
    setIsLoaded(true);
     
  }, [storageKey]);

  useEffect(() => {
    if (!isLoaded) return;
    if (gameState === 'betting') {
      localStorage.removeItem(storageKey);
    } else {
      const stateToSave = {
        deck,
        playerHand,
        dealerHand,
        betAmount,
        gameState,
        gameResult,
        earnedCoins,
      };
      localStorage.setItem(storageKey, JSON.stringify(stateToSave));
    }
  }, [
    deck,
    playerHand,
    dealerHand,
    betAmount,
    gameState,
    gameResult,
    earnedCoins,
    isLoaded,
    storageKey,
  ]);

  const getCardValue = (rank) => {
    if (['jack', 'queen', 'king'].includes(rank)) return 10;
    if (rank === 'ace') return 11;
    return parseInt(rank);
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

  const createDeck = () => {
    const newDeck = [];
    const suitMap = { clubs: 'Clubs', diamonds: 'Diamonds', hearts: 'Hearts', spades: 'Spades' };
    const rankMap = { jack: 'J', queen: 'Q', king: 'K', ace: 'A' };
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        newDeck.push({
          suit,
          rank,
          value: getCardValue(rank),
          image: `/png/card${suitMap[suit]}${rankMap[rank] || rank}.png`,
        });
      }
    }
    // Shuffle
    for (let i = newDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
    }
    return newDeck;
  };

  const startGame = async () => {
    if (betAmount < 10) return showToast('Мінімальна ставка 10 монет!', 'error');
    if (profile.coins < betAmount) return showToast('Недостатньо монет!', 'error');

    setIsProcessing(true);
    try {
      const data = await startBlackjackGameRequest(getToken(), betAmount);
      setProfile(data.profile);

      const newDeck = createDeck();

      const pHand = [newDeck.pop(), newDeck.pop()];
      const dHand = [newDeck.pop(), newDeck.pop()];

      setDeck(newDeck);
      setPlayerHand(pHand);
      setDealerHand(dHand);

      const pScore = getHandScore(pHand);
      const dScore = getHandScore(dHand);

      if (pScore === 21) {
        setGameState('game_over');
        if (dScore === 21) {
          endGameValidation('push', betAmount);
        } else {
          endGameValidation('blackjack', betAmount);
        }
      } else {
        setGameState('playing');
      }
    } catch (e) {
      showToast(e.message || 'Помилка початку гри.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const hit = () => {
    if (gameState !== 'playing' || isProcessing) return;

    const newDeck = [...deck];
    const card = newDeck.pop();
    const newHand = [...playerHand, card];

    setDeck(newDeck);
    setPlayerHand(newHand);

    if (getHandScore(newHand) > 21) {
      setGameState('game_over');
      endGameValidation('lose', betAmount);
    }
  };

  const stand = () => {
    if (gameState !== 'playing' || isProcessing) return;
    setGameState('dealer_turn');
  };

  // Dealer play logic
  useEffect(() => {
    if (gameState === 'dealer_turn') {
      const playDealerTimer = setTimeout(() => {
        if (getHandScore(dealerHand) < 17) {
          const currentDeck = [...deck];
          const nextCard = currentDeck.pop();
          setDeck(currentDeck);
          setDealerHand([...dealerHand, nextCard]);
        } else {
          const pScore = getHandScore(playerHand);
          const dScore = getHandScore(dealerHand);

          setGameState('game_over');

          if (dScore > 21) {
            endGameValidation('win', betAmount);
          } else if (dScore > pScore) {
            endGameValidation('lose', betAmount);
          } else if (dScore < pScore) {
            endGameValidation('win', betAmount);
          } else {
            endGameValidation('push', betAmount);
          }
        }
      }, 800);

      return () => clearTimeout(playDealerTimer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, dealerHand]);

  const endGameValidation = async (result, bAmount) => {
    setIsProcessing(true);
    setGameResult(result);
    try {
      if (result !== 'lose') {
        const data = await claimBlackjackRewardRequest(getToken(), result, bAmount);
        setProfile(data.profile);
        setEarnedCoins(data.earned);
        if (data.earned > 0) showToast(`Ви виграли ${data.earned} монет!`, 'success');
      } else {
        showToast('Ви програли ставку.', 'error');
        setEarnedCoins(0);
      }
    } catch (e) {
      showToast(e.message, 'error');
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
      <div className="flex justify-between items-center mb-6">
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

      <div className="bg-[#0b291d] border-4 border-[#12422e] rounded-3xl p-4 sm:p-6 shadow-2xl relative overflow-hidden min-h-[350px] sm:min-h-[400px] flex flex-col justify-between">
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
                const showBack = idx === 1;
                return (
                  <div
                    key={idx}
                    className={`relative transform transition-all duration-300 ${isHiddenCard ? '' : 'hover:-translate-y-2'}`}
                    style={{
                      zIndex: idx,
                      animation: `flyInTop 0.5s ease-out ${idx < 2 ? 0.15 + idx * 0.3 : 0}s backwards`,
                      perspective: '1000px',
                    }}
                  >
                    {showBack ? (
                      <div
                        className={`w-20 sm:w-24 h-full relative transition-transform duration-700 preserve-3d`}
                        style={{ transform: isHiddenCard ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
                      >
                        <img
                          src={card.image}
                          alt="card front"
                          className="absolute inset-0 w-20 sm:w-24 h-auto rounded-xl shadow-xl border border-white/10 backface-hidden"
                          style={{ backfaceVisibility: 'hidden' }}
                        />
                        <img
                          src="/png/cardBack_blue1.png"
                          alt="card back"
                          className="absolute inset-0 w-20 sm:w-24 h-auto rounded-xl shadow-xl border border-white/10 backface-hidden"
                          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                        />
                      </div>
                    ) : (
                      <img
                        src={card.image}
                        alt="card"
                        className="w-20 sm:w-24 h-auto rounded-xl shadow-xl border border-white/10"
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
              className={`px-6 py-3 rounded-2xl font-black text-xl sm:text-2xl uppercase tracking-widest shadow-2xl animate-in zoom-in ${
                gameResult === 'win'
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
                  className="relative transform transition-all duration-300 hover:-translate-y-4"
                  style={{
                    zIndex: idx,
                    animation: `flyInBottom 0.5s ease-out ${idx < 2 ? idx * 0.3 : 0}s backwards`,
                  }}
                >
                  <img
                    src={card.image}
                    alt="card"
                    className="w-20 sm:w-24 h-auto rounded-xl shadow-xl border border-white/10"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Betting Screen */}
        {gameState === 'betting' && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-24 h-24 bg-[#12422e] rounded-full flex items-center justify-center shadow-inner mb-6 border-4 border-[#0d3021]">
              <Coins size={40} className="text-yellow-500" />
            </div>
            <h2 className="text-3xl font-black text-white mb-8 tracking-wider uppercase">
              Зробіть ставку
            </h2>

            <div className="flex items-center gap-4 bg-black/40 p-3 rounded-2xl mb-8 border border-white/5">
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
                className="w-32 text-center text-3xl font-black text-yellow-500 bg-transparent border-none outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                onClick={() => adjustBet(100)}
                className="w-12 h-12 bg-green-500/20 text-green-400 rounded-xl flex items-center justify-center hover:bg-green-500 hover:text-white transition-colors"
              >
                <Plus size={20} />
              </button>
            </div>

            <div className="flex flex-wrap justify-center gap-3 mb-8 w-full max-w-[300px]">
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
        <div className="mt-4 flex justify-center gap-4">
          <button
            onClick={hit}
            disabled={isProcessing}
            className="flex-1 max-w-[200px] bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(37,99,235,0.4)] transition-transform hover:scale-105"
          >
            <Plus size={20} /> Взяти
          </button>

          <button
            onClick={stand}
            disabled={isProcessing}
            className="flex-1 max-w-[200px] bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(220,38,38,0.4)] transition-transform hover:scale-105"
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
