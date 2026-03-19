import React from 'react';

export default function NavButton({ icon, label, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center p-2 rounded-lg w-16 sm:w-20 transition-all duration-300 active:scale-95 ${isActive ? 'text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]' : 'text-neutral-500 hover:text-neutral-300'}`}
    >
      {isActive && (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-6 h-1 bg-yellow-400 rounded-b-md shadow-[0_0_10px_rgba(250,204,21,0.8)]"></span>
      )}
      {icon}
      <span className="text-[9px] sm:text-[10px] mt-1 font-bold uppercase tracking-wider">
        {label}
      </span>
    </button>
  );
}
