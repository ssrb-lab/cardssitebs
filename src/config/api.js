const API_URL = 'https://cardgameapp.space/api';

export const loginUser = async (email, password) => {
    const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка входу');
    return data;
};

export const registerUser = async (nickname, email, password) => {
    const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname, email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка реєстрації');
    return data;
};

export const googleLoginRequest = async (credential) => {
    const res = await fetch(`${API_URL}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка входу через Google');
    return data;
};

// Збереження та отримання токена
export const setToken = (token) => localStorage.setItem('token', token);
export const getToken = () => localStorage.getItem('token');
export const removeToken = () => localStorage.removeItem('token');

// --- КАТАЛОГ ТА АДМІНКА ---
export const fetchCatalog = async () => {
    const res = await fetch(`${API_URL}/catalog`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
};

export const saveCardToDb = async (token, cardData) => {
    const res = await fetch(`${API_URL}/admin/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(cardData)
    });
    return res.json();
};

export const deleteCardFromDb = async (token, cardId) => {
    const res = await fetch(`${API_URL}/admin/cards/${cardId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.json();
};

export const savePackToDb = async (token, packData) => {
    const res = await fetch(`${API_URL}/admin/packs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(packData)
    });
    return res.json();
};

export const deletePackFromDb = async (token, packId) => {
    const res = await fetch(`${API_URL}/admin/packs/${packId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.json();
};

export const openPackRequest = async (token, packId, amount) => {
    const res = await fetch(`${API_URL}/game/open-pack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ packId, amount })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка відкриття паку');
    return data;
};

export const sellCardsRequest = async (token, items) => {
    const res = await fetch(`${API_URL}/game/sell-cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ items })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка продажу');
    return data;
};

// --- РИНОК ---
export const fetchMarket = async () => {
    const res = await fetch(`${API_URL}/game/market`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
};

export const listCardRequest = async (token, cardId, price) => {
    const res = await fetch(`${API_URL}/game/market/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ cardId, price })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
};

export const buyCardRequest = async (token, listingId) => {
    const res = await fetch(`${API_URL}/game/market/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ listingId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
};

export const cancelListingRequest = async (token, listingId) => {
    const res = await fetch(`${API_URL}/game/market/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ listingId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
};

// --- ФАРМ (БОСИ) ---
export const fetchFarmState = async (token) => {
    const res = await fetch(`${API_URL}/game/farm/state`, { headers: { 'Authorization': `Bearer ${token}` } });
    return res.json();
};

export const syncFarmHitRequest = async (token, bossId, damageDone, maxHp) => {
    const res = await fetch(`${API_URL}/game/farm/sync`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ bossId, damageDone, maxHp })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error); // Обов'язкова зупинка при помилці!
    return data;
};

export const claimFarmRewardRequest = async (token, bossId, reward, isLevelUp, cdHours, maxHp) => {
    const res = await fetch(`${API_URL}/game/farm/claim`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ bossId, reward, isLevelUp, cdHours, maxHp })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
};

export const adminResetCdRequest = async (token, targetUid, maxHp) => {
    const res = await fetch(`${API_URL}/admin/farm/reset-cd`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ targetUid, maxHp })
    });
    return res.json();
};

// --- НАЛАШТУВАННЯ ТА ПРОМОКОДИ ---
export const fetchSettings = async () => {
    const res = await fetch(`${API_URL}/game/settings`);
    return res.json();
};

export const saveSettingsRequest = async (token, settingsData) => {
    const res = await fetch(`${API_URL}/admin/settings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(settingsData)
    });
    return res.json();
};

export const fetchPromosRequest = async (token) => {
    const res = await fetch(`${API_URL}/admin/promos`, { headers: { 'Authorization': `Bearer ${token}` } });
    return res.json();
};

export const savePromoRequest = async (token, promoData) => {
    const res = await fetch(`${API_URL}/admin/promos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(promoData)
    });
    return res.json();
};

export const deletePromoRequest = async (token, code) => {
    const res = await fetch(`${API_URL}/admin/promos/${code}`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.json();
};

export const usePromoRequest = async (token, code) => {
    const res = await fetch(`${API_URL}/game/promos/use`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
};

export const claimDailyRequest = async (token) => {
    const res = await fetch(`${API_URL}/game/daily-claim`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
};

export const updateAvatarRequest = async (token, url) => {
    const res = await fetch(`${API_URL}/profile/update-avatar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ avatarUrl: url })
    });
    return res.json();
};

export const fetchLeaderboard = async () => {
    const res = await fetch(`${API_URL}/game/leaderboard`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
};

export const buyPremiumRequest = async (token) => {
    const res = await fetch(`${API_URL}/game/buy-premium`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
};

export const setMainShowcaseRequest = async (token, showcaseId) => {
    const res = await fetch(`${API_URL}/profile/main-showcase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ showcaseId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
};

// --- АДМІНКА: ГРАВЦІ ---
export const fetchAdminUsers = async (token) => {
    const res = await fetch(`${API_URL}/admin/users`, { headers: { 'Authorization': `Bearer ${token}` } });
    return res.json();
};

export const fetchAdminUserInventory = async (token, targetUid) => {
    const res = await fetch(`${API_URL}/admin/users/${targetUid}/inventory`, { headers: { 'Authorization': `Bearer ${token}` } });
    return res.json();
};

export const adminUserActionRequest = async (token, action, targetUid, payload = {}) => {
    const res = await fetch(`${API_URL}/admin/users/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ action, targetUid, payload })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
};

export const fetchPublicProfileRequest = async (uid) => {
    const res = await fetch(`${API_URL}/profile/public/${uid}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
};

export const changePasswordRequest = async (token, oldPassword, newPassword) => {
    const res = await fetch(`${API_URL}/profile/change-password`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ oldPassword, newPassword })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка зміни пароля');
    return data;
};

export const createShowcaseRequest = async (token, name) => {
    const res = await fetch(`${API_URL}/profile/showcases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
};

export const deleteShowcaseRequest = async (token, showcaseId) => {
    const res = await fetch(`${API_URL}/profile/showcases/${showcaseId}`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
};

export const saveShowcaseCardsRequest = async (token, showcaseId, cardIds) => {
    const res = await fetch(`${API_URL}/profile/showcases/${showcaseId}/cards`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ cardIds })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
};

export const changeNicknameRequest = async (token, newNickname) => {
    const res = await fetch(`${API_URL}/profile/change-nickname`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ newNickname })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
};

export const buyPremiumItemRequest = async (token, item) => {
    const res = await fetch(`${API_URL}/game/premium-shop/buy`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ item })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
};

export const createAdminLogRequest = async (token, type, details) => {
    await fetch(`${API_URL}/admin/logs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ type, details })
    });
};

export const fetchAdminLogsRequest = async (token) => {
    const res = await fetch(`${API_URL}/admin/logs`, { headers: { 'Authorization': `Bearer ${token}` } });
    return res.json();
};

export const clearAdminLogsRequest = async (token) => {
    await fetch(`${API_URL}/admin/logs`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
};

export const claim2048RewardRequest = async (token, score) => {
    const res = await fetch(`${API_URL}/game/2048/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ score })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
};

export const fetchMarketHistoryRequest = async (token) => {
    const res = await fetch(`${API_URL}/profile/market-history`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.json();
};