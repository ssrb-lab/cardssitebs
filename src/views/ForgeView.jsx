import React, { useState, useEffect, useMemo } from 'react';
import { Zap, ArrowUpCircle, Sparkles, RefreshCw, Layers, Gem, Coins, ArrowUp, Star, Package, X, CheckCircle, Store, Tag } from 'lucide-react';
import { getCardStyle, playCardSound, getCardWeight, parseGameStat } from '../utils/helpers';
import CardFrame from '../components/CardFrame';
import { PerkBadge } from '../components/PerkBadge';
import {
  levelUpCardRequest,
  fetchEmeraldInfo,
  openEmeraldBoxRequest,
  installEmeraldRequest,
  removeEmeraldRequest,
  repairCardRequest,
} from '../config/api';

export default function ForgeView({
  inventory,
  rarities,
  profile,
  showToast,
  getToken,
  reloadProfile,
  listDuplicatesOnMarket,
}) {
  const [selectedMain, setSelectedMain] = useState(null);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [sortBy, setSortBy] = useState('rarity');

  // Emerald state
  const [emeraldTypes, setEmeraldTypes] = useState([]);
  const [emeraldSettings, setEmeraldSettings] = useState(null);
  const [emeraldOpensToday, setEmeraldOpensToday] = useState(0);
  const [isOpeningBox, setIsOpeningBox] = useState(false);
  const [boxPhase, setBoxPhase] = useState('idle'); // 'idle' | 'shaking' | 'opening' | 'reveal'
  const [obtainedEmerald, setObtainedEmerald] = useState(null);
  const [isInstallingEmerald, setIsInstallingEmerald] = useState(false);

  // Repair state
  const [isRepairing, setIsRepairing] = useState(false);

  // Sell duplicates state (panel in selected card section)
  const [sellDupeAmount, setSellDupeAmount] = useState(1);
  const [sellDupePrice, setSellDupePrice] = useState('');
  const [isListingDupes, setIsListingDupes] = useState(false);
  // Quick sell modal from card grid
  const [sellDupeModal, setSellDupeModal] = useState(null); // card item or null
  const [modalDupeAmount, setModalDupeAmount] = useState(1);
  const [modalDupePrice, setModalDupePrice] = useState('');

  const emeraldInventory = profile?.emeraldInventory || {};

  useEffect(() => {
    fetchEmeraldInfo(getToken())
      .then((data) => {
        setEmeraldTypes(data.types || []);
        setEmeraldSettings(data.settings || null);
        setEmeraldOpensToday(data.opensToday || 0);
      })
      .catch(() => {});
  }, []);

  // Refresh emerald opens count whenever profile reloads
  useEffect(() => {
    if (!profile?.emeraldBoxOpens) return;
    const today = new Date().toISOString().slice(0, 10);
    const opens = profile.emeraldBoxOpens;
    setEmeraldOpensToday(opens.date === today ? opens.count || 0 : 0);
  }, [profile]);

  const getEmeraldType = (id) => emeraldTypes.find((t) => t.id === id) || null;

  const handleOpenBox = async () => {
    if (isOpeningBox) return;
    setIsOpeningBox(true);
    setObtainedEmerald(null);
    setBoxPhase('shaking');
    try {
      // Start shake animation, then fire request
      await new Promise((r) => setTimeout(r, 700));
      setBoxPhase('opening');
      const data = await openEmeraldBoxRequest(getToken());
      await new Promise((r) => setTimeout(r, 400));
      setBoxPhase('reveal');
      setObtainedEmerald(data.obtained);
      setEmeraldOpensToday(data.opensToday);
      reloadProfile();
      // auto-reset reveal after 3s
      setTimeout(() => { setBoxPhase('idle'); }, 3000);
    } catch (e) {
      showToast(e.message || 'Помилка відкриття скриньки.', 'error');
      setBoxPhase('idle');
    } finally {
      setIsOpeningBox(false);
    }
  };

  const handleInstallEmerald = async (typeId) => {
    if (!selectedMain || isInstallingEmerald) return;
    setIsInstallingEmerald(true);
    try {
      await installEmeraldRequest(getToken(), selectedMain.card.id, selectedMain.statsIndex, typeId);
      showToast('Смарагд встановлено!', 'success');
      reloadProfile();
    } catch (e) {
      showToast(e.message || 'Помилка встановлення.', 'error');
    } finally {
      setIsInstallingEmerald(false);
    }
  };

  const handleRemoveEmerald = async () => {
    if (!selectedMain || isInstallingEmerald) return;
    setIsInstallingEmerald(true);
    try {
      await removeEmeraldRequest(getToken(), selectedMain.card.id, selectedMain.statsIndex);
      showToast('Смарагд видалено і повернуто до інвентарю.', 'success');
      reloadProfile();
    } catch (e) {
      showToast(e.message || 'Помилка видалення.', 'error');
    } finally {
      setIsInstallingEmerald(false);
    }
  };

  const handleRepair = async (card, currency) => {
    if (!card || isRepairing) return;
    setIsRepairing(true);
    try {
      await repairCardRequest(getToken(), card.card.id, card.statsIndex, currency);
      showToast('Картку відремонтовано!', 'success');
      reloadProfile();
    } catch (e) {
      showToast(e.message || 'Помилка ремонту.', 'error');
    } finally {
      setIsRepairing(false);
    }
  };

  // All game cards from inventory
  const allGameCards = useMemo(() => {
    const cards = [];
    inventory.forEach((item) => {
      if (!item.gameStats || !Array.isArray(item.gameStats) || item.gameStats.length === 0) return;
      if (item.card.blockGame) return;
      item.gameStats.forEach((statVal, index) => {
        if (statVal && statVal.inSafe) return;
        const parsed = parseGameStat(statVal, item.card.rarity);
        const emeraldId = statVal?.emerald ?? null;
        cards.push({
          card: item.card,
          power: parsed.power,
          hp: parsed.hp,
          level: parsed.level || 1,
          statsIndex: index,
          emerald: emeraldId,
          uniqueKey: `${item.card.id}-${index}-${parsed.power}-${parsed.hp}-${parsed.level || 1}-${emeraldId ?? 'x'}`,
        });
      });
    });

    cards.sort((a, b) => {
      if (sortBy === 'power') return b.power - a.power;
      if (sortBy === 'rarity') return getCardWeight(a.card.rarity, rarities) - getCardWeight(b.card.rarity, rarities);
      if (sortBy === 'name') return a.card.name.localeCompare(b.card.name);
      return 0;
    });

    return cards;
  }, [inventory, sortBy, rarities]);

  const availableDupes = useMemo(() => {
    if (!selectedMain) return 0;
    let count = 0;
    allGameCards.forEach((c) => {
      if (c.card.id !== selectedMain.card.id) return;
      if (c.uniqueKey === selectedMain.uniqueKey) return;
      count++;
    });
    return count;
  }, [selectedMain, allGameCards]);

  const groupedCards = useMemo(() => {
    const groups = {};
    allGameCards.forEach((item) => {
      const id = item.card.id;
      if (!groups[id]) groups[id] = [];
      groups[id].push(item);
    });

    const defendingIndices = profile?.defendingInstances || [];
    return Object.values(groups).map((instances) => {
      const nonDefending = instances.filter(
        (inst) => !defendingIndices.some((d) => d.cardId === inst.card.id && d.statsIndex === inst.statsIndex)
      );
      const pickBest = (arr) => arr.reduce((best, c) => {
        if (c.level > best.level) return c;
        if (c.level < best.level) return best;
        const bestDef = defendingIndices.some((d) => d.cardId === best.card.id && d.statsIndex === best.statsIndex);
        const cDef = defendingIndices.some((d) => d.cardId === c.card.id && d.statsIndex === c.statsIndex);
        if (bestDef && !cDef) return c;
        return best;
      }, arr[0]);
      const representative = pickBest(instances);
      const allDefending = nonDefending.length === 0;
      const availDupes = instances.length; // загальна кількість (включно з захисними)

      let nextLevelRequired = 0;
      if (representative.level < 10 && representative.card.levelingConfig) {
        const cfg =
          typeof representative.card.levelingConfig === 'string'
            ? JSON.parse(representative.card.levelingConfig)
            : representative.card.levelingConfig;
        nextLevelRequired = cfg[representative.level + 1]?.dupes || 0;
      }

      return { ...representative, totalCount: instances.length, availDupes, nextLevelRequired, allDefending };
    });
  }, [allGameCards, profile]);

  useEffect(() => {
    if (selectedMain && !isUpgrading) {
      const stillOwns = allGameCards.some(
        (c) => c.card.id === selectedMain.card.id && c.statsIndex === selectedMain.statsIndex
      );
      if (!stillOwns) setSelectedMain(null);
    }
  }, [allGameCards, selectedMain, isUpgrading]);

  useEffect(() => {
    if (!selectedMain) return;
    const match = allGameCards.find(
      (c) => c.card.id === selectedMain.card.id && c.statsIndex === selectedMain.statsIndex
    );
    if (match && match.uniqueKey !== selectedMain.uniqueKey) {
      setSelectedMain(match);
    }
  }, [allGameCards, selectedMain]);

  const handleLevelUp = async () => {
    if (!selectedMain || isUpgrading) return;
    setIsUpgrading(true);
    playCardSound('/sounds/anvil_strike.mp3', 0.5);

    try {
      const data = await levelUpCardRequest(getToken(), selectedMain.card.id, selectedMain.statsIndex);
      setTimeout(() => {
        if (data.success) {
          showToast(`Успіх! Рівень піднято: ⚡${data.newPower} ❤️${data.newHp} (Лвл ${data.newLevel})`, 'success');
          playCardSound('/sounds/upgrade_success.mp3', 0.6);
          setSelectedMain((prev) => {
            if (!prev) return prev;
            const newLevel = data.newLevel || prev.level || 1;
            const newPower = data.newPower ?? prev.power;
            const newHp = data.newHp ?? prev.hp;
            const newStatsIndex = data.newStatsIndex ?? prev.statsIndex;
            return {
              ...prev,
              power: newPower,
              hp: newHp,
              level: newLevel,
              statsIndex: newStatsIndex,
              uniqueKey: `${prev.card.id}-${newStatsIndex}-${newPower}-${newHp}-${newLevel}-${prev.emerald ?? 'x'}`,
            };
          });
          reloadProfile();
          setIsUpgrading(false);
        } else {
          showToast(data.error || 'Помилка підняття рівня', 'error');
          setIsUpgrading(false);
        }
      }, 1000);
    } catch (e) {
      showToast(e.message || 'Помилка.', 'error');
      setIsUpgrading(false);
    }
  };

  let nextLevelConfig = null;
  let isMaxLevel = false;
  let canUpgrade = false;

  if (selectedMain) {
    if (selectedMain.level >= 10) {
      isMaxLevel = true;
    } else {
      const nextLevel = selectedMain.level + 1;
      let cfg = {};
      if (selectedMain.card.levelingConfig) {
        cfg =
          typeof selectedMain.card.levelingConfig === 'string'
            ? JSON.parse(selectedMain.card.levelingConfig)
            : selectedMain.card.levelingConfig;
      }
      nextLevelConfig = cfg[nextLevel] || { dupes: 0, cost: 0, currency: 'coins', powerAdd: 0, hpAdd: 0 };
      const hasDupes = (availableDupes + 1) >= (nextLevelConfig.dupes || 0);
      const hasCurrency =
        nextLevelConfig.currency === 'crystals'
          ? profile?.crystals >= nextLevelConfig.cost
          : profile?.coins >= nextLevelConfig.cost;
      canUpgrade = hasDupes && hasCurrency;
    }
  }

  const selectedEmeraldType = selectedMain?.emerald ? getEmeraldType(selectedMain.emerald) : null;
  const maxOpens = emeraldSettings?.maxDailyOpens || 0;
  const canOpenBox = maxOpens > 0 && emeraldOpensToday < maxOpens;

  const defendingInstances = profile?.defendingInstances || [];
  const isDefendingSelected = selectedMain
    ? defendingInstances.some(
        (inst) => inst.cardId === selectedMain.card.id && inst.statsIndex === selectedMain.statsIndex
      )
    : false;

  return (
    <div className="pb-10 pt-4 max-w-6xl mx-auto w-full px-4 animate-in fade-in zoom-in-95">
      {/* Main Forge Panel */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-3 sm:p-6 lg:p-10 mb-4 sm:mb-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-gradient-to-b from-blue-600/5 to-transparent pointer-events-none" />

        <div className="flex flex-col lg:flex-row gap-6 sm:gap-12 items-center relative z-10">
          {/* Selected card slot */}
          <div className="flex flex-col items-center gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-blue-500">Обрана Картка</span>
            {selectedMain ? (
              <div
                className={`relative w-48 aspect-[2/3] transition-all duration-500 rounded-xl overflow-hidden shadow-2xl ${
                  isUpgrading ? 'animate-pulse scale-105 blur-[1px]' : ''
                }`}
              >
                <CardUI item={selectedMain} rarities={rarities} />
                <PerkBadge
                  perks={[
                    selectedMain.card?.perk,
                    selectedMain.level >= (selectedMain.card?.bonusPerkLevel || 999)
                      ? selectedMain.card?.bonusPerk
                      : null,
                  ]}
                />
                {(() => {
                  const lv = selectedMain.level || 1;
                  const isMax = lv >= 10;
                  return (
                    <div
                      className={`absolute top-2 right-2 z-20 text-white font-black text-[10px] px-2 py-1 rounded-full whitespace-nowrap border ${
                        isMax
                          ? 'bg-gradient-to-r from-yellow-600 to-amber-500 shadow-[0_0_10px_rgba(234,179,8,0.45)] border-yellow-400/40'
                          : 'bg-gradient-to-r from-blue-600 to-indigo-600 shadow-[0_0_10px_rgba(99,102,241,0.35)] border-blue-400/30'
                      }`}
                    >
                      {isMax ? '★ ' : ''}Lv.{lv}
                    </div>
                  );
                })()}
                {/* Emerald icon on selected card */}
                {selectedEmeraldType && (
                  <div
                    className="absolute bottom-6 right-2 z-20 w-6 h-6 rounded-full flex items-center justify-center shadow-lg border border-white/20"
                    style={{ backgroundColor: selectedEmeraldType.color }}
                    title={selectedEmeraldType.name}
                  >
                    <Gem size={12} className="text-white" />
                  </div>
                )}
              </div>
            ) : (
              <div className="w-48 aspect-[2/3] border-2 border-dashed border-neutral-800 rounded-xl flex flex-col items-center justify-center bg-black/20 text-neutral-600">
                <ArrowUpCircle size={32} className="mb-2 opacity-20" />
                <span className="text-[10px] font-bold uppercase">Оберіть карту</span>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center justify-center text-neutral-700 hidden lg:flex">
            <Sparkles size={24} className={isUpgrading ? 'animate-spin text-blue-500' : ''} />
            <div className="h-16 w-px bg-neutral-800 my-2" />
          </div>

          {/* Info & actions */}
          <div className="w-full lg:w-1/2 space-y-6">
            <div>
              <h1 className="text-2xl sm:text-4xl font-black text-white uppercase tracking-tight flex items-center gap-2 sm:gap-4 mb-2">
                <ArrowUpCircle className="text-blue-500" size={36} />
                Зала Прокачки
              </h1>
              <p className="text-neutral-400 text-sm font-medium leading-relaxed mb-4">
                Підвищуйте рівень карток за допомогою дублікатів. Кожен рівень значно підвищує характеристики
                {selectedMain?.card?.bonusPerkLevel
                  ? `, а на ${selectedMain.card.bonusPerkLevel} рівні відкривається унікальна здібність`
                  : selectedMain
                    ? ''
                    : ', а на певному рівні відкривається унікальна здібність'}
                ! Максимальний рівень: 10.
              </p>
            </div>

            {selectedMain ? (
              <>
                {isDefendingSelected && (
                  <div className="bg-orange-950/40 border border-orange-700/40 px-4 py-2.5 rounded-xl flex items-center gap-2">
                    <span className="shrink-0">🛡️</span>
                    <p className="text-orange-300/70 text-xs leading-relaxed">
                      Картка на Арені — ремонт та смарагди заблоковані, але прокачка доступна.
                    </p>
                  </div>
                )}
                {isMaxLevel ? (
                  <div className="bg-yellow-500/10 border border-yellow-500/20 p-3 sm:p-6 rounded-2xl text-center">
                    <Star className="text-yellow-500 mx-auto mb-2" size={32} />
                    <h3 className="text-yellow-400 font-black text-xl uppercase">Максимальний рівень!</h3>
                    <p className="text-yellow-500/70 text-sm mt-1">Ця картка досягла межі своєї могутності.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-black/40 border border-neutral-800 p-4 rounded-2xl flex flex-col justify-center relative overflow-hidden">
                        <div
                          className="absolute bottom-0 left-0 h-1 bg-blue-500 transition-all"
                          style={{ width: `${Math.min(100, ((availableDupes + 1) / (nextLevelConfig?.dupes || 1)) * 100)}%` }}
                        />
                        <span className="text-[10px] font-black text-neutral-500 uppercase block mb-1">
                          Карток ({availableDupes + 1}/{nextLevelConfig?.dupes})
                        </span>
                        <div className="flex items-center gap-2">
                          <Layers
                            size={18}
                            className={(availableDupes + 1) >= (nextLevelConfig?.dupes || 0) ? 'text-blue-400' : 'text-neutral-600'}
                          />
                          <span
                            className={`text-2xl font-black ${(availableDupes + 1) >= (nextLevelConfig?.dupes || 0) ? 'text-blue-400' : 'text-red-500'}`}
                          >
                            {availableDupes + 1}{' '}
                            <span className="text-sm text-neutral-500">/ {nextLevelConfig?.dupes}</span>
                          </span>
                        </div>
                      </div>
                      <div className="bg-black/40 border border-neutral-800 p-4 rounded-2xl flex flex-col justify-center">
                        <span className="text-[10px] font-black text-neutral-500 uppercase block mb-1">Вартість</span>
                        <div className="flex items-center gap-2">
                          {nextLevelConfig?.currency === 'crystals' ? (
                            <Gem size={18} className="text-fuchsia-400" />
                          ) : (
                            <Coins size={18} className="text-yellow-400" />
                          )}
                          <span
                            className={`text-2xl font-black ${
                              (nextLevelConfig?.currency === 'crystals' ? profile?.crystals : profile?.coins) <
                              (nextLevelConfig?.cost || 0)
                                ? 'text-red-500'
                                : 'text-white'
                            }`}
                          >
                            {nextLevelConfig?.cost}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-neutral-950 border border-neutral-800 p-4 rounded-2xl">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-neutral-500 font-bold uppercase">Очікуваний результат</span>
                        <span className="text-xs text-blue-400 font-bold bg-blue-500/10 px-2 py-0.5 rounded">
                          Лвл {selectedMain.level} ➔ {selectedMain.level + 1}
                        </span>
                      </div>
                      <div className="flex gap-4 flex-wrap">
                        <div className="flex items-center gap-2 text-yellow-400 font-black">
                          <Zap size={14} /> {selectedMain.power} <span className="text-neutral-600">➔</span>{' '}
                          <span className="text-green-400">
                            {selectedMain.power + (Number(nextLevelConfig?.powerAdd) || 0)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-red-400 font-black">
                          ❤️ {selectedMain.hp} <span className="text-neutral-600">➔</span>{' '}
                          <span className="text-green-400">
                            {selectedMain.hp + (Number(nextLevelConfig?.hpAdd) || 0)}
                          </span>
                        </div>
                      </div>
                      {selectedMain.card?.bonusPerkLevel &&
                        selectedMain.level + 1 === selectedMain.card.bonusPerkLevel &&
                        selectedMain.card?.bonusPerk && (
                          <div className="mt-2 flex items-center gap-2 text-purple-400 font-bold text-xs">
                            <Sparkles size={12} /> Розблокується здібність:{' '}
                            <span className="text-purple-300 uppercase">{selectedMain.card.bonusPerk}</span>
                          </div>
                        )}
                    </div>

                    <button
                      onClick={handleLevelUp}
                      disabled={!canUpgrade || isUpgrading}
                      className="w-full h-16 btn-game-secondary text-xl"
                    >
                      {isUpgrading ? (
                        <RefreshCw className="animate-spin" size={24} />
                      ) : (
                        <>
                          <ArrowUp size={24} />
                          ПІДНЯТИ РІВЕНЬ
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Emerald install/remove section */}
                {!isDefendingSelected && (() => {
                  const cardHasPerk = !!selectedMain.card?.perk;
                  const cardHasPerkValue = selectedMain.card?.perkValue != null && selectedMain.card?.perkValue > 0;
                  const canInstall = cardHasPerk && cardHasPerkValue;
                  const blockReason = !cardHasPerk
                    ? 'Ця картка не має перку. Смарагд підсилює ефект перку — встановлення неможливе.'
                    : !cardHasPerkValue
                      ? 'Перк цієї картки не має числового значення (відсотка). Смарагд не можна встановити.'
                      : null;
                  // If emerald already installed — allow removal regardless
                  if (!canInstall && !selectedEmeraldType) {
                    return (
                      <div className="bg-neutral-950/60 border border-neutral-800 rounded-2xl p-4 flex items-start gap-3">
                        <Gem size={16} className="text-neutral-600 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs font-black text-neutral-500 uppercase tracking-widest mb-1">Смарагд</div>
                          <p className="text-neutral-500 text-xs leading-relaxed">{blockReason}</p>
                        </div>
                      </div>
                    );
                  }
                  return (
                <div className="bg-emerald-950/30 border border-emerald-900/40 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Gem size={16} className="text-emerald-400" />
                    <span className="text-xs font-black text-emerald-400 uppercase tracking-widest">Смарагд</span>
                  </div>
                  {selectedEmeraldType ? (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center shadow-lg border border-white/10"
                            style={{ backgroundColor: selectedEmeraldType.color }}
                          >
                            <Gem size={15} className="text-white" />
                          </div>
                          <div>
                            <div className="text-white font-bold text-sm">{selectedEmeraldType.name}</div>
                            <div className="text-emerald-400 text-xs font-bold">+{selectedEmeraldType.perkBoostPercent}% до перку</div>
                          </div>
                        </div>
                        <button
                          onClick={handleRemoveEmerald}
                          disabled={isInstallingEmerald}
                          className="flex items-center gap-1 text-xs font-bold text-red-400 hover:text-red-300 border border-red-900/40 hover:border-red-700/60 px-3 py-2 rounded-xl transition-colors"
                        >
                          <X size={12} /> Видалити
                        </button>
                      </div>
                      {/* Before / After perk effect */}
                      {selectedMain.card?.perk && selectedMain.card?.perkValue != null && (
                        <div className="bg-black/30 rounded-xl px-3 py-2 flex items-center gap-3 text-xs">
                          <span className="text-neutral-500 uppercase font-bold tracking-widest">Ефект перку:</span>
                          <span className="text-neutral-400 line-through">{selectedMain.card.perkValue}%</span>
                          <span className="text-neutral-500">→</span>
                          <span className="font-black text-emerald-400">
                            {Math.round(selectedMain.card.perkValue + selectedEmeraldType.perkBoostPercent)}%
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-neutral-500 text-xs mb-3">Оберіть смарагд для встановлення:</p>
                      <div className="flex flex-wrap gap-2">
                        {emeraldTypes.map((t) => {
                          const count = emeraldInventory[String(t.id)] || 0;
                          const boosted = selectedMain.card?.perkValue != null
                            ? Math.round(selectedMain.card.perkValue + t.perkBoostPercent)
                            : null;
                          return (
                            <button
                              key={t.id}
                              onClick={() => count > 0 && handleInstallEmerald(t.id)}
                              disabled={count === 0 || isInstallingEmerald}
                              title={`${t.name} — +${t.perkBoostPercent}%${boosted != null ? ` (перк: ${selectedMain.card.perkValue}% → ${boosted}%)` : ''}`}
                              className={`flex flex-col items-start gap-0.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
                                count > 0
                                  ? 'hover:scale-105 active:scale-95 cursor-pointer'
                                  : 'opacity-30 cursor-not-allowed border-neutral-800 text-neutral-500'
                              }`}
                              style={count > 0 ? { backgroundColor: t.color + '22', borderColor: t.color + '55' } : {}}
                            >
                              <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: count > 0 ? t.color : '#555' }} />
                                <span style={{ color: count > 0 ? t.color : undefined }}>{t.name}</span>
                                <span className="text-neutral-500 font-normal">×{count}</span>
                              </div>
                              {boosted != null && count > 0 && (
                                <div className="text-[10px] text-neutral-400 pl-4">
                                  {selectedMain.card.perkValue}% <span className="text-neutral-600">→</span>{' '}
                                  <span style={{ color: t.color }}>{boosted}%</span>
                                </div>
                              )}
                            </button>
                          );
                        })}
                        {emeraldTypes.length === 0 && (
                          <span className="text-neutral-600 text-xs">Смарагди не налаштовані</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                  );
                })()}

                {/* Sell duplicates section */}
                {!isDefendingSelected && (() => {
                  const defendingInst = profile?.defendingInstances || [];
                  const totalInstances = allGameCards.filter(
                    (c) => c.card.id === selectedMain.card.id
                  ).length;
                  const availableForSale = allGameCards.filter((c) => {
                    if (c.card.id !== selectedMain.card.id) return false;
                    const statEntry = inventory.find((i) => i.card.id === c.card.id)?.gameStats?.[c.statsIndex];
                    if (statEntry?.inSafe) return false;
                    if (defendingInst.some((d) => d.cardId === c.card.id && d.statsIndex === c.statsIndex)) return false;
                    return true;
                  }).length;
                  const maxSellable = Math.max(0, availableForSale - 1); // keep at least 1

                  if (maxSellable === 0) return null;

                  const handleListDupes = async () => {
                    const price = Number(sellDupePrice);
                    const amt = Number(sellDupeAmount);
                    if (!price || price < 1 || !Number.isInteger(price)) {
                      showToast('Введіть коректну ціну (ціле число > 0).', 'error'); return;
                    }
                    if (amt < 1 || amt > maxSellable) {
                      showToast(`Кількість має бути від 1 до ${maxSellable}.`, 'error'); return;
                    }
                    setIsListingDupes(true);
                    try {
                      await listDuplicatesOnMarket(selectedMain.card.id, amt, price);
                      setSellDupeAmount(1);
                      setSellDupePrice('');
                    } finally {
                      setIsListingDupes(false);
                    }
                  };

                  return (
                    <div className="bg-blue-950/30 border border-blue-900/40 rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Store size={15} className="text-blue-400" />
                        <span className="text-xs font-black text-blue-400 uppercase tracking-widest">Продати дублікати</span>
                        <span className="ml-auto text-[10px] text-neutral-500">Доступно: {maxSellable} з {totalInstances}</span>
                      </div>
                      <p className="text-neutral-500 text-xs mb-3 leading-relaxed">
                        Дублікати продаються без параметрів. Покупець отримує картку з базовими характеристиками.
                      </p>
                      <div className="flex flex-wrap sm:flex-nowrap gap-2 items-end">
                        <div className="flex-1 min-w-[80px]">
                          <label className="text-[10px] text-neutral-500 uppercase font-bold block mb-1">Кількість</label>
                          <input
                            type="number"
                            min={1}
                            max={maxSellable}
                            value={sellDupeAmount}
                            onChange={(e) => setSellDupeAmount(Math.min(maxSellable, Math.max(1, Number(e.target.value) || 1)))}
                            className="w-full bg-black/40 border border-neutral-700 rounded-xl px-3 py-2 text-white text-sm font-bold focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div className="flex-1 min-w-[80px]">
                          <label className="text-[10px] text-neutral-500 uppercase font-bold block mb-1">Ціна (разом)</label>
                          <input
                            type="number"
                            min={1}
                            placeholder="монет"
                            value={sellDupePrice}
                            onChange={(e) => setSellDupePrice(e.target.value)}
                            className="w-full bg-black/40 border border-neutral-700 rounded-xl px-3 py-2 text-white text-sm font-bold focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <button
                          onClick={handleListDupes}
                          disabled={isListingDupes || !sellDupePrice}
                          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black rounded-xl transition-colors w-full sm:w-auto justify-center"
                        >
                          {isListingDupes ? <RefreshCw size={13} className="animate-spin" /> : <Tag size={13} />}
                          Виставити
                        </button>
                      </div>
                      {sellDupePrice && Number(sellDupePrice) > 0 && sellDupeAmount > 0 && (
                        <div className="mt-2 text-[10px] text-neutral-500">
                          По {Math.round(Number(sellDupePrice) / sellDupeAmount)} монет за дублікат
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            ) : (
              <div className="h-40 flex items-center justify-center border-2 border-dashed border-neutral-800 rounded-2xl bg-black/20 text-neutral-500 font-bold uppercase text-sm">
                Виберіть картку для прокачки

              </div>
            )}
          </div>
        </div>
      </div>

      {/* Repair Panel */}
      {(() => {
        const REPAIR_COST_COINS = 200;
        const REPAIR_COST_CRYSTALS = 5;

        // Find all damaged cards (hp < maxHp) that aren't in the safe and not defending a point
        const damagedCards = allGameCards.filter((c) => {
          const isDefending = defendingInstances.some(
            (inst) => inst.cardId === c.card.id && inst.statsIndex === c.statsIndex
          );
          if (isDefending) return false;
          const statEntry = inventory
            .find((i) => i.card.id === c.card.id)
            ?.gameStats?.[c.statsIndex];
          if (!statEntry) return false;
          const hp = Number(statEntry.hp ?? statEntry.maxHp ?? c.hp);
          const maxHp = Number(statEntry.maxHp ?? statEntry.hp ?? c.hp);
          return hp < maxHp;
        });

        if (damagedCards.length === 0) return null;

        return (
          <div className="bg-neutral-900 border border-red-900/30 rounded-3xl p-3 sm:p-6 mb-4 sm:mb-8 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-red-900/5 to-transparent pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-2xl bg-red-900/40 border border-red-700/40 flex items-center justify-center">
                  <span className="text-lg">🔧</span>
                </div>
                <div>
                  <h2 className="text-lg font-black text-white">Ремонт Карток</h2>
                  <p className="text-xs text-neutral-500">Відновіть HP пошкоджених карток після битв на арені</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {damagedCards.map((c) => {
                  const statEntry = inventory
                    .find((i) => i.card.id === c.card.id)
                    ?.gameStats?.[c.statsIndex];
                  const hp = Number(statEntry?.hp ?? c.hp);
                  const maxHp = Number(statEntry?.maxHp ?? statEntry?.hp ?? c.hp);
                  const hpPct = Math.round((hp / maxHp) * 100);
                  const isSelected = selectedMain?.card.id === c.card.id && selectedMain?.statsIndex === c.statsIndex;
                  const canAffordCoins = (profile?.coins || 0) >= REPAIR_COST_COINS;
                  const canAffordCrystals = (profile?.crystals || 0) >= REPAIR_COST_CRYSTALS;

                  return (
                    <div
                      key={c.uniqueKey}
                      className={`bg-black/30 border rounded-2xl p-3 flex flex-col gap-2 transition-all ${
                        isSelected ? 'border-red-600/60' : 'border-neutral-800 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-16 rounded-lg overflow-hidden shrink-0 border border-white/10">
                          <img src={c.card.image} alt={c.card.name} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-white font-bold text-sm truncate">{c.card.name}</div>
                          <div className="text-neutral-400 text-xs">Lv.{c.level}</div>
                          <div className="mt-1.5">
                            <div className="flex justify-between text-[10px] mb-0.5">
                              <span className="text-red-400 font-bold">{hp} / {maxHp} HP</span>
                              <span className={hpPct < 30 ? 'text-red-500 font-bold' : 'text-neutral-500'}>{hpPct}%</span>
                            </div>
                            <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${hpPct < 30 ? 'bg-red-600' : hpPct < 60 ? 'bg-orange-500' : 'bg-green-600'}`}
                                style={{ width: `${hpPct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRepair(c, 'coins')}
                          disabled={isRepairing || !canAffordCoins}
                          className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-1.5 rounded-xl border transition-all ${
                            canAffordCoins
                              ? 'bg-yellow-900/30 border-yellow-700/40 text-yellow-300 hover:bg-yellow-800/40 active:scale-95'
                              : 'bg-neutral-900 border-neutral-800 text-neutral-600 cursor-not-allowed'
                          }`}
                        >
                          <Coins size={11} /> {REPAIR_COST_COINS}м
                        </button>
                        <button
                          onClick={() => handleRepair(c, 'crystals')}
                          disabled={isRepairing || !canAffordCrystals}
                          className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-1.5 rounded-xl border transition-all ${
                            canAffordCrystals
                              ? 'bg-fuchsia-900/30 border-fuchsia-700/40 text-fuchsia-300 hover:bg-fuchsia-800/40 active:scale-95'
                              : 'bg-neutral-900 border-neutral-800 text-neutral-600 cursor-not-allowed'
                          }`}
                        >
                          <Gem size={11} /> {REPAIR_COST_CRYSTALS}кр
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Emerald Box Panel */}
      <div className="bg-neutral-900 border border-emerald-900/30 rounded-3xl p-3 sm:p-6 mb-4 sm:mb-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-emerald-600/5 to-transparent pointer-events-none" />
        <div className="relative z-10">
          <div className="flex flex-col lg:flex-row gap-4 sm:gap-8 items-center">
            {/* Left: box button */}
            <div className="flex flex-col items-center gap-4 shrink-0">
              <h2 className="text-xl font-black text-white flex items-center gap-2">
                <Package className="text-emerald-500" size={22} />
                Скриня Смарагдів
              </h2>

              {/* Chest animation area */}
              <div className="relative flex flex-col items-center">
                {/* Glow ring */}
                {boxPhase === 'reveal' && obtainedEmerald && (
                  <div
                    className="absolute inset-0 rounded-full animate-ping opacity-30 pointer-events-none"
                    style={{ backgroundColor: obtainedEmerald.color, width: '110px', height: '110px', margin: 'auto' }}
                  />
                )}

                <button
                  onClick={handleOpenBox}
                  disabled={!canOpenBox || isOpeningBox}
                  className={`relative w-24 h-24 rounded-3xl flex items-center justify-center border-2 select-none transition-all duration-300 ${
                    canOpenBox && !isOpeningBox
                      ? 'bg-gradient-to-br from-emerald-700 via-teal-700 to-emerald-900 border-emerald-500/60 hover:shadow-[0_0_40px_rgba(16,185,129,0.5)] hover:scale-105 active:scale-95 cursor-pointer'
                      : 'bg-neutral-800/80 border-neutral-700 opacity-50 cursor-not-allowed'
                  } ${boxPhase === 'shaking' ? 'animate-[wiggle_0.15s_ease-in-out_infinite]' : ''} ${boxPhase === 'opening' ? 'scale-110' : ''}`}
                  style={
                    boxPhase === 'shaking'
                      ? { animation: 'wiggle 0.12s ease-in-out infinite' }
                      : boxPhase === 'opening'
                        ? { transform: 'scale(1.15)', filter: 'brightness(1.5)' }
                        : {}
                  }
                >
                  <span
                    className="text-3xl sm:text-5xl transition-all duration-300 select-none"
                    style={
                      boxPhase === 'opening' ? { transform: 'scale(1.3) rotate(-10deg)', filter: 'drop-shadow(0 0 16px gold)' } :
                      boxPhase === 'shaking' ? { display: 'inline-block' } : {}
                    }
                  >
                    {boxPhase === 'reveal' ? '✨' : '📦'}
                  </span>
                  {/* Shimmer overlay on hover */}
                  {canOpenBox && !isOpeningBox && (
                    <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-white/0 via-white/10 to-white/0 pointer-events-none" />
                  )}
                </button>

                {/* Particles on reveal */}
                {boxPhase === 'reveal' && obtainedEmerald && (
                  <div className="absolute inset-0 pointer-events-none overflow-visible">
                    {[...Array(8)].map((_, i) => (
                      <div
                        key={i}
                        className="absolute w-2 h-2 rounded-full animate-ping"
                        style={{
                          backgroundColor: obtainedEmerald.color,
                          top: '50%',
                          left: '50%',
                          transform: `translate(-50%, -50%) rotate(${i * 45}deg) translateY(-${36 + (i % 3) * 10}px)`,
                          animationDelay: `${i * 0.07}s`,
                          animationDuration: '0.8s',
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Cost + limit */}
              {emeraldSettings && (
                <div className="text-center space-y-1">
                  <div className={`text-sm font-black ${canOpenBox ? 'text-emerald-400' : 'text-red-400'}`}>
                    {emeraldOpensToday} / {maxOpens} відкрито сьогодні
                  </div>
                  <div
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-black text-sm ${
                      canOpenBox ? 'border-emerald-800/60 bg-emerald-950/40 text-white' : 'border-neutral-800 bg-neutral-900 text-neutral-500'
                    }`}
                  >
                    {emeraldSettings.boxCostCurrency === 'crystals' ? (
                      <><Gem size={14} className="text-fuchsia-400" /> <span>{emeraldSettings.boxCostAmount}</span> <span className="text-neutral-400 font-normal text-xs">кристалів</span></>
                    ) : (
                      <><Coins size={14} className="text-yellow-400" /> <span>{emeraldSettings.boxCostAmount}</span> <span className="text-neutral-400 font-normal text-xs">монет</span></>
                    )}
                  </div>
                  {!canOpenBox && maxOpens > 0 && (
                    <div className="text-xs text-neutral-600">Повернись завтра</div>
                  )}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="hidden lg:block w-px bg-emerald-900/40 self-stretch" />

            {/* Right: reveal + inventory */}
            <div className="flex-1 w-full">
              {/* Reveal card */}
              {boxPhase === 'reveal' && obtainedEmerald ? (
                <div
                  className="mb-5 flex items-center gap-4 p-4 rounded-2xl border animate-in zoom-in-75 fade-in duration-500"
                  style={{ backgroundColor: obtainedEmerald.color + '18', borderColor: obtainedEmerald.color + '66' }}
                >
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center shadow-xl shrink-0 border-2 border-white/20"
                    style={{ backgroundColor: obtainedEmerald.color, boxShadow: `0 0 24px ${obtainedEmerald.color}88` }}
                  >
                    <Gem size={24} className="text-white drop-shadow-lg" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-0.5">Отримано!</div>
                    <div className="font-black text-xl text-white">{obtainedEmerald.name}</div>
                    <div className="text-sm font-bold" style={{ color: obtainedEmerald.color }}>
                      +{obtainedEmerald.perkBoostPercent}% до перку встановленої картки
                    </div>
                  </div>
                  <CheckCircle size={28} className="text-emerald-400 shrink-0" />
                </div>
              ) : (
                <p className="text-neutral-500 text-sm mb-5 hidden sm:block">
                  Відкривайте скриньку щодня, щоб отримувати смарагди для підсилення перків карток.
                </p>
              )}

              {/* Inventory */}
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-3">Ваші Смарагди</div>
                {emeraldTypes.length === 0 ? (
                  <div className="text-neutral-600 text-sm">Смарагди ще не налаштовані адміністратором.</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {emeraldTypes.map((t) => {
                      const count = emeraldInventory[String(t.id)] || 0;
                      const isJustObtained = boxPhase === 'reveal' && obtainedEmerald?.id === t.id;
                      return (
                        <div
                          key={t.id}
                          className={`flex items-center gap-2 bg-neutral-950 border rounded-xl px-3 py-2 transition-all duration-500 ${isJustObtained ? 'scale-110' : ''}`}
                          style={{ borderColor: count > 0 ? t.color + '55' : '#262626' }}
                        >
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: count > 0 ? t.color : '#333', boxShadow: isJustObtained ? `0 0 12px ${t.color}` : 'none' }}
                          >
                            <Gem size={11} className="text-white" />
                          </div>
                          <div>
                            <div className={`text-xs font-bold leading-tight ${count > 0 ? 'text-white' : 'text-neutral-600'}`}>
                              {t.name}
                            </div>
                            <div className="text-[10px]" style={{ color: count > 0 ? t.color : '#555' }}>
                              +{t.perkBoostPercent}% · ×{count}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Wiggle keyframe */}
      <style>{`
        @keyframes wiggle {
          0%,100% { transform: rotate(-4deg) scale(1.05); }
          50% { transform: rotate(4deg) scale(1.08); }
        }
      `}</style>

      {/* Card list */}
      <div className="flex flex-col sm:flex-row justify-between items-center mb-4 sm:mb-6 gap-4">
        <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
          Ваш Арсенал <span className="text-neutral-600">({groupedCards.length})</span>
        </h2>
        <div className="flex gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-neutral-900 border border-neutral-800 text-xs font-bold rounded-xl px-4 py-2 text-neutral-400 focus:outline-none focus:border-blue-500 transition-colors"
          >
            <option value="rarity">За Рідкістю</option>
            <option value="power">За Силою</option>
            <option value="name">За Алфавітом</option>
          </select>
        </div>
      </div>

      {allGameCards.length === 0 ? (
        <div className="text-center py-20 bg-neutral-900/20 rounded-3xl border-2 border-dashed border-neutral-800">
          <Layers size={48} className="mx-auto mb-4 opacity-10" />
          <p className="text-neutral-500 font-bold uppercase tracking-widest">У вас немає ігрових карток</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-6">
          {groupedCards.map((item) => {
            const isSelected = selectedMain?.card.id === item.card.id;
            const isDefending = item.allDefending;
            // How many instances of this card can be sold as duplicates
            const cardSellableCount = (() => {
              const allInst = allGameCards.filter((c) => c.card.id === item.card.id);
              const avail = allInst.filter((c) => {
                const se = inventory.find((i) => i.card.id === c.card.id)?.gameStats?.[c.statsIndex];
                if (se?.inSafe) return false;
                if (defendingInstances.some((d) => d.cardId === c.card.id && d.statsIndex === c.statsIndex)) return false;
                return true;
              });
              return Math.max(0, avail.length - 1);
            })();
            const progressPct =
              item.nextLevelRequired > 0 ? Math.min(100, (item.availDupes / item.nextLevelRequired) * 100) : 0;
            const isMax = item.level >= 10;
            const itemEmerald = item.emerald ? getEmeraldType(item.emerald) : null;

            return (
              <div
                key={item.card.id}
                onClick={() => !isUpgrading && setSelectedMain(item)}
                className={`flex flex-col group cursor-pointer transition-all duration-300 ${
                  isSelected ? '-translate-y-2' : 'hover:-translate-y-2'
                }`}
              >
                <div
                  className={`relative w-full aspect-[2/3] rounded-xl overflow-hidden border-2 bg-neutral-900 mb-3 transition-all duration-300 group-hover:shadow-[0_15px_30px_rgba(0,0,0,0.6)] transform-gpu will-change-transform isolate z-0 ${
                    isSelected
                      ? 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.5)]'
                      : 'border-neutral-800'
                  }`}
                >
                  <CardUI item={item} rarities={rarities} />

                  <PerkBadge
                    perks={[
                      item.card.perk,
                      item.level >= (item.card.bonusPerkLevel || 999) ? item.card.bonusPerk : null,
                    ]}
                  />

                  {item.totalCount > 1 && (
                    <div className="absolute top-2 right-2 bg-neutral-950/90 backdrop-blur text-white font-black text-xs px-2.5 py-1 rounded-full z-10 border border-neutral-700 shadow-xl">
                      x{item.totalCount}
                    </div>
                  )}

                  {isDefending && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-30 pointer-events-none">
                      <span className="text-[10px] font-black text-white uppercase bg-red-600/90 px-2 py-1 rounded-full border border-red-400">
                        Арена
                      </span>
                    </div>
                  )}

                  {/* Emerald dot on card */}
                  {itemEmerald && (
                    <div
                      className="absolute bottom-6 right-1.5 z-20 w-5 h-5 rounded-full flex items-center justify-center shadow border border-white/20"
                      style={{ backgroundColor: itemEmerald.color }}
                      title={itemEmerald.name}
                    >
                      <Gem size={9} className="text-white" />
                    </div>
                  )}

                  {!isMax && item.nextLevelRequired > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-neutral-800/90">
                      <div
                        className={`h-full transition-all duration-500 ${
                          progressPct >= 100 ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.7)]' : 'bg-blue-500'
                        }`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  )}
                </div>

                <div className="w-full flex flex-col items-center text-center px-1">
                  <div className="font-bold text-sm leading-tight text-white mb-0.5 line-clamp-1 w-full group-hover:text-yellow-100 transition-colors">
                    {item.card.name}
                  </div>
                  <div
                    className={`inline-flex items-center gap-1 ${
                      isMax
                        ? 'bg-gradient-to-r from-yellow-600 to-amber-500 shadow-[0_0_8px_rgba(234,179,8,0.5)] border-yellow-400/40'
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 shadow-[0_0_8px_rgba(99,102,241,0.5)] border-blue-400/30'
                    } text-white font-black text-[9px] px-2 py-0.5 rounded-full border whitespace-nowrap mb-1`}
                  >
                    {isMax ? '★ ' : ''}Lv.{item.level}
                  </div>
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <div className="flex items-center gap-1 text-xs font-bold text-yellow-500">
                      <Zap size={12} strokeWidth={2.5} /> {item.power}
                    </div>
                    <div className="flex items-center gap-1 text-xs font-bold text-red-500">❤️ {item.hp}</div>
                  </div>
                  {!isMax && item.nextLevelRequired > 0 && (
                    <div className={`text-[9px] font-bold mt-0.5 ${progressPct >= 100 ? 'text-green-400' : 'text-neutral-500'}`}>
                      {item.availDupes}/{item.nextLevelRequired} до Lv.{item.level + 1}
                    </div>
                  )}

                  {/* Sell duplicates quick button */}
                  {cardSellableCount > 0 && !isDefending && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSellDupeModal(item);
                        setModalDupeAmount(1);
                        setModalDupePrice('');
                      }}
                      className="mt-1.5 w-full flex items-center justify-center gap-1 text-[9px] font-black uppercase tracking-wide text-blue-400 border border-blue-900/50 bg-blue-950/30 hover:bg-blue-900/40 rounded-lg py-1 transition-colors"
                    >
                      <Store size={9} /> На ринок ({cardSellableCount})
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick sell-dupe modal */}
      {sellDupeModal && (() => {
        const modalCard = sellDupeModal;
        const allInst = allGameCards.filter((c) => c.card.id === modalCard.card.id);
        const avail = allInst.filter((c) => {
          const se = inventory.find((i) => i.card.id === c.card.id)?.gameStats?.[c.statsIndex];
          if (se?.inSafe) return false;
          if (defendingInstances.some((d) => d.cardId === c.card.id && d.statsIndex === c.statsIndex)) return false;
          return true;
        });
        const maxSell = Math.max(0, avail.length - 1);

        const handleModalList = async () => {
          const price = Number(modalDupePrice);
          const amt = Number(modalDupeAmount);
          if (!price || price < 1 || !Number.isInteger(price)) {
            showToast('Введіть коректну ціну (ціле число > 0).', 'error'); return;
          }
          if (amt < 1 || amt > maxSell) {
            showToast(`Кількість має бути від 1 до ${maxSell}.`, 'error'); return;
          }
          setIsListingDupes(true);
          try {
            await listDuplicatesOnMarket(modalCard.card.id, amt, price);
            setSellDupeModal(null);
          } finally {
            setIsListingDupes(false);
          }
        };

        return (
          <div
            className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center px-4"
            onClick={() => setSellDupeModal(null)}
          >
            <div
              className="bg-neutral-900 border border-neutral-700 rounded-3xl p-4 sm:p-6 w-full max-w-sm animate-in zoom-in-95 fade-in duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-16 rounded-lg overflow-hidden shrink-0 border border-white/10">
                  <img src={modalCard.card.image} alt={modalCard.card.name} className="w-full h-full object-cover" />
                </div>
                <div>
                  <div className="font-black text-white text-lg leading-tight">{modalCard.card.name}</div>
                  <div className="text-xs text-blue-400 font-bold mt-0.5">Доступно дублікатів: {maxSell}</div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">Базові характеристики · без параметрів</div>
                </div>
                <button onClick={() => setSellDupeModal(null)} className="ml-auto text-neutral-500 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <div className="flex gap-3 mb-3">
                <div className="flex-1">
                  <label className="text-[10px] text-neutral-500 uppercase font-bold block mb-1">Кількість</label>
                  <input
                    type="number" min={1} max={maxSell}
                    value={modalDupeAmount}
                    onChange={(e) => setModalDupeAmount(Math.min(maxSell, Math.max(1, Number(e.target.value) || 1)))}
                    className="w-full bg-black/40 border border-neutral-700 rounded-xl px-3 py-2 text-white text-sm font-bold focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-neutral-500 uppercase font-bold block mb-1">Ціна (разом)</label>
                  <input
                    type="number" min={1} placeholder="монет"
                    value={modalDupePrice}
                    onChange={(e) => setModalDupePrice(e.target.value)}
                    className="w-full bg-black/40 border border-neutral-700 rounded-xl px-3 py-2 text-white text-sm font-bold focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {modalDupePrice && Number(modalDupePrice) > 0 && (
                <div className="text-[10px] text-neutral-500 mb-3">
                  ~{Math.round(Number(modalDupePrice) / (modalDupeAmount || 1))} монет / дублікат
                </div>
              )}

              <button
                onClick={handleModalList}
                disabled={isListingDupes || !modalDupePrice}
                className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black rounded-2xl transition-colors"
              >
                {isListingDupes ? <RefreshCw size={16} className="animate-spin" /> : <Tag size={16} />}
                Виставити на ринок
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function CardUI({ item, rarities }) {
  const style = getCardStyle(item.card.rarity, rarities);
  const effectClass = item.card.effect ? `effect-${item.card.effect}` : '';
  return (
    <div
      className={`relative w-full h-full bg-black rounded-[inherit] overflow-hidden isolate ${effectClass} [mask-image:linear-gradient(white,white),radial-gradient(circle,white_100%,transparent_100%)] [mask-clip:padding-box,border-box]`}
    >
      <CardFrame frame={item.card.frame} effect={item.card.effect}>
        <img
          src={item.card.image}
          alt={item.card.name}
          className="w-full h-full object-cover rounded-[inherit] block"
          loading="lazy"
        />
      </CardFrame>
      <div
        className={`absolute bottom-0 left-0 right-0 py-1 text-[7px] font-black uppercase text-center bg-black/80 backdrop-blur-sm ${style.text} border-t border-white/5 rounded-b-[inherit]`}
      >
        {item.card.rarity}
      </div>
    </div>
  );
}
