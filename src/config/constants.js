export const DEFAULT_PACKS = [
  {
    id: "p1",
    name: "Наруто Базовий",
    category: "Базові",
    cost: 50,
    image: "https://placehold.co/400x400/222/aaa?text=Базовий\nПак",
    customWeights: {},
    isHidden: false,
    isPremiumOnly: false
  }
];

export const DEFAULT_BOSSES = [
  {
    id: "boss_1",
    cardId: "c1", 
    maxHp: 1000,
    rewardPerClick: 2,
    killBonus: 500,
    cooldownHours: 4
  }
];

export const DEFAULT_CARDS_DB = [
  { id: "c1", packId: "p1", name: "Учень Академії", rarity: "Звичайна", image: "https://placehold.co/400x600/222/aaa?text=Учень\nАкадемії", maxSupply: 0, pulledCount: 0, sellPrice: 15, effect: "", soundUrl: "", soundVolume: 0.5 },
];

export const EFFECT_OPTIONS = [
  { id: "", name: "Без ефекту" },
  { id: "holo", name: "Голограма (Holo)" },
  { id: "foil", name: "Металік (Foil)" },
  { id: "glow", name: "Золоте світіння (Glow)" },
  { id: "glitch", name: "Глітч (Glitch)" }
];

export const COLOR_PRESETS = {
  gray: { border: "border-gray-500 shadow-gray-500/30", text: "text-gray-400" },
  blue: { border: "border-blue-500 shadow-blue-500/40", text: "text-blue-400" },
  purple: { border: "border-purple-500 shadow-purple-500/50", text: "text-purple-400" },
  yellow: { border: "border-yellow-400 shadow-yellow-500/80", text: "text-yellow-400" },
  red: { border: "border-red-500 shadow-red-500/50", text: "text-red-400" },
  green: { border: "border-green-500 shadow-green-500/40", text: "text-green-400" },
  cyan: { border: "border-cyan-400 shadow-cyan-400/50", text: "text-cyan-400" },
};

export const DEFAULT_RARITIES = [
  { name: "Звичайна", weight: 70, color: "gray" },
  { name: "Рідкісна", weight: 25, color: "blue" },
  { name: "Епічна", weight: 4, color: "purple" },
  { name: "Легендарна", weight: 1, color: "yellow" },
  { name: "Унікальна", weight: 0.1, color: "red" },
];

export const SELL_PRICE = 15;