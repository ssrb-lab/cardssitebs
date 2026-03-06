const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(appPath, 'utf8');

// 1. Import useStore
if (!content.includes(`import { useStore } from './store';`)) {
    content = content.replace(
        "import authMode", 
        "import { useStore } from './store';\nimport authMode"
    );
    // If authMode not found, inject after imports
    if (!content.includes(`import { useStore } from './store';`)) {
        content = content.replace(
            "import { DEFAULT_PACKS",
            "import { useStore } from './store';\nimport { DEFAULT_PACKS"
        );
    }
}

// 2. Replace state declarations with Zustand selectors
const stateRegex = /const \[([a-zA-Z0-9_]+), set[a-zA-Z0-9_]+\] = useState\([^)]*\);/g;

// To avoid App re-rendering for EVERYTHING, we will just use a global getState inside functions,
// but for the render, we will map them via useStore.

// Wait, doing this via regex for 30 states is tricky. Let's just manually replace the block.
const stateBlockStart = content.indexOf('const [user, setUser] = useState(undefined);');
const stateBlockEnd = content.indexOf('const checkIsPremiumActive = (prof) => {');

const replacementState = `
  const user = useStore(s => s.user);
  const profile = useStore(s => s.profile);
  const dbInventory = useStore(s => s.dbInventory);
  const marketListings = useStore(s => s.marketListings);
  const showcases = useStore(s => s.showcases);
  const loading = useStore(s => s.loading);
  const isProcessing = useStore(s => s.isProcessing);
  const needsRegistration = useStore(s => s.needsRegistration);
  const authMode = useStore(s => s.authMode);
  const dbError = useStore(s => s.dbError);
  const bosses = useStore(s => s.bosses);
  const cardsCatalog = useStore(s => s.cardsCatalog);
  const packsCatalog = useStore(s => s.packsCatalog);
  const achievementsCatalog = useStore(s => s.achievementsCatalog);
  const cardStats = useStore(s => s.cardStats);
  const rarities = useStore(s => s.rarities);
  const dailyRewards = useStore(s => s.dailyRewards);
  const premiumDailyRewards = useStore(s => s.premiumDailyRewards);
  const premiumPrice = useStore(s => s.premiumPrice);
  const premiumDurationDays = useStore(s => s.premiumDurationDays);
  const premiumShopItems = useStore(s => s.premiumShopItems);
  const wordleEntryCost = useStore(s => s.wordleEntryCost);
  const currentView = useStore(s => s.currentView);
  const selectedPackId = useStore(s => s.selectedPackId);
  const openingPackId = useStore(s => s.openingPackId);
  const isRouletteSpinning = useStore(s => s.isRouletteSpinning);
  const rouletteItems = useStore(s => s.rouletteItems);
  const pulledCards = useStore(s => s.pulledCards);
  const viewingCard = useStore(s => s.viewingCard);
  const viewingPlayerProfile = useStore(s => s.viewingPlayerProfile);
  const toastMsg = useStore(s => s.toastMsg);
  const listingCard = useStore(s => s.listingCard);
  const showTerms = useStore(s => s.showTerms);
  const showPrivacy = useStore(s => s.showPrivacy);
  const notifications = useStore(s => s.notifications);
  const showNotifications = useStore(s => s.showNotifications);

  const {
      setUser, setProfile, setDbInventory, setMarketListings, setShowcases, setLoading,
      setIsProcessing, setNeedsRegistration, setAuthMode, setDbError, setBosses,
      setCardsCatalog, setPacksCatalog, setAchievementsCatalog, setCardStats,
      setDailyRewards, setPremiumDailyRewards, setPremiumPrice, setPremiumDurationDays,
      setPremiumShopItems, setWordleEntryCost, setCurrentView, setSelectedPackId,
      setOpeningPackId, setIsRouletteSpinning, setRouletteItems, setPulledCards,
      setViewingCard, setViewingPlayerProfile, setToastMsg, setListingCard,
      setShowTerms, setShowPrivacy, setNotifications, setShowNotifications, showToast
  } = useStore.getState();

  const actionLock = useRef(false);
  const lastCheckRef = useRef(null);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const canClaimDaily = profile && !isToday(profile.lastDailyClaim);
`;

if (stateBlockStart !== -1 && stateBlockEnd !== -1) {
    content = content.substring(0, stateBlockStart) + replacementState + '\n  ' + content.substring(stateBlockEnd);
}

// 3. Fix useEffects that use setters (if any were strictly depending on them)
// getState() binds the functions properly.

fs.writeFileSync(appPath, content, 'utf8');
console.log('App.jsx states migrated to Zustand!');
