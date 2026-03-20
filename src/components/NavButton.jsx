import React from 'react';

export default function NavButton({ icon, label, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center p-1.5 sm:p-2 rounded-lg w-12 sm:w-20 transition-all duration-300 active:scale-95 ${isActive ? 'text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]' : 'text-neutral-500 hover:text-neutral-300'}`}
    >
      {isActive && (
        <span className="absolute -top-1 sm:-top-2 left-1/2 -translate-x-1/2 w-5 sm:w-6 h-0.5 sm:h-1 bg-yellow-400 rounded-b-md shadow-[0_0_10px_rgba(250,204,21,0.8)]"></span>
      )}
      <span className="[&>svg]:w-[18px] [&>svg]:h-[18px] sm:[&>svg]:w-[22px] sm:[&>svg]:h-[22px]">{icon}</span>
      <span className="text-[8px] sm:text-[10px] mt-0.5 sm:mt-1 font-bold uppercase tracking-wider leading-tight">
        {label}
      </span>
    </button>
  );
}
