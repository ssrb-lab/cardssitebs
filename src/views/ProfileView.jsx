import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Gift,
  Ticket,
  Settings,
  LogOut,
  CalendarDays,
  Coins,
  LayoutGrid,
  PackageOpen,
  Zap,
  Star,
  Gem,
  Swords,
  Store,
  ArrowLeft,
  Trash2,
  Trophy,
  Lock,
  Upload,
  X,
} from 'lucide-react';
import Cropper from 'react-easy-crop';
import PlayerAvatar from '../components/PlayerAvatar';
import { formatDate, getCardStyle, isToday } from '../utils/helpers';
import { getCroppedImg } from '../utils/cropImage';
import {
  claimDailyRequest,
  fetchMarketHistoryRequest,
  clearMyMarketHistoryRequest,
  usePromoRequest,
  updateAvatarRequest,
  uploadAvatarRequest,
  getToken,
  fetchPublicProfileRequest,
  changePasswordRequest,
  equipBannerRequest,
  equipPlateRequest,
} from '../config/api';
import CardFrame from '../components/CardFrame';
import AchievementIcon from '../components/AchievementIcon';
import { PerkBadge } from '../components/PerkBadge';

export default function ProfileView({
  profile,
  setProfile,
  handleLogout,
  showToast,
  inventoryCount,
  isPremiumActive,
  showcases,
  cardsCatalog,
  rarities,
  fullInventory,
  setViewingCard,
  cardStats,
  achievementsCatalog = [],
  packsCatalog = [],
}) {
  const navigate = useNavigate();
  const [avatarInput, setAvatarInput] = useState('');
  const [promoInput, setPromoInput] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const actionLock = useRef(false);

  const [marketHistory, setMarketHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('main');
  const [liveStats, setLiveStats] = useState(null);

  // Змінні для обрізки аватарки
  const [selectedFileUrl, setSelectedFileUrl] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Завантажуємо історію ринку
        const historyData = await fetchMarketHistoryRequest(getToken());
        setMarketHistory(historyData || []);

        // Завантажуємо свіжу статистику з бази
        if (profile?.uid) {
          const statsData = await fetchPublicProfileRequest(profile.uid);
          setLiveStats(statsData);
        }
      } catch (e) {
        console.error('Помилка:', e);
      }
    };
    if (profile) loadData();
  }, [profile?.uid]);

  const handleClearHistory = async () => {
    if (
      !confirm(
        'Мій лорд, Ви впевнені, що хочете безповоротно видалити всю історію покупок та продажів?'
      )
    )
      return;
    try {
      await clearMyMarketHistoryRequest(getToken());
      setMarketHistory([]);
      showToast('Історію успішно очищено!', 'success');
    } catch (e) {
      showToast('Помилка очищення історії', 'error');
    }
  };

  const canClaimDaily = profile && !isToday(profile.lastDailyClaim);
  const mainShowcase = showcases?.find((s) => s.id === profile?.mainShowcaseId);

  const validShowcaseCards = [];
  if (mainShowcase && mainShowcase.cardIds) {
    const tempInv = JSON.parse(JSON.stringify(fullInventory));
    for (const cid of mainShowcase.cardIds) {
      const invItem = tempInv.find((i) => i.card.id === cid);
      if (invItem && invItem.amount > 0) {
        validShowcaseCards.push(invItem.card);
        invItem.amount -= 1;
      }
    }
  }

  const claimDaily = async () => {
    if (actionLock.current || isProcessing || !canClaimDaily) return;
    actionLock.current = true;
    setIsProcessing(true);
    try {
      const data = await claimDailyRequest(getToken());
      setProfile(data.profile);
      showToast(`Мій лорд, Ви отримали щоденну нагороду: ${data.reward} монет!`, 'success');
    } catch (e) {
      showToast(e.message || 'Помилка отримання нагороди', 'error');
    } finally {
      actionLock.current = false;
      setIsProcessing(false);
    }
  };

  const handleAvatarUpdate = async (e) => {
    e.preventDefault();
    if (actionLock.current || isProcessing || !avatarInput.trim()) return;
    actionLock.current = true;
    setIsProcessing(true);
    try {
      const data = await updateAvatarRequest(getToken(), avatarInput.trim());
      setProfile((prev) => ({ ...prev, avatarUrl: avatarInput.trim() }));
      showToast('Аватар успішно оновлено!', 'success');
      setAvatarInput('');
    } catch (e) {
      showToast('Помилка оновлення аватару');
    } finally {
      actionLock.current = false;
      setIsProcessing(false);
    }
  };

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader();
      reader.readAsDataURL(e.target.files[0]);
      reader.addEventListener('load', () => {
        setSelectedFileUrl(reader.result);
      });
    }
  };

  const handleCropAndUpload = async () => {
    if (actionLock.current || isProcessing || !selectedFileUrl || !croppedAreaPixels) return;
    actionLock.current = true;
    setIsProcessing(true);
    try {
      // Отримуємо оброблене зображення як об'єкт File
      const { file } = await getCroppedImg(selectedFileUrl, croppedAreaPixels);

      // Відправляємо на сервер
      const data = await uploadAvatarRequest(getToken(), file);

      setProfile((prev) => ({ ...prev, avatarUrl: data.avatarUrl }));
      showToast('Аватар успішно завантажено!', 'success');

      // Закриваємо модалку
      setSelectedFileUrl(null);
    } catch (e) {
      console.error(e);
      showToast('Помилка при збереженні аватару', 'error');
    } finally {
      actionLock.current = false;
      setIsProcessing(false);
    }
  };

  const redeemPromo = async (e) => {
    e.preventDefault();
    if (actionLock.current || isProcessing || !promoInput.trim()) return;
    actionLock.current = true;
    setIsProcessing(true);
    try {
      const data = await usePromoRequest(getToken(), promoInput.trim().toUpperCase());
      setProfile(data.profile);
      showToast(`Промокод застосовано! Отримано: ${data.reward} монет`, 'success');
      setPromoInput('');
    } catch (e) {
      showToast(e.message || 'Помилка промокоду', 'error');
    } finally {
      actionLock.current = false;
      setIsProcessing(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (
      actionLock.current ||
      isProcessing ||
      !oldPassword.trim() ||
      !newPassword.trim() ||
      !confirmPassword.trim()
    )
      return;
    if (newPassword !== confirmPassword) {
      showToast('Новий пароль та підтвердження не збігаються', 'error');
      return;
    }
    actionLock.current = true;
    setIsProcessing(true);
    try {
      await changePasswordRequest(getToken(), oldPassword, newPassword);
      showToast('Мій лорд, пароль успішно змінено!', 'success');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      showToast(e.message || 'Помилка зміни пароля', 'error');
    } finally {
      actionLock.current = false;
      setIsProcessing(false);
    }
  };

  const handleEquipBanner = async (bannerUrl) => {
    if (actionLock.current || isProcessing) return;
    actionLock.current = true;
    setIsProcessing(true);
    try {
      await equipBannerRequest(getToken(), bannerUrl);
      setProfile((prev) => ({ ...prev, profileBannerUrl: bannerUrl }));
      showToast('Банер успішно встановлено!', 'success');
    } catch (e) {
      showToast(e.message || 'Помилка встановлення банера', 'error');
    } finally {
      actionLock.current = false;
      setIsProcessing(false);
    }
  };

  const handleEquipPlate = async (plateUrl) => {
    if (actionLock.current || isProcessing) return;
    actionLock.current = true;
    setIsProcessing(true);
    try {
      await equipPlateRequest(getToken(), plateUrl);
      setProfile((prev) => ({ ...prev, activePlateUrl: plateUrl }));
      showToast(plateUrl ? 'Бейдж встановлено!' : 'Бейдж знято!', 'success');
    } catch (e) {
      showToast(e.message || 'Помилка встановлення бейджа', 'error');
    } finally {
      actionLock.current = false;
      setIsProcessing(false);
    }
  };

  if (activeTab === 'history') {
    return (
      <div className="pb-10 animate-in fade-in slide-in-from-right-8 duration-300 max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={() => setActiveTab('main')}
            className="flex items-center gap-2 text-neutral-400 hover:text-white font-bold transition-colors"
          >
            <ArrowLeft size={20} /> Назад до профілю
          </button>
          <button
            onClick={handleClearHistory}
            className="flex items-center gap-2 bg-red-900/40 text-red-400 hover:bg-red-900 hover:text-white px-4 py-2 rounded-xl font-bold transition-colors border border-red-900/50"
          >
            <Trash2 size={16} /> Очистити історію
          </button>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-lg">
          <h3 className="text-xl font-black text-white mb-4 flex items-center gap-2">
            <Store className="text-yellow-500" /> Ваша Історія Ринку
          </h3>
          <div className="max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar space-y-2">
            {!Array.isArray(marketHistory) || marketHistory.length === 0 ? (
              <p className="text-neutral-500 text-sm text-center py-4">
                Ви ще нічого не купували та не продавали.
              </p>
            ) : (
              marketHistory.map((item) => {
                const isSale = item.sellerId === profile?.uid;
                const effectClass = item.card?.effect ? `effect-${item.card.effect}` : '';
                return (
                  <div
                    key={item.id}
                    className="flex justify-between items-center bg-neutral-950 p-3 rounded-xl border border-neutral-800 hover:border-neutral-700 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {item.card?.image && (
                        <div className={`w-10 h-14 rounded-md border border-neutral-700 bg-neutral-950 overflow-hidden relative ${effectClass} isolate z-0`}>
                          <CardFrame frame={item.card.frame} effect={item.card.effect}>
                            <img
                              src={item.card.image}
                              alt="card"
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </CardFrame>
                          <PerkBadge perk={item.card.perk} />
                        </div>
                      )}
                      <div>
                        <div className="font-bold text-white text-sm">
                          {item.card?.name || 'Невідома картка'}
                        </div>
                        <div className="text-xs text-neutral-500 mt-0.5">
                          {isSale
                            ? `Покупець: ${item.buyerNickname || 'Невідомо'}`
                            : `Продавець: ${item.seller?.nickname || 'Невідомо'}`}
                          <span className="mx-2">•</span>
                          {formatDate(item.soldAt)}
                        </div>
                        {item.power !== null && (
                          <div className="flex gap-2 mt-1">
                            <div className="flex bg-neutral-950/80 border border-neutral-700/50 rounded-lg px-1.5 py-0.5 items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-widest text-yellow-500">
                              ⚡ {item.power}
                            </div>
                            <div className="flex bg-neutral-950/80 border border-neutral-700/50 rounded-lg px-1.5 py-0.5 items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-widest text-red-500">
                              ❤️ {item.hp ?? 50}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div
                      className={`font-black flex items-center gap-1 ${isSale ? 'text-green-500' : 'text-red-500'}`}
                    >
                      {isSale ? '+' : '-'}
                      {item.price} <Coins size={14} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'settings') {
    return (
      <div className="pb-10 animate-in fade-in slide-in-from-right-8 duration-300 max-w-4xl mx-auto relative">
        <button
          onClick={() => setActiveTab('main')}
          className="mb-6 flex items-center gap-2 text-neutral-400 hover:text-white font-bold transition-colors"
        >
          <ArrowLeft size={20} /> Назад до профілю
        </button>

        {/* Модалка обрізки */}
        {selectedFileUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl relative flex flex-col h-[80vh] max-h-[600px]">
              <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/50 z-10">
                <h3 className="font-black text-white text-lg">Виберіть область (Квадрат)</h3>
                <button
                  onClick={() => setSelectedFileUrl(null)}
                  className="text-neutral-500 hover:text-white transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="relative flex-1 bg-black">
                <Cropper
                  image={selectedFileUrl}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onCropChange={setCrop}
                  onCropComplete={onCropComplete}
                  onZoomChange={setZoom}
                  cropShape="rect"
                  showGrid={false}
                />
              </div>
              <div className="p-6 bg-neutral-900 border-t border-neutral-800 z-10 space-y-4">
                <div>
                  <label className="text-xs font-bold text-neutral-400 mb-2 block uppercase">
                    Масштаб
                  </label>
                  <input
                    type="range"
                    value={zoom}
                    min={1}
                    max={3}
                    step={0.1}
                    aria-labelledby="Zoom"
                    onChange={(e) => setZoom(e.target.value)}
                    className="w-full accent-blue-500 h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <button
                  onClick={handleCropAndUpload}
                  disabled={isProcessing}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 text-white font-bold px-6 py-4 rounded-xl transition-colors shadow-[0_0_15px_rgba(37,99,235,0.3)] shadow-blue-500/20"
                >
                  {isProcessing ? 'Завантаження...' : 'Застосувати та Зберегти'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-lg">
          <h3 className="text-xl font-black text-white mb-6 flex items-center gap-2">
            <Settings className="text-blue-500" /> Налаштування
          </h3>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex-1 bg-neutral-950/50 p-4 rounded-xl border border-neutral-800/50">
                <label className="block text-sm font-bold text-neutral-400 mb-3">
                  Оновлення Аватарки
                </label>

                <div className="space-y-4">
                  {/* Завантаження з пристрою */}
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isProcessing}
                      className="w-full bg-neutral-900 border border-neutral-700 hover:border-blue-500 hover:text-white text-neutral-300 font-bold px-4 py-4 rounded-xl transition-colors text-sm flex items-center justify-center gap-2 group"
                    >
                      <Upload
                        size={18}
                        className="text-blue-500 group-hover:scale-110 transition-transform"
                      />
                      Завантажити фото
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="h-px bg-neutral-800 flex-1"></div>
                    <span className="text-neutral-500 text-xs font-bold uppercase">
                      або за посиланням
                    </span>
                    <div className="h-px bg-neutral-800 flex-1"></div>
                  </div>

                  {/* Звичайне посилання */}
                  <form onSubmit={handleAvatarUpdate} className="flex flex-col gap-3 relative z-10">
                    <input
                      type="text"
                      value={avatarInput}
                      onChange={(e) => setAvatarInput(e.target.value)}
                      placeholder="URL зображення (https://...)"
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none text-sm transition-colors"
                    />
                    <button
                      type="submit"
                      disabled={isProcessing || !avatarInput.trim()}
                      className="bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 text-white font-bold px-4 py-3 rounded-xl transition-colors text-sm w-full"
                    >
                      Зберегти URL аватар
                    </button>
                  </form>
                </div>
              </div>
              <div className="flex-1 bg-neutral-950/50 p-4 rounded-xl border border-neutral-800/50">
                <label className="block text-sm font-bold text-neutral-400 mb-3">
                  Безпека (Зміна пароля)
                </label>
                <form onSubmit={handleChangePassword} className="flex flex-col gap-3 relative z-10">
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="Поточний пароль"
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none text-sm transition-colors"
                  />
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Новий пароль"
                      className="flex-1 bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none text-sm transition-colors"
                    />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Підтвердіть новий пароль"
                      className="flex-1 bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none text-sm transition-colors"
                    />
                    <button
                      type="submit"
                      disabled={isProcessing || !oldPassword || !newPassword || !confirmPassword}
                      className="bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 text-white font-bold px-6 py-3 rounded-xl transition-colors text-sm whitespace-nowrap"
                    >
                      Оновити
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* ПРОФІЛЬНІ БАНЕРИ */}
            {(() => {
              const userBanners = profile?.ownedBanners 
                ? (Array.isArray(profile.ownedBanners) ? profile.ownedBanners : (typeof profile.ownedBanners === 'string' ? JSON.parse(profile.ownedBanners) : [])) 
                : [];
              return (
                <div className="bg-neutral-950/50 p-4 rounded-xl border border-neutral-800/50 mt-2">
                  <label className="block text-sm font-bold text-neutral-400 mb-3">
                    Мої Банери
                  </label>
                  {userBanners.length > 0 ? (
                    <div className="flex flex-wrap gap-4">
                       <div 
                         onClick={() => handleEquipBanner('')} 
                         className={`w-32 h-16 rounded-lg cursor-pointer border-2 flex items-center justify-center text-xs text-neutral-500 font-bold ${!profile.profileBannerUrl ? 'border-blue-500' : 'border-neutral-700 hover:border-neutral-500'}`}
                       >Стандартний</div>
                       {userBanners.map((bUrl, i) => (
                          <div 
                            key={i} 
                            onClick={() => handleEquipBanner(bUrl)} 
                            className={`w-32 h-16 rounded-lg bg-cover bg-center cursor-pointer border-2 transition-colors ${profile.profileBannerUrl === bUrl ? 'border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'border-neutral-700 hover:border-neutral-500'}`}
                            style={{ backgroundImage: `url(${bUrl})` }}
                          ></div>
                       ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-center p-4 bg-neutral-900/50 rounded-xl border border-neutral-800/50">
                      <p className="text-neutral-400 text-sm mb-4">У вас ще немає ексклюзивних банерів</p>
                      <button
                        onClick={() => navigate('/premium')}
                        className="bg-fuchsia-600/20 text-fuchsia-400 hover:bg-fuchsia-600 hover:text-white border border-fuchsia-500/30 px-6 py-2 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors text-sm"
                      >
                        <Gem size={16} /> Придбати в Преміумі
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ПЛАШКИ РЕЙТИНГУ */}
            {(() => {
              const userPlates = profile?.ownedPlates 
                ? (Array.isArray(profile.ownedPlates) ? profile.ownedPlates : (typeof profile.ownedPlates === 'string' ? JSON.parse(profile.ownedPlates) : [])) 
                : [];
              return (
                <div className="bg-neutral-950/50 p-4 rounded-xl border border-neutral-800/50 mt-2">
                  <label className="block text-sm font-bold text-neutral-400 mb-3">
                    Мої Бейджі (Рейтинг)
                  </label>
                  {userPlates.length > 0 ? (
                    <div className="flex flex-wrap gap-4">
                       <div 
                         onClick={() => handleEquipPlate('')} 
                         className={`w-full max-w-[240px] aspect-[5/1] rounded-lg cursor-pointer border-2 flex items-center justify-center text-xs text-neutral-500 font-bold bg-neutral-900 ${!profile.activePlateUrl ? 'border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'border-neutral-700 hover:border-neutral-500'}`}
                       >Без бейджа</div>
                       {userPlates.map((pUrl, i) => {
                         const isVideo = pUrl && pUrl.match(/\.(mp4|webm|mov)$/i);
                         return (
                           <div 
                             key={i} 
                             onClick={() => handleEquipPlate(pUrl)} 
                             className={`w-full max-w-[240px] aspect-[5/1] rounded-lg overflow-hidden cursor-pointer border-2 transition-colors relative bg-black/20 group ${profile.activePlateUrl === pUrl ? 'border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'border-neutral-700 hover:border-neutral-500'}`}
                             onMouseEnter={(e) => { const v = e.currentTarget.querySelector('video'); if (v) v.play().catch(() => {}); }}
                             onMouseLeave={(e) => { const v = e.currentTarget.querySelector('video'); if (v) { v.pause(); v.currentTime = 0; } }}
                           >
                             {isVideo ? (
                               <video src={pUrl} className="absolute inset-0 w-full h-full object-cover object-[right_30%]" muted loop playsInline />
                             ) : (
                               <img src={pUrl} className="absolute inset-0 w-full h-full object-cover object-[right_30%]" alt="" />
                             )}
                           </div>
                         );
                       })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-center p-4 bg-neutral-900/50 rounded-xl border border-neutral-800/50">
                      <p className="text-neutral-400 text-sm mb-4">У вас ще немає плашок для рейтингу</p>
                      <button
                        onClick={() => navigate('/premium')}
                        className="bg-fuchsia-600/20 text-fuchsia-400 hover:bg-fuchsia-600 hover:text-white border border-fuchsia-500/30 px-6 py-2 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors text-sm"
                      >
                        <Gem size={16} /> Придбати в Преміумі
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="flex justify-end mt-2 pt-4 border-t border-neutral-800">
              <button
                onClick={handleLogout}
                className="w-full md:w-auto bg-red-900/40 hover:bg-red-900 text-red-400 hover:text-white font-bold py-3 px-8 rounded-xl transition-colors flex justify-center items-center gap-2 border border-red-900/50"
              >
                <LogOut size={18} /> Вийти з акаунту
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-10 animate-in fade-in zoom-in-95 duration-500">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 text-center relative overflow-hidden mb-8 shadow-xl">
        {profile?.profileBannerUrl ? (
          <div 
            className="absolute inset-0 w-full h-full bg-cover bg-center opacity-40 pointer-events-none"
            style={{ backgroundImage: `url(${profile.profileBannerUrl})` }}
          ></div>
        ) : (
          <div
            className={`absolute top-0 left-0 w-full h-32 bg-gradient-to-b ${profile?.isSuperAdmin ? 'from-orange-900/40' : profile?.isAdmin ? 'from-purple-900/40' : isPremiumActive ? 'from-fuchsia-900/30' : 'from-blue-900/20'} to-transparent`}
          ></div>
        )}

        <div className="relative w-24 h-24 mx-auto mb-4 z-10">
          <PlayerAvatar
            profile={profile}
            className={`w-full h-full rounded-full text-4xl ${isPremiumActive ? 'border-4 border-fuchsia-500 shadow-[0_0_20px_rgba(217,70,239,0.5)]' : ''}`}
            iconSize={48}
          />
          {isPremiumActive && (
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-neutral-900 rounded-full p-1 border-2 border-fuchsia-500 z-20">
              <Gem size={16} className="text-fuchsia-400 fill-fuchsia-400" />
            </div>
          )}
        </div>

        <h2 className="text-3xl font-black text-white mb-1 relative z-10 flex justify-center items-center gap-2">
          {profile?.nickname}
          <span
            className="bg-red-600/20 backdrop-blur-md text-red-400 text-sm px-3 py-1 rounded-xl border border-red-500/40 flex items-center gap-1.5 shadow-sm"
            title="Ваш рівень Фарму"
          >
            <Swords size={16} /> {profile?.farmLevel || 1}
          </span>
          {isPremiumActive && (
            <Gem size={18} className="text-fuchsia-400 fill-fuchsia-400" title="Преміум Гравець" />
          )}
        </h2>
        <div className="flex justify-center mt-2 mb-6 relative z-10">
          <div className="bg-neutral-950/40 backdrop-blur-md border border-white/10 rounded-xl px-4 py-2 inline-flex items-center gap-2 text-neutral-400 text-sm font-medium shadow-sm">
            <CalendarDays size={16} className="text-neutral-500" />
            <span>З нами від: {formatDate(profile?.createdAt)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 relative z-10 max-w-2xl mx-auto">
          <div className="bg-neutral-950/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex flex-col items-center shadow-lg transition-all">
            <Coins className="text-yellow-500 mb-2 w-6 h-6" />
            <span className="text-xl font-black text-white">{profile?.coins || 0}</span>
            <span className="text-[10px] text-neutral-500 font-bold uppercase mt-1">Монети</span>
          </div>
          <div className="bg-neutral-950/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex flex-col items-center shadow-lg transition-all">
            <LayoutGrid className="text-blue-500 mb-2 w-6 h-6" />
            <span className="text-xl font-black text-white">
              {liveStats?.uniqueCardsCount ?? profile?.uniqueCardsCount ?? inventoryCount ?? 0}
            </span>
            <span className="text-[10px] text-neutral-500 font-bold uppercase mt-1">
              Унікальних
            </span>
          </div>
          <div className="bg-neutral-950/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex flex-col items-center shadow-lg transition-all">
            <PackageOpen className="text-purple-500 mb-2 w-6 h-6" />
            <span className="text-xl font-black text-white">
              {liveStats?.packsOpened ?? profile?.packsOpened ?? 0}
            </span>
            <span className="text-[10px] text-neutral-500 font-bold uppercase mt-1">
              Відкрито паків
            </span>
          </div>
          <div className="bg-neutral-950/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex flex-col items-center shadow-lg transition-all">
            <Zap className="text-red-500 mb-2 w-6 h-6" />
            <span className="text-xl font-black text-white">
              {liveStats?.coinsSpentOnPacks ?? profile?.coinsSpentOnPacks ?? 0}
            </span>
            <span className="text-[10px] text-neutral-500 font-bold uppercase mt-1">Витрачено</span>
          </div>
          <div className="bg-neutral-950/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex flex-col items-center shadow-lg transition-all sm:col-span-1 col-span-2">
            <Star className="text-green-500 mb-2 w-6 h-6" />
            <span className="text-xl font-black text-white">
              {liveStats?.coinsEarnedFromPacks ?? profile?.coinsEarnedFromPacks ?? 0}
            </span>
            <span className="text-[10px] text-neutral-500 font-bold uppercase mt-1">Зароблено</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-8">
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 relative overflow-hidden group">
          <h3 className="text-xl font-black text-white mb-2 flex items-center gap-2 relative z-10">
            <Gift className="text-orange-500" /> Щоденна Нагорода
          </h3>
          <button
            onClick={claimDaily}
            disabled={!canClaimDaily || isProcessing}
            className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all relative z-10 ${canClaimDaily
                ? 'bg-gradient-to-r from-orange-600 to-yellow-500 text-yellow-950 shadow-[0_0_20px_rgba(249,115,22,0.4)]'
                : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
              }`}
          >
            {canClaimDaily ? 'Отримати нагороду' : 'Вже отримано (Чекайте завтра)'}
          </button>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 relative overflow-hidden group">
          <h3 className="text-xl font-black text-white mb-2 flex items-center gap-2 relative z-10">
            <Ticket className="text-purple-500" /> Промокоди
          </h3>
          <form onSubmit={redeemPromo} className="flex gap-2 relative z-10">
            <input
              type="text"
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
              placeholder="Код..."
              className="flex-1 bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:border-purple-500 outline-none"
            />
            <button
              type="submit"
              disabled={isProcessing || !promoInput.trim()}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-6 py-3 rounded-xl"
            >
              Ок
            </button>
          </form>
        </div>
      </div>

      {/* ДОСЯГНЕННЯ ГРАВЦЯ */}
      {achievementsCatalog && achievementsCatalog.length > 0 && (
        <div className="max-w-4xl mx-auto mb-8 bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
          <h3 className="text-xl font-black text-white mb-4 flex items-center gap-2">
            <Trophy className="text-yellow-500" /> Усі Досягнення (
            {
              achievementsCatalog.filter((ach) => {
                if (profile?.achievements?.find((ua) => ua.achievementId === ach.id)) return true;
                const pack = packsCatalog.find((p) => p.id === ach.packId);
                if (!pack) return false;
                const totalInPack = cardsCatalog.filter((c) => c.packId === pack.id).length;
                if (totalInPack === 0) return false;
                const userCardsInPack = new Set();
                fullInventory.forEach((inv) => {
                  if (inv.card?.packId === pack.id) userCardsInPack.add(inv.card.id);
                });
                return userCardsInPack.size === totalInPack;
              }).length
            }{' '}
            / {achievementsCatalog.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {achievementsCatalog.map((ach) => {
              let isUnlocked = profile?.achievements?.find((ua) => ua.achievementId === ach.id);
              let progressText = null;

              const pack = packsCatalog.find((p) => p.id === ach.packId);
              if (pack) {
                const packCards = cardsCatalog.filter((c) => c.packId === pack.id);
                const totalInPack = packCards.length;

                const userCardsInPack = new Set();
                fullInventory.forEach((inv) => {
                  const card = inv.card;
                  if (card && card.packId === pack.id) {
                    userCardsInPack.add(card.id);
                  }
                });

                if (!isUnlocked && totalInPack > 0 && userCardsInPack.size === totalInPack) {
                  isUnlocked = { createdAt: null }; // Динамічно розблоковано
                }

                if (!isUnlocked) {
                  progressText = `${userCardsInPack.size} / ${totalInPack}`;
                }
              }

              return (
                <div
                  key={ach.id}
                  className={`bg-neutral-950 border ${isUnlocked ? 'border-yellow-900/40' : 'border-neutral-800 opacity-50 grayscale'} rounded-xl p-3 flex flex-col items-center text-center relative group overflow-hidden`}
                >
                  {isUnlocked ? (
                    <div className="absolute inset-0 bg-yellow-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  ) : (
                    <div className="absolute inset-0 bg-neutral-900/40 z-10 flex flex-col items-center justify-center transition-opacity opacity-0 group-hover:opacity-100 gap-1">
                      <div className="bg-black/80 text-white text-[10px] px-2 py-1 flex items-center gap-1 rounded font-bold">
                        <Lock size={10} /> Заблоковано
                      </div>
                      {progressText && (
                        <div className="bg-black/80 text-yellow-500 text-[10px] px-2 py-1 rounded font-bold">
                          {progressText}
                        </div>
                      )}
                    </div>
                  )}
                  <AchievementIcon
                    iconUrl={ach.iconUrl}
                    className="w-16 h-16 rounded-lg mb-2"
                    size={32}
                  />
                  <div
                    className="text-xs font-bold text-white mb-1 line-clamp-1 w-full"
                    title={ach.name}
                  >
                    {ach.name}
                  </div>
                  <div
                    className="text-[9px] text-neutral-400 line-clamp-2 leading-tight"
                    title={ach.description}
                  >
                    {ach.description}
                  </div>
                  {isUnlocked && (
                    <div className="text-[8px] text-yellow-600/60 mt-2">
                      {isUnlocked.createdAt ? formatDate(isUnlocked.createdAt) : 'Зібрано'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* КНОПКИ-ВІКНА */}
      <div className="flex flex-col sm:flex-row gap-4 max-w-4xl mx-auto mb-6">
        <button
          onClick={() => setActiveTab('history')}
          className="flex-1 bg-neutral-900 border border-neutral-800 hover:border-yellow-600/50 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 transition-all group shadow-md"
        >
          <Store size={36} className="text-yellow-500 group-hover:scale-110 transition-transform" />
          <span className="text-lg font-black text-white">Історія Ринку</span>
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className="flex-1 bg-neutral-900 border border-neutral-800 hover:border-blue-600/50 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 transition-all group shadow-md"
        >
          <Settings
            size={36}
            className="text-blue-500 group-hover:scale-110 transition-transform"
          />
          <span className="text-lg font-black text-white">Налаштування</span>
        </button>
      </div>
    </div>
  );
}
