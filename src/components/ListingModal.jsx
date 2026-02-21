import React, { useState } from 'react';
import { Coins } from 'lucide-react';

export default function ListingModal({ listingCard, setListingCard, listOnMarket, isProcessing }) {
    const [price, setPrice] = useState("");

    const handleSubmit = (e) => {
        e.preventDefault();
        listOnMarket(listingCard.id, Number(price));
    };

    return (
       <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => !isProcessing && setListingCard(null)}>
           <div className="bg-neutral-900 border border-blue-900/50 p-6 rounded-3xl shadow-[0_0_50px_rgba(37,99,235,0.2)] max-w-sm w-full animate-in zoom-in-95 relative" onClick={e => e.stopPropagation()}>
               <div className="flex items-center gap-3 mb-6 border-b border-neutral-800 pb-4">
                   <div className="w-16 h-24 rounded-lg overflow-hidden border border-neutral-700 shrink-0">
                       <img src={listingCard.image} alt={listingCard.name} className="w-full h-full object-cover" />
                   </div>
                   <div>
                       <h3 className="text-lg font-black text-white leading-tight">{listingCard.name}</h3>
                       <div className="text-xs text-neutral-400 mt-1">Виставлення на Ринок</div>
                   </div>
               </div>

               <form onSubmit={handleSubmit} className="space-y-4">
                   <div>
                       <label className="text-xs font-bold text-neutral-400 uppercase mb-2 block">Ваша ціна (Монети):</label>
                       <div className="relative">
                           <Coins className="absolute left-4 top-1/2 -translate-y-1/2 text-yellow-500 w-5 h-5" />
                           <input type="number" min="1" value={price} onChange={e => setPrice(e.target.value)} placeholder="Наприклад: 1000" required className="w-full bg-neutral-950 border border-neutral-700 rounded-xl pl-12 pr-4 py-4 text-white focus:border-blue-500 outline-none text-lg font-bold" />
                       </div>
                   </div>
                   <div className="flex gap-3 pt-2">
                       <button type="submit" disabled={isProcessing} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-black py-4 rounded-xl transition-colors shadow-lg shadow-blue-900/20">Продати</button>
                       <button type="button" disabled={isProcessing} onClick={() => setListingCard(null)} className="bg-neutral-800 hover:bg-neutral-700 text-white font-bold py-4 px-6 rounded-xl transition-colors">Скасувати</button>
                   </div>
               </form>
           </div>
       </div>
    );
}