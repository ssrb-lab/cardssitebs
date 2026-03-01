import React from 'react';
import {
    Trophy, Medal, Star, Crown, Shield, Swords, Zap, Flame,
    Target, Heart, Gem, Hexagon, Octagon, Rocket, Anchor,
    Ghost, Skull, Award, CheckCircle, Crosshair, Sparkles, Sprout
} from 'lucide-react';

export const ACHIEVEMENT_PRESETS = {
    'Trophy': Trophy,
    'Medal': Medal,
    'Star': Star,
    'Crown': Crown,
    'Shield': Shield,
    'Swords': Swords,
    'Zap': Zap,
    'Flame': Flame,
    'Target': Target,
    'Heart': Heart,
    'Gem': Gem,
    'Hexagon': Hexagon,
    'Octagon': Octagon,
    'Rocket': Rocket,
    'Anchor': Anchor,
    'Ghost': Ghost,
    'Skull': Skull,
    'Award': Award,
    'CheckCircle': CheckCircle,
    'Crosshair': Crosshair,
    'Sparkles': Sparkles,
    'Sprout': Sprout
};

export default function AchievementIcon({ iconUrl, className, size = 32 }) {
    if (!iconUrl) {
        return (
            <div className={`flex items-center justify-center bg-gradient-to-br from-yellow-900/40 to-yellow-600/10 text-yellow-500 border border-yellow-600/30 ${className}`}>
                <Trophy size={size} />
            </div>
        );
    }

    // Якщо це кастомний URL
    if (iconUrl.startsWith('http://') || iconUrl.startsWith('https://') || iconUrl.startsWith('/') || iconUrl.startsWith('data:')) {
        return <img src={iconUrl} alt="achievement" className={className} loading="lazy" />;
    }

    // Якщо це SVG-пресет
    const IconComponent = ACHIEVEMENT_PRESETS[iconUrl] || Trophy;

    return (
        <div className={`flex items-center justify-center bg-gradient-to-br from-yellow-900/40 to-yellow-600/10 text-yellow-500 border border-yellow-600/30 shadow-[0_0_15px_rgba(234,179,8,0.15)] ${className}`}>
            <IconComponent size={size} />
        </div>
    );
}
