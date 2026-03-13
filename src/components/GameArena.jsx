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
  ChevronLeft,
  ChevronRight,
  Anchor,
  Lock,
  Info,
  Flame,
  Droplets,
  Heart,
  Eye,
  ShieldCheck,
  Target,
  Skull,
  Crosshair,
  Stethoscope,
  Wind,
} from 'lucide-react';
import { getCardStyle, parseGameStat } from '../utils/helpers';
import PlayerAvatar from './PlayerAvatar';
import { PERK_META, PerkBadge } from './PerkBadge';
import {
  fetchArenaPointsRequest,
  createArenaPointRequest,
  updateArenaPointRequest,
  deleteArenaPointRequest,
  captureArenaPointRequest,
  battleArenaPointRequest,

  getToken,
} from '../config/api';

const StaticAvatar = ({ src, alt, className }) => {
  const [staticSrc, setStaticSrc] = useState(src);

  useEffect(() => {
    if (!src) return;
    if (src.includes('cdn.discordapp.com') && src.endsWith('.gif')) {
      setStaticSrc(src.replace('.gif', '.png'));
      return;
    }
    if (src.endsWith('.gif') || src.includes('.gif?')) {
      const img = new window.Image();
      img.crossOrigin = "Anonymous";
      img.src = src;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        setStaticSrc(canvas.toDataURL('image/png'));
      };
      img.onerror = () => {
        setStaticSrc(src); // Fallback
      };
    } else {
      setStaticSrc(src);
    }
  }, [src]);

  return <img src={staticSrc} alt={alt} className={className} />;
};

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
      if (saved) {
        const parsed = JSON.parse(saved);
        // Filter out stale cards that don't have statsIndex
        const valid = parsed.filter(c => c.statsIndex !== undefined && c.statsIndex !== null);
        if (valid.length !== parsed.length) localStorage.removeItem('arenaDeck');
        return valid;
      }
      return [];
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

  const [showRules, setShowRules] = useState(false);

  // Re-validate deck whenever inventory or catalog changes
  useEffect(() => {
    if (deck.length === 0 || !profile?.inventory || !cardsCatalog) return;

    const currentOwned = ownedGameCards;
    let deckChanged = false;
    const claimedUniqueIds = new Set();

    const validatedDeck = deck.map(deckCard => {
      // Find a matching card in current inventory that hasn't been claimed yet
      const match = currentOwned.find(oc => 
        oc.id === deckCard.id && 
        oc.power === deckCard.power && 
        oc.hp === deckCard.hp &&
        !claimedUniqueIds.has(oc.uniqueInstanceId)
      );

      if (match) {
        const isDefending = profile?.defendingInstances?.some(
          inst => inst.cardId === match.id && inst.statsIndex === match.statsIndex
        );
        
        if (isDefending) {
          deckChanged = true;
          return null; // Remove from deck if it's currently defending
        }

        claimedUniqueIds.add(match.uniqueInstanceId);
        // If the uniqueInstanceId (which includes statsIndex) changed, mark as deck changed
        if (match.uniqueInstanceId !== deckCard.uniqueInstanceId || match.statsIndex !== deckCard.statsIndex) {
          deckChanged = true;
          return { ...match };
        }
        return deckCard;
      } else {
        // Card no longer exists with these stats
        deckChanged = true;
        return null;
      }
    }).filter(c => c !== null);

    if (deckChanged) {
      console.log('Arena Deck Validated & Updated due to inventory changes');
      setDeck(validatedDeck);
    }
  }, [profile?.inventory, cardsCatalog]);

  const [points, setPoints] = useState([]);
  const [isLoadingPoints, setIsLoadingPoints] = useState(true);
  const [serverTimeOffset, setServerTimeOffset] = useState(0);

  // Map Interactive States
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialPinchDist, setInitialPinchDist] = useState(null);
  const [initialPinchZoom, setInitialPinchZoom] = useState(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);

  // Animation frame ref for smooth dragging
  const requestRef = useRef();
  const panRef = useRef({ x: 0, y: 0 });

  const updatePanPosition = () => {
    setPan({ ...panRef.current });
    requestRef.current = null;
  };

  const schedulePanUpdate = (newPan) => {
    panRef.current = newPan;
    if (!requestRef.current) {
      requestRef.current = requestAnimationFrame(updatePanPosition);
    }
  };

  useEffect(() => {
    panRef.current = pan;
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  // Admin state
  const [isAddingPoint, setIsAddingPoint] = useState(false);
  const [adminPointData, setAdminPointData] = useState(null); // Holds data while configuring a new point
  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);
  const [polygonPoints, setPolygonPoints] = useState([]); // Temporary points while drawing
  const [selectedPoint, setSelectedPoint] = useState(null); // Which point is clicked open
  const [battleState, setBattleState] = useState(null); // State for the active battle view
  const [isRevealed, setIsRevealed] = useState(false); // Whether hidden cards are flipped
  const [isBattleAnimating, setIsBattleAnimating] = useState(false);
  const [animationStepData, setAnimationStepData] = useState(null);
  const [battleResult, setBattleResult] = useState(null);
  const [showPerkInfo, setShowPerkInfo] = useState(false); // Perk info modal
  const mapRef = useRef(null);

  // Timer state for cooldowns - using server synchronized time
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now() + serverTimeOffset);
    }, 1000);
    return () => clearInterval(interval);
  }, [serverTimeOffset]);

  // Load Points
  useEffect(() => {
    const loadPoints = async () => {
      try {
        const data = await fetchArenaPointsRequest(getToken());
        if (data.serverTime) {
          const st = new Date(data.serverTime).getTime();
          setServerTimeOffset(st - Date.now());
          setNow(st);
        }
        setPoints(data.points || data);
      } catch (err) {
        console.error('Error fetching arena points:', err);
      } finally {
        setIsLoadingPoints(false);
      }
    };
    loadPoints();
  }, []);

  // Auto-polling: оновлюємо точки кожні 10 секунд для всіх гравців
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const data = await fetchArenaPointsRequest(getToken());
        setPoints(data.points || data);
        if (data.serverTime) {
          const st = new Date(data.serverTime).getTime();
          setServerTimeOffset(st - Date.now());
        }
      } catch (err) {
        // Тиха помилка - не заважаємо користувачу
      }
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const clampPan = (currentPan, currentZoom) => {
    if (!mapRef.current) return;
    
    // Get actual dimensions of the map container
    const mapWidth = 1200 * currentZoom;
    const mapHeight = mapRef.current.offsetHeight * currentZoom; // Approximate or use actual image height
    
    // We want to keep at least 20% of the map visible or prevent it from going too far
    // Based on the current implementation where 800 was a hardcoded magic number
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    
    // Calculate limits: currentPan.x is the offset from center/start
    // Let's use a more robust clamping logic based on zoom
    const limitX = (mapWidth / 2) + (screenWidth * 0.3);
    const limitY = (mapWidth * 0.8 / 2) + (screenHeight * 0.3); // Assuming ~0.8 aspect ratio for map
    
    let newX = currentPan.x;
    let newY = currentPan.y;
    
    if (Math.abs(newX) > limitX) newX = Math.sign(newX) * limitX;
    if (Math.abs(newY) > limitY) newY = Math.sign(newY) * limitY;
    
    if (newX !== currentPan.x || newY !== currentPan.y) {
      setPan({ x: newX, y: newY });
      panRef.current = { x: newX, y: newY };
    }
  };

  // Map Interaction Handlers
  const handleWheel = (e) => {
    // Prevent default scroll behavior gracefully if needed
    const zoomSensitivity = 0.001;
    let newZoom = zoom - e.deltaY * zoomSensitivity;
    newZoom = Math.min(Math.max(0.4, newZoom), 3); // Allow zoom between 0.4x and 3x
    setZoom(newZoom);
    clampPan(pan, newZoom);
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0 || isDrawingPolygon) return; // Only left click drags, and not when drawing
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

  const handleTouchStart = (e) => {
    if (isDrawingPolygon) return;
    // Prevent default browser behavior like scrolling/zooming the whole page
    if (e.cancelable) e.preventDefault();
    
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y });
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      setInitialPinchDist(dist);
      setInitialPinchZoom(zoom);
    }
  };

  const handleTouchMove = (e) => {
    if (isDrawingPolygon) return;
    // Prevent default browser behavior
    if (e.cancelable) e.preventDefault();

    if (e.touches.length === 1 && isDragging) {
      setPan({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y,
      });
    } else if (e.touches.length === 2 && initialPinchDist) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const zoomSensitivity = 0.005;
      const zoomDelta = (dist - initialPinchDist) * zoomSensitivity;
      let newZoom = initialPinchZoom + zoomDelta;
      newZoom = Math.min(Math.max(0.4, newZoom), 3);
      setZoom(newZoom);
    }
  };

  const handleTouchEnd = (e) => {
    if (e.touches.length < 2) {
      setInitialPinchDist(null);
      setInitialPinchZoom(null);
    }
    if (e.touches.length === 0) {
      setIsDragging(false);
      clampPan(pan, zoom);
    }
  };

  // Admin Add Point
  const handleMapClick = async (e) => {
    // Disable interaction if modal is open, or dragging
    if (isDragging || (!isAddingPoint && !isDrawingPolygon)) return;

    if (!mapRef.current) return;

    const rect = mapRef.current.getBoundingClientRect();
    const xClick = e.clientX - rect.left;
    const yClick = e.clientY - rect.top;
    const xPercent = (xClick / rect.width) * 100;
    const yPercent = (yClick / rect.height) * 100;

    if (isDrawingPolygon) {
      if (e.type === 'contextmenu') {
        e.preventDefault();
        setIsDrawingPolygon(false);
      } else {
        // Check if user clicked near the first point to close the polygon
        if (polygonPoints.length >= 2) {
          const firstPoint = polygonPoints[0];
          const dist = Math.sqrt(
            Math.pow(firstPoint.x - xPercent, 2) + Math.pow(firstPoint.y - yPercent, 2)
          );

          if (dist < 1.5) {
            // Distance threshold to snap closed (1.5% of map size)
            setIsDrawingPolygon(false);
            submitAdminPoint(polygonPoints); // Saving without adding the last redundant closing point
            return;
          }
        }
        setPolygonPoints([...polygonPoints, { x: xPercent, y: yPercent }]);
      }
      return;
    }

    if (adminPointData || selectedPoint) return; // Prevent clicking map behind modal or open point
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
      isLandingZone: false,
      neighborIds: [],
    });
    setIsAddingPoint(false);
  };

  const submitAdminPoint = async (overridePolygonPoints = null) => {
    if (!adminPointData) return;
    if (!adminPointData.name?.trim()) return showToast('Назва не може бути порожньою', 'error');

    const pointsToSave = overridePolygonPoints || polygonPoints;

    try {
      const payload = {
        ...adminPointData,
        crystalRatePerHour: adminPointData.crystalRatePerHour || 0,
        areaPolygon: pointsToSave.length > 0 ? pointsToSave : adminPointData.areaPolygon || [],
        isLandingZone: !!adminPointData.isLandingZone,
        neighborIds: adminPointData.neighborIds || [],
      };

      if (adminPointData.id) {
        // Edit mode
        const data = await updateArenaPointRequest(getToken(), adminPointData.id, payload);
        setPoints(points.map((p) => (p.id === data.point.id ? data.point : p)));
        showToast('Точку оновлено!', 'success');
        if (selectedPoint?.id === data.point.id) setSelectedPoint(data.point);
      } else {
        // Create mode
        const data = await createArenaPointRequest(getToken(), payload);
        setPoints([...points, data.point]);
        showToast('Точку створено!', 'success');
      }

      setAdminPointData(null);
      setPolygonPoints([]);
      setIsDrawingPolygon(false);
    } catch (error) {
      showToast('Помилка збереження точки.', 'error');
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

    if (point.lockedUntil && Date.now() < new Date(point.lockedUntil).getTime()) {
      return showToast('На цій точці вже ведеться бій іншим гравцем. Зачекайте...', 'error');
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
      // Оновлюємо профіль (з defendingInstances) одразу після захоплення
      if (setProfile && data.profile) {
        setProfile(data.profile);
      }
      setDeck([]);
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

    if (selectedPoint.lockedUntil && Date.now() < new Date(selectedPoint.lockedUntil).getTime()) {
      return showToast('На цій точці вже ведеться бій іншим гравцем. Зачекайте...', 'error');
    }

    // Enter battle view!
    setBattleState({
      point: selectedPoint,
      defenderDeck: selectedPoint.defendingCards || [],
      attackerDeck: deck,
    });
    setSelectedPoint(null); // Close sidebar
  };

  const ownedGameCards = React.useMemo(() => {
    const cards = [];
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

        if (cardDetails && (cardDetails.isGame || stats.length > 0)) {
          const minPower = RARITY_MIN_POWER[cardDetails.rarity] || 5;
          const defaultStat = parseGameStat(minPower, cardDetails.rarity);
          const effectiveStats = stats.map((s) => parseGameStat(s, cardDetails.rarity));

          while (effectiveStats.length < invItem.amount) {
            effectiveStats.push(defaultStat);
          }

          const limitedStats = effectiveStats.slice(0, invItem.amount);

          limitedStats.forEach((statObj, idx) => {
            if (statObj.power > 0) {
              cards.push({
                ...cardDetails,
                uniqueInstanceId: `${cardDetails.id}-${statObj.power}-${statObj.hp}-${idx}`,
                power: statObj.power,
                hp: statObj.hp,
                statsIndex: idx,
              });
            }
          });
        }
      });
    }
    return cards.sort((a, b) => b.power - a.power);
  }, [profile?.inventory, cardsCatalog]);

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
    let finalNote = null;

    // Reveal hidden cards before starting animation
    setIsRevealed(true);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for flip animation

    for (let i = 0; i < log.length; i++) {
      const step = log[i];
      if (step.note) {
        finalNote = step.note;
        continue; // Skip notes
      }

      const events = step.events || [];
      const targetSide = step.attackerSide === 'attacker' ? 'defender' : 'attacker';

      setAnimationStepData({
        attackerSide: step.attackerSide,
        attackerIndex: step.attackerIndex,
        targetSide: events.includes('healer') ? step.attackerSide : targetSide,
        targetIndex: step.targetIndex,
        damage: step.damage,
        isDead: step.isTargetDead,
        events,
        healAmount: step.healAmount,
        thornsDamage: step.thornsDamage,
      });

      await new Promise((resolve) => setTimeout(resolve, events.includes('dodge') ? 600 : 800));

      // Update HP based on events
      if (events.includes('healer')) {
        // Healer heals own team
        const team = step.attackerSide === 'attacker' ? currentAttackers : currentDefenders;
        team[step.targetIndex] = { ...team[step.targetIndex] };
        team[step.targetIndex].currentHp = Math.min(
          team[step.targetIndex].maxHp || team[step.targetIndex].hp || 1,
          team[step.targetIndex].currentHp + (step.healAmount || 0)
        );
      } else if (!events.includes('dodge')) {
        // Apply damage to target
        const defTeam = step.attackerSide === 'attacker' ? currentDefenders : currentAttackers;
        defTeam[step.targetIndex] = { ...defTeam[step.targetIndex] };
        defTeam[step.targetIndex].currentHp -= step.damage;
        if (events.includes('laststand') && defTeam[step.targetIndex].currentHp <= 0) {
          defTeam[step.targetIndex].currentHp = 1;
        }
        
        // Strict sync with backend
        if (step.isTargetDead) {
          defTeam[step.targetIndex].currentHp = 0;
        } else if (defTeam[step.targetIndex].currentHp <= 0) {
          defTeam[step.targetIndex].currentHp = 1;
        }

        if (defTeam[step.targetIndex].currentHp < 0) defTeam[step.targetIndex].currentHp = 0;

        // Lifesteal heal
        if (step.healAmount && events.includes('lifesteal')) {
          const atkTeam = step.attackerSide === 'attacker' ? currentAttackers : currentDefenders;
          atkTeam[step.attackerIndex] = { ...atkTeam[step.attackerIndex] };
          atkTeam[step.attackerIndex].currentHp = Math.min(
            atkTeam[step.attackerIndex].maxHp || atkTeam[step.attackerIndex].hp || 1,
            atkTeam[step.attackerIndex].currentHp + step.healAmount
          );
        }
        // Thorns damage
        if (step.thornsDamage) {
          const atkTeam = step.attackerSide === 'attacker' ? currentAttackers : currentDefenders;
          atkTeam[step.attackerIndex] = { ...atkTeam[step.attackerIndex] };
          atkTeam[step.attackerIndex].currentHp -= step.thornsDamage;
          if (atkTeam[step.attackerIndex].currentHp < 0) atkTeam[step.attackerIndex].currentHp = 0;
        }
      }

      setBattleState((prev) => ({
        ...prev,
        attackerDeck: currentAttackers,
        defenderDeck: currentDefenders,
      }));

      setAnimationStepData(null);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    setTimeout(() => {
      setIsBattleAnimating(false);
      setBattleResult({ won, attackerResults: pointUpdate.attackerResults, defenderResults: pointUpdate.defenderResults, note: finalNote });
      setPoints((points) => points.map((p) => (p.id === pointUpdate.id ? pointUpdate : p)));
      setDeck([]);
    }, 1500);
  };

  const startBattle = async () => {
    if (!battleState || isBattleAnimating) return;

    try {
      setIsBattleAnimating(true);
      setBattleResult(null);

      const data = await battleArenaPointRequest(getToken(), battleState.point.id, deck);

      const attackerCards = deck.map((c) => ({ ...c, currentHp: c.hp || c.power }));
      const defenderCards = (data.initialDefenderCards || battleState.defenderDeck).map((c) => ({
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
        {
          ...data.point,
          attackerResults: data.attackerResults,
          defenderResults: data.defenderResults
        }
      );
    } catch (error) {
      setIsBattleAnimating(false);
      showToast(error.message || 'Помилка початку бою.', 'error');
    }
  };

  return (
    <div className="animate-in fade-in duration-500 fixed inset-0 z-50 bg-neutral-950 flex flex-col items-center justify-center p-4">
      {/* CSS for Reveal Animation */}
      <style>{`
        .card-container {
          perspective: 1000px;
        }
        .card-inner {
          position: relative;
          width: 100%;
          height: 100%;
          transition: transform 0.8s;
          transform-style: preserve-3d;
        }
        .card-inner.is-flipped {
          transform: rotateY(180deg);
        }
        .card-front, .card-back {
          position: absolute;
          width: 100%;
          height: 100%;
          backface-visibility: hidden;
          top: 0;
          left: 0;
        }
        .card-back {
          transform: rotateY(180deg);
        }
      `}</style>

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
          <button
            onClick={() => setShowPerkInfo(true)}
            className="ml-2 bg-indigo-950/50 border border-indigo-700/50 hover:border-indigo-500 text-indigo-400 hover:text-indigo-300 p-1.5 rounded-lg transition-colors"
            title="Інфо про перки"
          >
            <Info size={18} />
          </button>
          <button
            onClick={() => setShowRules(true)}
            className="bg-red-950/50 border border-red-700/50 hover:border-red-500 text-red-500 hover:text-red-400 p-1.5 rounded-lg transition-colors flex items-center justify-center"
            title="Правила Арени"
          >
            <ShieldAlert size={18} />
          </button>
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

      <div className="flex flex-col lg:flex-row gap-6 w-full h-[calc(100vh-100px)] min-h-0 pb-4 relative overflow-hidden">
        {/* Left Panel - Deck Selection */}
        <div
          className={`flex flex-col gap-4 transition-all duration-500 ease-in-out shrink-0 h-full transform-gpu will-change-transform
            ${isSidebarOpen 
              ? 'absolute inset-0 z-50 bg-black/95 p-4 lg:p-0 lg:bg-transparent lg:relative w-full lg:w-[550px] xl:w-[650px] 2xl:w-[750px] opacity-100 translate-y-0 lg:translate-x-0 lg:translate-y-0' 
              : 'absolute inset-0 z-50 lg:relative w-full lg:w-0 opacity-0 translate-y-full lg:-ml-6 lg:-translate-x-full lg:translate-y-0 pointer-events-none'}
          `}
        >
          {/* Inner wrapper to maintain exact width while collapsing */}
          <div className="w-full lg:w-[550px] xl:w-[650px] 2xl:w-[750px] flex flex-col gap-4 h-[calc(100vh-120px)] lg:h-full overflow-y-auto custom-scrollbar lg:pr-2 pb-4">
            {/* Block 1: Selected Cards */}
            <div className="bg-neutral-900/80 border border-indigo-500/30 rounded-3xl p-4 flex flex-col relative overflow-hidden shadow-[0_0_20px_rgba(99,102,241,0.1)] shrink-0 h-min">
              <div className="flex items-center justify-between w-full mb-2">
                <h3 className="text-xl font-black text-white uppercase tracking-wide flex items-center gap-2">
                  <Swords size={20} className="text-indigo-500" /> Ваша Колода
                </h3>
                <button 
                  className="lg:hidden p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-neutral-400 hover:text-white transition-colors border border-neutral-700" 
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <X size={20}/>
                </button>
              </div>

              <div className="text-indigo-300 text-sm font-bold mb-4 bg-indigo-900/30 py-2 px-3 rounded-lg flex justify-between items-center">
                <span>Обрано карт:</span>
                <span
                  className={`${deck.length === 5 ? 'text-green-400' : 'text-indigo-400'} text-lg`}
                >
                  {deck.length} / 5
                </span>
              </div>

              <div className="grid grid-cols-5 gap-2 w-full pt-1 pb-3">
                {[...Array(5)].map((_, i) => {
                  const card = deck[i];
                  return card ? (
                    <div
                      key={card.uniqueInstanceId}
                      onClick={() => handleToggleCard(card)}
                      className="w-full aspect-[2/3] cursor-pointer group transition-all duration-200 shadow-lg relative"
                    >
                      <div className="w-full h-full rounded-xl overflow-hidden border-2 bg-neutral-900 group-hover:-translate-y-1 transition-transform border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.3)]">
                        <img src={card.image} className="w-full h-full object-cover" />
                      </div>

                      <PerkBadge perk={card.perk} />

                      {/* Scale stats to prevent overflowing width */}
                      <div className="absolute -bottom-2 inset-x-0 w-[110%] -ml-[5%] mx-auto bg-neutral-900 border border-indigo-500 text-white font-bold text-[8px] sm:text-[10px] xl:text-xs px-1 py-0.5 rounded-full z-10 flex items-center justify-center gap-0.5 shadow-md whitespace-nowrap">
                        <Zap size={10} className="text-yellow-500 shrink-0" /> {card.power}{' '}
                        <span className="text-red-500 shrink-0">❤️</span> {card.hp || card.power || 50}
                      </div>

                      <div className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-30">
                        <X size={12} />
                      </div>
                    </div>
                  ) : (
                    <div
                      key={`empty-${i}`}
                      className="w-full aspect-[2/3] rounded-xl border-2 border-dashed border-neutral-700 bg-neutral-950/50 flex items-center justify-center shadow-inner"
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
                  <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {ownedGameCards.map((card) => {
                      const isSelected = deck.find((c) => c.id === card.id);
                      if (isSelected) return null; // Hide from inventory if already in deck

                      const isDefending = profile?.defendingInstances?.some(
                        inst => inst.cardId === card.id && inst.statsIndex === card.statsIndex
                      );

                      return (
                        <div
                          key={card.uniqueInstanceId}
                          onClick={() => !isDefending && handleToggleCard(card)}
                          className={`relative aspect-[2/3] rounded-lg border-2 overflow-hidden bg-neutral-900 transition-all ${getCardStyle(card.rarity).border} ${isDefending ? 'grayscale opacity-50 cursor-not-allowed' : 'cursor-pointer hover:-translate-y-1 hover:border-indigo-500'}`}
                          title={isDefending ? "Захищає точку на Арені" : card.name}
                        >
                          {isDefending && (
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-red-900/90 text-white font-black text-[8px] px-1.5 py-0.5 rounded-full z-20 border border-red-700 shadow-xl text-center whitespace-nowrap">
                              Захищає
                            </div>
                          )}
                          <PerkBadge perk={card.perk} />
                          <div className={`absolute top-1 ${card.perk ? 'left-7' : 'left-1'} bg-black/80 font-black text-[10px] px-1.5 py-0.5 rounded-sm z-10 text-white flex items-center gap-1.5 border border-neutral-700 shadow-md`}>
                            <div className="flex items-center gap-0.5"><Zap size={10} className="text-yellow-400" /> <span>{card.power}</span></div>
                            <div className="flex items-center gap-0.5"><span className="text-red-500 text-[10px]">❤️</span> <span>{card.hp || card.power || 50}</span></div>
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
          </div> {/* End inner fixed-width wrapper */}
        </div>

        {/* Center & Right Panel - Interactive Map Content */}
        <div className="flex-1 bg-black border border-neutral-800/50 rounded-3xl flex flex-col relative shadow-inner overflow-hidden transition-all duration-500">

          {/* Sidebar Toggle Button (Desktop only) */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-[60] bg-neutral-900/90 border border-indigo-500/50 border-l-0 text-white p-1 rounded-r-xl shadow-[5px_0_15px_rgba(99,102,241,0.2)] hover:bg-indigo-900/80 transition-colors backdrop-blur-md hidden lg:flex items-center justify-center h-24 group outline-none"
          >
            {isSidebarOpen ? (
              <ChevronLeft className="text-indigo-400 group-hover:scale-110 transition-transform" size={24} />
            ) : (
              <ChevronRight className="text-indigo-400 group-hover:scale-110 transition-transform" size={24} />
            )}
          </button>

          {/* Mobile Deck Button */}
          {!isSidebarOpen && (
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden absolute bottom-4 right-4 z-[60] bg-indigo-600 hover:bg-indigo-500 text-white p-3 rounded-full shadow-[0_0_20px_rgba(79,70,229,0.5)] flex items-center justify-center transition-transform active:scale-95"
            >
              <Swords size={24} />
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border border-indigo-900">{deck.length}</span>
            </button>
          )}

          {/* Admin Map Toolbar */}
          {profile?.isAdmin && (
            <div className="absolute top-4 left-4 z-50 bg-neutral-900/90 backdrop-blur-md p-2 rounded-xl flex items-center gap-2 border border-neutral-800 shadow-xl">
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

          {/* Drawing Mode Toolbar */}
          {isDrawingPolygon && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-neutral-900/90 backdrop-blur-md p-3 rounded-xl flex items-center border border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.3)] animate-in slide-in-from-top duration-300 pointer-events-auto">
              <span className="text-white font-bold text-sm mr-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                Малювання зони...
              </span>
              <button
                onClick={() => setIsDrawingPolygon(false)}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold rounded-lg transition-colors border border-neutral-700"
              >
                Скасувати (ПКМ)
              </button>
            </div>
          )}

          {/* Admin Point Modal */}
          {adminPointData && !isDrawingPolygon && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto">
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

                {/* Landing Zone Toggle */}
                <div className="mt-3 border-t border-neutral-800 pt-3">
                  <label className="flex items-center justify-between cursor-pointer group">
                    <span className="text-xs uppercase font-bold text-neutral-400 flex items-center gap-1.5">
                      <Anchor size={12} className="text-cyan-400" /> Зона висадки
                    </span>
                    <div
                      onClick={() => setAdminPointData({ ...adminPointData, isLandingZone: !adminPointData.isLandingZone })}
                      className={`w-11 h-6 rounded-full relative transition-colors ${adminPointData.isLandingZone ? 'bg-cyan-600' : 'bg-neutral-700'}`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${adminPointData.isLandingZone ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                    </div>
                  </label>
                  <p className="text-[10px] text-neutral-500 mt-1">
                    {adminPointData.isLandingZone
                      ? 'Будь-який гравець може атакувати цю точку.'
                      : 'Атака можлива лише з сусідніх захоплених зон.'}
                  </p>
                </div>

                {/* Battle Mode Select */}
                <div className="mt-3 border-t border-neutral-800 pt-3">
                  <label className="text-xs uppercase font-bold text-neutral-400 mb-1.5 block">
                    Режим Бою
                  </label>
                  <select
                    value={adminPointData.battleMode || 'FULL'}
                    onChange={(e) => setAdminPointData({ ...adminPointData, battleMode: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-2.5 text-white text-sm focus:outline-none focus:border-red-500 transition-colors"
                  >
                    <option value="FULL">🟢 Повне Відновлення (Default)</option>
                    <option value="CHIP_DAMAGE">🟡 Втрата Статів (Chip Damage)</option>
                    <option value="HARDCORE">🔴 Хардкор (Перманентна Смерть)</option>
                  </select>

                  {adminPointData.battleMode === 'CHIP_DAMAGE' && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-neutral-400 w-1/2">Шанс втрати 5% ХП/Сили:</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={adminPointData.chipDamageChance || 0}
                        onChange={(e) => setAdminPointData({ ...adminPointData, chipDamageChance: e.target.value })}
                        className="w-1/2 bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-white text-sm focus:outline-none focus:border-yellow-500 transition-colors"
                      />
                      <span className="text-xs text-neutral-500">%</span>
                    </div>
                  )}
                  {adminPointData.battleMode === 'HARDCORE' && (
                    <p className="text-[10px] text-red-500 mt-1.5 font-bold">
                      ⚠️ УВАГА: Картки, які закінчують бій з 0 ХП, будуть назавжди ВИДАЛЕНІ з інвентаря!
                    </p>
                  )}
                </div>

                {/* Neighbor Points Selector (only when NOT landing zone) */}
                {!adminPointData.isLandingZone && (
                  <div className="mt-2">
                    <label className="text-xs uppercase font-bold text-neutral-400 mb-1.5 block">
                      Сусідні точки
                    </label>
                    <div className="flex flex-col gap-1 max-h-32 overflow-y-auto custom-scrollbar bg-neutral-950 rounded-xl p-2 border border-neutral-800">
                      {points.filter(p => p.id !== adminPointData.id).length === 0 ? (
                        <span className="text-neutral-500 text-xs text-center py-2">Немає інших точок</span>
                      ) : (
                        points.filter(p => p.id !== adminPointData.id).map(p => {
                          const isSelected = (adminPointData.neighborIds || []).includes(p.id);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                const current = adminPointData.neighborIds || [];
                                const updated = isSelected
                                  ? current.filter(nid => nid !== p.id)
                                  : [...current, p.id];
                                setAdminPointData({ ...adminPointData, neighborIds: updated });
                              }}
                              className={`text-left px-2 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 ${isSelected ? 'bg-cyan-900/50 text-cyan-300 border border-cyan-700' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800 border border-transparent'}`}
                            >
                              <div className={`w-3 h-3 rounded-sm border flex items-center justify-center ${isSelected ? 'bg-cyan-500 border-cyan-400' : 'border-neutral-600'}`}>
                                {isSelected && <span className="text-white text-[8px] font-black">✓</span>}
                              </div>
                              <span style={{ color: p.color }} className="mr-1">●</span>
                              {p.name}
                              {p.isLandingZone && <Anchor size={10} className="text-cyan-400 ml-auto" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* Ownership Management */}
                <div className="mt-3 border-t border-neutral-800 pt-3">
                  <label className="text-xs uppercase font-bold text-neutral-400 mb-2 block">
                    Управління власником
                  </label>
                  <div className="flex flex-col gap-2">
                    <input
                      type="text"
                      placeholder="UID Власника"
                      value={adminPointData.ownerId || ''}
                      onChange={(e) => setAdminPointData({ ...adminPointData, ownerId: e.target.value })}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-red-500 transition-colors"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Нікнейм Власника"
                        value={adminPointData.ownerNickname || ''}
                        onChange={(e) => setAdminPointData({ ...adminPointData, ownerNickname: e.target.value })}
                        className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-red-500 transition-colors"
                      />
                      <button
                        onClick={() => setAdminPointData({ ...adminPointData, ownerId: null, ownerNickname: null, defendingCards: [], capturedAt: null, crystalsLastClaimedAt: null })}
                        className="px-3 py-2 bg-red-900/50 hover:bg-red-800/80 text-red-300 rounded-xl font-bold text-xs border border-red-700/50 transition-colors whitespace-nowrap"
                      >
                        Звільнити
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-4">
                  {isDrawingPolygon ? (
                    <button
                      onClick={() => setIsDrawingPolygon(false)}
                      className="flex-1 px-4 py-2 rounded-xl bg-orange-600 text-white font-bold hover:bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.3)] transition-colors"
                    >
                      Закінчити Зону ({polygonPoints.length} т.)
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setIsDrawingPolygon(true);
                        setPolygonPoints([]); // Reset points on new draw
                      }}
                      className="flex-1 px-4 py-2 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-500 shadow-[0_0_15px_rgba(217,119,6,0.3)] transition-colors text-sm"
                    >
                      Намалювати Зону
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3 mt-2 border-t border-neutral-800 pt-4">
                  <button
                    onClick={() => {
                      setAdminPointData(null);
                      setIsDrawingPolygon(false);
                      setPolygonPoints([]);
                    }}
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
            className={`w-full h-full relative overflow-hidden flex items-center justify-center touch-none ${adminPointData || selectedPoint || isDrawingPolygon ? '' : isAddingPoint ? 'cursor-crosshair' : isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onContextMenu={(e) => isDrawingPolygon && e.preventDefault()}
          >
              <div
                ref={mapRef}
                onClick={handleMapClick}
                className={`relative origin-center ${isDragging ? 'transition-none' : 'transition-[transform] duration-300 ease-out'}`}
                style={{
                  transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                  willChange: 'transform',
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  // Ensure the div fits the image aspect ratio exactly
                  display: 'inline-block',
                }}
              >
              <img
                src="/arena map/mapa.avif"
                alt="Arena Map"
                className="max-w-none shadow-2xl rounded-sm object-contain select-none pointer-events-none"
                draggable="false"
                style={{
                  // Base width so it fits nicely on load, then zoom handles the rest
                  width: '1200px',
                }}
              />

              {/* Render Map Points & Polygons */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                {!isLoadingPoints &&
                  points.map((point) => {
                    if (!point.areaPolygon || point.areaPolygon.length < 3) return null;
                    const pointsString = point.areaPolygon.map((p) => `${p.x},${p.y}`).join(' ');
                    const isOwner = point.ownerId && point.ownerId === profile?.uid;
                    const polyColor = isOwner ? '#22c55e' : point.color || '#4f46e5';

                    return (
                      <polygon
                        key={`poly-${point.id}`}
                        points={pointsString}
                        fill={selectedPoint?.id === point.id ? polyColor : 'transparent'}
                        fillOpacity={selectedPoint?.id === point.id ? 0.3 : 0}
                        stroke={polyColor}
                        strokeWidth="0.4"
                        strokeDasharray={selectedPoint?.id === point.id ? 'none' : '1,1'}
                        strokeLinejoin="round"
                        className="transition-all duration-300"
                      />
                    );
                  })}
                {/* Active drawing polygon */}
                {isDrawingPolygon && (
                  <>
                    {polygonPoints.length > 0 && (
                      <polygon
                        points={polygonPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                        fill={adminPointData?.color || '#ffffff'}
                        fillOpacity={0.3}
                        stroke={adminPointData?.color || '#ffffff'}
                        strokeWidth="0.3"
                        strokeLinejoin="round"
                      />
                    )}
                    {polygonPoints.map(
                      (p, idx) =>
                        idx === 0 && (
                          <circle
                            key={`start-point-${idx}`}
                            cx={p.x}
                            cy={p.y}
                            r="0.8"
                            fill="white"
                            stroke="black"
                            strokeWidth="0.2"
                            className="animate-pulse" // Helps user find the start point
                          />
                        )
                    )}
                  </>
                )}
              </svg>

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

                  // Перевірка блокування (якщо інший гравець зараз б'ється)
                  let lockRemaining = 0;
                  if (point.lockedUntil) {
                    lockRemaining = Math.max(0, new Date(point.lockedUntil).getTime() - now);
                  }

                  const formatTime = (ms) => {
                    const totalSeconds = Math.floor(ms / 1000);
                    const m = Math.floor(totalSeconds / 60)
                      .toString()
                      .padStart(2, '0');
                    const s = (totalSeconds % 60).toString().padStart(2, '0');
                    return `${m}:${s}`;
                  };

                  const avatarUrl = (point.ownerId === profile?.uid && profile?.avatarUrl) 
                    ? profile.avatarUrl 
                    : point.ownerAvatarUrl;

                  return (
                    <div
                      key={point.id}
                      className="absolute transform -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${point.x}%`, top: `${point.y}%` }}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Disable selection if dragging, playing admin or drawing
                        if (!isDragging && !adminPointData && !isDrawingPolygon && !isAddingPoint) {
                          setSelectedPoint(point);
                        }
                      }}
                    >
                      <div className="relative">
                        {/* Таймери над точкою */}
                        {(isProtected || lockRemaining > 0) && (
                          <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5 z-30 pointer-events-none">
                            {lockRemaining > 0 && (
                              <div className="bg-red-600/90 text-white font-black text-[9px] px-1.5 py-0.5 rounded-full shadow-lg border border-red-400 flex items-center gap-1 animate-pulse">
                                <Flame size={8} /> {formatTime(lockRemaining)}
                              </div>
                            )}
                            {isProtected && lockRemaining <= 0 && (
                              <div className="bg-yellow-500/90 text-black font-black text-[9px] px-1.5 py-0.5 rounded-full shadow-lg border border-yellow-300 flex items-center gap-1">
                                <ShieldCheck size={8} /> {formatTime(cdRemaining)}
                              </div>
                            )}
                          </div>
                        )}

                        <div
                          className={`
                                          w-8 h-8 rounded-full border-2 bg-neutral-900/80 backdrop-blur-sm
                                          flex items-center justify-center shadow-lg hover:scale-125 transition-transform cursor-pointer overflow-hidden
                                          ${isProtected ? 'opacity-80' : 'opacity-100'}
                                      `}
                          style={{
                            borderColor:
                              point.ownerId === profile?.uid ? '#22c55e' : point.color || '#4f46e5',
                          }}
                        >
                          {avatarUrl ? (
                            <StaticAvatar src={avatarUrl} alt="Owner" className="w-full h-full object-cover" />
                          ) : (
                            <PointIcon
                              size={16}
                              style={{
                                color:
                                  point.ownerId === profile?.uid ? '#22c55e' : point.color || '#4f46e5',
                              }}
                            />
                          )}
                        </div>
                        {point.isLandingZone && (
                          <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-cyan-500 border border-cyan-300 flex items-center justify-center shadow-md">
                            <Anchor size={7} className="text-white" />
                          </div>
                        )}

                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap pointer-events-none">
                          <span className="text-[10px] font-black text-white uppercase tracking-widest drop-shadow-md"
                                style={{
                                  textShadow: `1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 0 2px 4px rgba(0,0,0,0.8)`,
                                }}
                          >
                            {point.name}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Selected Point Right Panel Overlay */}
          {selectedPoint && (
            <div className="absolute bottom-0 right-0 w-full lg:w-80 h-[80vh] lg:h-full max-h-full rounded-t-3xl lg:rounded-none overflow-y-auto bg-neutral-900/95 backdrop-blur-md border-t lg:border-t-0 lg:border-l border-neutral-800 shadow-[0_-10px_30px_rgba(0,0,0,0.5)] lg:shadow-[-10px_0_30px_rgba(0,0,0,0.5)] z-40 flex flex-col p-4 animate-in slide-in-from-bottom lg:slide-in-from-right duration-300 transform-gpu will-change-transform">
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
                {/* Landing zone / access badge */}
                <div className={`flex items-center gap-2 text-xs font-bold px-2 py-1.5 rounded-lg mb-2 ${selectedPoint.isLandingZone ? 'bg-cyan-900/30 text-cyan-400 border border-cyan-800' : 'bg-neutral-800 text-neutral-400 border border-neutral-700'}`}>
                  {selectedPoint.isLandingZone ? (
                    <><Anchor size={12} /> Зона висадки — доступ вільний</>
                  ) : (
                    <><Lock size={12} /> Потрібна сусідня зона</>
                  )}
                </div>

                {/* Battle Mode badge */}
                <div className="flex flex-col gap-1 mb-2">
                  {selectedPoint.battleMode === 'HARDCORE' ? (
                    <div className="flex items-center gap-2 text-xs font-bold px-2 py-1.5 rounded-lg bg-red-900/30 text-red-500 border border-red-800/50">
                      🔴 Режим: Хардкор (Смерть карток)
                    </div>
                  ) : selectedPoint.battleMode === 'CHIP_DAMAGE' ? (
                    <div className="flex items-center gap-2 text-xs font-bold px-2 py-1.5 rounded-lg bg-yellow-900/30 text-yellow-500 border border-yellow-800/50" title={`Шанс втрати статів: ${selectedPoint.chipDamageChance || 0}%`}>
                      🟡 Режим: Втрата Статів ({selectedPoint.chipDamageChance || 0}%)
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs font-bold px-2 py-1.5 rounded-lg bg-green-900/30 text-green-500 border border-green-800/50">
                      🟢 Режим: Відновлення ХП
                    </div>
                  )}
                </div>

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

                {selectedPoint.crystalRatePerHour > 0 && (
                  <div className="flex flex-col gap-2 mt-1 border-t border-neutral-800/50 pt-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-neutral-400">Фарм кристалів:</span>
                      <span className="text-fuchsia-400 font-bold flex items-center gap-1">
                        <Gem size={14} /> {selectedPoint.crystalRatePerHour} / год
                      </span>
                    </div>
                    <div className="text-xs text-neutral-500 italic">Нараховуються автоматично</div>
                  </div>
                )}
              </div>

              {/* Defending Cards Showcase */}
              {selectedPoint.defendingCards && selectedPoint.defendingCards.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs uppercase font-bold text-neutral-500 mb-2 border-b border-neutral-800 pb-1">
                    Захисники
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedPoint.defendingCards.map((defCard, idx) => {
                      const isOwner = selectedPoint.ownerId === profile?.uid;
                      const isHidden = !isOwner && idx > 0;

                      return (
                        <div
                          key={idx}
                          className={`relative aspect-[2/3] rounded-lg border-2 overflow-hidden bg-neutral-950 ${isHidden ? 'border-neutral-800' : getCardStyle(defCard.rarity).border}`}
                        >
                          {!isHidden && <PerkBadge perk={defCard.perk} />}
                          {!isHidden && (
                            <div className={`absolute top-1 ${defCard.perk ? 'left-7' : 'left-1'} bg-black/80 font-black text-[10px] px-1.5 py-0.5 rounded z-10 text-white flex items-center gap-1.5 border border-neutral-700 shadow-md`}>
                              <div className="flex items-center gap-0.5"><Zap size={10} className="text-yellow-400" /> <span>{defCard.power}</span></div>
                              <div className="flex items-center gap-0.5"><span className="text-red-500 text-[10px]">❤️</span> <span>{defCard.hp || defCard.power || 50}</span></div>
                            </div>
                          )}
                          
                          {isHidden ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900 gap-1">
                              <span className="text-5xl text-neutral-800 font-black">?</span>
                              <span className="text-[10px] text-neutral-600 font-black uppercase tracking-tighter">Приховано</span>
                            </div>
                          ) : (
                            <img
                              src={defCard.image}
                              className="w-full h-full object-cover pointer-events-none"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-auto pt-4 flex flex-col gap-2">
                {(() => {
                  // Визначаємо чи можна атакувати цю точку (landing zone або гравець володіє сусідом)
                  const canAccess = selectedPoint.isLandingZone || (() => {
                    const neighborIds = Array.isArray(selectedPoint.neighborIds) ? selectedPoint.neighborIds : [];
                    if (neighborIds.length === 0) return false;
                    return points.some(p => neighborIds.includes(p.id) && p.ownerId === profile?.uid);
                  })();

                  if (selectedPoint.ownerId) {
                    if (selectedPoint.ownerId === profile?.uid) return null;

                    if (!canAccess) {
                      return (
                        <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-center">
                          <Lock size={20} className="text-neutral-500 mx-auto mb-1" />
                          <p className="text-neutral-400 text-xs font-medium">Спершу захопіть сусідню зону,
                          щоб атакувати цю точку.</p>
                        </div>
                      );
                    }

                    return (
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
                    );
                  } else {
                    if (!canAccess) {
                      return (
                        <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-center">
                          <Lock size={20} className="text-neutral-500 mx-auto mb-1" />
                          <p className="text-neutral-400 text-xs font-medium">Спершу захопіть сусідню зону,
                          щоб захопити цю точку.</p>
                        </div>
                      );
                    }

                    return (
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
                    );
                  }
                })()}

                {profile?.isAdmin && (
                  <div className="flex flex-col gap-2 mt-2 border-t border-neutral-800 pt-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setAdminPointData({ ...selectedPoint });
                        setPolygonPoints(selectedPoint.areaPolygon || []);
                        setSelectedPoint(null);
                      }}
                      className="w-full bg-neutral-800 hover:bg-neutral-700 text-indigo-400 hover:text-indigo-300 font-bold py-2 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      Редагувати точку
                    </button>
                    <button
                      onClick={(e) => {
                        handleDeletePoint(selectedPoint.id, e);
                        setSelectedPoint(null);
                      }}
                      className="w-full bg-neutral-800 hover:bg-red-900/50 text-red-500 hover:text-red-400 font-bold py-2 rounded-xl border border-red-500/30 transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      <Trash2 size={16} /> Видалити точку
                    </button>
                  </div>
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
                <div className="flex gap-1.5 sm:gap-4 justify-center items-center">
                  {battleState.defenderDeck.map((card, idx) => {
                    const hp =
                      card.currentHp !== undefined ? card.currentHp : card.hp || card.power || 1;
                    const isDead = hp <= 0;
                    const maxHp = card.maxHp || card.hp || card.power || 1;
                    const hpPercent = Math.max(0, Math.min(100, (hp / maxHp) * 100));

                    const isAttacking =
                      animationStepData?.attackerSide === 'defender' &&
                      animationStepData?.attackerIndex === idx;
                    const isHit =
                      animationStepData?.targetSide === 'defender' &&
                      animationStepData?.targetIndex === idx;
                    const ev = animationStepData?.events || [];
                    const isDodge = isHit && ev.includes('dodge');
                    const isCrit = isHit && ev.includes('crit');
                    const isHeal = animationStepData?.targetSide === 'defender' && animationStepData?.targetIndex === idx && ev.includes('healer');
                    const hasTaunt = card.perk === 'taunt' && !isDead;

                    // Masking logic for the visual flip
                    const isOwner = battleState.point.ownerId === profile?.uid;
                    const isCardRevealed = isRevealed || isOwner || idx === 0;

                    return (
                      <div
                        key={idx}
                        className={`card-container relative w-[17vw] sm:w-28 md:w-36 lg:w-40 aspect-[2/3] transition-all duration-500 ${isDead ? 'grayscale opacity-50 relative top-4' : ''} ${isAttacking ? 'translate-y-[12vh] scale-125 z-40 shadow-[0_0_50px_rgba(239,68,68,1)]' : ''} ${isHit && !isDodge ? '-translate-y-2 rotate-[-5deg] brightness-150' : ''} ${isDodge ? 'opacity-40 scale-95' : ''}`}
                      >
                        <div className={`card-inner w-full h-full ${isCardRevealed ? 'is-flipped' : ''}`}>
                          {/* Face Down (Сорочка) */}
                          <div className="card-front w-full h-full rounded-xl border-2 border-neutral-800 bg-neutral-900 flex flex-col items-center justify-center gap-1 shadow-xl">
                             <span className="text-5xl text-neutral-800 font-black">?</span>
                             <span className="text-[10px] text-neutral-600 font-black uppercase tracking-tighter">Приховано</span>
                          </div>

                          {/* Face Up (Лицьова сторона) */}
                          <div className={`card-back w-full h-full rounded-xl border-2 overflow-hidden bg-neutral-900 shadow-xl ${getCardStyle(card.rarity).border} ${hasTaunt ? 'ring-2 ring-red-500/60 animate-pulse' : ''}`}>
                            <PerkBadge perk={card.perk} />
                            <div className="absolute -bottom-2.5 inset-x-1 bg-black/90 font-black text-[10px] sm:text-xs md:text-sm px-1 py-1 rounded-lg z-20 text-white flex items-center justify-center gap-1 border border-red-500 shadow-lg">
                              <div className="flex items-center gap-0.5"><Zap size={12} className="text-yellow-400" /> <span className="mr-0.5">{card.power}</span></div>
                              <div className="flex items-center gap-0.5"><span className="text-red-500 text-[10px] sm:text-xs">❤️</span> <span>{Math.ceil(hp)}</span></div>
                            </div>

                            {/* Floating combat text */}
                            {isHit && !isDodge && !isHeal && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center z-30 pointer-events-none animate-in slide-in-from-bottom-5 fade-in duration-500">
                                <span className={`font-black text-4xl drop-shadow-[0_2px_4px_rgba(0,0,0,1)] ${isCrit ? 'text-yellow-400 scale-125' : 'text-red-500'}`}>
                                  {isCrit ? '💥' : ''}-{animationStepData.damage}
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
                <div className="flex gap-1.5 sm:gap-4 justify-center items-center">
                  {battleState.attackerDeck.map((card, idx) => {
                    const hp =
                      card.currentHp !== undefined ? card.currentHp : card.hp || card.power || 1;
                    const isDead = hp <= 0;
                    const maxHp = card.maxHp || card.hp || card.power || 1;
                    const hpPercent = Math.max(0, Math.min(100, (hp / maxHp) * 100));

                    const isAttacking =
                      animationStepData?.attackerSide === 'attacker' &&
                      animationStepData?.attackerIndex === idx;
                    const isHit =
                      animationStepData?.targetSide === 'attacker' &&
                      animationStepData?.targetIndex === idx;
                    const ev = animationStepData?.events || [];
                    const isDodge = isHit && ev.includes('dodge');
                    const isCrit = isHit && ev.includes('crit');
                    const isHeal = animationStepData?.targetSide === 'attacker' && animationStepData?.targetIndex === idx && ev.includes('healer');
                    const hasTaunt = card.perk === 'taunt' && !isDead;

                    return (
                      <div
                        key={idx}
                        className={`relative w-[17vw] sm:w-28 md:w-36 lg:w-40 aspect-[2/3] rounded-xl border-2 overflow-hidden bg-neutral-900 shadow-xl shadow-indigo-500/10 ${getCardStyle(card.rarity).border} transition-all duration-500 ${isDead ? 'grayscale opacity-50 relative -top-4' : ''} ${isAttacking ? '-translate-y-[12vh] scale-125 z-40 shadow-[0_0_50px_rgba(99,102,241,1)]' : ''} ${isHit && !isDodge ? 'translate-y-2 rotate-[5deg] border-red-500 brightness-150' : ''} ${isDodge ? 'opacity-40 scale-95' : ''} ${hasTaunt ? 'ring-2 ring-indigo-500/60 animate-pulse' : ''}`}
                        style={!isAttacking && !isHit ? { animationDelay: `${idx * 100}ms` } : {}}
                      >
                        <PerkBadge perk={card.perk} />
                        <div className="absolute -top-2.5 inset-x-1 bg-black/90 font-black text-[10px] sm:text-xs md:text-sm px-1 py-1 rounded-lg z-20 text-white flex items-center justify-center gap-1 border border-indigo-500 shadow-lg">
                          <div className="flex items-center gap-0.5"><Zap size={12} className="text-yellow-400" /> <span className="mr-0.5">{card.power}</span></div>
                          <div className="flex items-center gap-0.5"><span className="text-red-500 text-[10px] sm:text-xs">❤️</span> <span>{Math.ceil(hp)}</span></div>
                        </div>

                        {/* Floating combat text */}
                        {isHit && !isDodge && !isHeal && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center z-30 pointer-events-none animate-in slide-in-from-top-5 fade-in duration-500">
                            <span className={`font-black text-4xl drop-shadow-[0_2px_4px_rgba(0,0,0,1)] ${isCrit ? 'text-yellow-400 scale-125' : 'text-red-500'}`}>
                              {isCrit ? '💥' : ''}-{animationStepData.damage}
                            </span>
                            {ev.includes('laststand') && <span className="text-yellow-300 font-black text-sm mt-1 animate-bounce">1 HP!</span>}
                            {ev.includes('poison') && <span className="text-green-400 font-bold text-xs mt-1">☠️ Отруєно</span>}
                          </div>
                        )}
                        {isDodge && (
                          <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none animate-in fade-in duration-300">
                            <span className="text-blue-300 font-black text-2xl drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">MISS</span>
                          </div>
                        )}
                        {isHeal && (
                          <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none animate-in slide-in-from-top-5 fade-in duration-500">
                            <span className="text-emerald-400 font-black text-3xl drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">+{animationStepData.healAmount}</span>
                          </div>
                        )}
                        {/* Thorns feedback */}
                        {animationStepData?.thornsDamage && animationStepData?.attackerSide === 'attacker' && animationStepData?.attackerIndex === idx && (
                          <div className="absolute top-1 right-1 z-30 pointer-events-none animate-in fade-in duration-300">
                            <span className="text-amber-400 font-black text-xs">🌵-{animationStepData.thornsDamage}</span>
                          </div>
                        )}
                        {/* Lifesteal feedback */}
                        {animationStepData?.healAmount && ev.includes('lifesteal') && animationStepData?.attackerSide === 'attacker' && animationStepData?.attackerIndex === idx && (
                          <div className="absolute top-1 right-1 z-30 pointer-events-none animate-in fade-in duration-300">
                            <span className="text-pink-400 font-black text-xs">💗+{animationStepData.healAmount}</span>
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
                <div className="absolute inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center animate-in fade-in zoom-in-50 duration-500 p-4">
                  <div className="bg-neutral-900 border border-neutral-700 rounded-3xl p-6 sm:p-8 max-w-xl w-full flex flex-col shadow-2xl max-h-[90vh] overflow-hidden">
                    <div className="flex flex-col items-center mb-6 shrink-0">
                      {battleResult.won ? (
                        <>
                          <div className="relative">
                            <Trophy size={64} className="text-yellow-400 animate-bounce mb-2" />
                            <div className="absolute -inset-4 bg-yellow-400/20 blur-2xl rounded-full -z-10 animate-pulse"></div>
                          </div>
                          <h2 className="text-4xl font-black text-white uppercase tracking-tighter">Перемога!</h2>
                          <p className="text-indigo-400 font-bold text-sm">Точку захоплено під ваш прапор</p>
                        </>
                      ) : (
                        <>
                          <X size={64} className="text-red-500 mb-2" />
                          <h2 className="text-4xl font-black text-white uppercase tracking-tighter">Поразка</h2>
                          <p className="text-red-400/70 font-bold text-sm">Атаку відбито захисниками</p>
                        </>
                      )}
                    </div>

                    {battleResult.note && (
                      <div className="mb-6 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl p-4 text-center shadow-inner animate-in fade-in slide-in-from-top-2 duration-700">
                        <div className="text-indigo-400 text-[10px] font-black uppercase tracking-widest mb-1 flex items-center justify-center gap-2">
                          <Info size={12} /> Системне повідомлення
                        </div>
                        <p className="text-white text-sm font-medium leading-relaxed italic">
                          {battleResult.note}
                        </p>
                      </div>
                    )}

                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 mb-6">
                      <h3 className="text-xs uppercase font-black text-neutral-500 mb-3 tracking-widest flex items-center gap-2">
                        <Swords size={14} /> Звіт про стан ваших карт
                      </h3>
                      
                      <div className="flex flex-col gap-3">
                        {battleResult.attackerResults?.map((res, idx) => {
                          const isDestroyed = res.status === 'destroyed';
                          const isWeakened = res.status === 'weakened';
                          
                          return (
                            <div key={idx} className={`flex items-center gap-4 p-3 rounded-2xl border transition-all ${isDestroyed ? 'bg-red-950/20 border-red-500/50 grayscale' : isWeakened ? 'bg-amber-950/20 border-amber-500/40' : 'bg-neutral-800/50 border-neutral-700/50'}`}>
                              <div className="w-16 h-20 shrink-0 rounded-lg overflow-hidden border-2 border-neutral-700 shadow-lg relative">
                                <img src={res.image} className="w-full h-full object-cover" />
                                {isDestroyed && (
                                  <div className="absolute inset-0 bg-red-600/40 flex items-center justify-center">
                                    <Skull size={24} className="text-white" />
                                  </div>
                                )}
                              </div>
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start">
                                  <div className="font-black text-white truncate text-sm uppercase tracking-tight">{res.name}</div>
                                  <div className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter shadow-sm border ${isDestroyed ? 'bg-red-600 text-white border-red-400' : isWeakened ? 'bg-amber-500 text-black border-amber-300' : 'bg-green-600 text-white border-green-400'}`}>
                                    {isDestroyed ? 'Знищена' : isWeakened ? 'Ослаблена' : 'Вціліла'}
                                  </div>
                                </div>
                                
                                <div className="mt-2 flex items-center gap-4">
                                  {isDestroyed ? (
                                    <p className="text-red-400 text-[11px] font-bold leading-tight">Цю карту було назавжди втрачено в режимі Хардкор.</p>
                                  ) : (
                                    <div className="flex items-center gap-3">
                                      <div className="flex flex-col">
                                        <span className="text-[9px] text-neutral-500 uppercase font-black">Сила</span>
                                        <div className="flex items-center gap-1">
                                          <Zap size={10} className="text-yellow-500" />
                                          <span className="text-xs font-black text-white">{res.newPower || res.oldPower}</span>
                                          {isWeakened && res.newPower < res.oldPower && (
                                            <span className="text-[9px] text-red-500 font-bold">-{res.oldPower - res.newPower}</span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-[9px] text-neutral-500 uppercase font-black">HP Max</span>
                                        <div className="flex items-center gap-1">
                                          <Heart size={10} className="text-red-500" />
                                          <span className="text-xs font-black text-white">{res.newMaxHp || res.oldMaxHp}</span>
                                          {isWeakened && res.newMaxHp < res.oldMaxHp && (
                                            <span className="text-[9px] text-red-500 font-bold">-{res.oldMaxHp - res.newMaxHp}</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {battleResult.won && battleResult.defenderResults?.length > 0 && (
                        <div className="mt-6 border-t border-neutral-800 pt-4">
                          <h3 className="text-xs uppercase font-black text-neutral-500 mb-3 tracking-widest flex items-center gap-2">
                             Втрати захисників
                          </h3>
                          <div className="flex flex-wrap gap-2">
                             {battleResult.defenderResults.map((dr, i) => (
                               <div key={i} className="flex items-center gap-2 bg-neutral-950/50 px-2 py-1 rounded-lg border border-neutral-800" title={dr.name}>
                                 <img src={dr.image} className="w-5 h-7 object-cover rounded shadow-sm grayscale" />
                                 <span className="text-[10px] text-neutral-500 font-bold truncate max-w-[80px]">{dr.name}</span>
                                 <Skull size={10} className="text-red-900" />
                               </div>
                             ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-auto shrink-0 flex flex-col gap-3">
                      {(battleResult.attackerResults?.some(r => r.status === 'destroyed' || r.status === 'weakened')) && (
                         <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-center gap-3">
                            <ShieldAlert size={20} className="text-red-500 shrink-0" />
                            <p className="text-[11px] text-red-400 font-medium">Ваші карти отримали незворотні зміни через налаштування цієї точки Арени.</p>
                         </div>
                      )}
                      
                      <button
                        onClick={() => {
                          setBattleResult(null);
                          setBattleState(null);
                        }}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl transition-all shadow-[0_10px_20px_rgba(79,70,229,0.2)] hover:shadow-[0_15px_25px_rgba(79,70,229,0.3)] hover:-translate-y-1 active:translate-y-0 uppercase tracking-widest text-sm"
                      >
                        Завершити місію
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* PERK INFO MODAL */}
      {showPerkInfo && (
        <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={() => setShowPerkInfo(false)}>
          <div className="bg-neutral-900 border border-indigo-500/30 rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl custom-scrollbar animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-xl font-black text-white uppercase tracking-wide flex items-center gap-2">
                <Zap size={20} className="text-indigo-400" /> Перки Карт
              </h3>
              <button onClick={() => setShowPerkInfo(false)} className="p-1 rounded bg-neutral-800 text-neutral-400 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <p className="text-neutral-400 text-sm mb-4">Кожна карта може мати спеціальний перк, який впливає на бій. Перк встановлюється адміністратором для карти в каталозі.</p>
            <div className="flex flex-col gap-3">
              {Object.entries(PERK_META).map(([key, meta]) => {
                const Icon = meta.icon;
                return (
                  <div key={key} className={`flex items-start gap-3 ${meta.bg} border border-white/5 rounded-xl p-3`}>
                    <div className={`${meta.color} shrink-0 mt-0.5`}>
                      <Icon size={22} />
                    </div>
                    <div className="flex-1">
                      <div className={`font-black text-sm ${meta.color} uppercase`}>{meta.label}</div>
                      <div className="text-neutral-300 text-xs mt-0.5 leading-relaxed">{meta.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* RULES INFO MODAL */}
      {showRules && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={() => setShowRules(false)}>
          <div className="bg-neutral-900 border border-red-500/30 rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-[0_0_40px_rgba(239,68,68,0.2)] custom-scrollbar animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6 border-b border-red-900/50 pb-4">
              <h3 className="text-2xl font-black text-white uppercase tracking-wider flex items-center gap-3">
                <ShieldAlert size={28} className="text-red-500" /> Правила Арени
              </h3>
              <button onClick={() => setShowRules(false)} className="p-2 rounded-xl bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-6 text-sm text-neutral-300 leading-relaxed">
              
              <div className="bg-indigo-950/20 border border-indigo-900/50 rounded-xl p-4">
                <h4 className="text-lg font-black text-indigo-400 uppercase mb-2 flex items-center gap-2">
                  <Swords size={18} /> Базові Правила
                </h4>
                <ul className="list-disc pl-5 space-y-2">
                  <li>Щоб <b>захопити</b> або <b>атакувати</b> точку, вам потрібно вибрати рівно <b>5 карт</b> зі свого інвентаря, які сформують вашу колоду.</li>
                  <li>Кожна точка має свій кулдаун захисту, протягом якого її неможливо атакувати.</li>
                  <li>Власник точки отримує кристали (дохід залежить від точки). Дохід накопичується, його потрібно забирати вручну.</li>
                  <li>Карти, які захищають точку, фіксуються в ній. Ви <b>не зможете</b> їх продати на ринку або сховати в сейф, поки вони там!</li>
                </ul>
              </div>

              <div className="bg-neutral-950/50 border border-neutral-800 rounded-xl p-4">
                <h4 className="text-lg font-black text-white uppercase mb-3 flex items-center gap-2">
                  <Target size={18} className="text-amber-500" /> Режими Бою
                </h4>
                <p className="mb-3">Кожна точка може мати один з трьох режимів бою. Звертайте на це увагу перед атакою!</p>
                <div className="flex flex-col gap-3">
                  <div className="flex gap-3 bg-neutral-900 p-3 rounded-lg border border-green-900/30">
                    <div className="text-green-500 font-bold w-1/4 shrink-0">🟢 Повний (Default)</div>
                    <div className="w-3/4">Найбезпечніший режим. Усі карти повністю відновлюють свої характеристики після завершення бою. Ніхто нічого не втрачає.</div>
                  </div>
                  <div className="flex gap-3 bg-neutral-900 p-3 rounded-lg border border-yellow-900/30">
                    <div className="text-yellow-500 font-bold w-1/4 shrink-0 text-sm">🟡 Chip Damage</div>
                    <div className="w-3/4">Кожна ваша карта має певний <b>шанс втратити частину Сили або ХП (5%)</b>. Чим частіше вона отримує шкоду, тим більший ризик, що її показники знизяться назавжди.</div>
                  </div>
                  <div className="flex gap-3 bg-neutral-900 p-3 rounded-lg border border-red-900/40">
                    <div className="text-red-500 font-bold w-1/4 shrink-0">🔴 Хардкор</div>
                    <div className="w-3/4"><b>Перманентна смерть!</b> Будь-яка ваша карта, яка закінчує бій маючи 0 ХП — <b>видаляється з вашого інвентаря назавжди!</b> Використовуйте цей режим обережно та беріть найкращих цілителів.</div>
                  </div>
                </div>
              </div>

              <div className="bg-red-950/20 border border-red-900/30 rounded-xl p-4">
                 <h4 className="text-lg font-black text-red-400 border-red-900/50 uppercase mb-2 flex items-center gap-2">
                  <Skull size={18} /> Механіка Атаки
                </h4>
                <p>Бій проходить автоматично у форматі 5 на 5. Карти самостійно атакують і використовують свої перки (наприклад цілитель лікує, танк поглинає шкоду і так далі). Хто залишився хоча б з однією живою картою — той і перемагає!</p>
              </div>

            </div>

            <div className="mt-6 pt-4 border-t border-neutral-800 text-center">
              <button onClick={() => setShowRules(false)} className="bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-8 rounded-xl transition-all shadow-[0_0_15px_rgba(220,38,38,0.4)]">
                Я зрозумів
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
