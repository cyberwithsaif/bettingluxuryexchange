"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Zap, TrendingUp, Users, Clock, Shield } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth";
import { getSocket } from "@/lib/socket";

// ── Types ────────────────────────────────────────────────────────────────────

type RoundPhase = "idle" | "betting" | "flying" | "crashed" | "settled";

interface LiveBet {
  betId: string;
  username: string;
  betAmount: number;
  cashOutAt?: number;
  payout?: number;
  roundId?: string;
}

interface HistoryEntry {
  roundNumber: number;
  crashPoint: number;
}

interface BetState {
  betId: string;
  roundId: string;
  betAmount: number;
  autoCashAt: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function multiplierColor(m: number): string {
  if (m >= 10)  return "#FFD700";
  if (m >= 5)   return "#A855F7";
  if (m >= 2)   return "#3B82F6";
  return "#00FFB2";
}

function multiplierAtMs(elapsedMs: number): number {
  return Math.round(Math.exp(0.045 * (elapsedMs / 1000)) * 100) / 100;
}

function fmtMult(m: number): string {
  return m.toFixed(2) + "×";
}

function fmtMoney(n: number): string {
  return "₹" + new Intl.NumberFormat("en-IN").format(Math.round(n));
}

// ── Balloon SVG ───────────────────────────────────────────────────────────────

function BalloonSVG({ scale, color, shake }: { scale: number; color: string; shake: boolean }) {
  return (
    <motion.div
      animate={shake ? { x: [-4, 4, -6, 6, -2, 2, 0], rotate: [-1, 1, -2, 2, -1, 1, 0] } : { x: 0, rotate: 0 }}
      transition={shake ? { duration: 0.5, repeat: Infinity } : {}}
      style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <motion.svg
        width="160"
        height="200"
        viewBox="0 0 160 200"
        animate={{ scale }}
        transition={{ type: "spring", stiffness: 60, damping: 15 }}
        style={{ filter: `drop-shadow(0 0 24px ${color}88) drop-shadow(0 0 48px ${color}44)` }}
      >
        {/* Balloon body */}
        <ellipse cx="80" cy="85" rx="62" ry="75" fill={color} opacity="0.92" />

        {/* Highlight */}
        <ellipse cx="55" cy="52" rx="18" ry="22" fill="white" opacity="0.25" />
        <ellipse cx="50" cy="44" rx="9" ry="11" fill="white" opacity="0.35" />

        {/* Bottom knot */}
        <path d="M76 158 Q80 168 84 158" stroke={color} strokeWidth="3" fill="none" />
        <circle cx="80" cy="162" r="4" fill={color} />

        {/* String */}
        <path d="M80 166 Q75 178 80 192" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" fill="none" strokeDasharray="3 3" />

        {/* Pressure dots at high multiplier */}
        {scale > 1.8 && (
          <>
            <circle cx="30" cy="90" r="3" fill="white" opacity="0.4" />
            <circle cx="130" cy="75" r="3" fill="white" opacity="0.4" />
            <circle cx="60" cy="150" r="3" fill="white" opacity="0.4" />
          </>
        )}
      </motion.svg>
    </motion.div>
  );
}

// ── Explosion particles ────────────────────────────────────────────────────────

const PARTICLE_COUNT = 16;
function Explosion({ color }: { color: string }) {
  const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle  = (i / PARTICLE_COUNT) * 360;
    const dist   = 80 + Math.random() * 60;
    const rad    = (angle * Math.PI) / 180;
    return { x: Math.cos(rad) * dist, y: Math.sin(rad) * dist, size: 4 + Math.random() * 8 };
  });
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {particles.map((p, i) => (
        <motion.div
          key={i}
          initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
          animate={{ x: p.x, y: p.y, scale: 0, opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: i * 0.02 }}
          style={{
            position: "absolute",
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: color,
            boxShadow: `0 0 8px ${color}`,
          }}
        />
      ))}
    </div>
  );
}

// ── Floating particles background ─────────────────────────────────────────────

function FloatingParticles() {
  const particles = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    x:  Math.random() * 100,
    y:  Math.random() * 100,
    size: 1 + Math.random() * 2,
    dur: 4 + Math.random() * 6,
  }));
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size, background: "#2F80FF33" }}
          animate={{ y: [-10, 10, -10], opacity: [0.2, 0.6, 0.2] }}
          transition={{ duration: p.dur, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function PumpGame() {
  const { user } = useAuthStore();
  const socketRef = useRef(getSocket());

  // Game state
  const [phase,          setPhase]          = useState<RoundPhase>("idle");
  const [currentRoundId, setCurrentRoundId] = useState<string | null>(null);
  const [multiplier,     setMultiplier]     = useState(1.00);
  const [crashPoint,     setCrashPoint]     = useState<number | null>(null);
  const [flyingStart,    setFlyingStart]    = useState<number | null>(null);
  const [bettingEndsAt,  setBettingEndsAt]  = useState<number | null>(null);
  const [countdown,      setCountdown]      = useState(0);
  const [history,        setHistory]        = useState<HistoryEntry[]>([]);
  const [liveBets,       setLiveBets]       = useState<LiveBet[]>([]);
  const [showExplosion,  setShowExplosion]  = useState(false);
  const [serverSeedHash, setServerSeedHash] = useState<string>("");

  // Player state
  const [activeBet,   setActiveBet]   = useState<BetState | null>(null);
  const [betAmount,   setBetAmount]   = useState("100");
  const [autoCashAt,  setAutoCashAt]  = useState("");
  const [isPlacing,   setIsPlacing]   = useState(false);
  const [isCashing,   setIsCashing]   = useState(false);
  const [notification, setNotification] = useState<{ text: string; ok: boolean } | null>(null);
  const [winFlash,    setWinFlash]    = useState(false);

  // Auto mode
  const [autoMode,   setAutoMode]   = useState(false);
  const [autoAmount, setAutoAmount] = useState("100");
  const [autoCash,   setAutoCash]   = useState("2.00");

  const rafRef = useRef<number | null>(null);

  // Derived
  const balloonScale  = Math.min(1 + (multiplier - 1) * 0.4, 3.0);
  const shake         = phase === "flying" && multiplier > 5;
  const currentColor  = phase === "crashed" && crashPoint
    ? multiplierColor(crashPoint)
    : multiplierColor(multiplier);

  // ── Notification helper ────────────────────────────────────────

  const notify = useCallback((text: string, ok = true) => {
    setNotification({ text, ok });
    setTimeout(() => setNotification(null), 3500);
  }, []);

  // ── Multiplier animation loop ──────────────────────────────────

  const startMultiplierLoop = useCallback((startedAt: number) => {
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      setMultiplier(multiplierAtMs(elapsed));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopMultiplierLoop = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  // ── Countdown timer ────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "betting" || !bettingEndsAt) return;
    const id = setInterval(() => {
      const rem = Math.max(0, Math.ceil((bettingEndsAt - Date.now()) / 1000));
      setCountdown(rem);
    }, 200);
    return () => clearInterval(id);
  }, [phase, bettingEndsAt]);

  // ── Socket events ──────────────────────────────────────────────

  useEffect(() => {
    const s = socketRef.current;
    if (!s) return;

    s.on("pump:betting", (data: any) => {
      stopMultiplierLoop();
      setPhase("betting");
      setCurrentRoundId(data.roundId);
      setMultiplier(1.00);
      setCrashPoint(null);
      setFlyingStart(null);
      setBettingEndsAt(data.endsAt);
      setServerSeedHash(data.serverSeedHash ?? "");
      setShowExplosion(false);

      // Auto mode: place bet automatically
      if (autoMode && user) {
        setTimeout(() => autoPlaceBet(data.roundId), 300);
      }
    });

    s.on("pump:flying", (data: any) => {
      const startedAt = data.flyingStartedAt;
      setPhase("flying");
      setFlyingStart(startedAt);
      setMultiplier(1.00);
      startMultiplierLoop(startedAt);
    });

    s.on("pump:crash", (data: any) => {
      stopMultiplierLoop();
      setPhase("crashed");
      setCrashPoint(data.crashPoint);
      setMultiplier(data.crashPoint);
      setShowExplosion(true);
      setHistory(prev => [
        { roundNumber: data.roundNumber, crashPoint: data.crashPoint },
        ...prev.slice(0, 29),
      ]);
      // Clear active bet if not cashed out
      setActiveBet(prev => {
        if (prev) notify(`Crashed at ${fmtMult(data.crashPoint)} — balloon popped!`, false);
        return null;
      });
      setTimeout(() => setShowExplosion(false), 1200);
    });

    s.on("pump:settled", () => {
      setPhase("settled");
    });

    s.on("pump:betPlaced", (data: LiveBet) => {
      setLiveBets(prev => [data, ...prev.slice(0, 29)]);
    });

    s.on("pump:cashedOut", (data: any) => {
      setLiveBets(prev =>
        prev.map(b => b.betId === data.betId ? { ...b, cashOutAt: data.multiplier } : b)
      );
      // If it's our bet
      if (activeBet && data.betId === activeBet.betId) {
        const payout = activeBet.betAmount * data.multiplier;
        notify(`Cashed out at ${fmtMult(data.multiplier)} — won ${fmtMoney(payout)}! 🎉`);
        setWinFlash(true);
        setTimeout(() => setWinFlash(false), 1500);
        setActiveBet(null);
      }
    });

    return () => {
      s.off("pump:betting");
      s.off("pump:flying");
      s.off("pump:crash");
      s.off("pump:settled");
      s.off("pump:betPlaced");
      s.off("pump:cashedOut");
    };
  }, [autoMode, user, startMultiplierLoop, stopMultiplierLoop, notify, activeBet]);

  // Join room + sync current round state on mount
  useEffect(() => {
    const s = socketRef.current;
    if (s) {
      s.emit("pump:subscribe");
      // Re-subscribe whenever socket reconnects
      s.on("connect", () => s.emit("pump:subscribe"));
    }

    // Fetch current round so we know the phase immediately
    fetch("/api/casino/pump/current")
      .then(r => r.json())
      .then((round: any) => {
        if (!round) return;
        setCurrentRoundId(round.id);
        setServerSeedHash(round.serverSeedHash ?? "");
        if (round.status === "BETTING") {
          setPhase("betting");
          setBettingEndsAt(round.phaseEndsAt ?? (Date.now() + 5000));
        } else if (round.status === "FLYING" && round.flyingStartedAt) {
          setPhase("flying");
          setFlyingStart(round.flyingStartedAt);
          startMultiplierLoop(round.flyingStartedAt);
        } else if (round.status === "CRASHED" || round.status === "SETTLED") {
          setPhase("crashed");
          if (round.crashPoint) setCrashPoint(round.crashPoint);
        }
      })
      .catch(() => {});

    fetch("/api/casino/pump/history?limit=20")
      .then(r => r.json())
      .then((data: any[]) => {
        if (Array.isArray(data)) {
          setHistory(data.map(r => ({ roundNumber: r.roundNumber, crashPoint: r.crashPoint })));
        }
      })
      .catch(() => {});

    fetch("/api/casino/pump/live-bets?limit=15")
      .then(r => r.json())
      .then((data: any[]) => {
        if (Array.isArray(data)) {
          setLiveBets(data.map(b => ({
            betId:     b.id,
            username:  b.user?.username ?? "---",
            betAmount: b.betAmount,
            cashOutAt: b.cashOutAt,
          })));
        }
      })
      .catch(() => {});

    return () => {
      if (s) s.off("connect");
    };
  }, [startMultiplierLoop]);

  // ── Bet actions ────────────────────────────────────────────────

  const placeBet = useCallback(async () => {
    if (!user) { notify("Please login to play", false); return; }
    if (phase !== "betting" || !currentRoundId) {
      notify("Wait for next betting phase", false);
      return;
    }
    if (activeBet) { notify("You already have a bet this round", false); return; }

    const amount = parseFloat(betAmount);
    if (isNaN(amount) || amount < 10) { notify("Minimum bet is ₹10", false); return; }

    setIsPlacing(true);
    try {
      const res = await fetch("/api/casino/pump/bet", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          betAmount:  amount,
          autoCashAt: autoCashAt ? parseFloat(autoCashAt) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Bet failed");

      setActiveBet({ betId: data.betId, roundId: data.roundId, betAmount: amount, autoCashAt: autoCashAt ? parseFloat(autoCashAt) : null });
      notify("Bet placed! 🎈");
    } catch (e: any) {
      notify(e.message ?? "Bet failed", false);
    } finally {
      setIsPlacing(false);
    }
  }, [user, phase, currentRoundId, activeBet, betAmount, autoCashAt, notify]);

  const cashOut = useCallback(async () => {
    if (!activeBet || phase !== "flying" || isCashing) return;
    setIsCashing(true);
    try {
      const res = await fetch("/api/casino/pump/cashout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ roundId: activeBet.roundId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Cashout failed");
    } catch (e: any) {
      notify(e.message ?? "Cashout failed", false);
    } finally {
      setIsCashing(false);
    }
  }, [activeBet, phase, isCashing, notify]);

  const autoPlaceBet = useCallback(async (roundId: string) => {
    const amount = parseFloat(autoAmount);
    const cash   = parseFloat(autoCash);
    if (isNaN(amount) || amount < 10) return;

    try {
      const res = await fetch("/api/casino/pump/bet", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ betAmount: amount, autoCashAt: !isNaN(cash) && cash > 1.01 ? cash : null }),
      });
      const data = await res.json();
      if (res.ok) {
        setActiveBet({ betId: data.betId, roundId, betAmount: amount, autoCashAt: !isNaN(cash) ? cash : null });
        notify("Auto bet placed 🎈");
      }
    } catch {}
  }, [autoAmount, autoCash, notify]);

  // ── Derived display values ──────────────────────────────────────

  const potentialWin = activeBet
    ? Math.round(activeBet.betAmount * multiplier * 100) / 100
    : null;

  const phaseLabel =
    phase === "betting" ? `Betting — ${countdown}s`
    : phase === "flying"  ? "FLYING"
    : phase === "crashed"  ? "CRASHED"
    : phase === "settled"  ? "Next round starting…"
    : "Connecting…";

  return (
    <div
      className="min-h-screen w-full flex flex-col relative overflow-hidden"
      style={{ background: "linear-gradient(135deg,#071421 0%,#0a1829 50%,#071421 100%)" }}
    >
      <FloatingParticles />

      {/* Win flash overlay */}
      <AnimatePresence>
        {winFlash && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 pointer-events-none z-30"
            style={{ background: "radial-gradient(circle, #00FFB2 0%, transparent 70%)" }}
          />
        )}
      </AnimatePresence>

      {/* ── Top bar ────────────────────────────────────────────── */}
      <div
        className="relative z-20 flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "rgba(47,128,255,0.2)", background: "rgba(7,20,33,0.9)", backdropFilter: "blur(12px)" }}
      >
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold transition-colors"
          style={{ color: "rgba(255,255,255,0.6)" }}
        >
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">Back</span>
        </Link>

        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: phase === "flying" ? "#00FFB2" : phase === "betting" ? "#3B82F6" : "#FF375F" }} />
          <span className="text-xs font-bold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.5)" }}>
            {phaseLabel}
          </span>
          <span
            className="hidden sm:flex items-center gap-1 text-xs px-2 py-1 rounded-full border"
            style={{ color: "#00FFB2", borderColor: "rgba(0,255,178,0.3)", background: "rgba(0,255,178,0.08)" }}
          >
            <Shield size={10} /> Provably Fair
          </span>
        </div>

        <div className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
          {serverSeedHash ? `${serverSeedHash.slice(0, 8)}…` : "—"}
        </div>
      </div>

      {/* ── Notification ────────────────────────────────────────── */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full text-sm font-bold shadow-2xl border"
            style={{
              background: notification.ok ? "rgba(0,255,178,0.12)" : "rgba(255,55,95,0.12)",
              borderColor: notification.ok ? "rgba(0,255,178,0.4)" : "rgba(255,55,95,0.4)",
              color: notification.ok ? "#00FFB2" : "#FF375F",
            }}
          >
            {notification.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main layout ─────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden">

        {/* ── Left Panel: Controls ─────────────────────────────── */}
        <div
          className="w-full lg:w-72 xl:w-80 flex-shrink-0 p-4 flex flex-col gap-3 border-r order-last lg:order-first"
          style={{ borderColor: "rgba(47,128,255,0.15)", background: "rgba(12,24,40,0.8)" }}
        >
          {/* Mode toggle */}
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: "rgba(47,128,255,0.2)" }}>
            <button
              onClick={() => setAutoMode(false)}
              className="flex-1 py-2 text-xs font-bold transition-all"
              style={{
                background: !autoMode ? "linear-gradient(135deg,#2F80FF,#1a60cc)" : "transparent",
                color: !autoMode ? "#fff" : "rgba(255,255,255,0.4)",
              }}
            >
              Manual
            </button>
            <button
              onClick={() => setAutoMode(true)}
              className="flex-1 py-2 text-xs font-bold transition-all"
              style={{
                background: autoMode ? "linear-gradient(135deg,#8A5CFF,#6b3fcc)" : "transparent",
                color: autoMode ? "#fff" : "rgba(255,255,255,0.4)",
              }}
            >
              Auto
            </button>
          </div>

          {!autoMode ? (
            <>
              {/* Bet amount */}
              <div>
                <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Bet Amount (₹)
                </label>
                <input
                  type="number"
                  value={betAmount}
                  onChange={e => setBetAmount(e.target.value)}
                  disabled={phase === "flying" || !!activeBet}
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-bold text-white outline-none transition-all"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(47,128,255,0.25)",
                  }}
                />
                <div className="flex gap-1.5 mt-2">
                  {[50, 100, 500, 1000].map(v => (
                    <button
                      key={v}
                      onClick={() => setBetAmount(String(v))}
                      disabled={phase === "flying" || !!activeBet}
                      className="flex-1 py-1 rounded-lg text-[11px] font-bold transition-all hover:brightness-110 disabled:opacity-40"
                      style={{ background: "rgba(47,128,255,0.15)", color: "#3B82F6", border: "1px solid rgba(47,128,255,0.2)" }}
                    >
                      {v >= 1000 ? `${v / 1000}K` : v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto cash out */}
              <div>
                <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Auto Cash Out (×)
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 2.00"
                  value={autoCashAt}
                  onChange={e => setAutoCashAt(e.target.value)}
                  disabled={phase === "flying" || !!activeBet}
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-bold text-white outline-none"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(138,92,255,0.25)",
                  }}
                />
              </div>

              {/* Place Bet / Cash Out */}
              {phase !== "flying" || !activeBet ? (
                <button
                  onClick={placeBet}
                  disabled={isPlacing || phase !== "betting" || !!activeBet}
                  className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: "linear-gradient(135deg,#2F80FF,#1a60cc)",
                    boxShadow: "0 8px 24px rgba(47,128,255,0.35)",
                    color: "#fff",
                  }}
                >
                  {isPlacing ? "Placing…" : activeBet ? "Bet Active" : phase === "betting" ? "Place Bet" : "Wait…"}
                </button>
              ) : (
                <motion.button
                  onClick={cashOut}
                  disabled={isCashing || !activeBet}
                  animate={{ scale: [1, 1.02, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                  className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40"
                  style={{
                    background: "linear-gradient(135deg,#00FFB2,#00cc8f)",
                    boxShadow: "0 8px 24px rgba(0,255,178,0.4)",
                    color: "#071421",
                  }}
                >
                  {isCashing ? "Cashing…" : `CASH OUT ${fmtMult(multiplier)}`}
                </motion.button>
              )}
            </>
          ) : (
            <>
              {/* Auto mode */}
              <div>
                <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Auto Bet (₹)
                </label>
                <input
                  type="number"
                  value={autoAmount}
                  onChange={e => setAutoAmount(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-bold text-white outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(138,92,255,0.25)" }}
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Auto Cash Out (×)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={autoCash}
                  onChange={e => setAutoCash(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-bold text-white outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(138,92,255,0.25)" }}
                />
              </div>
              <div
                className="flex items-center justify-between px-4 py-3 rounded-xl border"
                style={{ background: "rgba(138,92,255,0.08)", borderColor: "rgba(138,92,255,0.3)" }}
              >
                <div>
                  <p className="text-xs font-bold" style={{ color: "#A855F7" }}>Auto Mode</p>
                  <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                    {autoMode ? "ON — bets each round" : "OFF"}
                  </p>
                </div>
                <div
                  className="w-12 h-6 rounded-full flex items-center cursor-pointer transition-all"
                  style={{ background: autoMode ? "#8A5CFF" : "rgba(255,255,255,0.1)", padding: "2px" }}
                  onClick={() => setAutoMode(v => !v)}
                >
                  <motion.div
                    animate={{ x: autoMode ? 24 : 0 }}
                    transition={{ type: "spring", stiffness: 400 }}
                    className="w-5 h-5 rounded-full bg-white shadow-lg"
                  />
                </div>
              </div>
            </>
          )}

          {/* Potential win */}
          {activeBet && phase === "flying" && potentialWin != null && (
            <div
              className="px-4 py-3 rounded-xl border text-center"
              style={{ background: "rgba(0,255,178,0.06)", borderColor: "rgba(0,255,178,0.2)" }}
            >
              <p className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>Potential Win</p>
              <p className="text-xl font-black" style={{ color: "#00FFB2" }}>{fmtMoney(potentialWin)}</p>
            </div>
          )}

          {/* History */}
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>
              Recent Rounds
            </p>
            <div className="flex flex-wrap gap-1.5">
              {history.slice(0, 15).map((h, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-full text-[11px] font-bold"
                  style={{
                    background: multiplierColor(h.crashPoint) + "20",
                    color: multiplierColor(h.crashPoint),
                    border: `1px solid ${multiplierColor(h.crashPoint)}40`,
                  }}
                >
                  {fmtMult(h.crashPoint)}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Center: Balloon ──────────────────────────────────── */}
        <div className="flex-1 flex flex-col items-center justify-center relative min-h-[380px] sm:min-h-[460px]">

          {/* Neon grid lines */}
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: "linear-gradient(rgba(47,128,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(47,128,255,0.04) 1px,transparent 1px)",
            backgroundSize: "48px 48px",
          }} />

          {/* Multiplier display */}
          <div className="absolute top-8 left-1/2 -translate-x-1/2 text-center z-20">
            <motion.div
              key={phase}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="font-black tabular-nums"
              style={{
                fontSize: "clamp(48px, 10vw, 88px)",
                lineHeight: 1,
                color: currentColor,
                textShadow: `0 0 30px ${currentColor}, 0 0 60px ${currentColor}66`,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {phase === "betting" ? "1.00×"
               : phase === "crashed" && crashPoint ? fmtMult(crashPoint)
               : fmtMult(multiplier)}
            </motion.div>
            {phase === "crashed" && (
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm font-black uppercase tracking-widest mt-2"
                style={{ color: "#FF375F" }}
              >
                POPPED!
              </motion.p>
            )}
            {phase === "betting" && (
              <p className="text-xs mt-2 font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>
                Place your bet
              </p>
            )}
          </div>

          {/* Balloon + explosion */}
          <div className="relative flex items-center justify-center" style={{ marginTop: 80 }}>
            <AnimatePresence mode="wait">
              {phase !== "crashed" ? (
                <motion.div key="balloon" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}>
                  <BalloonSVG scale={balloonScale} color={currentColor} shake={shake} />
                </motion.div>
              ) : (
                <motion.div key="crashed" initial={{ scale: 0 }} animate={{ scale: 1 }} className="relative">
                  <div className="text-8xl select-none">💥</div>
                  {showExplosion && <Explosion color={currentColor} />}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Air pump machine */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
            <motion.div
              animate={phase === "flying" ? { y: [0, -3, 0] } : {}}
              transition={{ duration: 0.6, repeat: Infinity }}
              className="flex flex-col items-center gap-1"
            >
              <div
                className="w-16 h-2 rounded-full"
                style={{ background: `linear-gradient(90deg, ${currentColor}44, ${currentColor}88, ${currentColor}44)` }}
              />
              <div
                className="w-8 h-12 rounded-b-xl flex items-end justify-center pb-1"
                style={{ background: "rgba(47,128,255,0.15)", border: "1px solid rgba(47,128,255,0.25)" }}
              >
                <motion.div
                  animate={phase === "flying" ? { scaleY: [1, 0.5, 1] } : {}}
                  transition={{ duration: 0.6, repeat: Infinity }}
                  className="w-4 h-6 rounded-sm"
                  style={{ background: "rgba(47,128,255,0.4)", transformOrigin: "bottom" }}
                />
              </div>
            </motion.div>
          </div>
        </div>

        {/* ── Right Panel: Live Bets ───────────────────────────── */}
        <div
          className="w-full lg:w-64 xl:w-72 flex-shrink-0 p-4 flex flex-col gap-3 border-l lg:max-h-screen lg:overflow-y-auto"
          style={{ borderColor: "rgba(47,128,255,0.15)", background: "rgba(12,24,40,0.8)" }}
        >
          <div className="flex items-center gap-2">
            <Users size={14} style={{ color: "#2F80FF" }} />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>
              Live Bets
            </span>
            <span
              className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-bold"
              style={{ background: "rgba(47,128,255,0.15)", color: "#2F80FF" }}
            >
              {liveBets.length}
            </span>
          </div>

          <div className="space-y-2">
            {liveBets.length === 0 && (
              <p className="text-xs text-center py-4" style={{ color: "rgba(255,255,255,0.3)" }}>
                No bets yet this round
              </p>
            )}
            {liveBets.map((b, i) => (
              <motion.div
                key={b.betId + i}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center justify-between px-3 py-2 rounded-xl"
                style={{
                  background: b.cashOutAt
                    ? "rgba(0,255,178,0.06)"
                    : "rgba(255,255,255,0.04)",
                  border: `1px solid ${b.cashOutAt ? "rgba(0,255,178,0.2)" : "rgba(255,255,255,0.06)"}`,
                }}
              >
                <div>
                  <p className="text-xs font-bold text-white truncate max-w-[80px]">{b.username}</p>
                  <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                    {fmtMoney(b.betAmount)}
                  </p>
                </div>
                {b.cashOutAt ? (
                  <span className="text-xs font-black" style={{ color: "#00FFB2" }}>
                    {fmtMult(b.cashOutAt)}
                  </span>
                ) : (
                  <motion.span
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="text-[10px] font-bold"
                    style={{ color: "rgba(255,255,255,0.3)" }}
                  >
                    betting…
                  </motion.span>
                )}
              </motion.div>
            ))}
          </div>

          {/* Stats strip */}
          <div className="mt-auto pt-3 border-t space-y-2" style={{ borderColor: "rgba(47,128,255,0.15)" }}>
            <div className="flex items-center justify-between text-[11px]">
              <span style={{ color: "rgba(255,255,255,0.4)" }}>Total bets</span>
              <span className="font-bold text-white">{liveBets.length}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span style={{ color: "rgba(255,255,255,0.4)" }}>Cashed out</span>
              <span className="font-bold" style={{ color: "#00FFB2" }}>
                {liveBets.filter(b => b.cashOutAt).length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Round history bar ─────────────────────────────────── */}
      <div
        className="relative z-20 flex items-center gap-2 px-4 py-2.5 overflow-x-auto border-t [&::-webkit-scrollbar]:hidden"
        style={{ borderColor: "rgba(47,128,255,0.15)", background: "rgba(7,20,33,0.95)" }}
      >
        <Clock size={12} style={{ color: "rgba(255,255,255,0.3)", flexShrink: 0 }} />
        {history.slice(0, 25).map((h, i) => (
          <span
            key={i}
            className="flex-shrink-0 text-[11px] font-black px-2 py-0.5 rounded-full"
            style={{
              background: multiplierColor(h.crashPoint) + "18",
              color: multiplierColor(h.crashPoint),
              border: `1px solid ${multiplierColor(h.crashPoint)}33`,
            }}
          >
            {fmtMult(h.crashPoint)}
          </span>
        ))}
        {history.length === 0 && (
          <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>No history yet</span>
        )}
      </div>
    </div>
  );
}
