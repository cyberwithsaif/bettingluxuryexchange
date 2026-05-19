"use client";

import React from "react";
import { MinesState } from "./MinesLayout";
import { motion, AnimatePresence } from "framer-motion";

interface MinesGridProps {
  gameState: MinesState;
  onTileClick: (index: number) => void;
}

export default function MinesGrid({ gameState, onTileClick }: MinesGridProps) {
  const { status, clickedTiles, minePositions } = gameState;
  const isGameOver = status === "BUSTED" || status === "CASHED_OUT";

  const renderTile = (i: number) => {
    const clickedInfo = clickedTiles.find((t) => t.tile === i);
    const isClicked = !!clickedInfo;
    
    // If game is over, reveal remaining tiles
    const isMine = minePositions?.includes(i);
    const shouldReveal = isGameOver && !isClicked;
    
    let content = null;
    let tileBg = "bg-[#2f4553] shadow-[0_4px_0_0_#213743]"; // Default unclicked

    if (isClicked) {
      if (clickedInfo.isMine) {
        tileBg = "bg-red-500 shadow-none";
        content = (
          <motion.div initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring" }}>
            <svg viewBox="0 0 64 64" className="w-10 h-10 drop-shadow-[0_0_12px_rgba(255,80,80,0.8)]" fill="none" xmlns="http://www.w3.org/2000/svg">
              <text x="50%" y="54%" fontSize="42" textAnchor="middle" dominantBaseline="middle">💣</text>
            </svg>
          </motion.div>
        );
      } else {
        tileBg = "bg-[#0f212e] shadow-none";
        content = (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.6 }}>
            <svg viewBox="0 0 64 64" className="w-10 h-10 drop-shadow-[0_0_15px_rgba(0,255,180,0.8)]" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Diamond gem shape */}
              <polygon points="32,4 60,24 32,60 4,24" fill="url(#gemGrad)" stroke="rgba(0,255,200,0.6)" strokeWidth="1.5"/>
              <polygon points="32,4 60,24 32,28 4,24" fill="url(#gemTop)" opacity="0.9"/>
              <polygon points="32,28 60,24 32,60" fill="url(#gemBottom)" opacity="0.8"/>
              <line x1="4" y1="24" x2="60" y2="24" stroke="rgba(255,255,255,0.4)" strokeWidth="1"/>
              <line x1="32" y1="4" x2="32" y2="28" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8"/>
              <defs>
                <linearGradient id="gemGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#00ffcc"/>
                  <stop offset="50%" stopColor="#0080ff"/>
                  <stop offset="100%" stopColor="#00ffcc"/>
                </linearGradient>
                <linearGradient id="gemTop" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="white" stopOpacity="0.9"/>
                  <stop offset="100%" stopColor="#00ffcc" stopOpacity="0.3"/>
                </linearGradient>
                <linearGradient id="gemBottom" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#0080ff" stopOpacity="0.6"/>
                  <stop offset="100%" stopColor="#004488" stopOpacity="0.9"/>
                </linearGradient>
              </defs>
            </svg>
          </motion.div>
        );
      }
    } else if (shouldReveal) {
      tileBg = "bg-[#0f212e] shadow-none opacity-50";
      content = isMine ? (
        <span className="text-3xl opacity-70">💣</span>
      ) : (
        <span className="text-3xl opacity-70">💎</span>
      );
    }

    return (
      <button
        key={i}
        disabled={isClicked || isGameOver}
        onClick={() => onTileClick(i)}
        className={`relative w-full aspect-square rounded-lg flex items-center justify-center transition-all duration-200 ${tileBg} ${
          !isClicked && !isGameOver ? "hover:bg-[#3d5566] hover:-translate-y-1 hover:shadow-[0_6px_0_0_#213743] active:translate-y-1 active:shadow-none cursor-pointer" : "cursor-default"
        }`}
      >
        {content}
      </button>
    );
  };

  return (
    <div className="grid grid-cols-5 gap-3 p-4 bg-[#213743] rounded-xl shadow-inner w-full max-w-lg aspect-square">
      {Array.from({ length: 25 }, (_, i) => renderTile(i))}
    </div>
  );
}
