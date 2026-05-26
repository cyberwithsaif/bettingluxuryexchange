"use client";

import { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from "react";
import { motion, AnimatePresence, useAnimationControls } from "framer-motion";
import { useAuthStore } from "@/lib/stores/auth";
import { getSocket } from "@/lib/socket";
import { api } from "@/lib/api";
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
  const s = size / 120;
  const p = (n: number) => n * s;
  const featherBorder = `${p(2)}px solid #d5daf5`;
  return (
    <div style={{ position: "relative", width: p(120), height: p(120) }}>
      {/* shadow */}
      <div style={{ position: "absolute", width: p(70), height: p(14), background: "rgba(0,0,0,.18)", borderRadius: "50%", bottom: p(-8), left: p(24), filter: `blur(${p(3)}px)` }} />
      {/* tail */}
      <div style={{ position: "absolute", left: p(6), top: p(44) }}>
        <span style={{ position: "absolute", width: p(20), height: p(10), background: "#eef1ff", border: featherBorder, borderRadius: "50%", transform: "rotate(-35deg)" }} />
        <span style={{ position: "absolute", top: p(10), left: p(2), width: p(20), height: p(10), background: "#eef1ff", border: featherBorder, borderRadius: "50%", transform: "rotate(-10deg)" }} />
        <span style={{ position: "absolute", top: p(20), left: p(4), width: p(20), height: p(10), background: "#eef1ff", border: featherBorder, borderRadius: "50%", transform: "rotate(15deg)" }} />
      </div>
      {/* body */}
      <div style={{ position: "absolute", width: p(92), height: p(78), background: "#f8f8ff", borderRadius: "45% 45% 40% 40%", left: p(14), top: p(22), transform: "rotate(-8deg)", border: `${p(4)}px solid #c7cce7`, boxShadow: `inset 0 ${p(-8)}px 0 rgba(0,0,0,.04), 0 ${p(8)}px ${p(15)}px rgba(0,0,0,.2)` }} />
      {/* wing */}
      <div style={{ position: "absolute", width: p(36), height: p(28), borderRadius: "50%", background: "#eef0ff", left: p(28), top: p(48), transform: "rotate(-20deg)", border: `${p(3)}px solid #d7dbf4` }}>
        <div style={{ position: "absolute", width: p(14), height: p(8), left: p(8), top: p(7), borderRadius: "50%", border: `${p(2)}px solid #d7dbf4` }} />
        <div style={{ position: "absolute", width: p(18), height: p(10), left: p(4), top: p(12), borderRadius: "50%", border: `${p(2)}px solid #d7dbf4` }} />
      </div>
      {/* head */}
      <div style={{ position: "absolute", width: p(58), height: p(54), background: "#fff", borderRadius: "50%", top: p(10), left: p(46), border: `${p(4)}px solid #d6dbf6` }}>
        {/* comb */}
        <div style={{ position: "absolute", top: p(-10), left: p(16), display: "flex", gap: p(2) }}>
          <span style={{ width: p(10), height: p(16), background: "#ff5b5b", borderRadius: "50%", transform: "rotate(-25deg)", border: `${p(2)}px solid #e04040` }} />
          <span style={{ width: p(10), height: p(18), background: "#ff5b5b", borderRadius: "50%", transform: "rotate(-25deg)", border: `${p(2)}px solid #e04040` }} />
        </div>
        {/* eyes */}
        <div style={{ position: "absolute", width: p(7), height: p(7), background: "#1f2758", borderRadius: "50%", top: p(24), left: p(14) }} />
        <div style={{ position: "absolute", width: p(7), height: p(7), background: "#1f2758", borderRadius: "50%", top: p(24), right: p(14) }} />
        {/* beak */}
        <div style={{ position: "absolute", width: p(16), height: p(12), background: "#f5a623", top: p(28), left: p(20), clipPath: "polygon(0 50%,100% 0,100% 100%)" }} />
      </div>
      {/* legs */}
      <div style={{ position: "absolute", width: p(8), height: p(18), background: "#f5a623", bottom: p(6), left: p(38), borderRadius: p(10) }}>
        <div style={{ position: "absolute", width: p(16), height: p(6), background: "#e89612", bottom: p(-2), left: p(-4), borderRadius: p(10) }} />
      </div>
      <div style={{ position: "absolute", width: p(8), height: p(18), background: "#f5a623", bottom: p(6), right: p(30), borderRadius: p(10) }}>
        <div style={{ position: "absolute", width: p(16), height: p(6), background: "#e89612", bottom: p(-2), right: p(-4), borderRadius: p(10) }} />
      </div>
    </div>
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
  const [nextCoinReady, setNextCoinReady] = useState(false);

  const sounds = useSounds(soundEnabled);

  // Responsive board geometry
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [laneW, setLaneW] = useState(150);
  const [boardH, setBoardH] = useState(420);
  const [containerW, setContainerW] = useState(375);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const mobile = w < 640;
      setContainerW(w);
      setLaneW(Math.max(mobile ? 150 : 112, Math.min(mobile ? 185 : 196, (w - SIDEWALK_W) / (mobile ? 1.7 : 3.2))));
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

  // Fetch the server's active session and restore it (position, multiplier, table).
  // Uses the shared api client so the JWT is attached and 401s auto-refresh.
  const restoreActiveSession = useCallback(async () => {
    try {
      const { data } = await api.get<Session | null>("/casino/chicken-road/active");
      if (!data) return false;
      setSession(data);
      setCrashLane(null);
      setCashoutAmt(null);
      setPhase("running");
      return true;
    } catch {
      return false;
    }
  }, []);

  // Restore an in-progress session on load
  useEffect(() => {
    if (!user) return;
    void restoreActiveSession();
  }, [user, restoreActiveSession]);

  // Socket wiring
  useEffect(() => {
    const s = socket.current;
    if (!s) return;

    const onStart = (data: { ok: boolean; session?: Session; message?: string }) => {
      setLoading(false);
      if (!data.ok || !data.session) {
        // An active game already exists server-side — restore it in place instead
        // of just erroring, so the player lands back on their live round.
        if (data.message && /active game/i.test(data.message)) {
          restoreActiveSession().then(ok => { if (!ok) showError(data.message ?? "Could not start"); });
          return;
        }
        showError(data.message ?? "Could not start");
        return;
      }
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

    const onError = (data: { message: string }) => {
      setLoading(false);
      // Server rejected start because a round is already live — restore it in place.
      if (data.message && /active game/i.test(data.message)) {
        restoreActiveSession().then(ok => { if (!ok) showError(data.message); });
        return;
      }
      showError(data.message);
    };
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
  }, [sounds, restoreActiveSession]);

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

  // Keyboard controls (advance with arrow / space — desktop convenience)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === " ") { e.preventDefault(); handleMove(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleMove]);

  // The next coin is locked for 1s after the chicken arrives on a new lane, so the
  // player can't spam-advance. It becomes clickable once the timer elapses.
  useEffect(() => {
    if (phase !== "running") { setNextCoinReady(false); return; }
    setNextCoinReady(false);
    const t = setTimeout(() => setNextCoinReady(true), 1000);
    return () => clearTimeout(t);
  }, [currentLane, phase]);

  // Chicken geometry. At the start (lane 0) it stands on the sidewalk edge; once
  // moving it sits in the CENTER of the lane cell it just entered (between the two
  // dashed dividers), not on top of a divider line.
  const isMobile = containerW < 640;
  const chickenShift = currentLane === 0 ? 0 : -laneW / 2;
  const chickenCenterTrack = SIDEWALK_W + currentLane * laneW + chickenShift;

  // Camera: on mobile anchor the chicken near the middle (zoomed feel); on desktop
  // keep ~2 crossed lanes visible behind it. Clamped so the start sidewalk never
  // detaches from the left edge.
  const anchorX = isMobile ? containerW * 0.42 : SIDEWALK_W + 2 * laneW;
  const cameraX = Math.min(0, anchorX - chickenCenterTrack);
  const chickenSize = Math.min(laneW * (isMobile ? 0.42 : 0.46), isMobile ? 76 : 74);
  const coinSize = Math.round(laneW * (isMobile ? 0.52 : 0.42));
  const isOver = phase === "crashed" || phase === "cashed";

  // Draggable camera: track follows the chicken automatically, but the player can
  // also drag the board horizontally to look around.
  const trackWidth = SIDEWALK_W + lanes * laneW + laneW;
  const trackControls = useAnimationControls();
  const draggingRef = useRef(false);
  useEffect(() => {
    trackControls.start({ x: cameraX, transition: { type: "spring", stiffness: 220, damping: 28 } });
  }, [cameraX, trackControls]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bg-[#0a0b16] text-white flex flex-col font-sans w-full min-h-full md:min-h-0 md:overflow-hidden md:h-[calc(100vh-74px)] p-2 md:p-3">

      {/* ── Card wrapper ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-none md:flex-1 min-h-0 rounded-2xl overflow-hidden"
        style={{ border: "1px solid rgba(139,92,246,0.18)", boxShadow: "0 0 0 1px rgba(0,0,0,0.4), 0 24px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)" }}>

      {/* ── Game viewport ─────────────────────────────────────────────────────── */}
      <div
        ref={viewportRef}
        className="relative h-[46vh] flex-none md:flex-1 md:h-auto overflow-hidden select-none"
        style={{ background: "#313463" }}
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

        {/* Scrolling track (auto-follows the chicken; also drag to pan) */}
        <motion.div
          className="absolute top-0 bottom-0 left-0 cursor-grab active:cursor-grabbing"
          animate={trackControls}
          drag="x"
          dragConstraints={{ left: Math.min(0, containerW - trackWidth), right: 0 }}
          dragElastic={0.06}
          onDragStart={() => { draggingRef.current = true; }}
          onDragEnd={() => { setTimeout(() => { draggingRef.current = false; }, 60); }}
          style={{ width: trackWidth }}
        >
          {/* Start sidewalk */}
          <div className="absolute top-0 bottom-0 left-0" style={{ width: SIDEWALK_W }}>
            <div className="absolute inset-0" style={{ background: "linear-gradient(90deg,#2f9e5e,#3cb371)" }} />
            <div className="absolute top-0 bottom-0 right-0" style={{ width: SIDEWALK_W * 0.46, background: "repeating-linear-gradient(180deg,#d7d3e4,#d7d3e4 26px,#c8c3da 26px,#c8c3da 52px)" }} />

            {/* decorative trees */}
            {[{ t: 0.08, l: 8 }, { t: 0.42, l: 6 }, { t: 0.75, l: 10 }].map((tree, i) => (
              <div key={i} className="absolute" style={{ left: tree.l, top: `${tree.t * 100}%`, width: SIDEWALK_W * 0.6, height: SIDEWALK_W * 0.7 }}>
                {/* trunk */}
                <div className="absolute" style={{
                  left: "50%", bottom: 0, transform: "translateX(-50%)",
                  width: SIDEWALK_W * 0.12, height: SIDEWALK_W * 0.28,
                  background: "linear-gradient(90deg,#5d3a1a,#8b5a2b,#5d3a1a)", borderRadius: "2px",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.5)",
                }} />
                {/* canopy - bottom */}
                <div style={{
                  position: "absolute", left: "50%", bottom: `${SIDEWALK_W * 0.24}px`, transform: "translateX(-50%)",
                  width: 0, height: 0,
                  borderLeft: `${SIDEWALK_W * 0.24}px solid transparent`,
                  borderRight: `${SIDEWALK_W * 0.24}px solid transparent`,
                  borderBottom: `${SIDEWALK_W * 0.32}px solid #1aa569`,
                  filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))",
                }} />
                {/* canopy - middle */}
                <div style={{
                  position: "absolute", left: "50%", bottom: `${SIDEWALK_W * 0.38}px`, transform: "translateX(-50%)",
                  width: 0, height: 0,
                  borderLeft: `${SIDEWALK_W * 0.2}px solid transparent`,
                  borderRight: `${SIDEWALK_W * 0.2}px solid transparent`,
                  borderBottom: `${SIDEWALK_W * 0.26}px solid #0f9352`,
                  filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))",
                }} />
                {/* canopy - top */}
                <div style={{
                  position: "absolute", left: "50%", bottom: `${SIDEWALK_W * 0.5}px`, transform: "translateX(-50%)",
                  width: 0, height: 0,
                  borderLeft: `${SIDEWALK_W * 0.14}px solid transparent`,
                  borderRight: `${SIDEWALK_W * 0.14}px solid transparent`,
                  borderBottom: `${SIDEWALK_W * 0.2}px solid #0d7a44`,
                  filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.4))",
                }} />
              </div>
            ))}

            {/* rocks area */}
            <div className="absolute" style={{ top: `${boardH * 0.35}px`, left: 0, width: SIDEWALK_W + 12, display: "flex", flexWrap: "wrap", gap: "4px", padding: "4px" }}>
              {[
                { w: 32, h: 24, r: 8 },
                { w: 28, h: 22, r: -6 },
                { w: 24, h: 18, r: 10 },
                { w: 36, h: 26, r: -2 },
                { w: 26, h: 20, r: 5 },
                { w: 30, h: 22, r: -8 },
              ].map((rock, i) => (
                <div key={i} className="absolute" style={{
                  width: rock.w, height: rock.h, left: (i % 3) * 36 + 4, top: `${boardH * 0.35 + Math.floor(i / 3) * 28}px`,
                  background: "#9ba5ad", border: "3px solid #6b7682", borderRadius: "10px",
                  transform: `rotate(${rock.r}deg)`, boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
                }}>
                  <div style={{ position: "absolute", width: "5px", height: "5px", left: "8px", top: "6px", background: "#7a8692", borderRadius: "50%" }} />
                  <div style={{ position: "absolute", width: "4px", height: "4px", right: "10px", bottom: "8px", background: "#7a8692", borderRadius: "50%" }} />
                </div>
              ))}
            </div>

            {/* fire hydrant */}
            <div className="absolute" style={{ right: 8, bottom: "10%", width: 14, height: 26, borderRadius: 5, background: "linear-gradient(180deg,#ef4444,#b91c1c)", boxShadow: "0 2px 4px rgba(0,0,0,0.4)" }} />
          </div>

          {/* Lanes */}
          {Array.from({ length: lanes }, (_, i) => {
            const left = SIDEWALK_W + i * laneW;
            const reached = i < currentLane;       // already crossed
            const isNext = i === currentLane && phase === "running";
            const underChicken = reached && i === currentLane - 1; // chicken currently stands here
            const laneMult = multTable[i] ?? 1;
            const showVehicle = phase !== "idle" && i >= currentLane && i !== crashLane;
            return (
              <div key={i} className="absolute top-0 bottom-0" style={{ left, width: laneW }}>
                {/* asphalt */}
                <div className="absolute inset-0" style={{ background: reached ? "#3a3d70" : "#313463" }} />
                {/* left lane divider (dashed) */}
                <div className="absolute top-0 bottom-0 left-0" style={{ width: 4, background: "repeating-linear-gradient(180deg,rgba(255,255,255,0.85),rgba(255,255,255,0.85) 22px,transparent 22px,transparent 44px)" }} />

                {/* multiplier coin — only on lanes not yet crossed. The NEXT coin is
                    the only way to advance: tap it (after the 1s lock) to move. */}
                {!reached && (
                <div
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
                  style={{ width: coinSize, height: coinSize, zIndex: isNext ? 25 : 1, cursor: isNext && nextCoinReady ? "pointer" : "default" }}
                  onClick={isNext ? (e) => {
                    e.stopPropagation();
                    if (draggingRef.current || !nextCoinReady) return;
                    handleMove();
                  } : undefined}
                >
                  <motion.div
                    animate={isNext && nextCoinReady ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                    transition={isNext && nextCoinReady ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
                    className="w-full h-full"
                    style={{ opacity: isNext && !nextCoinReady ? 0.45 : 1 }}
                  >
                    <Coin size={coinSize} variant={isNext ? "next" : "future"} label={fmtMult(laneMult)} />
                  </motion.div>
                </div>
                )}

                {/* stone barrier — fixed on each arrived lane, fades in 0.5s after crossing */}
                {reached && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.6, y: -8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ delay: 0.5, type: "spring", stiffness: 320, damping: 20 }}
                    className="absolute inset-x-0 flex justify-center"
                    style={{ top: boardH / 2 - chickenSize / 2 - (Math.min(laneW * 0.46, 96) * 58 / 95) - 4 }}
                  >
                    <StoneObstacle width={Math.min(laneW * 0.46, 96)} />
                  </motion.div>
                )}

                {/* collected coin with logo on crossed lanes */}
                {reached && !underChicken && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5, type: "spring", stiffness: 320, damping: 20 }}
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                    style={{ width: coinSize * 1.35, height: coinSize * 1.35 }}
                  >
                    <Coin size={coinSize * 1.35} variant="collected" label="" logoSrc="/logo.png" />
                  </motion.div>
                )}

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
            className="absolute z-20 flex flex-col items-center justify-center gap-2"
            style={{ width: laneW, top: 0, bottom: 0 }}
            animate={{ left: chickenCenterTrack - laneW / 2 }}
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
            >
              <Chicken size={chickenSize} />
            </motion.div>
            {(phase === "running" || phase === "crashed" || phase === "cashed") && (
              <motion.div
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                className="px-2.5 py-1 rounded-lg text-xs font-black tabular-nums"
                style={{
                  background: phase === "crashed" ? "rgba(239,68,68,0.9)" : "rgba(10,11,22,0.92)",
                  border: `1px solid ${phase === "crashed" ? "rgba(239,68,68,0.5)" : "rgba(139,92,246,0.5)"}`,
                  color: phase === "crashed" ? "#fff" : "#c4b5fd",
                  backdropFilter: "blur(4px)",
                }}>
                {fmtMult(multiplier)}
              </motion.div>
            )}
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
      <div className="shrink-0" style={{ background: "#13112a", borderTop: "1px solid rgba(139,92,246,0.15)" }}>

        {/* ── Mobile layout ── */}
        <div className="md:hidden px-3 pt-3 pb-4 flex flex-col gap-2">

          {/* Row 1: Bet Amount */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-white/50 shrink-0 w-20">Bet Amount</span>
            <div className="flex items-center rounded-xl px-2.5 py-2 bg-[#0c0a20] border border-white/[0.08] flex-1 min-w-0">
              <span className="text-white/40 text-sm mr-1 shrink-0">₹</span>
              <input type="number" value={betAmount}
                onChange={e => setBetAmount(Math.max(10, parseInt(e.target.value) || 10))}
                disabled={phase === "running"}
                className="bg-transparent flex-1 min-w-0 text-sm font-bold text-white outline-none disabled:opacity-60" />
            </div>
            {([["1/2", () => adjustBet(0.5)], ["2X", () => adjustBet(2)], ["Max", () => quickBet(Math.floor(liveBalance ?? betAmount))]] as [string, () => void][]).map(([label, fn]) => (
              <button key={label} onClick={fn} disabled={phase === "running"}
                className="px-2.5 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 shrink-0"
                style={{ background: "#1e1b3a", border: "1px solid rgba(139,92,246,0.2)", color: "rgba(255,255,255,0.7)" }}>
                {label}
              </button>
            ))}
          </div>

          {/* Row 2: Difficulty */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-white/50 shrink-0 w-20">Difficulty</span>
            {(["EASY", "MEDIUM", "HARD", "DAREDEVIL"] as Difficulty[]).map(d => (
              <button key={d}
                onClick={() => { if (phase !== "running") setDifficulty(d); }}
                disabled={phase === "running"}
                className="flex-1 py-2 rounded-xl text-[11px] font-bold transition-all disabled:opacity-50"
                style={{
                  background: difficulty === d ? `${DIFF_CONFIG[d].color}1a` : "#1e1b3a",
                  border: `1px solid ${difficulty === d ? DIFF_CONFIG[d].color : "rgba(139,92,246,0.15)"}`,
                  color: difficulty === d ? DIFF_CONFIG[d].color : "rgba(255,255,255,0.5)",
                }}>
                {DIFF_CONFIG[d].label}
              </button>
            ))}
          </div>

          {/* Row 3: Action */}
          {phase === "running" ? (
            <motion.button onClick={handleCashout} whileTap={{ scale: 0.97 }}
              disabled={loading || currentLane === 0}
              className="w-full py-3 rounded-xl font-bold text-sm uppercase tracking-widest text-white transition disabled:opacity-40"
              style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", boxShadow: "0 4px 12px rgba(245,158,11,0.3)" }}>
              {loading ? "…" : `Cash Out  ₹${(session ? session.betAmount * multiplier : 0).toFixed(2)}`}
            </motion.button>
          ) : (
            <motion.button onClick={isOver ? handleReset : handleStart} whileTap={{ scale: 0.97 }}
              disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-sm uppercase tracking-widest text-[#0a0b16] transition disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)", boxShadow: "0 4px 12px rgba(251,191,36,0.3)" }}>
              {loading ? "Starting…" : isOver ? "Play Again" : "Start Game"}
            </motion.button>
          )}
        </div>

        {/* ── Desktop layout ── */}
        <div className="hidden md:flex px-6 py-4 w-full max-w-6xl mx-auto gap-5">

          {/* Bet Amount */}
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            <label className="text-[11px] font-bold text-white/50 flex items-center gap-1">
              Bet Amount
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="opacity-60"><path d="M12 4v8m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </label>
            <div className="flex items-center gap-1.5">
              <div className="flex items-center rounded-xl px-3 py-2 bg-[#0c0a20] border border-white/[0.08]" style={{ minWidth: 120 }}>
                <span className="text-white/40 text-sm mr-1 shrink-0">₹</span>
                <input type="number" value={betAmount}
                  onChange={e => setBetAmount(Math.max(10, parseInt(e.target.value) || 10))}
                  disabled={phase === "running"}
                  className="bg-transparent flex-1 min-w-0 w-16 text-sm font-bold text-white outline-none disabled:opacity-60" />
              </div>
              {([["1/2", () => adjustBet(0.5)], ["2X", () => adjustBet(2)], ["Max", () => quickBet(Math.floor(liveBalance ?? betAmount))]] as [string, () => void][]).map(([label, fn]) => (
                <button key={label} onClick={fn} disabled={phase === "running"}
                  className="px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
                  style={{ background: "#1e1b3a", border: "1px solid rgba(139,92,246,0.2)", color: "rgba(255,255,255,0.65)" }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div className="flex flex-col gap-1.5 flex-1">
            <label className="text-[11px] font-bold text-white/50 flex items-center gap-1">
              Difficulty
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="opacity-60"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/><path d="M12 8v4m0 4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {(["EASY", "MEDIUM", "HARD", "DAREDEVIL"] as Difficulty[]).map(d => (
                <button key={d}
                  onClick={() => { if (phase !== "running") setDifficulty(d); }}
                  disabled={phase === "running"}
                  className="py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                  style={{
                    background: difficulty === d ? DIFF_CONFIG[d].color : "#1e1b3a",
                    border: `1px solid ${difficulty === d ? DIFF_CONFIG[d].color : "rgba(139,92,246,0.15)"}`,
                    color: difficulty === d ? "#fff" : "rgba(255,255,255,0.5)",
                  }}>
                  {DIFF_CONFIG[d].label}
                </button>
              ))}
            </div>
          </div>

          {/* Action */}
          <div className="flex flex-col gap-1.5 flex-shrink-0 w-56 justify-end">
            {phase === "running" ? (
              <motion.button onClick={handleCashout} whileTap={{ scale: 0.97 }}
                disabled={loading || currentLane === 0}
                className="w-full py-2.5 rounded-xl font-bold text-sm uppercase tracking-widest text-white transition disabled:opacity-40"
                style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", boxShadow: "0 4px 12px rgba(245,158,11,0.3)" }}>
                {loading ? "…" : `Cash Out ₹${(session ? session.betAmount * multiplier : 0).toFixed(2)}`}
              </motion.button>
            ) : (
              <motion.button onClick={isOver ? handleReset : handleStart} whileTap={{ scale: 0.97 }}
                disabled={loading}
                className="w-full py-2.5 rounded-xl font-bold text-sm uppercase tracking-widest text-[#0a0b16] transition disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)", boxShadow: "0 4px 12px rgba(251,191,36,0.3)" }}>
                {loading ? "Starting…" : isOver ? "Play Again" : "Start Game"}
              </motion.button>
            )}
          </div>

        </div>
      </div>

      {/* ── End card wrapper ── */}
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

// ─── Multiplier coin (textured manhole) ─────────────────────────────────────────

const COIN_PALETTE = {
  future:    { b1: "#474a8e", b2: "#2b2f67", b3: "#202552", ring1: "#4e5395", ring2: "#232858", sA: "#252a5c", sB: "#353b77", inner: "#1b1f48", text: "#aeb7ff", glow: "rgba(135,145,255,.4)" },
  next:      { b1: "#fcd34d", b2: "#f59e0b", b3: "#b45309", ring1: "#fde68a", ring2: "#92400e", sA: "#b45309", sB: "#f59e0b", inner: "#78350f", text: "#fffbeb", glow: "rgba(251,191,36,.55)" },
  collected: { b1: "#fcd34d", b2: "#f59e0b", b3: "#b45309", ring1: "#fde68a", ring2: "#92400e", sA: "#c2710c", sB: "#f59e0b", inner: "#78350f", text: "#fffbeb", glow: "rgba(251,191,36,.55)" },
} as const;

function Coin({ size, variant, label, logoSrc }: { size: number; variant: keyof typeof COIN_PALETTE; label: string; logoSrc?: string }) {
  const p = COIN_PALETTE[variant];
  const inner = size * 0.63;
  const stripe = Math.max(4, inner * 0.07);
  const fontSize = Math.max(9, Math.min(size * 0.155, 18));
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", position: "relative",
      background: `radial-gradient(circle at top left, ${p.b1} 0%, ${p.b2} 45%, ${p.b3} 100%)`,
      boxShadow: `inset 0 0 0 ${size * 0.028}px ${p.ring1}, inset 0 0 0 ${size * 0.07}px ${p.ring2}, 0 ${size * 0.07}px ${size * 0.14}px rgba(0,0,0,.35)`,
      display: "flex", justifyContent: "center", alignItems: "center",
    }}>
      <div style={{
        width: inner, height: inner, borderRadius: "50%", position: "relative",
        background: `repeating-linear-gradient(90deg, ${p.sA} 0px, ${p.sA} ${stripe}px, ${p.sB} ${stripe}px, ${p.sB} ${stripe * 2}px)`,
        boxShadow: `inset 0 0 0 ${size * 0.028}px ${p.inner}, inset 0 ${size * 0.07}px ${size * 0.1}px rgba(255,255,255,.05), inset 0 -${size * 0.07}px ${size * 0.1}px rgba(0,0,0,.35)`,
        display: "flex", justifyContent: "center", alignItems: "center", overflow: "hidden",
      }}>
        {logoSrc ? (
          <img src={logoSrc} alt="" draggable={false} style={{
            width: inner * 0.66, height: inner * 0.66, objectFit: "contain", position: "relative", zIndex: 2,
            filter: "drop-shadow(0 1px 2px rgba(0,0,0,.45))",
          }} />
        ) : (
          <span className="tabular-nums" style={{
            position: "relative", zIndex: 2, fontSize, fontWeight: 900, color: p.text,
            letterSpacing: "-0.5px", textShadow: `0 2px 0 ${p.inner}, 0 0 10px ${p.glow}`,
          }}>{label}</span>
        )}
      </div>
      <div style={{
        position: "absolute", top: size * 0.13, left: size * 0.17, width: size * 0.28, height: size * 0.1,
        borderRadius: "50%", background: "rgba(255,255,255,.1)", transform: "rotate(-20deg)", filter: "blur(2px)",
      }} />
    </div>
  );
}

// ─── Stone obstacle (shown above the chicken on an arrived lane) ─────────────────

function StoneObstacle({ width }: { width: number }) {
  const s = width / 95;
  const p = (n: number) => n * s;
  return (
    <div style={{ position: "relative", width: p(95), height: p(58) }}>
      {/* shadow */}
      <div style={{ position: "absolute", bottom: p(-4), left: p(18), width: p(58), height: p(10), background: "rgba(0,0,0,.35)", borderRadius: "50%", filter: `blur(${p(3)}px)` }} />
      {/* legs */}
      <div style={{ position: "absolute", bottom: p(-8), width: "100%", height: p(20) }}>
        <div style={{ position: "absolute", left: p(2), width: p(24), height: p(5), background: "#1d2152", borderRadius: p(20), transform: "rotate(25deg)" }}>
          <div style={{ position: "absolute", left: p(-5), top: p(-3), width: p(10), height: p(5), background: "#1d2152", borderRadius: p(20), transform: "rotate(-40deg)" }} />
        </div>
        <div style={{ position: "absolute", left: p(35), bottom: p(-3), width: p(24), height: p(5), background: "#1d2152", borderRadius: p(20), transform: "rotate(-5deg)" }}>
          <div style={{ position: "absolute", right: p(-6), top: p(2), width: p(10), height: p(5), background: "#1d2152", borderRadius: p(20), transform: "rotate(40deg)" }} />
        </div>
        <div style={{ position: "absolute", right: 0, width: p(24), height: p(5), background: "#1d2152", borderRadius: p(20), transform: "rotate(-25deg)" }}>
          <div style={{ position: "absolute", right: p(-5), top: p(-3), width: p(10), height: p(5), background: "#1d2152", borderRadius: p(20), transform: "rotate(40deg)" }} />
        </div>
      </div>
      {/* stone body */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: p(8),
        background: "linear-gradient(180deg,#8d8fb2 0%,#74789c 100%)",
        border: `${p(4)}px solid #30356e`,
        boxShadow: `inset 0 ${p(3)}px 0 rgba(255,255,255,.15), inset 0 ${p(-4)}px 0 rgba(0,0,0,.2), 0 ${p(6)}px ${p(10)}px rgba(0,0,0,.25)`,
      }}>
        <div style={{ position: "absolute", inset: p(12), display: "flex", justifyContent: "space-between" }}>
          {[18, 22, 16, 20, 14].map((lh, i) => (
            <div key={i} style={{ width: p(5), height: p(lh), borderRadius: p(10), background: "#62678f", boxShadow: `inset 0 ${p(2)}px 0 rgba(255,255,255,.15)` }} />
          ))}
        </div>
      </div>
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
