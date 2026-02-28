import React, { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, Coins, Trophy, Loader2, RotateCcw, ArrowDown, ArrowLeft as LeftIcon, ArrowRight as RightIcon, ArrowUp } from "lucide-react";
import { claimTetrisRewardRequest, startTetrisGameRequest, getToken } from "../config/api";

const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 25; // Base block size, scales via CSS

const SHAPES = [
    [], // Empty
    [[1, 1, 1, 1]], // I (Cyan)
    [[1, 1, 1], [0, 1, 0]], // T (Purple)
    [[1, 1, 1], [0, 0, 1]], // L (Orange)
    [[1, 1, 1], [1, 0, 0]], // J (Blue)
    [[1, 1], [1, 1]], // O (Yellow)
    [[1, 1, 0], [0, 1, 1]], // S (Green)
    [[0, 1, 1], [1, 1, 0]] // Z (Red)
];

const COLORS = [
    "transparent",
    "cyan-400", // Made brighter/more solid
    "purple-500",
    "orange-500",
    "blue-500",
    "yellow-500",
    "green-500",
    "red-500"
];

// Tailwind classes for the neon look
const NEON_GLOW = [
    "transparent",
    "shadow-[0_0_15px_#22d3ee,inset_0_0_10px_#22d3ee]", // Increased glow and solidness for Cyan (I)
    "shadow-[0_0_10px_#a855f7,inset_0_0_8px_#a855f7]",
    "shadow-[0_0_10px_#f97316,inset_0_0_8px_#f97316]",
    "shadow-[0_0_10px_#3b82f6,inset_0_0_8px_#3b82f6]",
    "shadow-[0_0_10px_#eab308,inset_0_0_8px_#eab308]",
    "shadow-[0_0_10px_#22c55e,inset_0_0_8px_#22c55e]",
    "shadow-[0_0_10px_#ef4444,inset_0_0_8px_#ef4444]"
];

const GHOST_STYLES = [
    "transparent",
    "border-2 border-cyan-500/40 bg-cyan-500/10",
    "border-2 border-purple-500/40 bg-purple-500/10",
    "border-2 border-orange-500/40 bg-orange-500/10",
    "border-2 border-blue-500/40 bg-blue-500/10",
    "border-2 border-yellow-500/40 bg-yellow-500/10",
    "border-2 border-green-500/40 bg-green-500/10",
    "border-2 border-red-500/40 bg-red-500/10"
];

const createEmptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(0));

export default function GameTetris({ setProfile, goBack, showToast }) {
    const [board, setBoard] = useState(createEmptyBoard());
    const [score, setScore] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [dropSpeed, setDropSpeed] = useState(800); // ms
    const [timeElapsed, setTimeElapsed] = useState(0); // in seconds

    const [currentPiece, setCurrentPiece] = useState(null);

    const requestRef = useRef();
    const lastTimeRef = useRef();
    const timerRef = useRef();

    // Load saved state or start new
    useEffect(() => {
        const saved = localStorage.getItem('tetris_state');
        if (saved) {
            try {
                const { board: sBoard, score: sScore, currentPiece: sPiece, gameOver: sGameOver, timeElapsed: sTimeElapsed } = JSON.parse(saved);
                setBoard(sBoard);
                setScore(sScore);
                setCurrentPiece(sPiece);
                setGameOver(sGameOver);
                setTimeElapsed(sTimeElapsed || 0);
                setIsInitialized(true);
                if (sGameOver) localStorage.removeItem('tetris_state');
                return;
            } catch (e) { console.error('Error loading tetris state'); }
        }
        startGame();
    }, []);

    // Save state
    useEffect(() => {
        if (isInitialized && !gameOver) {
            localStorage.setItem('tetris_state', JSON.stringify({ board, score, currentPiece, gameOver, timeElapsed }));
        }
    }, [board, score, currentPiece, gameOver, isInitialized, timeElapsed]);

    const startGame = async () => {
        setIsProcessing(true);
        try {
            await startTetrisGameRequest(getToken());
            setBoard(createEmptyBoard());
            setScore(0);
            setGameOver(false);
            setIsPaused(false);
            setTimeElapsed(0);
            spawnPiece();
            setDropSpeed(800);
            localStorage.removeItem('tetris_state');
            setIsInitialized(true);
        } catch (e) {
            showToast(e.message || "Не вдалося почати гру.", "error");
            goBack();
        } finally {
            setIsProcessing(false);
        }
    };

    const getRandomPiece = () => {
        const typeId = Math.floor(Math.random() * 7) + 1;
        return {
            shape: SHAPES[typeId],
            colorId: typeId,
            x: Math.floor(COLS / 2) - Math.floor(SHAPES[typeId][0].length / 2),
            y: 0
        };
    };

    const spawnPiece = () => {
        // If not passed existing, we'll get a real random piece. 
        // Usually handled correctly by setState func.
        setCurrentPiece(getRandomPiece());
    };

    const checkCollision = (piece, boardData, moveX = 0, moveY = 0) => {
        for (let y = 0; y < piece.shape.length; y++) {
            for (let x = 0; x < piece.shape[y].length; x++) {
                if (piece.shape[y][x]) {
                    const newY = piece.y + y + moveY;
                    const newX = piece.x + x + moveX;
                    if (
                        newX < 0 || newX >= COLS ||
                        newY >= ROWS ||
                        (newY >= 0 && boardData[newY][newX])
                    ) {
                        return true;
                    }
                }
            }
        }
        return false;
    };

    const rotatePiece = (piece) => {
        const newShape = piece.shape[0].map((_, index) =>
            piece.shape.map(row => row[index]).reverse()
        );
        return { ...piece, shape: newShape };
    };

    const tryRotate = useCallback(() => {
        if (!currentPiece || gameOver || isPaused) return;
        const rotated = rotatePiece(currentPiece);

        let offset = 0;
        let valid = false;

        // Wall kick logic (try placing it without offset, then 1 left, 2 left, 1 right, 2 right)
        const offsets = [0, -1, 1, -2, 2];
        for (let i = 0; i < offsets.length; i++) {
            if (!checkCollision(rotated, board, offsets[i], 0)) {
                offset = offsets[i];
                valid = true;
                break;
            }
        }

        if (valid) {
            setCurrentPiece({ ...rotated, x: rotated.x + offset });
        }
    }, [currentPiece, board, gameOver, isPaused]);

    const mergePiece = useCallback(() => {
        if (!currentPiece) return;

        let newBoard = board.map(row => [...row]);
        let gameEnded = false;

        for (let y = 0; y < currentPiece.shape.length; y++) {
            for (let x = 0; x < currentPiece.shape[y].length; x++) {
                if (currentPiece.shape[y][x]) {
                    const boardY = currentPiece.y + y;
                    if (boardY < 0) {
                        gameEnded = true;
                    } else {
                        newBoard[boardY][currentPiece.x + x] = currentPiece.colorId;
                    }
                }
            }
        }

        if (gameEnded) {
            setGameOver(true);
            return;
        }

        // Check lines
        let newScore = score;
        let linesCleared = 0;

        // We filter out full lines and unshift empty ones
        const filteredBoard = newBoard.filter(row => !row.every(cell => cell > 0));
        linesCleared = ROWS - filteredBoard.length;

        if (linesCleared > 0) {
            const emptyLines = Array.from({ length: linesCleared }, () => Array(COLS).fill(0));
            newBoard = [...emptyLines, ...filteredBoard];

            // Calculate score (Tetris standard modified for more rewards: 200, 500, 900, 1500)
            const lineScores = [0, 200, 500, 900, 1500];
            newScore += lineScores[linesCleared];

            // Increase speed slightly per line cleared (make it smooth)
            setDropSpeed(prev => Math.max(100, prev - (linesCleared * 10)));
        }

        setBoard(newBoard);
        setScore(newScore);
        setCurrentPiece(getRandomPiece());

        // Check if new piece immediately collides (Game Over)
        const nextPiece = getRandomPiece();
        if (checkCollision(nextPiece, newBoard)) {
            setGameOver(true);
            setCurrentPiece(nextPiece); // Just for render
        } else {
            setCurrentPiece(nextPiece);
        }

    }, [board, currentPiece, score]);

    const moveDown = useCallback(() => {
        if (gameOver || isPaused || !currentPiece) return;

        if (!checkCollision(currentPiece, board, 0, 1)) {
            setCurrentPiece(prev => ({ ...prev, y: prev.y + 1 }));
        } else {
            mergePiece();
        }
    }, [currentPiece, board, gameOver, isPaused, mergePiece]);

    const moveLeft = useCallback(() => {
        if (!currentPiece || gameOver || isPaused) return;
        if (!checkCollision(currentPiece, board, -1, 0)) {
            setCurrentPiece(prev => ({ ...prev, x: prev.x - 1 }));
        }
    }, [currentPiece, board, gameOver, isPaused]);

    const moveRight = useCallback(() => {
        if (!currentPiece || gameOver || isPaused) return;
        if (!checkCollision(currentPiece, board, 1, 0)) {
            setCurrentPiece(prev => ({ ...prev, x: prev.x + 1 }));
        }
    }, [currentPiece, board, gameOver, isPaused]);

    const hardDrop = useCallback(() => {
        if (!currentPiece || gameOver || isPaused) return;
        let newY = currentPiece.y;
        while (!checkCollision(currentPiece, board, 0, newY - currentPiece.y + 1)) {
            newY++;
        }
        setCurrentPiece(prev => ({ ...prev, y: newY }));
    }, [currentPiece, board, gameOver, isPaused]);

    // Timer effect
    useEffect(() => {
        if (isInitialized && !gameOver && !isPaused) {
            timerRef.current = setInterval(() => {
                setTimeElapsed(prev => {
                    const newTime = prev + 1;
                    // Make speed increment much slower
                    // At 5 mins (300s): prev logic was 20 drops (300/15) * 10ms = 200ms faster (800 -> 600)
                    // At 10 mins (600s): prev logic was 40 drops (600/15) * 10ms = 400ms faster (800 -> 400)
                    // New logic: reach the 5-min speed (600ms) at 10 mins. Time elapsed 600s -> need 200ms drop.
                    // 600 / 30 = 20. 20 * 10 = 200. So every 30 seconds we drop 10ms.
                    if (newTime % 30 === 0) {
                        setDropSpeed(s => Math.max(100, s - 10));
                    }
                    return newTime;
                });
            }, 1000);
        }
        return () => clearInterval(timerRef.current);
    }, [isInitialized, gameOver, isPaused]);

    // Main game loop
    useEffect(() => {
        const loop = (time) => {
            if (!lastTimeRef.current) lastTimeRef.current = time;
            const deltaTime = time - lastTimeRef.current;

            if (deltaTime >= dropSpeed) {
                moveDown();
                lastTimeRef.current = time;
            }
            requestRef.current = requestAnimationFrame(loop);
        };

        if (!gameOver && !isPaused && isInitialized) {
            requestRef.current = requestAnimationFrame(loop);
        }

        return () => cancelAnimationFrame(requestRef.current);
    }, [moveDown, gameOver, isPaused, dropSpeed, isInitialized]);


    // Controls
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (gameOver || isPaused || !currentPiece) return;

            switch (e.key) {
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    e.preventDefault();
                    moveLeft();
                    break;
                case 'ArrowRight':
                case 'd':
                case 'D':
                    e.preventDefault();
                    moveRight();
                    break;
                case 'ArrowDown':
                case 's':
                case 'S':
                    e.preventDefault();
                    moveDown();
                    break;
                case 'ArrowUp':
                case 'w':
                case 'W':
                    e.preventDefault();
                    tryRotate();
                    break;
                case ' ': // Hard drop
                    e.preventDefault();
                    hardDrop();
                    break;
                default:
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentPiece, gameOver, isPaused, moveLeft, moveRight, moveDown, tryRotate, hardDrop]);

    // Format time (MM:SS)
    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };


    // No more swipe touch controls, replaced by UI buttons

    const getRenderBoard = () => {
        const renderBoard = board.map(row => [...row]);

        let ghostY = -1;
        if (currentPiece) {
            ghostY = currentPiece.y;
            while (!checkCollision(currentPiece, board, 0, ghostY - currentPiece.y + 1)) {
                ghostY++;
            }
        }

        if (currentPiece) {
            for (let y = 0; y < currentPiece.shape.length; y++) {
                for (let x = 0; x < currentPiece.shape[y].length; x++) {
                    if (currentPiece.shape[y][x]) {
                        // Ghost Piece
                        if (ghostY >= 0) {
                            const gbY = ghostY + y;
                            if (gbY >= 0 && gbY < ROWS && !renderBoard[gbY][currentPiece.x + x]) {
                                renderBoard[gbY][currentPiece.x + x] = -currentPiece.colorId;
                            }
                        }

                        // Current Piece
                        const boardY = currentPiece.y + y;
                        if (boardY >= 0 && boardY < ROWS) {
                            renderBoard[boardY][currentPiece.x + x] = currentPiece.colorId;
                        }
                    }
                }
            }
        }
        return renderBoard;
    };

    const claimReward = async () => {
        if (score < 50) {
            showToast("Рахунок має бути хоча б 50!");
            localStorage.removeItem('tetris_state');
            return goBack();
        }
        setIsProcessing(true);
        try {
            const data = await claimTetrisRewardRequest(getToken(), score);
            setProfile(data.profile);
            showToast(`Ви отримали ${data.earned} монет за гру!`, "success");
            localStorage.removeItem('tetris_state');
            goBack();
        } catch (e) {
            showToast(e.message || "Помилка отримання нагороди.");
            setIsProcessing(false);
        }
    };


    if (!isInitialized) return null;

    const renderBoard = getRenderBoard();

    return (
        <div className="pb-10 animate-in fade-in zoom-in-95 max-w-lg mx-auto relative select-none">
            <div className="flex justify-between items-center mb-4">
                <button onClick={goBack} disabled={isProcessing} className="flex items-center gap-2 text-neutral-400 hover:text-white font-bold transition-colors">
                    <ArrowLeft size={20} /> Покинути
                </button>
                <div className="flex gap-2">
                    <button onClick={() => setIsPaused(!isPaused)} disabled={gameOver || isProcessing} className="flex items-center gap-2 text-yellow-400 hover:text-yellow-300 font-bold transition-colors bg-yellow-900/20 px-3 py-1.5 rounded-lg border border-yellow-900/50">
                        {isPaused ? "Продовжити" : "Пауза"}
                    </button>
                    <button onClick={startGame} disabled={isProcessing} className="flex items-center gap-2 text-blue-400 hover:text-blue-300 font-bold transition-colors bg-blue-900/20 px-3 py-1.5 rounded-lg border border-blue-900/50">
                        <RotateCcw size={16} /> Рестарт
                    </button>
                </div>
            </div>

            <div className="flex justify-between items-center mb-6 bg-neutral-900 border border-neutral-800 p-4 rounded-2xl">
                <div>
                    <div className="text-xs text-neutral-500 uppercase font-bold mb-1">Рахунок</div>
                    <div className="text-2xl font-black text-white glow-text glow-blue">{score}</div>
                </div>
                <div className="text-center">
                    <div className="text-xs text-neutral-500 uppercase font-bold mb-1">Час грає</div>
                    <div className="text-xl font-bold text-neutral-300 font-mono tracking-wider">{formatTime(timeElapsed)}</div>
                </div>
                <div className="text-right">
                    <div className="text-xs text-neutral-500 uppercase font-bold mb-1">Нагорода</div>
                    <div className="text-xl font-black text-yellow-500 flex items-center gap-1 justify-end glow-text glow-yellow">
                        {score * 6} <Coins size={18} />
                    </div>
                </div>
            </div>

            <div className="flex justify-center w-full">
                <div
                    className="bg-neutral-950 p-2 sm:p-4 rounded-2xl border-4 border-neutral-800 shadow-[0_0_30px_rgba(0,0,0,0.8)] relative overflow-hidden"
                >
                    <div className="relative">
                        {/* Grid background styling using actual grid to ensure alignment */}
                        <div
                            className="absolute inset-0 grid z-0 opacity-20 pointer-events-none"
                            style={{
                                gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
                                gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
                                gap: '1px'
                            }}
                        >
                            {Array.from({ length: COLS * ROWS }).map((_, i) => (
                                <div key={i} className="bg-neutral-800" />
                            ))}
                        </div>

                        <div
                            className="grid relative z-10"
                            style={{
                                gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
                                gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
                                width: 'min(85vw, 300px)',
                                height: 'min(170vw, 600px)', // aspect ratio 1:2
                                gap: '1px' // This gap perfectly aligns with the background grid
                            }}
                        >
                            {renderBoard.map((row, y) =>
                                row.map((cellId, x) => {
                                    const isGhost = cellId < 0;
                                    const actualId = Math.abs(cellId);
                                    return (
                                        <div
                                            key={`${y}-${x}`}
                                            className={`
                        w-full h-full rounded-[2px] 
                        transition-all duration-75 
                        ${actualId ?
                                                    (isGhost ? GHOST_STYLES[actualId] : `bg-${COLORS[actualId]} ${NEON_GLOW[actualId]} border border-white/20`)
                                                    : 'bg-transparent'}
                    `}
                                        />
                                    )
                                })
                            )}
                        </div>
                    </div>

                    {isPaused && !gameOver && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-20 flex items-center justify-center">
                            <div className="text-white font-black tracking-widest text-2xl uppercase glow-text glow-white">Пауза</div>
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-8 mb-4 max-w-xs mx-auto">
                <div className="grid grid-cols-3 gap-3 touch-manipulation">
                    <div className="col-start-2">
                        <button
                            onPointerDown={tryRotate}
                            className="w-full aspect-square bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 border border-neutral-700 rounded-2xl flex items-center justify-center text-white shadow-lg active:scale-95 transition-all outline-none"
                            style={{ WebkitTapHighlightColor: 'transparent' }}
                        >
                            <ArrowUp size={32} />
                        </button>
                    </div>

                    <div className="col-start-1 row-start-2">
                        <button
                            onPointerDown={moveLeft}
                            className="w-full aspect-square bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 border border-neutral-700 rounded-2xl flex items-center justify-center text-white shadow-lg active:scale-95 transition-all outline-none"
                            style={{ WebkitTapHighlightColor: 'transparent' }}
                        >
                            <LeftIcon size={32} />
                        </button>
                    </div>
                    <div className="col-start-2 row-start-2">
                        <button
                            onPointerDown={moveDown}
                            className="w-full aspect-square bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 border border-neutral-700 rounded-2xl flex items-center justify-center text-white shadow-lg active:scale-95 transition-all outline-none"
                            style={{ WebkitTapHighlightColor: 'transparent' }}
                        >
                            <ArrowDown size={32} />
                        </button>
                    </div>
                    <div className="col-start-3 row-start-2">
                        <button
                            onPointerDown={moveRight}
                            className="w-full aspect-square bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 border border-neutral-700 rounded-2xl flex items-center justify-center text-white shadow-lg active:scale-95 transition-all outline-none"
                            style={{ WebkitTapHighlightColor: 'transparent' }}
                        >
                            <RightIcon size={32} />
                        </button>
                    </div>
                </div>
            </div>

            {gameOver && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex flex-col items-center justify-center animate-in fade-in p-6 text-center shadow-[inset_0_0_100px_rgba(255,0,0,0.2)]">
                    <Trophy size={60} className="text-yellow-500 mb-4 drop-shadow-[0_0_15px_rgba(234,179,8,0.8)]" />
                    <h2 className={`text-4xl font-black mb-2 uppercase text-white tracking-widest drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]`}>
                        Гру закінчено
                    </h2>
                    <p className="text-neutral-300 mb-8 text-xl">Ваш рахунок: <span className="text-green-400 font-bold drop-shadow-[0_0_10px_rgba(74,222,128,0.8)]">{score}</span></p>

                    <button onClick={claimReward} disabled={isProcessing} className="bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-yellow-950 font-black py-4 px-10 rounded-2xl flex items-center gap-3 shadow-[0_0_30px_rgba(234,179,8,0.6)] transform transition hover:scale-105 mb-4">
                        {isProcessing ? <Loader2 size={24} className="animate-spin" /> : <Coins size={24} />}
                        <span className="text-lg">Забрати {score * 6} монет</span>
                    </button>

                    <button onClick={startGame} className="mt-4 text-neutral-400 hover:text-white font-bold underline px-4 py-2 opacity-80 hover:opacity-100">
                        Грати заново
                    </button>
                </div>
            )}
        </div>
    );
}
