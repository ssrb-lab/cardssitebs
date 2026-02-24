import React, { useState, useEffect, useRef } from "react";
import { Swords, Coins, Zap, Loader2, Timer } from "lucide-react";
import { doc, getDoc, setDoc, updateDoc, increment } from "firebase/firestore";

export default function FarmView({ profile, db, appId, cardsCatalog, showToast, bosses }) {
    const playerLevel = profile?.farmLevel || 1;

    const sortedBosses = [...(bosses || [])].sort((a, b) => a.level - b.level);
    let currentBoss = sortedBosses.find(b => b.level === playerLevel);
    if (!currentBoss && sortedBosses.length > 0) {
        currentBoss = sortedBosses[sortedBosses.length - 1]; 
    }

    let bossCard = currentBoss ? cardsCatalog.find(c => c.id === currentBoss.cardId) : null;
    if (!bossCard && cardsCatalog && cardsCatalog.length > 0) bossCard = cardsCatalog[0];

    const [hp, setHp] = useState(currentBoss?.maxHp || 1000);
    const [tempCoins, setTempCoins] = useState(0);
    const [isHit, setIsHit] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    
    // СТАНИ ДЛЯ КУЛДАУНУ
    const [cooldownEnd, setCooldownEnd] = useState(null);
    const [timeLeft, setTimeLeft] = useState("");

    const isLoadedRef = useRef(false);
    
    // Трюк для збереження при перемиканні вкладок (додали cdEnd)
    const stateRef = useRef({ hp, tempCoins, bossId: currentBoss?.id, playerUid: profile?.uid, cdEnd: cooldownEnd });
    useEffect(() => {
        stateRef.current = { hp, tempCoins, bossId: currentBoss?.id, playerUid: profile?.uid, cdEnd: cooldownEnd };
    }, [hp, tempCoins, currentBoss, profile, cooldownEnd]);

    // ЗАВАНТАЖЕННЯ ЗІ ЗБЕРЕЖЕННЯ ТА ПЕРЕВІРКА КД
    useEffect(() => {
        const fetchFarmState = async () => {
            if (!profile || !currentBoss) return setIsLoading(false);
            
            setIsLoading(true);
            isLoadedRef.current = false; 

            try {
                const farmRef = doc(db, "artifacts", appId, "users", profile.uid, "farmState", "main");
                const snap = await getDoc(farmRef);
                if (snap.exists()) {
                    const data = snap.data();
                    
                    // ПЕРЕВІРЯЄМО, ЧИ ГРАВЕЦЬ У КУЛДАУНІ
                    if (data.cooldownUntil && new Date(data.cooldownUntil) > new Date()) {
                        setCooldownEnd(data.cooldownUntil);
                        setHp(0);
                        setTempCoins(0);
                    } else {
                        setCooldownEnd(null);
                        if (data.bossId === currentBoss.id && data.currentHp !== undefined && data.currentHp !== null) {
                            setHp(data.currentHp);
                            setTempCoins(data.pendingCoins || 0); 
                        } else {
                            setHp(currentBoss.maxHp);
                            setTempCoins(0);
                        }
                    }
                } else {
                    setHp(currentBoss.maxHp);
                    setTempCoins(0);
                }
            } catch (e) { console.error(e); }
            
            setIsLoading(false);
            isLoadedRef.current = true;
        };
        fetchFarmState();
    }, [currentBoss?.id, playerLevel, profile?.uid, appId, db]);

    // ТАЙМЕР ЗВОРОТНОГО ВІДЛІКУ КУЛДАУНУ
    useEffect(() => {
        if (!cooldownEnd) return;
        
        const updateTimer = () => {
            const distance = new Date(cooldownEnd).getTime() - new Date().getTime();
            if (distance <= 0) {
                setCooldownEnd(null);
                setHp(currentBoss?.maxHp || 1000); // Воскрешаємо боса!
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
    }, [cooldownEnd, currentBoss]);

    // АВТОЗБЕРЕЖЕННЯ 1: При перемиканні вкладок
    useEffect(() => {
        return () => {
            const { hp: savedHp, tempCoins: savedCoins, bossId, playerUid, cdEnd } = stateRef.current;
            if (playerUid && isLoadedRef.current && !cdEnd) { 
                const farmRef = doc(db, "artifacts", appId, "users", playerUid, "farmState", "main");
                setDoc(farmRef, { 
                    bossId, 
                    currentHp: savedHp, 
                    pendingCoins: savedCoins,
                    lastUpdated: new Date().toISOString() 
                }, { merge: true }).catch(console.error);
            }
        };
    }, [db, appId]);

    // АВТОЗБЕРЕЖЕННЯ 2: Кожні 1.5 секунди (під час бою)
    useEffect(() => {
        if (!isLoadedRef.current || hp <= 0 || !profile || isLoading || cooldownEnd) return;
        
        const timer = setTimeout(() => {
            const farmRef = doc(db, "artifacts", appId, "users", profile.uid, "farmState", "main");
            setDoc(farmRef, { 
                bossId: currentBoss?.id, 
                currentHp: hp, 
                pendingCoins: tempCoins,
                lastUpdated: new Date().toISOString() 
            }, { merge: true }).catch(console.error);
        }, 1500);

        return () => clearTimeout(timer);
    }, [hp, tempCoins, profile, currentBoss?.id, db, appId, isLoading, cooldownEnd]);

    // УДАР ПО БОСУ
    const handleHit = () => {
        if (hp <= 0 || cooldownEnd) return; 
        
        setIsHit(true);
        setTimeout(() => setIsHit(false), 100);

        const dmg = currentBoss?.damagePerClick || 10;
        const newHp = Math.max(0, hp - dmg);
        setHp(newHp);
        setTempCoins(prev => prev + (currentBoss?.rewardPerClick || 2));

        if (newHp === 0) {
            setTempCoins(prev => prev + (currentBoss?.killBonus || 0));
            showToast(`ЗНИЩЕНО! Бонус: +${currentBoss?.killBonus || 0} монет!`, "success");
        }
    };

    // ФУНКЦІЯ ПЕРЕКАЗУ В ГАМАНЕЦЬ ТА ЗАПУСК КД
    const claimRewards = async () => {
        if (tempCoins === 0 || isProcessing || !profile) return;
        setIsProcessing(true);
        
        try {
            const isLevelUp = hp <= 0;
            let updates = { coins: increment(tempCoins) };
            
            if (isLevelUp) updates.farmLevel = increment(1); 

            // Додаємо монети на баланс
            const profileRef = doc(db, "artifacts", appId, "public", "data", "profiles", profile.uid);
            await updateDoc(profileRef, updates);

            // Очищаємо "Мішок"
            const farmRef = doc(db, "artifacts", appId, "users", profile.uid, "farmState", "main");
            if (isLevelUp) {
                // ЗАПУСКАЄМО ТАЙМЕР КУЛДАУНУ
                const cdHours = currentBoss?.cooldownHours || 4;
                const cdUntil = new Date(Date.now() + cdHours * 60 * 60 * 1000).toISOString();
                
                await setDoc(farmRef, { bossId: null, currentHp: null, pendingCoins: 0, cooldownUntil: cdUntil }, { merge: true });
                setTempCoins(0);
                setCooldownEnd(cdUntil); // Одразу покажемо екран таймера
                showToast(`Боса подолано! Рівень підвищено до ${playerLevel + 1}!`, "success");
            } else {
                await setDoc(farmRef, { bossId: currentBoss.id, currentHp: hp, pendingCoins: 0, lastUpdated: new Date().toISOString() }, { merge: true });
                showToast(`Ви успішно забрали ${tempCoins} монет!`, "success");
                setTempCoins(0);
            }
        } catch (error) { showToast("Помилка сервера", "error"); }
        setIsProcessing(false);
    };

    if (isLoading) return <div className="text-center py-20 text-neutral-500"><Loader2 className="animate-spin mx-auto w-10 h-10 mb-4"/> Підготовка Арени...</div>;
    if (!currentBoss || !bossCard) return <div className="text-center py-20 text-neutral-500">Боси ще формують свої ряди...</div>;

    // ЕКРАН КУЛДАУНУ
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
                </div>
            </div>
        );
    }

    const hpPercentage = Math.max(0, (hp / currentBoss.maxHp) * 100);

    return (
        <div className="pb-10 animate-in fade-in zoom-in-95 duration-500 max-w-lg mx-auto">
            <div className="flex justify-between items-end mb-4 px-2">
                <div>
                    <div className="text-red-500 font-black tracking-widest uppercase text-sm mb-1 flex items-center gap-2">
    Ваш рівень: {playerLevel} <span className="text-neutral-700">|</span> Бос {currentBoss?.level} рівня
</div>
                    <h2 className="text-2xl font-black text-white uppercase tracking-widest flex items-center gap-2 drop-shadow-lg">
                        <Swords className="text-red-500" /> {bossCard.name}
                    </h2>
                </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 mb-8 flex justify-between items-center shadow-lg">
                <div>
                    <div className="text-xs text-neutral-500 font-bold uppercase tracking-wider mb-1">Очікує в мішку</div>
                    <div className="text-3xl font-black text-yellow-500 flex items-center gap-2">
                        {tempCoins} <Coins size={28} />
                    </div>
                </div>
                <button 
                    onClick={claimRewards}
                    disabled={tempCoins === 0 || isProcessing}
                    className="bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-bold py-3 px-6 rounded-xl transition-colors shadow-[0_0_15px_rgba(37,99,235,0.4)] flex items-center gap-2"
                >
                    {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />} 
                    {hp <= 0 ? "Далі" : "Забрати"}
                </button>
            </div>

            <div className="flex flex-col items-center relative">
                <div className="w-full bg-neutral-950 h-8 rounded-full overflow-hidden border-2 border-neutral-800 mb-8 relative shadow-inner">
                    <div className="h-full bg-gradient-to-r from-red-800 to-red-500 transition-all duration-75 ease-out" style={{ width: `${hpPercentage}%` }}></div>
                    <div className="absolute inset-0 flex items-center justify-center font-black text-white drop-shadow-md text-sm">
                        {hp} / {currentBoss.maxHp} HP
                    </div>
                </div>

                <button 
                    onClick={handleHit}
                    disabled={hp <= 0}
                    className={`relative group outline-none transition-transform duration-75 select-none ${isHit ? 'scale-95 brightness-125 -rotate-2' : 'hover:scale-105'}`}
                    style={{ WebkitTapHighlightColor: 'transparent' }} 
                >
                    <div className="absolute -inset-6 bg-red-600/20 rounded-[3rem] blur-2xl group-hover:bg-red-600/40 transition-colors animate-pulse pointer-events-none"></div>
                    <div className="relative w-48 sm:w-64 aspect-[2/3] rounded-3xl border-4 border-red-900 overflow-hidden shadow-[0_0_50px_rgba(220,38,38,0.4)] bg-neutral-900 cursor-crosshair">
                        <img src={bossCard.image} alt="boss" className="w-full h-full object-cover pointer-events-none" draggable="false" />
                        {hp <= 0 && (
                            <div className="absolute inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm animate-in zoom-in">
                                <div className="text-red-500 font-black text-3xl sm:text-4xl uppercase tracking-widest border-4 border-red-500 p-4 rounded-xl transform -rotate-12 shadow-[0_0_30px_rgba(239,68,68,0.5)]">
                                    ЗНИЩЕНО
                                </div>
                            </div>
                        )}
                    </div>
                </button>

                <p className="text-neutral-500 text-sm mt-10 font-bold uppercase tracking-widest animate-pulse text-center">
                    {hp > 0 ? "Клікайте по босу, щоб завдавати шкоди!" : "Заберіть нагороду, щоб перейти на новий рівень!"}
                </p>
            </div>
        </div>
    );
}