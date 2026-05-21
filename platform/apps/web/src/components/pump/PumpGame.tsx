"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Shield, Wallet } from "lucide-react";
import useSWR from "swr";
import { useAuthStore } from "@/lib/stores/auth";
import { api, fetcher } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

type Mode     = "manual" | "auto";
type Status   = "IDLE" | "ACTIVE" | "CASHED" | "POPPED";
type Difficulty = "EASY" | "MEDIUM" | "HARD" | "EXPERT" | "INSANE";

interface ActiveSession {
  betId: string; betAmount: number; difficulty: Difficulty;
  pumpsCount: number; currentMult: number; serverSeedHash: string;
  maxPumps: number; multTable: number[]; status: "ACTIVE";
}

interface PumpPublicConfig {
  enabled: boolean; minBet: number; maxBet: number;
  maxPayout: number; rtpPercent: number;
}

const DIFFICULTIES: { value: Difficulty; label: string; color: string }[] = [
  { value: "EASY",   label: "Easy",   color: "#22C55E" },
  { value: "MEDIUM", label: "Med",    color: "#3B82F6" },
  { value: "HARD",   label: "Hard",   color: "#F59E0B" },
  { value: "EXPERT", label: "Expert", color: "#A855F7" },
  { value: "INSANE", label: "Insane", color: "#EF4444" },
];

const BET_SUGGESTIONS = [10, 50, 100, 500, 1000, 5000];

function fmtMult(m: number)  { return `${m.toFixed(2)}×`; }
function fmtMoney(n: number) { return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtShort(n: number) {
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000)    return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toFixed(2)}`;
}

// ── Sound Engine ──────────────────────────────────────────────────────────────

function useSoundEngine() {
  const ctxRef = useRef<AudioContext | null>(null);
  const getCtx = useCallback((): AudioContext => {
    if (!ctxRef.current || ctxRef.current.state === "closed")
      ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const playBet = useCallback(() => {
    try {
      const ctx = getCtx(); const now = ctx.currentTime;
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.type = "sine";
      o.frequency.setValueAtTime(440, now); o.frequency.exponentialRampToValueAtTime(660, now + 0.08);
      g.gain.setValueAtTime(0.28, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      o.start(now); o.stop(now + 0.15);
    } catch {}
  }, [getCtx]);

  const playPump = useCallback(() => {
    try {
      const ctx = getCtx(); const now = ctx.currentTime;
      const sz = Math.floor(ctx.sampleRate * 0.12);
      const buf = ctx.createBuffer(1, sz, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < sz; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
      const noise = ctx.createBufferSource(); noise.buffer = buf;
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 0.6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.55, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      noise.connect(bp); bp.connect(g); g.connect(ctx.destination); noise.start(now);
      const o = ctx.createOscillator(); const og = ctx.createGain();
      o.connect(og); og.connect(ctx.destination);
      o.frequency.setValueAtTime(180, now); o.frequency.exponentialRampToValueAtTime(80, now + 0.09);
      og.gain.setValueAtTime(0.2, now); og.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      o.start(now); o.stop(now + 0.1);
    } catch {}
  }, [getCtx]);

  const playCashout = useCallback(() => {
    try {
      const ctx = getCtx(); const now = ctx.currentTime;
      const sz = Math.floor(ctx.sampleRate * 0.55);
      const buf = ctx.createBuffer(1, sz, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < sz; i++) d[i] = (Math.random() * 2 - 1) * 0.35;
      const noise = ctx.createBufferSource(); noise.buffer = buf;
      const hp = ctx.createBiquadFilter(); hp.type = "highpass";
      hp.frequency.setValueAtTime(150, now); hp.frequency.exponentialRampToValueAtTime(4000, now + 0.45);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.45, now + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      noise.connect(hp); hp.connect(g); g.connect(ctx.destination); noise.start(now);
      ([0, 0.18, 0.34] as number[]).forEach((delay, i) => {
        const freq = ([523, 659, 784] as number[])[i]!;
        const o = ctx.createOscillator(); const og = ctx.createGain();
        o.type = "sine"; o.connect(og); og.connect(ctx.destination); o.frequency.value = freq;
        og.gain.setValueAtTime(0, now + delay); og.gain.linearRampToValueAtTime(0.22, now + delay + 0.04);
        og.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.45);
        o.start(now + delay); o.stop(now + delay + 0.5);
      });
    } catch {}
  }, [getCtx]);

  const playPop = useCallback(() => {
    try {
      const ctx = getCtx(); const now = ctx.currentTime;
      const sz = Math.floor(ctx.sampleRate * 0.18);
      const buf = ctx.createBuffer(1, sz, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < sz; i++) d[i] = (Math.random() * 2 - 1);
      const noise = ctx.createBufferSource(); noise.buffer = buf;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.9, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      noise.connect(g); g.connect(ctx.destination); noise.start(now);
    } catch {}
  }, [getCtx]);

  return { playBet, playPump, playCashout, playPop };
}

// ── GameVisual: combined balloon + pump machine in a single SVG ───────────────
//
//  SVG viewBox: 0 0 320 480
//  Nozzle tip (where balloon connects): y = 350
//  Pump machine body:                   y = 380–470
//  Piston housing:                      y = 358–383
//  Piston rod top (T-handle):           y = 336–352
//  Balloon grows upward from nozzle:    cy = 350 – radius

interface GameVisualProps {
  color: string;
  scale: number;          // 1.0 → 1.6+
  pumping: boolean;
  popped: boolean;
  releasing: boolean;
  showDeflated: boolean;  // IDLE or pumpsCount===0 but ACTIVE
  pumpsCount: number;
  maxPumps: number;
  currentMult: number;
  status: Status;
  lastWin: { mult: number; payout: number } | null;
}

function GameVisual({
  color, scale, pumping, popped, releasing,
  showDeflated, pumpsCount, maxPumps,
  currentMult, status, lastWin,
}: GameVisualProps) {

  const NOZZLE_Y = 310;

  // Balloon dimensions
  // deflated: small circular shape at nozzle
  // inflated: grows round from ~20 to ~130 radius as scale increases
  const inflatedR  = Math.min(20 + (scale - 1) * 170, 132);
  const balloonRx  = showDeflated ? 42 : inflatedR;
  const balloonRy  = showDeflated ? 36 : inflatedR;
  const balloonCy  = NOZZLE_Y - balloonRy - 4; // bottom of balloon sits on nozzle
  const knotCy     = balloonCy + balloonRy + 6;
  const neckTop    = knotCy + 10;
  const neckHeight = Math.max(2, NOZZLE_Y - neckTop - 2);

  // For dots centering
  const dotCount = Math.min(8, maxPumps || 8);
  const dotSpacing = 14;
  const dotsStartX = 160 - ((dotCount - 1) * dotSpacing) / 2;

  return (
    <svg
      viewBox="0 0 320 480"
      className="w-full max-w-[280px] sm:max-w-[340px] lg:max-w-[460px]"
      style={{ height: "auto" }}
    >
      <defs>
        <filter id="balloonGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="greenGlow" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feColorMatrix type="matrix"
            values="0 0 0 0 0.133  0 0 0 0 0.773  0 0 0 0 0.369  0 0 0 0.55 0"
            in="blur" result="glow" />
          <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* ── Balloon group (flies up on release) ── */}
      {!popped && status !== "CASHED" && (
        <motion.g
          animate={releasing
            ? { y: -420, opacity: 0, rotate: 12, scale: 1.22 }
            : { y: 0,    opacity: 1, rotate: 0,  scale: 1    }}
          style={{ transformOrigin: "160px 350px" }}
          transition={releasing
            ? { duration: 0.72, ease: [0.22, 0.61, 0.36, 1] }
            : { type: "spring", stiffness: 115, damping: 13 }}
        >
          {/* Main balloon body */}
          <motion.ellipse
            cx="160"
            animate={{ cy: balloonCy, rx: balloonRx, ry: balloonRy }}
            fill={color}
            filter="url(#balloonGlow)"
            transition={{ type: "spring", stiffness: 115, damping: 13 }}
          />

          {/* Upper-right shine (hidden when deflated) */}
          {!showDeflated && (
            <motion.ellipse
              animate={{
                cx: 160 + inflatedR * 0.3,
                cy: balloonCy - inflatedR * 0.22,
                rx: inflatedR * 0.21,
                ry: inflatedR * 0.29,
              }}
              fill="white"
              opacity={0.38}
              style={{
                transform: "rotate(-26deg)",
                transformOrigin: `${160 + inflatedR * 0.3}px ${balloonCy - inflatedR * 0.22}px`,
              }}
              transition={{ type: "spring", stiffness: 115, damping: 13 }}
            />
          )}

          {/* Deflated balloon shine */}
          {showDeflated && (
            <ellipse cx="180" cy={balloonCy - 10} rx="15" ry="10"
              fill="white" opacity="0.28" transform={`rotate(-22 180 ${balloonCy - 10})`} />
          )}

          {/* Knot */}
          <motion.ellipse
            cx="160"
            animate={{ cy: knotCy, rx: 10, ry: 7 }}
            fill={color}
            transition={{ type: "spring", stiffness: 115, damping: 13 }}
          />

          {/* Neck connecting to nozzle */}
          <motion.rect
            x="156" width="8" rx="3" fill="#4a5568"
            animate={{ y: neckTop, height: neckHeight }}
            transition={{ type: "spring", stiffness: 115, damping: 13 }}
          />

          {/* Multiplier text — centered on balloon */}
          {!showDeflated && (
            <text
              x="160"
              y={balloonCy}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="white"
              fontWeight="900"
              fontSize={Math.round(Math.min(28 + inflatedR * 0.12, 40))}
              style={{ userSelect: "none", fontFamily: "inherit" }}
            >
              {currentMult.toFixed(2)}x
            </text>
          )}
        </motion.g>
      )}

      {/* ── Pop explosion ── */}
      {popped && (
        <motion.text
          x="160" y="280" textAnchor="middle" fontSize="80"
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          style={{ transformOrigin: "160px 280px" }}
        >
          💥
        </motion.text>
      )}

      {/* ── Cashout result box ── */}
      {status === "CASHED" && lastWin && (
        <motion.g
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ transformOrigin: "160px 250px" }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        >
          <rect x="55" y="185" width="210" height="130" rx="20"
            fill="rgba(34,197,94,0.11)" stroke="#22C55E" strokeWidth="2.5"
            filter="url(#greenGlow)" />
          <text x="160" y="232" textAnchor="middle" fill="#22C55E"
            fontWeight="900" fontSize="36" style={{ fontFamily: "inherit" }}>
            {lastWin.mult.toFixed(2)}×
          </text>
          <text x="160" y="278" textAnchor="middle" fill="#86efac"
            fontSize="17" fontWeight="600" style={{ fontFamily: "inherit" }}>
            {fmtMoney(lastWin.payout)}
          </text>
        </motion.g>
      )}

      {/* ── Pump machine (right side) ── */}

      {/* Nozzle pipe outer (from balloon to pump) */}
      <rect x="230" y="305" width="20" height="85" rx="10" fill="none" stroke="#3d5a75" strokeWidth="3" />

      {/* Nozzle pipe inner (visible fluid path) */}
      <rect x="236" y="310" width="8" height="75" rx="4" fill="#4a7a99" opacity="0.8" />

      {/* Pump base platform */}
      <rect x="170" y="390" width="140" height="70" rx="12" fill="#1a2d3d" />
      <rect x="175" y="393" width="130" height="8" rx="4" fill="rgba(255,255,255,0.04)" />

      {/* Pump body (cylinder - larger) */}
      <rect x="185" y="405" width="110" height="50" rx="8" fill="#253d51" stroke="#3d5a75" strokeWidth="2" />
      <rect x="190" y="410" width="100" height="9" rx="3" fill="rgba(255,255,255,0.1)" />

      {/* Pump inlet (connection point) */}
      <circle cx="240" cy="405" r="9" fill="#2d4659" stroke="#4a7a99" strokeWidth="2" />

      {/* Pump handle (piston rod - animates on pump) */}
      <motion.g
        animate={{ y: pumping ? [0, 18, 0] : 0 }}
        transition={{ duration: 0.22, ease: "easeInOut" }}
      >
        <rect x="233" y="390" width="14" height="32" rx="5" fill="#2d4659" stroke="#3d5a75" strokeWidth="1" />
        <rect x="228" y="382" width="24" height="12" rx="4" fill="#3d5a75" />
        <circle cx="240" cy="388" r="4" fill="#4a6a88" />
      </motion.g>

      {/* Pump count dots — on base platform */}
      {Array.from({ length: dotCount }).map((_, i) => (
        <circle key={i}
          cx={190 + i * 12}
          cy="430"
          r="4"
          fill={pumpsCount > i ? color : "rgba(255,255,255,0.14)"}
        />
      ))}

    </svg>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function PumpGame() {
  const user = useAuthStore(s => s.user);
  const { data: pumpCfg } = useSWR<PumpPublicConfig>("/casino/pump/config", fetcher, { revalidateOnFocus: false });
  const { data: walletData, mutate: mutateWallet } = useSWR<{ available: number }>(
    user ? "/wallet/summary" : null, fetcher,
  );

  const minBet  = pumpCfg?.minBet ?? 10;
  const maxBet  = pumpCfg?.maxBet ?? 100_000;
  const balance = walletData ? Number(walletData.available) : 0;

  const { playBet, playPump, playCashout, playPop } = useSoundEngine();

  const [mode,       setMode]       = useState<Mode>("manual");
  const [betAmount,  setBetAmount]  = useState<string>("10");
  const [difficulty, setDifficulty] = useState<Difficulty>("EASY");

  const [session,    setSession]    = useState<ActiveSession | null>(null);
  const [status,     setStatus]     = useState<Status>("IDLE");
  const [busy,       setBusy]       = useState<"none" | "bet" | "pump" | "cashout">("none");
  const [poppedMult, setPoppedMult] = useState<number | null>(null);
  const [lastWin,    setLastWin]    = useState<{ mult: number; payout: number } | null>(null);
  const [releasing,  setReleasing]  = useState(false);
  const [betFlash,   setBetFlash]   = useState(false);

  const [multTable,   setMultTable]   = useState<number[]>([]);
  const [tableLoaded, setTableLoaded] = useState(false);

  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const notify = useCallback((text: string, ok = true) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 2500);
  }, []);

  const [autoBets,    setAutoBets]    = useState("10");
  const [autoCashAt,  setAutoCashAt]  = useState("3");
  const [autoRunning, setAutoRunning] = useState(false);
  const autoRunCount  = useRef(0);
  const autoTargetRef = useRef(10);

  useEffect(() => {
    if (status !== "IDLE" || !pumpCfg) return;
    setBetAmount(prev => {
      const v = parseFloat(prev);
      return (isNaN(v) || v <= 0) ? String(pumpCfg.minBet) : prev;
    });
  }, [pumpCfg, status]);

  const loadTable = useCallback(async (d: Difficulty) => {
    setTableLoaded(false);
    try {
      const r = await api.get(`/casino/pump/difficulty/${d}`);
      setMultTable(r.data.table ?? []);
    } catch { setMultTable([]); }
    finally { setTableLoaded(true); }
  }, []);
  useEffect(() => { loadTable(difficulty); }, [difficulty, loadTable]);

  useEffect(() => {
    if (!user) return;
    api.get("/casino/pump/active").then(r => {
      const s = r.data; if (!s) return;
      setSession(s); setStatus("ACTIVE"); setDifficulty(s.difficulty);
      setBetAmount(String(s.betAmount)); setMultTable(s.multTable ?? []); setTableLoaded(true);
    }).catch(() => {});
  }, [user]);

  const reset = useCallback(() => {
    setSession(null); setStatus("IDLE"); setPoppedMult(null);
    setLastWin(null); setReleasing(false);
  }, []);

  const placeBet = useCallback(async () => {
    if (!user) { notify("Please login to play", false); return; }
    if (status === "ACTIVE") return;
    const amt = parseFloat(betAmount);
    if (isNaN(amt) || amt < minBet) { notify(`Min bet ₹${minBet}`, false); return; }
    if (amt > maxBet)  { notify(`Max bet ₹${maxBet}`, false); return; }
    if (amt > balance) { notify("Insufficient balance", false); return; }

    setBusy("bet"); setPoppedMult(null); setLastWin(null); setReleasing(false);
    try {
      const r = await api.post("/casino/pump/bet", { betAmount: amt, difficulty });
      const data = r.data;
      playBet(); setBetFlash(true); setTimeout(() => setBetFlash(false), 600);
      setSession({
        betId: data.betId, betAmount: amt, difficulty: data.difficulty,
        pumpsCount: data.pumpsCount, currentMult: data.currentMult,
        serverSeedHash: data.serverSeedHash, maxPumps: data.maxPumps,
        multTable: data.multTable, status: "ACTIVE",
      });
      setMultTable(data.multTable); setStatus("ACTIVE"); mutateWallet();
    } catch (e: any) { notify(e?.response?.data?.message ?? "Bet failed", false); }
    finally { setBusy("none"); }
  }, [user, status, betAmount, difficulty, minBet, maxBet, balance, mutateWallet, notify, playBet]);

  const pumpOnce = useCallback(async () => {
    if (!session || status !== "ACTIVE" || busy !== "none") return;
    setBusy("pump"); playPump();
    try {
      const r = await api.post("/casino/pump/pump", { betId: session.betId });
      const data = r.data;
      if (data.popped) {
        playPop(); setPoppedMult(session.currentMult);
        setSession(prev => prev ? { ...prev, pumpsCount: data.pumpsCount } : prev);
        setStatus("POPPED");
      } else {
        setSession(prev => prev
          ? { ...prev, pumpsCount: data.pumpsCount, currentMult: data.currentMult }
          : prev);
      }
    } catch (e: any) { notify(e?.response?.data?.message ?? "Pump failed", false); }
    finally { setBusy("none"); }
  }, [session, status, busy, notify, playPump, playPop]);

  const cashout = useCallback(async () => {
    if (!session || status !== "ACTIVE" || busy !== "none") return;
    if (session.pumpsCount < 1) { notify("Pump at least once first", false); return; }
    setBusy("cashout");
    try {
      const r = await api.post("/casino/pump/cashout", { betId: session.betId });
      const data = r.data;
      playCashout(); setReleasing(true);
      setTimeout(() => {
        setReleasing(false); setStatus("CASHED");
        setLastWin({ mult: data.multiplier, payout: data.payout });
      }, 750);
      mutateWallet();
    } catch (e: any) { notify(e?.response?.data?.message ?? "Cashout failed", false); }
    finally { setBusy("none"); }
  }, [session, status, busy, mutateWallet, notify, playCashout]);

  useEffect(() => {
    if (status !== "CASHED" && status !== "POPPED") return;
    const t = setTimeout(() => reset(), 2000);
    return () => clearTimeout(t);
  }, [status, reset]);

  useEffect(() => {
    if (!autoRunning) return;
    if (status === "IDLE") {
      if (autoRunCount.current >= autoTargetRef.current) { setAutoRunning(false); return; }
      placeBet(); return;
    }
    if (status === "ACTIVE" && session) {
      const n = parseInt(autoCashAt);
      if (!isNaN(n) && session.pumpsCount >= n) { cashout(); }
      else { const t = setTimeout(pumpOnce, 300); return () => clearTimeout(t); }
    }
    if (status === "CASHED" || status === "POPPED") { autoRunCount.current += 1; }
  }, [autoRunning, status, session, autoCashAt, placeBet, pumpOnce, cashout]);

  const startAuto = () => {
    const n = parseInt(autoBets);
    autoTargetRef.current = isNaN(n) || n < 1 ? 1 : n;
    autoRunCount.current = 0; setAutoRunning(true);
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const currentMult  = session?.currentMult ?? 1.00;
  const balloonScale = useMemo(
    () => session ? Math.min(1 + session.pumpsCount * 0.12, 1.65) : 1,
    [session],
  );
  const balloonColor = DIFFICULTIES.find(d => d.value === difficulty)?.color ?? "#22C55E";
  const profit = session
    ? Math.round(session.betAmount * session.currentMult * 100) / 100 - session.betAmount
    : 0;

  const chipMults = useMemo(() => {
    if (!multTable.length) return [];
    const start = Math.max(0, (session?.pumpsCount ?? 0) - 1);
    return [
      { mult: 1.00, isCurrent: !session || session.pumpsCount === 0 },
      ...multTable.slice(start, start + 12).map((m, i) => ({
        mult: m, isCurrent: session ? (start + i + 1 === session.pumpsCount) : false,
      })),
    ];
  }, [multTable, session]);

  const canPump = status === "ACTIVE" && busy === "none";
  const canCash = status === "ACTIVE" && busy === "none" && (session?.pumpsCount ?? 0) >= 1;
  const canBet  = status === "IDLE"   && busy === "none";
  const showDeflated = status === "IDLE" || (status === "ACTIVE" && session?.pumpsCount === 0);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-[100dvh] w-full flex flex-col bg-[#0f212e] overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-[#0a1922] flex-shrink-0">
        <Link href="/" className="flex items-center gap-1.5 text-white/60 hover:text-white">
          <ArrowLeft size={16} />
          <span className="hidden sm:inline text-xs">Back</span>
        </Link>
        <div className="lg:hidden flex items-center gap-1.5">
          <Wallet size={12} className="text-white/40" />
          <span className="text-emerald-400 text-sm font-bold tabular-nums">
            {user ? fmtShort(balance) : "—"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-white/40">
          <Shield size={12} />
          <span className="text-[10px] uppercase tracking-wider">Pump</span>
          {session?.serverSeedHash && (
            <span className="text-white/20 text-[9px] hidden sm:inline">{session.serverSeedHash.slice(0, 8)}…</span>
          )}
        </div>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="absolute top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm font-semibold shadow-2xl whitespace-nowrap"
            style={{
              background: toast.ok ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
              border: `1px solid ${toast.ok ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`,
              color:  toast.ok ? "#22C55E" : "#EF4444",
            }}
          >{toast.text}</motion.div>
        )}
      </AnimatePresence>

      {/* Body */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">

        {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
        <div className="hidden lg:flex w-[340px] flex-shrink-0 flex-col p-5 bg-[#0f212e] border-r border-white/5 overflow-y-auto">
          <div className="rounded-2xl bg-[#1a2c38] p-4 flex flex-col gap-4">

            <div className="flex items-center justify-between rounded-lg bg-[#0f212e] px-3 py-2.5 border border-white/5">
              <div className="flex items-center gap-2 text-white/60">
                <Wallet size={14} />
                <span className="text-xs font-semibold uppercase tracking-wider">Balance</span>
              </div>
              <span className="text-sm font-bold text-emerald-400 tabular-nums">
                {user ? fmtMoney(balance) : "—"}
              </span>
            </div>

            <div className="flex items-center bg-[#0f212e] rounded-full p-1">
              {(["manual", "auto"] as Mode[]).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={`flex-1 py-2 rounded-full text-sm font-semibold capitalize transition ${mode === m ? "bg-[#2f4553] text-white" : "text-white/50 hover:text-white"}`}
                >{m}</button>
              ))}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-white/60 font-semibold">Bet Amount</label>
                <span className="text-xs text-white/35">Min {fmtMoney(minBet)} · Max {fmtMoney(maxBet)}</span>
              </div>
              <div className="flex items-stretch gap-1 bg-[#0f212e] rounded-lg border border-white/5">
                <div className="flex items-center pl-3 flex-1">
                  <span className="text-emerald-400 font-bold text-sm mr-1">₹</span>
                  <input type="text" inputMode="decimal" value={betAmount}
                    onChange={e => setBetAmount(e.target.value.replace(/[^\d.]/g, ""))}
                    disabled={status === "ACTIVE"}
                    className="bg-transparent outline-none text-white text-sm font-semibold flex-1 min-w-0 py-2.5 disabled:opacity-60" />
                </div>
                <button onClick={() => setBetAmount(v => String(Math.max(minBet, Math.floor((parseFloat(v)||0)/2))))}
                  disabled={status === "ACTIVE"}
                  className="px-3 text-xs font-bold text-white/70 hover:text-white border-l border-white/5 disabled:opacity-40">½</button>
                <button onClick={() => setBetAmount(v => String(Math.min(maxBet, Math.floor((parseFloat(v)||0)*2))))}
                  disabled={status === "ACTIVE"}
                  className="px-3 text-xs font-bold text-white/70 hover:text-white border-l border-white/5 disabled:opacity-40">2×</button>
              </div>
              <div className="grid grid-cols-3 gap-1.5 mt-2">
                {BET_SUGGESTIONS.map(v => (
                  <button key={v} onClick={() => setBetAmount(String(v))} disabled={status === "ACTIVE"}
                    className="py-1.5 rounded-md text-[11px] font-bold transition bg-[#0f212e] border border-white/5 hover:border-emerald-500/40 hover:text-emerald-400 text-white/70 disabled:opacity-40">
                    ₹{v >= 1000 ? `${v/1000}K` : v}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-white/60 font-semibold block mb-1.5">Difficulty</label>
              <div className="flex gap-1.5">
                {DIFFICULTIES.map(d => (
                  <button key={d.value} onClick={() => setDifficulty(d.value)} disabled={status === "ACTIVE"}
                    className="flex-1 py-2 rounded-lg text-[11px] font-bold transition border disabled:opacity-40"
                    style={{
                      background:  difficulty === d.value ? `${d.color}22` : "#0f212e",
                      borderColor: difficulty === d.value ? d.color : "rgba(255,255,255,0.07)",
                      color:       difficulty === d.value ? d.color : "rgba(255,255,255,0.5)",
                    }}>{d.label}</button>
                ))}
              </div>
            </div>

            {mode === "auto" && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-white/60 font-semibold block mb-1">No. of Bets</label>
                  <input type="number" min={1} value={autoBets} onChange={e => setAutoBets(e.target.value)}
                    disabled={autoRunning}
                    className="w-full bg-[#0f212e] border border-white/5 rounded-lg px-3 py-2 text-sm text-white outline-none disabled:opacity-60" />
                </div>
                <div>
                  <label className="text-[11px] text-white/60 font-semibold block mb-1">Cash After Pumps</label>
                  <input type="number" min={1} value={autoCashAt} onChange={e => setAutoCashAt(e.target.value)}
                    disabled={autoRunning}
                    className="w-full bg-[#0f212e] border border-white/5 rounded-lg px-3 py-2 text-sm text-white outline-none disabled:opacity-60" />
                </div>
              </div>
            )}

            {mode === "manual" ? (
              <>
                <button onClick={cashout} disabled={!canCash}
                  className="w-full py-3 rounded-lg font-bold text-sm transition disabled:cursor-not-allowed"
                  style={{ background: canCash ? "#1d75ff" : "#2f4553", color: canCash ? "#fff" : "rgba(255,255,255,0.35)" }}>
                  {canCash ? `Cashout ${fmtMult(currentMult)}` : "Cashout"}
                </button>
                {status === "ACTIVE" ? (
                  <button onClick={pumpOnce} disabled={!canPump}
                    className="w-full py-3 rounded-lg font-bold text-sm bg-emerald-500 hover:bg-emerald-400 text-white disabled:opacity-50">
                    {busy === "pump" ? "Pumping…" : "Pump"}
                  </button>
                ) : (
                  <button onClick={placeBet} disabled={!canBet}
                    className="w-full py-3 rounded-lg font-bold text-sm bg-emerald-500 hover:bg-emerald-400 text-white disabled:opacity-50">
                    {(busy as string) === "bet" ? "Placing…" : "Bet"}
                  </button>
                )}
              </>
            ) : !autoRunning ? (
              <button onClick={startAuto} disabled={status === "ACTIVE"}
                className="w-full py-3 rounded-lg font-bold text-sm bg-emerald-500 hover:bg-emerald-400 text-white disabled:opacity-50">
                Start Auto Bet
              </button>
            ) : (
              <button onClick={() => setAutoRunning(false)}
                className="w-full py-3 rounded-lg font-bold text-sm bg-red-500 hover:bg-red-400 text-white">
                Stop ({autoRunCount.current}/{autoTargetRef.current})
              </button>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-white/60 font-semibold">Profit ({fmtMult(currentMult)})</label>
                <span className="text-xs text-white/40">{fmtMoney(profit)}</span>
              </div>
              <div className="flex items-center px-3 bg-[#0f212e] rounded-lg border border-white/5 py-2.5">
                <span className="text-emerald-400 font-bold text-sm mr-1">₹</span>
                <span className="flex-1 text-white text-sm font-semibold tabular-nums">{profit.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Game area ──────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

          {/* Balloon + pump stage */}
          <div
            className="flex-1 flex items-center justify-center min-h-0 py-2 transition-all duration-300"
            style={betFlash ? { boxShadow: "inset 0 0 60px 10px rgba(34,197,94,0.14)" } : undefined}
          >
            <GameVisual
              color={balloonColor}
              scale={balloonScale}
              pumping={busy === "pump"}
              popped={status === "POPPED"}
              releasing={releasing}
              showDeflated={showDeflated}
              pumpsCount={session?.pumpsCount ?? 0}
              maxPumps={session?.maxPumps ?? 8}
              currentMult={currentMult}
              status={status}
              lastWin={lastWin}
            />
          </div>

          {/* Multiplier chips */}
          <div className="px-3 pb-1 pt-0.5 flex-shrink-0">
            <div className="flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
              {!tableLoaded && <div className="text-xs text-white/40 px-2 py-2.5">Loading…</div>}
              {tableLoaded && chipMults.map((c, i) => (
                <div key={i}
                  className="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-bold tabular-nums transition-all"
                  style={{
                    background: c.isCurrent ? "#22C55E" : "#2f4553",
                    color:      c.isCurrent ? "#fff"    : "rgba(255,255,255,0.75)",
                    minWidth: 56, textAlign: "center",
                  }}>{c.mult.toFixed(2)}×</div>
              ))}
            </div>
          </div>

          {/* ── Mobile controls ──────────────────────────────────────────── */}
          <div className="lg:hidden flex-shrink-0 px-3 pb-1">
            <div className="bg-[#1a2c38] rounded-2xl p-3 flex flex-col gap-2.5">

              {/* Mode + Difficulty row */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-[#0f212e] rounded-full p-0.5 flex-shrink-0">
                  {(["manual", "auto"] as Mode[]).map(m => (
                    <button key={m} onClick={() => setMode(m)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-bold capitalize transition ${mode === m ? "bg-[#2f4553] text-white" : "text-white/40"}`}
                    >{m}</button>
                  ))}
                </div>
                <div className="flex gap-1 flex-1 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                  {DIFFICULTIES.map(d => (
                    <button key={d.value} onClick={() => setDifficulty(d.value)} disabled={status === "ACTIVE"}
                      className="flex-shrink-0 px-2 py-1.5 rounded-lg text-[10px] font-bold transition border disabled:opacity-40"
                      style={{
                        background:  difficulty === d.value ? `${d.color}22` : "#0f212e",
                        borderColor: difficulty === d.value ? d.color : "rgba(255,255,255,0.07)",
                        color:       difficulty === d.value ? d.color : "rgba(255,255,255,0.4)",
                      }}>{d.label}</button>
                  ))}
                </div>
              </div>

              {/* Auto extras */}
              {mode === "auto" && (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] text-white/50 font-semibold block mb-0.5">Bets</label>
                    <input type="number" min={1} value={autoBets} onChange={e => setAutoBets(e.target.value)}
                      disabled={autoRunning}
                      className="w-full bg-[#0f212e] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none disabled:opacity-60" />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-white/50 font-semibold block mb-0.5">Cash at pump #</label>
                    <input type="number" min={1} value={autoCashAt} onChange={e => setAutoCashAt(e.target.value)}
                      disabled={autoRunning}
                      className="w-full bg-[#0f212e] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none disabled:opacity-60" />
                  </div>
                </div>
              )}

              {/* Bet amount */}
              <div className="flex items-stretch gap-1 bg-[#0f212e] rounded-xl border border-white/5">
                <div className="flex items-center pl-3 flex-1">
                  <span className="text-emerald-400 font-bold text-sm mr-1">₹</span>
                  <input type="text" inputMode="decimal" value={betAmount}
                    onChange={e => setBetAmount(e.target.value.replace(/[^\d.]/g, ""))}
                    disabled={status === "ACTIVE"}
                    className="bg-transparent outline-none text-white text-sm font-semibold flex-1 min-w-0 py-2.5 disabled:opacity-60" />
                </div>
                <button onClick={() => setBetAmount(v => String(Math.max(minBet, Math.floor((parseFloat(v)||0)/2))))}
                  disabled={status === "ACTIVE"}
                  className="px-3 text-xs font-bold text-white/60 hover:text-white border-l border-white/5 disabled:opacity-40">½</button>
                <button onClick={() => setBetAmount(v => String(Math.min(maxBet, Math.floor((parseFloat(v)||0)*2))))}
                  disabled={status === "ACTIVE"}
                  className="px-3 text-xs font-bold text-white/60 hover:text-white border-l border-white/5 disabled:opacity-40">2×</button>
              </div>

              {/* Quick bets */}
              <div className="grid grid-cols-6 gap-1">
                {BET_SUGGESTIONS.map(v => (
                  <button key={v} onClick={() => setBetAmount(String(v))} disabled={status === "ACTIVE"}
                    className="py-1.5 rounded-lg text-[10px] font-bold transition bg-[#0f212e] border border-white/5 hover:border-emerald-500/40 hover:text-emerald-400 text-white/60 disabled:opacity-40">
                    {v >= 1000 ? `${v/1000}K` : v}
                  </button>
                ))}
              </div>

              {/* Profit strip when active */}
              {status === "ACTIVE" && (
                <div className="flex items-center justify-between px-3 py-1.5 bg-[#0f212e] rounded-lg border border-white/5">
                  <span className="text-[11px] text-white/50 font-semibold">Profit {fmtMult(currentMult)}</span>
                  <span className="text-[11px] font-bold text-emerald-400 tabular-nums">{fmtMoney(profit)}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Mobile sticky action buttons ─────────────────────────────── */}
          <div className="lg:hidden flex-shrink-0 px-3 py-2.5 bg-[#0f212e] border-t border-white/5">
            {mode === "manual" ? (
              <div className="flex gap-2">
                <button onClick={cashout} disabled={!canCash}
                  className="flex-1 py-3.5 rounded-xl font-bold text-sm transition active:scale-95 disabled:cursor-not-allowed"
                  style={{ background: canCash ? "#1d75ff" : "#1e3040", color: canCash ? "#fff" : "rgba(255,255,255,0.25)" }}>
                  {canCash ? `💰 ${fmtMult(currentMult)}` : "Cashout"}
                </button>
                {status === "ACTIVE" ? (
                  <button onClick={pumpOnce} disabled={!canPump}
                    className="flex-1 py-3.5 rounded-xl font-bold text-sm bg-emerald-500 active:bg-emerald-600 text-white disabled:opacity-50 active:scale-95 transition">
                    {busy === "pump" ? "Pumping…" : "🎈 Pump"}
                  </button>
                ) : (
                  <button onClick={placeBet} disabled={!canBet}
                    className="flex-1 py-3.5 rounded-xl font-bold text-sm bg-emerald-500 active:bg-emerald-600 text-white disabled:opacity-50 active:scale-95 transition">
                    {(busy as string) === "bet" ? "Placing…" : "Bet"}
                  </button>
                )}
              </div>
            ) : !autoRunning ? (
              <button onClick={startAuto} disabled={status === "ACTIVE"}
                className="w-full py-3.5 rounded-xl font-bold text-sm bg-emerald-500 text-white disabled:opacity-50 active:scale-95 transition">
                Start Auto Bet
              </button>
            ) : (
              <button onClick={() => setAutoRunning(false)}
                className="w-full py-3.5 rounded-xl font-bold text-sm bg-red-500 text-white active:scale-95 transition">
                Stop ({autoRunCount.current}/{autoTargetRef.current})
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
