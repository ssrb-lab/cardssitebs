import React, { useState, useEffect, useRef } from "react";
import { Swords, Coins, Zap, Loader2, Timer, Lock, Unlock, Skull } from "lucide-react";
import { doc, getDoc, setDoc, increment, runTransaction } from "firebase/firestore";

// 🏆 ГЛОБАЛЬНИЙ КЕШ
let globalFarmCache = {
    uid: null,
    bossId: null,
    hp: null,
    cooldownEnd: null,
    isLoaded: false
};

export default function FarmView({ profile, db, appId, cardsCatalog, showToast, bosses }) {
    const playerLevel = profile?.farmLevel || 1;

    const sortedBosses = [...(bosses || [])].sort((a, b) => a.level - b.level);
    const maxBossLevel = sortedBosses.length > 0 ? sortedBosses[sortedBosses.length - 1].level : 1;

    let currentBoss = sortedBosses.find(b => b.level === playerLevel);
    if (!currentBoss && sortedBosses.length > 0) {
        currentBoss = sortedBosses[sortedBosses.length - 1]; 
    }

    let bossCard = currentBoss ? cardsCatalog.find(c => c.id === currentBoss.cardId) : null;
    if (!bossCard && cardsCatalog && cardsCatalog.length > 0) bossCard = cardsCatalog[0];

    const isCacheValid = globalFarmCache.isLoaded && globalFarmCache.uid === profile?.uid && globalFarmCache.bossId === currentBoss?.id;

    const [hp, setHp] = useState(isCacheValid && globalFarmCache.hp !== null ? globalFarmCache.hp : (currentBoss?.maxHp || 1000));
    const [cooldownEnd, setCooldownEnd] = useState(isCacheValid ? globalFarmCache.cooldownEnd : null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isLoading, setIsLoading] = useState(!isCacheValid);
    const [isHit, setIsHit] = useState(false);
    const [timeLeft, setTimeLeft] = useState("");
    
    const actionLock = useRef(false);
    const saveTimerRef = useRef(null);
    const hpRef = useRef(hp);

    useEffect(() => {
        hpRef.current = hp;
        globalFarmCache.hp = hp;
    }, [hp]);

    useEffect(() => {
        if (isCacheValid) {
            setIsLoading(false);
            return;
        }
        
        const fetchFarmState = async () => {
            if (!profile || !currentBoss) return setIsLoading(false);
            setIsLoading(true);

            try {
                const farmRef = doc(db, "artifacts", appId, "users", profile.uid, "farmState", "main");
                const snap = await getDoc(farmRef);
                
                if (snap.exists()) {
                    const data = snap.data();
                    if (data.cooldownUntil && new Date(data.cooldownUntil) > new Date()) {
                        setCooldownEnd(data.cooldownUntil);
                        setHp(0);
                        globalFarmCache.cooldownEnd = data.cooldownUntil;
                        globalFarmCache.hp = 0;
                        localStorage.removeItem(`farm_${profile.uid}_${currentBoss.id}`);
                    } else {
                        setCooldownEnd(null);
                        globalFarmCache.cooldownEnd = null;
                        
                        let dbHp = currentBoss.maxHp;
                        if (data.bossId === currentBoss.id && data.currentHp !== undefined && data.currentHp !== null) {
                            dbHp = data.currentHp;
                        }
                        
                        const localHpRaw = localStorage.getItem(`farm_${profile.uid}_${currentBoss.id}`);
                        if (localHpRaw !== null) {
                            const localHp = parseInt(localHpRaw, 10);
                            if (!isNaN(localHp) && localHp < dbHp && localHp >= 0) {
                                dbHp = localHp; 
                                setDoc(farmRef, { bossId: currentBoss.id, currentHp: dbHp, lastUpdated: new Date().toISOString() }, { merge: true }).catch(()=>{});
                            }
                        }

                        setHp(dbHp);
                        globalFarmCache.hp = dbHp;
                    }
                } else {
                    setHp(currentBoss.maxHp);
                    globalFarmCache.hp = currentBoss.maxHp;
                }
            } catch (e) { console.error(e); }
            
            globalFarmCache.bossId = currentBoss.id;
            globalFarmCache.uid = profile.uid;
            globalFarmCache.isLoaded = true;
            setIsLoading(false);
        };
        fetchFarmState();
    }, [currentBoss?.id, playerLevel, profile?.uid, appId, db, isCacheValid]);

    useEffect(() => {
        if (!cooldownEnd) return;
        const updateTimer = () => {
            const distance = new Date(cooldownEnd).getTime() - new Date().getTime();
            if (distance <= 0) {
                setCooldownEnd(null);
                setHp(currentBoss?.maxHp || 1000);
                globalFarmCache.cooldownEnd = null;
                globalFarmCache.hp = currentBoss?.maxHp || 1000;
            } else {
                const h = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                const s = Math.floor((distance % (1000 * 60)) / 1000);
                setTimeLeft(`${h}г ${m}хв ${s}с`);
            }
        };
        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [cooldownEnd, currentBoss?.maxHp]);

    useEffect(() => {
        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                if (hpRef.current > 0 && hpRef.current < (currentBoss?.maxHp || 1000) && profile && currentBoss) {
                    const farmRef = doc(db, "artifacts", appId, "users", profile.uid, "farmState", "main");
                    setDoc(farmRef, { bossId: currentBoss.id, currentHp: hpRef.current, lastUpdated: new Date().toISOString() }, { merge: true }).catch(() => {});
                }
            }
        };
    }, [db, appId, profile, currentBoss]);

    // --- ПАНЕЛЬ АДМІНІСТРАТОРА ---
    
    // 1. Миттєве вбивство
    const adminInstaKill = () => {
        if (!profile?.isAdmin || hp <= 0 || isProcessing) return;
        setHp(0);
        globalFarmCache.hp = 0;
        localStorage.setItem(`farm_${profile.uid}_${currentBoss.id}`, 0);
        showToast("АДМІН: Боса миттєво знищено!", "success");
    };

    // 2. Миттєве скидання власного КД
    const adminResetCD = async () => {
        if (!profile?.isAdmin || !cooldownEnd || isProcessing) return;
        setIsProcessing(true);
        try {
            const farmRef = doc(db, "artifacts", appId, "users", profile.uid, "farmState", "main");
            await setDoc(farmRef, { 
                cooldownUntil: null, 
                currentHp: currentBoss.maxHp, 
                lastUpdated: new Date().toISOString() 
            }, { merge: true });
            
            setCooldownEnd(null);
            globalFarmCache.cooldownEnd = null;
            setHp(currentBoss.maxHp);
            globalFarmCache.hp = currentBoss.maxHp;
            showToast("АДМІН: Кулдаун скинуто!", "success");
        } catch (e) {
            showToast("Помилка скидання КД.", "error");
        } finally {
            setIsProcessing(false);
        }
    };
    // ----------------------------

    const handleHit = () => {
        if (hp <= 0 || cooldownEnd || isProcessing || actionLock.current) return; 
        
        setIsHit(true);
        setTimeout(() => setIsHit(false), 100);

        const dmg = currentBoss?.damagePerClick || 10;
        const newHp = Math.max(0, hp - dmg);
        
        setHp(newHp);
        globalFarmCache.hp = newHp;
        localStorage.setItem(`farm_${profile.uid}_${currentBoss.id}`, newHp);

        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            if (newHp > 0) {
                const farmRef = doc(db, "artifacts", appId, "users", profile.uid, "farmState", "main");
                setDoc(farmRef, { bossId: currentBoss.id, currentHp: newHp, lastUpdated: new Date().toISOString() }, { merge: true }).catch(() => {});
            }
        }, 1000); 

        if (newHp === 0) {
            showToast(`БОСА ЗНИЩЕНО! Заберіть свій скарб!`, "success");
        }
    };

    const claimRewards = async () => {
        if (actionLock.current || hp > 0 || isProcessing || !profile) return;
        
        actionLock.current = true;
        setIsProcessing(true);

        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

        try {
            await runTransaction(db, async (t) => {
                const farmRef = doc(db, "artifacts", appId, "users", profile.uid, "farmState", "main");
                const profileRef = doc(db, "artifacts", appId, "public", "data", "profiles", profile.uid);

                const farmSnap = await t.get(farmRef);
                const farmData = farmSnap.exists() ? farmSnap.data() : {};

                if (farmData.cooldownUntil && new Date(farmData.cooldownUntil) > new Date()) {
                    throw new Error("Нагороду вже забрано!");
                }

                const maxHitsAllowed = Math.ceil(currentBoss.maxHp / (currentBoss.damagePerClick || 10));
                const totalReward = (maxHitsAllowed * (currentBoss.rewardPerClick || 2)) + (currentBoss.killBonus || 0);

                const isLevelUp = playerLevel < maxBossLevel;
                t.update(profileRef, {
                    coins: increment(totalReward),
                    farmLevel: isLevelUp ? increment(1) : playerLevel
                });

                const cdHours = currentBoss.cooldownHours || 4;
                const cdUntil = new Date(Date.now() + cdHours * 60 * 60 * 1000).toISOString();

                t.set(farmRef, {
                    bossId: currentBoss.id,
                    currentHp: currentBoss.maxHp, 
                    cooldownUntil: cdUntil,
                    lastUpdated: new Date().toISOString()
                }, { merge: true });

                return { totalReward, isLevelUp, cdUntil };
            }).then((result) => {
                setCooldownEnd(result.cdUntil);
                globalFarmCache.cooldownEnd = result.cdUntil;
                globalFarmCache.hp = 0;
                localStorage.removeItem(`farm_${profile.uid}_${currentBoss.id}`);

                if (result.isLevelUp) {
                    showToast(`Чудово! Рівень підвищено. Отримано: ${result.totalReward} монет!`, "success");
                } else {
                    showToast(`Скарб забрано! Отримано: ${result.totalReward} монет!`, "success");
                }
            });

        } catch (error) { 
            console.error("Transaction Error:", error);
            showToast("Ви вже забрали цей скарб!", "error"); 
            if (error.message === "Нагороду вже забрано!") {
                const cdHours = currentBoss.cooldownHours || 4;
                const cdTime = new Date(Date.now() + cdHours * 60 * 60 * 1000).toISOString();
                setCooldownEnd(cdTime);
                globalFarmCache.cooldownEnd = cdTime;
                localStorage.removeItem(`farm_${profile.uid}_${currentBoss.id}`);
            }
        } finally {
            actionLock.current = false; 
            setIsProcessing(false);
        }
    };

    if (isLoading) return <div className="text-center py-20 text-neutral-500"><Loader2 className="animate-spin mx-auto w-10 h-10 mb-4"/> Підготовка Арени...</div>;
    if (!currentBoss || !bossCard) return <div className="text-center py-20 text-neutral-500">Боси ще формують свої ряди...</div>;

    if (cooldownEnd) {
        return (
            <div className="pb-10 animate-in fade-in zoom-in-95 duration-500 max-w-lg mx-auto text-center mt-10 sm:mt-20">
                <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 sm:p-10 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-600 to-purple-600"></div>
                    <Timer className="mx-auto text-blue-500 mb-6 w-16 h-16 opacity-50 animate-pulse" />
                    <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-widest">Арена зачинена</h2>
                    <p className="text-neutral-400 mb-8 text-sm">Наступний супротивник ще в дорозі. Дайте своїм воїнам перепочити.</p>
                    <div className="text-4xl sm:text-5xl font-black text-yellow-500 mb-2 font-mono drop-shadow-[0_0_15px_rgba(234,179,8,0.4)]">
                        {timeLeft}
                    </div>
                    <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-widest mt-4">Час до появи</p>
                    
                    {/* КНОПКА СКИНУТИ КД (ТІЛЬКИ АДМІН) */}
                    {profile?.isAdmin && (
                        <button onClick={adminResetCD} disabled={isProcessing} className="mt-8 bg-red-600/20 hover:bg-red-600 text-red-500 hover:text-white border border-red-500/50 font-bold py-3 px-6 rounded-xl text-sm mx-auto flex items-center gap-2 transition-colors">
                            <Zap size={16} /> [АДМІН] Скинути кулдаун
                        </button>
                    )}
                </div>
            </div>
        );
    }

    const hpPercentage = Math.max(0, (hp / currentBoss.maxHp) * 100);
    const hitsDone = Math.floor((currentBoss.maxHp - hp) / (currentBoss.damagePerClick || 10));
    let visualCoins = hitsDone * (currentBoss.rewardPerClick || 2);
    if (hp <= 0) visualCoins += (currentBoss.killBonus || 0);

    return (
        <div className="pb-10 animate-in fade-in zoom-in-95 duration-500 max-w-lg mx-auto">
            <div className="flex justify-between items-end mb-4 px-2">
                <div>
                    <div className="text-red-500 font-black tracking-widest uppercase text-sm mb-1 flex items-center gap-2">
                        Ваш рівень: {playerLevel} <span className="text-neutral-700">|</span> Бос {currentBoss?.level} рівня
                        {playerLevel >= maxBossLevel && <span className="bg-yellow-500/20 text-yellow-500 text-[10px] px-2 py-0.5 rounded-md border border-yellow-600 ml-2">МАКС. РІВЕНЬ</span>}
                    </div>
                    <h2 className="text-2xl font-black text-white uppercase tracking-widest flex items-center gap-2 drop-shadow-lg">
                        <Swords className="text-red-500" /> {bossCard.name}
                    </h2>
                </div>
            </div>

            <div className={`bg-neutral-900 border rounded-2xl p-4 mb-8 flex justify-between items-center shadow-lg transition-colors ${hp <= 0 ? 'border-green-500/50' : 'border-neutral-800'}`}>
                <div>
                    <div className="text-xs text-neutral-500 font-bold uppercase tracking-wider mb-1">Скарбниця боса</div>
                    <div className={`text-3xl font-black flex items-center gap-2 ${hp <= 0 ? 'text-green-500' : 'text-yellow-500'}`}>
                        {visualCoins} <Coins size={28} />
                    </div>
                </div>
                <button 
                    onClick={claimRewards}
                    disabled={hp > 0 || isProcessing}
                    className={`font-bold py-3 px-6 rounded-xl transition-all shadow-lg flex items-center gap-2 ${
                        hp <= 0 
                        ? "bg-green-600 hover:bg-green-500 text-white shadow-[0_0_15px_rgba(22,163,74,0.4)] animate-pulse" 
                        : "bg-neutral-800 text-neutral-600 cursor-not-allowed"
                    }`}
                >
                    {isProcessing ? <Loader2 size={18} className="animate-spin" /> : (hp <= 0 ? <Unlock size={18} /> : <Lock size={18} />)} 
                    {hp <= 0 ? "Забрати" : "Закрито"}
                </button>
            </div>

            <div className="flex flex-col items-center relative">
                <div className="w-full bg-neutral-950 h-8 rounded-full overflow-hidden border-2 border-neutral-800 mb-8 relative shadow-inner">
                    <div className="h-full bg-gradient-to-r from-red-800 to-red-500 transition-all duration-75 ease-out" style={{ width: `${hpPercentage}%` }}></div>
                    <div className="absolute inset-0 flex items-center justify-center font-black text-white drop-shadow-md text-sm">
                        {hp} / {currentBoss.maxHp} HP
                    </div>
                </div>

                <div className="relative">
                    {/* КНОПКА МИТТЄВОГО ВБИВСТВА (ТІЛЬКИ АДМІН) */}
                    {profile?.isAdmin && hp > 0 && (
                        <button 
                            onClick={adminInstaKill} 
                            disabled={isProcessing}
                            className="absolute -top-4 -right-4 bg-red-600 text-white font-black text-[10px] px-3 py-2 rounded-xl border-2 border-red-900 shadow-[0_0_20px_rgba(220,38,38,0.8)] z-20 flex items-center gap-1 hover:bg-red-500 hover:scale-110 transition-transform"
                        >
                            <Skull size={14} /> ВБИТИ
                        </button>
                    )}

                    <button 
                        onClick={handleHit}
                        disabled={hp <= 0 || isProcessing}
                        className={`relative group outline-none transition-transform duration-75 select-none ${isHit ? 'scale-95 brightness-125 -rotate-2' : 'hover:scale-105'}`}
                        style={{ WebkitTapHighlightColor: 'transparent' }} 
                    >
                        <div className="absolute -inset-6 bg-red-600/20 rounded-[3rem] blur-2xl group-hover:bg-red-600/40 transition-colors animate-pulse pointer-events-none"></div>
                        <div className="relative w-48 sm:w-64 aspect-[2/3] rounded-3xl border-4 border-red-900 overflow-hidden shadow-[0_0_50px_rgba(220,38,38,0.4)] bg-neutral-900 cursor-crosshair">
                            <img src={bossCard.image} alt="boss" className="w-full h-full object-cover pointer-events-none" draggable="false" />
                            {hp <= 0 && (
                                <div className="absolute inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm animate-in zoom-in">
                                    <div className="text-green-500 font-black text-3xl sm:text-4xl uppercase tracking-widest border-4 border-green-500 p-4 rounded-xl transform -rotate-12 shadow-[0_0_30px_rgba(34,197,94,0.5)]">
                                        ЗНИЩЕНО
                                    </div>
                                </div>
                            )}
                        </div>
                    </button>
                </div>

                <p className="text-neutral-500 text-sm mt-10 font-bold uppercase tracking-widest animate-pulse text-center">
                    {hp > 0 
                        ? "Добийте боса, щоб відкрити його скарбницю!" 
                        : "Скарб розблоковано! Заберіть нагороду."}
                </p>
            </div>
        </div>
    );
}