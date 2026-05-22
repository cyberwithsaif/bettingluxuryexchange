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

// ─── Result Marker (3D dice cube on the track) ───────────────────────────────
function HexMarker({ roll, won }: { roll: number; won: boolean }) {
  const left = Math.max(4, Math.min(96, roll));
  const numColor = won ? "#22c55e" : "#ef4444";
  const glowColor = won ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)";

  return (
    <motion.div
      initial={{ opacity: 0, y: -14, scale: 0.75 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.75 }}
      transition={{ type: "spring", stiffness: 380, damping: 26 }}
      style={{
        position: "absolute",
        left: `${left}%`,
        bottom: "calc(100% + 14px)",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        pointerEvents: "none",
        zIndex: 30,
      }}
    >
      {/* 3D Cube */}
      <div style={{ position: "relative", width: 78, height: 58 }}>

        {/* Top face */}
        <div style={{
          position: "absolute",
          left: 9, top: 0,
          width: 62, height: 14,
          background: "linear-gradient(90deg, #f0f0f8 0%, #d8d8e8 100%)",
          borderRadius: "6px 6px 0 0",
          transform: "skewX(-30deg)",
          transformOrigin: "bottom left",
        }} />

        {/* Right side face */}
        <div style={{
          position: "absolute",
          right: 0, top: 7,
          width: 12, height: 44,
          background: "linear-gradient(180deg, #a0a0b8 0%, #787890 100%)",
          borderRadius: "0 4px 4px 0",
          transform: "skewY(-30deg)",
          transformOrigin: "top left",
        }} />

        {/* Front face */}
        <div style={{
          position: "absolute",
          left: 0, top: 10,
          width: 66, height: 46,
          background: "linear-gradient(145deg, #ffffff 0%, #e8e8f2 60%, #d4d4e4 100%)",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 6px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.9)`,
        }}>
          <span style={{
            fontWeight: 900,
            fontSize: 15,
            letterSpacing: "0.03em",
            color: numColor,
            fontFamily: "'SF Mono', 'Fira Code', monospace",
            textShadow: `0 0 10px ${glowColor}`,
          }}>
            {roll.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Arrow */}
      <div style={{
        width: 0, height: 0,
        borderLeft: "7px solid transparent",
        borderRight: "7px solid transparent",
        borderTop: "8px solid #d4d4e4",
        marginTop: -2,
        filter: `drop-shadow(0 2px 4px rgba(0,0,0,0.3))`,
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

      {/* Track wrapper — paddingTop reserves space for the floating marker above */}
      <div className="relative" style={{ paddingTop: 70 }}>

        {/* Track — overflow:visible lets the marker float above it */}
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
              <div style={{ display: "flex", gap: 2 }}>
                {[0,1,2].map(j => (
                  <div key={j} style={{ width: 2, height: 10, borderRadius: 1, background: "rgba(255,255,255,0.25)" }} />
                ))}
              </div>
            </div>
          ))}

          {/* Result / rolling marker — lives inside the track so bottom:calc(100%+…) works */}
          <AnimatePresence>
            {lastRoll !== null && !isRolling && (
              <HexMarker key={lastRoll} roll={lastRoll} won={!!lastWon} />
            )}
            {isRolling && (
              <motion.div
                key="rolling"
                animate={{ left: ["8%", "82%", "28%", "68%", "18%", "54%", "38%"] }}
                transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
                style={{
                  position: "absolute",
                  bottom: "calc(100% + 12px)",
                  transform: "translateX(-50%)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  zIndex: 30,
                  pointerEvents: "none",
                  filter: "drop-shadow(0 4px 14px rgba(124,58,237,0.55))",
                }}
              >
                <div style={{
                  background: "linear-gradient(135deg, #4c1d95 0%, #7c3aed 50%, #a78bfa 100%)",
                  borderRadius: 12,
                  padding: "2px",
                  minWidth: 72,
                }}>
                  <div style={{
                    background: "linear-gradient(135deg, #080618 0%, #110935 100%)",
                    borderRadius: 10,
                    padding: "6px 14px",
                    textAlign: "center",
                  }}>
                    <span style={{ color: "#a78bfa", fontWeight: 900, fontSize: 16, fontFamily: "monospace", letterSpacing: "0.06em" }}>···</span>
                  </div>
                </div>
                <div style={{
                  width: 0, height: 0,
                  borderLeft: "8px solid transparent",
                  borderRight: "8px solid transparent",
                  borderTop: "9px solid #7c3aed",
                  marginTop: -1,
                }} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Scale labels — below the track */}
      <div className="flex justify-between mt-5 px-0.5 text-sm font-bold select-none"
        style={{ color: "rgba(255,255,255,0.35)" }}>
        {["0", "25", "50", "75", "100"].map(n => <span key={n}>{n}</span>)}
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

      <div className="min-h-screen text-white" style={{ background: "#090c1c" }}>
        <div className="flex flex-col lg:flex-row min-h-screen">

          {/* ═══ LEFT SIDEBAR — Betting Controls ═════════════════════════════ */}
          <div className="w-full lg:w-[340px] shrink-0 flex flex-col p-4 lg:p-5 overflow-y-auto"
            style={{ background: "#090c1c" }}>

            {/* ── Betting Card ── */}
            <div className="rounded-2xl flex flex-col gap-0 overflow-hidden"
              style={{ background: "#0d0f1e", border: "1px solid rgba(255,255,255,0.07)" }}>

              {/* Manual / Auto tabs — underline style */}
              <div className="flex items-center" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                {(["manual", "auto"] as const).map(tab => (
                  <button key={tab} onClick={() => setBetTab(tab)}
                    className={`flex-1 py-3.5 text-sm font-bold capitalize transition-all relative ${
                      betTab === tab ? "text-white" : "text-white/35 hover:text-white/60"
                    }`}>
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    {betTab === tab && (
                      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-0.5 rounded-full bg-[#7c3aed]" />
                    )}
                  </button>
                ))}
              </div>

              {/* Form fields */}
              <div className="p-4 flex flex-col gap-4">

                {/* Bet Amount */}
                <div>
                  <label className="text-[11px] text-white/40 font-semibold uppercase tracking-wider block mb-2">Bet Amount</label>
                  <div className="flex items-stretch h-11 rounded-xl overflow-hidden"
                    style={{ background: "#181a2e", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="flex items-center pl-3.5 flex-1 gap-1.5">
                      <span className="text-emerald-400 font-bold text-sm">₹</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={betAmount === 0 ? "" : betAmount}
                        placeholder="0.00"
                        onChange={e => setBetAmount(Math.max(0, parseFloat(e.target.value.replace(/[^\d.]/g, "")) || 0))}
                        disabled={isRolling || autoRunning}
                        className="flex-1 bg-transparent text-white font-bold text-sm outline-none tabular-nums disabled:opacity-60 placeholder-white/20"
                      />
                    </div>
                    <div className="flex items-center" style={{ borderLeft: "1px solid rgba(255,255,255,0.07)" }}>
                      <button onClick={() => setBetAmount(p => Math.max(0, Math.round(p / 2 * 100) / 100))}
                        disabled={isRolling || autoRunning}
                        className="px-3 h-full text-xs font-bold text-white/40 hover:text-white hover:bg-white/5 disabled:opacity-30 transition">½</button>
                      <button onClick={() => setBetAmount(p => Math.round(p * 2 * 100) / 100)}
                        disabled={isRolling || autoRunning}
                        className="px-3 h-full text-xs font-bold text-white/40 hover:text-white hover:bg-white/5 disabled:opacity-30 transition"
                        style={{ borderLeft: "1px solid rgba(255,255,255,0.07)" }}>2×</button>
                    </div>
                  </div>
                </div>

                {/* Payout on Win */}
                <div>
                  <label className="text-[11px] text-white/40 font-semibold uppercase tracking-wider block mb-2">Payout on Win</label>
                  <div className="flex items-center h-11 rounded-xl px-3.5 gap-1.5"
                    style={{ background: "#181a2e", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <span className="text-emerald-400 font-bold text-sm">₹</span>
                    <span className="text-white font-bold tabular-nums text-sm">{fmtNum(payout)}</span>
                  </div>
                </div>

              {betTab === "manual" ? (
                <>
                  {/* Roll Dice Button */}
                  <motion.button
                    onClick={() => placeBet()}
                    disabled={!isLoggedIn || isRolling || autoRunning}
                    whileTap={{ scale: 0.97 }}
                    className="w-full h-12 rounded-xl font-black text-base tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: isRolling ? "rgba(245,197,24,0.35)" : "linear-gradient(135deg, #f5c518 0%, #f0a500 100%)",
                      boxShadow: isRolling ? "none" : "0 0 24px rgba(245,197,24,0.25), 0 4px 12px rgba(0,0,0,0.3)",
                      color: "#1a0800",
                    }}
                  >
                    {isRolling ? "Rolling..." : !isLoggedIn ? "Login to Play" : "Roll Dice"}
                  </motion.button>

                  {/* Error display */}
                  {betError && <div className="text-red-400 text-xs text-center font-semibold">{betError}</div>}

                  {/* Provably Fair link */}
                  <button onClick={() => setShowPF(true)}
                    className="flex items-center justify-center gap-1.5 text-xs font-semibold py-1"
                    style={{ color: "rgba(167,139,250,0.6)" }}>
                    <Shield size={11} /> Provably Fair
                  </button>
                </>
              ) : (
                // ── Auto Bet UI ──
                <div className="space-y-4">
                  {/* Rounds */}
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-white/40 block mb-1.5">Number of Bets</label>
                      <div className="flex items-center rounded-lg px-3 h-10 bg-[#132737] border border-white/5">
                        <input type="number" value={autoRounds} min={1}
                          onChange={e => setAutoRounds(Math.max(1, parseInt(e.target.value) || 1))}
                          disabled={autoInfinite || autoRunning}
                          className="flex-1 bg-transparent text-white font-bold text-sm outline-none tabular-nums" />
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

              </div>{/* end form fields */}
            </div>{/* end betting card */}
          </div>

          {/* ═══ GAME AREA ═════════════════════════════════════════════════════ */}
          <div className="flex-1 flex flex-col justify-center p-4 md:p-6 lg:p-8">

            {/* ── Game Card ── */}
            <div className="w-full h-full flex flex-col justify-center gap-8 rounded-2xl p-6 md:p-10"
              style={{ background: "#0d0f1e", border: "1px solid rgba(255,255,255,0.06)" }}>

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

            </div>{/* end game card */}
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
