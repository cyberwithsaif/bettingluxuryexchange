"use client";

import React from "react";
import { MinesState } from "./MinesLayout";
import { X, Copy } from "lucide-react";

interface ProvablyFairModalProps {
  gameState: MinesState;
  onClose: () => void;
}

export default function ProvablyFairModal({ gameState, onClose }: ProvablyFairModalProps) {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1a2c38] w-full max-w-lg rounded-xl shadow-2xl border border-gray-700 overflow-hidden">
        <div className="bg-[#213743] px-6 py-4 flex items-center justify-between border-b border-gray-700">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            Provably Fair
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="space-y-4">
             <div>
               <label className="text-xs text-gray-400 font-bold uppercase mb-1 block">Server Seed (Hash)</label>
               <div className="flex bg-[#0f212e] rounded border border-gray-700 p-2 text-sm text-gray-300 break-all">
                 <span className="flex-1">{gameState.serverSeedHash || "Waiting for game..."}</span>
               </div>
             </div>
             
             <div>
               <label className="text-xs text-gray-400 font-bold uppercase mb-1 block">Client Seed</label>
               <div className="flex bg-[#0f212e] rounded border border-gray-700 p-2 text-sm text-gray-300">
                 <span className="flex-1">{gameState.clientSeed}</span>
               </div>
             </div>

             {gameState.status === "BUSTED" || gameState.status === "CASHED_OUT" ? (
               <div>
                 <label className="text-xs text-green-400 font-bold uppercase mb-1 block">Revealed Server Seed</label>
                 <div className="flex bg-[#0f212e] rounded border border-green-500/50 p-2 text-sm text-green-300 break-all">
                   <span className="flex-1">{gameState.serverSeed}</span>
                   <button onClick={() => copyToClipboard(gameState.serverSeed || "")} className="ml-2 text-gray-400 hover:text-white">
                     <Copy size={16} />
                   </button>
                 </div>
                 <p className="text-xs text-gray-500 mt-2">
                   You can verify the game result by computing the HMAC-SHA256 of the Server Seed and Client Seed.
                 </p>
               </div>
             ) : (
               <div className="text-xs text-yellow-500/80 bg-yellow-500/10 p-3 rounded">
                 The unhashed Server Seed will be revealed once the game ends.
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
