import React, { useState } from 'react';
import { X, Gift, CheckCircle2, ShieldAlert, BadgeInfo, Coins, Swords, Skull, Zap, Heart } from 'lucide-react';
import { claimNotificationGift, markNotificationRead } from '../config/api';

function BattleReportModal({ report, onClose }) {
  if (!report) return null;
  const { pointName, attackerNickname, attackerWon, defenderResults, battleDate } = report;

  return (
    <div className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-neutral-900 border border-neutral-700 rounded-3xl p-6 w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center mb-6 shrink-0">
          <div>
            <h2 className="text-xl font-black text-white uppercase tracking-tight">Звіт про оборону</h2>
            <p className="text-xs text-neutral-500 font-bold uppercase tracking-widest">{pointName}</p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white transition-colors bg-neutral-800 p-2 rounded-full">
            <X size={20} />
          </button>
        </div>

        <div className="mb-6 flex flex-col items-center bg-neutral-800/50 p-4 rounded-2xl border border-neutral-700 shrink-0">
          {attackerWon ? (
            <>
              <ShieldAlert size={48} className="text-red-500 mb-2" />
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Поразка в обороні</h3>
              <p className="text-sm text-neutral-400">Гравець <span className="text-white font-bold">{attackerNickname}</span> захопив вашу точку</p>
            </>
          ) : (
            <>
              <CheckCircle2 size={48} className="text-green-500 mb-2" />
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Атаку відбито!</h3>
              <p className="text-sm text-neutral-400">Ви успішно захистили точку від <span className="text-white font-bold">{attackerNickname}</span></p>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 mb-6 space-y-3">
          <h4 className="text-[10px] uppercase font-black text-neutral-500 tracking-widest flex items-center gap-2">
            <Swords size={12} /> Стан ваших захисних карт
          </h4>
          
          {defenderResults?.map((res, idx) => {
            const isDestroyed = res.status === 'destroyed';
            const isWeakened = res.status === 'weakened';
            
            return (
              <div key={idx} className={`flex items-center gap-4 p-3 rounded-2xl border transition-all ${isDestroyed ? 'bg-red-950/20 border-red-500/50 grayscale' : isWeakened ? 'bg-amber-950/20 border-amber-500/40' : 'bg-neutral-800/50 border-neutral-700/50'}`}>
                <div className="w-12 h-16 shrink-0 rounded-lg overflow-hidden border-2 border-neutral-700 shadow-lg relative">
                  <img src={res.image} className="w-full h-full object-cover" />
                  {isDestroyed && (
                    <div className="absolute inset-0 bg-red-600/40 flex items-center justify-center">
                      <Skull size={18} className="text-white" />
                    </div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <div className="font-black text-white truncate text-xs uppercase tracking-tight">{res.name}</div>
                    <div className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter shadow-sm border ${isDestroyed ? 'bg-red-600 text-white border-red-400' : isWeakened ? 'bg-amber-500 text-black border-amber-300' : 'bg-green-600 text-white border-green-400'}`}>
                      {isDestroyed ? 'Знищена' : isWeakened ? 'Ослаблена' : 'Вціліла'}
                    </div>
                  </div>
                  
                  <div className="mt-1 flex items-center gap-4">
                    {!isDestroyed && (
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                          <span className="text-[8px] text-neutral-500 uppercase font-black">Сила</span>
                          <div className="flex items-center gap-1">
                            <Zap size={10} className="text-yellow-500" />
                            <span className="text-[11px] font-black text-white">{res.newPower || res.oldPower}</span>
                            {isWeakened && res.newPower < res.oldPower && (
                              <span className="text-[8px] text-red-500 font-bold">-{res.oldPower - res.newPower}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[8px] text-neutral-500 uppercase font-black">HP Max</span>
                          <div className="flex items-center gap-1">
                            <Heart size={10} className="text-red-500" />
                            <span className="text-[11px] font-black text-white">{res.newMaxHp || res.oldMaxHp}</span>
                            {isWeakened && res.newMaxHp < res.oldMaxHp && (
                              <span className="text-[8px] text-red-500 font-bold">-{res.oldMaxHp - res.newMaxHp}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    {isDestroyed && <span className="text-red-400 text-[10px] font-bold">Карту назавжди втрачено</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={onClose}
          className="w-full bg-neutral-800 hover:bg-neutral-700 text-white font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-xs shrink-0"
        >
          Зрозуміло
        </button>
      </div>
    </div>
  );
}

export default function NotificationsModal({
  notifications,
  setNotifications,
  onClose,
  getToken,
  reloadProfile,
  showToast,
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedBattleReport, setSelectedBattleReport] = useState(null);

  const handleClaim = async (notif) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const data = await claimNotificationGift(getToken(), notif.id);
      showToast('Подарунок успішно отримано!', 'success');

      // Оновлюємо список сповіщень
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, isClaimed: true, isRead: true } : n))
      );

      // Оновлюємо профіль у головному компоненті
      if (reloadProfile) {
        reloadProfile();
      }
    } catch (error) {
      showToast(error.message || 'Помилка отримання подарунку');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMarkRead = async (notif) => {
    if (notif.isRead || notif.type === 'gift') return; // Подарунки читаються тільки при отриманні або якщо вже не активні
    try {
      await markNotificationRead(getToken(), notif.id);
      setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n)));
    } catch (error) {
      console.error('Помилка при відмітці сповіщення як прочитане', error);
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'punishment':
        return <ShieldAlert className="text-red-500" size={24} />;
      case 'update':
        return <BadgeInfo className="text-blue-400" size={24} />;
      case 'sale':
        return <Coins className="text-yellow-500" size={24} />;
      case 'admin_action':
        return <ShieldAlert className="text-purple-400" size={24} />;
      case 'gift':
        return <Gift className="text-green-400" size={24} />;
      case 'arena_battle':
        return <Swords className="text-indigo-400" size={24} />;
      default:
        return <BadgeInfo className="text-neutral-400" size={24} />;
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-neutral-900 border border-neutral-700 rounded-3xl p-6 w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-black text-white">Сповіщення</h2>
            <button
              onClick={onClose}
              className="text-neutral-500 hover:text-white transition-colors bg-neutral-800 p-2 rounded-full"
            >
              <X size={24} />
            </button>
          </div>

          <div className="flex-grow overflow-y-auto space-y-3 pr-2 hide-scrollbar">
            {notifications.length === 0 ? (
              <div className="text-center text-neutral-500 py-10">Немає нових сповіщень.</div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onMouseEnter={() => handleMarkRead(n)}
                  className={`p-4 rounded-2xl border ${n.isRead ? 'bg-neutral-950 border-neutral-800 opacity-75' : 'bg-neutral-800 border-neutral-700 shadow-md'}`}
                >
                  <div className="flex gap-4 items-start">
                    <div className="p-2 bg-neutral-900 rounded-xl">{getIcon(n.type)}</div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-1">
                        <h3 className={`font-bold ${n.isRead ? 'text-neutral-300' : 'text-white'}`}>
                          {n.title}
                        </h3>
                        <span className="text-[10px] text-neutral-500 whitespace-nowrap ml-2">
                          {new Date(n.createdAt).toLocaleDateString()}{' '}
                          {new Date(n.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-sm text-neutral-400 whitespace-pre-wrap leading-relaxed">
                        {n.message}
                      </p>

                      {n.type === 'arena_battle' && n.metadata && (
                        <div className="mt-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBattleReport(n.metadata);
                            }}
                            className="w-full bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 font-bold py-2 px-4 rounded-xl transition-all flex justify-center items-center gap-2 text-sm"
                          >
                            <Swords size={16} /> Переглянути результати
                          </button>
                        </div>
                      )}

                      {n.type === 'gift' && !n.isClaimed && (
                        <div className="mt-3">
                          <button
                            onClick={() => handleClaim(n)}
                            disabled={isProcessing}
                            className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-xl transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
                          >
                            {isProcessing ? (
                              'Обробка...'
                            ) : (
                              <>
                                <Gift size={18} /> Забрати подарунок
                              </>
                            )}
                          </button>
                        </div>
                      )}
                      {n.type === 'gift' && n.isClaimed && (
                        <div className="mt-3 flex items-center gap-2 text-green-500 text-sm font-bold bg-green-900/20 p-2 rounded-xl border border-green-900/30 w-fit">
                          <CheckCircle2 size={16} /> Отримано
                        </div>
                      )}
                    </div>
                    {!n.isRead && n.type !== 'gift' && (
                      <div className="w-2 h-2 rounded-full bg-yellow-500 mt-2 flex-shrink-0" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      
      {selectedBattleReport && (
        <BattleReportModal 
          report={selectedBattleReport} 
          onClose={() => setSelectedBattleReport(null)} 
        />
      )}
    </>
  );
}
