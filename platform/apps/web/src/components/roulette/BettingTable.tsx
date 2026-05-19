"use client";
import { useState } from "react";
import { motion } from "framer-motion";

const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

const TABLE_ROWS: number[][] = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
];

export type BetType =
  | "number" | "red" | "black" | "odd" | "even"
  | "high"   | "low"
  | "dozen1" | "dozen2" | "dozen3"
  | "col1"   | "col2"   | "col3"
  | "split"  | "street" | "corner" | "sixline";

export type BetMode = "straight" | "split" | "street" | "corner" | "sixline";

function numColor(n: number) {
  if (n === 0) return "bg-emerald-700 hover:bg-emerald-600";
  return RED.has(n) ? "bg-[#c8102e] hover:bg-red-600" : "bg-[#1a1a1a] hover:bg-neutral-800";
}

interface Bet { betType: BetType; betValue?: string | null; amount: number; }
interface Props {
  chip: number;
  bets: Bet[];
  disabled: boolean;
  betMode: BetMode;
  onPlaceBet: (bet: Bet) => void;
}

function totalForCell(bets: Bet[], betType: BetType, betValue?: string | null) {
  return bets
    .filter(b => b.betType === betType && (b.betValue ?? null) === (betValue ?? null))
    .reduce((sum, b) => sum + b.amount, 0);
}

function Chip({ amount, small }: { amount: number; small?: boolean }) {
  if (!amount) return null;
  return (
    <motion.div
      initial={{ scale: 0, x: "-50%", y: "-50%" }}
      animate={{ scale: 1, x: "-50%", y: "-50%" }}
      className={`absolute top-1/2 left-1/2 ${small ? "min-w-[16px] h-[16px] text-[8px]" : "min-w-[20px] h-[20px] text-[9px]"} px-1 rounded-full bg-gradient-to-br from-yellow-300 via-yellow-500 to-yellow-700 border-2 border-yellow-100 shadow-[0_2px_6px_rgba(0,0,0,0.6)] flex items-center justify-center font-black text-yellow-950 z-20 pointer-events-none`}
    >
      {amount >= 1000 ? `${(amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1)}k` : amount}
    </motion.div>
  );
}

// Get the street (3 numbers) that contains n
function getStreet(n: number): number[] {
  const g = Math.ceil(n / 3);
  return [g * 3 - 2, g * 3 - 1, g * 3];
}

// Get the six-line (6 numbers) containing n (paired with next street)
function getSixline(n: number): number[] {
  const g = Math.ceil(n / 3);
  const otherG = g < 12 ? g + 1 : g - 1;
  const a = [g * 3 - 2, g * 3 - 1, g * 3];
  const b = [otherG * 3 - 2, otherG * 3 - 1, otherG * 3];
  return [...a, ...b].sort((x, y) => x - y);
}

// Two numbers are adjacent on the roulette table
function isAdjacent(a: number, b: number): boolean {
  if (a === 0 || b === 0) return false;
  const diff = Math.abs(a - b);
  if (diff === 3) return true;
  if (diff === 1) {
    const min = Math.min(a, b);
    return min % 3 !== 0;
  }
  return false;
}

export function BettingTable({ chip, bets, disabled, betMode, onPlaceBet }: Props) {
  const [splitFirst, setSplitFirst] = useState<number | null>(null);

  const place = (betType: BetType, betValue: string | null) => {
    if (disabled) return;
    onPlaceBet({ betType, betValue, amount: chip });
  };

  const handleNumberClick = (n: number) => {
    if (disabled) return;

    if (betMode === "straight") {
      place("number", String(n));
      return;
    }

    if (betMode === "split") {
      if (splitFirst === null) {
        setSplitFirst(n);
      } else if (splitFirst === n) {
        setSplitFirst(null);
      } else if (isAdjacent(splitFirst, n)) {
        const sorted = [splitFirst, n].sort((a, b) => a - b);
        place("split", sorted.join("/"));
        setSplitFirst(null);
      } else {
        setSplitFirst(n);
      }
      return;
    }

    if (betMode === "street") {
      place("street", getStreet(n).join("/"));
      return;
    }

    if (betMode === "sixline") {
      place("sixline", getSixline(n).join("/"));
      return;
    }

    if (betMode === "corner") {
      // For corner mode, treat click as selecting a "corner anchor"
      // The corner is formed by n and its 3 neighbors (right + down)
      if (n === 0) return;
      // Find the column/row of n in the grid
      let row = -1, col = -1;
      for (let r = 0; r < 3; r++) {
        const c = TABLE_ROWS[r]?.indexOf(n) ?? -1;
        if (c !== -1) { row = r; col = c; break; }
      }
      if (row < 0 || row >= 2 || col < 0 || col >= 11) return;
      const a = TABLE_ROWS[row]?.[col];
      const b = TABLE_ROWS[row + 1]?.[col];
      const c2 = TABLE_ROWS[row]?.[col + 1];
      const d = TABLE_ROWS[row + 1]?.[col + 1];
      if (a == null || b == null || c2 == null || d == null) return;
      const nums = [a, b, c2, d].sort((x, y) => x - y);
      place("corner", nums.join("/"));
    }
  };

  const isSplitFirst = (n: number) => betMode === "split" && splitFirst === n;
  const isSplitTarget = (n: number) => betMode === "split" && splitFirst !== null && splitFirst !== n && isAdjacent(splitFirst, n);

  const getCellExtra = (n: number) => {
    if (isSplitFirst(n)) return " ring-2 ring-orange-400 brightness-125 z-10";
    if (isSplitTarget(n)) return " ring-2 ring-yellow-300 brightness-110 animate-pulse";
    return "";
  };

  const cell = "relative h-7 md:h-9 flex items-center justify-center text-white font-bold text-xs md:text-sm border border-white/30 cursor-pointer transition-all hover:brightness-125";

  return (
    <div
      className={`relative p-2 rounded-lg ${disabled ? "opacity-70 pointer-events-none" : ""}`}
      style={{
        background: "linear-gradient(135deg, #6a0e1f 0%, #8c1a2e 50%, #5a0a1a 100%)",
        boxShadow: "inset 0 0 60px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.5)",
      }}
    >
      <div className="absolute inset-0 rounded-lg pointer-events-none opacity-20"
        style={{ backgroundImage: "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.05) 1px, transparent 1px)", backgroundSize: "4px 4px" }} />

      {/* Bet mode hint */}
      {betMode !== "straight" && (
        <div className="absolute -top-5 left-0 right-0 text-center text-[9px] text-yellow-300 uppercase tracking-widest font-bold">
          {betMode === "split" && splitFirst === null && "Click first number"}
          {betMode === "split" && splitFirst !== null && `Selected: ${splitFirst} — click adjacent number`}
          {betMode === "street" && "Click any number in row to bet 3-number street"}
          {betMode === "sixline" && "Click any number to bet 6-line (this + next street)"}
          {betMode === "corner" && "Click a number; bets 2×2 corner (down + right)"}
        </div>
      )}

      <div className="relative flex gap-0.5">
        {/* Zero */}
        <button onClick={() => handleNumberClick(0)}
          className={`${cell} w-7 md:w-8 h-[84px] md:h-[108px] bg-emerald-700 hover:bg-emerald-600 rounded-l text-sm md:text-base`}>
          0
          <Chip amount={totalForCell(bets, "number", "0")} />
        </button>

        {/* Number grid */}
        <div className="flex-1 grid grid-rows-3 gap-0.5">
          {TABLE_ROWS.map((row, rowIdx) => (
            <div key={rowIdx} className="grid gap-0.5" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
              {row.map((n) => {
                const straightAmt = totalForCell(bets, "number", String(n));
                return (
                  <button
                    key={n}
                    onClick={() => handleNumberClick(n)}
                    className={`${cell} ${numColor(n)} ${getCellExtra(n)}`}
                  >
                    <span className="relative z-0">{n}</span>
                    {straightAmt > 0 && <Chip amount={straightAmt} small />}
                  </button>
                );
              })}
              {/* Column bet (2:1) */}
              <button
                onClick={() => place(rowIdx === 0 ? "col3" : rowIdx === 1 ? "col2" : "col1", null)}
                className={`${cell} bg-black/30 hover:bg-black/40 text-[10px] md:text-xs`}
              >
                2:1
                <Chip amount={totalForCell(bets, rowIdx === 0 ? "col3" : rowIdx === 1 ? "col2" : "col1")} small />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Dozens row */}
      <div className="relative grid grid-cols-3 gap-0.5 mt-0.5 ml-[30px] md:ml-[34px] mr-[34px] md:mr-[38px]">
        {(["dozen1", "dozen2", "dozen3"] as const).map((type, i) => (
          <button key={type} onClick={() => place(type, null)}
            className={`${cell} bg-black/30 hover:bg-black/40 text-[10px] md:text-xs italic`}>
            <span className="hidden md:inline">⟨ {i === 0 ? "1st" : i === 1 ? "2nd" : "3rd"} - 12 ⟩</span>
            <span className="md:hidden">{i === 0 ? "1-12" : i === 1 ? "13-24" : "25-36"}</span>
            <Chip amount={totalForCell(bets, type)} small />
          </button>
        ))}
      </div>

      {/* Outside bets */}
      <div className="relative grid grid-cols-6 gap-0.5 mt-0.5 ml-[30px] md:ml-[34px] mr-[34px] md:mr-[38px]">
        <button onClick={() => place("low", null)} className={`${cell} bg-black/30 hover:bg-black/40 text-[10px] md:text-xs`}>
          1-18 <Chip amount={totalForCell(bets, "low")} small />
        </button>
        <button onClick={() => place("even", null)} className={`${cell} bg-black/30 hover:bg-black/40 text-[10px] md:text-xs uppercase`}>
          Even <Chip amount={totalForCell(bets, "even")} small />
        </button>
        <button onClick={() => place("red", null)} className={`${cell} bg-[#c8102e] hover:bg-red-600`}>
          <span className="text-lg md:text-2xl leading-none">♦</span>
          <Chip amount={totalForCell(bets, "red")} small />
        </button>
        <button onClick={() => place("black", null)} className={`${cell} bg-[#1a1a1a] hover:bg-neutral-800`}>
          <span className="text-lg md:text-2xl leading-none">♦</span>
          <Chip amount={totalForCell(bets, "black")} small />
        </button>
        <button onClick={() => place("odd", null)} className={`${cell} bg-black/30 hover:bg-black/40 text-[10px] md:text-xs uppercase`}>
          Odd <Chip amount={totalForCell(bets, "odd")} small />
        </button>
        <button onClick={() => place("high", null)} className={`${cell} bg-black/30 hover:bg-black/40 text-[10px] md:text-xs`}>
          19-36 <Chip amount={totalForCell(bets, "high")} small />
        </button>
      </div>
    </div>
  );
}
