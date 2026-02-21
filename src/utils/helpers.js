import { COLOR_PRESETS } from '../config/constants';

export const isToday = (dateString) => {
  if (!dateString) return false;
  const d = new Date(dateString);
  const today = new Date();
  return d.getDate() === today.getDate() &&
         d.getMonth() === today.getMonth() &&
         d.getFullYear() === today.getFullYear();
};

export const formatDate = (dateString) => {
  if (!dateString) return "Невідомо";
  const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };
  return new Date(dateString).toLocaleDateString('uk-UA', options);
};

export const playCardSound = (url, volume = 0.5) => {
    if (!url) return;
    try {
        const audio = new Audio(url);
        audio.volume = volume;
        audio.play().catch(e => console.log("Audio play blocked by browser:", e));
    } catch (err) {
        console.log("Audio error", err);
    }
};

export const getCardWeight = (rName, raritiesList) => {
    const r = raritiesList?.find((x) => x.name === rName);
    return r && r.weight !== undefined ? Number(r.weight) : 100;
};

export const getCardStyle = (rName, raritiesList) => {
  const r = raritiesList?.find((x) => x.name === rName);
  return r && COLOR_PRESETS[r.color] ? COLOR_PRESETS[r.color] : COLOR_PRESETS["gray"];
};