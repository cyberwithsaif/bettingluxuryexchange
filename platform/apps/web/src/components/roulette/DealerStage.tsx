"use client";
import { motion } from "framer-motion";

/**
 * Animated casino "stage" backdrop with a stylized SVG dealer silhouette.
 * The dealer waves and the chandeliers shimmer for a live-table feel.
 */
export function DealerStage() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl">
      {/* Casino room gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#2a0e16] via-[#1a0610] to-[#0a0507]" />

      {/* Floor reflection */}
      <div className="absolute bottom-0 inset-x-0 h-1/3 bg-gradient-to-t from-yellow-900/10 to-transparent" />

      {/* Ceiling chandeliers (twinkles) */}
      {[...Array(7)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute top-3 w-1.5 h-1.5 rounded-full bg-yellow-300 shadow-[0_0_12px_4px_rgba(255,200,80,0.6)]"
          style={{ left: `${10 + i * 13}%` }}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 2 + (i % 3), repeat: Infinity, delay: i * 0.3 }}
        />
      ))}

      {/* Side ambient lights */}
      <div className="absolute top-1/4 left-2 w-16 h-32 bg-red-500/20 rounded-full blur-3xl" />
      <div className="absolute top-1/4 right-2 w-16 h-32 bg-yellow-500/15 rounded-full blur-3xl" />

      {/* Stylized dealer silhouette (SVG, on the right side) */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 1 }}
        className="absolute right-4 bottom-2 w-32 h-48 hidden md:block"
      >
        <svg viewBox="0 0 100 160" className="w-full h-full drop-shadow-[0_0_15px_rgba(255,200,80,0.3)]">
          <defs>
            <linearGradient id="dealerBody" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7d1538" />
              <stop offset="50%" stopColor="#a31f4d" />
              <stop offset="100%" stopColor="#5a0e2a" />
            </linearGradient>
            <linearGradient id="dealerGold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fcd34d" />
              <stop offset="100%" stopColor="#b78628" />
            </linearGradient>
            <radialGradient id="dealerFace">
              <stop offset="0%" stopColor="#f3c595" />
              <stop offset="100%" stopColor="#b88b5e" />
            </radialGradient>
          </defs>

          {/* Hair (back) */}
          <path d="M 30 28 Q 25 50, 32 62 L 68 62 Q 75 50, 70 28 Z" fill="#2a1a0e" />

          {/* Body / sari */}
          <path
            d="M 40 60 Q 25 80, 28 130 Q 28 145, 35 152 L 65 152 Q 72 145, 72 130 Q 75 80, 60 60 Z"
            fill="url(#dealerBody)"
          />
          {/* Sari gold border */}
          <path
            d="M 28 130 Q 28 145, 35 152 L 65 152 Q 72 145, 72 130"
            stroke="url(#dealerGold)"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M 40 60 Q 35 75, 32 92"
            stroke="url(#dealerGold)"
            strokeWidth="1.5"
            fill="none"
          />

          {/* Neck */}
          <rect x="44" y="48" width="12" height="14" fill="url(#dealerFace)" />

          {/* Face */}
          <ellipse cx="50" cy="36" rx="14" ry="17" fill="url(#dealerFace)" />

          {/* Hair (front) */}
          <path d="M 36 25 Q 50 12, 64 25 Q 62 32, 50 28 Q 38 32, 36 25 Z" fill="#2a1a0e" />

          {/* Eyes */}
          <ellipse cx="45" cy="36" rx="1.2" ry="1.5" fill="#1a0e0a" />
          <ellipse cx="55" cy="36" rx="1.2" ry="1.5" fill="#1a0e0a" />

          {/* Smile */}
          <path d="M 46 43 Q 50 46, 54 43" stroke="#7d1538" strokeWidth="0.8" fill="none" strokeLinecap="round" />

          {/* Bindi */}
          <circle cx="50" cy="27" r="1" fill="#dc2626" />

          {/* Earrings (gold) */}
          <circle cx="36" cy="38" r="1.5" fill="url(#dealerGold)" />
          <circle cx="64" cy="38" r="1.5" fill="url(#dealerGold)" />

          {/* Necklace */}
          <path d="M 42 56 Q 50 62, 58 56" stroke="url(#dealerGold)" strokeWidth="1" fill="none" />
          <circle cx="50" cy="60" r="1.5" fill="url(#dealerGold)" />

          {/* Arms — one waving */}
          <motion.path
            d="M 38 70 Q 22 72, 22 90 Q 22 100, 28 102"
            fill="url(#dealerBody)"
            stroke="url(#dealerGold)"
            strokeWidth="0.6"
            animate={{ d: ["M 38 70 Q 22 72, 22 90 Q 22 100, 28 102", "M 38 70 Q 18 60, 14 75 Q 12 88, 18 92", "M 38 70 Q 22 72, 22 90 Q 22 100, 28 102"] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
          <path
            d="M 62 70 Q 78 72, 78 90 Q 78 100, 72 102"
            fill="url(#dealerBody)"
            stroke="url(#dealerGold)"
            strokeWidth="0.6"
          />

          {/* Bangles (gold) */}
          <circle cx="28" cy="102" r="3" fill="none" stroke="url(#dealerGold)" strokeWidth="0.6" />
          <circle cx="72" cy="102" r="3" fill="none" stroke="url(#dealerGold)" strokeWidth="0.6" />
        </svg>
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-black/60 border border-yellow-600/40 text-[9px] uppercase tracking-widest text-yellow-300 whitespace-nowrap">
          ● Live Dealer
        </div>
      </motion.div>

      {/* Decorative red velvet rope at bottom */}
      <div className="absolute bottom-0 inset-x-0 h-2 bg-gradient-to-r from-yellow-900/30 via-red-800/50 to-yellow-900/30" />
    </div>
  );
}
