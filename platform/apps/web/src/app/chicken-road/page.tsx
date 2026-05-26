"use client";

import { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/lib/stores/auth";
import { getSocket } from "@/lib/socket";
import { Shield } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Difficulty = "EASY" | "MEDIUM" | "HARD" | "DAREDEVIL";
type Phase = "idle" | "running" | "crashed" | "cashed";

interface Session {
  id: string;
  betAmount: number;
  difficulty: Difficulty;
  lanes: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  status: string;
  currentLane: number;
  multiplier: number;
  multiplierTable: number[];
}

interface MoveResult {
  crashed: boolean;
  lane: number;
  status: string;
  currentLane?: number;
  multiplier?: number;
  payout?: number;
  deadlyLanes?: boolean[];
  serverSeed?: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const DIFF_CONFIG: Record<Difficulty, { lanes: number; deathProb: number; label: string; color: string }> = {
  EASY:      { lanes: 20, deathProb: 0.06, label: "Easy",      color: "#22c55e" },
  MEDIUM:    { lanes: 18, deathProb: 0.12, label: "Medium",    color: "#8b5cf6" },
  HARD:      { lanes: 16, deathProb: 0.20, label: "Hard",      color: "#f97316" },
  DAREDEVIL: { lanes: 14, deathProb: 0.30, label: "Daredevil", color: "#ef4444" },
};

const HOUSE_EDGE = 0.03;
const SIDEWALK_W = 96;

// Client-side preview of the same multiplier curve the server computes, so the
// board can render rewards before a round starts. Authoritative values come
// from the server's multiplierTable once a session exists.
function previewTable(difficulty: Difficulty): number[] {
  const { lanes, deathProb } = DIFF_CONFIG[difficulty];
  const survival = 1 - deathProb;
  return Array.from({ length: lanes }, (_, i) => {
    const fair = Math.pow(1 / survival, i + 1);
    return Math.floor(fair * (1 - HOUSE_EDGE) * 100) / 100;
  });
}

function fmtMult(m: number): string {
  return m >= 100 ? `${m.toFixed(0)}×` : `${m.toFixed(2)}×`;
}

// ─── Sounds (Web Audio, matches other games) ───────────────────────────────────

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
      const c = getCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain); gain.connect(c.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, c.currentTime + delay);
      gain.gain.setValueAtTime(vol, c.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + dur);
      osc.start(c.currentTime + delay);
      osc.stop(c.currentTime + delay + dur);
    } catch { }
  }, [enabled]);

  return {
    hop:     () => { tone(520, 0.06, "square", 0.18); tone(780, 0.08, "sine", 0.12, 0.05); },
    crash:   () => { tone(90, 0.5, "sawtooth", 0.5); tone(60, 0.4, "square", 0.3, 0.05); },
    cashout: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, "sine", 0.2, i * 0.07)),
    start:   () => tone(330, 0.15, "sine", 0.2),
  };
}

// ─── Vehicle (top-down) ─────────────────────────────────────────────────────────

const VEHICLE_COLORS = ["#7c3aed", "#ef4444", "#f59e0b", "#3b82f6", "#10b981", "#e5e7eb", "#ec4899"];

function Vehicle({ w, color, length }: { w: number; color: string; length: number }) {
  const bw = w * 0.56;
  const bh = length;
  return (
    <div style={{ width: bw, height: bh, position: "relative" }}>
      <div
        style={{
          position: "absolute", inset: 0, borderRadius: bw * 0.28,
          background: `linear-gradient(180deg, ${color}, ${shade(color, -18)})`,
          boxShadow: `0 ${bh * 0.06}px ${bh * 0.14}px rgba(0,0,0,0.45), inset 0 2px 2px rgba(255,255,255,0.25)`,
          border: "1px solid rgba(0,0,0,0.25)",
        }}
      />
      {/* windshield (front = bottom, vehicle drives downward) */}
      <div style={{
        position: "absolute", left: "16%", right: "16%", bottom: "12%", height: bh * 0.22,
        borderRadius: bw * 0.14, background: "linear-gradient(180deg,#bae6fd,#7dd3fc)",
        boxShadow: "inset 0 1px 2px rgba(255,255,255,0.6)",
      }} />
      {/* rear window */}
      <div style={{
        position: "absolute", left: "20%", right: "20%", top: "10%", height: bh * 0.16,
        borderRadius: bw * 0.12, background: "rgba(255,255,255,0.18)",
      }} />
      {/* headlights */}
      <div style={{ position: "absolute", bottom: 1, left: "14%", width: bw * 0.18, height: bw * 0.18, borderRadius: "50%", background: "#fde68a", boxShadow: "0 0 6px #fde047" }} />
      <div style={{ position: "absolute", bottom: 1, right: "14%", width: bw * 0.18, height: bw * 0.18, borderRadius: "50%", background: "#fde68a", boxShadow: "0 0 6px #fde047" }} />
      {/* taillights */}
      <div style={{ position: "absolute", top: 1, left: "16%", width: bw * 0.14, height: bw * 0.12, borderRadius: 2, background: "#dc2626" }} />
      <div style={{ position: "absolute", top: 1, right: "16%", width: bw * 0.14, height: bw * 0.12, borderRadius: 2, background: "#dc2626" }} />
    </div>
  );
}

function shade(hex: string, percent: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + percent));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + percent));
  const b = Math.max(0, Math.min(255, (n & 0xff) + percent));
  return `rgb(${r},${g},${b})`;
}

// ─── Chicken ─────────────────────────────────────────────────────────────────

function Chicken({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ filter: "drop-shadow(0 4px 4px rgba(0,0,0,0.4))" }}>
      {/* legs */}
      <rect x="25" y="48" width="3.4" height="9" rx="1.5" fill="#f59e0b" />
      <rect x="35" y="48" width="3.4" height="9" rx="1.5" fill="#f59e0b" />
      {/* body */}
      <ellipse cx="32" cy="38" rx="17" ry="16" fill="#ffffff" />
      <ellipse cx="32" cy="40" rx="13" ry="11" fill="#f8fafc" />
      {/* head */}
      <circle cx="32" cy="20" r="11" fill="#ffffff" />
      {/* comb */}
      <path d="M27 11 q2 -5 5 -2 q2 -5 5 0 q2 -3 3 2 q-8 3 -13 0 Z" fill="#ef4444" />
      {/* eyes */}
      <circle cx="28.5" cy="19" r="1.7" fill="#111827" />
      <circle cx="35.5" cy="19" r="1.7" fill="#111827" />
      {/* beak */}
      <path d="M30 23 L34 23 L32 27 Z" fill="#f59e0b" />
      {/* wattle */}
      <ellipse cx="32" cy="28" rx="2" ry="3" fill="#ef4444" />
      {/* wing */}
      <path d="M20 36 q6 6 4 13 q-6 -1 -8 -7 Z" fill="#e2e8f0" />
    </svg>
  );
}

// ─── Provably Fair Modal ───────────────────────────────────────────────────────

function ProvablyFairModal({ session, onClose }: { session: Session | null; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl p-6 space-y-4"
        style={{ background: "rgba(13,14,25,0.98)", border: "1px solid rgba(139,92,246,0.3)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Shield size={20} className="text-violet-400" />
          <h3 className="text-white font-bold text-lg">Provably Fair</h3>
        </div>
        {session ? (
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-white/50 text-xs mb-1">Server Seed Hash</p>
              <p className="text-white/80 text-xs break-all rounded-lg px-3 py-2 font-mono" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                {session.serverSeedHash}
              </p>
            </div>
            <div>
              <p className="text-white/50 text-xs mb-1">Client Seed</p>
              <p className="text-white/80 text-xs break-all rounded-lg px-3 py-2 font-mono" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                {session.clientSeed}
              </p>
            </div>
            <p className="text-white/40 text-xs">
              Each lane outcome = HMAC-SHA256(serverSeed, clientSeed:nonce:lane). After the round the server seed is revealed so you can verify every lane.
            </p>
            <button onClick={onClose} className="w-full py-2 text-white/50 hover:text-white text-sm transition">Close</button>
          </div>
        ) : (
          <p className="text-white/50 text-sm">Start a game to see provably-fair details.</p>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ChickenRoadPage() {
  const { user } = useAuthStore();
  const socket = useRef(getSocket());

  const [phase, setPhase] = useState<Phase>("idle");
  const [session, setSession] = useState<Session | null>(null);
  const [crashLane, setCrashLane] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cashoutAmt, setCashoutAmt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const errorTimer = useRef<NodeJS.Timeout | null>(null);

  // Controls
  const [betAmount, setBetAmount] = useState(100);
  const [difficulty, setDifficulty] = useState<Difficulty>("MEDIUM");
  const [soundEnabled] = useState(true);
  const [clientSeed, setClientSeed] = useState(() =>
    typeof crypto !== "undefined" ? crypto.randomUUID().replace(/-/g, "").slice(0, 16) : "random123",
  );
  const [showFair, setShowFair] = useState(false);
  const [liveBalance, setLiveBalance] = useState<number | null>(null);

  const sounds = useSounds(soundEnabled);

  // Responsive board geometry
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [laneW, setLaneW] = useState(150);
  const [boardH, setBoardH] = useState(420);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setLaneW(Math.max(112, Math.min(196, (w - SIDEWALK_W) / 3.2)));
      setBoardH(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lanes = session?.lanes ?? DIFF_CONFIG[difficulty].lanes;
  const multTable = useMemo(
    () => session?.multiplierTable ?? previewTable(difficulty),
    [session, difficulty],
  );
  const currentLane = session?.currentLane ?? 0;
  const multiplier = session?.multiplier ?? 1.0;

  // Restore an in-progress session on load
  useEffect(() => {
    if (!user) return;
    fetch("/api/casino/chicken-road/active")
      .then(r => (r.ok ? r.json() : null))
      .then((s: Session | null) => {
        if (!s) return;
        setSession(s);
        setPhase("running");
      })
      .catch(() => {});
  }, [user]);

  // Socket wiring
  useEffect(() => {
    const s = socket.current;
    if (!s) return;

    const onStart = (data: { ok: boolean; session?: Session; message?: string }) => {
      setLoading(false);
      if (!data.ok || !data.session) { showError(data.message ?? "Could not start"); return; }
      setSession(data.session);
      setPhase("running");
      setCrashLane(null);
      setCashoutAmt(null);
      sounds.start();
    };

    const onMove = (data: { ok: boolean; result?: MoveResult; message?: string }) => {
      setLoading(false);
      if (!data.ok || !data.result) { showError(data.message ?? "Error"); return; }
      const r = data.result;

      if (r.crashed) {
        setCrashLane(r.lane);
        setSession(prev => (prev ? { ...prev, status: "BUSTED" } : prev));
        setPhase("crashed");
        sounds.crash();
        return;
      }
      if (r.status === "CASHED_OUT") {
        setSession(prev => (prev ? { ...prev, currentLane: prev.lanes, multiplier: r.multiplier ?? prev.multiplier } : prev));
        setCashoutAmt(r.payout ?? 0);
        setPhase("cashed");
        sounds.cashout();
        return;
      }
      setSession(prev => prev ? { ...prev, currentLane: r.currentLane ?? prev.currentLane, multiplier: r.multiplier ?? prev.multiplier } : prev);
      sounds.hop();
    };

    const onCashout = (data: { ok: boolean; result?: MoveResult; message?: string }) => {
      setLoading(false);
      if (!data.ok || !data.result) { showError(data.message ?? "Error"); return; }
      setCashoutAmt(data.result.payout ?? 0);
      setPhase("cashed");
      sounds.cashout();
    };

    const onError = (data: { message: string }) => { setLoading(false); showError(data.message); };
    const onBalance = (data: { available: number }) => setLiveBalance(data.available);

    s.on("chickenRoad:startResponse", onStart);
    s.on("chickenRoad:moveResponse", onMove);
    s.on("chickenRoad:cashoutResponse", onCashout);
    s.on("chickenRoad:error", onError);
    s.on("wallet:balance", onBalance);

    return () => {
      s.off("chickenRoad:startResponse", onStart);
      s.off("chickenRoad:moveResponse", onMove);
      s.off("chickenRoad:cashoutResponse", onCashout);
      s.off("chickenRoad:error", onError);
      s.off("wallet:balance", onBalance);
    };
  }, [sounds]);

  const showError = (msg: string) => {
    setError(msg);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(null), 4000);
  };

  const handleStart = () => {
    if (!user) { showError("Please log in to play"); return; }
    if (loading) return;
    setLoading(true);
    socket.current?.emit("chickenRoad:start", { betAmount, difficulty, clientSeed });
  };

  const handleMove = useCallback(() => {
    if (!session || phase !== "running" || loading) return;
    if (session.currentLane >= session.lanes) return;
    setLoading(true);
    socket.current?.emit("chickenRoad:move", { sessionId: session.id });
  }, [session, phase, loading]);

  const handleCashout = () => {
    if (!session || phase !== "running" || loading) return;
    if (session.currentLane === 0) { showError("Cross at least one lane first"); return; }
    setLoading(true);
    socket.current?.emit("chickenRoad:cashout", { sessionId: session.id });
  };

  const handleReset = () => {
    setPhase("idle");
    setSession(null);
    setCrashLane(null);
    setCashoutAmt(null);
    setClientSeed(crypto.randomUUID().replace(/-/g, "").slice(0, 16));
  };

  const adjustBet = (factor: number) => setBetAmount(prev => Math.max(10, Math.round(prev * factor)));
  const quickBet = (amt: number) => setBetAmount(amt);

  // Keyboard + swipe controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === " ") { e.preventDefault(); handleMove(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleMove]);

  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]; if (t) touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchStart.current; const t = e.changedTouches[0];
    if (!s || !t) return;
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (dx > 30 && Math.abs(dx) > Math.abs(dy)) handleMove();      // swipe right
    else if (dy < -30 && Math.abs(dy) > Math.abs(dx)) handleMove(); // swipe up
    else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) handleMove();  // tap
    touchStart.current = null;
  };

  // Camera offset keeps the chicken anchored near the left
  const cameraX = -currentLane * laneW;
  const chickenSize = Math.min(laneW * 0.46, 74);
  const isOver = phase === "crashed" || phase === "cashed";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bg-[#0a0b16] text-white flex flex-col font-sans w-full min-h-full md:min-h-0 md:overflow-hidden md:h-[calc(100vh-74px)]">

      {/* ── Game viewport ─────────────────────────────────────────────────────── */}
      <div
        ref={viewportRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={() => phase === "running" && handleMove()}
        className="relative flex-1 overflow-hidden select-none min-h-[340px] md:min-h-0"
        style={{ background: "linear-gradient(180deg,#161527,#0d0c18)", cursor: phase === "running" ? "pointer" : "default" }}
      >
        {/* Top HUD */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 pointer-events-none">
          <div className="px-3 py-1.5 rounded-lg text-sm font-bold tabular-nums" style={{ background: "rgba(20,18,40,0.9)", border: "1px solid rgba(139,92,246,0.3)", color: "#c4b5fd" }}>
            {fmtMult(multiplier)}
          </div>
          {phase === "running" && (
            <div className="px-3 py-1.5 rounded-lg text-sm font-bold tabular-nums" style={{ background: "rgba(20,18,40,0.9)", border: "1px solid rgba(34,197,94,0.3)", color: "#86efac" }}>
              ₹{(session ? session.betAmount * multiplier : 0).toFixed(2)}
            </div>
          )}
        </div>

        {/* Fairness button */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowFair(true); }}
          className="absolute top-3 right-3 z-30 px-2.5 py-1.5 rounded-lg text-xs font-bold text-white/60 hover:text-white transition flex items-center gap-1.5"
          style={{ background: "rgba(20,18,40,0.9)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <Shield size={12} /> Fair
        </button>

        {/* Scrolling track */}
        <motion.div
          className="absolute top-0 bottom-0 left-0"
          animate={{ x: cameraX }}
          transition={{ type: "spring", stiffness: 220, damping: 28 }}
          style={{ width: SIDEWALK_W + lanes * laneW + laneW }}
        >
          {/* Start sidewalk */}
          <div className="absolute top-0 bottom-0 left-0" style={{ width: SIDEWALK_W }}>
            <div className="absolute inset-0" style={{ background: "linear-gradient(90deg,#2f9e5e,#3cb371)" }} />
            <div className="absolute top-0 bottom-0 right-0" style={{ width: SIDEWALK_W * 0.46, background: "repeating-linear-gradient(180deg,#d7d3e4,#d7d3e4 26px,#c8c3da 26px,#c8c3da 52px)" }} />
            {/* decorative bushes */}
            {[0.08, 0.42, 0.78].map((t, i) => (
              <div key={i} className="absolute rounded-full" style={{
                left: 6, top: `${t * 100}%`, width: SIDEWALK_W * 0.4, height: SIDEWALK_W * 0.4,
                background: "radial-gradient(circle at 40% 35%,#34d27a,#1f7a47)", boxShadow: "0 3px 6px rgba(0,0,0,0.35)",
              }} />
            ))}
            {/* fire hydrant */}
            <div className="absolute" style={{ right: 8, bottom: "10%", width: 14, height: 26, borderRadius: 5, background: "linear-gradient(180deg,#ef4444,#b91c1c)", boxShadow: "0 2px 4px rgba(0,0,0,0.4)" }} />
          </div>

          {/* Lanes */}
          {Array.from({ length: lanes }, (_, i) => {
            const left = SIDEWALK_W + i * laneW;
            const reached = i < currentLane;       // already crossed
            const isNext = i === currentLane && phase === "running";
            const laneMult = multTable[i] ?? 1;
            const showVehicle = phase !== "idle" && i >= currentLane && i !== crashLane;
            return (
              <div key={i} className="absolute top-0 bottom-0" style={{ left, width: laneW }}>
                {/* asphalt */}
                <div className="absolute inset-0" style={{ background: reached ? "linear-gradient(180deg,#3a3357,#2b2747)" : "linear-gradient(180deg,#2a2742,#211e38)" }} />
                {/* left lane divider (dashed) */}
                <div className="absolute top-0 bottom-0 left-0" style={{ width: 4, background: "repeating-linear-gradient(180deg,rgba(255,255,255,0.85),rgba(255,255,255,0.85) 22px,transparent 22px,transparent 44px)" }} />

                {/* manhole / multiplier coin */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
                  style={{ width: laneW * 0.46, height: laneW * 0.46 }}>
                  <motion.div
                    animate={isNext ? { scale: [1, 1.08, 1], boxShadow: ["0 0 0px rgba(250,204,21,0)", "0 0 18px rgba(250,204,21,0.7)", "0 0 0px rgba(250,204,21,0)"] } : {}}
                    transition={isNext ? { duration: 1.4, repeat: Infinity } : {}}
                    className="w-full h-full rounded-full flex items-center justify-center"
                    style={{
                      background: reached
                        ? "radial-gradient(circle at 40% 35%,#22c55e,#15803d)"
                        : isNext
                        ? "radial-gradient(circle at 40% 35%,#fbbf24,#d97706)"
                        : "radial-gradient(circle at 40% 35%,#4b4668,#322d4e)",
                      border: `2px solid ${reached ? "#16a34a" : isNext ? "#f59e0b" : "rgba(255,255,255,0.12)"}`,
                    }}
                  >
                    <span className="font-black tabular-nums text-center leading-none px-1"
                      style={{
                        fontSize: `clamp(9px, ${laneW * 0.085}px, 15px)`,
                        color: reached || isNext ? "#0a0b16" : "rgba(220,215,245,0.7)",
                      }}>
                      {fmtMult(laneMult)}
                    </span>
                  </motion.div>
                </div>

                {/* ambient vehicle */}
                {showVehicle && (
                  <AmbientVehicle laneIndex={i} laneW={laneW} boardH={boardH} difficulty={session?.difficulty ?? difficulty} />
                )}
              </div>
            );
          })}

          {/* Finish sidewalk */}
          <div className="absolute top-0 bottom-0" style={{ left: SIDEWALK_W + lanes * laneW, width: laneW }}>
            <div className="absolute inset-0" style={{ background: "linear-gradient(90deg,#3cb371,#2f9e5e)" }} />
            <div className="absolute top-0 bottom-0 left-0" style={{ width: laneW * 0.4, background: "repeating-linear-gradient(180deg,#d7d3e4,#d7d3e4 26px,#c8c3da 26px,#c8c3da 52px)" }} />
          </div>

          {/* Chicken */}
          <motion.div
            className="absolute z-20 flex items-end justify-center"
            style={{ width: laneW, top: 0, bottom: 0 }}
            animate={{ left: SIDEWALK_W + currentLane * laneW - laneW / 2 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
          >
            <motion.div
              animate={
                phase === "crashed"
                  ? { scale: 0.5, rotate: 90, opacity: 0.35, y: 0 }
                  : loading
                  ? { y: [0, -boardH * 0.06, 0] }
                  : { y: 0 }
              }
              transition={phase === "crashed" ? { duration: 0.3 } : { duration: 0.3, repeat: loading ? Infinity : 0 }}
              style={{ marginBottom: boardH * 0.42 }}
            >
              <Chicken size={chickenSize} />
            </motion.div>
          </motion.div>

          {/* Crash burst */}
          <AnimatePresence>
            {phase === "crashed" && crashLane !== null && (
              <CrashBurst laneIndex={crashLane} laneW={laneW} boardH={boardH} />
            )}
          </AnimatePresence>
        </motion.div>

        {/* Result overlay */}
        <AnimatePresence>
          {isOver && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              onClick={(e) => { e.stopPropagation(); handleReset(); }}
              className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur cursor-pointer"
            >
              <div className={`w-60 md:w-72 text-center p-6 rounded-2xl shadow-2xl border-2 ${
                phase === "cashed"
                  ? "bg-[#0f1226]/90 border-green-500 text-green-400 shadow-[0_0_20px_rgba(34,197,94,0.3)]"
                  : "bg-[#0f1226]/90 border-red-500 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.3)]"
              }`}>
                <div className="text-xl font-bold uppercase tracking-wider mb-2">
                  {phase === "cashed" ? "Cashed Out!" : "Splat!"}
                </div>
                {phase === "cashed" && (
                  <>
                    <div className="text-3xl font-black text-white">
                      ₹{cashoutAmt?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-sm text-green-400/80 mt-1 font-bold">{fmtMult(multiplier)}</div>
                  </>
                )}
                {phase === "crashed" && (
                  <div className="text-sm text-red-300/80 mt-1">The chicken got hit. Bet lost.</div>
                )}
                <div className="text-[10px] text-gray-500 mt-3 uppercase tracking-widest font-semibold">Tap to Play Again</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Bottom control panel ──────────────────────────────────────────────── */}
      <div className="shrink-0 px-3 md:px-6 pt-3 pb-4 md:py-4" style={{ background: "#0f0d1e", borderTop: "1px solid rgba(99,60,180,0.25)" }}>
        <div className="w-full max-w-5xl mx-auto flex flex-col md:flex-row md:items-stretch gap-4 md:gap-0">

          {/* Bet Amount */}
          <div className="md:w-64 shrink-0 md:pr-6">
            <label className="text-xs text-white/50 mb-1.5 flex items-center gap-1 font-semibold">
              Bet Amount <span className="text-white/30">↓</span>
            </label>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center rounded-xl px-3 py-2.5 bg-black/30 border border-white/10">
                <span className="text-white/40 text-sm mr-1 shrink-0">₹</span>
                <input type="number" value={betAmount}
                  onChange={e => setBetAmount(Math.max(10, parseInt(e.target.value) || 10))}
                  disabled={phase === "running"}
                  className="bg-transparent flex-1 min-w-0 text-sm font-semibold text-white outline-none disabled:opacity-60" />
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <button onClick={() => adjustBet(0.5)} disabled={phase === "running"}
                  className="py-2 rounded-xl text-xs font-bold bg-white/[0.07] hover:bg-white/[0.13] transition text-white/70 disabled:opacity-40">1/2</button>
                <button onClick={() => adjustBet(2)} disabled={phase === "running"}
                  className="py-2 rounded-xl text-xs font-bold bg-white/[0.07] hover:bg-white/[0.13] transition text-white/70 disabled:opacity-40">2X</button>
                <button onClick={() => quickBet(Math.floor(liveBalance ?? betAmount))} disabled={phase === "running"}
                  className="py-2 rounded-xl text-xs font-bold bg-white/[0.07] hover:bg-white/[0.13] transition text-white/70 disabled:opacity-40">Max</button>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="hidden md:block w-px self-stretch" style={{ background: "rgba(99,60,180,0.25)" }} />

          {/* Difficulty */}
          <div className="flex-1 md:px-6 flex flex-col">
            <label className="text-xs text-white/50 mb-1.5 flex items-center gap-1 font-semibold">Difficulty</label>
            <div className="grid grid-cols-4 gap-1.5 flex-1">
              {(["EASY", "MEDIUM", "HARD", "DAREDEVIL"] as Difficulty[]).map(d => (
                <button key={d}
                  onClick={() => { if (phase !== "running") setDifficulty(d); }}
                  disabled={phase === "running"}
                  className="py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                  style={{
                    background: difficulty === d ? `${DIFF_CONFIG[d].color}22` : "rgba(255,255,255,0.04)",
                    border: `1px solid ${difficulty === d ? DIFF_CONFIG[d].color : "rgba(255,255,255,0.08)"}`,
                    color: difficulty === d ? DIFF_CONFIG[d].color : "rgba(255,255,255,0.45)",
                  }}>
                  {DIFF_CONFIG[d].label}
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="hidden md:block w-px self-stretch" style={{ background: "rgba(99,60,180,0.25)" }} />

          {/* Action button */}
          <div className="md:w-64 shrink-0 md:pl-6 flex flex-col justify-end gap-2">
            {phase === "running" ? (
              <motion.button onClick={handleCashout} whileTap={{ scale: 0.97 }}
                disabled={loading || currentLane === 0}
                className="w-full py-3.5 rounded-xl font-bold text-sm uppercase tracking-widest text-white transition disabled:opacity-40"
                style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", boxShadow: "0 4px 15px rgba(245,158,11,0.3)" }}>
                {loading ? "…" : `Cash Out ₹${(session ? session.betAmount * multiplier : 0).toFixed(2)}`}
              </motion.button>
            ) : (
              <motion.button onClick={isOver ? handleReset : handleStart} whileTap={{ scale: 0.97 }}
                disabled={loading}
                className="w-full py-3.5 rounded-xl font-bold text-sm uppercase tracking-widest text-[#0a0b16] transition disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)", boxShadow: "0 4px 15px rgba(251,191,36,0.35)" }}>
                {loading ? "Starting…" : isOver ? "Play Again" : "Start Game"}
              </motion.button>
            )}
            <div className="text-[11px] text-center py-1.5 px-3 rounded-lg font-medium"
              style={{ background: "rgba(139,92,246,0.12)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.2)" }}>
              Betting less than ₹0.01 will enter demo mode
            </div>
          </div>
        </div>
      </div>

      {/* Error toast */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4">
            <div className="bg-red-900/90 border border-red-500/50 backdrop-blur px-4 py-3 rounded-lg text-sm font-semibold text-red-200">
              {error}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFair && <ProvablyFairModal session={session} onClose={() => setShowFair(false)} />}
      </AnimatePresence>
    </div>
  );
}

// ─── Ambient vehicle loop ───────────────────────────────────────────────────────

function AmbientVehicle({ laneIndex, laneW, boardH, difficulty }: {
  laneIndex: number; laneW: number; boardH: number; difficulty: Difficulty;
}) {
  // Deterministic-ish per-lane variety so vehicles don't all sync up.
  const seed = (laneIndex * 9301 + 49297) % 233280;
  const rnd = seed / 233280;
  const color = VEHICLE_COLORS[laneIndex % VEHICLE_COLORS.length]!;
  const kindRoll = (laneIndex * 7) % 3;
  const length = kindRoll === 0 ? laneW * 0.86 : kindRoll === 1 ? laneW * 1.25 : laneW * 1.55;
  const speedFactor = { EASY: 1.9, MEDIUM: 1.45, HARD: 1.05, DAREDEVIL: 0.75 }[difficulty];
  const duration = (2.2 + rnd * 1.6) * speedFactor;
  const delay = -rnd * duration;

  return (
    <motion.div
      className="absolute left-1/2 -translate-x-1/2"
      initial={{ y: -length - 20 }}
      animate={{ y: boardH + length + 20 }}
      transition={{ duration, repeat: Infinity, ease: "linear", delay }}
    >
      <Vehicle w={laneW} color={color} length={length} />
    </motion.div>
  );
}

// ─── Crash burst ─────────────────────────────────────────────────────────────

function CrashBurst({ laneIndex, laneW, boardH }: { laneIndex: number; laneW: number; boardH: number }) {
  const cx = SIDEWALK_W + laneIndex * laneW + laneW / 2;
  const cy = boardH * 0.5;
  const sparks = Array.from({ length: 14 }, (_, i) => ({ a: (i / 14) * 360, d: 40 + Math.random() * 50, id: i }));
  return (
    <>
      {/* slamming vehicle */}
      <motion.div
        className="absolute z-30"
        style={{ left: cx - laneW * 0.28, top: 0 }}
        initial={{ y: -laneW }}
        animate={{ y: cy - laneW * 0.4 }}
        transition={{ duration: 0.22, ease: "easeIn" }}
      >
        <Vehicle w={laneW} color="#dc2626" length={laneW * 1.2} />
      </motion.div>
      {/* feather/spark burst */}
      {sparks.map(s => (
        <motion.div key={s.id}
          className="absolute z-30 rounded-full"
          style={{ left: cx, top: cy, width: 7, height: 7, background: s.id % 2 ? "#fbbf24" : "#fee2e2", boxShadow: "0 0 6px rgba(251,191,36,0.7)" }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: Math.cos(s.a * Math.PI / 180) * s.d, y: Math.sin(s.a * Math.PI / 180) * s.d, opacity: 0, scale: 0 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.12 }}
        />
      ))}
    </>
  );
}
