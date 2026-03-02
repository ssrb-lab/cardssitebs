import React, { useState } from 'react';
import { X, Gift, CheckCircle2, ShieldAlert, BadgeInfo, Coins } from 'lucide-react';
import { claimNotificationGift, markNotificationRead } from '../config/api';

export default function NotificationsModal({ notifications, setNotifications, onClose, getToken, reloadProfile, showToast }) {
    const [isProcessing, setIsProcessing] = useState(false);

    const handleClaim = async (notif) => {
        if (isProcessing) return;
        setIsProcessing(true);
        try {
            const data = await claimNotificationGift(getToken(), notif.id);
            showToast("Подарунок успішно отримано!", "success");

            // Оновлюємо список сповіщень
            setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isClaimed: true, isRead: true } : n));

            // Оновлюємо профіль у головному компоненті
            if (reloadProfile) {
                reloadProfile();
            }
        } catch (error) {
            showToast(error.message || "Помилка отримання подарунку");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleMarkRead = async (notif) => {
        if (notif.isRead || notif.type === 'gift') return; // Подарунки читаються тільки при отриманні або якщо вже не активні
        try {
            await markNotificationRead(getToken(), notif.id);
            setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
        } catch (error) {
            console.error("Помилка при відмітці сповіщення як прочитане", error);
        }
    };

    const getIcon = (type) => {
        switch (type) {
            case 'punishment': return <ShieldAlert className="text-red-500" size={24} />;
            case 'update': return <BadgeInfo className="text-blue-400" size={24} />;
            case 'sale': return <Coins className="text-yellow-500" size={24} />;
            case 'admin_action': return <ShieldAlert className="text-purple-400" size={24} />;
            case 'gift': return <Gift className="text-green-400" size={24} />;
            default: return <BadgeInfo className="text-neutral-400" size={24} />;
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-neutral-900 border border-neutral-700 rounded-3xl p-6 w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-black text-white">Сповіщення</h2>
                    <button onClick={onClose} className="text-neutral-500 hover:text-white transition-colors bg-neutral-800 p-2 rounded-full">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-grow overflow-y-auto space-y-3 pr-2 hide-scrollbar">
                    {notifications.length === 0 ? (
                        <div className="text-center text-neutral-500 py-10">
                            Немає нових сповіщень.
                        </div>
                    ) : (
                        notifications.map((n) => (
                            <div
                                key={n.id}
                                onMouseEnter={() => handleMarkRead(n)}
                                className={`p-4 rounded-2xl border ${n.isRead ? 'bg-neutral-950 border-neutral-800 opacity-75' : 'bg-neutral-800 border-neutral-700 shadow-md'}`}
                            >
                                <div className="flex gap-4 items-start">
                                    <div className="p-2 bg-neutral-900 rounded-xl">
                                        {getIcon(n.type)}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start mb-1">
                                            <h3 className={`font-bold ${n.isRead ? 'text-neutral-300' : 'text-white'}`}>{n.title}</h3>
                                            <span className="text-[10px] text-neutral-500 whitespace-nowrap ml-2">
                                                {new Date(n.createdAt).toLocaleDateString()} {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <p className="text-sm text-neutral-400 whitespace-pre-wrap leading-relaxed">{n.message}</p>

                                        {n.type === 'gift' && !n.isClaimed && (
                                            <div className="mt-3">
                                                <button
                                                    onClick={() => handleClaim(n)}
                                                    disabled={isProcessing}
                                                    className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-xl transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
                                                >
                                                    {isProcessing ? 'Обробка...' : (
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
    );
}
