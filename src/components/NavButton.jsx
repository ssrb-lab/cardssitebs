import React from 'react';

export default function NavButton({ icon, label, isActive, onClick }) {
  return (
    <button 
        onClick={onClick} 
        className={`flex flex-col items-center p-2 rounded-lg w-16 sm:w-20 transition-colors ${isActive ? "text-yellow-500" : "text-neutral-500 hover:text-neutral-300"}`}
    >
      {icon}
      <span className="text-[9px] sm:text-[10px] mt-1 font-bold uppercase tracking-wider">{label}</span>
    </button>
  );
}