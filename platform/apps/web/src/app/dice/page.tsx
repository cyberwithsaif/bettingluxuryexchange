"use client";
import Link from "next/link";
import { ArrowLeft, Shield, RefreshCw, Copy, Check, ArrowLeftRight } from "lucide-react";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import useSWR from "swr";
import { useAuthStore } from "@/lib/stores/auth";
import { getSocket } from "@/lib/socket";

// ─── Types ────────────────────────────────────────────────────────────────────
type DiceMode = "ROLL_UNDER" | "ROLL_OVER" | "ROLL_BETWEEN" | "ROLL_OUTSIDE";

interface BetResult {
  id: string;
  roll: number;
  won: boolean;
  payout: number;
  profit: number;
  multiplier: number;
  winChance: number;
  mode: DiceMode;
  target: number;
  minTarget: number;
  maxTarget: number;
  betAmount: number;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function calcWinChance(mode: DiceMode, target: number, minT: number, maxT: number): number {
  switch (mode) {
    case "ROLL_UNDER":   return Math.max(0.01, Math.min(98.99, target));
    case "ROLL_OVER":    return Math.max(0.01, Math.min(98.99, 100 - target));
    case "ROLL_BETWEEN": return Math.max(0.01, Math.min(98.99, maxT - minT));
    case "ROLL_OUTSIDE": return Math.max(0.01, Math.min(98.99, 100 - (maxT - minT)));
  }
}

function calcMultiplier(winChance: number): number {
  return Math.floor((99 / winChance) * 10000) / 10000;
}

function fmtNum(n: number, dec = 2) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function randomClientSeed() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, "0")).join("");
}

// ─── Mode Dice Icons ──────────────────────────────────────────────────────────
function DiceIcon({ dots, active }: { dots: [number, number][]; active: boolean }) {
  return (
    <div className="w-10 h-10 rounded-lg flex items-center justify-center relative"
      style={{ background: active ? "#7c3aed" : "rgba(255,255,255,0.06)" }}>
      <svg width="22" height="22" viewBox="0 0 22 22">
        {dots.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="2.5" fill={active ? "white" : "rgba(255,255,255,0.5)"} />
        ))}
      </svg>
    </div>
  );
}

const MODE_ICONS: { mode: DiceMode; dots: [number, number][] }[] = [
  { mode: "ROLL_UNDER",   dots: [[11, 11]] },
  { mode: "ROLL_OVER",    dots: [[6, 11], [16, 11]] },
  { mode: "ROLL_BETWEEN", dots: [[6, 6], [16, 6], [6, 16], [16, 16]] },
  { mode: "ROLL_OUTSIDE", dots: [[6, 6], [16, 6], [11, 11], [6, 16], [16, 16]] },
];

// ─── Hex Result Marker ────────────────────────────────────────────────────────
function HexMarker({ roll, won }: { roll: number; won: boolean }) {
  const color = won ? "#22c55e" : "#ef4444";
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      style={{
        position: "absolute",
        left: `${roll}%`,
        bottom: "calc(100% + 6px)",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        pointerEvents: "none",
        zIndex: 30,
      }}
    >
      {/* Hex body */}
      <div style={{
        background: "rgba(20,18,40,0.95)",
        border: `2px solid ${color}`,
        borderRadius: 8,
        padding: "4px 10px",
        minWidth: 60,
        textAlign: "center",
        boxShadow: `0 0 16px ${color}55`,
      }}>
        <span style={{ color, fontWeight: 900, fontSize: 15, fontFamily: "monospace" }}>
          {roll.toFixed(2)}
        </span>
      </div>
      {/* Arrow pointer */}
      <div style={{
        width: 0, height: 0,
        borderLeft: "6px solid transparent",
        borderRight: "6px solid transparent",
        borderTop: `7px solid ${color}`,
      }} />
    </motion.div>
  );
}

// ─── Dice Slider ──────────────────────────────────────────────────────────────
function DiceSlider({
  mode, target, minTarget, maxTarget,
  onTargetChange, onMinChange, onMaxChange,
  disabled, lastRoll, isRolling, lastWon,
}: {
  mode: DiceMode; target: number; minTarget: number; maxTarget: number;
  onTargetChange: (v: number) => void; onMinChange: (v: number) => void; onMaxChange: (v: number) => void;
  disabled: boolean; lastRoll: number | null; isRolling: boolean; lastWon: boolean | null;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<null | "single" | "min" | "max">(null);

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const snap  = (v: number) => Math.round(v * 100) / 100;

  const getPct = (e: MouseEvent | TouchEvent) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const x = "touches" in e ? e.touches[0]!.clientX : e.clientX;
    return clamp((x - rect.left) / rect.width * 100, 0, 100);
  };

  const startDrag = (handle: "single" | "min" | "max") => (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    dragging.current = handle;
  };

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging.current) return;
      const v = snap(getPct(e));
      if (dragging.current === "single") onTargetChange(clamp(v, 2, 98));
      else if (dragging.current === "min") onMinChange(clamp(v, 1, maxTarget - 1));
      else if (dragging.current === "max") onMaxChange(clamp(v, minTarget + 1, 99));
    };
    const onUp = () => { dragging.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
    };
  }, [maxTarget, minTarget, onMaxChange, onMinChange, onTargetChange]);

  // Zone colors
  const zones = (() => {
    switch (mode) {
      case "ROLL_UNDER":   return [{ l: 0, w: target, win: true }, { l: target, w: 100 - target, win: false }];
      case "ROLL_OVER":    return [{ l: 0, w: target, win: false }, { l: target, w: 100 - target, win: true }];
      case "ROLL_BETWEEN": return [{ l: 0, w: minTarget, win: false }, { l: minTarget, w: maxTarget - minTarget, win: true }, { l: maxTarget, w: 100 - maxTarget, win: false }];
      case "ROLL_OUTSIDE": return [{ l: 0, w: minTarget, win: true }, { l: minTarget, w: maxTarget - minTarget, win: false }, { l: maxTarget, w: 100 - maxTarget, win: true }];
    }
  })();

  const handlePos = mode === "ROLL_UNDER" || mode === "ROLL_OVER" ? [target] : [minTarget, maxTarget];

  return (
    <div className="w-full select-none">
      {/* Scale labels */}
      <div className="flex justify-between mb-3 text-sm font-bold" style={{ color: "rgba(255,255,255,0.55)" }}>
        {["0", "25", "50", "75", "100"].map(n => <span key={n}>{n}</span>)}
      </div>

      {/* Track wrapper — overflow-visible for marker */}
      <div className="relative" style={{ paddingTop: 52, overflow: "visible" }}>

        {/* Hex result marker */}
        <AnimatePresence>
          {lastRoll !== null && !isRolling && (
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 52, overflow: "visible" }}>
              <HexMarker key={lastRoll} roll={lastRoll} won={!!lastWon} />
            </div>
          )}
          {isRolling && (
            <motion.div key="rolling"
              animate={{ left: ["10%", "80%", "30%", "60%", "20%"] }}
              transition={{ duration: 0.6, repeat: Infinity, ease: "linear" }}
              style={{ position: "absolute", top: 0, left: "50%", bottom: "calc(100% + 6px - 52px)", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", zIndex: 30, pointerEvents: "none" }}
            >
              <div style={{ background: "rgba(20,18,40,0.9)", border: "2px solid #7c3aed", borderRadius: 8, padding: "4px 10px" }}>
                <span style={{ color: "#a78bfa", fontWeight: 900, fontSize: 15, fontFamily: "monospace" }}>...</span>
              </div>
              <div style={{ width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "7px solid #7c3aed" }} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Track */}
        <div
          ref={trackRef}
          className="relative rounded-full"
          style={{ height: 20, background: "#1e1b3a", overflow: "visible" }}
        >
          {/* Colored zones */}
          {zones.map((z, i) => (
            <div key={i}
              className="absolute top-0 h-full rounded-full transition-all duration-100"
              style={{
                left: `${z.l}%`,
                width: `${z.w}%`,
                background: z.win ? "#22c55e" : "#ef4444",
              }}
            />
          ))}

          {/* Drag handles */}
          {handlePos.map((pos, i) => (
            <div key={i}
              onMouseDown={startDrag(i === 0 && handlePos.length === 1 ? "single" : i === 0 ? "min" : "max")}
              onTouchStart={startDrag(i === 0 && handlePos.length === 1 ? "single" : i === 0 ? "min" : "max")}
              style={{
                position: "absolute",
                left: `${pos}%`,
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "linear-gradient(180deg, #2d2b50 0%, #1a1830 100%)",
                border: "3px solid rgba(255,255,255,0.15)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
                cursor: disabled ? "not-allowed" : "ew-resize",
                zIndex: 20,
                touchAction: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* Grip lines */}
              <div style={{ display: "flex", gap: 2 }}>
                {[0,1,2].map(j => (
                  <div key={j} style={{ width: 2, height: 10, borderRadius: 1, background: "rgba(255,255,255,0.25)" }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Provably Fair Modal ──────────────────────────────────────────────────────
function ProvablyFairModal({
  serverSeedHash, clientSeed, nonce, lastResult,
  onClientSeedChange, onRotateSeeds, onClose,
}: {
  serverSeedHash: string; clientSeed: string; nonce: number; lastResult: BetResult | null;
  onClientSeedChange: (s: string) => void; onRotateSeeds: () => void; onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string, k: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(k); setTimeout(() => setCopied(null), 1500); });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
        className="w-full max-w-md rounded-2xl p-6 space-y-4"
        style={{ background: "#13112a", border: "1px solid rgba(124,58,237,0.3)" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-purple-400" />
            <span className="font-bold text-white">Provably Fair</span>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl">×</button>
        </div>

        {[
          { label: "Server Seed Hash", value: serverSeedHash, key: "hash" },
          { label: "Client Seed", value: clientSeed, key: "client", editable: true },
          { label: "Nonce", value: String(nonce), key: "nonce" },
        ].map(f => (
          <div key={f.key}>
            <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">{f.label}</label>
            <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "#1e1b3a" }}>
              {f.editable
                ? <input value={clientSeed} onChange={e => onClientSeedChange(e.target.value)}
                    className="flex-1 bg-transparent text-xs font-mono text-white outline-none" />
                : <span className="flex-1 text-xs font-mono text-white/70 truncate">{f.value}</span>
              }
              {f.editable && (
                <button onClick={() => onClientSeedChange(randomClientSeed())} className="text-white/30 hover:text-purple-400">
                  <RefreshCw size={12} />
                </button>
              )}
              <button onClick={() => copy(f.value, f.key)} className="text-white/30 hover:text-purple-400">
                {copied === f.key ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              </button>
            </div>
          </div>
        ))}

        {lastResult && (
          <div className="rounded-lg p-3 space-y-1.5" style={{ background: "#1e1b3a" }}>
            <p className="text-[10px] uppercase tracking-wider text-white/30">Last Roll Verification</p>
            {([["Server Seed", lastResult.serverSeed], ["Roll Result", lastResult.roll.toFixed(2)]] as [string,string][]).map(([k, v]) => (
              <div key={k} className="flex justify-between text-xs">
                <span className="text-white/40">{k}</span>
                <span className="font-mono text-white/60 truncate max-w-[220px]">{v}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button onClick={onRotateSeeds}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
            style={{ background: "rgba(124,58,237,0.2)", border: "1px solid rgba(124,58,237,0.3)", color: "#a78bfa" }}>
            <RefreshCw size={13} /> Rotate Seeds
          </button>
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white/50 hover:text-white"
            style={{ background: "rgba(255,255,255,0.05)" }}>
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Input Field (bottom stats) ───────────────────────────────────────────────
function StatInput({
  label, value, onChange, readOnly, unit, numeric, onSwap,
}: {
  label: string; value: string; onChange?: (v: string) => void;
  readOnly?: boolean; unit?: string; numeric?: boolean; onSwap?: () => void;
}) {
  return (
    <div className="flex-1 min-w-0">
      <label className="block text-sm font-semibold mb-2" style={{ color: "rgba(255,255,255,0.7)" }}>{label}</label>
      <div className="flex items-center rounded-xl px-4 h-14"
        style={{ background: "#1e1b3a", border: "1px solid rgba(255,255,255,0.07)" }}>
        <input
          type={numeric ? "number" : "text"}
          value={value}
          onChange={e => onChange?.(e.target.value)}
          readOnly={readOnly}
          className="flex-1 bg-transparent text-white font-bold text-base outline-none tabular-nums min-w-0"
          style={{ cursor: readOnly ? "default" : "text" }}
        />
        {unit && <span className="text-white/40 ml-2 font-bold text-sm">{unit}</span>}
        {onSwap && (
          <button onClick={onSwap} className="ml-2 text-white/40 hover:text-white transition">
            <ArrowLeftRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DicePage() {
  const { user } = useAuthStore();
  const socket = useRef(getSocket());

  // Game settings
  const [mode, setMode]           = useState<DiceMode>("ROLL_UNDER");
  const [target, setTarget]       = useState(49.5);
  const [minTarget, setMinTarget] = useState(25);
  const [maxTarget, setMaxTarget] = useState(75);
  const [betAmount, setBetAmount] = useState(0);

  // Result
  const [lastResult, setLastResult] = useState<BetResult | null>(null);
  const [isRolling, setIsRolling]   = useState(false);
  const [recentRolls, setRecentRolls] = useState<{ roll: number; won: boolean }[]>([]);
  const [betError, setBetError]       = useState<string | null>(null);

  // Provably fair
  const [clientSeed, setClientSeed]         = useState(() => randomClientSeed());
  const [serverSeedHash, setServerSeedHash] = useState("—");
  const [nonce, setNonce]                   = useState(1);
  const [showPF, setShowPF]                 = useState(false);

  // Auto bet
  const [betTab, setBetTab]                 = useState<"manual" | "auto">("manual");
  const [autoRounds, setAutoRounds]         = useState(10);
  const [autoInfinite, setAutoInfinite]     = useState(false);
  const [autoOnWinAction, setAutoOnWinAction]   = useState<"reset" | "increase" | "none">("none");
  const [autoOnWinPct, setAutoOnWinPct]         = useState(0);
  const [autoOnLossAction, setAutoOnLossAction] = useState<"reset" | "increase" | "none">("none");
  const [autoOnLossPct, setAutoOnLossPct]       = useState(0);
  const [autoStopOnWin, setAutoStopOnWin]       = useState(0);
  const [autoStopOnLoss, setAutoStopOnLoss]     = useState(0);
  const [autoRunning, setAutoRunning]           = useState(false);
  const autoRef        = useRef(false);
  const baseBetRef     = useRef(0);
  const sessionPnlRef  = useRef(0);
  const rollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // SWR history
  const { data: histData } = useSWR<BetResult[]>(
    user ? "/api/casino/dice/history?limit=6" : null,
    (u: string) => fetch(u).then(r => r.ok ? r.json() : []),
  );
  useEffect(() => {
    if (histData) {
      setRecentRolls(histData.map(h => ({ roll: h.roll, won: h.won })).reverse());
    }
  }, [histData]);

  // Computed
  const winChance  = useMemo(() => calcWinChance(mode, target, minTarget, maxTarget), [mode, target, minTarget, maxTarget]);
  const multiplier = useMemo(() => calcMultiplier(winChance), [winChance]);
  const payout     = useMemo(() => betAmount * multiplier, [betAmount, multiplier]);

  // Mode label
  const modeLabel: Record<DiceMode, string> = {
    ROLL_UNDER:   "Roll Under",
    ROLL_OVER:    "Roll Over",
    ROLL_BETWEEN: "Roll Between",
    ROLL_OUTSIDE: "Roll Outside",
  };

  // Target label for bottom input
  const targetDisplay = (() => {
    switch (mode) {
      case "ROLL_UNDER":   return `< ${target.toFixed(2)}`;
      case "ROLL_OVER":    return `> ${target.toFixed(2)}`;
      case "ROLL_BETWEEN": return `${minTarget.toFixed(2)} – ${maxTarget.toFixed(2)}`;
      case "ROLL_OUTSIDE": return `< ${minTarget.toFixed(2)} | > ${maxTarget.toFixed(2)}`;
    }
  })();

  // Sound
  const playSound = useCallback((type: "win" | "loss" | "roll") => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      if (type === "win")  { osc.frequency.value = 880; gain.gain.setValueAtTime(0.25, 0); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35); }
      if (type === "loss") { osc.frequency.value = 220; gain.gain.setValueAtTime(0.15, 0); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25); }
      if (type === "roll") { osc.frequency.value = 440; gain.gain.setValueAtTime(0.08, 0); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1); }
      osc.start(); osc.stop(ctx.currentTime + 0.5);
    } catch { /* ignore */ }
  }, []);

  // Central rolling reset — clears timeout and stops rolling state
  const resetRolling = useCallback(() => {
    if (rollTimeoutRef.current) { clearTimeout(rollTimeoutRef.current); rollTimeoutRef.current = null; }
    setIsRolling(false);
  }, []);

  // Socket setup
  useEffect(() => {
    const s = socket.current;
    if (!s) return;

    const onBetResponse = (data: { ok: boolean; result: BetResult }) => {
      resetRolling();
      if (!data.ok) { setBetError("Bet failed. Try again."); return; }
      setBetError(null);
      const r = data.result;
      setLastResult(r);
      setNonce(n => n + 1);
      setRecentRolls(prev => [...prev.slice(-5), { roll: r.roll, won: r.won }]);
      playSound(r.won ? "win" : "loss");
    };

    // Reset on any error or auth rejection
    const onError    = (e?: { message?: string }) => { resetRolling(); setAutoRunning(false); autoRef.current = false; if (e?.message) setBetError(e.message); };
    const onException = (e?: { message?: string }) => { resetRolling(); setAutoRunning(false); autoRef.current = false; setBetError(e?.message ?? "Unauthorized — please log in again."); };

    s.on("dice:betResponse", onBetResponse);
    s.on("dice:error", onError);
    s.on("exception", onException);      // WsJwtGuard auth failure arrives here
    s.on("connect_error", onError);

    return () => {
      s.off("dice:betResponse", onBetResponse);
      s.off("dice:error", onError);
      s.off("exception", onException);
      s.off("connect_error", onError);
    };
  }, [playSound, resetRolling]);

  // Fetch seeds
  useEffect(() => {
    fetch("/api/casino/dice/seeds/new")
      .then(r => r.json())
      .then(d => d.serverSeedHash && setServerSeedHash(d.serverSeedHash))
      .catch(() => {});
  }, []);

  // Win condition (client-side, for demo mode)
  const isWinLocal = useCallback((roll: number) => {
    switch (mode) {
      case "ROLL_UNDER":   return roll < target;
      case "ROLL_OVER":    return roll > target;
      case "ROLL_BETWEEN": return roll >= minTarget && roll <= maxTarget;
      case "ROLL_OUTSIDE": return roll < minTarget || roll > maxTarget;
    }
  }, [mode, target, minTarget, maxTarget]);

  // Place bet
  const placeBet = useCallback((amount?: number) => {
    if (isRolling) return;
    const betAmt = amount ?? betAmount;
    setBetError(null);

    // ── Demo mode (bet = 0 or not logged in) ──────────────────────────────────
    if (!user || betAmt < 0.01) {
      setIsRolling(true);
      playSound("roll");
      setTimeout(() => {
        const roll = Math.floor(Math.random() * 10000) / 100;  // 0.00–99.99
        const won  = isWinLocal(roll);
        const wc   = calcWinChance(mode, target, minTarget, maxTarget);
        const mult = calcMultiplier(wc);
        const demoResult: BetResult = {
          id: `demo-${Date.now()}`, roll, won,
          payout: 0, profit: 0,
          multiplier: mult, winChance: wc,
          mode, target, minTarget, maxTarget, betAmount: 0,
          serverSeed: "demo", serverSeedHash: "demo",
          clientSeed: "demo", nonce: 0,
          createdAt: new Date().toISOString(),
        };
        setLastResult(demoResult);
        setIsRolling(false);
        setRecentRolls(prev => [...prev.slice(-5), { roll, won }]);
        playSound(won ? "win" : "loss");
      }, 600);
      return;
    }

    // ── Real bet via socket ────────────────────────────────────────────────────
    const s = socket.current;
    if (!s) return;

    setIsRolling(true);
    playSound("roll");

    // Safety timeout — resets if no response arrives within 8s
    if (rollTimeoutRef.current) clearTimeout(rollTimeoutRef.current);
    rollTimeoutRef.current = setTimeout(() => {
      setIsRolling(false);
      rollTimeoutRef.current = null;
      setBetError("No response from server. Please try again.");
    }, 8000);

    s.emit("dice:bet", { betAmount: betAmt, mode, target, minTarget, maxTarget, clientSeed, nonce });
  }, [isRolling, betAmount, user, playSound, isWinLocal, mode, target, minTarget, maxTarget, clientSeed, nonce]);

  // Auto bet engine
  const runAutoStep = useCallback(async (currentBet: number, roundsLeft: number) => {
    if (!autoRef.current) return;
    const s = socket.current;
    if (!s) return;
    setIsRolling(true);
    playSound("roll");
    s.emit("dice:bet", { betAmount: currentBet, mode, target, minTarget, maxTarget, clientSeed, nonce });

    await new Promise<void>(resolve => {
      const handler = (data: { ok: boolean; result: BetResult }) => {
        if (!data.ok) { resolve(); return; }
        const r = data.result;
        setLastResult(r);
        setIsRolling(false);
        setNonce(n => n + 1);
        setRecentRolls(prev => [...prev.slice(-5), { roll: r.roll, won: r.won }]);
        playSound(r.won ? "win" : "loss");
        sessionPnlRef.current += r.profit;

        if (autoStopOnWin > 0 && sessionPnlRef.current >= autoStopOnWin) { autoRef.current = false; }
        if (autoStopOnLoss > 0 && sessionPnlRef.current <= -autoStopOnLoss) { autoRef.current = false; }

        let nextBet = currentBet;
        if (r.won) {
          if (autoOnWinAction === "reset") nextBet = baseBetRef.current;
          if (autoOnWinAction === "increase") nextBet = currentBet * (1 + autoOnWinPct / 100);
        } else {
          if (autoOnLossAction === "reset") nextBet = baseBetRef.current;
          if (autoOnLossAction === "increase") nextBet = currentBet * (1 + autoOnLossPct / 100);
        }
        nextBet = Math.max(1, Math.round(nextBet * 100) / 100);
        const next = autoInfinite ? Infinity : roundsLeft - 1;
        if (autoRef.current && next > 0) {
          setTimeout(() => runAutoStep(nextBet, next), 700);
        } else {
          autoRef.current = false;
          setAutoRunning(false);
        }
        s.off("dice:betResponse", handler);
        resolve();
      };
      s.once("dice:betResponse", handler);
    });
  }, [autoInfinite, autoOnLossAction, autoOnLossPct, autoOnWinAction, autoOnWinPct, autoStopOnLoss, autoStopOnWin, clientSeed, maxTarget, minTarget, mode, nonce, playSound, target]);

  const startAuto = useCallback(() => {
    if (!user || autoRunning) return;
    autoRef.current = true;
    setAutoRunning(true);
    baseBetRef.current = betAmount;
    sessionPnlRef.current = 0;
    runAutoStep(betAmount, autoInfinite ? Infinity : autoRounds);
  }, [user, autoRunning, betAmount, autoRounds, autoInfinite, runAutoStep]);

  const stopAuto = useCallback(() => { autoRef.current = false; setAutoRunning(false); }, []);

  const rotateSeeds = useCallback(() => {
    setClientSeed(randomClientSeed());
    setNonce(1);
    fetch("/api/casino/dice/seeds/new").then(r => r.json()).then(d => d.serverSeedHash && setServerSeedHash(d.serverSeedHash)).catch(() => {});
  }, []);

  // Swap target (Roll Under ↔ Roll Over)
  const swapTarget = () => {
    if (mode === "ROLL_UNDER") setMode("ROLL_OVER");
    else if (mode === "ROLL_OVER") setMode("ROLL_UNDER");
  };

  const isLoggedIn = !!user;

  return (
    <>
      {/* Mobile back */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 sticky top-0 z-10"
        style={{ background: "#0a0918", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <Link href="/" className="flex items-center gap-1.5 text-white/50 hover:text-white text-sm font-semibold">
          <ArrowLeft size={15} /> Back
        </Link>
        <button onClick={() => setShowPF(true)} className="text-purple-400 text-xs font-semibold flex items-center gap-1">
          <Shield size={13} /> Provably Fair
        </button>
      </div>

      <div className="min-h-screen text-white" style={{ background: "#0a0918" }}>
        <div className="flex flex-col lg:flex-row min-h-screen">

          {/* ═══ LEFT PANEL — Betting Controls ════════════════════════════════ */}
          <div className="w-full lg:w-[420px] shrink-0 flex flex-col"
            style={{ background: "#13112a", borderRight: "1px solid rgba(255,255,255,0.05)" }}>

            {/* Manual / Auto tabs */}
            <div className="flex" style={{ borderBottom: "2px solid rgba(255,255,255,0.05)" }}>
              {(["manual", "auto"] as const).map(tab => (
                <button key={tab} onClick={() => setBetTab(tab)}
                  className="flex-1 py-4 font-bold text-base capitalize tracking-wide transition-all"
                  style={{
                    color: betTab === tab ? "white" : "rgba(255,255,255,0.35)",
                    borderBottom: betTab === tab ? "2px solid #7c3aed" : "2px solid transparent",
                    marginBottom: -2,
                  }}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            <div className="p-5 flex flex-col gap-5 flex-1">

              {/* ── Bet Amount ── */}
              <div>
                <label className="flex items-center gap-2 text-sm font-bold mb-3" style={{ color: "rgba(255,255,255,0.7)" }}>
                  Bet Amount
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center rounded-xl px-4 h-14"
                    style={{ background: "#1e1b3a", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <span className="text-white/50 mr-2 text-base">₹</span>
                    <input
                      type="number"
                      value={betAmount === 0 ? "" : betAmount}
                      placeholder="0"
                      onChange={e => setBetAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                      disabled={isRolling || autoRunning}
                      className="flex-1 bg-transparent text-white font-bold text-base outline-none tabular-nums"
                    />
                  </div>
                  {/* Quick multiplier buttons */}
                  {[{ label: "1/2", fn: () => setBetAmount(p => Math.max(0, Math.round(p / 2 * 100) / 100)) },
                    { label: "2X",  fn: () => setBetAmount(p => Math.round(p * 2 * 100) / 100) },
                    { label: "Max", fn: () => setBetAmount(1_000_000) }
                  ].map(b => (
                    <button key={b.label} onClick={b.fn} disabled={isRolling || autoRunning}
                      className="h-14 px-4 rounded-xl font-bold text-sm transition hover:brightness-110 disabled:opacity-40"
                      style={{ background: "#2d2b50", color: "rgba(255,255,255,0.7)" }}>
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Payout on Win ── */}
              <div>
                <label className="text-sm font-bold mb-3 block" style={{ color: "rgba(255,255,255,0.7)" }}>
                  Payout on Win
                </label>
                <div className="flex items-center rounded-xl px-4 h-14"
                  style={{ background: "#1e1b3a", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <span className="text-white/50 mr-2 text-base">₹</span>
                  <span className="text-white font-bold text-base tabular-nums">
                    {fmtNum(payout)}
                  </span>
                </div>
              </div>

              {betTab === "manual" ? (
                <>
                  {/* ── Roll Dice Button ── */}
                  <motion.button
                    onClick={() => placeBet()}
                    disabled={!isLoggedIn || isRolling || autoRunning}
                    whileTap={{ scale: 0.97 }}
                    className="w-full h-14 rounded-xl font-black text-lg tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
                    style={{
                      background: isRolling
                        ? "rgba(245,197,24,0.4)"
                        : "linear-gradient(135deg, #f5c518 0%, #f0a500 100%)",
                      boxShadow: isRolling ? "none" : "0 4px 20px rgba(245,197,24,0.35)",
                      color: "#1a0a00",
                    }}
                  >
                    {isRolling ? (
                      <span className="flex items-center justify-center gap-2">
                        <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.5, repeat: Infinity, ease: "linear" }}
                          className="inline-block text-xl">⚄</motion.span>
                        Rolling...
                      </span>
                    ) : !isLoggedIn ? "Login to Play" : "Roll Dice"}
                  </motion.button>

                  {/* Error display */}
                  {betError && (
                    <div className="text-red-400 text-xs text-center font-semibold mt-1">{betError}</div>
                  )}

                  {/* Demo mode note */}
                  <div className="rounded-xl px-4 py-3 text-center text-sm font-semibold"
                    style={{ background: "rgba(124,58,237,0.15)", color: "rgba(167,139,250,0.85)" }}>
                    Betting less than ₹0.01 will enter demo mode
                  </div>
                </>
              ) : (
                // ── Auto Bet UI ──
                <div className="space-y-4">
                  {/* Rounds */}
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-white/40 block mb-1.5">Number of Bets</label>
                      <div className="flex items-center rounded-xl px-4 h-12"
                        style={{ background: "#1e1b3a", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <input type="number" value={autoRounds} min={1}
                          onChange={e => setAutoRounds(Math.max(1, parseInt(e.target.value) || 1))}
                          disabled={autoInfinite || autoRunning}
                          className="flex-1 bg-transparent text-white font-bold outline-none tabular-nums" />
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-1 pb-1">
                      <span className="text-xs text-white/40">∞</span>
                      <button onClick={() => setAutoInfinite(a => !a)} disabled={autoRunning}
                        className="w-11 h-6 rounded-full transition-colors relative"
                        style={{ background: autoInfinite ? "#7c3aed" : "rgba(255,255,255,0.1)" }}>
                        <span className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all"
                          style={{ left: autoInfinite ? "calc(100% - 20px)" : 4 }} />
                      </button>
                    </div>
                  </div>

                  {/* On Win / On Loss */}
                  {(["win", "loss"] as const).map(type => {
                    const action = type === "win" ? autoOnWinAction : autoOnLossAction;
                    const setAction = type === "win" ? setAutoOnWinAction : setAutoOnLossAction;
                    const pct = type === "win" ? autoOnWinPct : autoOnLossPct;
                    const setPct = type === "win" ? setAutoOnWinPct : setAutoOnLossPct;
                    const color = type === "win" ? "#22c55e" : "#ef4444";
                    return (
                      <div key={type}>
                        <label className="text-xs text-white/40 block mb-1.5 capitalize">On {type}</label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(["none", "reset", "increase"] as const).map(a => (
                            <button key={a} onClick={() => setAction(a)} disabled={autoRunning}
                              className="py-2 rounded-lg text-xs font-bold capitalize transition"
                              style={{
                                background: action === a ? `${color}22` : "rgba(255,255,255,0.05)",
                                color: action === a ? color : "rgba(255,255,255,0.4)",
                                border: action === a ? `1px solid ${color}44` : "1px solid transparent",
                              }}>
                              {a}
                            </button>
                          ))}
                        </div>
                        {action === "increase" && (
                          <div className="flex items-center gap-2 mt-2">
                            <input type="number" value={pct} min={0}
                              onChange={e => setPct(parseFloat(e.target.value) || 0)}
                              className="w-20 px-3 py-1.5 rounded-lg text-xs font-mono text-white outline-none"
                              style={{ background: "#1e1b3a", border: "1px solid rgba(255,255,255,0.08)" }} />
                            <span className="text-xs text-white/40">% increase</span>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Stop conditions */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Stop on Profit ₹", val: autoStopOnWin, set: setAutoStopOnWin },
                      { label: "Stop on Loss ₹", val: autoStopOnLoss, set: setAutoStopOnLoss },
                    ].map(f => (
                      <div key={f.label}>
                        <label className="text-xs text-white/40 block mb-1.5">{f.label}</label>
                        <input type="number" value={f.val} min={0}
                          onChange={e => f.set(parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2.5 rounded-lg text-sm text-white font-bold outline-none"
                          style={{ background: "#1e1b3a", border: "1px solid rgba(255,255,255,0.07)" }} />
                      </div>
                    ))}
                  </div>

                  {/* Start / Stop */}
                  <motion.button
                    onClick={autoRunning ? stopAuto : startAuto}
                    disabled={!isLoggedIn}
                    whileTap={{ scale: 0.97 }}
                    className="w-full h-14 rounded-xl font-black text-lg transition-all disabled:opacity-50"
                    style={{
                      background: autoRunning
                        ? "linear-gradient(135deg, #ef4444, #dc2626)"
                        : "linear-gradient(135deg, #f5c518, #f0a500)",
                      color: autoRunning ? "white" : "#1a0a00",
                      boxShadow: autoRunning ? "0 4px 20px rgba(239,68,68,0.3)" : "0 4px 20px rgba(245,197,24,0.35)",
                    }}
                  >
                    {!isLoggedIn ? "Login to Play" : autoRunning ? "⏹ Stop Auto" : "▶ Start Auto"}
                  </motion.button>
                </div>
              )}

              {/* Provably fair link */}
              <button onClick={() => setShowPF(true)}
                className="flex items-center gap-2 text-sm font-semibold mx-auto"
                style={{ color: "rgba(167,139,250,0.7)" }}>
                <Shield size={14} /> Provably Fair
              </button>
            </div>
          </div>

          {/* ═══ RIGHT PANEL — Game Area ═══════════════════════════════════════ */}
          <div className="flex-1 flex flex-col justify-center p-6 md:p-10 lg:p-14 gap-8">

            {/* ── Slider ── */}
            <div className="w-full max-w-3xl mx-auto">
              <DiceSlider
                mode={mode} target={target} minTarget={minTarget} maxTarget={maxTarget}
                onTargetChange={setTarget} onMinChange={setMinTarget} onMaxChange={setMaxTarget}
                disabled={isRolling || autoRunning}
                lastRoll={lastResult?.roll ?? null}
                isRolling={isRolling}
                lastWon={lastResult?.won ?? null}
              />
            </div>

            {/* ── Mode selector + Recent rolls ── */}
            <div className="w-full max-w-3xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold mb-3" style={{ color: "rgba(255,255,255,0.5)" }}>
                  Game Mode — {modeLabel[mode]}
                </p>
                <div className="flex gap-2">
                  {MODE_ICONS.map(({ mode: m, dots }) => (
                    <button key={m} onClick={() => setMode(m)} disabled={isRolling || autoRunning}
                      title={modeLabel[m]}>
                      <DiceIcon dots={dots} active={mode === m} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Recent rolls */}
              <div className="flex items-center gap-2 flex-wrap">
                <AnimatePresence>
                  {recentRolls.map((r, i) => (
                    <motion.span
                      key={i}
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-sm font-black tabular-nums"
                      style={{ color: r.won ? "#22c55e" : "#ef4444" }}
                    >
                      {r.roll.toFixed(2)}
                    </motion.span>
                  ))}
                </AnimatePresence>
                {recentRolls.length === 0 && (
                  <span className="text-xs text-white/20">No rolls yet</span>
                )}
              </div>
            </div>

            {/* ── Bottom inputs ── */}
            <div className="w-full max-w-3xl mx-auto">
              <div className="flex gap-3 flex-col md:flex-row">
                {/* Roll Under/Over/Between/Outside label */}
                <StatInput
                  label={modeLabel[mode]}
                  value={targetDisplay}
                  readOnly
                  onSwap={(mode === "ROLL_UNDER" || mode === "ROLL_OVER") ? swapTarget : undefined}
                />

                <StatInput
                  label="Win Chance"
                  value={winChance.toFixed(2)}
                  onChange={v => {
                    const wc = parseFloat(v);
                    if (isNaN(wc) || wc < 0.01 || wc > 98.99) return;
                    if (mode === "ROLL_UNDER") setTarget(wc);
                    else if (mode === "ROLL_OVER") setTarget(100 - wc);
                  }}
                  readOnly={mode === "ROLL_BETWEEN" || mode === "ROLL_OUTSIDE"}
                  unit="%" numeric
                />

                <StatInput
                  label="Multiplier"
                  value={multiplier.toFixed(4)}
                  onChange={v => {
                    const m = parseFloat(v);
                    if (isNaN(m) || m <= 1) return;
                    const wc = Math.max(0.01, Math.min(98.99, 99 / m));
                    if (mode === "ROLL_UNDER") setTarget(wc);
                    else if (mode === "ROLL_OVER") setTarget(100 - wc);
                  }}
                  readOnly={mode === "ROLL_BETWEEN" || mode === "ROLL_OUTSIDE"}
                  unit="×" numeric
                />
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Provably Fair Modal */}
      <AnimatePresence>
        {showPF && (
          <ProvablyFairModal
            serverSeedHash={serverSeedHash} clientSeed={clientSeed} nonce={nonce}
            lastResult={lastResult}
            onClientSeedChange={setClientSeed} onRotateSeeds={rotateSeeds} onClose={() => setShowPF(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
