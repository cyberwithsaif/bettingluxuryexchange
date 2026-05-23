"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import useSWR from "swr";
import { useAuthStore } from "@/lib/stores/auth";
import { getSocket } from "@/lib/socket";
import {
  ArrowLeft, Volume2, VolumeX, Shield, TrendingUp,
  Zap, ChevronUp, Trophy, Clock, Bomb, Star,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Difficulty = "EASY" | "MEDIUM" | "HARD" | "EXPERT";
type Phase = "idle" | "playing" | "busted" | "won";

interface Session {
  id: string;
  betAmount: number;
  difficulty: Difficulty;
  columns: number;
  safeTiles: number;
  bombCount: number;
  levels: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  currentLevel: number;
  multiplier: number;
  multiplierTable: number[];
  pickedCols: number[];
}

interface PickResult {
  isBomb: boolean;
  col: number;
  row: number;
  rowBombs?: number[];
  status: string;
  currentLevel?: number;
  multiplier?: number;
  payout?: number;
  pickedCols?: number[];
  bombPositions?: number[][];
  serverSeed?: string;
}

interface RecentGame {
  id: string;
  username: string;
  betAmount: number;
  multiplier: number;
  payout: number;
  difficulty: Difficulty;
  level: number;
  status: string;
  createdAt: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const DIFF_CONFIG: Record<Difficulty, { columns: number; safeTiles: number; bombCount: number; label: string; color: string }> = {
  EASY:   { columns: 3, safeTiles: 2, bombCount: 1, label: "Easy",   color: "#22c55e" },
  MEDIUM: { columns: 3, safeTiles: 1, bombCount: 2, label: "Medium", color: "#f59e0b" },
  HARD:   { columns: 4, safeTiles: 1, bombCount: 3, label: "Hard",   color: "#f97316" },
  EXPERT: { columns: 5, safeTiles: 1, bombCount: 4, label: "Expert", color: "#ef4444" },
};

const LEVELS = 8;

function calcMultiplierTable(difficulty: Difficulty, houseEdge = 0.02): number[] {
  const { columns, safeTiles } = DIFF_CONFIG[difficulty];
  return Array.from({ length: LEVELS }, (_, i) => {
    const fair = Math.pow(columns / safeTiles, i + 1);
    return Math.floor(fair * (1 - houseEdge) * 100) / 100;
  });
}

// ─── Sounds ───────────────────────────────────────────────────────────────────

function useSounds(enabled: boolean) {
  const ctx = useRef<AudioContext | null>(null);
  const getCtx = () => {
    if (!ctx.current || ctx.current.state === "closed") {
      ctx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return ctx.current;
  };

  const tone = useCallback((freq: number, dur: number, type: OscillatorType = "sine", vol = 0.25, delay = 0) => {
    if (!enabled) return;
    try {
      const c    = getCtx();
      const osc  = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(c.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, c.currentTime + delay);
      gain.gain.setValueAtTime(vol, c.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + dur);
      osc.start(c.currentTime + delay);
      osc.stop(c.currentTime + delay + dur);
    } catch { /* ignore AudioContext errors */ }
  }, [enabled]);

  return {
    safe:    () => { tone(440, 0.08); tone(660, 0.12, "sine", 0.2, 0.07); },
    bomb:    () => { tone(80, 0.6, "sawtooth", 0.5); tone(55, 0.4, "square", 0.3, 0.05); },
    cashout: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, "sine", 0.2, i * 0.07)),
    bigwin:  () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.25, "sine", 0.25, i * 0.09)),
    hover:   () => tone(1200, 0.03, "sine", 0.05),
    start:   () => tone(330, 0.15, "sine", 0.2),
  };
}

// ─── Particle Burst ──────────────────────────────────────────────────────────

function ParticleBurst({ trigger, color }: { trigger: number; color: string }) {
  const particles = Array.from({ length: 12 }, (_, i) => ({
    angle: (i / 12) * 360,
    dist:  50 + Math.random() * 40,
    id:    i,
  }));

  return (
    <AnimatePresence>
      {trigger > 0 && particles.map(p => (
        <motion.div
          key={`${trigger}-${p.id}`}
          className="absolute w-2 h-2 rounded-full pointer-events-none"
          style={{
            backgroundColor: color,
            top: "50%", left: "50%",
            boxShadow: `0 0 6px ${color}`,
          }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{
            x: Math.cos((p.angle * Math.PI) / 180) * p.dist,
            y: Math.sin((p.angle * Math.PI) / 180) * p.dist,
            opacity: 0, scale: 0,
          }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      ))}
    </AnimatePresence>
  );
}

// ─── Tile ─────────────────────────────────────────────────────────────────────

type TileKind = "idle" | "active" | "loading" | "safe" | "bomb_self" | "bomb_other" | "missed_safe";

function Tile({
  kind, col, row, active, onPick, sound,
}: {
  kind: TileKind;
  col: number;
  row: number;
  active: boolean;
  onPick: (col: number, row: number) => void;
  sound: () => void;
}) {
  const [burst, setBurst] = useState(0);

  const handleClick = () => {
    if (!active) return;
    setBurst(b => b + 1);
    onPick(col, row);
  };

  const styles: Record<TileKind, { bg: string; border: string; glow: string; icon: React.ReactNode }> = {
    idle:         { bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)", glow: "none",           icon: null },
    active:       { bg: "rgba(99,102,241,0.15)",  border: "rgba(99,102,241,0.5)",  glow: "0 0 20px rgba(99,102,241,0.3)", icon: <span className="text-indigo-400 text-xl">?</span> },
    loading:      { bg: "rgba(99,102,241,0.2)",   border: "rgba(99,102,241,0.6)",  glow: "0 0 20px rgba(99,102,241,0.4)", icon: <span className="animate-spin text-white text-xl">⟳</span> },
    safe:         { bg: "rgba(34,197,94,0.2)",    border: "rgba(34,197,94,0.7)",   glow: "0 0 25px rgba(34,197,94,0.5)", icon: <span className="text-2xl">✓</span> },
    bomb_self:    { bg: "rgba(239,68,68,0.25)",   border: "rgba(239,68,68,0.8)",   glow: "0 0 25px rgba(239,68,68,0.6)", icon: <span className="text-2xl">💣</span> },
    bomb_other:   { bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.4)",   glow: "0 0 12px rgba(239,68,68,0.3)", icon: <span className="text-xl opacity-70">💣</span> },
    missed_safe:  { bg: "rgba(34,197,94,0.08)",   border: "rgba(34,197,94,0.3)",   glow: "none",           icon: <span className="text-green-500 text-lg opacity-50">✓</span> },
  };

  const s = styles[kind];

  return (
    <motion.button
      onClick={handleClick}
      onHoverStart={() => active && sound()}
      disabled={!active}
      whileHover={active ? { scale: 1.08, y: -3 } : {}}
      whileTap={active ? { scale: 0.95 } : {}}
      animate={kind === "bomb_self" ? { x: [0, -6, 6, -4, 4, 0] } : {}}
      transition={{ duration: 0.35 }}
      className="relative flex items-center justify-center rounded-xl font-bold transition-colors duration-200"
      style={{
        width: "clamp(52px, 10vw, 80px)",
        height: "clamp(52px, 10vw, 80px)",
        background:    s.bg,
        border:        `1.5px solid ${s.border}`,
        boxShadow:     s.glow,
        cursor:        active ? "pointer" : "default",
      }}
    >
      <span className="relative z-10 select-none">{s.icon}</span>
      <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
        <ParticleBurst trigger={burst} color={kind === "safe" ? "#22c55e" : "#6366f1"} />
      </div>
    </motion.button>
  );
}

// ─── Multiplier Counter ───────────────────────────────────────────────────────

function MultiplierCounter({ value, prev }: { value: number; prev: number }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    if (value === prev) return;
    let start = prev;
    const step = (value - prev) / 20;
    const id = setInterval(() => {
      start += step;
      if ((step > 0 && start >= value) || (step < 0 && start <= value)) {
        setDisplay(value);
        clearInterval(id);
      } else {
        setDisplay(parseFloat(start.toFixed(2)));
      }
    }, 25);
    return () => clearInterval(id);
  }, [value]);
  return <span>{display.toFixed(2)}x</span>;
}

// ─── Provably Fair Modal ──────────────────────────────────────────────────────

function ProvablyFairModal({ session, result, onClose }: {
  session: Session | null;
  result: { serverSeed?: string; bombPositions?: number[][] } | null;
  onClose: () => void;
}) {
  const [verifyResult, setVerifyResult] = useState<string | null>(null);

  const verify = async () => {
    if (!session || !result?.serverSeed) return;
    const crypto = await import("crypto").catch(() => null);
    if (!crypto) {
      setVerifyResult("Verification available server-side only");
      return;
    }
    const hash = crypto.createHash("sha256").update(result.serverSeed).digest("hex");
    setVerifyResult(hash === session.serverSeedHash ? "✅ Verified — seed matches hash" : "❌ Mismatch");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl p-6 space-y-4"
        style={{ background: "rgba(13,14,25,0.98)", border: "1px solid rgba(99,102,241,0.3)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Shield size={20} className="text-indigo-400" />
          <h3 className="text-white font-bold text-lg">Provably Fair</h3>
        </div>

        {session ? (
          <div className="space-y-3 text-sm">
            <Field label="Server Seed Hash" value={session.serverSeedHash} mono />
            <Field label="Client Seed"      value={session.clientSeed}      mono />
            <Field label="Nonce"            value={String(session.nonce)} />
            {result?.serverSeed && <Field label="Server Seed (revealed)" value={result.serverSeed} mono />}
            <button
              onClick={verify}
              className="w-full py-2 rounded-lg text-white font-semibold text-sm"
              style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}
            >
              Verify Seed
            </button>
            {verifyResult && (
              <p className="text-center text-sm font-semibold text-indigo-300">{verifyResult}</p>
            )}
            <p className="text-white/40 text-xs leading-relaxed">
              The server seed is hashed before the game starts. After it ends, the real seed is revealed so
              you can independently verify the outcome using SHA-256.
            </p>
          </div>
        ) : (
          <p className="text-white/50 text-sm">Start a game to see provably-fair details.</p>
        )}

        <button onClick={onClose} className="w-full py-2 text-white/50 hover:text-white text-sm transition">
          Close
        </button>
      </motion.div>
    </motion.div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-white/50 text-xs mb-1">{label}</p>
      <p
        className={`text-white/80 text-xs break-all rounded-lg px-3 py-2 ${mono ? "font-mono" : ""}`}
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {value}
      </p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TowersPage() {
  const { user }   = useAuthStore();
  const socket     = useRef(getSocket());

  // Game state
  const [phase, setPhase]             = useState<Phase>("idle");
  const [session, setSession]         = useState<Session | null>(null);
  const [tileStates, setTileStates]   = useState<TileKind[][]>([]);
  const [result, setResult]           = useState<{ serverSeed?: string; bombPositions?: number[][] } | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [cashoutAmt, setCashoutAmt]   = useState<number | null>(null);
  const [loading, setLoading]         = useState(false);
  const [prevMult, setPrevMult]       = useState(1);
  const errorTimer                    = useRef<NodeJS.Timeout | null>(null);

  // Controls
  const [betAmount, setBetAmount]     = useState(100);
  const [difficulty, setDifficulty]   = useState<Difficulty>("EASY");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [clientSeed, setClientSeed]   = useState(() =>
    typeof crypto !== "undefined" ? crypto.randomUUID().replace(/-/g, "").slice(0, 16) : "random123"
  );
  const [showFair, setShowFair]       = useState(false);

  const sounds  = useSounds(soundEnabled);
  const multTable = useMemo(() => calcMultiplierTable(difficulty), [difficulty]);
  const cfg     = DIFF_CONFIG[difficulty];
  const activeMult = session?.multiplierTable[session.currentLevel] ?? multTable[0];

  // Fetch recent games
  const { data: recentGames, mutate: refreshGames } = useSWR<RecentGame[]>(
    "/api/casino/towers/history",
    (url: string) => fetch(url).then(r => r.ok ? r.json() : []),
    { refreshInterval: 10_000 },
  );

  // Init tile states
  const initTiles = useCallback((cols: number, currentLevel: number, pickedCols: number[]) => {
    const tiles: TileKind[][] = Array.from({ length: LEVELS }, (_, row) =>
      Array.from({ length: cols }, () => {
        if (row < currentLevel) return "safe" as TileKind;
        if (row === currentLevel) return "active" as TileKind;
        return "idle" as TileKind;
      }),
    );
    // Mark previously picked safe tiles
    pickedCols.forEach((col, row) => {
      if (tiles[row]) tiles[row]![col] = "safe";
    });
    return tiles;
  }, []);

  // Recover active session on mount
  useEffect(() => {
    if (!user) return;
    fetch("/api/casino/towers/active")
      .then(r => r.ok ? r.json() : null)
      .then(s => {
        if (!s) return;
        setSession(s);
        setPhase("playing");
        setTileStates(initTiles(s.columns, s.currentLevel, s.pickedCols));
      })
      .catch(() => {});
  }, [user, initTiles]);

  // Socket listeners
  useEffect(() => {
    const s = socket.current;
    if (!s) return;

    const onStart = (data: { ok: boolean; session?: Session; message?: string }) => {
      setLoading(false);
      if (!data.ok || !data.session) {
        showError(data.message ?? "Failed to start");
        return;
      }
      const sess = data.session;
      setSession(sess);
      setPhase("playing");
      setPrevMult(1);
      setResult(null);
      setCashoutAmt(null);
      setTileStates(initTiles(sess.columns, 0, []));
      sounds.start();
    };

    const onPick = (data: { ok: boolean; result?: PickResult; message?: string }) => {
      setLoading(false);
      if (!data.ok || !data.result) { showError(data.message ?? "Error"); return; }
      const r = data.result;

      if (r.isBomb) {
        // Reveal bombs
        setTileStates(prev => {
          const next = prev.map(row => [...row]);
          if (session) {
            const bombs = r.bombPositions ?? [];
            bombs.forEach((rowBombs, row) => {
              rowBombs.forEach(bc => {
                if (next[row]) next[row]![bc] = "bomb_other";
              });
            });
            // Override the actual clicked bomb
            if (next[r.row]) next[r.row]![r.col] = "bomb_self";
          }
          return next;
        });
        setPhase("busted");
        setResult({ serverSeed: r.serverSeed, bombPositions: r.bombPositions });
        sounds.bomb();
        refreshGames();
      } else if (r.status === "CASHED_OUT") {
        // Auto win (completed all levels)
        setTileStates(prev => {
          const next = prev.map(row => [...row]);
          if (next[r.row]) next[r.row]![r.col] = "safe";
          return next;
        });
        setPhase("won");
        setCashoutAmt(r.payout ?? 0);
        setResult({ serverSeed: r.serverSeed, bombPositions: r.bombPositions });
        sounds.bigwin();
        refreshGames();
      } else {
        // Safe pick — advance
        setTileStates(prev => {
          const next = prev.map(row => [...row]);
          if (next[r.row]) next[r.row]![r.col] = "safe";
          if (r.currentLevel !== undefined && r.currentLevel < LEVELS && next[r.currentLevel]) {
            next[r.currentLevel] = next[r.currentLevel]!.map(() => "active" as TileKind);
          }
          return next;
        });
        setSession(prev => prev ? {
          ...prev,
          currentLevel:  r.currentLevel ?? prev.currentLevel,
          multiplier:    r.multiplier   ?? prev.multiplier,
          pickedCols:    r.pickedCols   ?? prev.pickedCols,
        } : prev);
        setPrevMult(session?.multiplier ?? 1);
        sounds.safe();
      }
    };

    const onCashout = (data: { ok: boolean; result?: PickResult; message?: string }) => {
      setLoading(false);
      if (!data.ok || !data.result) { showError(data.message ?? "Cashout failed"); return; }
      const r = data.result;

      // Reveal bombs
      setTileStates(prev => {
        const next = prev.map(row => [...row]);
        (r.bombPositions ?? []).forEach((rowBombs, row) => {
          rowBombs.forEach(bc => {
            if (next[row] && next[row]![bc] !== "safe") next[row]![bc] = "bomb_other";
          });
        });
        return next;
      });
      setPhase("won");
      setCashoutAmt(r.payout ?? 0);
      setResult({ serverSeed: r.serverSeed, bombPositions: r.bombPositions });
      sounds.cashout();
      refreshGames();
    };

    const onError = (data: { message: string }) => {
      setLoading(false);
      showError(data.message);
    };

    s.on("towers:startResponse",   onStart);
    s.on("towers:pickResponse",    onPick);
    s.on("towers:cashoutResponse", onCashout);
    s.on("towers:error",           onError);

    return () => {
      s.off("towers:startResponse",   onStart);
      s.off("towers:pickResponse",    onPick);
      s.off("towers:cashoutResponse", onCashout);
      s.off("towers:error",           onError);
    };
  }, [session, sounds, initTiles, refreshGames]);

  const showError = (msg: string) => {
    setError(msg);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(null), 4000);
  };

  const handleStart = () => {
    if (!user)    { showError("Please log in to play"); return; }
    if (loading)  return;
    setLoading(true);
    setPhase("idle");
    socket.current?.emit("towers:start", { betAmount, difficulty, clientSeed });
  };

  const handlePick = (col: number, row: number) => {
    if (!session || phase !== "playing" || loading) return;
    if (row !== session.currentLevel) return;
    setLoading(true);
    setTileStates(prev => {
      const next = prev.map(r => [...r]);
      if (next[row]) next[row]![col] = "loading";
      return next;
    });
    socket.current?.emit("towers:pick", { sessionId: session.id, col });
  };

  const handleCashout = () => {
    if (!session || phase !== "playing" || loading) return;
    if ((session.pickedCols?.length ?? 0) === 0) { showError("Clear at least one level first"); return; }
    setLoading(true);
    socket.current?.emit("towers:cashout", { sessionId: session.id });
  };

  const handleReset = () => {
    setPhase("idle");
    setSession(null);
    setTileStates([]);
    setResult(null);
    setCashoutAmt(null);
    setClientSeed(crypto.randomUUID().replace(/-/g, "").slice(0, 16));
  };

  const adjustBet = (factor: number) => setBetAmount(prev => Math.max(10, Math.round(prev * factor)));
  const quickBet  = (amt: number)    => setBetAmount(amt);

  const currentMultiplier = session
    ? (phase === "playing" ? (session.multiplierTable[session.currentLevel] ?? 1) : session.multiplier)
    : multTable[0] ?? 1;
  const currentPotential = session ? session.betAmount * currentMultiplier : betAmount * (multTable[0] ?? 1);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Mobile back bar */}
      <div className="md:hidden flex items-center gap-3 px-4 py-3 sticky top-0 z-20"
        style={{ background: "rgba(6,7,13,0.95)", borderBottom: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)" }}>
        <Link href="/" className="flex items-center gap-1.5 text-white/50 hover:text-white text-sm font-medium transition">
          <ArrowLeft size={15} /> Back
        </Link>
        <span className="flex-1 text-center text-white font-bold tracking-widest text-sm uppercase">Towers</span>
        <button onClick={() => setSoundEnabled(v => !v)} className="text-white/50 hover:text-white transition">
          {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
      </div>

      <div
        className="min-h-screen text-white relative overflow-hidden"
        style={{
          background: "radial-gradient(ellipse at 20% 0%,rgba(99,102,241,0.12) 0%,transparent 60%), radial-gradient(ellipse at 80% 100%,rgba(139,92,246,0.08) 0%,transparent 60%), #06070d",
        }}
      >
        {/* Floating orbs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 left-1/6 w-64 h-64 rounded-full opacity-10 blur-3xl"
            style={{ background: "radial-gradient(circle,#6366f1,transparent)" }} />
          <div className="absolute bottom-1/4 right-1/6 w-96 h-96 rounded-full opacity-8 blur-3xl"
            style={{ background: "radial-gradient(circle,#7c3aed,transparent)" }} />
        </div>

        <div className="relative max-w-[1400px] mx-auto px-3 md:px-6 py-4 md:py-8">

          {/* Desktop header */}
          <div className="hidden md:flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center gap-1.5 text-white/50 hover:text-white text-sm transition">
                <ArrowLeft size={15} /> Back
              </Link>
              <div className="w-px h-4 bg-white/20" />
              <h1 className="text-2xl font-black tracking-tight text-white">
                TOWERS
                <span className="ml-2 text-xs font-normal text-indigo-400 tracking-widest">PROVABLY FAIR</span>
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowFair(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white/60 hover:text-white text-xs font-medium transition"
                style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}
              >
                <Shield size={13} /> Provably Fair
              </button>
              <button onClick={() => setSoundEnabled(v => !v)}
                className="p-2 rounded-lg text-white/50 hover:text-white transition"
                style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }}
              >
                {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
            </div>
          </div>

          {/* 3-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_260px] gap-4 lg:gap-6">

            {/* ── LEFT: Controls ─────────────────────────────────────────── */}
            <div className="space-y-3 order-2 lg:order-1">

              {/* Difficulty */}
              <div className="rounded-2xl p-4 space-y-3"
                style={{ background: "rgba(13,14,25,0.8)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }}>
                <p className="text-xs font-bold tracking-widest text-white/50 uppercase">Difficulty</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["EASY", "MEDIUM", "HARD", "EXPERT"] as Difficulty[]).map(d => (
                    <button
                      key={d}
                      onClick={() => { if (phase === "idle") setDifficulty(d); }}
                      disabled={phase !== "idle"}
                      className="py-2.5 rounded-xl text-sm font-bold transition-all"
                      style={{
                        background: difficulty === d
                          ? `linear-gradient(135deg, ${DIFF_CONFIG[d].color}33, ${DIFF_CONFIG[d].color}22)`
                          : "rgba(255,255,255,0.04)",
                        border: `1.5px solid ${difficulty === d ? DIFF_CONFIG[d].color : "rgba(255,255,255,0.08)"}`,
                        color: difficulty === d ? DIFF_CONFIG[d].color : "rgba(255,255,255,0.5)",
                        boxShadow: difficulty === d ? `0 0 15px ${DIFF_CONFIG[d].color}30` : "none",
                      }}
                    >
                      {DIFF_CONFIG[d].label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-3 text-xs text-white/40 pt-1">
                  <span>{cfg.columns} tiles</span>
                  <span>·</span>
                  <span>{cfg.bombCount} bomb{cfg.bombCount > 1 ? "s" : ""}</span>
                  <span>·</span>
                  <span>{cfg.safeTiles} safe</span>
                </div>
              </div>

              {/* Bet Amount */}
              <div className="rounded-2xl p-4 space-y-3"
                style={{ background: "rgba(13,14,25,0.8)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }}>
                <p className="text-xs font-bold tracking-widest text-white/50 uppercase">Bet Amount</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50 font-bold text-sm">₹</span>
                  <input
                    type="number"
                    value={betAmount}
                    onChange={e => setBetAmount(Math.max(10, parseInt(e.target.value) || 10))}
                    disabled={phase !== "idle"}
                    className="w-full pl-7 pr-4 py-3 rounded-xl text-white font-bold text-lg focus:outline-none disabled:opacity-50"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1.5px solid rgba(99,102,241,0.3)",
                    }}
                  />
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[10, 100, 500, 1000].map(v => (
                    <button key={v} onClick={() => quickBet(v)} disabled={phase !== "idle"}
                      className="py-1.5 rounded-lg text-xs font-bold text-white/60 hover:text-white transition disabled:opacity-40"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      ₹{v >= 1000 ? `${v / 1000}k` : v}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => adjustBet(0.5)} disabled={phase !== "idle"}
                    className="flex-1 py-2 rounded-lg text-white/60 hover:text-white text-sm font-bold transition disabled:opacity-40"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    ½
                  </button>
                  <button onClick={() => adjustBet(2)} disabled={phase !== "idle"}
                    className="flex-1 py-2 rounded-lg text-white/60 hover:text-white text-sm font-bold transition disabled:opacity-40"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    2×
                  </button>
                </div>
              </div>

              {/* Multiplier Table */}
              <div className="rounded-2xl p-4"
                style={{ background: "rgba(13,14,25,0.8)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }}>
                <p className="text-xs font-bold tracking-widest text-white/50 uppercase mb-3">Payout Table</p>
                <div className="space-y-1.5">
                  {multTable.map((m, i) => {
                    const isActive  = session?.currentLevel === i && phase === "playing";
                    const isPassed  = session ? i < session.currentLevel : false;
                    return (
                      <div key={i}
                        className="flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-all"
                        style={{
                          background: isActive ? "rgba(99,102,241,0.2)" : isPassed ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.03)",
                          border: `1px solid ${isActive ? "rgba(99,102,241,0.5)" : isPassed ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.06)"}`,
                        }}
                      >
                        <span className="text-white/50 flex items-center gap-1.5">
                          <ChevronUp size={12} className={isPassed ? "text-green-400" : "text-white/30"} />
                          Level {i + 1}
                        </span>
                        <span className="font-bold" style={{ color: isPassed ? "#22c55e" : isActive ? "#818cf8" : "#a3a3a3" }}>
                          {m.toFixed(2)}x
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Provably Fair (mobile) */}
              <button
                onClick={() => setShowFair(true)}
                className="lg:hidden w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white/60 hover:text-white text-sm font-medium transition"
                style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)" }}
              >
                <Shield size={14} /> Provably Fair
              </button>
            </div>

            {/* ── CENTER: Tower Grid ──────────────────────────────────────── */}
            <div className="order-1 lg:order-2 flex flex-col items-center gap-4">

              {/* Multiplier display */}
              <div className="w-full rounded-2xl p-4 text-center"
                style={{ background: "rgba(13,14,25,0.8)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }}>
                <p className="text-xs font-bold tracking-widest text-white/40 uppercase mb-1">
                  {phase === "playing" ? "Next Level Payout" : "Max Payout"}
                </p>
                <motion.div
                  key={String(currentMultiplier)}
                  initial={{ scale: 0.9, opacity: 0.5 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-4xl md:text-5xl font-black"
                  style={{
                    background: "linear-gradient(135deg,#818cf8,#a78bfa,#c4b5fd)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  <MultiplierCounter value={currentMultiplier} prev={prevMult} />
                </motion.div>
                {phase === "playing" && session && (
                  <p className="text-sm text-white/50 mt-1">
                    Potential: <span className="text-white font-bold">₹{currentPotential.toFixed(2)}</span>
                  </p>
                )}
              </div>

              {/* Tower Grid */}
              <div
                className="w-full rounded-2xl p-4 md:p-6"
                style={{ background: "rgba(13,14,25,0.8)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }}
              >
                <div className="flex flex-col-reverse gap-2 items-center">
                  {Array.from({ length: LEVELS }, (_, row) => {
                    const cols = session?.columns ?? cfg.columns;
                    const rowPhase = tileStates[row];
                    const isCurrentRow = session?.currentLevel === row && phase === "playing";
                    const isPastRow    = session ? row < session.currentLevel : false;
                    const isFutureRow  = !isPastRow && !isCurrentRow;

                    return (
                      <motion.div
                        key={row}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: row * 0.04 }}
                        className="flex items-center gap-2 md:gap-3 w-full justify-center"
                      >
                        {/* Level indicator */}
                        <div className="hidden sm:flex items-center justify-center w-8 shrink-0">
                          <span
                            className="text-xs font-bold"
                            style={{
                              color: isPastRow ? "#22c55e" : isCurrentRow ? "#818cf8" : "rgba(255,255,255,0.2)",
                            }}
                          >
                            {row + 1}
                          </span>
                        </div>

                        {/* Tiles */}
                        <div className="flex gap-2 md:gap-3">
                          {Array.from({ length: cols }, (_, col) => {
                            let kind: TileKind = "idle";
                            if (rowPhase && rowPhase[col]) {
                              kind = rowPhase[col] as TileKind;
                            } else if (phase === "playing" && isCurrentRow) {
                              kind = "active";
                            } else if (phase === "idle" && row === 0) {
                              kind = "active";
                            }

                            return (
                              <Tile
                                key={col}
                                kind={kind}
                                col={col}
                                row={row}
                                active={kind === "active" && phase === "playing" && !loading}
                                onPick={handlePick}
                                sound={sounds.hover}
                              />
                            );
                          })}
                        </div>

                        {/* Multiplier badge */}
                        <div className="hidden sm:flex items-center justify-end w-16 shrink-0">
                          <span
                            className="text-xs font-bold"
                            style={{ color: isPastRow ? "#22c55e" : isCurrentRow ? "#818cf8" : "rgba(255,255,255,0.2)" }}
                          >
                            {(session?.multiplierTable[row] ?? multTable[row] ?? 1).toFixed(2)}x
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* Result banner */}
              <AnimatePresence>
                {phase === "won" && cashoutAmt !== null && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="w-full rounded-2xl p-5 text-center"
                    style={{
                      background: "linear-gradient(135deg,rgba(34,197,94,0.15),rgba(16,185,129,0.1))",
                      border: "1.5px solid rgba(34,197,94,0.5)",
                    }}
                  >
                    <div className="text-3xl mb-1">🎉</div>
                    <p className="text-green-300 font-black text-2xl">₹{cashoutAmt.toFixed(2)}</p>
                    <p className="text-green-400/70 text-sm mt-1">
                      {session?.multiplier?.toFixed(2) ?? "?"}x · Level {session?.currentLevel ?? 0}
                    </p>
                  </motion.div>
                )}
                {phase === "busted" && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="w-full rounded-2xl p-5 text-center"
                    style={{
                      background: "linear-gradient(135deg,rgba(239,68,68,0.15),rgba(220,38,38,0.1))",
                      border: "1.5px solid rgba(239,68,68,0.5)",
                    }}
                  >
                    <div className="text-3xl mb-1">💣</div>
                    <p className="text-red-300 font-black text-xl">Hit a Bomb!</p>
                    <p className="text-red-400/70 text-sm mt-1">Better luck next time</p>
                  </motion.div>
                )}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="w-full rounded-xl px-4 py-3 text-center text-sm font-semibold text-red-300"
                    style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)" }}
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action buttons */}
              <div className="w-full flex gap-3">
                {(phase === "idle" || phase === "won" || phase === "busted") && (
                  <motion.button
                    onClick={phase === "idle" ? handleStart : handleReset}
                    whileTap={{ scale: 0.97 }}
                    disabled={loading}
                    className="flex-1 py-4 rounded-2xl font-black text-lg uppercase tracking-widest text-white transition disabled:opacity-50"
                    style={{
                      background: "linear-gradient(135deg,#4f46e5,#7c3aed)",
                      boxShadow: "0 4px 30px rgba(99,102,241,0.4)",
                    }}
                  >
                    {loading ? "Starting…" : phase === "idle" ? `Play ₹${betAmount}` : "Play Again"}
                  </motion.button>
                )}

                {phase === "playing" && (
                  <>
                    <motion.button
                      onClick={handleCashout}
                      whileTap={{ scale: 0.97 }}
                      disabled={loading || (session?.currentLevel ?? 0) === 0}
                      className="flex-1 py-4 rounded-2xl font-black text-base uppercase tracking-widest text-white transition disabled:opacity-40"
                      style={{
                        background: "linear-gradient(135deg,#16a34a,#15803d)",
                        boxShadow: "0 4px 25px rgba(34,197,94,0.3)",
                      }}
                    >
                      {loading ? "…" : `Cash Out ₹${currentPotential.toFixed(0)}`}
                    </motion.button>
                  </>
                )}
              </div>
            </div>

            {/* ── RIGHT: Feed ─────────────────────────────────────────────── */}
            <div className="space-y-3 order-3">

              {/* Live stats */}
              <div className="rounded-2xl p-4"
                style={{ background: "rgba(13,14,25,0.8)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }}>
                <p className="text-xs font-bold tracking-widest text-white/50 uppercase mb-3">Game Stats</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Min Bet", value: "₹10",  icon: <Zap size={14} /> },
                    { label: "Levels",  value: "8",    icon: <TrendingUp size={14} /> },
                    { label: "Max Win", value: multTable[LEVELS - 1]?.toFixed(1) + "x", icon: <Trophy size={14} /> },
                    { label: "RTP",     value: "98%",  icon: <Star size={14} /> },
                  ].map(item => (
                    <div key={item.label} className="rounded-xl p-3 text-center"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div className="flex justify-center mb-1 text-indigo-400">{item.icon}</div>
                      <p className="text-white font-bold text-sm">{item.value}</p>
                      <p className="text-white/40 text-xs">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Games */}
              <div className="rounded-2xl p-4"
                style={{ background: "rgba(13,14,25,0.8)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(12px)", maxHeight: "420px", overflowY: "auto" }}>
                <div className="flex items-center gap-2 mb-3">
                  <Clock size={13} className="text-white/40" />
                  <p className="text-xs font-bold tracking-widest text-white/50 uppercase">Recent Games</p>
                </div>
                <div className="space-y-2">
                  {recentGames && recentGames.length > 0 ? (
                    recentGames.slice(0, 15).map(game => (
                      <motion.div
                        key={game.id}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center justify-between px-3 py-2 rounded-xl"
                        style={{
                          background: game.status === "CASHED_OUT" ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                          border: `1px solid ${game.status === "CASHED_OUT" ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-white/70 text-xs font-medium truncate">{game.username}</p>
                          <p className="text-white/40 text-xs">
                            {DIFF_CONFIG[game.difficulty]?.label ?? game.difficulty} · Lv{game.level}
                          </p>
                        </div>
                        <div className="text-right ml-2 shrink-0">
                          {game.status === "CASHED_OUT" ? (
                            <>
                              <p className="text-green-400 font-bold text-sm">{game.multiplier.toFixed(2)}x</p>
                              <p className="text-green-400/60 text-xs">+₹{(game.payout - game.betAmount).toFixed(0)}</p>
                            </>
                          ) : (
                            <>
                              <p className="text-red-400 font-bold text-sm flex items-center gap-1 justify-end">
                                <Bomb size={11} /> Lost
                              </p>
                              <p className="text-red-400/60 text-xs">₹{game.betAmount.toFixed(0)}</p>
                            </>
                          )}
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <p className="text-white/30 text-sm text-center py-6">No recent games</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Provably Fair Modal */}
      <AnimatePresence>
        {showFair && (
          <ProvablyFairModal session={session} result={result} onClose={() => setShowFair(false)} />
        )}
      </AnimatePresence>
    </>
  );
}
