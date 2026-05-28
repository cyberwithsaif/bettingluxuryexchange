"use client";
import { useState, useEffect, useRef, Fragment, type CSSProperties } from "react";
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

export type BetMode = "straight" | "street" | "corner" | "sixline";

const MODE_LABELS: Record<BetMode, string> = {
  straight: "Straight", street: "Street", corner: "Corner", sixline: "Six Line",
};

function numColor(n: number) {
  if (n === 0) return "bg-emerald-700 hover:bg-emerald-600";
  return RED.has(n) ? "bg-[#c8102e] hover:bg-red-600" : "bg-[#1a1a1a] hover:bg-neutral-800";
}

interface Bet { betType: BetType; betValue?: string | null; amount: number; }
interface Props {
  chip: number;
  bets: Bet[];
  disabled: boolean;
  onPlaceBet: (bet: Bet) => void;
}

function totalForCell(bets: Bet[], betType: BetType, betValue?: string | null) {
  return bets
    .filter(b => b.betType === betType && (b.betValue ?? null) === (betValue ?? null))
    .reduce((sum, b) => sum + b.amount, 0);
}

const CHIP_COLORS = [
  { max: 50,   bg: "radial-gradient(circle at 35% 35%, #fef08a, #eab308 55%, #713f12)", glow: "rgba(234,179,8,0.8)",  text: "#422006" },
  { max: 100,  bg: "radial-gradient(circle at 35% 35%, #bfdbfe, #3b82f6 55%, #1e3a8a)", glow: "rgba(59,130,246,0.8)", text: "#fff" },
  { max: 500,  bg: "radial-gradient(circle at 35% 35%, #bbf7d0, #22c55e 55%, #14532d)", glow: "rgba(34,197,94,0.8)",  text: "#fff" },
  { max: 1000, bg: "radial-gradient(circle at 35% 35%, #e9d5ff, #a855f7 55%, #4a044e)", glow: "rgba(168,85,247,0.8)", text: "#fff" },
  { max: Infinity, bg: "radial-gradient(circle at 35% 35%, #fecaca, #ef4444 55%, #7f1d1d)", glow: "rgba(239,68,68,0.8)", text: "#fff" },
];

function chipStyle(amount: number) {
  return CHIP_COLORS.find(c => amount <= c.max) ?? CHIP_COLORS[CHIP_COLORS.length - 1]!;
}

function fmt(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(n);
}

function Chip({ amount, small }: { amount: number; small?: boolean }) {
  if (!amount) return null;
  const s = chipStyle(amount);
  const size = small ? 18 : 22;
  return (
    <motion.div
      initial={{ scale: 0, x: "-50%", y: "-50%" }}
      animate={{ scale: 1, x: "-50%", y: "-50%" }}
      className="absolute top-1/2 left-1/2 z-20 pointer-events-none flex items-center justify-center font-black"
      style={{
        width: size, height: size, borderRadius: "50%",
        background: s.bg,
        boxShadow: `0 0 8px ${s.glow}, 0 2px 4px rgba(0,0,0,0.6)`,
        border: "1.5px solid rgba(255,255,255,0.35)",
        fontSize: size <= 18 ? 7 : 8,
        color: s.text,
        transform: "translate(-50%, -50%)",
      }}
    >
      {fmt(amount)}
    </motion.div>
  );
}

// Chip shown ON the split zone divider line
function SplitChip({ amount }: { amount: number }) {
  if (!amount) return null;
  const s = chipStyle(amount);
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className="flex items-center justify-center font-black pointer-events-none z-30"
      style={{
        width: 20, height: 20, borderRadius: "50%",
        background: s.bg,
        boxShadow: `0 0 10px ${s.glow}, 0 2px 6px rgba(0,0,0,0.7)`,
        border: "2px solid rgba(255,255,255,0.4)",
        fontSize: 7, color: s.text,
        flexShrink: 0,
      }}
    >
      {fmt(amount)}
    </motion.div>
  );
}

function getStreet(n: number): number[] {
  const g = Math.ceil(n / 3);
  return [g * 3 - 2, g * 3 - 1, g * 3];
}

function getSixline(n: number): number[] {
  const g = Math.ceil(n / 3);
  const otherG = g < 12 ? g + 1 : g - 1;
  const a = [g * 3 - 2, g * 3 - 1, g * 3];
  const b = [otherG * 3 - 2, otherG * 3 - 1, otherG * 3];
  return [...a, ...b].sort((x, y) => x - y);
}

export function BettingTable({ chip, bets, disabled, onPlaceBet }: Props) {
  const [betMode, setBetMode] = useState<BetMode>("straight");
  const prevDisabled = useRef(disabled);

  useEffect(() => {
    prevDisabled.current = disabled;
  }, [disabled]);

  const place = (betType: BetType, betValue: string | null) => {
    if (disabled) return;
    onPlaceBet({ betType, betValue, amount: chip });
  };

  // Direct split bet — called from split zones on borders
  const placeSplit = (a: number, b: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    const sorted = [Math.min(a, b), Math.max(a, b)];
    place("split", sorted.join("/"));
  };

  const handleNumberClick = (n: number) => {
    if (disabled) return;
    if (betMode === "straight") { place("number", String(n)); return; }
    if (betMode === "street")   { place("street", getStreet(n).join("/")); return; }
    if (betMode === "sixline")  { place("sixline", getSixline(n).join("/")); return; }
    if (betMode === "corner") {
      if (n === 0) return;
      let row = -1, col = -1;
      for (let r = 0; r < 3; r++) {
        const c = TABLE_ROWS[r]?.indexOf(n) ?? -1;
        if (c !== -1) { row = r; col = c; break; }
      }
      if (row < 0 || row >= 2 || col < 0 || col >= 11) return;
      const a = TABLE_ROWS[row]?.[col], b = TABLE_ROWS[row + 1]?.[col];
      const c2 = TABLE_ROWS[row]?.[col + 1], d = TABLE_ROWS[row + 1]?.[col + 1];
      if (a == null || b == null || c2 == null || d == null) return;
      place("corner", [a, b, c2, d].sort((x, y) => x - y).join("/"));
    }
  };

  // Cell class — no gap; borders are the separators
  const cell = "relative h-7 md:h-9 w-full flex items-center justify-center text-white font-bold text-[10px] md:text-xs cursor-pointer select-none transition-all hover:brightness-125 active:brightness-150";

  // Tiny intersection dot shown when no bet placed on a split zone
  const SplitDotEmpty = () => (
    <div style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.18)", flexShrink: 0, transition: "all 0.12s" }} />
  );

  return (
    <div className="space-y-1">
      {/* ── Bet Mode Selector ── */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar items-center">
        <span className="text-[8px] uppercase tracking-widest text-white/30 shrink-0">Mode:</span>
        {(Object.keys(MODE_LABELS) as BetMode[]).map(m => (
          <button
            key={m}
            onClick={() => { if (!disabled) setBetMode(m); }}
            disabled={disabled}
            className="shrink-0 px-2 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold transition-all border"
            style={{
              background: betMode === m ? "rgba(255,255,255,0.14)" : "transparent",
              color: betMode === m ? "#fff" : "rgba(255,255,255,0.35)",
              borderColor: betMode === m ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.08)",
            }}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
        <span className="text-[8px] text-yellow-300/70 ml-1 shrink-0">· click borders to split</span>
      </div>

      {/* Mode hint */}
      {betMode !== "straight" && (
        <div className="text-center text-[8px] text-yellow-300/80 uppercase tracking-widest font-semibold">
          {betMode === "street"  && "↓ Click any number — bets all 3 in that row"}
          {betMode === "sixline" && "↓ Click any number — bets 6 numbers (2 rows)"}
          {betMode === "corner"  && "↓ Click top-left of a 2×2 block"}
        </div>
      )}

      {/* ── Betting Grid ── */}
      <div
        className={`relative rounded-lg ${disabled ? "opacity-60 pointer-events-none" : ""}`}
        style={{
          background: "linear-gradient(135deg, #6a0e1f 0%, #8c1a2e 50%, #5a0a1a 100%)",
          boxShadow: "inset 0 0 60px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.5)",
          padding: "6px 6px 4px 6px",
        }}
      >
        {/* Grain */}
        <div className="absolute inset-0 rounded-lg pointer-events-none opacity-15"
          style={{ backgroundImage: "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "4px 4px" }} />

        {/* Zero + Number grid */}
        <div className="relative flex" style={{ gap: 0 }}>

          {/* Zero — stretches to full grid height automatically */}
          <button
            onClick={() => place("number", "0")}
            className="relative bg-emerald-700 hover:bg-emerald-600 rounded-l flex items-center justify-center text-white font-bold text-xs transition-all active:brightness-150 self-stretch shrink-0"
            style={{ width: 26, borderRight: "1px solid rgba(255,255,255,0.15)" }}
          >
            0
            <Chip amount={totalForCell(bets, "number", "0")} />
          </button>

          {/* Number grid: flex column with horizontal split bands between rows */}
          <div className="flex-1 flex flex-col" style={{ gap: 0 }}>
            {TABLE_ROWS.map((row, rowIdx) => (
              <Fragment key={rowIdx}>

                {/* ── Number row ── */}
                <div className="flex" style={{ gap: 0 }}>
                  {row.map((n, colIdx) => {
                    const straightAmt  = totalForCell(bets, "number", String(n));
                    // right-neighbor split (horizontal in TABLE = vertical on real table)
                    const rightN       = colIdx < 11 ? row[colIdx + 1] : undefined;
                    const rSplitVal    = rightN != null ? [Math.min(n, rightN), Math.max(n, rightN)].join("/") : null;
                    const rSplitAmt    = rSplitVal ? totalForCell(bets, "split", rSplitVal) : 0;

                    return (
                      <div
                        key={n}
                        className="relative flex-1"
                        style={{ borderRight: "1px solid rgba(255,255,255,0.12)" }}
                      >
                        {/* Number cell */}
                        <button
                          onClick={() => handleNumberClick(n)}
                          className={`${cell} ${numColor(n)}`}
                        >
                          <span className="relative z-0">{n}</span>
                          {straightAmt > 0 && <Chip amount={straightAmt} small />}
                        </button>

                        {/* Right-border split zone — wide tap area with visible divider */}
                        {rightN != null && (
                          <div
                            onClick={(e) => rSplitVal && placeSplit(n, rightN, e)}
                            className="absolute top-0 bottom-0 flex items-center justify-center cursor-pointer z-30 group"
                            style={{ right: -13, width: 26, pointerEvents: disabled ? "none" : "auto" }}
                            title={`Split ${n}|${rightN}`}
                          >
                            {/* Visible divider line */}
                            <div
                              className="absolute inset-y-0.5 transition-all duration-100 group-hover:opacity-100"
                              style={{
                                left: "50%", transform: "translateX(-50%)",
                                width: rSplitAmt > 0 ? 2 : 1,
                                background: rSplitAmt > 0 ? "rgba(253,224,71,0.7)" : "rgba(255,255,255,0.22)",
                                boxShadow: rSplitAmt > 0 ? "0 0 6px rgba(253,224,71,0.6)" : "none",
                              }}
                            />
                            {rSplitAmt > 0 ? <SplitChip amount={rSplitAmt} /> : (
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                <SplitDotEmpty />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* 2:1 column bet */}
                  <button
                    onClick={() => place(rowIdx === 0 ? "col3" : rowIdx === 1 ? "col2" : "col1", null)}
                    className="flex items-center justify-center text-[9px] md:text-[10px] text-white/80 font-bold bg-black/30 hover:bg-black/50 transition-all shrink-0 border-l border-white/10"
                    style={{ width: 28 }}
                  >
                    2:1
                    <Chip amount={totalForCell(bets, rowIdx === 0 ? "col3" : rowIdx === 1 ? "col2" : "col1")} small />
                  </button>
                </div>

                {/* ── Horizontal split band between rows ── */}
                {rowIdx < 2 && (
                  <div className="flex" style={{ gap: 0, height: 14 }}>
                    {row.map((n, colIdx) => {
                      const nBelow   = TABLE_ROWS[rowIdx + 1]![colIdx]!;
                      const splitVal = [Math.min(n, nBelow), Math.max(n, nBelow)].join("/");
                      const splitAmt = totalForCell(bets, "split", splitVal);
                      return (
                        <div
                          key={`hs-${n}`}
                          onClick={() => { if (!disabled) place("split", splitVal); }}
                          className="flex-1 relative flex items-center justify-center cursor-pointer group"
                          style={{
                            background: splitAmt > 0 ? "rgba(253,224,71,0.08)" : "transparent",
                            borderRight: "1px solid rgba(255,255,255,0.06)",
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = "rgba(253,224,71,0.2)")}
                          onMouseLeave={e => (e.currentTarget.style.background = splitAmt > 0 ? "rgba(253,224,71,0.08)" : "transparent")}
                          title={`Split ${nBelow}|${n}`}
                        >
                          {/* Horizontal divider line */}
                          <div
                            className="absolute left-1 right-1 pointer-events-none transition-all"
                            style={{
                              top: "50%", transform: "translateY(-50%)",
                              height: splitAmt > 0 ? 2 : 1,
                              background: splitAmt > 0 ? "rgba(253,224,71,0.6)" : "rgba(255,255,255,0.18)",
                              boxShadow: splitAmt > 0 ? "0 0 5px rgba(253,224,71,0.55)" : "none",
                            }}
                          />
                          {splitAmt > 0 ? <SplitChip amount={splitAmt} /> : (
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <SplitDotEmpty />
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div style={{ width: 28, flexShrink: 0 }} />
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        </div>

        {/* ── Dozens row ── */}
        <div
          className="grid grid-cols-3 mt-1"
          style={{ gap: 2, marginLeft: 26, marginRight: 28 }}
        >
          {(["dozen1", "dozen2", "dozen3"] as const).map((type, i) => (
            <button key={type} onClick={() => place(type, null)}
              className="relative h-6 md:h-7 flex items-center justify-center bg-black/30 hover:bg-black/50 text-white/75 font-bold text-[9px] md:text-[10px] italic transition-all border border-white/10 rounded-sm">
              <span className="hidden md:inline">⟨ {i === 0 ? "1st" : i === 1 ? "2nd" : "3rd"} 12 ⟩</span>
              <span className="md:hidden">{i === 0 ? "1-12" : i === 1 ? "13-24" : "25-36"}</span>
              <Chip amount={totalForCell(bets, type)} small />
            </button>
          ))}
        </div>

        {/* ── Outside bets ── */}
        <div
          className="grid grid-cols-6 mt-0.5"
          style={{ gap: 2, marginLeft: 26, marginRight: 28 }}
        >
          <button onClick={() => place("low",   null)} className="relative h-6 md:h-7 flex items-center justify-center bg-black/30 hover:bg-black/50 text-white/75 font-bold text-[9px] md:text-[10px] transition-all border border-white/10 rounded-sm">
            1-18 <Chip amount={totalForCell(bets, "low")} small />
          </button>
          <button onClick={() => place("even",  null)} className="relative h-6 md:h-7 flex items-center justify-center bg-black/30 hover:bg-black/50 text-white/75 font-bold text-[9px] md:text-[10px] uppercase transition-all border border-white/10 rounded-sm">
            Even <Chip amount={totalForCell(bets, "even")} small />
          </button>
          <button onClick={() => place("red",   null)} className="relative h-6 md:h-7 flex items-center justify-center bg-[#c8102e] hover:bg-red-600 transition-all border border-white/10 rounded-sm">
            <span className="text-base md:text-xl leading-none">♦</span>
            <Chip amount={totalForCell(bets, "red")} small />
          </button>
          <button onClick={() => place("black", null)} className="relative h-6 md:h-7 flex items-center justify-center bg-[#1a1a1a] hover:bg-neutral-700 transition-all border border-white/10 rounded-sm">
            <span className="text-base md:text-xl leading-none">♦</span>
            <Chip amount={totalForCell(bets, "black")} small />
          </button>
          <button onClick={() => place("odd",   null)} className="relative h-6 md:h-7 flex items-center justify-center bg-black/30 hover:bg-black/50 text-white/75 font-bold text-[9px] md:text-[10px] uppercase transition-all border border-white/10 rounded-sm">
            Odd <Chip amount={totalForCell(bets, "odd")} small />
          </button>
          <button onClick={() => place("high",  null)} className="relative h-6 md:h-7 flex items-center justify-center bg-black/30 hover:bg-black/50 text-white/75 font-bold text-[9px] md:text-[10px] transition-all border border-white/10 rounded-sm">
            19-36 <Chip amount={totalForCell(bets, "high")} small />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Vertical PORTRAIT betting table for mobile — 0 on top, a 3-column number grid
 * (1,2,3 / 4,5,6 / … / 34,35,36) reading top-to-bottom, the column (2:1) bets
 * beneath, dozens as a vertical band, and the even-money outside bets on the far
 * left. Straight numbers + dozens/columns/outside bets (split/street/corner are
 * desktop-only). Mirrors the classic mobile roulette layout.
 */
export function MobileBettingTable({ chip, bets, disabled, onPlaceBet }: Props) {
  const place = (betType: BetType, betValue: string | null) => {
    if (disabled) return;
    onPlaceBet({ betType, betValue, amount: chip });
  };
  const amt = (t: BetType, v?: string | null) => totalForCell(bets, t, v ?? null);

  const ChipBadge = ({ value }: { value: number }) => {
    if (!value) return null;
    const s = chipStyle(value);
    return (
      <span className="absolute z-20 flex items-center justify-center font-black pointer-events-none"
        style={{ top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 18, height: 18, borderRadius: "50%", background: s.bg, boxShadow: `0 0 6px ${s.glow}`, border: "1.5px solid rgba(255,255,255,0.4)", fontSize: 7, color: s.text }}>
        {fmt(value)}
      </span>
    );
  };

  const ncolor = (n: number) => (n === 0 ? "#0d9b3f" : RED.has(n) ? "#c8102e" : "#1a1a1a");
  const cellBase = "relative flex items-center justify-center select-none transition active:brightness-150 font-bold text-white";
  const bd = "1px solid rgba(255,255,255,0.14)";
  const vtext: CSSProperties = { writingMode: "vertical-rl", transform: "rotate(180deg)", letterSpacing: "0.04em", fontSize: 10 };

  // Number col index → grid column. Splits live in the 8px gap cols (4, 6).
  const NUM_COL = [3, 5, 7] as const;
  // Number row index r (0..11) → grid row. Vertical-split rows live at odd
  // grid rows between number rows.
  const numRow = (r: number) => 2 + r * 2;

  const split = (a: number, b: number) => {
    const [lo, hi] = a < b ? [a, b] : [b, a];
    place("split", `${lo}/${hi}`);
  };

  return (
    <div className={`rounded-lg p-1.5 ${disabled ? "opacity-60 pointer-events-none" : ""}`}
      style={{ background: "linear-gradient(135deg,#6a0e1f 0%,#8c1a2e 50%,#5a0a1a 100%)", boxShadow: "inset 0 0 50px rgba(0,0,0,0.5)" }}>
      <div style={{
        display: "grid",
        // outside | dozen | num | h-split | num | h-split | num
        gridTemplateColumns: "28px 22px 1fr 8px 1fr 8px 1fr",
        // 0 row | (num 22 / v-split 5) × 12 | col-bets — compact so the whole
        // table fits a mobile viewport without scroll during BETTING.
        gridTemplateRows: `26px ${Array.from({ length: 12 }, () => "22px 5px").join(" ")} 26px`,
        gap: 2,
      }}>

        {/* Zero (spans all three number columns + the two h-split gaps) */}
        <button onClick={() => place("number", "0")} disabled={disabled}
          className={`${cellBase} text-sm rounded`} style={{ gridColumn: "3 / 8", gridRow: "1", background: "#0d9b3f", border: bd }}>
          0<ChipBadge value={amt("number", "0")} />
        </button>

        {/* Outside even-money band (far left) — spans 4 number rows each (2 × 2 grid-rows) */}
        {([
          ["low", "1-18", null], ["even", "EVEN", null], ["red", "♦", "#c8102e"],
          ["black", "♦", "#1a1a1a"], ["odd", "ODD", null], ["high", "19-36", null],
        ] as [BetType, string, string | null][]).map(([type, label, bg], i) => (
          <button key={type} onClick={() => place(type, null)} disabled={disabled}
            className={`${cellBase}`}
            style={{ gridColumn: 1, gridRow: `${2 + i * 4} / span 4`, background: bg ?? "rgba(0,0,0,0.32)", border: bd, borderRadius: 3 }}>
            {label === "♦" ? <span style={{ fontSize: 18, lineHeight: 1 }}>♦</span> : <span style={vtext}>{label}</span>}
            <ChipBadge value={amt(type)} />
          </button>
        ))}

        {/* Dozens band — each spans 4 number rows = 8 grid rows */}
        {(["dozen1", "dozen2", "dozen3"] as const).map((type, i) => (
          <button key={type} onClick={() => place(type, null)} disabled={disabled}
            className={`${cellBase} text-white/80`}
            style={{ gridColumn: 2, gridRow: `${2 + i * 8} / span 8`, background: "rgba(0,0,0,0.32)", border: bd, borderRadius: 3 }}>
            <span style={vtext}>{i === 0 ? "1st 12" : i === 1 ? "2nd 12" : "3rd 12"}</span>
            <ChipBadge value={amt(type)} />
          </button>
        ))}

        {/* Number grid (3 columns × 12 rows) */}
        {Array.from({ length: 12 }).map((_, r) =>
          [0, 1, 2].map(c => {
            const n = r * 3 + c + 1;
            return (
              <button key={n} onClick={() => place("number", String(n))} disabled={disabled}
                className={`${cellBase} text-xs rounded-sm`}
                style={{ gridColumn: NUM_COL[c], gridRow: numRow(r), background: ncolor(n), border: bd }}>
                {n}<ChipBadge value={amt("number", String(n))} />
              </button>
            );
          })
        )}

        {/* Horizontal split zones (between adjacent cols in the same row) */}
        {Array.from({ length: 12 }).map((_, r) => (
          <Fragment key={`hs-${r}`}>
            {[0, 1].map(c => {
              const a = r * 3 + c + 1, b = a + 1;
              const splitVal = `${a}/${b}`;
              const v = totalForCell(bets, "split", splitVal);
              return (
                <button key={c} onClick={() => split(a, b)} disabled={disabled}
                  className="relative cursor-pointer"
                  style={{ gridColumn: 4 + c * 2, gridRow: numRow(r), background: v > 0 ? "rgba(253,224,71,0.18)" : "transparent", border: "none", padding: 0 }}
                  title={`Split ${a}|${b}`}>
                  <div style={{ position: "absolute", inset: 1, borderRadius: 1, background: v > 0 ? "rgba(253,224,71,0.5)" : "rgba(255,255,255,0.06)" }} />
                  {v > 0 && <ChipBadge value={v} />}
                </button>
              );
            })}
          </Fragment>
        ))}

        {/* Vertical split zones (between adjacent rows in the same column) */}
        {Array.from({ length: 11 }).map((_, r) =>
          [0, 1, 2].map(c => {
            const a = r * 3 + c + 1, b = a + 3;
            const splitVal = `${a}/${b}`;
            const v = totalForCell(bets, "split", splitVal);
            return (
              <button key={`vs-${r}-${c}`} onClick={() => split(a, b)} disabled={disabled}
                className="relative cursor-pointer"
                style={{ gridColumn: NUM_COL[c], gridRow: numRow(r) + 1, background: v > 0 ? "rgba(253,224,71,0.18)" : "transparent", border: "none", padding: 0 }}
                title={`Split ${a}|${b}`}>
                <div style={{ position: "absolute", inset: 1, borderRadius: 1, background: v > 0 ? "rgba(253,224,71,0.5)" : "rgba(255,255,255,0.06)" }} />
                {v > 0 && <ChipBadge value={v} />}
              </button>
            );
          })
        )}

        {/* Column (2:1) bets */}
        {(["col1", "col2", "col3"] as const).map((type, c) => (
          <button key={type} onClick={() => place(type, null)} disabled={disabled}
            className={`${cellBase} text-[11px] text-white/80`}
            style={{ gridColumn: NUM_COL[c], gridRow: 26, background: "rgba(0,0,0,0.32)", border: bd, borderRadius: 3 }}>
            {c === 0 ? "1st" : c === 1 ? "2nd" : "3rd"}<ChipBadge value={amt(type)} />
          </button>
        ))}
      </div>
    </div>
  );
}
