"use client";
import { useEffect, useRef } from "react";
import { motion, useAnimation, useMotionValue } from "framer-motion";

// Mini Roulette wheel order (clockwise from top): alternating high/low
const WHEEL_ORDER = [0, 5, 1, 6, 2, 7, 3, 8, 4, 9];
const SEG_COUNT   = 10;
const SEG_DEG     = 360 / SEG_COUNT; // 36° each

function segColor(n: number): string {
  if (n === 0) return "#00c853";
  if ([1, 3, 5, 7, 9].includes(n)) return "#e53935";
  return "#1a1a1a";
}
function segGlow(n: number): string {
  if (n === 0) return "rgba(0,200,83,0.75)";
  if ([1, 3, 5, 7, 9].includes(n)) return "rgba(229,57,53,0.75)";
  return "rgba(160,160,160,0.35)";
}
function segDark(n: number): string {
  if (n === 0) return "#007a33";
  if ([1, 3, 5, 7, 9].includes(n)) return "#7f0000";
  return "#000";
}

function angleForNumber(n: number): number {
  const idx = WHEEL_ORDER.indexOf(n);
  return idx * SEG_DEG + SEG_DEG / 2;
}

interface Props {
  phase:         "BETTING" | "CLOSED" | "SPINNING" | "SETTLED";
  winningNumber: number | null;
  spinKey:       number;
}

const cx = 170, cy = 170, R = 158, RI = 50;

function buildPath(segIndex: number): string {
  const start = segIndex * SEG_DEG - 90;
  const end   = start + SEG_DEG;
  const rad   = (d: number) => (d * Math.PI) / 180;
  const [x1,y1] = [cx + R  * Math.cos(rad(start)), cy + R  * Math.sin(rad(start))];
  const [x2,y2] = [cx + R  * Math.cos(rad(end)),   cy + R  * Math.sin(rad(end))];
  const [x3,y3] = [cx + RI * Math.cos(rad(end)),   cy + RI * Math.sin(rad(end))];
  const [x4,y4] = [cx + RI * Math.cos(rad(start)), cy + RI * Math.sin(rad(start))];
  return `M${x1} ${y1} A${R} ${R} 0 0 1 ${x2} ${y2} L${x3} ${y3} A${RI} ${RI} 0 0 0 ${x4} ${y4}Z`;
}
function labelXY(segIndex: number): [number, number] {
  const mid = (segIndex * SEG_DEG + SEG_DEG / 2 - 90) * (Math.PI / 180);
  const lr  = 106;
  return [cx + lr * Math.cos(mid), cy + lr * Math.sin(mid)];
}
function pinXY(segIndex: number): [number, number] {
  const deg = (segIndex * SEG_DEG - 90) * (Math.PI / 180);
  return [cx + R * Math.cos(deg), cy + R * Math.sin(deg)];
}

export function RouletteWheel({ phase, winningNumber, spinKey }: Props) {
  const wheelCtrl = useAnimation();
  const ballCtrl  = useAnimation();
  const rotVal    = useMotionValue(0);
  const prevKey   = useRef(-1);

  useEffect(() => {
    if (phase !== "SPINNING" || winningNumber === null) return;
    if (prevKey.current === spinKey) return;
    prevKey.current = spinKey;

    const targetAngle = angleForNumber(winningNumber);
    const totalRot    = 8 * 360 + (360 - targetAngle);

    wheelCtrl.start({
      rotate: totalRot,
      transition: { duration: 4.6, ease: [0.04, 0.75, 0.12, 1] },
    });

    ballCtrl.start({
      y: [-165, -165, -165, -148, -153, -147, -150, -148, -149, -148],
      transition: {
        duration: 4.6,
        times:    [0, 0.38, 0.54, 0.63, 0.72, 0.80, 0.87, 0.92, 0.96, 1],
        ease: "easeOut",
      },
    });
  }, [phase, winningNumber, spinKey, wheelCtrl, ballCtrl]);

  useEffect(() => {
    if (phase === "BETTING") {
      ballCtrl.start({ y: -165, transition: { duration: 0.4 } });
    }
  }, [phase, ballCtrl]);

  const isResult = phase === "SETTLED" && winningNumber !== null;

  return (
    <div className="relative flex items-center justify-center select-none" style={{ width: 340, height: 340 }}>
      {/* Outer glow */}
      <div className="absolute inset-0 rounded-full pointer-events-none" style={{
        boxShadow: isResult && winningNumber !== null
          ? `0 0 70px 24px ${segGlow(winningNumber)}, 0 0 140px 50px ${segGlow(winningNumber)}`
          : "0 0 45px 10px rgba(255,200,0,0.22)",
        borderRadius: "50%",
        transition: "box-shadow 0.6s ease",
      }} />

      {/* Spinning wheel SVG */}
      <motion.div animate={wheelCtrl} style={{ rotate: rotVal, position: "absolute", width: 340, height: 340 }}>
        <svg viewBox="0 0 340 340" width="340" height="340" style={{ overflow: "visible" }}>
          <defs>
            {WHEEL_ORDER.map(n => (
              <radialGradient key={`g${n}`} id={`sg${n}`} cx="55%" cy="38%" r="72%">
                <stop offset="0%"   stopColor={segColor(n)} />
                <stop offset="100%" stopColor={segDark(n)} />
              </radialGradient>
            ))}
            <radialGradient id="hubG" cx="50%" cy="38%" r="62%">
              <stop offset="0%" stopColor="#303030" />
              <stop offset="100%" stopColor="#0a0a0a" />
            </radialGradient>
          </defs>

          {/* Outer border ring */}
          <circle cx={cx} cy={cy} r={R+8}  fill="#0a0a0a" stroke="rgba(255,200,0,0.6)" strokeWidth="3" />
          <circle cx={cx} cy={cy} r={R+2}  fill="none"    stroke="rgba(255,200,0,0.2)" strokeWidth="1" />

          {/* Segments */}
          {WHEEL_ORDER.map((n, i) => {
            const [lx, ly] = labelXY(i);
            const [px, py] = pinXY(i);
            return (
              <g key={n}>
                <path d={buildPath(i)} fill={`url(#sg${n})`} stroke="rgba(255,200,0,0.3)" strokeWidth="1.2" />
                {/* Divider pin */}
                <circle cx={px} cy={py} r={5} fill="#ffcc00" style={{ filter: "drop-shadow(0 0 3px rgba(255,200,0,0.9))" }} />
                {/* Number */}
                <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central"
                  fontSize="14" fontWeight="900" fill="#fff"
                  style={{ filter: `drop-shadow(0 0 5px ${segGlow(n)})` }}>
                  {n}
                </text>
              </g>
            );
          })}

          {/* Inner hub layers */}
          <circle cx={cx} cy={cy} r={RI+4}  fill="#0a0a0a" stroke="rgba(255,200,0,0.45)" strokeWidth="1.5" />
          <circle cx={cx} cy={cy} r={RI}    fill="url(#hubG)" />
          <circle cx={cx} cy={cy} r={RI-14} fill="#111" stroke="rgba(255,200,0,0.3)" strokeWidth="1" />
          <circle cx={cx} cy={cy} r={16}    fill="#ffcc00" />
          <circle cx={cx} cy={cy} r={7}     fill="#fff" />
          <circle cx={cx} cy={cy} r={3}     fill="#888" />
        </svg>
      </motion.div>

      {/* Ball */}
      <motion.div animate={ballCtrl} initial={{ y: -165 }}
        style={{ position: "absolute", top: "50%", left: "50%", marginLeft: -8, marginTop: -8, zIndex: 20 }}>
        <div style={{
          width: 16, height: 16, borderRadius: "50%",
          background: "radial-gradient(circle at 33% 33%, #fff 0%, #ccc 55%, #777 100%)",
          boxShadow: "0 3px 10px rgba(0,0,0,0.9), inset 0 1px 3px rgba(255,255,255,0.7)",
        }} />
      </motion.div>

      {/* Top pointer */}
      <div style={{
        position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
        width: 0, height: 0,
        borderLeft: "9px solid transparent", borderRight: "9px solid transparent",
        borderTop: "22px solid #ffcc00",
        filter: "drop-shadow(0 2px 6px rgba(255,200,0,0.9))",
        zIndex: 30,
      }} />

      {/* Result overlay */}
      {isResult && winningNumber !== null && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 280, damping: 16, delay: 0.1 }}
          style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 40,
            width: 96, height: 96, borderRadius: "50%",
            background: segColor(winningNumber),
            border: "4px solid #ffcc00",
            boxShadow: `0 0 36px 12px ${segGlow(winningNumber)}, 0 0 0 7px rgba(0,0,0,0.55)`,
            display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column",
          }}
        >
          <span style={{ fontSize: 36, fontWeight: 900, color: "#fff", lineHeight: 1 }}>{winningNumber}</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.85)", letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 2 }}>
            {winningNumber === 0 ? "green" : [1,3,5,7,9].includes(winningNumber) ? "red" : "black"}
          </span>
        </motion.div>
      )}
    </div>
  );
}
