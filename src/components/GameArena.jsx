import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Swords, Trophy, ShieldAlert, Zap, X, MapPin, Plus, Trash2, Castle, TowerControl, Tent, Hexagon, Shield, Flag, Landmark } from 'lucide-react';
import { getCardStyle } from '../utils/helpers';
import {
    fetchArenaPointsRequest,
    createArenaPointRequest,
    deleteArenaPointRequest,
    getToken
} from '../config/api';

const ICONS = {
    castle: Castle,
    tower: TowerControl,
    tent: Tent,
    flag: Flag,
    landmark: Landmark,
    shield: Shield,
    hexagon: Hexagon
};

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#4f46e5', '#a855f7', '#ec4899', '#ffffff', '#000000'];

// Мінімальна сила за рідкістю для карток без записаної сили
const RARITY_MIN_POWER = {
    Унікальна: 100,
    Легендарна: 50,
    Епічна: 25,
    Рідкісна: 10,
    Звичайна: 5,
};

export default function GameArena({ profile, cardsCatalog, goBack, showToast }) {
    const [deck, setDeck] = useState([]);
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
    const mapRef = useRef(null);

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
        setAdminPointData({
            x: xPercent,
            y: yPercent,
            name: 'Точка Арени',
            icon: 'castle',
            color: '#4f46e5'
        });
        setIsAddingPoint(false);
    };

    const submitAdminPoint = async () => {
        if (!adminPointData) return;
        if (!adminPointData.name.trim()) return showToast('Назва не може бути порожньою', 'error');

        try {
            const data = await createArenaPointRequest(getToken(), adminPointData);
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
            setPoints(points.filter(p => p.id !== pointId));
            showToast('Точку видалено!', 'success');
        } catch (error) {
            showToast('Помилка видалення точки.', 'error');
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
                const effectiveStats = [...stats]; // Recorded powers

                // Add default power for any amount that doesn't have a recorded stat yet
                while (effectiveStats.length < invItem.amount) {
                    effectiveStats.push(minPower);
                }

                effectiveStats.forEach((powerVal) => {
                    const powerNum = Number(powerVal);
                    if (!isNaN(powerNum) && powerNum > 0) {
                        ownedGameCards.push({
                            ...cardDetails,
                            uniqueInstanceId: `${cardDetails.id}-${powerNum}-${Math.random()}`,
                            power: powerNum
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

    return (
        <div className="animate-in fade-in duration-500 fixed inset-0 z-50 bg-neutral-950 flex flex-col items-center justify-center p-4">
            {/* Header section with back button */}
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

                <div className="w-[150px]"></div> {/* Spacer for centering */}
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
                            <span className={`${deck.length === 5 ? 'text-green-400' : 'text-indigo-400'} text-lg`}>
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
                                        <div className={`w-full h-full rounded-xl overflow-hidden border-2 bg-neutral-900 group-hover:-translate-y-1 transition-transform border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.3)]`}>
                                            <div className={`w-full h-full ${getCardStyle(card.rarity).border} relative`}>
                                                <img src={card.image} className="w-full h-full object-cover" />
                                            </div>
                                        </div>
                                        <div className="absolute -bottom-2 inset-x-0 w-max mx-auto bg-neutral-900 border border-indigo-500 text-white font-bold text-[10px] px-2 py-0.5 rounded-full z-10 flex items-center justify-center gap-1 shadow-md">
                                            <Zap size={10} className="text-yellow-500" /> {card.power}
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
                                    <ShieldAlert size={40} className="mx-auto mb-3 opacity-20" />
                                    У вас немає карт із силою для Арени.
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                                    {ownedGameCards.map((card) => {
                                        const isSelected = deck.find((c) => c.uniqueInstanceId === card.uniqueInstanceId);
                                        if (isSelected) return null; // Hide from inventory if already in deck

                                        return (
                                            <div
                                                key={card.uniqueInstanceId}
                                                onClick={() => handleToggleCard(card)}
                                                className={`relative aspect-[2/3] rounded-lg border-2 overflow-hidden bg-neutral-900 cursor-pointer hover:-translate-y-1 hover:border-indigo-500 transition-all ${getCardStyle(card.rarity).border}`}
                                                title={card.name}
                                            >
                                                <div className="absolute top-1 right-1 bg-black/80 font-black text-[10px] px-1.5 py-0.5 rounded-sm z-10 text-yellow-400 flex items-center gap-1 border border-neutral-700 shadow-md">
                                                    <Zap size={8} /> {card.power}
                                                </div>
                                                <div className="w-full h-full relative group">
                                                    <img src={card.image} className="w-full h-full object-cover pointer-events-none" />
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
                            <span className="text-xs uppercase font-bold text-neutral-400 mr-2 border-r border-neutral-700 pr-2">Адмін панель</span>
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
                            <span className="flex items-center gap-2 font-bold mb-1"><MapPin size={14} className="text-indigo-400" /> Управління Картою:</span>
                            <span>• Коліщатко миші для масштабування</span>
                            <span>• ЛКМ для перетягування карти</span>
                        </div>
                    </div>

                    {/* Admin Point Modal */}
                    {adminPointData && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                            <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl flex flex-col gap-4">
                                <h3 className="text-xl font-bold text-white uppercase tracking-wider text-center">Налаштування точки</h3>

                                <div>
                                    <label className="text-xs uppercase font-bold text-neutral-400 mb-1 block">Назва</label>
                                    <input
                                        type="text"
                                        value={adminPointData.name}
                                        onChange={(e) => setAdminPointData({ ...adminPointData, name: e.target.value })}
                                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs uppercase font-bold text-neutral-400 mb-2 block">Іконка</label>
                                    <div className="flex flex-wrap gap-2 justify-center">
                                        {Object.keys(ICONS).map(iconKey => {
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
                                    <label className="text-xs uppercase font-bold text-neutral-400 mb-2 block">Колір</label>
                                    <div className="flex flex-wrap gap-2 justify-center">
                                        {COLORS.map(colorHex => (
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
                        className={`w-full h-full relative overflow-hidden flex items-center justify-center ${adminPointData ? '' : (isAddingPoint ? 'cursor-crosshair' : (isDragging ? 'cursor-grabbing' : 'cursor-grab'))}`}
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
                                display: 'inline-block'
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
                            {!isLoadingPoints && points.map((point) => {
                                const PointIcon = ICONS[point.icon] || ICONS.castle;
                                return (
                                    <div
                                        key={point.id}
                                        className="absolute transform -translate-x-1/2 -translate-y-1/2 group"
                                        style={{ left: `${point.x}%`, top: `${point.y}%` }}
                                    >
                                        <div className={`
                                        w-8 h-8 rounded-full border-2 bg-neutral-900/80 backdrop-blur-sm
                                        flex items-center justify-center shadow-lg
                                        group-hover:scale-125 transition-transform cursor-pointer
                                    `} style={{ borderColor: point.color || '#4f46e5' }}>
                                            <PointIcon size={16} style={{ color: point.color || '#4f46e5' }} />
                                        </div>

                                        {/* Tooltip & Actions */}
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 min-w-max hidden group-hover:flex flex-col items-center">
                                            <div className="bg-neutral-900 border border-neutral-700 text-white text-[10px] font-bold px-2 py-1 rounded shadow-xl uppercase whitespace-nowrap">
                                                {point.name}
                                            </div>
                                            {profile?.isAdmin && (
                                                <button
                                                    onClick={(e) => handleDeletePoint(point.id, e)}
                                                    className="mt-1 bg-red-600 hover:bg-red-500 text-white p-1 rounded-full shadow-lg transition-colors border border-red-400"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            )}
                                            <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-neutral-900 mx-auto"></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
