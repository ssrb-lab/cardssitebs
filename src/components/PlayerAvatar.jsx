import React from 'react';
import { Crown, Shield } from 'lucide-react';

export default function PlayerAvatar({ profile, className = "", iconSize = 24 }) {
    if (profile?.avatarUrl) {
        return (
            <div className={`overflow-hidden bg-neutral-800 ${className} flex items-center justify-center border-2 border-neutral-700 shadow-md relative shrink-0`}>
                <img src={profile.avatarUrl} alt="avatar" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                {profile.isSuperAdmin && <Crown size={14} className="absolute top-0 right-0 text-red-500 bg-neutral-900 rounded-full" title="Супер Адмін" />}
            </div>
        );
    }
    
    const bgClass = profile?.isSuperAdmin ? "bg-red-900 border-red-500 text-red-200" :
                    profile?.isAdmin ? "bg-purple-900 border-purple-500 text-purple-200" : "bg-neutral-800 border-neutral-700 text-yellow-500";
    
    let initial = "U";
    if (profile?.nickname && typeof profile.nickname === "string" && profile.nickname.length > 0) {
        initial = profile.nickname.charAt(0).toUpperCase();
    }

    return (
        <div className={`flex items-center justify-center font-bold border-2 shadow-sm shrink-0 ${bgClass} ${className}`}>
            {profile?.isSuperAdmin ? <Crown size={iconSize} /> : profile?.isAdmin ? <Shield size={iconSize} /> : initial}
        </div>
    );
}