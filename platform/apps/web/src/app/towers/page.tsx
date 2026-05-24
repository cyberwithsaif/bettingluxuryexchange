"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/lib/stores/auth";
import { getSocket } from "@/lib/socket";
import {
  ArrowLeft, Volume2, VolumeX, Shield,
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

// Broken-crystal clip-path variants — vary by position for organic look
const BROKEN_CLIPS = [
  "polygon(8% 0%,92% 0%,100% 8%,100% 92%,92% 100%,8% 100%,0% 92%,0% 8%)",
  "polygon(10% 1%,90% 0%,100% 10%,99% 91%,90% 100%,10% 99%,0% 90%,1% 10%)",
  "polygon(7% 2%,93% 0%,100% 7%,98% 93%,93% 100%,7% 98%,0% 93%,2% 7%)",
  "polygon(9% 0%,91% 2%,100% 9%,99% 90%,90% 99%,10% 100%,1% 91%,0% 10%)",
  "polygon(6% 1%,94% 0%,100% 6%,100% 94%,94% 99%,6% 100%,0% 94%,0% 6%)",
  "polygon(11% 0%,89% 1%,100% 11%,98% 89%,89% 100%,11% 99%,0% 89%,2% 11%)",
];

const TILE_STYLE: Record<TileKind, { bg: string; glow: string; textColor: string; overlay: string }> = {
  idle:        { bg: "linear-gradient(145deg,#1e1854,#150f3a)",        glow: "none",                              textColor: "rgba(160,140,220,0.55)", overlay: "none" },
  active:      { bg: "linear-gradient(145deg,#7c3aed,#5b21b6)",        glow: "0 0 22px rgba(124,58,237,0.65)",   textColor: "#e9d5ff",               overlay: "rgba(255,255,255,0.06)" },
  loading:     { bg: "linear-gradient(145deg,#6d28d9,#4c1d95)",        glow: "0 0 22px rgba(109,40,217,0.6)",    textColor: "#c4b5fd",               overlay: "none" },
  safe:        { bg: "linear-gradient(145deg,#166534,#14532d)",        glow: "0 0 24px rgba(34,197,94,0.55)",    textColor: "#86efac",               overlay: "rgba(34,197,94,0.08)" },
  bomb_self:   { bg: "linear-gradient(145deg,#991b1b,#7f1d1d)",        glow: "0 0 28px rgba(239,68,68,0.7)",     textColor: "#fca5a5",               overlay: "rgba(239,68,68,0.1)" },
  bomb_other:  { bg: "linear-gradient(145deg,#3b0000,#1c0a0a)",        glow: "none",                              textColor: "rgba(252,165,165,0.35)", overlay: "none" },
  missed_safe: { bg: "linear-gradient(145deg,#052e16,#022c22)",        glow: "none",                              textColor: "rgba(134,239,172,0.3)", overlay: "none" },
};

function Tile({
  kind, col, row, active, onPick, sound, multiplier,
}: {
  kind: TileKind;
  col: number;
  row: number;
  active: boolean;
  onPick: (col: number, row: number) => void;
  sound: () => void;
  multiplier: number;
}) {
  const [burst, setBurst] = useState(0);
  const clipPath = BROKEN_CLIPS[(col * 2 + row * 3) % BROKEN_CLIPS.length]!;
  const s = TILE_STYLE[kind];

  const handleClick = () => {
    if (!active) return;
    setBurst(b => b + 1);
    onPick(col, row);
  };

  const icon = kind === "safe"
    ? <span className="text-base leading-none">✓</span>
    : kind === "bomb_self" || kind === "bomb_other"
    ? <span className="text-base leading-none">💣</span>
    : kind === "loading"
    ? <span className="animate-spin text-base leading-none">⟳</span>
    : null;

  return (
    <motion.button
      onClick={handleClick}
      onHoverStart={() => active && sound()}
      disabled={!active}
      whileHover={active ? { scale: 1.1, y: -2 } : {}}
      whileTap={active ? { scale: 0.93 } : {}}
      animate={kind === "bomb_self" ? { x: [0, -5, 5, -3, 3, 0] } : {}}
      transition={{ duration: 0.3 }}
      className="relative flex flex-col items-center justify-center font-bold select-none"
      style={{
        width:    "clamp(56px, 11vw, 80px)",
        height:   "clamp(44px, 8.5vw, 64px)",
        background: s.bg,
        clipPath,
        boxShadow: s.glow,
        cursor:    active ? "pointer" : "default",
      }}
    >
      {/* Inner shine overlay */}
      {s.overlay !== "none" && (
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: `linear-gradient(160deg, ${s.overlay} 0%, transparent 60%)`, clipPath }} />
      )}
      {/* Multiplier text or icon */}
      {icon ? (
        <span style={{ color: s.textColor, position: "relative", zIndex: 1 }}>{icon}</span>
      ) : (
        <span
          className="relative z-10 font-black leading-none text-center"
          style={{
            color: s.textColor,
            fontSize: "clamp(9px, 1.5vw, 12px)",
            letterSpacing: "-0.02em",
            textShadow: active ? "0 0 12px rgba(233,213,255,0.6)" : "none",
          }}
        >
          {multiplier >= 1000
            ? `${(multiplier / 1000).toFixed(1)}k×`
            : `${multiplier.toFixed(2)}×`}
        </span>
      )}
      {/* Particle burst on pick */}
      <div className="absolute inset-0 pointer-events-none overflow-visible">
        <ParticleBurst trigger={burst} color={kind === "safe" ? "#22c55e" : "#a78bfa"} />
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
  }, [session, sounds, initTiles]);

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

        <div className="relative max-w-[1400px] mx-auto px-3 md:px-6 py-4 md:py-6">

          {/* 2-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4 lg:gap-6">

            {/* ── LEFT: Compact Controls ─────────────────────────── */}
            <div className="space-y-2 order-2 lg:order-1">

              {/* Difficulty — compact 2x2 grid */}
              <div className="rounded-xl p-3"
                style={{ background: "rgba(13,14,25,0.9)", border: "1px solid rgba(99,102,241,0.2)", backdropFilter: "blur(12px)" }}>
                <p className="text-xs font-bold tracking-widest text-white/40 uppercase mb-2">Difficulty</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {(["EASY", "MEDIUM", "HARD", "EXPERT"] as Difficulty[]).map(d => (
                    <button
                      key={d}
                      onClick={() => { if (phase === "idle") setDifficulty(d); }}
                      disabled={phase !== "idle"}
                      className="py-2 rounded-lg text-xs font-bold transition-all"
                      style={{
                        background: difficulty === d
                          ? `linear-gradient(135deg, ${DIFF_CONFIG[d].color}44, ${DIFF_CONFIG[d].color}22)`
                          : "rgba(255,255,255,0.04)",
                        border: `1.5px solid ${difficulty === d ? DIFF_CONFIG[d].color : "rgba(255,255,255,0.06)"}`,
                        color: difficulty === d ? DIFF_CONFIG[d].color : "rgba(255,255,255,0.4)",
                        boxShadow: difficulty === d ? `0 0 12px ${DIFF_CONFIG[d].color}25` : "none",
                      }}
                    >
                      {DIFF_CONFIG[d].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bet Amount — compact */}
              <div className="rounded-xl p-3"
                style={{ background: "rgba(13,14,25,0.9)", border: "1px solid rgba(99,102,241,0.2)", backdropFilter: "blur(12px)" }}>
                <p className="text-xs font-bold tracking-widest text-white/40 uppercase mb-2">Bet</p>
                <div className="relative mb-2">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40 font-bold text-xs">₹</span>
                  <input
                    type="number"
                    value={betAmount}
                    onChange={e => setBetAmount(Math.max(10, parseInt(e.target.value) || 10))}
                    disabled={phase !== "idle"}
                    className="w-full pl-6 pr-3 py-2 rounded-lg text-white font-bold text-sm focus:outline-none disabled:opacity-50"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(99,102,241,0.2)",
                    }}
                  />
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[10, 100, 500, 1000].map(v => (
                    <button key={v} onClick={() => quickBet(v)} disabled={phase !== "idle"}
                      className="py-1 rounded text-xs font-bold text-white/50 hover:text-white/70 transition disabled:opacity-40"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      {v >= 1000 ? `${v / 1000}k` : v}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1 mt-2">
                  <button onClick={() => adjustBet(0.5)} disabled={phase !== "idle"}
                    className="flex-1 py-1.5 rounded text-xs font-bold text-white/50 hover:text-white/70 transition disabled:opacity-40"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    ½
                  </button>
                  <button onClick={() => adjustBet(2)} disabled={phase !== "idle"}
                    className="flex-1 py-1.5 rounded text-xs font-bold text-white/50 hover:text-white/70 transition disabled:opacity-40"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    2×
                  </button>
                </div>
              </div>

              {/* Provably Fair (mobile) */}
              <button
                onClick={() => setShowFair(true)}
                className="lg:hidden w-full flex items-center justify-center gap-2 py-2 rounded-lg text-white/50 hover:text-white text-xs font-medium transition"
                style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}
              >
                <Shield size={12} /> Provably Fair
              </button>
            </div>

            {/* ── CENTER: Tower Grid ──────────────────────────────────────── */}
            <div className="order-1 lg:order-2 flex flex-col items-center gap-4">

              {/* Tower Grid */}
              <div
                className="w-full rounded-2xl p-3 md:p-5"
                style={{ background: "rgba(10,8,22,0.92)", border: "1px solid rgba(124,58,237,0.2)", backdropFilter: "blur(12px)" }}
              >
                <div className="flex flex-col-reverse gap-1.5 items-center">
                  {Array.from({ length: LEVELS }, (_, row) => {
                    const cols      = session?.columns ?? cfg.columns;
                    const rowPhase  = tileStates[row];
                    const isCurrentRow = session?.currentLevel === row && phase === "playing";
                    const isPastRow    = session ? row < session.currentLevel : false;
                    const rowMult      = session?.multiplierTable[row] ?? multTable[row] ?? 1;

                    return (
                      <motion.div
                        key={row}
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: row * 0.035 }}
                        className="flex items-center gap-2 w-full justify-center"
                      >
                        {/* Level dot */}
                        <div className="hidden sm:flex items-center justify-center w-5 shrink-0">
                          <div className="w-1.5 h-1.5 rounded-full"
                            style={{ background: isPastRow ? "#22c55e" : isCurrentRow ? "#818cf8" : "rgba(255,255,255,0.12)" }} />
                        </div>

                        {/* Tiles */}
                        <div className="flex gap-1.5">
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
                                multiplier={rowMult}
                              />
                            );
                          })}
                        </div>

                        {/* Multiplier label right */}
                        <div className="hidden sm:flex items-center w-14 shrink-0">
                          <span className="text-xs font-bold tabular-nums"
                            style={{ color: isPastRow ? "#4ade80" : isCurrentRow ? "#a78bfa" : "rgba(255,255,255,0.18)" }}>
                            {rowMult >= 1000 ? `${(rowMult/1000).toFixed(1)}k×` : `${rowMult.toFixed(2)}×`}
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
