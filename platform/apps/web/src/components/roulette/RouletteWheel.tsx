"use client";
import { motion, useMotionValue, animate } from "framer-motion";
import { useEffect, useRef } from "react";

// European wheel order: numbers arranged on a real European roulette wheel,
// starting from 0 at top, going clockwise.
const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
  24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const SLOT_ANGLE = 360 / 37; // ~9.73°

function color(n: number) {
  if (n === 0) return "#0d9b3f";
  return RED.has(n) ? "#c8102e" : "#1a1a1a";
}

const SPIN_DURATION = 20; // seconds — must match backend SPIN_MS / 1000

interface Props {
  winningNumber: number | null;
  spinning: boolean;
  status: "BETTING" | "SPINNING" | "SETTLED";
}

export function RouletteWheel({ winningNumber, spinning, status }: Props) {
  const wheelRotation = useMotionValue(0);
  const ballRotation = useMotionValue(0);
  // ballY: Y offset from wheel center. Negative = above center (toward 12-o'clock).
  // -175 = outer track (ball idle/spinning), -145 = inner slot ring (ball settled)
  const ballY = useMotionValue(-175);
  const lastSpinRef = useRef<number | null>(null);

  useEffect(() => {
    // Always stop existing animations when state changes
    wheelRotation.stop();
    ballRotation.stop();
    ballY.stop();

    if (spinning) {
      if (winningNumber !== null && winningNumber !== lastSpinRef.current) {
        // ─── STOPPING AT RESULT ────────────────────────────────────────────────
        lastSpinRef.current = winningNumber;
        const idx = WHEEL_ORDER.indexOf(winningNumber);
        if (idx < 0) return;

        const currentWheel = wheelRotation.get();
        const baseWheelSpins = 12;
        const wheelEndOffset = ((winningNumber * 97 + 211) % 360);
        const finalWheelDeg = currentWheel - baseWheelSpins * 360 - wheelEndOffset;

        const slotCentreAngle = idx * SLOT_ANGLE + SLOT_ANGLE / 2;
        const slotPageAngle = slotCentreAngle + finalWheelDeg;

        const currentBall = ballRotation.get();
        const baseBallSpins = 22;
        const diff = ((slotPageAngle - (currentBall % 360)) + 360) % 360;
        const finalBallDeg = currentBall + baseBallSpins * 360 + diff;

        // Fast start, dramatic slowdown in final ~6s: 80% of rotation in first 40% of time
        animate(wheelRotation, finalWheelDeg, { duration: SPIN_DURATION, ease: [0.04, 0.72, 0.12, 1] });
        animate(ballRotation, finalBallDeg,   { duration: SPIN_DURATION, ease: [0.03, 0.68, 0.10, 1] });
        animate(ballY, -145, { duration: SPIN_DURATION, ease: [0.05, 0.3, 0.8, 1] });

      } else if (winningNumber === null) {
        // ─── CONTINUOUS SPINNING ───────────────────────────────────────────────
        const currentWheel = wheelRotation.get();
        const currentBall = ballRotation.get();
        
        animate(wheelRotation, currentWheel - 3600, { duration: 25, ease: "linear", repeat: Infinity });
        animate(ballRotation, currentBall + 5400, { duration: 25, ease: "linear", repeat: Infinity });
        animate(ballY, -175, { duration: 0.8 });
      }
    } else if (status === "BETTING") {
      animate(ballY, -175, { duration: 0.8 });
    }
  }, [spinning, winningNumber, status, wheelRotation, ballRotation, ballY]);

  return (
    <div className="relative w-[440px] h-[440px] mx-auto select-none">
      {/* Outer rim with glow */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-yellow-700 via-yellow-500 to-yellow-800 shadow-[0_0_60px_rgba(255,180,0,0.4)]" />
      <div className="absolute inset-[5px] rounded-full bg-gradient-to-br from-amber-900 to-amber-700" />
      <div className="absolute inset-[12px] rounded-full bg-black" />

      {/* Spinning wheel */}
      <motion.div
        style={{ rotate: wheelRotation }}
        className="absolute inset-[16px] rounded-full overflow-hidden"
      >
        <svg viewBox="-100 -100 200 200" className="w-full h-full">
          {WHEEL_ORDER.map((n, i) => {
            const angle = i * SLOT_ANGLE;
            const angleRad = (angle - 90) * (Math.PI / 180);
            const nextRad = (angle + SLOT_ANGLE - 90) * (Math.PI / 180);
            const r = 95;
            const x1 = Math.cos(angleRad) * r;
            const y1 = Math.sin(angleRad) * r;
            const x2 = Math.cos(nextRad) * r;
            const y2 = Math.sin(nextRad) * r;
            const midAngle = angle + SLOT_ANGLE / 2 - 90;
            const midRad = midAngle * (Math.PI / 180);
            const tx = Math.cos(midRad) * 75;
            const ty = Math.sin(midRad) * 75;

            return (
              <g key={n}>
                <path
                  d={`M 0 0 L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`}
                  fill={color(n)}
                  stroke="#f5c518"
                  strokeWidth="0.4"
                />
                <text
                  x={tx}
                  y={ty}
                  fill="#fff"
                  fontSize="9"
                  fontWeight="bold"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${midAngle + 90} ${tx} ${ty})`}
                >
                  {n}
                </text>
              </g>
            );
          })}
          {/* Center hub */}
          <circle r="22" fill="url(#hubGrad)" stroke="#f5c518" strokeWidth="1" />
          <circle r="8" fill="#f5c518" />
          <defs>
            <radialGradient id="hubGrad">
              <stop offset="0%" stopColor="#3a2510" />
              <stop offset="100%" stopColor="#0a0a0a" />
            </radialGradient>
          </defs>
        </svg>
      </motion.div>

      {/* Spinning ball — rotates around the wheel center at variable radius */}
      <motion.div
        style={{ rotate: ballRotation }}
        className="absolute inset-0 pointer-events-none"
      >
        {/* Center anchor at wheel's center */}
        <div className="absolute left-1/2 top-1/2" style={{ width: 0, height: 0 }}>
          <motion.div
            className="absolute"
            style={{
              x: -8,    // half ball width — horizontally centres ball on arm
              y: ballY, // negative = above center (12-o'clock when rotation=0)
            }}
          >
            <div
              className="w-4 h-4 rounded-full"
              style={{
                background: "radial-gradient(circle at 30% 30%, #ffffff, #d4d4d4 55%, #707070)",
                boxShadow: "0 0 8px rgba(255,255,255,0.9), inset 0 -1px 2px rgba(0,0,0,0.3)",
              }}
            />
          </motion.div>
        </div>
      </motion.div>

      {/* Stationary pointer at top */}
      <div
        className="absolute left-1/2 -translate-x-1/2 -top-2 w-0 h-0 z-10"
        style={{
          borderLeft: "12px solid transparent",
          borderRight: "12px solid transparent",
          borderTop: "20px solid #f5c518",
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
        }}
      />

      {/* Result overlay */}
      {status === "SETTLED" && winningNumber !== null && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <div
            className="bg-black/70 backdrop-blur-sm rounded-full w-32 h-32 flex flex-col items-center justify-center border-4"
            style={{ borderColor: color(winningNumber) }}
          >
            <div className="text-5xl font-bold text-white">{winningNumber}</div>
            <div
              className="text-xs uppercase tracking-wider mt-1"
              style={{ color: color(winningNumber) === "#1a1a1a" ? "#888" : color(winningNumber) }}
            >
              {winningNumber === 0 ? "Green" : RED.has(winningNumber) ? "Red" : "Black"}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
