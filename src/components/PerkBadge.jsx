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
} from 'lucide-react';

export const PERK_META = {
  crit: { icon: Flame, color: 'text-orange-400', bg: 'bg-orange-500/20', label: 'Крит', desc: 'Шанс завдати подвійну шкоду при атаці.' },
  cleave: { icon: Wind, color: 'text-cyan-400', bg: 'bg-cyan-500/20', label: 'Сплеск', desc: 'Частина шкоди потрапляє на сусідні карти поруч з ціллю.' },
  poison: { icon: Droplets, color: 'text-green-400', bg: 'bg-green-500/20', label: 'Отрута', desc: 'Зараджує ціль отрутою, яка наносить шкоду кожен хід протягом 3 ходів.' },
  lifesteal: { icon: Heart, color: 'text-pink-400', bg: 'bg-pink-500/20', label: 'Вампір', desc: 'Відновлює здоров\'я у відсотках від нанесеної шкоди.' },
  dodge: { icon: Eye, color: 'text-blue-300', bg: 'bg-blue-500/20', label: 'Ухил', desc: 'Шанс повністю уникнути вхідної атаки (MISS).' },
  thorns: { icon: ShieldCheck, color: 'text-amber-400', bg: 'bg-amber-500/20', label: 'Шипи', desc: 'Повертає частину отриманої шкоди назад атакуючому.' },
  armor: { icon: Shield, color: 'text-stone-400', bg: 'bg-stone-500/20', label: 'Броня', desc: 'Зменшує вхідну шкоду на певний відсоток.' },
  laststand: { icon: Skull, color: 'text-yellow-300', bg: 'bg-yellow-500/20', label: '1HP', desc: 'Одноразово виживає з 1 HP замість смерті від смертельного удару.' },
  taunt: { icon: Crosshair, color: 'text-red-400', bg: 'bg-red-500/20', label: 'Таунт', desc: 'Змушує ворогів атакувати цю карту першою, захищаючи союзників.' },
  healer: { icon: Stethoscope, color: 'text-emerald-400', bg: 'bg-emerald-500/20', label: 'Хілер', desc: 'Замість атаки лікує союзника з найнижчим % здоров\'я.' },
};

export const PerkBadge = ({ perk }) => {
  if (!perk || !PERK_META[perk]) return null;
  const m = PERK_META[perk];
  const Icon = m.icon;
  return (
    <div
      className={`absolute top-1 left-1 z-20 w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full bg-black/80 ${m.color} border border-white/20 shadow-[0_0_6px_rgba(0,0,0,0.8)] backdrop-blur-sm`}
      title={`${m.label}: ${m.desc}`}
    >
      <Icon size={13} className="sm:w-[15px] sm:h-[15px]" strokeWidth={2.5} />
    </div>
  );
};
