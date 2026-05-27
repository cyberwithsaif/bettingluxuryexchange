"use client";

import { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from "react";
import type { CSSProperties } from "react";
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

// Soft light-purple "glass" card used to group each control category.
const PURPLE_CARD: CSSProperties = {
  background: "linear-gradient(180deg, rgba(167,139,250,0.18), rgba(124,58,237,0.07))",
  border: "1px solid rgba(167,139,250,0.35)",
  borderRadius: 18,
  padding: "12px 16px",
  boxShadow: "0 8px 26px rgba(124,58,237,0.18), inset 0 1px 0 rgba(255,255,255,0.10)",
};

// ─── Vehicle (top-down) ─────────────────────────────────────────────────────────

const VEHICLE_COLORS = ["#7c3aed", "#ef4444", "#f59e0b", "#3b82f6", "#10b981", "#e5e7eb", "#ec4899"];

type VehicleKind = "car" | "bike";

function Vehicle({ w, color, length, kind = "car" }: { w: number; color: string; length: number; kind?: VehicleKind }) {
  if (kind === "bike") return <Bike w={w} color={color} length={length} />;

  // Small car — narrower body than before so it reads as a compact car.
  const bw = w * 0.42;
  const bh = length;
  return (
    <div style={{ width: bw, height: bh, position: "relative" }}>
      <div
        style={{
          position: "absolute", inset: 0, borderRadius: bw * 0.3,
          background: `linear-gradient(180deg, ${color}, ${shade(color, -18)})`,
          boxShadow: `0 ${bh * 0.06}px ${bh * 0.14}px rgba(0,0,0,0.45), inset 0 2px 2px rgba(255,255,255,0.25)`,
          border: "1px solid rgba(0,0,0,0.25)",
        }}
      />
      {/* windshield (front = bottom, vehicle drives downward) */}
      <div style={{
        position: "absolute", left: "16%", right: "16%", bottom: "14%", height: bh * 0.24,
        borderRadius: bw * 0.16, background: "linear-gradient(180deg,#bae6fd,#7dd3fc)",
        boxShadow: "inset 0 1px 2px rgba(255,255,255,0.6)",
      }} />
      {/* rear window */}
      <div style={{
        position: "absolute", left: "20%", right: "20%", top: "12%", height: bh * 0.18,
        borderRadius: bw * 0.12, background: "rgba(255,255,255,0.18)",
      }} />
      {/* headlights */}
      <div style={{ position: "absolute", bottom: 1, left: "14%", width: bw * 0.2, height: bw * 0.2, borderRadius: "50%", background: "#fde68a", boxShadow: "0 0 6px #fde047" }} />
      <div style={{ position: "absolute", bottom: 1, right: "14%", width: bw * 0.2, height: bw * 0.2, borderRadius: "50%", background: "#fde68a", boxShadow: "0 0 6px #fde047" }} />
      {/* taillights */}
      <div style={{ position: "absolute", top: 1, left: "16%", width: bw * 0.16, height: bw * 0.12, borderRadius: 2, background: "#dc2626" }} />
      <div style={{ position: "absolute", top: 1, right: "16%", width: bw * 0.16, height: bw * 0.12, borderRadius: 2, background: "#dc2626" }} />
    </div>
  );
}

// Top-down motorbike (drives downward; front = bottom).
function Bike({ w, color, length }: { w: number; color: string; length: number }) {
  const bw = w * 0.26;
  const bh = length;
  const wheelW = bw * 0.46;
  const wheelH = bh * 0.2;
  return (
    <div style={{ width: bw, height: bh, position: "relative" }}>
      {/* rear wheel (top) */}
      <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: wheelW, height: wheelH, background: "#1f2937", borderRadius: wheelW * 0.4 }} />
      {/* front wheel (bottom) */}
      <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: wheelW, height: wheelH, background: "#111827", borderRadius: wheelW * 0.4, boxShadow: "0 1px 2px rgba(0,0,0,0.5)" }} />
      {/* frame / fuel tank */}
      <div style={{
        position: "absolute", top: "16%", bottom: "16%", left: "50%", transform: "translateX(-50%)", width: bw * 0.6,
        background: `linear-gradient(180deg, ${color}, ${shade(color, -18)})`, borderRadius: bw * 0.4,
        boxShadow: "0 1px 3px rgba(0,0,0,0.45), inset 0 1px 1px rgba(255,255,255,0.3)",
      }} />
      {/* handlebars (front) */}
      <div style={{ position: "absolute", bottom: "24%", left: "50%", transform: "translateX(-50%)", width: bw, height: Math.max(2, bh * 0.035), background: "#374151", borderRadius: 2 }} />
      {/* rider shoulders */}
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translateX(-50%)", width: bw * 0.82, height: bh * 0.14, borderRadius: bw * 0.4, background: "#3f3f5e" }} />
      {/* rider helmet */}
      <div style={{ position: "absolute", top: "40%", left: "50%", transform: "translate(-50%,-50%)", width: bw * 0.52, height: bw * 0.52, borderRadius: "50%", background: "#0f172a", border: "1px solid rgba(255,255,255,0.25)" }} />
      {/* headlight (front) */}
      <div style={{ position: "absolute", bottom: 1, left: "50%", transform: "translateX(-50%)", width: bw * 0.32, height: bw * 0.32, borderRadius: "50%", background: "#fde68a", boxShadow: "0 0 6px #fde047" }} />
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

function Chicken({ size, dead = false }: { size: number; dead?: boolean }) {
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
        {/* eyes — X marks when dead, dots when alive */}
        {dead ? (
          <>
            <div style={{ position: "absolute", top: p(20), left: p(8), width: p(11), height: p(11) }}>
              <div style={{ position: "absolute", width: "100%", height: p(2.5), background: "#e04040", top: "40%", borderRadius: p(2), transform: "rotate(45deg)", transformOrigin: "center" }} />
              <div style={{ position: "absolute", width: "100%", height: p(2.5), background: "#e04040", top: "40%", borderRadius: p(2), transform: "rotate(-45deg)", transformOrigin: "center" }} />
            </div>
            <div style={{ position: "absolute", top: p(20), right: p(8), width: p(11), height: p(11) }}>
              <div style={{ position: "absolute", width: "100%", height: p(2.5), background: "#e04040", top: "40%", borderRadius: p(2), transform: "rotate(45deg)", transformOrigin: "center" }} />
              <div style={{ position: "absolute", width: "100%", height: p(2.5), background: "#e04040", top: "40%", borderRadius: p(2), transform: "rotate(-45deg)", transformOrigin: "center" }} />
            </div>
          </>
        ) : (
          <>
            <div style={{ position: "absolute", width: p(7), height: p(7), background: "#1f2758", borderRadius: "50%", top: p(24), left: p(14) }} />
            <div style={{ position: "absolute", width: p(7), height: p(7), background: "#1f2758", borderRadius: "50%", top: p(24), right: p(14) }} />
          </>
        )}
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

// ─── Dead Chicken (CSS replica of the reference design) ──────────────────────

function DeadChicken({ size }: { size: number }) {
  // All coordinates reference a 175×140 viewport
  const s = size / 175;
  const p = (n: number) => Math.round(n * s);

  const featherShape = (left?: number, top?: number, right?: number, rotate?: number): React.CSSProperties => ({
    position: "absolute",
    width: p(44), height: p(20),
    background: "#dfe4ff",
    border: `${Math.max(1, p(3))}px solid #21265d`,
    borderRadius: "60% 60% 60% 10%",
    ...(left !== undefined ? { left: p(left) } : {}),
    ...(right !== undefined ? { right: p(right) } : {}),
    ...(top !== undefined ? { top: p(top) } : {}),
    transform: `rotate(${rotate ?? 0}deg)`,
    boxShadow: `0 ${p(4)}px 0 rgba(0,0,0,.15)`,
  });

  const xEye = (left: number, top: number) => (
    <div style={{ position: "absolute", width: p(14), height: p(14), left: p(left), top: p(top) }}>
      <div style={{ position: "absolute", width: "100%", height: p(3.5), background: "#22285d", borderRadius: p(3), top: "38%", transformOrigin: "center", transform: "rotate(45deg)" }} />
      <div style={{ position: "absolute", width: "100%", height: p(3.5), background: "#22285d", borderRadius: p(3), top: "38%", transformOrigin: "center", transform: "rotate(-45deg)" }} />
    </div>
  );

  return (
    <div style={{ position: "relative", width: p(175), height: p(140) }}>

      {/* Feathers */}
      <div style={featherShape(0, 4, undefined, 10)} />
      <div style={featherShape(undefined, 2, 0, -12)} />
      <div style={featherShape(undefined, 26, 6, 8)} />

      {/* Shadow */}
      <div style={{ position: "absolute", width: p(90), height: p(18), background: "rgba(0,0,0,.2)", borderRadius: "50%", left: p(42), bottom: p(6), filter: `blur(${p(3)}px)` }} />

      {/* Body */}
      <div style={{
        position: "absolute", width: p(104), height: p(80),
        background: "#f6f7ff", border: `${Math.max(1, p(4))}px solid #1f255c`,
        borderRadius: "50% 50% 45% 45%",
        left: p(35), top: p(38),
        transform: "rotate(-6deg)",
        boxShadow: `inset 0 ${p(-8)}px 0 rgba(0,0,0,.04), 0 ${p(7)}px 0 rgba(0,0,0,.15)`,
      }} />

      {/* Comb */}
      <div style={{ position: "absolute", top: p(26), left: p(82), display: "flex", gap: p(2) }}>
        <span style={{ display: "block", width: p(10), height: p(14), background: "#ff5b5b", borderRadius: "50%", border: `${Math.max(1, p(2))}px solid #e54848` }} />
        <span style={{ display: "block", width: p(10), height: p(12), background: "#ff5b5b", borderRadius: "50%", border: `${Math.max(1, p(2))}px solid #e54848`, transform: "translateY(2px)" }} />
      </div>

      {/* X eyes */}
      {xEye(52, 70)}
      {xEye(72, 66)}

      {/* Beak */}
      <div style={{ position: "absolute", left: p(103), top: p(80), width: p(16), height: p(14), background: "#f2ad1d", clipPath: "polygon(0 50%,100% 0,100% 100%)", borderRadius: p(2) }} />

      {/* Left leg */}
      <div style={{ position: "absolute", width: p(26), height: p(8), background: "#f0a600", borderRadius: p(10), bottom: p(12), left: p(46), transform: "rotate(-20deg)", boxShadow: `0 ${p(4)}px 0 rgba(0,0,0,.2)` }}>
        <div style={{ position: "absolute", width: p(16), height: p(6), background: "#f0a600", borderRadius: p(10), left: p(-6), top: p(-4), transform: "rotate(-35deg)" }} />
        <div style={{ position: "absolute", width: p(16), height: p(6), background: "#f0a600", borderRadius: p(10), right: p(-6), top: p(4), transform: "rotate(35deg)" }} />
      </div>

      {/* Right leg */}
      <div style={{ position: "absolute", width: p(26), height: p(8), background: "#f0a600", borderRadius: p(10), bottom: p(12), right: p(40), transform: "rotate(18deg)", boxShadow: `0 ${p(4)}px 0 rgba(0,0,0,.2)` }}>
        <div style={{ position: "absolute", width: p(16), height: p(6), background: "#f0a600", borderRadius: p(10), left: p(-6), top: p(4), transform: "rotate(-35deg)" }} />
        <div style={{ position: "absolute", width: p(16), height: p(6), background: "#f0a600", borderRadius: p(10), right: p(-6), top: p(-4), transform: "rotate(35deg)" }} />
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
        setSession(prev => (prev ? { ...prev, multiplier: r.multiplier ?? prev.multiplier } : prev));
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

  // After a round ends (crash/cashout), one tap of "Start Game" should clear the
  // finished board AND immediately deal a fresh round — no second click needed.
  const handlePlayAgain = () => {
    if (!user) { showError("Please log in to play"); return; }
    if (loading) return;
    const newSeed = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    setPhase("idle");
    setSession(null);
    setCrashLane(null);
    setCashoutAmt(null);
    setClientSeed(newSeed);
    setLoading(true);
    socket.current?.emit("chickenRoad:start", { betAmount, difficulty, clientSeed: newSeed });
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

  // Camera: on mobile anchor the chicken near the middle; on desktop keep ~2 crossed
  // lanes visible behind it. After crash, slide right to reveal the crash lane and the
  // full death-path (future lanes with their multipliers).
  const cameraTarget = phase === "crashed" && crashLane !== null
    ? SIDEWALK_W + crashLane * laneW + laneW * 0.5   // centre of crash lane
    : chickenCenterTrack;
  const anchorX = phase === "crashed" && crashLane !== null
    ? (isMobile ? containerW * 0.48 : containerW * 0.38)
    : (isMobile ? containerW * 0.42 : SIDEWALK_W + 2 * laneW);
  const cameraX = Math.min(0, anchorX - cameraTarget);
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
            const reached = i < currentLane;
            const isNext = i === currentLane && phase === "running";
            const underChicken = reached && i === currentLane - 1;
            const laneMult = multTable[i] ?? 1;
            const showVehicle = phase !== "idle" && i >= currentLane && i !== crashLane;
            const isCrashLane = phase === "crashed" && i === crashLane;
            const isCashoutLane = phase === "cashed" && i === currentLane - 1;
            // future lanes past the end-game point: show dimmed multiplier text only
            const isPostGame = isOver && !reached && !isCrashLane;

            return (
              <div key={i} className="absolute top-0 bottom-0" style={{ left, width: laneW }}>
                {/* asphalt */}
                <div className="absolute inset-0" style={{ background: reached && !isMobile ? "#3a3d70" : "#313463" }} />
                {/* dashed lane divider */}
                <div className="absolute top-0 bottom-0 left-0" style={{ width: 4, background: "repeating-linear-gradient(180deg,rgba(255,255,255,0.85),rgba(255,255,255,0.85) 22px,transparent 22px,transparent 44px)" }} />

                {/* ── multiplier coin on uncrossed lanes ── */}
                {!reached && !isCrashLane && !isPostGame && (
                  <div
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
                    style={{ width: coinSize, height: coinSize, zIndex: isNext ? 25 : 1, cursor: isNext && nextCoinReady ? "pointer" : "default" }}
                    onClick={isNext ? (e) => { e.stopPropagation(); if (draggingRef.current || !nextCoinReady) return; handleMove(); } : undefined}
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

                {/* ── dimmed multiplier text on future lanes after game ends ── */}
                {isPostGame && (
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
                    <span className="tabular-nums font-bold text-white/25" style={{ fontSize: Math.max(10, coinSize * 0.22) }}>
                      {fmtMult(laneMult)}
                    </span>
                  </div>
                )}

                {/* ── stone barrier on crossed lanes ── */}
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

                {/* ── logo on crossed lanes (running, cashed, AND crash) ──
                    On crash the chicken moves onto the crash lane, so every
                    crossed lane — including the one it was just standing on —
                    shows the logo. While running/cashed, the lane under the
                    chicken is excluded (chicken / checkmark badge sits there). */}
                {reached && (phase === "crashed" || !underChicken) && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: phase === "running" ? 0.5 : 0.2, type: "spring", stiffness: 320, damping: 20 }}
                    style={{
                      position: "absolute",
                      left: Math.round((laneW - coinSize * 1.35) / 2),
                      top: Math.round((boardH - coinSize * 1.35) / 2),
                      width: Math.round(coinSize * 1.35),
                      height: Math.round(coinSize * 1.35),
                    }}
                  >
                    <img src="/logo.png" alt="" draggable={false}
                      style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.4))" }} />
                  </motion.div>
                )}

                {/* ── skull badge on crash lane ── */}
                {isCrashLane && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.4, y: -12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ delay: 0.15, type: "spring", stiffness: 340, damping: 20 }}
                    className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-2xl font-black tabular-nums"
                    style={{
                      top: Math.round(boardH * 0.3),
                      background: "rgba(220,38,38,0.92)",
                      border: "1.5px solid rgba(248,113,113,0.6)",
                      boxShadow: "0 0 18px rgba(220,38,38,0.5)",
                      color: "#fff",
                      fontSize: Math.max(11, Math.min(coinSize * 0.25, 17)),
                      zIndex: 28,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span>💀</span> {fmtMult(multTable[i] ?? 1)}
                  </motion.div>
                )}

                {/* ── checkmark badge on cashout lane ── */}
                {isCashoutLane && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.4, y: -12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ delay: 0.15, type: "spring", stiffness: 340, damping: 20 }}
                    className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-2xl font-black tabular-nums"
                    style={{
                      top: Math.round(boardH * 0.22),
                      background: "rgba(16,185,129,0.92)",
                      border: "1.5px solid rgba(52,211,153,0.6)",
                      boxShadow: "0 0 18px rgba(16,185,129,0.5)",
                      color: "#fff",
                      fontSize: Math.max(11, Math.min(coinSize * 0.25, 17)),
                      zIndex: 28,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span>✓</span> {fmtMult(multiplier)}
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

          {/* Chicken — hidden on cashout, replaced with dead sprite on crash */}
          <motion.div
            className="absolute z-20"
            style={{ width: laneW, top: 0, bottom: 0 }}
            animate={{
              left: phase === "crashed" && crashLane !== null
                ? SIDEWALK_W + crashLane * laneW
                : chickenCenterTrack - laneW / 2,
            }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
          >
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: Math.round(boardH * 0.08), gap: 8 }}>

              {/* Alive chicken — hidden instantly on crash, flies off on cashout */}
              {phase !== "crashed" && (
                <motion.div
                  animate={
                    phase === "cashed"
                      ? { opacity: 0, y: -Math.round(chickenSize * 0.6), scale: 1.1 }
                      : loading
                      ? { y: [0, -boardH * 0.06, 0], opacity: 1 }
                      : { y: 0, opacity: 1 }
                  }
                  transition={
                    phase === "cashed" ? { duration: 0.3, ease: "easeIn" }
                      : { duration: 0.3, repeat: loading ? Infinity : 0 }
                  }
                >
                  <Chicken size={chickenSize} />
                </motion.div>
              )}

              {/* Dead chicken sprite — pops in after crash */}
              <AnimatePresence>
                {phase === "crashed" && (
                  <motion.div
                    key="dead"
                    style={{ position: "absolute", left: "50%", top: "50%", x: "-50%", y: "-50%", marginTop: Math.round(boardH * 0.04) }}
                    initial={{ opacity: 0, scale: 0.6, rotate: -18 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 22, delay: 0.08 }}
                  >
                    <DeadChicken size={Math.min(laneW * 0.9, isMobile ? 130 : 140)} />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Running multiplier badge */}
              {phase === "running" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="px-2.5 py-1 rounded-lg text-xs font-black tabular-nums"
                  style={{
                    background: "rgba(10,11,22,0.92)",
                    border: "1px solid rgba(139,92,246,0.5)",
                    color: "#c4b5fd",
                    backdropFilter: "blur(4px)",
                  }}>
                  {fmtMult(multiplier)}
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* Crash burst */}
          <AnimatePresence>
            {phase === "crashed" && crashLane !== null && (
              <CrashBurst laneIndex={crashLane} laneW={laneW} boardH={boardH} />
            )}
          </AnimatePresence>
        </motion.div>

      </div>

      {/* ── Bottom control panel ──────────────────────────────────────────────── */}
      <div className="shrink-0" style={{ background: "#13112a", borderTop: "1px solid rgba(139,92,246,0.15)" }}>

        {/* ── Mobile layout ── */}
        <div className="md:hidden px-3 pt-3 pb-4 flex flex-col gap-2">

          {/* Card 1: Bet Amount */}
          <div className="flex flex-col gap-2" style={PURPLE_CARD}>
            <span className="text-[11px] font-bold text-purple-200/80">Bet Amount</span>
            <div className="flex items-center gap-1.5">
              <div className="flex items-center rounded-xl px-2.5 py-2 flex-1 min-w-0" style={{ background: "rgba(10,8,28,0.55)", border: "1px solid rgba(167,139,250,0.35)" }}>
                <span className="text-purple-200/50 text-sm mr-1 shrink-0">₹</span>
                <input type="number" value={betAmount}
                  onChange={e => setBetAmount(Math.max(10, parseInt(e.target.value) || 10))}
                  disabled={phase === "running"}
                  className="bg-transparent flex-1 min-w-0 text-sm font-bold text-white outline-none disabled:opacity-60" />
              </div>
              {([["1/2", () => adjustBet(0.5)], ["2X", () => adjustBet(2)], ["Max", () => quickBet(Math.floor(liveBalance ?? betAmount))]] as [string, () => void][]).map(([label, fn]) => (
                <button key={label} onClick={fn} disabled={phase === "running"}
                  className="px-2.5 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 shrink-0"
                  style={{ background: "rgba(167,139,250,0.14)", border: "1px solid rgba(167,139,250,0.35)", color: "rgba(237,233,254,0.9)" }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Card 2: Difficulty */}
          <div className="flex flex-col gap-2" style={PURPLE_CARD}>
            <span className="text-[11px] font-bold text-purple-200/80">Difficulty</span>
            <div className="grid grid-cols-4 gap-1.5">
              {(["EASY", "MEDIUM", "HARD", "DAREDEVIL"] as Difficulty[]).map(d => (
                <button key={d}
                  onClick={() => { if (phase !== "running") setDifficulty(d); }}
                  disabled={phase === "running"}
                  className="py-2 rounded-xl text-[11px] font-bold transition-all disabled:opacity-50"
                  style={{
                    background: difficulty === d ? DIFF_CONFIG[d].color : "rgba(167,139,250,0.12)",
                    border: `1px solid ${difficulty === d ? DIFF_CONFIG[d].color : "rgba(167,139,250,0.30)"}`,
                    color: difficulty === d ? "#fff" : "rgba(237,233,254,0.85)",
                  }}>
                  {DIFF_CONFIG[d].label}
                </button>
              ))}
            </div>
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
            <motion.button onClick={isOver ? handlePlayAgain : handleStart} whileTap={{ scale: 0.97 }}
              disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-sm uppercase tracking-widest text-[#0a0b16] transition disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)", boxShadow: "0 4px 12px rgba(251,191,36,0.3)" }}>
              {loading ? "Starting…" : "Start Game"}
            </motion.button>
          )}
        </div>

        {/* ── Desktop layout ── */}
        <div className="hidden md:flex px-6 py-4 w-full max-w-6xl mx-auto gap-5">

          {/* Bet Amount */}
          <div className="flex flex-col gap-2 flex-shrink-0" style={PURPLE_CARD}>
            <label className="text-[11px] font-bold text-purple-200/80 flex items-center gap-1">
              Bet Amount
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="opacity-60"><path d="M12 4v8m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </label>
            <div className="flex items-center gap-1.5">
              <div className="flex items-center rounded-xl px-3 py-2" style={{ minWidth: 120, background: "rgba(10,8,28,0.55)", border: "1px solid rgba(167,139,250,0.35)" }}>
                <span className="text-purple-200/50 text-sm mr-1 shrink-0">₹</span>
                <input type="number" value={betAmount}
                  onChange={e => setBetAmount(Math.max(10, parseInt(e.target.value) || 10))}
                  disabled={phase === "running"}
                  className="bg-transparent flex-1 min-w-0 w-16 text-sm font-bold text-white outline-none disabled:opacity-60" />
              </div>
              {([["1/2", () => adjustBet(0.5)], ["2X", () => adjustBet(2)], ["Max", () => quickBet(Math.floor(liveBalance ?? betAmount))]] as [string, () => void][]).map(([label, fn]) => (
                <button key={label} onClick={fn} disabled={phase === "running"}
                  className="px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 hover:brightness-125"
                  style={{ background: "rgba(167,139,250,0.14)", border: "1px solid rgba(167,139,250,0.35)", color: "rgba(237,233,254,0.9)" }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div className="flex flex-col gap-2 flex-1" style={PURPLE_CARD}>
            <label className="text-[11px] font-bold text-purple-200/80 flex items-center gap-1">
              Difficulty
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="opacity-60"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/><path d="M12 8v4m0 4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {(["EASY", "MEDIUM", "HARD", "DAREDEVIL"] as Difficulty[]).map(d => (
                <button key={d}
                  onClick={() => { if (phase !== "running") setDifficulty(d); }}
                  disabled={phase === "running"}
                  className="py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 hover:brightness-110"
                  style={{
                    background: difficulty === d ? DIFF_CONFIG[d].color : "rgba(167,139,250,0.12)",
                    border: `1px solid ${difficulty === d ? DIFF_CONFIG[d].color : "rgba(167,139,250,0.30)"}`,
                    color: difficulty === d ? "#fff" : "rgba(237,233,254,0.85)",
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
              <motion.button onClick={isOver ? handlePlayAgain : handleStart} whileTap={{ scale: 0.97 }}
                disabled={loading}
                className="w-full py-2.5 rounded-xl font-bold text-sm uppercase tracking-widest text-[#0a0b16] transition disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)", boxShadow: "0 4px 12px rgba(251,191,36,0.3)" }}>
                {loading ? "Starting…" : "Start Game"}
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
  // Mix small cars and bikes; lanes cycle so traffic stays varied.
  const variant = (laneIndex * 7) % 3;            // 0,1,2
  const kind: VehicleKind = variant === 2 ? "bike" : "car";
  const length = kind === "bike" ? laneW * 0.5 : (variant === 0 ? laneW * 0.6 : laneW * 0.72);
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
      <Vehicle w={laneW} color={color} length={length} kind={kind} />
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
      {/* crash vehicle — rushes in from top and keeps driving through */}
      <motion.div
        className="absolute z-30"
        style={{ left: cx - laneW * 0.21, top: 0 }}
        initial={{ y: -laneW * 1.5 }}
        animate={{ y: boardH + laneW * 1.5 }}
        transition={{ duration: 0.85, ease: "linear" }}
      >
        <Vehicle w={laneW} color="#dc2626" length={laneW * 0.8} />
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
