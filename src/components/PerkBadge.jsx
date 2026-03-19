import React from 'react';
import {
  Flame,
  Wind,
  Droplets,
  Heart,
  Eye,
  ShieldCheck,
  Shield,
  Skull,
  Crosshair,
  Stethoscope,
  ShieldPlus,
} from 'lucide-react';

export const PERK_RARITY_STYLE = {
  'Звичайна':   { bg: 'bg-neutral-500/30', border: 'border-neutral-500/50', text: 'text-neutral-300' },
  'Рідкісна':   { bg: 'bg-blue-500/30',    border: 'border-blue-500/50',    text: 'text-blue-300'    },
  'Епічна':     { bg: 'bg-purple-500/30',  border: 'border-purple-500/50',  text: 'text-purple-300'  },
  'Легендарна': { bg: 'bg-amber-500/30',   border: 'border-amber-500/50',   text: 'text-amber-300'   },
  'Унікальна':  { bg: 'bg-red-500/30',     border: 'border-red-500/50',     text: 'text-red-300'     },
};

export const PERK_META = {
  crit:      { icon: Flame,        color: 'text-orange-400', bg: 'bg-orange-500/20', label: 'Крит',   desc: 'Шанс завдати подвійну шкоду при атаці.' },
  cleave:    { icon: Wind,         color: 'text-cyan-400',   bg: 'bg-cyan-500/20',   label: 'Сплеск', desc: 'Частина шкоди потрапляє на сусідні карти поруч з ціллю.' },
  poison:    { icon: Droplets,     color: 'text-green-400',  bg: 'bg-green-500/20',  label: 'Отрута', desc: 'Зараджує ціль отрутою — шкода щохід протягом 3 ходів.' },
  lifesteal: { icon: Heart,        color: 'text-pink-400',   bg: 'bg-pink-500/20',   label: 'Вампір', desc: 'Відновлює здоров\'я у відсотках від нанесеної шкоди.' },
  dodge:     { icon: Eye,          color: 'text-blue-300',   bg: 'bg-blue-500/20',   label: 'Ухил',   desc: 'Шанс повністю уникнути вхідної атаки (MISS).' },
  thorns:    { icon: ShieldCheck,  color: 'text-amber-400',  bg: 'bg-amber-500/20',  label: 'Шипи',   desc: 'Повертає частину отриманої шкоди назад атакуючому.' },
  armor:     { icon: Shield,       color: 'text-stone-400',  bg: 'bg-stone-500/20',  label: 'Броня',  desc: 'Зменшує вхідну шкоду на певний відсоток.' },
  laststand: { icon: Skull,        color: 'text-yellow-300', bg: 'bg-yellow-500/20', label: '1HP',    desc: 'Одноразово виживає з 1 HP замість смерті від смертельного удару.' },
  taunt:     { icon: Crosshair,    color: 'text-red-400',    bg: 'bg-red-500/20',    label: 'Таунт',  desc: 'Змушує ворогів атакувати цю карту першою, захищаючи союзників.' },
  healer:    { icon: Stethoscope,  color: 'text-emerald-400',bg: 'bg-emerald-500/20',label: 'Хілер',  desc: 'Замість атаки лікує союзника з найнижчим % здоров\'я.' },
  // --- New status-effect perks ---
  burn:      { icon: Flame,        color: 'text-red-500',    bg: 'bg-red-500/20',    label: 'Опік',   desc: 'Підпалює ціль: вогняна шкода (% MaxHP) кожен хід протягом 2 ходів.' },
  shield:    { icon: ShieldPlus,   color: 'text-sky-400',    bg: 'bg-sky-500/20',    label: 'Щит',    desc: 'На початку кожного ходу відновлює щит, що поглинає вхідну шкоду.' },
};

export const PerkBadge = ({ perk, perks, className = '' }) => {
  const listRaw = Array.isArray(perks) ? perks : Array.isArray(perk) ? perk : [perk];
  const list = listRaw.filter(Boolean).filter((p) => PERK_META[p]);
  if (list.length === 0) return null;

  return (
    <div className={`absolute top-1 left-1 z-20 flex flex-col gap-1 ${className}`}>
      {list.slice(0, 2).map((p) => {
        const m = PERK_META[p];
        const Icon = m.icon;
        return (
          <div
            key={p}
            className={`w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full bg-black/80 ${m.color} border border-white/20 shadow-[0_0_6px_rgba(0,0,0,0.8)] backdrop-blur-sm`}
            title={`${m.label}: ${m.desc}`}
          >
            <Icon size={13} className="sm:w-[15px] sm:h-[15px]" strokeWidth={2.5} />
          </div>
        );
      })}
    </div>
  );
};
