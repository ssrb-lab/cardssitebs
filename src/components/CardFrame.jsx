import React from "react";

export default function CardFrame({ frame = "normal", children, className = "" }) {
    // Базовий контейнер для картки, відносно якого будуть позиціонуватись рамки
    // normal - без рамки (повертаємо просто children)

    if (!frame || frame === "normal") {
        return (
            <div className={`relative w-full h-full overflow-hidden rounded-xl bg-neutral-900 ${className}`}>
                {children}
            </div>
        );
    }

    // Загальні класи для всіх рамок (накладаються ПОВЕРХ картинки)
    const baseFrameClass = "pointer-events-none absolute inset-0 z-20 rounded-xl border-[6px]";

    // Класи для конкретних рамок
    const frameStyles = {
        bronze: `${baseFrameClass} border-[#8C5A35] shadow-[inset_0_0_15px_rgba(140,90,53,0.8),_0_0_10px_rgba(140,90,53,0.5)]`,
        silver: `${baseFrameClass} border-slate-300 shadow-[inset_0_0_20px_rgba(255,255,255,0.7),_0_0_15px_rgba(156,163,175,0.8),inset_0_0_5px_rgba(0,0,0,0.5)]`,
        gold: `${baseFrameClass} border-yellow-500 shadow-[inset_0_0_25px_rgba(234,179,8,0.8),_0_0_20px_rgba(234,179,8,0.6),inset_0_0_5px_rgba(0,0,0,0.5)] animate-[gold-pulse_2s_ease-in-out_infinite]`,
        neon: `${baseFrameClass} border-fuchsia-500 shadow-[inset_0_0_30px_rgba(217,70,239,0.8),_0_0_25px_rgba(217,70,239,0.8),_0_0_50px_rgba(217,70,239,0.4)] animate-[neon-pulse_1.5s_ease-in-out_infinite]`,
    };

    return (
        <div className={`relative w-full h-full overflow-hidden rounded-xl bg-neutral-900 ${className}`}>
            {/* Картинка / контент картки */}
            <div className="absolute inset-0 z-0">
                {children}
            </div>

            {/* Сама рамка (накладається зверху поверх картинки) */}
            <div className={frameStyles[frame] || ""}></div>

            {/* Додаткові ефекти для певних рамок (наприклад свічення ззаду) */}
            {frame === "gold" && (
                <div className="absolute inset-[-50%] z-[-2] bg-yellow-500/20 blur-2xl rounded-full animate-spin-slow"></div>
            )}
            {frame === "neon" && (
                <div className="absolute inset-[-50%] z-[-2] bg-fuchsia-500/20 blur-[40px] rounded-full animate-[spin_3s_linear_infinite]"></div>
            )}
        </div>
    );
}
