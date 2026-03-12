import React from 'react';
import { X, Heart, ExternalLink } from 'lucide-react';

export default function DonateModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative bg-neutral-900 border border-pink-500/30 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl shadow-pink-500/10 animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-gradient-to-br from-pink-500/20 to-purple-500/20 p-6 sm:p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_right,rgba(236,72,153,0.1),transparent_50%)]" />
          
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-neutral-400 hover:text-white bg-black/20 hover:bg-black/40 rounded-full p-2 transition-colors z-10"
          >
            <X size={20} />
          </button>

          <div className="relative z-10 flex flex-col items-center">
            <div className="w-16 h-16 bg-gradient-to-br from-pink-500 to-purple-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-pink-500/25">
              <Heart size={32} className="text-white fill-white" />
            </div>
            
            <h2 className="text-2xl sm:text-3xl font-black text-white mb-2 tracking-tight">
              Підтримати проєкт
            </h2>
            
            <p className="text-neutral-300 text-sm sm:text-base leading-relaxed mb-6">
              Тобі подобається наша гра? Твій донат допомагає нам оплачувати хостинг та створювати нові функції. Це найкраща мотивація для нас продовжувати розвиток проєкту та покращувати ігровий досвід. Будь-яка сума важлива! ❤️
            </p>

            <a
              href="https://send.monobank.ua/jar/3t5ULx6Qx2"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative w-full flex items-center justify-center gap-3 bg-white text-black font-bold py-4 px-6 rounded-2xl overflow-hidden transition-transform hover:scale-[1.02] active:scale-95"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-pink-100 to-purple-100 opacity-0 group-hover:opacity-100 transition-opacity" />
              <img 
                src="https://seeklogo.com/images/M/monobank-logo-4E0513B7DB-seeklogo.com.png" 
                alt="Monobank" 
                className="w-6 h-6 object-contain relative z-10"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
              <span className="relative z-10 text-lg">Поповнити Банку</span>
              <ExternalLink size={20} className="relative z-10 text-neutral-600" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}