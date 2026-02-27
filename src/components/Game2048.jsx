import React, { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, Coins, Trophy, Loader2, RotateCcw } from "lucide-react";
import { claim2048RewardRequest, start2048GameRequest, getToken } from "../config/api";

const GRID_SIZE = 4;

export default function Game2048({ setProfile, goBack, showToast }) {
  const uidRef = useRef(0);

  const getEmptyBoard = () => Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill(null));
  const createTile = (val) => ({ id: uidRef.current++, val, isNew: true, merged: false });

  const getRandomEmptyCell = (currentBoard) => {
    const emptyCells = [];
    currentBoard.forEach((row, i) => row.forEach((cell, j) => {
      if (cell === null) emptyCells.push({ i, j });
    }));
    if (emptyCells.length === 0) return null;
    return emptyCells[Math.floor(Math.random() * emptyCells.length)];
  };

  const [board, setBoard] = useState(getEmptyBoard());
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const startGame = async () => {
    setIsProcessing(true);
    try {
      const data = await start2048GameRequest(getToken());

      uidRef.current = 0;
      const newBoard = getEmptyBoard();
      const cell1 = getRandomEmptyCell(newBoard);
      if (cell1) newBoard[cell1.i][cell1.j] = createTile(Math.random() < 0.9 ? 2 : 4);
      const cell2 = getRandomEmptyCell(newBoard);
      if (cell2) newBoard[cell2.i][cell2.j] = createTile(Math.random() < 0.9 ? 2 : 4);

      setBoard(newBoard);
      setScore(0);
      setGameOver(false);
      setGameWon(false);
      localStorage.removeItem('2048_state');
      setIsInitialized(true);
    } catch (e) {
      showToast(e.message || "Не вдалося почати гру.", "error");
      goBack();
    } finally {
      setIsProcessing(false);
    }
  };

  // Завантаження збереженої гри або старт нової
  useEffect(() => {
    const saved = localStorage.getItem('2048_state');
    if (saved) {
      try {
        const { board: savedBoard, score: savedScore, gameOver: savedGameOver, gameWon: savedGameWon, nextId } = JSON.parse(saved);
        uidRef.current = nextId || 1000;
        setBoard(savedBoard);
        setScore(savedScore);
        setGameOver(savedGameOver);
        setGameWon(savedGameWon || false);
        setIsInitialized(true);
        return;
      } catch (e) { }
    }

    startGame();
  }, []);

  // Збереження стану при кожному ході
  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('2048_state', JSON.stringify({ board, score, gameOver, gameWon, nextId: uidRef.current }));
    }
  }, [board, score, gameOver, gameWon, isInitialized]);

  const move = useCallback((direction) => {
    if (gameOver || gameWon || isProcessing) return;

    // Знімаємо прапорці анімації з попереднього ходу
    let newBoard = board.map(row => row.map(tile => tile ? { ...tile, isNew: false, merged: false } : null));
    let newScore = score;
    const oldStr = board.map(row => row.map(t => t ? t.val : 0).join(',')).join(';');

    const slide = (row) => {
      let arr = row.filter(val => val !== null);
      for (let i = 0; i < arr.length - 1; i++) {
        // Ми додали перевірку, щоб код переконувався, що обидва кубики існують
        if (arr[i] && arr[i + 1] && arr[i].val === arr[i + 1].val) {
          arr[i] = { id: arr[i].id, val: arr[i].val * 2, merged: true, isNew: false };
          arr[i + 1] = null;
          newScore += arr[i].val;
        }
      }
      arr = arr.filter(val => val !== null);
      while (arr.length < GRID_SIZE) arr.push(null);
      return arr;
    };

    if (direction === 'LEFT' || direction === 'RIGHT') {
      for (let i = 0; i < GRID_SIZE; i++) {
        let row = newBoard[i];
        if (direction === 'RIGHT') row.reverse();
        let newRow = slide(row);
        if (direction === 'RIGHT') newRow.reverse();
        newBoard[i] = newRow;
      }
    } else if (direction === 'UP' || direction === 'DOWN') {
      for (let j = 0; j < GRID_SIZE; j++) {
        let col = [newBoard[0][j], newBoard[1][j], newBoard[2][j], newBoard[3][j]];
        if (direction === 'DOWN') col.reverse();
        let newCol = slide(col);
        if (direction === 'DOWN') newCol.reverse();
        for (let i = 0; i < GRID_SIZE; i++) newBoard[i][j] = newCol[i];
      }
    }

    const newStr = newBoard.map(row => row.map(t => t ? t.val : 0).join(',')).join(';');

    if (oldStr !== newStr) {
      const emptyCell = getRandomEmptyCell(newBoard);
      if (emptyCell) newBoard[emptyCell.i][emptyCell.j] = createTile(Math.random() < 0.9 ? 2 : 4);
      setBoard(newBoard);
      setScore(newScore);

      // Перевірка на кінець гри
      let movesLeft = false;
      let won = gameWon;
      for (let i = 0; i < GRID_SIZE; i++) {
        for (let j = 0; j < GRID_SIZE; j++) {
          if (newBoard[i][j] !== null && newBoard[i][j].val >= 4096) won = true;
          if (newBoard[i][j] === null) movesLeft = true;
          if (j < GRID_SIZE - 1 && newBoard[i][j] !== null && newBoard[i][j + 1] !== null && newBoard[i][j].val === newBoard[i][j + 1].val) movesLeft = true;
          if (i < GRID_SIZE - 1 && newBoard[i][j] !== null && newBoard[i + 1][j] !== null && newBoard[i][j].val === newBoard[i + 1][j].val) movesLeft = true;
        }
      }
      if (!won && !movesLeft) setGameOver(true);
      if (won && !gameWon) {
        setGameWon(true);
        setGameOver(true);
      }
    }
  }, [board, score, gameOver, gameWon, isProcessing]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['ArrowUp', 'w', 'W'].includes(e.key)) { e.preventDefault(); move('UP'); }
      if (['ArrowDown', 's', 'S'].includes(e.key)) { e.preventDefault(); move('DOWN'); }
      if (['ArrowLeft', 'a', 'A'].includes(e.key)) { e.preventDefault(); move('LEFT'); }
      if (['ArrowRight', 'd', 'D'].includes(e.key)) { e.preventDefault(); move('RIGHT'); }
    };
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [move]);

  let touchStartX = 0; let touchStartY = 0;
  const handleTouchStart = (e) => { touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; };
  const handleTouchEnd = (e) => {
    if (!touchStartX || !touchStartY) return;
    const touchEndX = e.changedTouches[0].clientX; const touchEndY = e.changedTouches[0].clientY;
    const dx = touchEndX - touchStartX; const dy = touchEndY - touchStartY;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (Math.abs(dx) > 30) move(dx > 0 ? 'RIGHT' : 'LEFT');
    } else {
      if (Math.abs(dy) > 30) move(dy > 0 ? 'DOWN' : 'UP');
    }
    touchStartX = 0; touchStartY = 0;
  };

  const restartGame = () => {
    startGame();
  };

  const claimReward = async () => {
    if (score < 100) { showToast("Рахунок має бути хоча б 100!"); return goBack(); }
    setIsProcessing(true);
    try {
      const data = await claim2048RewardRequest(getToken(), score);
      setProfile(data.profile);
      showToast(`Ви отримали ${data.earned} монет за гру!`, "success");
      localStorage.removeItem('2048_state');
      goBack();
    } catch (e) {
      showToast(e.message || "Помилка отримання нагороди.");
      setIsProcessing(false);
    }
  };

  const getTileColor = (val) => {
    const colors = {
      2: "bg-neutral-800 text-neutral-300", 4: "bg-neutral-700 text-neutral-200",
      8: "bg-orange-800 text-white", 16: "bg-orange-600 text-white",
      32: "bg-red-600 text-white", 64: "bg-red-500 text-white",
      128: "bg-yellow-600 text-white shadow-[0_0_10px_rgba(202,138,4,0.5)]",
      256: "bg-yellow-500 text-yellow-950 shadow-[0_0_15px_rgba(234,179,8,0.5)]",
      512: "bg-green-500 text-green-950 shadow-[0_0_15px_rgba(34,197,94,0.5)]",
      1024: "bg-blue-500 text-blue-950 shadow-[0_0_20px_rgba(59,130,246,0.6)]",
      2048: "bg-purple-500 text-white shadow-[0_0_25px_rgba(168,85,247,0.8)]",
      4096: "bg-fuchsia-600 text-white shadow-[0_0_30px_rgba(217,70,239,0.9)] border-2 border-fuchsia-300",
      8192: "bg-red-600 text-white shadow-[0_0_35px_rgba(220,38,38,1)] border-4 border-red-400 animate-pulse"
    };
    return colors[val] || "bg-neutral-900 text-transparent";
  };

  // Збираємо активні плитки для відображення
  const activeTiles = [];
  board.forEach((row, i) => row.forEach((tile, j) => {
    if (tile) activeTiles.push({ ...tile, row: i, col: j });
  }));

  if (!isInitialized) return null;

  return (
    <div className="pb-10 animate-in fade-in zoom-in-95 max-w-md mx-auto relative select-none">
      <div className="flex justify-between items-center mb-4">
        <button onClick={goBack} disabled={isProcessing} className="flex items-center gap-2 text-neutral-400 hover:text-white font-bold transition-colors">
          <ArrowLeft size={20} /> Покинути
        </button>
        <button onClick={restartGame} disabled={isProcessing} className="flex items-center gap-2 text-blue-400 hover:text-blue-300 font-bold transition-colors bg-blue-900/20 px-3 py-1.5 rounded-lg border border-blue-900/50">
          <RotateCcw size={16} /> Рестарт
        </button>
      </div>

      <div className="flex justify-between items-center mb-6 bg-neutral-900 border border-neutral-800 p-4 rounded-2xl">
        <div>
          <div className="text-xs text-neutral-500 uppercase font-bold mb-1">Поточний Рахунок</div>
          <div className="text-2xl font-black text-white">{score}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-neutral-500 uppercase font-bold mb-1">Нагорода</div>
          <div className="text-xl font-black text-yellow-500 flex items-center gap-1 justify-end">
            {score} <Coins size={18} />
          </div>
        </div>
      </div>

      <div
        className="bg-neutral-900 p-2 sm:p-3 rounded-2xl border border-neutral-800 touch-none shadow-xl"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="relative w-full aspect-square">
          {/* ФОНОВІ КЛІТИНКИ (порожні) */}
          {Array.from({ length: 16 }).map((_, idx) => {
            const i = Math.floor(idx / 4);
            const j = idx % 4;
            return (
              <div key={`bg-${idx}`} className="absolute" style={{ width: '25%', height: '25%', top: `${i * 25}%`, left: `${j * 25}%`, padding: '4px' }}>
                <div className="w-full h-full bg-neutral-800/50 rounded-xl"></div>
              </div>
            );
          })}

          {/* АКТИВНІ КУБИКИ (з анімацією переміщення) */}
          {activeTiles.map(t => (
            <div key={t.id} className="absolute transition-all duration-150 ease-in-out" style={{ width: '25%', height: '25%', top: `${t.row * 25}%`, left: `${t.col * 25}%`, padding: '4px' }}>
              <div className={`w-full h-full flex items-center justify-center rounded-xl font-black text-2xl sm:text-3xl shadow-sm ${t.isNew ? 'animate-in zoom-in-50 duration-200' : ''} ${t.merged ? 'animate-in zoom-in-110 duration-150' : ''} ${getTileColor(t.val)}`}>
                {t.val}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 text-center text-sm text-neutral-500">Використовуйте стрілочки (або свайпи на телефоні), щоб об'єднувати плитки.</div>

      {gameOver && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center rounded-3xl animate-in fade-in p-6 text-center">
          {gameWon ? <Trophy size={80} className="text-fuchsia-500 mb-4 animate-bounce" /> : <Trophy size={60} className="text-yellow-500 mb-4" />}
          <h2 className={`text-3xl font-black mb-2 uppercase ${gameWon ? 'text-fuchsia-400' : 'text-white'}`}>
            {gameWon ? 'Перемога! 4096!' : 'Гру закінчено!'}
          </h2>
          <p className="text-neutral-300 mb-6">Ваш рахунок: <span className="text-white font-bold">{score}</span></p>

          <button onClick={claimReward} disabled={isProcessing} className="bg-yellow-500 hover:bg-yellow-400 text-yellow-950 font-black py-4 px-8 rounded-2xl flex items-center gap-2 shadow-[0_0_20px_rgba(234,179,8,0.5)]">
            {isProcessing ? <Loader2 size={20} className="animate-spin" /> : <Coins size={20} />}
            Забрати {score} монет
          </button>

          <button onClick={restartGame} className="mt-4 text-neutral-400 hover:text-white font-bold underline">
            Грати заново
          </button>
        </div>
      )}
    </div>
  );
}