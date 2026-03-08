import { create } from 'zustand';
import { DEFAULT_RARITIES } from '../config/constants';

export const useStore = create((set, get) => ({
  // --- Auth & User ---
  user: undefined,
  profile: null,
  needsRegistration: false,
  authMode: 'login',
  dbError: '',
  loading: true,

  // --- Game Data ---
  dbInventory: [],
  marketListings: [],
  showcases: [],
  bosses: [],
  cardsCatalog: [],
  packsCatalog: [],
  achievementsCatalog: [],
  cardStats: {},
  rarities: DEFAULT_RARITIES,
  dailyRewards: [1000, 2000, 3000, 4000, 5000, 6000, 7000],
  premiumDailyRewards: [2000, 4000, 6000, 8000, 10000, 12000, 15000],
  premiumPrice: 10000,
  premiumDurationDays: 30,
  premiumShopItems: [],
  wordleEntryCost: 0,
  notifications: [],

  // --- UI State ---
  currentView: localStorage.getItem('lastActiveView') || 'shop',
  selectedPackId: null,
  openingPackId: null,
  isRouletteSpinning: false,
  rouletteItems: [],
  pulledCards: [],
  viewingCard: null,
  viewingPlayerProfile: null,
  toastMsg: { text: '', type: '' },
  listingCard: null,
  showTerms: false,
  showPrivacy: false,
  showNotifications: false,
  isProcessing: false,

  // --- Setters ---
  setUser: (user) => set({ user }),
  setProfile: (profile) => {
    if (typeof profile === 'function') {
      set((state) => ({ profile: profile(state.profile) }));
    } else {
      set({ profile });
    }
  },
  setNeedsRegistration: (needsRegistration) => set({ needsRegistration }),
  setAuthMode: (authMode) => set({ authMode }),
  setDbError: (dbError) => set({ dbError }),
  setLoading: (loading) => set({ loading }),

  setDbInventory: (dbInventory) => {
    if (typeof dbInventory === 'function') {
      set((state) => ({ dbInventory: dbInventory(state.dbInventory) }));
    } else {
      set({ dbInventory });
    }
  },
  setMarketListings: (marketListings) => set({ marketListings }),
  setShowcases: (showcases) => {
    if (typeof showcases === 'function') {
      set((state) => ({ showcases: showcases(state.showcases) }));
    } else {
      set({ showcases });
    }
  },
  setBosses: (bosses) => set({ bosses }),
  setCardsCatalog: (cardsCatalog) => set({ cardsCatalog }),
  setPacksCatalog: (packsCatalog) => set({ packsCatalog }),
  setAchievementsCatalog: (achievementsCatalog) => set({ achievementsCatalog }),
  setCardStats: (cardStats) => set({ cardStats }),
  setDailyRewards: (dailyRewards) => set({ dailyRewards }),
  setPremiumDailyRewards: (premiumDailyRewards) => set({ premiumDailyRewards }),
  setPremiumPrice: (premiumPrice) => set({ premiumPrice }),
  setPremiumDurationDays: (premiumDurationDays) => set({ premiumDurationDays }),
  setPremiumShopItems: (premiumShopItems) => set({ premiumShopItems }),
  setWordleEntryCost: (wordleEntryCost) => set({ wordleEntryCost }),
  setNotifications: (notifications) => set({ notifications }),

  setSelectedPackId: (id) => set({ selectedPackId: id }),
  setOpeningPackId: (id) => set({ openingPackId: id }),
  setIsRouletteSpinning: (val) => set({ isRouletteSpinning: val }),
  setRouletteItems: (items) => set({ rouletteItems: items }),
  setPulledCards: (cards) => {
    if (typeof cards === 'function') {
      set((state) => ({ pulledCards: cards(state.pulledCards) }));
    } else {
      set({ pulledCards: cards });
    }
  },
  setViewingCard: (card) => set({ viewingCard: card }),
  setViewingPlayerProfile: (profile) => set({ viewingPlayerProfile: profile }),
  setToastMsg: (msg) => set({ toastMsg: msg }),
  setListingCard: (card) => set({ listingCard: card }),
  setShowTerms: (val) => set({ showTerms: val }),
  setShowPrivacy: (val) => set({ showPrivacy: val }),
  setShowNotifications: (val) => set({ showNotifications: val }),
  setIsProcessing: (val) => set({ isProcessing: val }),

  // --- Actions ---
  showToast: (text, type = 'error') => {
    set({ toastMsg: { text, type } });
    if (get().toastTimeout) clearTimeout(get().toastTimeout);
    const timeout = setTimeout(() => set({ toastMsg: { text: '', type: '' } }), 3000);
    set({ toastTimeout: timeout });
  },
  toastTimeout: null,
}));
