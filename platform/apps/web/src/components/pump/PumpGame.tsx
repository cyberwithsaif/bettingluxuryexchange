"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Shield, Wallet } from "lucide-react";
import useSWR from "swr";
import { useAuthStore } from "@/lib/stores/auth";
import { api, fetcher } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

type Mode       = "manual" | "auto";
type Status     = "IDLE" | "ACTIVE" | "CASHED" | "POPPED";
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
function fmtMoney(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
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

// ── CSS Balloon + Machine visual ──────────────────────────────────────────────

interface GameVisualProps {
  color: string;
  scale: number;
  pumping: boolean;
  popped: boolean;
  releasing: boolean;
  showDeflated: boolean;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(400);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setContainerW(e.contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Scale factor: design baseline is 400px, scales down on narrow screens
  const sf = Math.min(1, Math.max(0.52, containerW / 400));

  // Balloon grows freely with each pump — no hard cap
  const balloonW = showDeflated ? 78  : 84 + pumpsCount * 20;
  const balloonH = showDeflated ? 58  : 104 + pumpsCount * 26;
  const dotCount = Math.min(8, maxPumps || 8);
  const multFontSize = Math.round(Math.min(17 + balloonW * 0.08, 36));

  return (
    <div ref={containerRef} className="relative w-full h-full" style={{ minHeight: 160 }}>

      {/* Purple ambient glow */}
      <div className="absolute pointer-events-none" style={{
        top: -80, right: -60, width: 500, height: 500,
        background: "radial-gradient(circle, rgba(77,0,255,0.14), transparent 68%)",
        zIndex: 0,
      }} />

      {/* Current multiplier — top right */}
      <div className="absolute select-none" style={{ top: 12, right: 12, textAlign: "right", zIndex: 10 }}>
        <p style={{ color: "#8fb0c8", fontSize: 10, marginBottom: 1 }}>Current Multiplier</p>
        <p style={{ color: "white", fontWeight: 900, fontSize: "clamp(24px, 7vw, 46px)", lineHeight: 1, letterSpacing: "-0.02em" }}>
          {currentMult.toFixed(2)}x
        </p>
      </div>

      {/* ── Machine + Balloon group — scaled uniformly ── */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: "50%",
        transform: `translateX(-50%) scale(${sf})`,
        transformOrigin: "bottom center",
        width: 400,
        height: 480,
        pointerEvents: "none",
      }}>

        {/* Balloon area */}
        <div style={{ position: "absolute", bottom: 260, left: "50%", transform: "translateX(-50%)", zIndex: 2 }}>
          <AnimatePresence>
            {!popped && status !== "CASHED" && (
              <motion.div
                key={`balloon-${pumpsCount}`}
                initial={pumpsCount > 0 ? { scale: 0.88 } : false}
                animate={
                  releasing
                    ? { y: -400, opacity: 0, rotate: 14, scale: 1.22 }
                    : pumping
                    ? { y: [0, -12, 0], scale: [1, 1.07, 1] }
                    : { y: [0, -14, 0, -14, 0] }
                }
                transition={
                  releasing
                    ? { duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }
                    : pumping
                    ? { duration: 0.28, ease: "easeInOut" }
                    : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }
                }
              >
                <div style={{
                  width: balloonW,
                  height: balloonH,
                  background: color,
                  borderRadius: "50% 50% 48% 48%",
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: `0 0 ${showDeflated ? 12 : 54}px ${color}66`,
                  transition: "width 0.22s ease, height 0.22s ease, box-shadow 0.22s",
                }}>
                  {!showDeflated && (
                    <div style={{
                      position: "absolute",
                      width: "22%", height: "28%",
                      background: "rgba(255,255,255,0.55)",
                      borderRadius: "50%",
                      right: "18%", top: "14%",
                      filter: "blur(1.5px)",
                      transform: "rotate(-26deg)",
                    }} />
                  )}
                  {!showDeflated && (
                    <span style={{
                      color: "rgba(255,255,255,0.85)",
                      fontWeight: 900,
                      fontSize: multFontSize,
                      letterSpacing: "-0.02em",
                      transform: "rotate(8deg)",
                      userSelect: "none",
                      position: "relative",
                      zIndex: 1,
                    }}>
                      {currentMult.toFixed(2)}x
                    </span>
                  )}
                  <div style={{
                    position: "absolute",
                    bottom: -12, left: "50%", transform: "translateX(-50%)",
                    width: 28, height: 15,
                    background: color,
                    borderRadius: "50%",
                  }} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {popped && (
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              style={{ fontSize: 82, textAlign: "center", width: 120, lineHeight: 1 }}
            >💥</motion.div>
          )}

          {status === "CASHED" && lastWin && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 220, damping: 20 }}
              style={{
                background: "rgba(34,197,94,0.11)",
                border: "2.5px solid #22C55E",
                borderRadius: 20,
                padding: "22px 44px",
                textAlign: "center",
                minWidth: 200,
              }}
            >
              <div style={{ color: "#22C55E", fontWeight: 900, fontSize: 38 }}>{lastWin.mult.toFixed(2)}×</div>
              <div style={{ color: "#86efac", fontWeight: 600, fontSize: 17, marginTop: 6 }}>{fmtMoney(lastWin.payout)}</div>
            </motion.div>
          )}
        </div>

        {/* Pipe */}
        <div style={{
          position: "absolute",
          bottom: 177, left: "50%", transform: "translateX(-50%)",
          width: 22, height: 83,
          background: "#2c4454", borderRadius: 20, zIndex: 1,
        }}>
          <div style={{
            position: "absolute", top: -10, left: -6,
            width: 34, height: 22,
            background: "#2c4454", borderRadius: "50%",
          }} />
        </div>

        {/* Pump base box */}
        <div style={{
          position: "absolute",
          bottom: 82, left: "calc(50% + 28px)",
          width: 105, height: 95,
          background: "#223847", borderRadius: 18, zIndex: 2,
        }}>
          <motion.div
            animate={{ y: pumping ? [0, 18, 0] : 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            style={{ position: "absolute", top: -30, left: "50%", transform: "translateX(-50%)" }}
          >
            <div style={{ width: 30, height: 10, background: "#3d5a75", borderRadius: 6, marginLeft: -4 }} />
            <div style={{ width: 22, height: 26, background: "#2d4659", borderRadius: "0 0 6px 6px", margin: "0 auto" }} />
          </motion.div>
          <div style={{ display: "flex", gap: 6, position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)" }}>
            {Array.from({ length: dotCount }).map((_, i) => (
              <div key={i} style={{
                width: 8, height: 8, borderRadius: "50%",
                background: pumpsCount > i ? color : "rgba(255,255,255,0.14)",
                transition: "background 0.15s",
              }} />
            ))}
          </div>
        </div>

        {/* Machine body */}
        <div style={{
          position: "absolute",
          bottom: 82, left: "calc(50% - 148px)",
          width: 132, height: 95,
          background: "#233a49", borderRadius: 28, zIndex: 2,
        }}>
          <div style={{
            position: "absolute",
            right: -60, bottom: 0,
            width: 60, height: 36,
            background: "#233a49",
          }} />
          <div style={{ display: "flex", gap: 12, position: "absolute", left: 22, top: 36 }}>
            {[false, false, true, false].map((lit, i) => (
              <div key={i} style={{
                width: 13, height: 13, borderRadius: "50%",
                background: lit ? "#ff005d" : "#09141e",
                boxShadow: lit ? "0 0 9px #ff005d" : "none",
              }} />
            ))}
          </div>
        </div>

        {/* Ground platform */}
        <div style={{
          position: "absolute",
          bottom: 44, left: "50%", transform: "translateX(-50%)",
          width: 320, height: 24,
          background: "#223847", borderRadius: 40, zIndex: 1,
        }} />

      </div>{/* end machine group */}
    </div>
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
    () => session ? 1 + session.pumpsCount * 0.12 : 1,
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

  // Sidebar button shared styles
  const inputBox = {
    background: "#132737",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 14,
  } as const;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full min-h-full flex flex-col"
      style={{ background: "linear-gradient(135deg, #07111d, #0b1c2a)", fontFamily: "Inter, sans-serif" }}>

      {/* Mobile-only Header */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ background: "#081420", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <Link href="/" className="flex items-center gap-1.5 text-white/60 hover:text-white transition">
          <ArrowLeft size={16} />
          <span className="hidden sm:inline text-xs font-semibold">Back</span>
        </Link>
        <div className="lg:hidden flex items-center gap-1.5">
          <Wallet size={12} className="text-white/40" />
          <span className="text-emerald-400 text-sm font-bold tabular-nums">
            {user ? fmtShort(balance) : "—"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-white/40">
          <Shield size={12} />
          <span className="text-[10px] uppercase tracking-wider font-semibold">Pump</span>
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
            className="absolute top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-sm font-bold shadow-2xl whitespace-nowrap"
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
        <div className="hidden lg:flex w-[360px] flex-shrink-0 flex-col p-6 overflow-y-auto"
          style={{ background: "#102433", borderRight: "1px solid rgba(255,255,255,0.05)" }}>

          {/* Balance strip */}
          <div className="flex items-center justify-between rounded-xl px-4 py-3 mb-5"
            style={{ background: "#0c1824", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-2 text-white/60">
              <Wallet size={14} />
              <span className="text-xs font-semibold uppercase tracking-wider">Balance</span>
            </div>
            <span className="text-sm font-bold text-emerald-400 tabular-nums">
              {user ? fmtMoney(balance) : "—"}
            </span>
          </div>

          {/* Mode tabs */}
          <div className="flex rounded-full p-1 mb-5" style={{ background: "#0c1824" }}>
            {(["manual", "auto"] as Mode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className="flex-1 py-3 rounded-full text-sm font-bold capitalize transition"
                style={{
                  background: mode === m ? "#1e3346" : "transparent",
                  color: mode === m ? "white" : "rgba(141,167,191,1)",
                }}>{m}</button>
            ))}
          </div>

          {/* Bet amount */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold" style={{ color: "#dce8f4" }}>Bet Amount</label>
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
                Min {fmtMoney(minBet)} · Max {fmtMoney(maxBet)}
              </span>
            </div>
            <div className="flex items-stretch h-14 rounded-2xl" style={inputBox}>
              <div className="flex items-center pl-4 flex-1">
                <span className="text-emerald-400 font-bold mr-1">₹</span>
                <input type="text" inputMode="decimal" value={betAmount}
                  onChange={e => setBetAmount(e.target.value.replace(/[^\d.]/g, ""))}
                  disabled={status === "ACTIVE"}
                  className="bg-transparent outline-none text-white font-semibold flex-1 min-w-0 disabled:opacity-60" />
              </div>
              <button onClick={() => setBetAmount(v => String(Math.max(minBet, Math.floor((parseFloat(v)||0)/2))))}
                disabled={status === "ACTIVE"}
                className="px-4 text-sm font-bold transition disabled:opacity-40"
                style={{ color: "#b6d2ea", background: "#203748", borderLeft: "1px solid rgba(255,255,255,0.06)" }}>½</button>
              <button onClick={() => setBetAmount(v => String(Math.min(maxBet, Math.floor((parseFloat(v)||0)*2))))}
                disabled={status === "ACTIVE"}
                className="px-4 text-sm font-bold rounded-r-2xl transition disabled:opacity-40"
                style={{ color: "#b6d2ea", background: "#203748", borderLeft: "1px solid rgba(255,255,255,0.06)" }}>2×</button>
            </div>
            <div className="grid grid-cols-3 gap-1.5 mt-2">
              {BET_SUGGESTIONS.map(v => (
                <button key={v} onClick={() => setBetAmount(String(v))} disabled={status === "ACTIVE"}
                  className="py-2 rounded-xl text-xs font-bold transition disabled:opacity-40"
                  style={{ background: "#0c1824", border: "1px solid rgba(255,255,255,0.06)", color: "#8da7bf" }}>
                  ₹{v >= 1000 ? `${v/1000}K` : v}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div className="mb-5">
            <label className="text-sm font-semibold block mb-2" style={{ color: "#dce8f4" }}>Difficulty</label>
            <div className="flex gap-1.5">
              {DIFFICULTIES.map(d => (
                <button key={d.value} onClick={() => setDifficulty(d.value)} disabled={status === "ACTIVE"}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold transition disabled:opacity-40"
                  style={{
                    background:  difficulty === d.value ? `${d.color}22` : "#0c1824",
                    border:      `1px solid ${difficulty === d.value ? d.color : "rgba(255,255,255,0.07)"}`,
                    color:       difficulty === d.value ? d.color : "rgba(255,255,255,0.5)",
                  }}>{d.label}</button>
              ))}
            </div>
          </div>

          {/* Auto extras */}
          {mode === "auto" && (
            <div className="grid grid-cols-2 gap-2 mb-5">
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: "#8da7bf" }}>No. of Bets</label>
                <input type="number" min={1} value={autoBets} onChange={e => setAutoBets(e.target.value)}
                  disabled={autoRunning}
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none disabled:opacity-60"
                  style={{ background: "#0c1824", border: "1px solid rgba(255,255,255,0.06)" }} />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: "#8da7bf" }}>Cash After Pumps</label>
                <input type="number" min={1} value={autoCashAt} onChange={e => setAutoCashAt(e.target.value)}
                  disabled={autoRunning}
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none disabled:opacity-60"
                  style={{ background: "#0c1824", border: "1px solid rgba(255,255,255,0.06)" }} />
              </div>
            </div>
          )}

          {/* Action buttons */}
          {mode === "manual" ? (
            <>
              <button onClick={cashout} disabled={!canCash}
                className="w-full h-14 rounded-2xl font-bold text-lg mb-3 transition hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0"
                style={{ background: canCash ? "#1f7ae0" : "#1e3346", color: "white" }}>
                {canCash ? `Cashout  ${fmtMult(currentMult)}` : "Cashout"}
              </button>
              {status === "ACTIVE" ? (
                <button onClick={pumpOnce} disabled={!canPump}
                  className="w-full h-14 rounded-2xl font-bold text-lg transition hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0"
                  style={{ background: canPump ? "#324c5a" : "#1e3346", color: "white" }}>
                  {busy === "pump" ? "Pumping…" : "🎈  Pump"}
                </button>
              ) : (
                <button onClick={placeBet} disabled={!canBet}
                  className="w-full h-14 rounded-2xl font-bold text-lg bg-emerald-500 hover:bg-emerald-400 text-white transition hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0">
                  {busy === "bet" ? "Placing…" : "Bet"}
                </button>
              )}
            </>
          ) : !autoRunning ? (
            <button onClick={startAuto} disabled={status === "ACTIVE"}
              className="w-full h-14 rounded-2xl font-bold text-lg bg-emerald-500 hover:bg-emerald-400 text-white transition disabled:opacity-50">
              Start Auto Bet
            </button>
          ) : (
            <button onClick={() => setAutoRunning(false)}
              className="w-full h-14 rounded-2xl font-bold text-lg bg-red-500 hover:bg-red-400 text-white transition">
              Stop ({autoRunCount.current}/{autoTargetRef.current})
            </button>
          )}

          {/* Profit */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold" style={{ color: "#dce8f4" }}>
                Total Profit <span style={{ color: "#8da7bf" }}>({fmtMult(currentMult)})</span>
              </label>
            </div>
            <div className="flex items-center h-14 rounded-2xl px-4" style={inputBox}>
              <span className="text-emerald-400 font-bold mr-1">₹</span>
              <span className="flex-1 text-white font-bold tabular-nums">{profit.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* ── Game area ──────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0">

          {/* Balloon stage */}
          <div
            className="flex-1 min-h-0 relative transition-all duration-300"
            style={betFlash ? { boxShadow: "inset 0 0 60px 12px rgba(34,197,94,0.12)" } : undefined}
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
          <div className="px-3 pb-1 pt-1 flex-shrink-0">
            <div className="flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
              {!tableLoaded && <div className="text-xs text-white/40 px-2 py-2.5">Loading…</div>}
              {tableLoaded && chipMults.map((c, i) => (
                <div key={i}
                  className="flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold tabular-nums transition-all"
                  style={{
                    background: c.isCurrent ? balloonColor : "#1e3346",
                    color:      c.isCurrent ? "#fff" : "rgba(255,255,255,0.65)",
                    minWidth: 58, textAlign: "center",
                  }}>{c.mult.toFixed(2)}×</div>
              ))}
            </div>
          </div>

          {/* ── Mobile controls ──────────────────────────────────────────── */}
          <div className="lg:hidden flex-shrink-0 px-3 pb-1">
            <div className="rounded-2xl p-3 flex flex-col gap-2"
              style={{ background: "#102433" }}>

              {/* Mode + Difficulty row */}
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-full p-0.5 flex-shrink-0"
                  style={{ background: "#0c1824" }}>
                  {(["manual", "auto"] as Mode[]).map(m => (
                    <button key={m} onClick={() => setMode(m)}
                      className="px-3 py-1.5 rounded-full text-[11px] font-bold capitalize transition"
                      style={{ background: mode === m ? "#1e3346" : "transparent", color: mode === m ? "white" : "#8da7bf" }}
                    >{m}</button>
                  ))}
                </div>
                <div className="flex gap-1 flex-1 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                  {DIFFICULTIES.map(d => (
                    <button key={d.value} onClick={() => setDifficulty(d.value)} disabled={status === "ACTIVE"}
                      className="flex-shrink-0 px-2 py-1.5 rounded-lg text-[10px] font-bold transition disabled:opacity-40"
                      style={{
                        background:  difficulty === d.value ? `${d.color}22` : "#0c1824",
                        border:      `1px solid ${difficulty === d.value ? d.color : "rgba(255,255,255,0.07)"}`,
                        color:       difficulty === d.value ? d.color : "rgba(255,255,255,0.4)",
                      }}>{d.label}</button>
                  ))}
                </div>
              </div>

              {mode === "auto" && (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] font-semibold block mb-0.5" style={{ color: "#8da7bf" }}>Bets</label>
                    <input type="number" min={1} value={autoBets} onChange={e => setAutoBets(e.target.value)}
                      disabled={autoRunning}
                      className="w-full rounded-lg px-2.5 py-1.5 text-xs text-white outline-none disabled:opacity-60"
                      style={{ background: "#0c1824", border: "1px solid rgba(255,255,255,0.06)" }} />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] font-semibold block mb-0.5" style={{ color: "#8da7bf" }}>Cash at pump #</label>
                    <input type="number" min={1} value={autoCashAt} onChange={e => setAutoCashAt(e.target.value)}
                      disabled={autoRunning}
                      className="w-full rounded-lg px-2.5 py-1.5 text-xs text-white outline-none disabled:opacity-60"
                      style={{ background: "#0c1824", border: "1px solid rgba(255,255,255,0.06)" }} />
                  </div>
                </div>
              )}

              {/* Bet amount */}
              <div className="flex items-stretch h-11 rounded-2xl" style={inputBox}>
                <div className="flex items-center pl-4 flex-1">
                  <span className="text-emerald-400 font-bold mr-1">₹</span>
                  <input type="text" inputMode="decimal" value={betAmount}
                    onChange={e => setBetAmount(e.target.value.replace(/[^\d.]/g, ""))}
                    disabled={status === "ACTIVE"}
                    className="bg-transparent outline-none text-white font-semibold flex-1 min-w-0 disabled:opacity-60" />
                </div>
                <button onClick={() => setBetAmount(v => String(Math.max(minBet, Math.floor((parseFloat(v)||0)/2))))}
                  disabled={status === "ACTIVE"}
                  className="px-3 text-xs font-bold transition disabled:opacity-40"
                  style={{ color: "#b6d2ea", background: "#203748", borderLeft: "1px solid rgba(255,255,255,0.06)" }}>½</button>
                <button onClick={() => setBetAmount(v => String(Math.min(maxBet, Math.floor((parseFloat(v)||0)*2))))}
                  disabled={status === "ACTIVE"}
                  className="px-3 text-xs font-bold rounded-r-2xl transition disabled:opacity-40"
                  style={{ color: "#b6d2ea", background: "#203748", borderLeft: "1px solid rgba(255,255,255,0.06)" }}>2×</button>
              </div>

              {/* Quick bets */}
              <div className="grid grid-cols-6 gap-1">
                {BET_SUGGESTIONS.map(v => (
                  <button key={v} onClick={() => setBetAmount(String(v))} disabled={status === "ACTIVE"}
                    className="py-1.5 rounded-lg text-[10px] font-bold transition disabled:opacity-40"
                    style={{ background: "#0c1824", border: "1px solid rgba(255,255,255,0.07)", color: "#8da7bf" }}>
                    {v >= 1000 ? `${v/1000}K` : v}
                  </button>
                ))}
              </div>

              {status === "ACTIVE" && (
                <div className="flex items-center justify-between px-3 py-2 rounded-xl"
                  style={{ background: "#0c1824", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <span className="text-xs font-semibold" style={{ color: "#8da7bf" }}>Profit {fmtMult(currentMult)}</span>
                  <span className="text-xs font-bold text-emerald-400 tabular-nums">{fmtMoney(profit)}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Mobile sticky action buttons ─────────────────────────────── */}
          <div className="lg:hidden flex-shrink-0 px-3 py-3"
            style={{ background: "#081420", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            {mode === "manual" ? (
              <div className="flex gap-2">
                <button onClick={cashout} disabled={!canCash}
                  className="flex-1 py-3 rounded-2xl font-bold text-sm transition active:scale-95 disabled:cursor-not-allowed"
                  style={{ background: canCash ? "#1f7ae0" : "#1e3346", color: canCash ? "#fff" : "rgba(255,255,255,0.25)" }}>
                  {canCash ? `💰 ${fmtMult(currentMult)}` : "Cashout"}
                </button>
                {status === "ACTIVE" ? (
                  <button onClick={pumpOnce} disabled={!canPump}
                    className="flex-1 py-3 rounded-2xl font-bold text-sm transition active:scale-95 disabled:opacity-50"
                    style={{ background: canPump ? "#324c5a" : "#1e3346", color: "white" }}>
                    {busy === "pump" ? "Pumping…" : "🎈 Pump"}
                  </button>
                ) : (
                  <button onClick={placeBet} disabled={!canBet}
                    className="flex-1 py-3 rounded-2xl font-bold text-sm bg-emerald-500 active:bg-emerald-600 text-white transition active:scale-95 disabled:opacity-50">
                    {busy === "bet" ? "Placing…" : "Bet"}
                  </button>
                )}
              </div>
            ) : !autoRunning ? (
              <button onClick={startAuto} disabled={status === "ACTIVE"}
                className="w-full py-3 rounded-2xl font-bold text-sm bg-emerald-500 text-white transition active:scale-95 disabled:opacity-50">
                Start Auto Bet
              </button>
            ) : (
              <button onClick={() => setAutoRunning(false)}
                className="w-full py-3 rounded-2xl font-bold text-sm bg-red-500 text-white transition active:scale-95">
                Stop ({autoRunCount.current}/{autoTargetRef.current})
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
