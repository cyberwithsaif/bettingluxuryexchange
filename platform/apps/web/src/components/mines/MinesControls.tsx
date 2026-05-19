"use client";

import React from "react";
import { MinesState } from "./MinesLayout";

interface MinesControlsProps {
  isLoggedIn: boolean;
  gameState: MinesState;
  setGameState: React.Dispatch<React.SetStateAction<MinesState>>;
  handleBet: () => void;
  handleCashout: () => void;
  loading: boolean;
}

export default function MinesControls({ isLoggedIn, gameState, setGameState, handleBet, handleCashout, loading }: MinesControlsProps) {
  const isPlaying = gameState.status === "IN_PROGRESS";

  const onBetAmountChange = (val: number) => {
    if (isPlaying) return;
    setGameState(prev => ({ ...prev, betAmount: val }));
  };

  const onMinesChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (isPlaying) return;
    setGameState(prev => ({ ...prev, minesCount: parseInt(e.target.value) }));
  };

  return (
    <div className="space-y-4">
      {/* Bet Amount */}
      <div>
        <div className="flex justify-between text-sm text-gray-400 mb-1 font-semibold">
          <span>Bet Amount</span>
          <span>₹</span>
        </div>
        <div className="flex bg-[#0f212e] rounded border border-gray-700 overflow-hidden focus-within:border-gray-500 transition">
          <input
            type="number"
            className="w-full bg-transparent text-white p-2 outline-none font-semibold"
            value={gameState.betAmount || ""}
            onChange={(e) => {
              const val = e.target.value === "" ? 0 : Number(e.target.value);
              onBetAmountChange(val);
            }}
            onBlur={() => {
              setGameState(prev => ({ ...prev, betAmount: Math.max(10, prev.betAmount) }));
            }}
            disabled={isPlaying}
          />
          <button 
            className="px-3 bg-[#2f4553] hover:bg-[#3d5566] text-sm text-white font-bold disabled:opacity-50"
            onClick={() => onBetAmountChange(Math.max(10, Math.round(gameState.betAmount / 2)))}
            disabled={isPlaying}
          >½</button>
          <div className="w-[1px] bg-gray-700"></div>
          <button 
            className="px-3 bg-[#2f4553] hover:bg-[#3d5566] text-sm text-white font-bold disabled:opacity-50"
            onClick={() => onBetAmountChange(Math.max(10, Math.round(gameState.betAmount * 2)))}
            disabled={isPlaying}
          >2×</button>
        </div>
      </div>

      {/* Mines Count */}
      <div>
        <label className="text-sm text-gray-400 mb-1 font-semibold block">Mines</label>
        <select 
          className="w-full bg-[#0f212e] text-white p-2 rounded border border-gray-700 outline-none focus:border-gray-500 font-semibold disabled:opacity-50"
          value={gameState.minesCount}
          onChange={onMinesChange}
          disabled={isPlaying}
        >
          {Array.from({ length: 24 }, (_, i) => i + 1).map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      {/* Action Button */}
      <div className="pt-2">
        {!isLoggedIn ? (
          <button 
            onClick={() => window.location.href = "/auth/login"}
            className="w-full bg-[#00e701] hover:bg-[#1fff20] text-[#0f212e] font-bold text-lg py-3 rounded shadow-[0_0_10px_rgba(0,231,1,0.3)] transition transform active:scale-95"
          >
            Login to Play
          </button>
        ) : !isPlaying ? (
          <button 
            onClick={handleBet}
            disabled={loading}
            className="w-full bg-[#00e701] hover:bg-[#1fff20] text-[#0f212e] font-bold text-lg py-3 rounded shadow-[0_0_10px_rgba(0,231,1,0.3)] transition transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Starting..." : "Bet"}
          </button>
        ) : (
          <button 
            onClick={handleCashout}
            disabled={loading || gameState.clickedTiles.length === 0}
            className="w-full bg-[#00e701] hover:bg-[#1fff20] text-[#0f212e] font-bold text-lg py-3 rounded shadow-[0_0_10px_rgba(0,231,1,0.3)] transition transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Cashing out..." : `Cashout ${gameState.clickedTiles.length > 0 ? (gameState.betAmount * gameState.multiplier).toFixed(2) : ""}`}
          </button>
        )}
      </div>
      
      {/* Random helper UI for visual parity with stake */}
      {isPlaying && (
        <div className="grid grid-cols-2 gap-2 text-xs">
           <button 
              className="bg-[#0f212e] border border-gray-700 text-gray-400 p-2 rounded hover:text-white disabled:opacity-50"
              disabled={loading}
              onClick={() => {
                // Click random available tile - implement if needed
              }}
           >
             Pick Random
           </button>
        </div>
      )}
    </div>
  );
}
