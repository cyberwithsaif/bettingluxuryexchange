"use client";
import { useEffect, useRef } from "react";
import { motion, useAnimation, useMotionValue } from "framer-motion";

// Standard European roulette wheel order (clockwise from 0 at top)
const WHEEL_ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const SEG_COUNT   = 37;
const SEG_DEG     = 360 / SEG_COUNT;

const EUR_RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

function segColor(n: number): string {
  if (n === 0) return "#00c853";
  return EUR_RED.has(n) ? "#c62828" : "#1a1a1a";
}
function segGlow(n: number): string {
  if (n === 0) return "rgba(0,200,83,0.75)";
  return EUR_RED.has(n) ? "rgba(198,40,40,0.75)" : "rgba(160,160,160,0.35)";
}
function segDark(n: number): string {
  if (n === 0) return "#007a33";
  return EUR_RED.has(n) ? "#7f0000" : "#000";
}

function angleForNumber(n: number): number {
  const idx = WHEEL_ORDER.indexOf(n);
  return idx * SEG_DEG + SEG_DEG / 2;
}

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function segPath(cx: number, cy: number, outerR: number, innerR: number, startDeg: number, endDeg: number) {
  const o1 = polarToCartesian(cx, cy, outerR, startDeg);
  const o2 = polarToCartesian(cx, cy, outerR, endDeg);
  const i1 = polarToCartesian(cx, cy, innerR, endDeg);
  const i2 = polarToCartesian(cx, cy, innerR, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${o1.x} ${o1.y} A ${outerR} ${outerR} 0 ${large} 1 ${o2.x} ${o2.y} L ${i1.x} ${i1.y} A ${innerR} ${innerR} 0 ${large} 0 ${i2.x} ${i2.y} Z`;
}

interface Props {
  phase: "BETTING" | "SPINNING" | "SETTLED";
  winningNumber: number | null;
  spinKey: number;
}

export function EuropeanRouletteWheel({ phase, winningNumber, spinKey }: Props) {
  const CX = 200; const CY = 200; const OR = 185; const IR = 115; const TR = 150;
  const wheelCtrl = useAnimation();
  const ballCtrl  = useAnimation();
  const ballY     = useMotionValue(-165);
  const prevKey   = useRef(spinKey);

  useEffect(() => {
    if (phase !== "SPINNING" || winningNumber == null || prevKey.current === spinKey) return;
    prevKey.current = spinKey;

    const targetAngle = angleForNumber(winningNumber);
    const totalRot    = 8 * 360 + (360 - targetAngle);

    wheelCtrl.start({ rotate: totalRot, transition: { duration: 6.5, ease: [0.04, 0.75, 0.12, 1] } });
    ballCtrl.start({
      y: [-165, -162, -167, -160, -164, -161, -163, -162, -161, -162],
      transition: { duration: 6.5, times: [0,.12,.25,.40,.55,.68,.78,.87,.94,1], ease: "linear" },
    });
  }, [phase, winningNumber, spinKey, wheelCtrl, ballCtrl]);

  useEffect(() => {
    if (phase === "BETTING") {
      wheelCtrl.stop(); ballCtrl.stop();
      wheelCtrl.set({ rotate: 0 }); ballY.set(-165);
    }
  }, [phase, wheelCtrl, ballCtrl, ballY]);

  return (
    <div className="relative flex items-center justify-center select-none" style={{ width: 400, height: 400 }}>
      {/* outer glow ring */}
      <div className="absolute inset-0 rounded-full"
        style={{ boxShadow: "0 0 60px 8px rgba(120,40,0,0.5), 0 0 120px 20px rgba(80,0,0,0.3)" }} />

      {/* wheel SVG */}
      <motion.svg width={400} height={400} viewBox="0 0 400 400" animate={wheelCtrl} style={{ originX: "50%", originY: "50%" }}>
        {/* outer rim */}
        <circle cx={CX} cy={CY} r={OR + 10} fill="#1a0800" stroke="#8b3a00" strokeWidth={3} />

        {/* segments */}
        {WHEEL_ORDER.map((n, i) => {
          const start = i * SEG_DEG - SEG_DEG / 2;
          const end   = start + SEG_DEG;
          const mid   = (start + end) / 2;
          const col   = segColor(n);
          const glow  = segGlow(n);
          const dark  = segDark(n);
          const tp    = polarToCartesian(CX, CY, TR, mid);
          return (
            <g key={n}>
              <defs>
                <radialGradient id={`sg${n}`} cx="50%" cy="50%">
                  <stop offset="0%" stopColor={col} />
                  <stop offset="100%" stopColor={dark} />
                </radialGradient>
              </defs>
              <path d={segPath(CX, CY, OR, IR, start, end)} fill={`url(#sg${n})`} stroke="#3a1a00" strokeWidth={0.5} />
              {/* number label */}
              <text x={tp.x} y={tp.y} textAnchor="middle" dominantBaseline="middle"
                fontSize={SEG_DEG < 10 ? 7 : 9} fontWeight="bold" fill="#fff" opacity={0.9}
                style={{ textShadow: `0 0 4px ${glow}`, transform: `rotate(${mid}deg)`, transformOrigin: `${tp.x}px ${tp.y}px` }}>
                {n}
              </text>
            </g>
          );
        })}

        {/* inner hub */}
        <circle cx={CX} cy={CY} r={IR - 2} fill="url(#hubGrad)" stroke="#8b3a00" strokeWidth={2} />
        <defs>
          <radialGradient id="hubGrad" cx="50%" cy="50%">
            <stop offset="0%" stopColor="#2a0800" />
            <stop offset="100%" stopColor="#0a0000" />
          </radialGradient>
        </defs>
        <text x={CX} y={CY - 6}  textAnchor="middle" fontSize={11} fill="#c8860a" fontWeight="bold" letterSpacing={1}>EUROPEAN</text>
        <text x={CX} y={CY + 8}  textAnchor="middle" fontSize={9}  fill="#a07040" letterSpacing={1}>ROULETTE</text>

        {/* ball */}
        {phase !== "BETTING" && (
          <motion.circle cx={CX} r={7} fill="white" style={{ y: ballY }}
            animate={ballCtrl}
            initial={{ y: -165 }}
            filter="url(#ballShadow)" />
        )}
        <defs>
          <filter id="ballShadow"><feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="rgba(255,255,255,0.8)" /></filter>
        </defs>
      </motion.svg>

      {/* winning badge */}
      {phase === "SETTLED" && winningNumber != null && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
          className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-6xl font-black drop-shadow-2xl"
              style={{ color: winningNumber === 0 ? "#00c853" : EUR_RED.has(winningNumber) ? "#ef5350" : "#e0e0e0", textShadow: "0 0 40px currentColor" }}>
              {winningNumber}
            </div>
            <div className="text-sm font-bold mt-1" style={{ color: winningNumber === 0 ? "#00c853" : EUR_RED.has(winningNumber) ? "#ef5350" : "#9e9e9e" }}>
              {winningNumber === 0 ? "GREEN" : EUR_RED.has(winningNumber) ? "RED" : "BLACK"}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
