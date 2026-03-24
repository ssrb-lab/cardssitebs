const API_URL = import.meta.env.VITE_API_URL || '/api';


export const safeFetch = async (url, options) => {
  try {
    const res = await window.fetch(url, options);
    res.json = async () => {
      const text = await res.text();
      try {
        return text ? JSON.parse(text) : {};
      } catch (e) {
        throw new Error(`Мережева помилка (Код: ${res.status}). Сервер повернув некоректну відповідь.`);
      }
    };
    return res;
  } catch (error) {
    throw new Error(`Помилка з'єднання з сервером. Перевірте інтернет.`);
  }
};


export const loginUser = async (email, password) => {
  const res = await safeFetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Помилка входу');
  return data;
};

export const registerUser = async (nickname, email, password) => {
  const res = await safeFetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname, email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Помилка реєстрації');
  return data;
};

export const googleLoginRequest = async (credential) => {
  const res = await safeFetch(`${API_URL}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Помилка входу через Google');
  return data;
};

// Збереження та отримання токена
export const setToken = (token) => localStorage.setItem('token', token);
export const getToken = () => localStorage.getItem('token');
export const removeToken = () => localStorage.removeItem('token');

// --- СПОВІЩЕННЯ ---
export const fetchNotifications = async (token) => {
  const res = await safeFetch(`${API_URL}/notifications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const markNotificationRead = async (token, notifId) => {
  const res = await safeFetch(`${API_URL}/notifications/${notifId}/read`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
};

export const claimNotificationGift = async (token, notifId) => {
  const res = await safeFetch(`${API_URL}/notifications/${notifId}/claim`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const sendAdminNotification = async (token, notificationData) => {
  const res = await safeFetch(`${API_URL}/admin/notifications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(notificationData),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

// --- КАТАЛОГ ТА АДМІНКА ---
export const fetchCatalog = async () => {
  const res = await safeFetch(`${API_URL}/catalog`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const saveCardToDb = async (token, cardData) => {
  let body;
  let headers = { Authorization: `Bearer ${token}` };

  if (cardData.imageFile) {
    const formData = new FormData();
    formData.append('imageFile', cardData.imageFile);
    // Remove imageFile from cardData before sending as JSON string
    const { imageFile, ...restData } = cardData;
    formData.append('data', JSON.stringify(restData));
    body = formData;
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(cardData);
  }

  const res = await safeFetch(`${API_URL}/admin/cards`, {
    method: 'POST',
    headers,
    body,
  });
  return res.json();
};

export const deleteCardFromDb = async (token, cardId) => {
  const res = await safeFetch(`${API_URL}/admin/cards/${cardId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
};

export const savePackToDb = async (token, packData) => {
  let body;
  let headers = { Authorization: `Bearer ${token}` };

  if (packData.imageFile) {
    const formData = new FormData();
    formData.append('imageFile', packData.imageFile);
    const { imageFile, ...restData } = packData;
    formData.append('data', JSON.stringify(restData));
    body = formData;
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(packData);
  }

  const res = await safeFetch(`${API_URL}/admin/packs`, {
    method: 'POST',
    headers,
    body,
  });
  return res.json();
};

export const deletePackFromDb = async (token, packId) => {
  const res = await safeFetch(`${API_URL}/admin/packs/${packId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
};

export const openPackRequest = async (token, packId, amount, currency = 'coins') => {
  const res = await safeFetch(`${API_URL}/game/open-pack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ packId, amount, currency }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Помилка відкриття паку');
  return data;
};

export const sellCardsRequest = async (token, items) => {
  const res = await safeFetch(`${API_URL}/game/sell-cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ items }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Помилка продажу');
  return data;
};

export const toggleSafeRequest = async (token, cardId, statsIndex, amount, isSafe) => {
  const res = await safeFetch(`${API_URL}/game/inventory/safe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ cardId, statsIndex, amount, isSafe }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Помилка сейфу');
  return data;
};
export const levelUpCardRequest = async (token, cardId, statsIndex) => {
  const response = await safeFetch(`${API_URL}/game/forge/levelup`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cardId, statsIndex }),
  });
  return response.json();
};

// --- CRASH ---
export const fetchCrashState = async (token) => {
  const res = await safeFetch(`${API_URL}/game/crash/state`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Помилка завантаження стану Crash');
  return data;
};

export const placeCrashBet = async (token, betAmount) => {
  const res = await safeFetch(`${API_URL}/game/crash/bet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ betAmount }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Помилка ставки в Crash');
  return data;
};

export const cashOutCrash = async (token) => {
  const res = await safeFetch(`${API_URL}/game/crash/cashout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Помилка виведення коштів з Crash');
  return data;
};

// --- РИНОК ---
export const fetchMarket = async () => {
  const res = await safeFetch(`${API_URL}/game/market`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const listCardRequest = async (token, cardId, price, power = null, hp = null) => {
  const res = await safeFetch(`${API_URL}/game/market/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ cardId, price, power, hp }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const buyCardRequest = async (token, listingId) => {
  const res = await safeFetch(`${API_URL}/game/market/buy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ listingId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const listDuplicatesRequest = async (token, cardId, amount, priceTotal) => {
  const res = await safeFetch(`${API_URL}/game/market/list-duplicates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ cardId, amount, priceTotal }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const cancelListingRequest = async (token, listingId) => {
  const res = await safeFetch(`${API_URL}/game/market/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ listingId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

// --- ФАРМ (БОСИ) ---
export const fetchFarmState = async (token) => {
  const res = await safeFetch(`${API_URL}/game/farm/state`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
};

export const syncFarmHitRequest = async (token, bossId, damageDone, maxHp) => {
  const res = await safeFetch(`${API_URL}/game/farm/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ bossId, damageDone, maxHp }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error); // Обов'язкова зупинка при помилці!
  return data;
};

export const claimFarmRewardRequest = async (token, bossId) => {
  const res = await safeFetch(`${API_URL}/game/farm/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ bossId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const adminResetCdRequest = async (token, targetUid, maxHp) => {
  const res = await safeFetch(`${API_URL}/admin/farm/reset-cd`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ targetUid, maxHp }),
  });
  return res.json();
};

// --- НАЛАШТУВАННЯ ТА ПРОМОКОДИ ---
export const fetchSettings = async () => {
  const res = await safeFetch(`${API_URL}/game/settings`);
  return res.json();
};

export const saveSettingsRequest = async (token, settingsData) => {
  const res = await safeFetch(`${API_URL}/admin/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(settingsData),
  });
  return res.json();
};

export const fetchPromosRequest = async (token) => {
  const res = await safeFetch(`${API_URL}/admin/promos`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Помилка');
  return data;
};

export const savePromoRequest = async (token, promoData) => {
  const res = await safeFetch(`${API_URL}/admin/promos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(promoData),
  });
  return res.json();
};

export const deletePromoRequest = async (token, code) => {
  const res = await safeFetch(`${API_URL}/admin/promos/${code}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
};

export const usePromoRequest = async (token, code) => {
  const res = await safeFetch(`${API_URL}/game/promos/use`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const claimDailyRequest = async (token) => {
  const res = await safeFetch(`${API_URL}/game/daily-claim`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const updateAvatarRequest = async (token, url) => {
  const res = await safeFetch(`${API_URL}/profile/update-avatar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ avatarUrl: url }),
  });
  return res.json();
};

export const uploadAvatarRequest = async (token, file) => {
  const formData = new FormData();
  formData.append('avatar', file);

  const res = await safeFetch(`${API_URL}/profile/upload-avatar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const uploadBannerRequest = async (token, file) => {
  const formData = new FormData();
  formData.append('banner', file);

  const res = await safeFetch(`${API_URL}/admin/upload-banner`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const equipBannerRequest = async (token, bannerUrl) => {
  const res = await safeFetch(`${API_URL}/profile/equip-banner`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ bannerUrl }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const equipPlateRequest = async (token, plateUrl) => {
  const res = await safeFetch(`${API_URL}/profile/equip-plate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ plateUrl }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const fetchLeaderboard = async () => {
  const res = await safeFetch(`${API_URL}/game/leaderboard`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const buyPremiumRequest = async (token) => {
  const res = await safeFetch(`${API_URL}/game/buy-premium`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const setMainShowcaseRequest = async (token, showcaseId) => {
  const res = await safeFetch(`${API_URL}/profile/main-showcase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ showcaseId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

// --- АДМІНКА: ГРАВЦІ ---
export const fetchAdminUsers = async (token) => {
  const res = await safeFetch(`${API_URL}/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Помилка');
  return data;
};

export const fetchAdminUserInventory = async (token, targetUid) => {
  const res = await safeFetch(`${API_URL}/admin/users/${targetUid}/inventory`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Помилка');
  return data;
};

export const adminUserActionRequest = async (token, action, targetUid, payload = {}) => {
  const res = await safeFetch(`${API_URL}/admin/users/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, targetUid, payload }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const fetchPublicProfileRequest = async (uid) => {
  const res = await safeFetch(`${API_URL}/profile/public/${uid}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const changePasswordRequest = async (token, oldPassword, newPassword) => {
  const res = await safeFetch(`${API_URL}/profile/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ oldPassword, newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Помилка зміни пароля');
  return data;
};

export const createShowcaseRequest = async (token, name) => {
  const res = await safeFetch(`${API_URL}/profile/showcases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const deleteShowcaseRequest = async (token, showcaseId) => {
  const res = await safeFetch(`${API_URL}/profile/showcases/${showcaseId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const saveShowcaseCardsRequest = async (token, showcaseId, cardIds) => {
  const res = await safeFetch(`${API_URL}/profile/showcases/${showcaseId}/cards`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ cardIds }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const changeNicknameRequest = async (token, newNickname) => {
  const res = await safeFetch(`${API_URL}/profile/change-nickname`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ newNickname }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const buyPremiumItemRequest = async (token, item) => {
  const res = await safeFetch(`${API_URL}/game/premium-shop/buy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ item }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const createAdminLogRequest = async (token, type, details) => {
  await safeFetch(`${API_URL}/admin/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ type, details }),
  });
};

export const fetchAdminLogsRequest = async (token) => {
  const res = await safeFetch(`${API_URL}/admin/logs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Помилка');
  return data;
};

export const clearAdminLogsRequest = async (token) => {
  await safeFetch(`${API_URL}/admin/logs`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
};

export const claim2048RewardRequest = async (token, score, adBonus = false) => {
  const res = await safeFetch(`${API_URL}/game/2048/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ score, adBonus }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const start2048GameRequest = async (token) => {
  const res = await safeFetch(`${API_URL}/game/2048/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const claimTetrisRewardRequest = async (token, score, adBonus = false) => {
  const res = await safeFetch(`${API_URL}/game/tetris/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ score, adBonus }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const startTetrisGameRequest = async (token) => {
  const res = await safeFetch(`${API_URL}/game/tetris/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const claimFuseRewardRequest = async (token, score) => {
  const res = await safeFetch(`${API_URL}/game/fuse/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ score }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const startFuseGameRequest = async (token) => {
  const res = await safeFetch(`${API_URL}/game/fuse/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const startBlackjackGameRequest = async (token, betAmount) => {
  const res = await safeFetch(`${API_URL}/game/blackjack/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ betAmount }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const hitBlackjackRequest = async (token) => {
  const res = await safeFetch(`${API_URL}/game/blackjack/hit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const standBlackjackRequest = async (token) => {
  const res = await safeFetch(`${API_URL}/game/blackjack/stand`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const getBlackjackStateRequest = async (token) => {
  const res = await safeFetch(`${API_URL}/game/blackjack/state`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

// --- CRASH ---
export const startCrashGameRequest = async (token, betAmount) => {
  const res = await safeFetch(`${API_URL}/game/crash/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ betAmount }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const claimCrashRewardRequest = async (token, gameId, multiplier) => {
  const res = await safeFetch(`${API_URL}/game/crash/cashout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ gameId, multiplier }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const pollCrashStatusRequest = async (token, gameId) => {
  const res = await safeFetch(`${API_URL}/game/crash/${gameId}/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const fetchMarketHistoryRequest = async (token) => {
  const res = await safeFetch(`${API_URL}/profile/market-history`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
};

export const clearMyMarketHistoryRequest = async (token) => {
  const res = await safeFetch(`${API_URL}/profile/market-history`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
};

export const adminClearUserMarketHistoryRequest = async (token, targetUid) => {
  const res = await safeFetch(`${API_URL}/admin/users/${targetUid}/market-history`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
};

export const adminClearAllMarketHistoryRequest = async (token) => {
  const res = await safeFetch(`${API_URL}/admin/market-history`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
};

// --- GAME STATUS (ADMIN & PUBLIC) ---
export const fetchGameStatuses = async () => {
  const res = await safeFetch(`${API_URL}/games/status`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const adminToggleGameStatus = async (token, gameName) => {
  const res = await safeFetch(`${API_URL}/admin/games/toggle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ game: gameName }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

// --- ACHIEVEMENTS ---
export const fetchAdminAchievements = async (token) => {
  const res = await safeFetch(`${API_URL}/admin/achievements`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
};

export const saveAchievementSettingsRequest = async (token, achievementData) => {
  const res = await safeFetch(`${API_URL}/admin/achievements`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(achievementData),
  });
  return res.json();
};

export const deleteAchievementSettingsRequest = async (token, id) => {
  const res = await safeFetch(`${API_URL}/admin/achievements/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
};

// --- ARENA MAP POINTS ---
export const fetchArenaPointsRequest = async (token) => {
  const res = await safeFetch(`${API_URL}/game/arena/points`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const createArenaPointRequest = async (token, pointData) => {
  const res = await safeFetch(`${API_URL}/admin/arena/points`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(pointData),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const updateArenaPointRequest = async (token, pointId, pointData) => {
  const res = await safeFetch(`${API_URL}/admin/arena/points/${pointId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(pointData),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const deleteArenaPointRequest = async (token, pointId) => {
  const res = await safeFetch(`${API_URL}/admin/arena/points/${pointId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const captureArenaPointRequest = async (token, pointId, cards = [], expectedOwnerId = null) => {
  const res = await safeFetch(`${API_URL}/game/arena/points/${pointId}/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ cards, expectedOwnerId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const battleArenaPointRequest = async (token, pointId, cards = [], expectedOwnerId = null) => {
  const res = await safeFetch(`${API_URL}/game/arena/points/${pointId}/battle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ cards, expectedOwnerId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const swapArenaCardsRequest = async (token, pointId, cards = []) => {
  const res = await safeFetch(`${API_URL}/game/arena/points/${pointId}/swap-cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ cards }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const claimArenaCrystalsRequest = async (token, pointId) => {
  const res = await safeFetch(`${API_URL}/game/arena/points/${pointId}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

// --- СМАРАГДИ ---
export const fetchEmeraldInfo = async (token) => {
  const res = await safeFetch(`${API_URL}/game/emerald-info`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const openEmeraldBoxRequest = async (token) => {
  const res = await safeFetch(`${API_URL}/game/open-emerald-box`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const installEmeraldRequest = async (token, cardId, statsIndex, emeraldTypeId) => {
  const res = await safeFetch(`${API_URL}/game/install-emerald`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ cardId, statsIndex, emeraldTypeId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const removeEmeraldRequest = async (token, cardId, statsIndex) => {
  const res = await safeFetch(`${API_URL}/game/remove-emerald`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ cardId, statsIndex }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const fetchAdminEmeraldTypes = async (token) => {
  const res = await safeFetch(`${API_URL}/admin/emerald-types`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const saveEmeraldTypeRequest = async (token, typeData) => {
  const res = await safeFetch(`${API_URL}/admin/emerald-types`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(typeData),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const deleteEmeraldTypeRequest = async (token, id) => {
  const res = await safeFetch(`${API_URL}/admin/emerald-types/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const fetchAdminEmeraldSettings = async (token) => {
  const res = await safeFetch(`${API_URL}/admin/emerald-settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const saveEmeraldSettingsRequest = async (token, settings) => {
  const res = await safeFetch(`${API_URL}/admin/emerald-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(settings),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

// --- ЗАЯВКИ НА ВЛАСНИЙ ПАК ---
export const submitPackRequestApi = async (token, name, contact, message) => {
  const res = await safeFetch(`${API_URL}/pack-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, contact, message }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const getMyPackRequestsCount = async (token) => {
  const res = await safeFetch(`${API_URL}/pack-requests/my`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const fetchAdminPackRequests = async (token) => {
  const res = await safeFetch(`${API_URL}/admin/pack-requests`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const reviewPackRequestApi = async (token, id) => {
  const res = await safeFetch(`${API_URL}/admin/pack-requests/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const deletePackRequestApi = async (token, id) => {
  const res = await safeFetch(`${API_URL}/admin/pack-requests/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

// --- РЕМОНТ КАРТОК ---
export const repairCardRequest = async (token, cardId, statsIndex, currency) => {
  const res = await safeFetch(`${API_URL}/game/repair-card`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ cardId, statsIndex, currency }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};
