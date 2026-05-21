"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Shield, Wallet } from "lucide-react";
import useSWR from "swr";
import { useAuthStore } from "@/lib/stores/auth";
import { api, fetcher } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

type Mode = "manual" | "auto";
type Status = "IDLE" | "ACTIVE" | "CASHED" | "POPPED";
type Difficulty = "EASY" | "MEDIUM" | "HARD" | "EXPERT" | "INSANE";

interface ActiveSession {
  betId: string;
  betAmount: number;
  difficulty: Difficulty;
  pumpsCount: number;
  currentMult: number;
  serverSeedHash: string;
  maxPumps: number;
  multTable: number[];
  status: "ACTIVE";
}

interface PumpPublicConfig {
  enabled: boolean;
  minBet: number;
  maxBet: number;
  maxPayout: number;
  rtpPercent: number;
}

const DIFFICULTIES: { value: Difficulty; label: string; color: string }[] = [
  { value: "EASY",   label: "Easy",   color: "#22C55E" },
  { value: "MEDIUM", label: "Med",    color: "#3B82F6" },
  { value: "HARD",   label: "Hard",   color: "#F59E0B" },
  { value: "EXPERT", label: "Expert", color: "#A855F7" },
  { value: "INSANE", label: "Insane", color: "#EF4444" },
];

const BET_SUGGESTIONS = [10, 50, 100, 500, 1000, 5000];

function fmtMult(m: number): string  { return `${m.toFixed(2)}×`; }
function fmtMoney(n: number): string { return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtMoneyShort(n: number): string {
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000)    return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toFixed(2)}`;
}

function balloonColorFor(mult: number): string {
  if (mult >= 10)  return "#FFD700";
  if (mult >= 5)   return "#A855F7";
  if (mult >= 2.5) return "#22D3EE";
  if (mult >= 1.5) return "#3B82F6";
  return "#22C55E";
}

// ── Balloon SVGs ─────────────────────────────────────────────────────────────

function DeflatedBalloon({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 110 120"
      className="w-[80px] h-[87px] sm:w-[100px] sm:h-[109px] lg:w-[110px] lg:h-[120px]"
      style={{ filter: `drop-shadow(0 4px 16px ${color}44)` }}
    >
      <path
        d="M 38 110 Q 30 95, 32 78 Q 30 55, 42 35 Q 50 18, 68 14
           Q 88 14, 90 32 Q 88 50, 78 60 Q 70 70, 65 80
           Q 62 92, 60 105 Q 58 115, 50 115 Z"
        fill={color}
      />
    </svg>
  );
}

function Balloon({ scale, color }: { scale: number; color: string }) {
  return (
    <motion.svg
      viewBox="0 0 240 290"
      className="w-[150px] h-[181px] sm:w-[200px] sm:h-[242px] lg:w-[240px] lg:h-[290px]"
      animate={{ scale }}
      transition={{ type: "spring", stiffness: 90, damping: 18 }}
      style={{ filter: `drop-shadow(0 8px 32px ${color}55)` }}
    >
      <ellipse cx="120" cy="130" rx="90" ry="105" fill={color} />
      <ellipse cx="90"  cy="85"  rx="20" ry="30"  fill="white" opacity="0.55" />
      <path d="M110 232 L120 248 L130 232 Z" fill={color} />
      <rect x="114" y="244" width="12" height="14" fill="#475569" />
    </motion.svg>
  );
}

function PumpMachine({ active }: { active: boolean }) {
  return (
    <motion.svg
      viewBox="0 0 340 80"
      className="w-[220px] h-[52px] sm:w-[280px] sm:h-[66px] lg:w-[340px] lg:h-[80px]"
      animate={active ? { y: [0, -1.5, 0] } : { y: 0 }}
      transition={{ duration: 0.25, repeat: active ? Infinity : 0 }}
    >
      <rect x="0"   y="50" width="340" height="30" rx="14" fill="#2A3441" />
      <rect x="148" y="20" width="44"  height="35" rx="6"  fill="#2A3441" />
      <rect x="158" y="10" width="24"  height="14" rx="4"  fill="#2A3441" />
    </motion.svg>
  );
}

// ── Sound Engine ─────────────────────────────────────────────────────────────

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
        o.type = "sine"; o.connect(og); og.connect(ctx.destination);
        o.frequency.value = freq;
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

// ── Main Component ────────────────────────────────────────────────────────────

export function PumpGame() {
  const user = useAuthStore(s => s.user);
  const { data: pumpCfg } = useSWR<PumpPublicConfig>("/casino/pump/config", fetcher, { revalidateOnFocus: false });
  const { data: walletData, mutate: mutateWallet } = useSWR<{ available: number }>(user ? "/wallet/summary" : null, fetcher);

  const minBet = pumpCfg?.minBet ?? 10;
  const maxBet = pumpCfg?.maxBet ?? 100_000;
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
    if (isNaN(amt) || amt < minBet) { notify(`Min bet is ₹${minBet}`, false); return; }
    if (amt > maxBet)  { notify(`Max bet is ₹${maxBet}`, false); return; }
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
        setSession(prev => prev ? { ...prev, pumpsCount: data.pumpsCount, currentMult: data.currentMult } : prev);
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
    const t = setTimeout(() => reset(), 1800);
    return () => clearTimeout(t);
  }, [status, reset]);

  useEffect(() => {
    if (!autoRunning) return;
    if (status === "IDLE") {
      if (autoRunCount.current >= autoTargetRef.current) { setAutoRunning(false); return; }
      placeBet(); return;
    }
    if (status === "ACTIVE" && session) {
      const cashAtPumps = parseInt(autoCashAt);
      if (!isNaN(cashAtPumps) && session.pumpsCount >= cashAtPumps) { cashout(); }
      else { const t = setTimeout(() => { pumpOnce(); }, 300); return () => clearTimeout(t); }
    }
    if (status === "CASHED" || status === "POPPED") { autoRunCount.current += 1; }
  }, [autoRunning, status, session, autoCashAt, placeBet, pumpOnce, cashout]);

  const startAuto = () => {
    const n = parseInt(autoBets);
    autoTargetRef.current = isNaN(n) || n < 1 ? 1 : n;
    autoRunCount.current = 0; setAutoRunning(true);
  };
  const stopAuto = () => setAutoRunning(false);

  // ── Derived ───────────────────────────────────────────────────────────────
  const currentMult  = session?.currentMult ?? 1.00;
  const balloonScale = useMemo(() => session ? Math.min(1 + session.pumpsCount * 0.06, 1.6) : 1, [session]);
  const balloonColor = balloonColorFor(currentMult);
  const profit = session ? Math.round(session.betAmount * session.currentMult * 100) / 100 - session.betAmount : 0;

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

  // ── Shared sub-sections ───────────────────────────────────────────────────

  /** The balloon + pump machine stack */
  const balloonStage = (
    <div
      className="flex-1 flex flex-col items-center justify-end relative px-4 transition-all duration-300"
      style={betFlash ? { boxShadow: "inset 0 0 60px 10px rgba(34,197,94,0.18)" } : undefined}
    >
      {/* Win / Pop banner */}
      <AnimatePresence>
        {status === "CASHED" && lastWin && (
          <motion.div
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-center z-10 whitespace-nowrap"
          >
            <p className="text-emerald-400 text-[10px] uppercase tracking-widest font-bold">Cashed Out {fmtMult(lastWin.mult)}</p>
            <p className="text-emerald-300 text-xl font-black mt-0.5">{fmtMoney(lastWin.payout)}</p>
          </motion.div>
        )}
        {status === "POPPED" && poppedMult != null && (
          <motion.div
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-xl bg-red-500/20 border border-red-400/40 text-center z-10"
          >
            <p className="text-red-400 text-[10px] uppercase tracking-widest font-bold">Balloon Popped!</p>
            <p className="text-red-300 text-lg font-black mt-0.5">Lost {fmtMoney(session?.betAmount ?? 0)}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Balloon */}
      <div className="relative flex flex-col items-center">
        <div className="flex items-end justify-center" style={{ minHeight: 160 }}>
          <AnimatePresence mode="wait">
            {status === "POPPED" ? (
              <motion.div key="popped" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="text-6xl sm:text-7xl">
                💥
              </motion.div>
            ) : showDeflated ? (
              <motion.div key="deflated" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ marginBottom: -6 }}>
                <DeflatedBalloon color={balloonColor} />
              </motion.div>
            ) : (
              <motion.div
                key="inflated"
                initial={{ opacity: 0, scale: 0.6, y: 0, rotate: 0 }}
                animate={releasing
                  ? { opacity: 0, y: -480, scale: 1.25, rotate: 12 }
                  : { opacity: 1, scale: 1,   y: 0,    rotate: 0 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={releasing
                  ? { duration: 0.72, ease: [0.22, 0.61, 0.36, 1] }
                  : { type: "spring", stiffness: 90, damping: 18 }}
                className="relative"
              >
                <Balloon scale={balloonScale} color={balloonColor} />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ marginTop: "-26px" }}>
                  <span className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight"
                    style={{ textShadow: "0 2px 16px rgba(0,0,0,0.4)" }}>
                    {currentMult.toFixed(2)}x
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Pump machine */}
        <div style={{ marginTop: -4 }}>
          <PumpMachine active={busy === "pump"} />
        </div>

        {/* Pump-count dots */}
        <div className="flex items-center gap-1.5 -mt-9 sm:-mt-10 lg:-mt-12 ml-[-110px] sm:ml-[-150px] lg:ml-[-180px]">
          {Array.from({ length: Math.min(8, session?.maxPumps ?? 8) }).map((_, i) => (
            <div key={i} className="rounded-full transition-all"
              style={{ width: 5, height: 5, background: (session?.pumpsCount ?? 0) > i ? "#22C55E" : "rgba(255,255,255,0.15)" }} />
          ))}
        </div>
      </div>
    </div>
  );

  /** Multiplier chips row */
  const chipsRow = (
    <div className="px-3 pb-2 pt-1">
      <div className="flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
        {!tableLoaded && <div className="text-xs text-white/40 px-2 py-2.5">Loading…</div>}
        {tableLoaded && chipMults.map((c, i) => (
          <div key={i}
            className="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-bold tabular-nums transition-all"
            style={{
              background: c.isCurrent ? "#22C55E" : "#2f4553",
              color:      c.isCurrent ? "#fff"    : "rgba(255,255,255,0.75)",
              minWidth: 58, textAlign: "center",
            }}
          >
            {c.mult.toFixed(2)}×
          </div>
        ))}
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-[100dvh] w-full flex flex-col bg-[#0f212e] overflow-hidden">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-[#0a1922] flex-shrink-0">
        <Link href="/" className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white">
          <ArrowLeft size={16} />
          <span className="hidden sm:inline text-xs">Back</span>
        </Link>

        {/* Balance — visible on mobile in header */}
        <div className="lg:hidden flex items-center gap-1.5">
          <Wallet size={12} className="text-white/40" />
          <span className="text-emerald-400 text-sm font-bold tabular-nums">
            {user ? fmtMoneyShort(balance) : "—"}
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

      {/* ── Toast ────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="absolute top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm font-semibold shadow-2xl"
            style={{
              background: toast.ok ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
              border: `1px solid ${toast.ok ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`,
              color:  toast.ok ? "#22C55E" : "#EF4444",
            }}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">

        {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
        <div className="hidden lg:flex w-[340px] flex-shrink-0 flex-col p-5 bg-[#0f212e] border-r border-white/5 overflow-y-auto">
          <div className="rounded-2xl bg-[#1a2c38] p-4 flex flex-col gap-4">

            {/* Balance */}
            <div className="flex items-center justify-between rounded-lg bg-[#0f212e] px-3 py-2.5 border border-white/5">
              <div className="flex items-center gap-2 text-white/60">
                <Wallet size={14} />
                <span className="text-xs font-semibold uppercase tracking-wider">Balance</span>
              </div>
              <span className="text-sm font-bold text-emerald-400 tabular-nums">
                {user ? fmtMoney(balance) : "—"}
              </span>
            </div>

            {/* Manual / Auto */}
            <div className="flex items-center bg-[#0f212e] rounded-full p-1">
              {(["manual", "auto"] as Mode[]).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={`flex-1 py-2 rounded-full text-sm font-semibold capitalize transition ${mode === m ? "bg-[#2f4553] text-white" : "text-white/50 hover:text-white"}`}
                >{m}</button>
              ))}
            </div>

            {/* Bet Amount */}
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
                    className="bg-transparent outline-none text-white text-sm font-semibold flex-1 min-w-0 py-2.5 disabled:opacity-60"
                  />
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

            {/* Difficulty */}
            <div>
              <label className="text-xs text-white/60 font-semibold block mb-1.5">Difficulty</label>
              <div className="flex gap-1.5">
                {DIFFICULTIES.map(d => (
                  <button key={d.value} onClick={() => setDifficulty(d.value)} disabled={status === "ACTIVE"}
                    className="flex-1 py-2 rounded-lg text-[11px] font-bold transition border disabled:opacity-40"
                    style={{
                      background:   difficulty === d.value ? `${d.color}22` : "#0f212e",
                      borderColor:  difficulty === d.value ? d.color : "rgba(255,255,255,0.07)",
                      color:        difficulty === d.value ? d.color : "rgba(255,255,255,0.5)",
                    }}
                  >{d.label}</button>
                ))}
              </div>
            </div>

            {/* Auto extras */}
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

            {/* Desktop action buttons */}
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
              <button onClick={stopAuto}
                className="w-full py-3 rounded-lg font-bold text-sm bg-red-500 hover:bg-red-400 text-white">
                Stop ({autoRunCount.current}/{autoTargetRef.current})
              </button>
            )}

            {/* Profit */}
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

        {/* ── Game area (both mobile and desktop center) ───────────────────── */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

          {/* Balloon stage */}
          <div className="flex-1 min-h-0 flex flex-col pb-1">
            {balloonStage}
          </div>

          {/* Multiplier chips */}
          {chipsRow}

          {/* ── Mobile controls ─────────────────────────────────────────── */}
          <div className="lg:hidden flex-shrink-0 px-3 pb-1">
            <div className="bg-[#1a2c38] rounded-2xl p-3 flex flex-col gap-2.5">

              {/* Row 1: Manual/Auto + Difficulty inline */}
              <div className="flex items-center gap-2">
                {/* Mode toggle */}
                <div className="flex items-center bg-[#0f212e] rounded-full p-0.5 flex-shrink-0">
                  {(["manual", "auto"] as Mode[]).map(m => (
                    <button key={m} onClick={() => setMode(m)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-bold capitalize transition ${mode === m ? "bg-[#2f4553] text-white" : "text-white/40"}`}
                    >{m}</button>
                  ))}
                </div>
                {/* Difficulty pills */}
                <div className="flex gap-1 flex-1 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                  {DIFFICULTIES.map(d => (
                    <button key={d.value} onClick={() => setDifficulty(d.value)} disabled={status === "ACTIVE"}
                      className="flex-shrink-0 px-2 py-1.5 rounded-lg text-[10px] font-bold transition border disabled:opacity-40"
                      style={{
                        background:  difficulty === d.value ? `${d.color}22` : "#0f212e",
                        borderColor: difficulty === d.value ? d.color : "rgba(255,255,255,0.07)",
                        color:       difficulty === d.value ? d.color : "rgba(255,255,255,0.4)",
                      }}
                    >{d.label}</button>
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

              {/* Row 2: Bet amount */}
              <div className="flex items-stretch gap-1 bg-[#0f212e] rounded-xl border border-white/5">
                <div className="flex items-center pl-3 flex-1">
                  <span className="text-emerald-400 font-bold text-sm mr-1">₹</span>
                  <input type="text" inputMode="decimal" value={betAmount}
                    onChange={e => setBetAmount(e.target.value.replace(/[^\d.]/g, ""))}
                    disabled={status === "ACTIVE"}
                    className="bg-transparent outline-none text-white text-sm font-semibold flex-1 min-w-0 py-2.5 disabled:opacity-60"
                  />
                </div>
                <button onClick={() => setBetAmount(v => String(Math.max(minBet, Math.floor((parseFloat(v)||0)/2))))}
                  disabled={status === "ACTIVE"}
                  className="px-3 text-xs font-bold text-white/60 hover:text-white border-l border-white/5 disabled:opacity-40">½</button>
                <button onClick={() => setBetAmount(v => String(Math.min(maxBet, Math.floor((parseFloat(v)||0)*2))))}
                  disabled={status === "ACTIVE"}
                  className="px-3 text-xs font-bold text-white/60 hover:text-white border-l border-white/5 disabled:opacity-40">2×</button>
              </div>

              {/* Row 3: Quick suggestions */}
              <div className="grid grid-cols-6 gap-1">
                {BET_SUGGESTIONS.map(v => (
                  <button key={v} onClick={() => setBetAmount(String(v))} disabled={status === "ACTIVE"}
                    className="py-1.5 rounded-lg text-[10px] font-bold transition bg-[#0f212e] border border-white/5 hover:border-emerald-500/40 hover:text-emerald-400 text-white/60 disabled:opacity-40">
                    {v >= 1000 ? `${v/1000}K` : v}
                  </button>
                ))}
              </div>

              {/* Profit strip (when active) */}
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
                {/* Cashout */}
                <button onClick={cashout} disabled={!canCash}
                  className="flex-1 py-3.5 rounded-xl font-bold text-sm transition active:scale-95 disabled:cursor-not-allowed"
                  style={{ background: canCash ? "#1d75ff" : "#1e3040", color: canCash ? "#fff" : "rgba(255,255,255,0.25)" }}>
                  {canCash ? `💰 ${fmtMult(currentMult)}` : "Cashout"}
                </button>
                {/* Pump / Bet */}
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
              <button onClick={stopAuto}
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
