import React, { useState, useRef } from 'react';
import { Gem, CheckCircle2, Edit2, Coins, Star, Eye, Trash2, X, Swords, Ban } from 'lucide-react';
import PlayerAvatar from '../components/PlayerAvatar';
import {
  buyPremiumRequest,
  getToken,
  changeNicknameRequest,
  buyPremiumItemRequest,
} from '../config/api';
import { formatDate } from '../utils/helpers';

export default function PremiumShopView({
  profile,
  setProfile,
  cardStats,
  user,
  db,
  appId,
  premiumPrice,
  premiumDurationDays,
  premiumShopItems,
  showToast,
  isProcessing,
  setIsProcessing,
  addSystemLog,
  isPremiumActive,
  cardsCatalog,
  rarities,
  setViewingCard,
}) {
  const [newNickname, setNewNickname] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [previewBadge, setPreviewBadge] = useState(null);

  let userBanners = [];
  try {
    if (profile?.ownedBanners) {
      if (Array.isArray(profile.ownedBanners)) {
        userBanners = profile.ownedBanners;
      } else if (typeof profile.ownedBanners === 'string') {
        userBanners = JSON.parse(profile.ownedBanners);
      }
    }
  } catch (e) {
    console.error('Failed to parse ownedBanners', e);
  }

  // БРОНЬОВАНИЙ ЗАМОК ВІД АВТОКЛІКЕРІВ
  const actionLock = useRef(false);

  const handleBuyPremium = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const data = await buyPremiumRequest(getToken());
      setProfile(data.profile); // Оновлюємо профіль, монети знімуться миттєво
      showToast('Преміум успішно придбано!', 'success');
      if (addSystemLog) addSystemLog('Магазин', `Гравець ${profile.nickname} придбав Преміум`);
    } catch (e) {
      showToast(e.message || 'Помилка покупки.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNicknameChange = async (e) => {
    e.preventDefault();
    if (actionLock.current || isProcessing) return;

    const nn = newNickname.trim();
    if (!nn) return showToast('Введіть новий нікнейм!');

    actionLock.current = true;
    setIsProcessing(true);
    try {
      const data = await changeNicknameRequest(getToken(), nn);
      setProfile(data.profile);
      showToast('Мій лорд, ваш нікнейм успішно змінено!', 'success');
      if (addSystemLog) addSystemLog('Магазин', `Гравець змінив нікнейм на ${nn} за 100000 монет.`);
      setNewNickname('');
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Помилка зміни нікнейму.');
    } finally {
      actionLock.current = false;
      setIsProcessing(false);
    }
  };

  const buyItem = async (item) => {
    if (actionLock.current || isProcessing) return;
    actionLock.current = true;
    setIsProcessing(true);
    try {
      const data = await buyPremiumItemRequest(getToken(), item);
      setProfile(data.profile);
      showToast(`Ви успішно придбали ${item.name || 'товар'}!`, 'success');
      if (addSystemLog)
        addSystemLog(
          'Магазин',
          `Гравець ${profile.nickname} купив ексклюзив за ${item.price} монет.`
        );
    } catch (e) {
      console.error(e);
      showToast(e.message || 'Помилка під час покупки товару.');
    } finally {
      actionLock.current = false;
      setIsProcessing(false);
    }
  };

  return (
    <div className="pb-10 animate-in fade-in zoom-in-95 duration-500">
      <div className="text-center mb-6 sm:mb-10">
        <h2 className="text-2xl sm:text-4xl font-black mb-2 text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-purple-600 uppercase tracking-widest flex items-center justify-center gap-3">
          <Gem className="text-fuchsia-500 w-7 h-7 sm:w-10 sm:h-10" /> Преміум Магазин
        </h2>
        <p className="text-neutral-400">Ексклюзивні пропозиції для елітних лордів.</p>
      </div>

      {premiumShopItems && premiumShopItems.length > 0 && (
        <div className="mb-12">
          <h3 className="text-xl sm:text-2xl font-black text-white text-center mb-4 sm:mb-8 uppercase tracking-widest flex items-center justify-center gap-2">
            <Star className="text-fuchsia-500" /> Ексклюзивні Товари
          </h3>
          <div className="flex flex-wrap justify-center gap-2 mb-4 sm:mb-8">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-4 py-2 rounded-full font-bold text-sm transition-colors ${activeFilter === 'all' ? 'bg-fuchsia-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}
            >
              Всі
            </button>
            <button
              onClick={() => setActiveFilter('banner')}
              className={`px-4 py-2 rounded-full font-bold text-sm transition-colors ${activeFilter === 'banner' ? 'bg-fuchsia-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}
            >
              Банери
            </button>
            <button
              onClick={() => setActiveFilter('plate')}
              className={`px-4 py-2 rounded-full font-bold text-sm transition-colors ${activeFilter === 'plate' ? 'bg-fuchsia-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}
            >
              Бейджі
            </button>
            <button
              onClick={() => setActiveFilter('card')}
              className={`px-4 py-2 rounded-full font-bold text-sm transition-colors ${activeFilter === 'card' ? 'bg-fuchsia-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}
            >
              Прикраси аватару
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6 max-w-5xl mx-auto">
            {premiumShopItems
              .filter((item) => activeFilter === 'all' || item.type === activeFilter)
              .map((item, idx) => {
              let cDef = null;
              if (item.type === 'card') {
                cDef = cardsCatalog.find((c) => c.id === item.itemId);
              }

              const isOwnedBanner = item.type === 'banner' && userBanners.includes(item.image);

              let userPlates = [];
              try {
                if (profile?.ownedPlates) {
                  if (Array.isArray(profile.ownedPlates)) {
                    userPlates = profile.ownedPlates;
                  } else if (typeof profile.ownedPlates === 'string') {
                    userPlates = JSON.parse(profile.ownedPlates);
                  }
                }
              } catch (e) { }
              const isOwnedPlate = item.type === 'plate' && userPlates.includes(item.image);
              const isOwned = isOwnedBanner || isOwnedPlate;

              const isBanner = item.type === 'banner';
              const isPlate = item.type === 'plate';
              const isMedia = isBanner || isPlate;
              const isVideo = isPlate && item.image && item.image.match(/\.(mp4|webm|mov)$/i);

              return (
                <div
                  key={idx}
                  className="bg-neutral-900 border border-neutral-800 rounded-3xl p-3 sm:p-6 flex flex-col items-center justify-between relative group hover:border-fuchsia-900 transition-colors shadow-lg"
                  onMouseEnter={(e) => { const v = e.currentTarget.querySelector('video'); if(v) v.play().catch(()=>{}); }}
                  onMouseLeave={(e) => { const v = e.currentTarget.querySelector('video'); if(v) { v.pause(); v.currentTime = 0; } }}
                >
                  {!isPremiumActive && (
                    <div className="absolute inset-0 bg-neutral-950/80 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center rounded-3xl border-2 border-neutral-800">
                      <Gem className="text-fuchsia-900/50 w-16 h-16 mb-2" />
                      <span className="font-bold text-neutral-500 uppercase tracking-widest text-sm">
                        Тільки для Преміум
                      </span>
                    </div>
                  )}

                  <div className="text-[10px] text-fuchsia-400 font-bold uppercase tracking-widest text-center mb-1">
                    {isPlate ? 'Бейдж' : isBanner ? 'Банер' : 'Ексклюзив'}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2 text-center w-full">
                    {isMedia ? (item.description || (isPlate ? 'Бейдж для рейтингу' : 'Ексклюзивний Банер')) : (cDef ? cDef.name : 'Невідомий товар')}
                  </h3>

                  <div 
                    className={`relative ${isPlate ? 'w-full aspect-[5/1]' : isMedia ? 'w-full aspect-[2/1]' : 'w-32 aspect-[2/3]'} mb-6 flex justify-center items-center shadow-xl rounded-xl overflow-hidden border-2 border-fuchsia-500/50 bg-black/20`}
                  >
                    {isVideo ? (
                      <video
                        src={item.image}
                        className={`w-full h-full ${isPlate ? 'object-contain object-center' : 'object-cover'} transition-opacity duration-300 ${isOwned ? 'opacity-40 grayscale-[0.3]' : 'opacity-100'}`}
                        muted loop playsInline
                      />
                    ) : (
                      <img
                        src={isMedia ? item.image : (cDef ? cDef.image : '')}
                        alt="item"
                        className={`w-full h-full ${isPlate ? 'object-contain object-center' : 'object-cover'} transition-opacity duration-300 ${isOwned ? 'opacity-40 grayscale-[0.3]' : 'opacity-100'}`}
                        loading="lazy"
                      />
                    )}
                    {isOwned && (
                      <div className="absolute top-6 -right-12 transform rotate-45 bg-yellow-500 text-yellow-950 font-black py-1.5 w-44 text-center shadow-lg z-30 tracking-widest text-[10px] flex items-center justify-center leading-none">
                        ПРИДБАНО
                      </div>
                    )}
                    {cDef && (
                      <button
                        onClick={() => setViewingCard({ card: cDef, amount: 1 })}
                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity z-10"
                      >
                        <Eye className="text-white w-8 h-8" />
                      </button>
                    )}
                    {isPlate && (
                      <button
                        onClick={() => setPreviewBadge(item)}
                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity z-10"
                        title="Попередній перегляд"
                      >
                        <Eye className="text-white w-8 h-8" />
                      </button>
                    )}
                  </div>

                  {!isMedia && (
                    <div className="text-center text-sm text-neutral-400 mb-4 h-10 overflow-hidden line-clamp-2">
                      {item.description}
                    </div>
                  )}

                  {isOwned ? (
                    <button
                      disabled
                      className="w-full py-3 rounded-xl font-black text-neutral-500 bg-neutral-800 border border-neutral-700 cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      Придбано
                    </button>
                  ) : (
                    <button
                      onClick={() => buyItem(item)}
                      className="w-full py-3 rounded-xl font-black text-white bg-blue-600 hover:bg-blue-500 flex items-center justify-center gap-2 transition-all"
                    >
                      Купити за {item.price} {item.currency === 'crystals' ? <Gem size={16} className="text-fuchsia-400" /> : <Coins size={16} />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-gradient-to-br from-neutral-900 to-neutral-900 border-2 border-neutral-800 rounded-3xl p-4 sm:p-10 max-w-4xl mx-auto shadow-2xl mb-12 relative overflow-hidden">
        {/* Decorative gradient top edge */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-fuchsia-600 via-purple-600 to-blue-600"></div>
        {/* Optional glowing backgrounds */}
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-fuchsia-600/10 blur-[100px] rounded-full pointer-events-none"></div>
        <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-blue-600/10 blur-[100px] rounded-full pointer-events-none"></div>

        <div className="relative z-10">
          {/* Top Section */}
          <div className="flex flex-col items-center mb-10">
            <Gem
              size={40}
              className="mx-auto text-fuchsia-400 mb-4 sm:mb-6 sm:!w-[60px] sm:!h-[60px] drop-shadow-[0_0_20px_rgba(217,70,239,0.5)] animate-pulse"
            />
            <h3 className="text-2xl sm:text-3xl font-black text-white mb-6 text-center">
              Преміум Акаунт ({premiumDurationDays} Днів)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-left w-full max-w-3xl px-4">
              <div className="flex items-center gap-3 text-neutral-200">
                <CheckCircle2 className="text-fuchsia-500 shrink-0" size={20} />
                <span>Ексклюзивна іконка у профілі та рейтингу</span>
              </div>
              <div className="flex items-center gap-3 text-neutral-200">
                <CheckCircle2 className="text-fuchsia-500 shrink-0" size={20} />
                <span>Підвищені щоденні нагороди (+200% в середньому)</span>
              </div>
              <div className="flex items-center gap-3 text-neutral-200">
                <CheckCircle2 className="text-fuchsia-500 shrink-0" size={20} />
                <span>Доступ до Преміум-паків у магазині</span>
              </div>
              <div className="flex items-center gap-3 text-neutral-200">
                <CheckCircle2 className="text-fuchsia-500 shrink-0" size={20} />
                <span>Доступ до унікальних карток нижче</span>
              </div>
            </div>
          </div>

          <div className="h-px w-full bg-gradient-to-r from-transparent via-neutral-700 to-transparent mb-8"></div>

          {/* Bottom Section */}
          <div className="flex flex-col md:flex-row items-stretch justify-between gap-3 sm:gap-8 md:gap-6">

            {/* Buy Premium */}
            <div className="w-full md:w-[48%] flex flex-col justify-end">
              {isPremiumActive ? (
                <div className="bg-fuchsia-900/30 border border-fuchsia-500/50 p-3 rounded-xl text-fuchsia-100 font-bold mb-4 text-center">
                  Ваш преміум активний до: {formatDate(profile.premiumUntil)}
                </div>
              ) : null}
              <button
                onClick={handleBuyPremium}
                disabled={isProcessing}
                className="w-full bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white font-black text-base sm:text-lg py-3 sm:py-4 px-4 sm:px-6 rounded-2xl shadow-xl transition-transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              >
                {isPremiumActive ? `Продовжити ще на ${premiumDurationDays} днів` : 'Придбати Преміум'}
                <span className="bg-black/30 px-3 py-1 rounded-lg text-sm flex items-center gap-1">
                  {premiumPrice} <Coins size={16} />
                </span>
              </button>
            </div>

            {/* Vertical Divider for Desktop */}
            <div className="hidden md:flex flex-col justify-end pb-4">
              <div className="w-px h-24 bg-gradient-to-b from-transparent via-neutral-700 to-transparent"></div>
            </div>

            {/* Change Nickname */}
            <div className="w-full md:w-[48%] flex flex-col justify-end">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
                <Edit2 size={24} className="text-blue-400 drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]" />
                <h3 className="text-xl font-bold text-white">Зміна Нікнейму</h3>
              </div>
              <p className="text-neutral-400 text-sm mb-4 text-center md:text-left">
                Бажаєте нове ім'я, Мій лорд? Унікальне ім'я коштує 100,000 монет.
              </p>

              <form
                onSubmit={handleNicknameChange}
                className="flex gap-2 w-full"
              >
                <input
                  type="text"
                  value={newNickname}
                  onChange={(e) => setNewNickname(e.target.value)}
                  placeholder="Новий нікнейм"
                  required
                  className="flex-1 min-w-0 bg-neutral-950 border border-neutral-700 rounded-2xl px-4 py-4 text-white focus:border-blue-500 outline-none transition-colors"
                />
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 sm:px-6 rounded-2xl transition-transform hover:scale-105 disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  Купити
                  <span className="bg-black/30 px-2 py-1 rounded-lg text-xs flex items-center gap-1">
                    100k <Coins size={12} />
                  </span>
                </button>
              </form>
            </div>

          </div>
        </div>
      </div>


      {/* МОДАЛКА ПЕРЕГЛЯДУ БЕЙДЖА */}
      {previewBadge && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setPreviewBadge(null)}
          />
          <div className="relative bg-neutral-900 border border-fuchsia-500/50 rounded-3xl p-3 sm:p-8 w-full max-w-4xl shadow-2xl animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setPreviewBadge(null)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
            <h3 className="text-2xl font-black text-white text-center mb-2 uppercase tracking-widest">
              Прев'ю Бейджа
            </h3>
            <p className="text-neutral-400 text-center mb-8 text-sm">
              Ось так виглядатиме ваш профіль у Залі Слави:
            </p>

            {/* МАКЕТ РЯДКА ЛІДЕРБОРДУ */}
            <div className="bg-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl max-w-4xl mx-auto">
              <div className="flex items-center justify-between p-2 sm:p-4 border-l-4 border-l-yellow-500 relative overflow-hidden group">
                {/* Бейдж — фон */}
                {previewBadge.image && previewBadge.image.match(/\.(mp4|webm|mov)$/i) ? (
                  <video
                    src={previewBadge.image}
                    className="absolute left-[47%] top-0 h-full w-auto opacity-40 pointer-events-none z-0"
                    muted autoPlay loop playsInline
                  />
                ) : (
                  <img
                    src={previewBadge.image}
                    className="absolute left-[47%] top-0 h-full w-auto opacity-40 pointer-events-none z-0"
                    alt=""
                  />
                )}

                <div className="flex items-center gap-2 sm:gap-4 overflow-hidden relative z-[1]">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center font-black text-sm sm:text-lg rounded-xl border bg-yellow-500 text-yellow-950 border-yellow-400 shrink-0">
                    1
                  </div>
                  <PlayerAvatar
                    profile={profile}
                    className="w-8 h-8 sm:w-10 sm:h-10 rounded-full shrink-0"
                    iconSize={16}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-white flex items-center gap-1 sm:gap-2 text-sm sm:text-lg">
                      <span className="truncate">{profile.nickname}</span>
                      {isPremiumActive && (
                        <Gem
                          size={14}
                          className="text-fuchsia-400 fill-fuchsia-400 shrink-0 sm:w-4 sm:h-4"
                          title="Преміум"
                        />
                      )}
                      <span className="bg-red-900/40 text-red-400 text-[10px] sm:text-xs px-1 sm:px-2 py-0.5 rounded-lg border border-red-800 flex items-center gap-1 shrink-0">
                        <Swords size={12} /> {profile.farmLevel || 1}
                      </span>
                      <span className="text-[10px] bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded-full shrink-0 hidden sm:inline-block">
                        ВИ
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right flex flex-col items-end gap-1 relative z-[1]">
                  <div className="text-[10px] sm:text-xs font-bold text-neutral-500 uppercase tracking-widest hidden sm:block">
                    Унікальні Карти
                  </div>
                  <div className="font-black text-xl sm:text-2xl text-blue-400 flex items-center gap-1 sm:gap-2 justify-end">
                    <span>123</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-8 flex justify-center">
               <button
                 onClick={() => setPreviewBadge(null)}
                 className="px-8 py-3 rounded-xl font-bold text-white bg-neutral-800 hover:bg-neutral-700 transition-colors"
               >
                 Закрити
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
