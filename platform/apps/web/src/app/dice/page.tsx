"use client";
import Link from "next/link";
import { ArrowLeft, Shield, ChevronDown, ChevronUp, RefreshCw, Copy, Check, Volume2, VolumeX, RotateCcw, Info } from "lucide-react";
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

interface LiveBet {
  username: string;
  roll: number;
  won: boolean;
  multiplier: number;
  betAmount: number;
  payout: number;
  mode: DiceMode;
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
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Dice Visual ──────────────────────────────────────────────────────────────
function DiceFace({ value, size = 80 }: { value: number | null; size?: number }) {
  const dots: [number, number][][] = [
    [],
    [[50, 50]],
    [[25, 25], [75, 75]],
    [[25, 25], [50, 50], [75, 75]],
    [[25, 25], [75, 25], [25, 75], [75, 75]],
    [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
    [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]],
  ];
  const positions = (value != null && value >= 1 && value <= 6 ? dots[value] : []) ?? [];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <rect x="4" y="4" width="92" height="92" rx="18" fill="url(#diceFill)" stroke="url(#diceBorder)" strokeWidth="2" />
      <defs>
        <linearGradient id="diceFill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1e1b4b" />
          <stop offset="100%" stopColor="#0f0c29" />
        </linearGradient>
        <linearGradient id="diceBorder" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      {positions.map((pos, i) => (
        <circle key={i} cx={pos[0]} cy={pos[1]} r="7" fill="#a855f7" filter="url(#glow)" />
      ))}
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
    </svg>
  );
}

// ─── Slider Component ─────────────────────────────────────────────────────────
function DiceSlider({
  mode, target, minTarget, maxTarget,
  onTargetChange, onMinChange, onMaxChange,
  disabled,
}: {
  mode: DiceMode; target: number; minTarget: number; maxTarget: number;
  onTargetChange: (v: number) => void; onMinChange: (v: number) => void; onMaxChange: (v: number) => void;
  disabled: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<null | "single" | "min" | "max">(null);

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const round = (v: number) => Math.round(v * 100) / 100;

  const getPercent = (e: MouseEvent | TouchEvent) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const clientX = "touches" in e ? e.touches[0]!.clientX : e.clientX;
    return clamp((clientX - rect.left) / rect.width * 100, 0, 100);
  };

  const startDrag = (handle: "single" | "min" | "max") => (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    dragging.current = handle;
  };

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging.current) return;
      const pct = getPercent(e);
      const val = round(pct);
      if (dragging.current === "single") {
        onTargetChange(clamp(val, 2, 98));
      } else if (dragging.current === "min") {
        onMinChange(clamp(val, 1, maxTarget - 1));
      } else if (dragging.current === "max") {
        onMaxChange(clamp(val, minTarget + 1, 99));
      }
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

  // Compute green/red zones
  const winZones: { left: string; width: string; color: string }[] = (() => {
    switch (mode) {
      case "ROLL_UNDER":
        return [
          { left: "0%", width: `${target}%`, color: "#22c55e" },
          { left: `${target}%`, width: `${100 - target}%`, color: "#ef4444" },
        ];
      case "ROLL_OVER":
        return [
          { left: "0%", width: `${target}%`, color: "#ef4444" },
          { left: `${target}%`, width: `${100 - target}%`, color: "#22c55e" },
        ];
      case "ROLL_BETWEEN":
        return [
          { left: "0%", width: `${minTarget}%`, color: "#ef4444" },
          { left: `${minTarget}%`, width: `${maxTarget - minTarget}%`, color: "#22c55e" },
          { left: `${maxTarget}%`, width: `${100 - maxTarget}%`, color: "#ef4444" },
        ];
      case "ROLL_OUTSIDE":
        return [
          { left: "0%", width: `${minTarget}%`, color: "#22c55e" },
          { left: `${minTarget}%`, width: `${maxTarget - minTarget}%`, color: "#ef4444" },
          { left: `${maxTarget}%`, width: `${100 - maxTarget}%`, color: "#22c55e" },
        ];
    }
  })();

  const handleStyle = (left: number): React.CSSProperties => ({
    position: "absolute",
    left: `${left}%`,
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: 24,
    height: 24,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #7c3aed, #a855f7)",
    border: "3px solid #fff",
    boxShadow: "0 0 12px rgba(139, 92, 246, 0.8)",
    cursor: disabled ? "not-allowed" : "grab",
    zIndex: 10,
    touchAction: "none",
  });

  return (
    <div className="w-full select-none py-4">
      {/* Track */}
      <div ref={trackRef} className="relative h-4 rounded-full overflow-hidden" style={{ background: "#1e1b3a" }}>
        {winZones.map((z, i) => (
          <div key={i} className="absolute h-full transition-all duration-150"
            style={{ left: z.left, width: z.width, background: z.color, opacity: 0.7 }} />
        ))}
        {/* Handles */}
        {(mode === "ROLL_UNDER" || mode === "ROLL_OVER") && (
          <div style={handleStyle(target)} onMouseDown={startDrag("single")} onTouchStart={startDrag("single")} />
        )}
        {(mode === "ROLL_BETWEEN" || mode === "ROLL_OUTSIDE") && (
          <>
            <div style={handleStyle(minTarget)} onMouseDown={startDrag("min")} onTouchStart={startDrag("min")} />
            <div style={handleStyle(maxTarget)} onMouseDown={startDrag("max")} onTouchStart={startDrag("max")} />
          </>
        )}
      </div>
      {/* Labels */}
      <div className="flex justify-between mt-2 text-[11px] text-white/40 font-mono">
        <span>0.00</span>
        <span>25.00</span>
        <span>50.00</span>
        <span>75.00</span>
        <span>99.99</span>
      </div>
    </div>
  );
}

// ─── Provably Fair Modal ───────────────────────────────────────────────────────
function ProvablyFairModal({
  serverSeedHash, clientSeed, nonce, lastResult,
  onClientSeedChange, onRotateSeeds, onClose,
}: {
  serverSeedHash: string; clientSeed: string; nonce: number; lastResult: BetResult | null;
  onClientSeedChange: (s: string) => void; onRotateSeeds: () => void; onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  };
  const CopyBtn = ({ text, k }: { text: string; k: string }) => (
    <button onClick={() => copy(text, k)} className="ml-2 text-white/40 hover:text-purple-400 transition shrink-0">
      {copied === k ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
    </button>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
        className="w-full max-w-lg rounded-2xl p-6 space-y-5"
        style={{ background: "#13112a", border: "1px solid rgba(139,92,246,0.3)" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield size={20} className="text-purple-400" />
            <h2 className="text-white font-bold text-lg">Provably Fair</h2>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none">×</button>
        </div>

        <p className="text-white/50 text-sm">
          Every roll is cryptographically verifiable. The server seed hash is published before each bet.
          After the bet, the full server seed is revealed so you can verify the result.
        </p>

        {/* Server seed hash */}
        <div>
          <label className="text-[11px] uppercase tracking-wider text-white/40 mb-1 block">Server Seed Hash (SHA-256)</label>
          <div className="flex items-center rounded-lg px-3 py-2 gap-2" style={{ background: "#1e1b3a" }}>
            <span className="text-xs font-mono text-purple-300 truncate flex-1">{serverSeedHash}</span>
            <CopyBtn text={serverSeedHash} k="hash" />
          </div>
        </div>

        {/* Client seed */}
        <div>
          <label className="text-[11px] uppercase tracking-wider text-white/40 mb-1 block">Client Seed (editable)</label>
          <div className="flex items-center rounded-lg px-3 py-2 gap-2" style={{ background: "#1e1b3a" }}>
            <input
              value={clientSeed}
              onChange={e => onClientSeedChange(e.target.value)}
              className="flex-1 bg-transparent text-xs font-mono text-white outline-none"
              maxLength={64}
            />
            <button onClick={() => onClientSeedChange(randomClientSeed())}
              className="text-white/40 hover:text-purple-400 transition shrink-0" title="Randomize">
              <RefreshCw size={13} />
            </button>
            <CopyBtn text={clientSeed} k="client" />
          </div>
        </div>

        {/* Nonce */}
        <div>
          <label className="text-[11px] uppercase tracking-wider text-white/40 mb-1 block">Nonce (bet count)</label>
          <div className="flex items-center rounded-lg px-3 py-2" style={{ background: "#1e1b3a" }}>
            <span className="text-xs font-mono text-white/70">{nonce}</span>
          </div>
        </div>

        {/* Last result verification */}
        {lastResult && (
          <div className="rounded-lg p-4 space-y-2" style={{ background: "#1e1b3a", border: "1px solid rgba(139,92,246,0.2)" }}>
            <p className="text-[11px] uppercase tracking-wider text-white/40">Last Roll Verification</p>
            <div className="space-y-1">
              {([
                ["Server Seed", lastResult.serverSeed],
                ["Client Seed", lastResult.clientSeed],
                ["Nonce", String(lastResult.nonce)],
                ["Roll", lastResult.roll.toFixed(2)],
              ] as [string, string][]).map(([label, val]) => (
                <div key={label} className="flex items-center justify-between text-xs">
                  <span className="text-white/40">{label}</span>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-white/70 truncate max-w-[200px]">{val}</span>
                    <CopyBtn text={val} k={label} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onRotateSeeds}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-purple-300 transition hover:brightness-110"
            style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)" }}>
            <RefreshCw size={14} /> Rotate Seeds
          </button>
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white/70 hover:text-white transition"
            style={{ background: "rgba(255,255,255,0.05)" }}>
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DicePage() {
  const { user } = useAuthStore();
  const socket = useRef(getSocket());

  // ── Game state ──
  const [mode, setMode]           = useState<DiceMode>("ROLL_UNDER");
  const [target, setTarget]       = useState(49.5);
  const [minTarget, setMinTarget] = useState(25);
  const [maxTarget, setMaxTarget] = useState(75);
  const [betAmount, setBetAmount] = useState(100);
  const [isRolling, setIsRolling] = useState(false);
  const [lastResult, setLastResult] = useState<BetResult | null>(null);

  // ── Provably fair ──
  const [clientSeed, setClientSeed]         = useState(() => randomClientSeed());
  const [serverSeedHash, setServerSeedHash] = useState("—");
  const [nonce, setNonce]                   = useState(1);
  const [showPF, setShowPF]                 = useState(false);

  // ── Auto bet ──
  const [autoMode, setAutoMode]       = useState(false);
  const [autoRounds, setAutoRounds]   = useState(10);
  const [autoInfinite, setAutoInfinite] = useState(false);
  const [autoOnWinAction, setAutoOnWinAction]     = useState<"reset" | "increase" | "none">("none");
  const [autoOnWinPct, setAutoOnWinPct]           = useState(0);
  const [autoOnLossAction, setAutoOnLossAction]   = useState<"reset" | "increase" | "none">("none");
  const [autoOnLossPct, setAutoOnLossPct]         = useState(0);
  const [autoStopOnWin, setAutoStopOnWin]         = useState(0);
  const [autoStopOnLoss, setAutoStopOnLoss]       = useState(0);
  const [autoRunning, setAutoRunning]             = useState(false);
  const autoRef = useRef(false);
  const autoRoundsLeftRef = useRef(0);
  const baseBetRef = useRef(100);
  const sessionProfitRef = useRef(0);

  // ── UI state ──
  const [balance, setBalance]     = useState<number | null>(null);
  const [liveFeed, setLiveFeed]   = useState<LiveBet[]>([]);
  const [history, setHistory]     = useState<BetResult[]>([]);
  const [sessionStats, setSessionStats] = useState({ bets: 0, wins: 0, wagered: 0, profit: 0 });
  const [sound, setSound]         = useState(true);
  const [betTab, setBetTab]       = useState<"manual" | "auto">("manual");
  const [showHistory, setShowHistory] = useState(true);

  // SWR for initial history
  const { data: histData } = useSWR<BetResult[]>(
    user ? "/api/casino/dice/history?limit=20" : null,
    (u: string) => fetch(u).then(r => r.ok ? r.json() : []),
  );
  useEffect(() => { if (histData) setHistory(histData); }, [histData]);

  // ── Computed values ──
  const winChance  = useMemo(() => calcWinChance(mode, target, minTarget, maxTarget), [mode, target, minTarget, maxTarget]);
  const multiplier = useMemo(() => calcMultiplier(winChance), [winChance]);
  const payout     = useMemo(() => betAmount * multiplier, [betAmount, multiplier]);

  // ── Audio ──
  const playSound = useCallback((type: "win" | "loss" | "roll") => {
    if (!sound) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === "win")  { osc.frequency.value = 880; gain.gain.setValueAtTime(0.3, 0); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4); }
      if (type === "loss") { osc.frequency.value = 220; gain.gain.setValueAtTime(0.2, 0); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3); }
      if (type === "roll") { osc.frequency.value = 440; gain.gain.setValueAtTime(0.1, 0); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1); }
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch { /* ignore */ }
  }, [sound]);

  // ── Socket setup ──
  useEffect(() => {
    const s = socket.current;
    if (!s) return;

    s.on("wallet:balance", (data: { available: number }) => setBalance(data.available));
    s.on("dice:betResponse", (data: { ok: boolean; result: BetResult }) => {
      if (!data.ok) return;
      const r = data.result;
      setLastResult(r);
      setIsRolling(false);
      setNonce(n => n + 1);
      setHistory(h => [r, ...h].slice(0, 50));
      setSessionStats(prev => ({
        bets: prev.bets + 1,
        wins: prev.wins + (r.won ? 1 : 0),
        wagered: prev.wagered + r.betAmount,
        profit: prev.profit + r.profit,
      }));
      playSound(r.won ? "win" : "loss");
    });
    s.on("dice:error", (data: { message: string }) => {
      setIsRolling(false);
      setAutoRunning(false);
      autoRef.current = false;
    });
    s.on("dice:live", (data: LiveBet) => {
      setLiveFeed(f => [data, ...f].slice(0, 20));
    });

    return () => {
      s.off("wallet:balance");
      s.off("dice:betResponse");
      s.off("dice:error");
      s.off("dice:live");
    };
  }, [playSound]);

  // ── Fetch initial server seed hash ──
  useEffect(() => {
    fetch("/api/casino/dice/seeds/new")
      .then(r => r.json())
      .then(d => d.serverSeedHash && setServerSeedHash(d.serverSeedHash))
      .catch(() => {});
  }, []);

  // ── Place single bet ──
  const placeBet = useCallback((amount = betAmount) => {
    if (!user) return;
    const s = socket.current;
    if (!s) return;
    setIsRolling(true);
    playSound("roll");
    s.emit("dice:bet", {
      betAmount: amount,
      mode,
      target,
      minTarget,
      maxTarget,
      clientSeed,
      nonce,
    });
  }, [user, betAmount, mode, target, minTarget, maxTarget, clientSeed, nonce, playSound]);

  // ── Auto bet engine ──
  const runAutoStep = useCallback(async (currentBet: number, roundsLeft: number) => {
    if (!autoRef.current) return;
    placeBet(currentBet);

    // Wait for result
    await new Promise<void>(resolve => {
      const s = socket.current;
      const handler = (data: { ok: boolean; result: BetResult }) => {
        if (!data.ok) { resolve(); return; }
        const r = data.result;
        sessionProfitRef.current += r.profit;

        // Stop conditions
        if (autoStopOnWin > 0 && sessionProfitRef.current >= autoStopOnWin) {
          autoRef.current = false;
        }
        if (autoStopOnLoss > 0 && sessionProfitRef.current <= -autoStopOnLoss) {
          autoRef.current = false;
        }

        // Next bet amount
        let nextBet = currentBet;
        if (r.won) {
          if (autoOnWinAction === "reset")    nextBet = baseBetRef.current;
          if (autoOnWinAction === "increase") nextBet = currentBet * (1 + autoOnWinPct / 100);
        } else {
          if (autoOnLossAction === "reset")    nextBet = baseBetRef.current;
          if (autoOnLossAction === "increase") nextBet = currentBet * (1 + autoOnLossPct / 100);
        }
        nextBet = Math.max(10, Math.round(nextBet * 100) / 100);

        const nextRounds = autoInfinite ? Infinity : roundsLeft - 1;
        if (autoRef.current && nextRounds > 0) {
          setTimeout(() => runAutoStep(nextBet, nextRounds), 600);
        } else {
          autoRef.current = false;
          setAutoRunning(false);
        }
        s?.off("dice:betResponse", handler);
        resolve();
      };
      s?.once("dice:betResponse", handler);
    });
  }, [autoInfinite, autoOnLossAction, autoOnLossPct, autoOnWinAction, autoOnWinPct, autoStopOnLoss, autoStopOnWin, placeBet]);

  const startAuto = useCallback(() => {
    if (!user || autoRunning) return;
    autoRef.current = true;
    setAutoRunning(true);
    baseBetRef.current = betAmount;
    sessionProfitRef.current = 0;
    autoRoundsLeftRef.current = autoRounds;
    runAutoStep(betAmount, autoInfinite ? Infinity : autoRounds);
  }, [user, autoRunning, betAmount, autoRounds, autoInfinite, runAutoStep]);

  const stopAuto = useCallback(() => {
    autoRef.current = false;
    setAutoRunning(false);
  }, []);

  // ── Rotate seeds ──
  const rotateSeeds = useCallback(() => {
    setClientSeed(randomClientSeed());
    setNonce(1);
    fetch("/api/casino/dice/seeds/new")
      .then(r => r.json())
      .then(d => d.serverSeedHash && setServerSeedHash(d.serverSeedHash))
      .catch(() => {});
  }, []);

  // ── Bet amount shortcuts ──
  const adjustBet = (action: "half" | "double" | "min" | "max") => {
    setBetAmount(prev => {
      if (action === "half")   return Math.max(10, Math.round(prev / 2));
      if (action === "double") return Math.round(prev * 2);
      if (action === "min")    return 10;
      if (action === "max")    return 1_000_000;
      return prev;
    });
  };

  // ── Mode labels ──
  const modeConfig: Record<DiceMode, { label: string; color: string; desc: string }> = {
    ROLL_UNDER:   { label: "Roll Under",   color: "#22c55e", desc: `Win if roll < ${target.toFixed(2)}` },
    ROLL_OVER:    { label: "Roll Over",    color: "#3b82f6", desc: `Win if roll > ${target.toFixed(2)}` },
    ROLL_BETWEEN: { label: "Roll Between", color: "#a855f7", desc: `Win if ${minTarget.toFixed(2)} ≤ roll ≤ ${maxTarget.toFixed(2)}` },
    ROLL_OUTSIDE: { label: "Roll Outside", color: "#f59e0b", desc: `Win if roll < ${minTarget.toFixed(2)} or > ${maxTarget.toFixed(2)}` },
  };

  const isLoggedIn = !!user;

  return (
    <>
      {/* Back button (mobile) */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 sticky top-0 z-10"
        style={{ background: "#0d0b1f", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <Link href="/" className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm font-semibold transition">
          <ArrowLeft size={16} /> Back
        </Link>
        <button onClick={() => setShowPF(true)} className="flex items-center gap-1.5 text-purple-400 hover:text-purple-300 text-xs font-semibold transition">
          <Shield size={14} /> Provably Fair
        </button>
      </div>

      <div className="min-h-screen text-white pb-12" style={{ background: "linear-gradient(180deg, #0d0b1f 0%, #0a0918 100%)" }}>
        <div className="max-w-7xl mx-auto px-3 md:px-6 py-4 md:py-8">

          {/* ── Header ── */}
          <div className="flex items-center justify-between mb-6 md:mb-8">
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
                🎲 Dice
              </h1>
              <p className="text-white/40 text-sm mt-0.5">Provably fair · 1% house edge · Instant results</p>
            </div>
            <div className="hidden md:flex items-center gap-3">
              <button onClick={() => setSound(s => !s)}
                className="w-9 h-9 rounded-lg flex items-center justify-center transition"
                style={{ background: "rgba(255,255,255,0.05)" }}>
                {sound ? <Volume2 size={16} className="text-white/60" /> : <VolumeX size={16} className="text-white/40" />}
              </button>
              <button onClick={() => setShowPF(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition hover:brightness-110"
                style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: "#a78bfa" }}>
                <Shield size={15} /> Provably Fair
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">

            {/* ═══ LEFT: Game Area ═══════════════════════════════════════════ */}
            <div className="space-y-5">

              {/* ── Mode Tabs ── */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {(Object.keys(modeConfig) as DiceMode[]).map(m => (
                  <button key={m} onClick={() => setMode(m)} disabled={isRolling || autoRunning}
                    className="py-2.5 px-3 rounded-xl text-[13px] font-bold transition-all"
                    style={{
                      background: mode === m ? modeConfig[m].color + "22" : "rgba(255,255,255,0.04)",
                      border: mode === m ? `1.5px solid ${modeConfig[m].color}55` : "1.5px solid transparent",
                      color: mode === m ? modeConfig[m].color : "rgba(255,255,255,0.5)",
                    }}>
                    {modeConfig[m].label}
                  </button>
                ))}
              </div>

              {/* ── Result Display ── */}
              <AnimatePresence mode="wait">
                <motion.div key={lastResult?.id ?? "idle"}
                  initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-2xl p-6 md:p-8 flex flex-col items-center justify-center relative overflow-hidden"
                  style={{
                    background: lastResult
                      ? lastResult.won
                        ? "linear-gradient(135deg, #052e16 0%, #0a1628 100%)"
                        : "linear-gradient(135deg, #1c0505 0%, #0a0618 100%)"
                      : "linear-gradient(135deg, #13112a 0%, #0d0b1f 100%)",
                    border: lastResult
                      ? lastResult.won ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(239,68,68,0.3)"
                      : "1px solid rgba(139,92,246,0.2)",
                    minHeight: 200,
                  }}>

                  {/* Glow bg */}
                  {lastResult && (
                    <div className="absolute inset-0 pointer-events-none" style={{
                      background: lastResult.won
                        ? "radial-gradient(ellipse at 50% 0%, rgba(34,197,94,0.15) 0%, transparent 70%)"
                        : "radial-gradient(ellipse at 50% 0%, rgba(239,68,68,0.1) 0%, transparent 70%)",
                    }} />
                  )}

                  {/* Dice animation */}
                  <motion.div
                    animate={isRolling ? { rotateY: [0, 180, 360], rotateX: [0, 90, 180, 270, 360] } : {}}
                    transition={isRolling ? { duration: 0.5, repeat: Infinity, ease: "linear" } : {}}
                    className="mb-4 relative z-10"
                  >
                    <DiceFace value={lastResult ? Math.ceil((lastResult.roll / 100) * 6) : null} size={72} />
                  </motion.div>

                  {/* Roll number */}
                  <div className="text-center relative z-10">
                    {isRolling ? (
                      <div className="text-5xl font-black text-white/20 tabular-nums">—</div>
                    ) : lastResult ? (
                      <>
                        <motion.div
                          key={lastResult.roll}
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="text-5xl md:text-6xl font-black tabular-nums"
                          style={{ color: lastResult.won ? "#4ade80" : "#f87171" }}
                        >
                          {lastResult.roll.toFixed(2)}
                        </motion.div>
                        <div className="mt-2 text-sm font-semibold" style={{ color: lastResult.won ? "#4ade80" : "#f87171" }}>
                          {lastResult.won
                            ? `🎉 WIN  +₹${fmtNum(lastResult.profit)} (${lastResult.multiplier.toFixed(4)}×)`
                            : `❌ LOSS  -₹${fmtNum(lastResult.betAmount)}`}
                        </div>
                        <div className="mt-1 text-xs text-white/30">{modeConfig[lastResult.mode].desc}</div>
                      </>
                    ) : (
                      <div className="text-white/20 text-lg font-semibold">Place a bet to roll</div>
                    )}
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* ── Slider ── */}
              <div className="rounded-2xl p-4 md:p-6"
                style={{ background: "#13112a", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] uppercase tracking-wider text-white/40">Target</span>
                  <span className="text-xs font-mono text-purple-300">{modeConfig[mode].desc}</span>
                </div>

                <DiceSlider
                  mode={mode} target={target} minTarget={minTarget} maxTarget={maxTarget}
                  onTargetChange={setTarget} onMinChange={setMinTarget} onMaxChange={setMaxTarget}
                  disabled={isRolling || autoRunning}
                />

                {/* Target inputs */}
                <div className="grid grid-cols-3 gap-3 mt-2">
                  {(mode === "ROLL_UNDER" || mode === "ROLL_OVER") ? (
                    <>
                      <div>
                        <label className="text-[10px] text-white/30 block mb-1">WIN CHANCE</label>
                        <input type="number" value={winChance.toFixed(2)}
                          onChange={e => {
                            const v = parseFloat(e.target.value);
                            if (isNaN(v)) return;
                            if (mode === "ROLL_UNDER") setTarget(Math.max(2, Math.min(98, v)));
                            if (mode === "ROLL_OVER")  setTarget(Math.max(2, Math.min(98, 100 - v)));
                          }}
                          disabled={isRolling || autoRunning}
                          className="w-full px-2 py-1.5 rounded-lg text-sm font-mono text-white outline-none"
                          style={{ background: "#1e1b3a", border: "1px solid rgba(255,255,255,0.08)" }} />
                      </div>
                      <div>
                        <label className="text-[10px] text-white/30 block mb-1">TARGET</label>
                        <input type="number" value={target.toFixed(2)}
                          onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setTarget(Math.max(2, Math.min(98, v))); }}
                          step="0.01" disabled={isRolling || autoRunning}
                          className="w-full px-2 py-1.5 rounded-lg text-sm font-mono text-white outline-none"
                          style={{ background: "#1e1b3a", border: "1px solid rgba(255,255,255,0.08)" }} />
                      </div>
                      <div>
                        <label className="text-[10px] text-white/30 block mb-1">MULTIPLIER</label>
                        <input type="number" value={multiplier.toFixed(4)}
                          onChange={e => {
                            const m = parseFloat(e.target.value);
                            if (isNaN(m) || m <= 1) return;
                            const wc = Math.max(0.01, Math.min(98.99, 99 / m));
                            if (mode === "ROLL_UNDER") setTarget(wc);
                            if (mode === "ROLL_OVER")  setTarget(100 - wc);
                          }}
                          step="0.0001" disabled={isRolling || autoRunning}
                          className="w-full px-2 py-1.5 rounded-lg text-sm font-mono text-white outline-none"
                          style={{ background: "#1e1b3a", border: "1px solid rgba(255,255,255,0.08)" }} />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="text-[10px] text-white/30 block mb-1">MIN</label>
                        <input type="number" value={minTarget.toFixed(2)}
                          onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setMinTarget(Math.max(1, Math.min(maxTarget - 1, v))); }}
                          step="0.01" disabled={isRolling || autoRunning}
                          className="w-full px-2 py-1.5 rounded-lg text-sm font-mono text-white outline-none"
                          style={{ background: "#1e1b3a", border: "1px solid rgba(255,255,255,0.08)" }} />
                      </div>
                      <div>
                        <label className="text-[10px] text-white/30 block mb-1">WIN CHANCE</label>
                        <input type="number" value={winChance.toFixed(2)} readOnly
                          className="w-full px-2 py-1.5 rounded-lg text-sm font-mono text-purple-300 outline-none cursor-default"
                          style={{ background: "#1e1b3a", border: "1px solid rgba(255,255,255,0.08)" }} />
                      </div>
                      <div>
                        <label className="text-[10px] text-white/30 block mb-1">MAX</label>
                        <input type="number" value={maxTarget.toFixed(2)}
                          onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setMaxTarget(Math.max(minTarget + 1, Math.min(99, v))); }}
                          step="0.01" disabled={isRolling || autoRunning}
                          className="w-full px-2 py-1.5 rounded-lg text-sm font-mono text-white outline-none"
                          style={{ background: "#1e1b3a", border: "1px solid rgba(255,255,255,0.08)" }} />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ── Session Stats ── */}
              {sessionStats.bets > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "Bets", value: sessionStats.bets.toString() },
                    { label: "Wins", value: sessionStats.wins.toString(), color: "#4ade80" },
                    { label: "Wagered", value: "₹" + fmtNum(sessionStats.wagered) },
                    { label: "Profit", value: (sessionStats.profit >= 0 ? "+" : "") + "₹" + fmtNum(sessionStats.profit), color: sessionStats.profit >= 0 ? "#4ade80" : "#f87171" },
                  ].map(s => (
                    <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: "#13112a", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <div className="text-[10px] uppercase tracking-wider text-white/30 mb-1">{s.label}</div>
                      <div className="font-bold text-sm" style={{ color: s.color ?? "white" }}>{s.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Bet History ── */}
              <div className="rounded-2xl overflow-hidden" style={{ background: "#13112a", border: "1px solid rgba(255,255,255,0.06)" }}>
                <button onClick={() => setShowHistory(h => !h)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-white/70 hover:text-white transition">
                  <span>Bet History ({history.length})</span>
                  {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                <AnimatePresence>
                  {showHistory && (
                    <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                      <div className="overflow-x-auto max-h-72 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-white/30 uppercase tracking-wider" style={{ background: "#0d0b1f" }}>
                              <th className="px-3 py-2 text-left">Roll</th>
                              <th className="px-3 py-2 text-left">Mode</th>
                              <th className="px-3 py-2 text-right">Bet</th>
                              <th className="px-3 py-2 text-right">Mult</th>
                              <th className="px-3 py-2 text-right">Profit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {history.map((h, i) => (
                              <tr key={h.id} className="border-t transition" style={{ borderColor: "rgba(255,255,255,0.04)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                                <td className="px-3 py-2 font-mono font-bold" style={{ color: h.won ? "#4ade80" : "#f87171" }}>
                                  {h.roll.toFixed(2)}
                                </td>
                                <td className="px-3 py-2 text-white/50">{h.mode.replace("ROLL_", "").toLowerCase()}</td>
                                <td className="px-3 py-2 text-right text-white/60">₹{fmtNum(h.betAmount)}</td>
                                <td className="px-3 py-2 text-right text-white/50">{h.multiplier.toFixed(4)}×</td>
                                <td className="px-3 py-2 text-right font-semibold" style={{ color: h.profit >= 0 ? "#4ade80" : "#f87171" }}>
                                  {h.profit >= 0 ? "+" : ""}₹{fmtNum(h.profit)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {history.length === 0 && (
                          <div className="py-8 text-center text-white/20 text-sm">No bets yet</div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

            </div>

            {/* ═══ RIGHT: Betting Panel ═══════════════════════════════════════ */}
            <div className="space-y-4">

              {/* ── Stats Cards ── */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Win Chance", value: winChance.toFixed(2) + "%", color: "#22c55e" },
                  { label: "Multiplier", value: multiplier.toFixed(4) + "×", color: "#a855f7" },
                  { label: "Payout", value: "₹" + fmtNum(payout), color: "#f59e0b" },
                ].map(s => (
                  <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: "#13112a", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="text-[9px] uppercase tracking-wider text-white/30 mb-1">{s.label}</div>
                    <div className="font-black text-sm tabular-nums" style={{ color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* ── Bet Panel ── */}
              <div className="rounded-2xl overflow-hidden" style={{ background: "#13112a", border: "1px solid rgba(255,255,255,0.06)" }}>
                {/* Tabs */}
                <div className="flex" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {(["manual", "auto"] as const).map(tab => (
                    <button key={tab} onClick={() => setBetTab(tab)}
                      className="flex-1 py-3 text-sm font-bold transition capitalize"
                      style={{
                        color: betTab === tab ? "#a78bfa" : "rgba(255,255,255,0.4)",
                        borderBottom: betTab === tab ? "2px solid #7c3aed" : "2px solid transparent",
                      }}>
                      {tab}
                    </button>
                  ))}
                </div>

                <div className="p-4 space-y-4">
                  {/* Bet amount */}
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1.5 block">Bet Amount (₹)</label>
                    <input
                      type="number"
                      value={betAmount}
                      onChange={e => setBetAmount(Math.max(10, parseFloat(e.target.value) || 10))}
                      disabled={isRolling || autoRunning}
                      className="w-full px-3 py-2.5 rounded-xl text-sm font-mono text-white outline-none"
                      style={{ background: "#1e1b3a", border: "1px solid rgba(255,255,255,0.1)" }}
                    />
                    <div className="grid grid-cols-4 gap-1.5 mt-2">
                      {["½", "2×", "Min", "Max"].map((label, i) => (
                        <button key={label}
                          onClick={() => adjustBet(["half", "double", "min", "max"][i] as any)}
                          disabled={isRolling || autoRunning}
                          className="py-1.5 rounded-lg text-[11px] font-bold text-white/50 hover:text-white transition"
                          style={{ background: "rgba(255,255,255,0.05)" }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {betTab === "manual" ? (
                    // ── Manual Bet Button ──
                    <motion.button
                      onClick={() => placeBet()}
                      disabled={!isLoggedIn || isRolling || autoRunning}
                      whileTap={{ scale: 0.97 }}
                      className="w-full py-4 rounded-xl font-black text-base tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
                      style={{
                        background: isRolling
                          ? "rgba(139,92,246,0.3)"
                          : "linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #c026d3 100%)",
                        boxShadow: isRolling ? "none" : "0 8px 24px rgba(139,92,246,0.4)",
                        color: "white",
                      }}
                    >
                      {!isLoggedIn ? "Login to Play" : isRolling ? (
                        <span className="flex items-center justify-center gap-2">
                          <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.6, repeat: Infinity, ease: "linear" }}
                            className="inline-block">🎲</motion.span>
                          Rolling...
                        </span>
                      ) : "Roll Dice"}
                    </motion.button>
                  ) : (
                    // ── Auto Bet Config ──
                    <div className="space-y-3">
                      {/* Rounds */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Rounds</label>
                          <input type="number" value={autoRounds} min={1} max={10000}
                            onChange={e => setAutoRounds(Math.max(1, parseInt(e.target.value) || 1))}
                            disabled={autoInfinite || autoRunning}
                            className="w-full px-3 py-2 rounded-lg text-sm font-mono text-white outline-none"
                            style={{ background: "#1e1b3a", border: "1px solid rgba(255,255,255,0.08)" }} />
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <label className="text-[10px] uppercase tracking-wider text-white/40">∞</label>
                          <button onClick={() => setAutoInfinite(a => !a)} disabled={autoRunning}
                            className="w-10 h-5 rounded-full transition-colors relative"
                            style={{ background: autoInfinite ? "#7c3aed" : "rgba(255,255,255,0.1)" }}>
                            <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow"
                              style={{ left: autoInfinite ? "calc(100% - 18px)" : "2px" }} />
                          </button>
                        </div>
                      </div>

                      {/* On Win */}
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">On Win</label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(["none", "reset", "increase"] as const).map(a => (
                            <button key={a} onClick={() => setAutoOnWinAction(a)} disabled={autoRunning}
                              className="py-1.5 rounded-lg text-[11px] font-bold capitalize transition"
                              style={{
                                background: autoOnWinAction === a ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.05)",
                                color: autoOnWinAction === a ? "#4ade80" : "rgba(255,255,255,0.4)",
                                border: autoOnWinAction === a ? "1px solid rgba(34,197,94,0.3)" : "1px solid transparent",
                              }}>
                              {a}
                            </button>
                          ))}
                        </div>
                        {autoOnWinAction === "increase" && (
                          <div className="flex items-center gap-2 mt-2">
                            <input type="number" value={autoOnWinPct} min={0} max={500} onChange={e => setAutoOnWinPct(parseFloat(e.target.value) || 0)}
                              className="w-20 px-2 py-1.5 rounded-lg text-xs font-mono text-white outline-none"
                              style={{ background: "#1e1b3a", border: "1px solid rgba(255,255,255,0.08)" }} />
                            <span className="text-xs text-white/40">% increase per win</span>
                          </div>
                        )}
                      </div>

                      {/* On Loss */}
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">On Loss</label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(["none", "reset", "increase"] as const).map(a => (
                            <button key={a} onClick={() => setAutoOnLossAction(a)} disabled={autoRunning}
                              className="py-1.5 rounded-lg text-[11px] font-bold capitalize transition"
                              style={{
                                background: autoOnLossAction === a ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.05)",
                                color: autoOnLossAction === a ? "#f87171" : "rgba(255,255,255,0.4)",
                                border: autoOnLossAction === a ? "1px solid rgba(239,68,68,0.3)" : "1px solid transparent",
                              }}>
                              {a}
                            </button>
                          ))}
                        </div>
                        {autoOnLossAction === "increase" && (
                          <div className="flex items-center gap-2 mt-2">
                            <input type="number" value={autoOnLossPct} min={0} max={500} onChange={e => setAutoOnLossPct(parseFloat(e.target.value) || 0)}
                              className="w-20 px-2 py-1.5 rounded-lg text-xs font-mono text-white outline-none"
                              style={{ background: "#1e1b3a", border: "1px solid rgba(255,255,255,0.08)" }} />
                            <span className="text-xs text-white/40">% increase per loss</span>
                          </div>
                        )}
                      </div>

                      {/* Stop conditions */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] text-white/40 block mb-1">Stop on profit ₹</label>
                          <input type="number" value={autoStopOnWin} min={0}
                            onChange={e => setAutoStopOnWin(parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1.5 rounded-lg text-xs font-mono text-white outline-none"
                            style={{ background: "#1e1b3a", border: "1px solid rgba(255,255,255,0.08)" }} />
                        </div>
                        <div>
                          <label className="text-[10px] text-white/40 block mb-1">Stop on loss ₹</label>
                          <input type="number" value={autoStopOnLoss} min={0}
                            onChange={e => setAutoStopOnLoss(parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1.5 rounded-lg text-xs font-mono text-white outline-none"
                            style={{ background: "#1e1b3a", border: "1px solid rgba(255,255,255,0.08)" }} />
                        </div>
                      </div>

                      {/* Start/Stop button */}
                      <motion.button
                        onClick={autoRunning ? stopAuto : startAuto}
                        disabled={!isLoggedIn}
                        whileTap={{ scale: 0.97 }}
                        className="w-full py-4 rounded-xl font-black text-base transition-all disabled:opacity-50"
                        style={{
                          background: autoRunning
                            ? "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)"
                            : "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
                          boxShadow: autoRunning
                            ? "0 8px 24px rgba(239,68,68,0.3)"
                            : "0 8px 24px rgba(139,92,246,0.4)",
                          color: "white",
                        }}
                      >
                        {!isLoggedIn ? "Login to Play" : autoRunning ? "⏹ Stop Auto" : "▶ Start Auto"}
                      </motion.button>

                      {autoRunning && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          className="text-center text-xs text-purple-400">
                          <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
                            Auto betting in progress...
                          </motion.span>
                        </motion.div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Balance ── */}
              {balance != null && (
                <div className="rounded-xl px-4 py-3 flex items-center justify-between"
                  style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}>
                  <span className="text-xs text-white/40">Balance</span>
                  <span className="font-black text-white tabular-nums">₹{fmtNum(balance)}</span>
                </div>
              )}

              {/* ── Live Feed ── */}
              <div className="rounded-2xl overflow-hidden" style={{ background: "#13112a", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="px-4 py-3 text-xs font-bold text-white/50 uppercase tracking-wider" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  🔴 Live Bets
                </div>
                <div className="divide-y divide-white/5">
                  <AnimatePresence>
                    {liveFeed.slice(0, 8).map((b, i) => (
                      <motion.div key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                        className="flex items-center justify-between px-4 py-2.5 text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: b.won ? "#4ade80" : "#f87171" }} />
                          <span className="text-white/60 truncate max-w-[80px]">{b.username}</span>
                        </div>
                        <span className="font-mono text-white/40">{b.roll.toFixed(2)}</span>
                        <span className="font-bold tabular-nums" style={{ color: b.won ? "#4ade80" : "#f87171" }}>
                          {b.won ? "+" : "-"}₹{fmtNum(b.won ? b.payout - b.betAmount : b.betAmount)}
                        </span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {liveFeed.length === 0 && (
                    <div className="py-6 text-center text-white/20 text-xs">Waiting for bets...</div>
                  )}
                </div>
              </div>

              {/* ── Game Info ── */}
              <div className="rounded-xl p-4 space-y-2 text-xs" style={{ background: "#13112a", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-2 text-white/50 mb-2">
                  <Info size={12} />
                  <span className="font-semibold uppercase tracking-wider">Game Info</span>
                </div>
                {[
                  ["House Edge", "1%"],
                  ["Min Bet", "₹10"],
                  ["Max Win", "₹1,00,00,000"],
                  ["RNG", "HMAC-SHA256"],
                  ["Range", "0.00 – 99.99"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-white/30">{k}</span>
                    <span className="text-white/60 font-mono">{v}</span>
                  </div>
                ))}
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* ── Provably Fair Modal ── */}
      <AnimatePresence>
        {showPF && (
          <ProvablyFairModal
            serverSeedHash={serverSeedHash}
            clientSeed={clientSeed}
            nonce={nonce}
            lastResult={lastResult}
            onClientSeedChange={setClientSeed}
            onRotateSeeds={rotateSeeds}
            onClose={() => setShowPF(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
