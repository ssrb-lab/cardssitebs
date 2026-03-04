import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Swords,
  Trophy,
  ShieldAlert,
  Zap,
  X,
  MapPin,
  Plus,
  Trash2,
  Castle,
  TowerControl,
  Tent,
  Hexagon,
  Shield,
  Flag,
  Landmark,
  Coins,
  Gem,
} from 'lucide-react';
import { getCardStyle, parseGameStat } from '../utils/helpers';
import PlayerAvatar from './PlayerAvatar';
import {
  fetchArenaPointsRequest,
  createArenaPointRequest,
  deleteArenaPointRequest,
  captureArenaPointRequest,
  battleArenaPointRequest,
  claimArenaCrystalsRequest,
  getToken,
} from '../config/api';

const ICONS = {
  castle: Castle,
  tower: TowerControl,
  tent: Tent,
  flag: Flag,
  landmark: Landmark,
  shield: Shield,
  hexagon: Hexagon,
};

const COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#4f46e5',
  '#a855f7',
  '#ec4899',
  '#ffffff',
  '#000000',
];

// Мінімальна сила за рідкістю для карток без записаної сили
const RARITY_MIN_POWER = {
  Унікальна: 100,
  Легендарна: 50,
  Епічна: 25,
  Рідкісна: 10,
  Звичайна: 5,
};

export default function GameArena({ profile, setProfile, cardsCatalog, goBack, showToast }) {
  const [deck, setDeck] = useState(() => {
    try {
      const saved = localStorage.getItem('arenaDeck');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (deck.length > 0) {
      localStorage.setItem('arenaDeck', JSON.stringify(deck));
    } else {
      localStorage.removeItem('arenaDeck');
    }
  }, [deck]);

  const [points, setPoints] = useState([]);
  const [isLoadingPoints, setIsLoadingPoints] = useState(true);

  // Map Interactive States
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Admin state
  const [isAddingPoint, setIsAddingPoint] = useState(false);
  const [adminPointData, setAdminPointData] = useState(null); // Holds data while configuring a new point
  const [selectedPoint, setSelectedPoint] = useState(null); // Which point is clicked open
  const [battleState, setBattleState] = useState(null); // State for the active battle view
  const [isBattleAnimating, setIsBattleAnimating] = useState(false);
  const [animationStepData, setAnimationStepData] = useState(null);
  const [battleResult, setBattleResult] = useState(null);
  const mapRef = useRef(null);

  // Timer state for cooldowns
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Load Points
  useEffect(() => {
    const loadPoints = async () => {
      try {
        const data = await fetchArenaPointsRequest(getToken());
        setPoints(data);
      } catch (err) {
        console.error('Error fetching arena points:', err);
      } finally {
        setIsLoadingPoints(false);
      }
    };
    loadPoints();
  }, []);

  const clampPan = (currentPan, currentZoom) => {
    const maxPan = 800 * currentZoom;
    let newX = currentPan.x;
    let newY = currentPan.y;
    if (Math.abs(newX) > maxPan) newX = Math.sign(newX) * maxPan;
    if (Math.abs(newY) > maxPan) newY = Math.sign(newY) * maxPan;
    if (newX !== currentPan.x || newY !== currentPan.y) {
      setPan({ x: newX, y: newY });
    }
  };

  // Map Interaction Handlers
  const handleWheel = (e) => {
    // Prevent default scroll behavior gracefully if needed
    const zoomSensitivity = 0.001;
    let newZoom = zoom - e.deltaY * zoomSensitivity;
    newZoom = Math.min(Math.max(0.5, newZoom), 5); // Allow zoom between 0.5x and 5x
    setZoom(newZoom);
    clampPan(pan, newZoom);
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0 || adminPointData) return; // Only left click, disable if modal open
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    clampPan(pan, zoom);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    clampPan(pan, zoom);
  };

  // Admin Add Point
  const handleMapClick = async (e) => {
    if (!profile?.isAdmin || !isAddingPoint || isDragging || adminPointData) return;

    // Calculate click coordinates relative to the underlying map image
    if (!mapRef.current) return;

    const rect = mapRef.current.getBoundingClientRect();

    // The click coordinates strictly on the visual rect
    const xClick = e.clientX - rect.left;
    const yClick = e.clientY - rect.top;

    // Convert to percentage of the image dimensions
    const xPercent = (xClick / rect.width) * 100;
    const yPercent = (yClick / rect.height) * 100;

    // Open modal to configure point
    // Omit logic changes here, keeping only the addition of crystalRatePerHour to the initial state
    setAdminPointData({
      x: xPercent,
      y: yPercent,
      name: 'Точка Арени',
      icon: 'castle',
      color: '#4f46e5',
      entryFee: 0,
      cooldownMinutes: 15,
      crystalRatePerHour: 0,
    });
    setIsAddingPoint(false);
  };

  const submitAdminPoint = async () => {
    if (!adminPointData) return;
    if (!adminPointData.name.trim()) return showToast('Назва не може бути порожньою', 'error');

    try {
      const data = await createArenaPointRequest(getToken(), {
        ...adminPointData,
        crystalRatePerHour: adminPointData.crystalRatePerHour || 0,
      });
      setPoints([...points, data.point]);
      showToast('Точку створено!', 'success');
      setAdminPointData(null);
    } catch (error) {
      showToast('Помилка створення точки.', 'error');
    }
  };

  const handleDeletePoint = async (pointId, e) => {
    e.stopPropagation();
    if (!window.confirm('Видалити цю точку?')) return;
    try {
      await deleteArenaPointRequest(getToken(), pointId);
      setPoints(points.filter((p) => p.id !== pointId));
      showToast('Точку видалено!', 'success');
    } catch (error) {
      showToast('Помилка видалення точки.', 'error');
    }
  };

  const handleCapturePoint = async (pointId, point, e) => {
    if (e) e.stopPropagation();

    if (deck.length !== 5) {
      return showToast(
        'Для захоплення точки необхідно обрати рівно 5 карт зі свого інвентаря.',
        'error'
      );
    }

    if (!window.confirm(`Захопити цю точку? Це коштуватиме ${point.entryFee} монет.`)) return;

    try {
      // Need to pass deck to the api call
      const data = await captureArenaPointRequest(getToken(), pointId, deck);
      const updatedPoint = data.point;
      setPoints(points.map((p) => (p.id === pointId ? updatedPoint : p)));
      if (selectedPoint?.id === pointId) {
        setSelectedPoint(updatedPoint); // trigger refresh
      }
      showToast(data.message || 'Точку успішно захоплено!', 'success');
    } catch (error) {
      showToast(error.message || 'Помилка захоплення точки.', 'error');
    }
  };

  const handleAttackPoint = (e) => {
    if (e) e.stopPropagation();

    if (deck.length !== 5) {
      return showToast('Для атаки необхідно обрати рівно 5 карт зі свого інвентаря.', 'error');
    }

    if (!selectedPoint || !selectedPoint.ownerId) return; // Saftey check

    // Check if point is protected locally (backend also checks)
    const capturedTime = new Date(selectedPoint.capturedAt).getTime();
    const cdUntil = capturedTime + selectedPoint.cooldownMinutes * 60 * 1000;
    if (Date.now() < cdUntil) {
      return showToast('Точка ще під захистом.', 'error');
    }

    // Enter battle view!
    setBattleState({
      point: selectedPoint,
      defenderDeck: selectedPoint.defendingCards || [],
      attackerDeck: deck,
    });
    setSelectedPoint(null); // Close sidebar
  };

  const handleClaimCrystals = async (pointId, e) => {
    if (e) e.stopPropagation();

    try {
      const data = await claimArenaCrystalsRequest(getToken(), pointId);
      const updatedPoint = data.point;

      setPoints(points.map((p) => (p.id === pointId ? updatedPoint : p)));
      if (selectedPoint?.id === pointId) {
        setSelectedPoint(updatedPoint);
      }
      if (setProfile && data.profile) {
        setProfile(data.profile);
      }
      showToast(`Успішно зібрано ${data.earnedCrystals} кристалів!`, 'success');
    } catch (error) {
      showToast(error.message || 'Помилка збору кристалів.', 'error');
    }
  };

  const ownedGameCards = [];
  if (profile?.inventory && cardsCatalog) {
    profile.inventory.forEach((invItem) => {
      const cardDetails = cardsCatalog.find((c) => c.id === invItem.cardId);

      let stats = invItem.gameStats;
      if (typeof stats === 'string') {
        try {
          stats = JSON.parse(stats);
        } catch (e) {
          stats = [];
        }
      }
      if (!Array.isArray(stats)) {
        stats = [];
      }

      // Якщо це ігрова карта, але вона не має записаної сили (старі карти або щойно випали), присвоюємо базову
      if (cardDetails && (cardDetails.isGame || stats.length > 0)) {
        const minPower = RARITY_MIN_POWER[cardDetails.rarity] || 5;
        const defaultStat = parseGameStat(minPower, cardDetails.rarity);
        const effectiveStats = stats.map((s) => parseGameStat(s, cardDetails.rarity)); // Recorded powers

        // Add default power for any amount that doesn't have a recorded stat yet
        while (effectiveStats.length < invItem.amount) {
          effectiveStats.push(defaultStat);
        }

        effectiveStats.forEach((statObj, idx) => {
          if (statObj.power > 0) {
            ownedGameCards.push({
              ...cardDetails,
              uniqueInstanceId: `${cardDetails.id}-${statObj.power}-${statObj.hp}-${idx}`, // Stable ID
              power: statObj.power,
              hp: statObj.hp,
            });
          }
        });
      }
    });
  }

  ownedGameCards.sort((a, b) => b.power - a.power);

  const handleToggleCard = (card) => {
    if (deck.find((c) => c.uniqueInstanceId === card.uniqueInstanceId)) {
      // Remove from deck
      setDeck(deck.filter((c) => c.uniqueInstanceId !== card.uniqueInstanceId));
    } else {
      // Check if card with same ID is already in deck
      if (deck.find((c) => c.id === card.id)) {
        showToast('Ця карта вже є в колоді (дублікати заборонені)', 'error');
        return;
      }
      if (deck.length >= 5) {
        showToast('Можна обрати максимум 5 карт у колоду', 'error');
        return;
      }
      setDeck([...deck, card]);
    }
  };

  const runBattleAnimation = async (log, initialAttackers, initialDefenders, won, pointUpdate) => {
    let currentAttackers = [...initialAttackers];
    let currentDefenders = [...initialDefenders];

    for (let i = 0; i < log.length; i++) {
      const step = log[i];

      setAnimationStepData({
        attackerSide: step.attackerSide,
        attackerIndex: step.attackerIndex,
        targetSide: step.attackerSide === 'attacker' ? 'defender' : 'attacker',
        targetIndex: step.targetIndex,
        damage: step.damage,
        isDead: step.isTargetDead,
      });

      await new Promise((resolve) => setTimeout(resolve, 800));

      if (step.attackerSide === 'attacker') {
        currentDefenders[step.targetIndex] = { ...currentDefenders[step.targetIndex] };
        currentDefenders[step.targetIndex].currentHp -= step.damage;
        if (currentDefenders[step.targetIndex].currentHp < 0)
          currentDefenders[step.targetIndex].currentHp = 0;
      } else {
        currentAttackers[step.targetIndex] = { ...currentAttackers[step.targetIndex] };
        currentAttackers[step.targetIndex].currentHp -= step.damage;
        if (currentAttackers[step.targetIndex].currentHp < 0)
          currentAttackers[step.targetIndex].currentHp = 0;
      }

      setBattleState((prev) => ({
        ...prev,
        attackerDeck: currentAttackers,
        defenderDeck: currentDefenders,
      }));

      setAnimationStepData(null);

      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    setTimeout(() => {
      setIsBattleAnimating(false);
      setBattleResult({ won });
      setPoints((points) => points.map((p) => (p.id === pointUpdate.id ? pointUpdate : p)));
    }, 1500);
  };

  const startBattle = async () => {
    if (!battleState || isBattleAnimating) return;

    try {
      setIsBattleAnimating(true);
      setBattleResult(null);

      const data = await battleArenaPointRequest(getToken(), battleState.point.id, deck);

      const attackerCards = deck.map((c) => ({ ...c, currentHp: c.hp || c.power }));
      const defenderCards = battleState.defenderDeck.map((c) => ({
        ...c,
        currentHp: c.hp || c.power || 1,
      }));

      if (setProfile && data.profile) {
        setProfile(data.profile);
      }

      setBattleState((prev) => ({
        ...prev,
        attackerDeck: attackerCards,
        defenderDeck: defenderCards,
      }));

      runBattleAnimation(
        data.battleLog,
        attackerCards,
        defenderCards,
        data.attackerWon,
        data.point
      );
    } catch (error) {
      setIsBattleAnimating(false);
      showToast(error.message || 'Помилка початку бою.', 'error');
    }
  };

  return (
    <div className="animate-in fade-in duration-500 fixed inset-0 z-50 bg-neutral-950 flex flex-col items-center justify-center p-4">
      {/* Header section with back button and profile block */}
      <div className="w-full flex items-center justify-between mb-4 border-b border-indigo-900/50 pb-4">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 font-bold transition-colors bg-indigo-950/30 px-4 py-2 rounded-xl"
        >
          <ArrowLeft size={20} /> Покинути Арену
        </button>

        <div className="flex items-center gap-3">
          <Trophy className="text-indigo-400" size={28} />
          <h2 className="text-3xl font-black text-white uppercase tracking-widest drop-shadow-md">
            Арена
          </h2>
        </div>

        <div className="flex flex-col items-end sm:flex-row sm:items-center gap-3 sm:gap-6 bg-indigo-950/20 px-4 py-2 rounded-2xl border border-indigo-900/30">
          <div className="flex items-center gap-3">
            <PlayerAvatar profile={profile} className="w-10 h-10 rounded-full" iconSize={20} />
            <div className="hidden md:block text-left">
              <div className="font-bold text-sm text-white flex items-center gap-1">
                {profile?.nickname}
              </div>
              <div className="text-xs text-indigo-400 font-bold">Гравець Арени</div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="bg-neutral-950/50 px-3 py-1.5 rounded-xl border border-indigo-900/50 flex gap-1.5 items-center">
              <Coins size={16} className="text-yellow-500" />
              <span className="text-yellow-500 font-black text-sm">{profile?.coins}</span>
            </div>
            <div className="bg-neutral-950/50 px-3 py-1.5 rounded-xl border border-indigo-900/50 flex gap-1.5 items-center">
              <Gem size={16} className="text-fuchsia-500" />
              <span className="text-fuchsia-500 font-black text-sm">{profile?.crystals || 0}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 w-full h-[calc(100vh-100px)] min-h-0 pb-4">
        {/* Left Panel - Deck Selection */}
        <div className="w-full lg:w-1/3 xl:w-1/4 flex flex-col gap-4 relative">
          {/* Block 1: Selected Cards */}
          <div className="bg-neutral-900/80 border border-indigo-500/30 rounded-3xl p-4 flex flex-col relative overflow-hidden shadow-[0_0_20px_rgba(99,102,241,0.1)] shrink-0 h-min">
            <h3 className="text-xl font-black text-white uppercase tracking-wide mb-2 flex items-center gap-2">
              <Swords size={20} className="text-indigo-500" /> Ваша Колода
            </h3>

            <div className="text-indigo-300 text-sm font-bold mb-4 bg-indigo-900/30 py-2 px-3 rounded-lg flex justify-between items-center">
              <span>Обрано карт:</span>
              <span
                className={`${deck.length === 5 ? 'text-green-400' : 'text-indigo-400'} text-lg`}
              >
                {deck.length} / 5
              </span>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar justify-between">
              {[...Array(5)].map((_, i) => {
                const card = deck[i];
                return card ? (
                  <div
                    key={card.uniqueInstanceId}
                    onClick={() => handleToggleCard(card)}
                    className="relative w-16 sm:w-20 lg:w-24 aspect-[2/3] flex-shrink-0 cursor-pointer group transition-all duration-200 shadow-lg"
                  >
                    <div
                      className={`w-full h-full rounded-xl overflow-hidden border-2 bg-neutral-900 group-hover:-translate-y-1 transition-transform border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.3)]`}
                    >
                      <img src={card.image} className="w-full h-full object-cover" />
                    </div>
                    <div className="absolute -bottom-2 inset-x-0 w-max mx-auto bg-neutral-900 border border-indigo-500 text-white font-bold text-[10px] px-2 py-0.5 rounded-full z-10 flex items-center justify-center gap-1 shadow-md">
                      <Zap size={10} className="text-yellow-500" /> {card.power}{' '}
                      <span className="text-red-500 ml-0.5">❤️</span> {card.hp || card.power || 50}
                    </div>
                    <div className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                      <X size={12} />
                    </div>
                  </div>
                ) : (
                  <div
                    key={`empty-${i}`}
                    className="w-16 sm:w-20 lg:w-24 aspect-[2/3] flex-shrink-0 rounded-xl border-2 border-dashed border-neutral-700 bg-neutral-950/50 flex items-center justify-center shadow-inner"
                  ></div>
                );
              })}
            </div>
          </div>

          {/* Block 2: Inventory Cards */}
          <div className="bg-neutral-900/80 border border-indigo-500/30 rounded-3xl p-4 flex flex-col relative overflow-hidden shadow-[0_0_20px_rgba(99,102,241,0.1)] flex-1 min-h-0">
            <h3 className="text-lg font-black text-white uppercase tracking-wide mb-3 flex items-center gap-2">
              Інвентар
            </h3>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              {ownedGameCards.length === 0 ? (
                <div className="text-neutral-500 text-center py-10 font-medium">
                  <ShieldAlert size={40} className="mx-auto mb-3 opacity-20" />У вас немає карт із
                  силою для Арени.
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                  {ownedGameCards.map((card) => {
                    const isSelected = deck.find((c) => c.id === card.id);
                    if (isSelected) return null; // Hide from inventory if already in deck

                    return (
                      <div
                        key={card.uniqueInstanceId}
                        onClick={() => handleToggleCard(card)}
                        className={`relative aspect-[2/3] rounded-lg border-2 overflow-hidden bg-neutral-900 cursor-pointer hover:-translate-y-1 hover:border-indigo-500 transition-all ${getCardStyle(card.rarity).border}`}
                        title={card.name}
                      >
                        <div className="absolute top-1 right-1 bg-black/80 font-black text-[10px] px-1.5 py-0.5 rounded-sm z-10 text-white flex items-center gap-1 border border-neutral-700 shadow-md">
                          <Zap size={8} className="text-yellow-400" /> {card.power}{' '}
                          <span className="text-red-500 ml-0.5">❤️</span>{' '}
                          {card.hp || card.power || 50}
                        </div>
                        <div className="w-full h-full relative group">
                          <img
                            src={card.image}
                            className="w-full h-full object-cover pointer-events-none"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Center & Right Panel - Interactive Map Content */}
        <div className="flex-1 bg-black border border-neutral-800/50 rounded-3xl flex flex-col relative shadow-inner overflow-hidden">
          {/* Admin Map Toolbar */}
          {profile?.isAdmin && (
            <div className="absolute top-4 right-4 z-50 bg-neutral-900/90 backdrop-blur-md p-2 rounded-xl flex items-center gap-2 border border-neutral-800 shadow-xl">
              <span className="text-xs uppercase font-bold text-neutral-400 mr-2 border-r border-neutral-700 pr-2">
                Адмін панель
              </span>
              <button
                onClick={() => setIsAddingPoint(!isAddingPoint)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isAddingPoint ? 'bg-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-neutral-800 text-indigo-400 hover:bg-neutral-700'}`}
              >
                <Plus size={14} /> {isAddingPoint ? 'Скасувати' : 'Додати Точку'}
              </button>
            </div>
          )}

          {/* Map Instructions */}
          <div className="absolute bottom-4 left-4 z-40 bg-neutral-900/80 backdrop-blur-sm p-3 rounded-xl border border-neutral-800 shadow-xl pointer-events-none">
            <div className="text-xs text-neutral-400 flex flex-col gap-1">
              <span className="flex items-center gap-2 font-bold mb-1">
                <MapPin size={14} className="text-indigo-400" /> Управління Картою:
              </span>
              <span>• Коліщатко миші для масштабування</span>
              <span>• ЛКМ для перетягування карти</span>
            </div>
          </div>

          {/* Admin Point Modal */}
          {adminPointData && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl flex flex-col gap-4">
                <h3 className="text-xl font-bold text-white uppercase tracking-wider text-center">
                  Налаштування точки
                </h3>

                <div>
                  <label className="text-xs uppercase font-bold text-neutral-400 mb-1 block">
                    Назва
                  </label>
                  <input
                    type="text"
                    value={adminPointData.name}
                    onChange={(e) => setAdminPointData({ ...adminPointData, name: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="text-xs uppercase font-bold text-neutral-400 mb-1 block">
                      Квиток (Монети)
                    </label>
                    <input
                      type="number"
                      value={adminPointData.entryFee}
                      onChange={(e) =>
                        setAdminPointData({ ...adminPointData, entryFee: e.target.value })
                      }
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs uppercase font-bold text-neutral-400 mb-1 block">
                      КД (Хв)
                    </label>
                    <input
                      type="number"
                      value={adminPointData.cooldownMinutes}
                      onChange={(e) =>
                        setAdminPointData({ ...adminPointData, cooldownMinutes: e.target.value })
                      }
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs uppercase font-bold text-neutral-400 mb-1 flex items-center gap-1">
                      <Gem size={10} className="text-fuchsia-500" /> Фарм/год
                    </label>
                    <input
                      type="number"
                      value={adminPointData.crystalRatePerHour || 0}
                      onChange={(e) =>
                        setAdminPointData({ ...adminPointData, crystalRatePerHour: e.target.value })
                      }
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs uppercase font-bold text-neutral-400 mb-2 block">
                    Іконка
                  </label>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {Object.keys(ICONS).map((iconKey) => {
                      const IconComp = ICONS[iconKey];
                      return (
                        <button
                          key={iconKey}
                          onClick={() => setAdminPointData({ ...adminPointData, icon: iconKey })}
                          className={`p-2 rounded-xl transition-all ${adminPointData.icon === iconKey ? 'bg-indigo-600 shadow-[0_0_10px_rgba(79,70,229,0.5)]' : 'bg-neutral-800 hover:bg-neutral-700'}`}
                        >
                          <IconComp size={20} className="text-white" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-xs uppercase font-bold text-neutral-400 mb-2 block">
                    Колір
                  </label>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {COLORS.map((colorHex) => (
                      <button
                        key={colorHex}
                        onClick={() => setAdminPointData({ ...adminPointData, color: colorHex })}
                        className={`w-8 h-8 rounded-full border-2 transition-transform ${adminPointData.color === colorHex ? 'border-white scale-110' : 'border-transparent hover:scale-105'}`}
                        style={{ backgroundColor: colorHex }}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-4">
                  <button
                    onClick={() => setAdminPointData(null)}
                    className="flex-1 px-4 py-3 rounded-xl bg-neutral-800 text-neutral-300 font-bold hover:bg-neutral-700 transition-colors"
                  >
                    Скасувати
                  </button>
                  <button
                    onClick={submitAdminPoint}
                    className="flex-1 px-4 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.3)] transition-colors"
                  >
                    Зберегти
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Map Container */}
          <div
            className={`w-full h-full relative overflow-hidden flex items-center justify-center ${adminPointData || selectedPoint ? '' : isAddingPoint ? 'cursor-crosshair' : isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          >
            <div
              ref={mapRef}
              onClick={handleMapClick}
              className={`relative origin-center ${isDragging ? 'transition-none' : 'transition-[transform] duration-300 ease-out'}`}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                // Ensure the div fits the image aspect ratio exactly
                display: 'inline-block',
              }}
            >
              <img
                src="/arena map/mapa.png"
                alt="Arena Map"
                className="max-w-none shadow-2xl rounded-sm object-contain select-none pointer-events-none"
                draggable="false"
                style={{
                  // Base width so it fits nicely on load, then zoom handles the rest
                  width: '1200px',
                }}
              />

              {/* Render Map Points */}
              {!isLoadingPoints &&
                points.map((point) => {
                  const PointIcon = ICONS[point.icon] || ICONS.castle;

                  let cdRemaining = 0;
                  let isProtected = false;
                  if (point.ownerId && point.capturedAt) {
                    const capturedTime = new Date(point.capturedAt).getTime();
                    const cdUntil = capturedTime + point.cooldownMinutes * 60 * 1000;
                    cdRemaining = Math.max(0, cdUntil - now);
                    isProtected = cdRemaining > 0;
                  }

                  const formatTime = (ms) => {
                    const totalSeconds = Math.floor(ms / 1000);
                    const m = Math.floor(totalSeconds / 60)
                      .toString()
                      .padStart(2, '0');
                    const s = (totalSeconds % 60).toString().padStart(2, '0');
                    return `${m}:${s}`;
                  };

                  return (
                    <div
                      key={point.id}
                      className="absolute transform -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${point.x}%`, top: `${point.y}%` }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isDragging) setSelectedPoint(point);
                      }}
                    >
                      <div
                        className={`
                                        w-8 h-8 rounded-full border-2 bg-neutral-900/80 backdrop-blur-sm
                                        flex items-center justify-center shadow-lg hover:scale-125 transition-transform cursor-pointer
                                    `}
                        style={{
                          borderColor:
                            point.ownerId === profile?.uid ? '#22c55e' : point.color || '#4f46e5',
                        }}
                      >
                        <PointIcon
                          size={16}
                          style={{
                            color:
                              point.ownerId === profile?.uid ? '#22c55e' : point.color || '#4f46e5',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Selected Point Right Panel Overlay */}
          {selectedPoint && (
            <div className="absolute top-0 right-0 w-80 h-full max-h-full overflow-y-auto bg-neutral-900/95 backdrop-blur-md border-l border-neutral-800 shadow-[-10px_0_30px_rgba(0,0,0,0.5)] z-40 flex flex-col p-4 animate-in slide-in-from-right duration-300">
              {/* Panel Header */}
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold uppercase text-white truncate pr-2">
                  {selectedPoint.name}
                </h3>
                <button
                  onClick={() => setSelectedPoint(null)}
                  className="p-1 rounded bg-neutral-800 text-neutral-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Point Info & Timers */}
              <div className="bg-neutral-950/50 rounded-xl p-3 border border-neutral-800 mb-4 flex flex-col gap-2 shadow-inner">
                {selectedPoint.ownerId ? (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-neutral-400">Власник:</span>
                      <span
                        className={`font-bold ${selectedPoint.ownerId === profile?.uid ? 'text-green-400' : 'text-red-400'}`}
                      >
                        {selectedPoint.ownerNickname}
                      </span>
                    </div>

                    {(() => {
                      const capturedTime = new Date(selectedPoint.capturedAt).getTime();
                      const cdUntil = capturedTime + selectedPoint.cooldownMinutes * 60 * 1000;
                      const cdRemaining = Math.max(0, cdUntil - now);
                      const isProtected = cdRemaining > 0;

                      const totalSeconds = Math.floor(cdRemaining / 1000);
                      const m = Math.floor(totalSeconds / 60)
                        .toString()
                        .padStart(2, '0');
                      const s = (totalSeconds % 60).toString().padStart(2, '0');

                      return (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-neutral-400">Кулдаун:</span>
                          {isProtected ? (
                            <span className="text-yellow-400 font-bold">
                              {m}:{s}
                            </span>
                          ) : (
                            <span className="text-indigo-400 font-bold">Відкрито до атаки</span>
                          )}
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-green-400 font-bold justify-center py-2 border-b border-neutral-800 pb-3 mb-1">
                    Вільна точка
                  </div>
                )}

                {selectedPoint.crystalRatePerHour > 0 &&
                  (() => {
                    let claimableCrystals = 0;
                    if (selectedPoint.crystalsLastClaimedAt) {
                      const lastClaimed = new Date(selectedPoint.crystalsLastClaimedAt).getTime();
                      const hoursElapsed = (now - lastClaimed) / (1000 * 60 * 60);
                      claimableCrystals = Math.floor(
                        hoursElapsed * selectedPoint.crystalRatePerHour
                      );
                    }

                    return (
                      <div className="flex flex-col gap-2 mt-1 border-t border-neutral-800/50 pt-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-neutral-400">Фарм кристалів:</span>
                          <span className="text-fuchsia-400 font-bold flex items-center gap-1">
                            <Gem size={14} /> {selectedPoint.crystalRatePerHour} / год
                          </span>
                        </div>
                        {selectedPoint.ownerId === profile?.uid && claimableCrystals > 0 && (
                          <button
                            onClick={(e) => handleClaimCrystals(selectedPoint.id, e)}
                            className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold py-2 mt-1 rounded-xl text-sm transition-colors shadow-[0_0_15px_rgba(217,70,239,0.2)] flex items-center justify-center gap-2"
                          >
                            <Gem size={16} /> Зібрати {claimableCrystals}
                          </button>
                        )}
                      </div>
                    );
                  })()}
              </div>

              {/* Defending Cards Showcase */}
              {selectedPoint.defendingCards && selectedPoint.defendingCards.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs uppercase font-bold text-neutral-500 mb-2 border-b border-neutral-800 pb-1">
                    Захисники
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedPoint.defendingCards.map((defCard, idx) => (
                      <div
                        key={idx}
                        className={`relative aspect-[2/3] rounded-lg border-2 overflow-hidden bg-neutral-950 ${getCardStyle(defCard.rarity).border}`}
                      >
                        <div className="absolute top-1 right-1 bg-black/80 font-black text-[10px] px-1 py-0.5 rounded z-10 text-white flex items-center gap-1 border border-neutral-700 shadow-md">
                          <Zap size={8} className="text-yellow-400" /> {defCard.power}{' '}
                          <span className="text-red-500 ml-0.5">❤️</span>{' '}
                          {defCard.hp || defCard.power || 50}
                        </div>
                        <img
                          src={defCard.image}
                          className="w-full h-full object-cover pointer-events-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-auto pt-4 flex flex-col gap-2">
                {selectedPoint.ownerId ? (
                  selectedPoint.ownerId !== profile?.uid && (
                    <button
                      onClick={handleAttackPoint}
                      className={`w-full font-bold py-3 rounded-xl transition-colors shadow-lg flex flex-col items-center justify-center ${deck.length === 5 ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-500/20' : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'}`}
                    >
                      <span>Атакувати (Ціна: {selectedPoint.entryFee})</span>
                      {deck.length < 5 && (
                        <span className="text-[9px] font-normal opacity-70 mt-1">
                          Оберіть ще {5 - deck.length} карт
                        </span>
                      )}
                    </button>
                  )
                ) : (
                  <button
                    onClick={(e) => handleCapturePoint(selectedPoint.id, selectedPoint, e)}
                    className={`w-full font-bold py-3 rounded-xl transition-colors shadow-lg flex flex-col items-center justify-center ${deck.length === 5 ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20' : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'}`}
                  >
                    <span>Захопити (Ціна: {selectedPoint.entryFee})</span>
                    {deck.length < 5 && (
                      <span className="text-[9px] font-normal opacity-70 mt-1">
                        Оберіть ще {5 - deck.length} карт
                      </span>
                    )}
                  </button>
                )}

                {profile?.isAdmin && (
                  <button
                    onClick={(e) => {
                      handleDeletePoint(selectedPoint.id, e);
                      setSelectedPoint(null);
                    }}
                    className="w-full mt-2 bg-neutral-800 hover:bg-red-900/50 text-red-500 hover:text-red-400 font-bold py-2 rounded-xl border border-red-500/30 transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    <Trash2 size={16} /> Видалити точку
                  </button>
                )}
              </div>
            </div>
          )}

          {/* BATTLE FIELD OVERLAY */}
          {battleState && (
            <div className="absolute inset-0 z-50 bg-[#0a0a0a] flex flex-col items-center justify-between p-6 animate-in fade-in zoom-in-95 duration-500 border border-red-500/20 shadow-[inset_0_0_100px_rgba(220,38,38,0.1)]">
              {/* Opponent (Defender) Area */}
              <div className="w-full flex-1 flex flex-col items-center justify-start gap-4">
                <div className="text-center">
                  <span className="text-red-500 font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2">
                    <ShieldAlert size={16} /> Захисник
                  </span>
                  <h3 className="text-2xl font-black text-white">
                    {battleState.point.ownerNickname}
                  </h3>
                </div>
                <div className="flex gap-4 justify-center items-center">
                  {battleState.defenderDeck.map((card, idx) => {
                    const hp =
                      card.currentHp !== undefined ? card.currentHp : card.hp || card.power || 1;
                    const isDead = hp <= 0;
                    const maxHp = card.hp || card.power || 1;
                    const hpPercent = Math.max(0, Math.min(100, (hp / maxHp) * 100));

                    const isAttacking =
                      animationStepData?.attackerSide === 'defender' &&
                      animationStepData?.attackerIndex === idx;
                    const isHit =
                      animationStepData?.targetSide === 'defender' &&
                      animationStepData?.targetIndex === idx;

                    return (
                      <div
                        key={idx}
                        className={`relative w-24 sm:w-32 aspect-[2/3] rounded-xl border-2 overflow-hidden bg-neutral-900 shadow-xl ${getCardStyle(card.rarity).border} transition-all duration-500 ${isDead ? 'grayscale opacity-50 relative top-4' : ''} ${isAttacking ? 'translate-y-[12vh] scale-125 z-40 shadow-[0_0_50px_rgba(239,68,68,1)]' : ''} ${isHit ? '-translate-y-2 rotate-[-5deg] border-red-500 brightness-150' : ''}`}
                        style={!isAttacking && !isHit ? { animationDelay: `${idx * 100}ms` } : {}}
                      >
                        <div className="absolute -bottom-2.5 inset-x-1 bg-black/90 font-black text-xs sm:text-sm px-1 py-1 rounded-lg z-20 text-white flex items-center justify-center gap-1 border border-red-500 shadow-lg">
                          <Zap size={10} className="text-yellow-500" /> {card.power}{' '}
                          <span className="text-red-500 ml-0.5">❤️</span> {Math.ceil(hp)}
                        </div>

                        {isHit && (
                          <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none animate-in slide-in-from-bottom-5 fade-in duration-500">
                            <span className="text-red-500 font-black text-4xl drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                              -{animationStepData.damage}
                            </span>
                          </div>
                        )}
                        <img
                          src={card.image}
                          className="w-full h-full object-cover pointer-events-none"
                        />

                        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-neutral-900 border-t border-red-500/30 z-10">
                          <div
                            className="h-full bg-red-500 transition-all duration-500 ease-out"
                            style={{ width: `${hpPercent}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                  {battleState.defenderDeck.length === 0 && (
                    <div className="text-neutral-500 italic">Схоже що точка порожня...</div>
                  )}
                </div>
              </div>

              {/* Center Status / Controls */}
              <div className="h-24 w-full flex items-center justify-center relative shrink-0">
                <div className="absolute w-full h-px bg-gradient-to-r from-transparent via-red-500/50 to-transparent"></div>
                <div className="relative bg-neutral-950 border-2 border-red-500/50 rounded-full w-20 h-20 flex items-center justify-center shadow-[0_0_30px_rgba(220,38,38,0.3)] z-10">
                  <div className="text-red-500 font-black italic text-2xl tracking-tighter">VS</div>
                </div>

                {!isBattleAnimating && !battleResult && (
                  <>
                    <button
                      onClick={startBattle}
                      className="absolute left-4 sm:left-[22%] top-1/2 -translate-y-1/2 bg-red-600 hover:bg-red-500 text-white font-black px-6 py-3 rounded-xl transition-all shadow-[0_0_20px_rgba(220,38,38,0.4)] hover:scale-105 uppercase text-sm border border-red-400 z-20"
                    >
                      Почати Бій ({battleState.point.entryFee} 🪙)
                    </button>
                    <button
                      onClick={() => setBattleState(null)}
                      className="absolute right-4 sm:right-[22%] top-1/2 -translate-y-1/2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold px-4 py-3 rounded-xl transition-colors border border-neutral-700 uppercase text-xs z-20"
                    >
                      Відступити (Скасувати)
                    </button>
                  </>
                )}
              </div>

              {/* Player (Attacker) Area */}
              <div className="w-full flex-1 flex flex-col items-center justify-end gap-4">
                <div className="flex gap-4 justify-center items-center">
                  {battleState.attackerDeck.map((card, idx) => {
                    const hp =
                      card.currentHp !== undefined ? card.currentHp : card.hp || card.power || 1;
                    const isDead = hp <= 0;
                    const maxHp = card.hp || card.power || 1;
                    const hpPercent = Math.max(0, Math.min(100, (hp / maxHp) * 100));

                    const isAttacking =
                      animationStepData?.attackerSide === 'attacker' &&
                      animationStepData?.attackerIndex === idx;
                    const isHit =
                      animationStepData?.targetSide === 'attacker' &&
                      animationStepData?.targetIndex === idx;

                    return (
                      <div
                        key={idx}
                        className={`relative w-24 sm:w-32 aspect-[2/3] rounded-xl border-2 overflow-hidden bg-neutral-900 shadow-xl shadow-indigo-500/10 ${getCardStyle(card.rarity).border} transition-all duration-500 ${isDead ? 'grayscale opacity-50 relative -top-4' : ''} ${isAttacking ? '-translate-y-[12vh] scale-125 z-40 shadow-[0_0_50px_rgba(99,102,241,1)]' : ''} ${isHit ? 'translate-y-2 rotate-[5deg] border-red-500 brightness-150' : ''}`}
                        style={!isAttacking && !isHit ? { animationDelay: `${idx * 100}ms` } : {}}
                      >
                        <div className="absolute -top-2.5 inset-x-1 bg-black/90 font-black text-xs sm:text-sm px-1 py-1 rounded-lg z-20 text-white flex items-center justify-center gap-1 border border-indigo-500 shadow-lg">
                          <Zap size={10} className="text-yellow-500" /> {card.power}{' '}
                          <span className="text-red-500 ml-0.5">❤️</span> {Math.ceil(hp)}
                        </div>

                        {isHit && (
                          <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none animate-in slide-in-from-top-5 fade-in duration-500">
                            <span className="text-red-500 font-black text-4xl drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                              -{animationStepData.damage}
                            </span>
                          </div>
                        )}
                        <img
                          src={card.image}
                          className="w-full h-full object-cover pointer-events-none"
                        />

                        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-neutral-900 border-t border-indigo-500/30 z-10">
                          <div
                            className="h-full bg-indigo-500 transition-all duration-500 ease-out"
                            style={{ width: `${hpPercent}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="text-center">
                  <h3 className="text-2xl font-black text-indigo-400">{profile?.nickname}</h3>
                  <span className="text-indigo-500/70 font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2">
                    <Swords size={16} /> Атакуючий
                  </span>
                </div>
              </div>

              {/* BATTLE RESULT MODAL */}
              {battleResult && (
                <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center animate-in fade-in zoom-in-50 duration-500 p-4">
                  <div className="bg-neutral-900 border border-neutral-700 rounded-3xl p-8 max-w-md w-full text-center flex flex-col items-center shadow-2xl">
                    {battleResult.won ? (
                      <>
                        <Trophy size={64} className="text-yellow-400 animate-bounce mb-4" />
                        <h2 className="text-4xl font-black text-white uppercase mb-2">Перемога!</h2>
                        <p className="text-neutral-400 mb-6">
                          Ви успішно захопили точку. Відтепер вона приноситиме вам кристали.
                        </p>
                      </>
                    ) : (
                      <>
                        <X size={64} className="text-red-500 mb-4" />
                        <h2 className="text-4xl font-black text-white uppercase mb-2">Поразка</h2>
                        <p className="text-neutral-400 mb-6">
                          Ваша колода була розбита у бою. Спробуйте зібрати сильніші карти!
                        </p>
                      </>
                    )}
                    <button
                      onClick={() => {
                        setBattleResult(null);
                        setBattleState(null);
                      }}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-colors"
                    >
                      Повернутися до карти
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
