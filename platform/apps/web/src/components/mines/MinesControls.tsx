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
  minBet: number;
  maxBet: number;
}

export default function MinesControls({ isLoggedIn, gameState, setGameState, handleBet, handleCashout, loading, minBet, maxBet }: MinesControlsProps) {
  const isPlaying = gameState.status === "IN_PROGRESS";

  const onBetAmountChange = (val: number) => {
    if (isPlaying) return;
    setGameState(prev => ({ ...prev, betAmount: val }));
  };

  const onMinesChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (isPlaying) return;
    setGameState(prev => ({ ...prev, minesCount: parseInt(e.target.value) }));
  };

  const cashoutBtn = isPlaying && (
    <button
      onClick={handleCashout}
      disabled={loading || gameState.clickedTiles.length === 0}
      className="w-full bg-[#00e701] hover:bg-[#1fff20] text-[#0f212e] font-bold text-base md:text-lg py-2.5 md:py-3 rounded shadow-[0_0_10px_rgba(0,231,1,0.3)] transition transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? "Cashing out..." : `Cashout ${gameState.clickedTiles.length > 0 ? (gameState.betAmount * gameState.multiplier).toFixed(2) : ""}`}
    </button>
  );

  return (
    <div className="space-y-3 md:space-y-4">
      {/* Cashout first on mobile when playing */}
      {isPlaying && <div className="md:hidden">{cashoutBtn}</div>}

      {/* Bet Amount */}
      <div>
        <div className="flex justify-between text-xs md:text-sm text-gray-400 mb-1 font-semibold">
          <span>Bet Amount</span>
          <span>₹</span>
        </div>
        <div className="flex bg-[#0f212e] rounded border border-gray-700 overflow-hidden focus-within:border-gray-500 transition">
          <input
            type="number"
            min={minBet}
            max={maxBet}
            className="w-full bg-transparent text-white p-2 outline-none font-semibold"
            value={gameState.betAmount || ""}
            onChange={(e) => {
              const val = e.target.value === "" ? 0 : Number(e.target.value);
              onBetAmountChange(val);
            }}
            onBlur={() => {
              setGameState(prev => ({ ...prev, betAmount: Math.max(minBet, prev.betAmount) }));
            }}
            disabled={isPlaying}
          />
          <button
            className="px-3 bg-[#2f4553] hover:bg-[#3d5566] text-sm text-white font-bold disabled:opacity-50"
            onClick={() => onBetAmountChange(Math.max(minBet, Math.round(gameState.betAmount / 2)))}
            disabled={isPlaying}
          >½</button>
          <div className="w-[1px] bg-gray-700"></div>
          <button
            className="px-3 bg-[#2f4553] hover:bg-[#3d5566] text-sm text-white font-bold disabled:opacity-50"
            onClick={() => onBetAmountChange(Math.min(maxBet, Math.round(gameState.betAmount * 2)))}
            disabled={isPlaying}
          >2×</button>
        </div>
        <p className="text-[10px] text-gray-600 mt-0.5">Min: ₹{minBet.toLocaleString("en-IN")} · Max: ₹{maxBet.toLocaleString("en-IN")}</p>

        {/* Suggestions */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {[100, 500, 1000, 2500, 5000, 10000].map((v) => {
            const clamped = Math.min(maxBet, Math.max(minBet, v));
            const active = gameState.betAmount === clamped;
            return (
              <button
                key={v}
                onClick={() => onBetAmountChange(clamped)}
                disabled={isPlaying}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition disabled:opacity-40 ${
                  active
                    ? "bg-[#557086] text-white"
                    : "bg-[#2f4553] text-gray-300 hover:bg-[#3d5566]"
                }`}
              >
                ₹{v.toLocaleString("en-IN")}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mines Count */}
      <div>
        <label className="text-xs md:text-sm text-gray-400 mb-1 font-semibold block">Mines</label>
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
      <div className="pt-1 md:pt-2">
        {!isLoggedIn ? (
          <button
            onClick={() => window.location.href = "/auth/login"}
            className="w-full bg-[#00e701] hover:bg-[#1fff20] text-[#0f212e] font-bold text-base md:text-lg py-2.5 md:py-3 rounded shadow-[0_0_10px_rgba(0,231,1,0.3)] transition transform active:scale-95"
          >
            Login to Play
          </button>
        ) : !isPlaying ? (
          <button
            onClick={handleBet}
            disabled={loading}
            className="w-full bg-[#00e701] hover:bg-[#1fff20] text-[#0f212e] font-bold text-base md:text-lg py-2.5 md:py-3 rounded shadow-[0_0_10px_rgba(0,231,1,0.3)] transition transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Starting..." : "Bet"}
          </button>
        ) : (
          /* Desktop: cashout sits here in the natural flow; mobile: hidden (shown at top) */
          <div className="hidden md:block">{cashoutBtn}</div>
        )}
      </div>

      {isPlaying && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <button
            className="bg-[#0f212e] border border-gray-700 text-gray-400 p-2 rounded hover:text-white disabled:opacity-50"
            disabled={loading}
            onClick={() => {}}
          >
            Pick Random
          </button>
        </div>
      )}
    </div>
  );
}
