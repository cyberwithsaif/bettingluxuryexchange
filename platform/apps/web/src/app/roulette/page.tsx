"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Volume2, VolumeX, Users, TrendingUp, Clock, Zap, RotateCcw, Trophy } from "lucide-react";
import Link from "next/link";
import { getSocket } from "@/lib/socket";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";
import { RouletteWheel } from "@/components/roulette/RouletteWheel";
import useSWR from "swr";

export const dynamic = "force-dynamic";

// ── Mini Roulette config ─────────────────────────────────────────────────────
const MINI_RED   = new Set([1, 3, 5, 7, 9]);
const MINI_BLACK = new Set([2, 4, 6, 8]);
const CHIPS      = [10, 50, 100, 500, 1000, 5000];

type BetType = "number" | "red" | "black" | "green" | "odd" | "even" | "high" | "low";
type Phase   = "BETTING" | "CLOSED" | "SPINNING" | "SETTLED";

interface CurrentRound {
  id: string; roundNumber: number;
  status: "BETTING" | "SPINNING" | "SETTLED";
  phase: Phase;
  serverSeedHash: string;
  winningNumber: number | null; winningColor: string | null;
  phaseEndsAt: number; betsCount: number; totalWagered: number;
}
interface HistoryRound { id: string; roundNumber: number; winningNumber: number; winningColor: string; settledAt: string; }
interface LocalBet { betType: BetType; betValue?: string | null; amount: number; id?: string; }
interface WinEntry { id: string; number: number; color: string; payout: number; username: string; ts: number; }

const PAYOUTS: Record<BetType, string> = {
  number: "9×", red: "2×", black: "2.25×", green: "9×",
  odd: "1.95×", even: "2.25×", high: "1.95×", low: "1.95×",
};

function numColor(n: number): string {
  if (n === 0) return "#00c853";
  return MINI_RED.has(n) ? "#e53935" : "#1a1a1a";
}
function numLabel(n: number) {
  return n === 0 ? "green" : MINI_RED.has(n) ? "red" : "black";
}
function fmt(n: number) { return new Intl.NumberFormat("en-IN").format(n); }

const CHIP_STYLE: Record<number, { bg: string; color: string; shadow: string }> = {
  10:   { bg: "linear-gradient(145deg,#ff9a00,#ffcc00)",   color: "#000",   shadow: "0 2px 8px rgba(255,180,0,0.5)" },
  50:   { bg: "linear-gradient(145deg,#fff,#ccc)",          color: "#000",   shadow: "0 2px 8px rgba(200,200,200,0.5)" },
  100:  { bg: "linear-gradient(145deg,#38bdf8,#2563eb)",   color: "#fff",   shadow: "0 2px 8px rgba(56,189,248,0.5)" },
  500:  { bg: "linear-gradient(145deg,#10b981,#065f46)",   color: "#fff",   shadow: "0 2px 8px rgba(16,185,129,0.5)" },
  1000: { bg: "linear-gradient(145deg,#a855f7,#6d28d9)",   color: "#fff",   shadow: "0 2px 8px rgba(168,85,247,0.5)" },
  5000: { bg: "linear-gradient(145deg,#ef4444,#991b1b)",   color: "#fff",   shadow: "0 2px 8px rgba(239,68,68,0.5)" },
};

const FAKE_NAMES = ["Arjun","Priya","Rahul","Sneha","Vijay","Kavitha","Suresh","Ananya","Ravi","Pooja","Kiran","Deepa","Mohan","Nisha","Arun"];

export default function MiniRoulettePage() {
  const user = useAuthStore(s => s.user);

  // Round state
  const [round, setRound]           = useState<CurrentRound | null>(null);
  const [phase, setPhase]           = useState<Phase>("BETTING");
  const [secondsLeft, setSecsLeft]  = useState(0);
  const [spinKey, setSpinKey]       = useState(0);
  const [winningNumber, setWinNum]  = useState<number | null>(null);
  const [winningColor, setWinColor] = useState<string | null>(null);

  // Betting
  const [chip, setChip]             = useState(100);
  const [bets, setBets]             = useState<LocalBet[]>([]);
  const [myWin, setMyWin]           = useState<{ amount: number; number: number } | null>(null);

  // UI
  const [muted, setMuted]           = useState(false);
  const [history, setHistory]       = useState<HistoryRound[]>([]);
  const [winFeed, setWinFeed]       = useState<WinEntry[]>([]);
  const [playerCount, setPlayerCount] = useState(0);
  const [totalWagered, setTotalWagered] = useState(0);
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);
  const [showMyBets, setShowMyBets] = useState(false);
  const [myBetsHistory, setMyBetsHistory] = useState<any[]>([]);

  const audioCtx  = useRef<AudioContext | null>(null);
  const spinAudio = useRef<HTMLAudioElement | null>(null);
  const timerRef  = useRef<NodeJS.Timeout | null>(null);

  // Wallet
  const { data: wallet, mutate: mutateWallet } = useSWR<{ balance: number }>("/wallet/summary");

  // ── Helpers ────────────────────────────────────────────────────────────────
  function playChipSound() {
    if (muted) return;
    try {
      const ctx = audioCtx.current ?? new AudioContext();
      audioCtx.current = ctx;
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = "sine"; o.frequency.setValueAtTime(880, ctx.currentTime);
      g.gain.setValueAtTime(0.15, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      o.start(); o.stop(ctx.currentTime + 0.12);
    } catch { /* ignore */ }
  }

  function playWinSound() {
    if (muted) return;
    try {
      const ctx = audioCtx.current ?? new AudioContext();
      audioCtx.current = ctx;
      [523, 659, 784, 1047].forEach((f, i) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.1);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.3);
        o.start(ctx.currentTime + i * 0.1); o.stop(ctx.currentTime + i * 0.1 + 0.3);
      });
    } catch { /* ignore */ }
  }

  function startTimer(endsAt: number) {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setSecsLeft(left);
      if (left === 0 && timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }, 250);
  }

  const applyRound = useCallback((r: CurrentRound) => {
    setRound(r);
    setPhase((r.phase ?? r.status) as Phase);
    setTotalWagered(r.totalWagered ?? 0);
    setPlayerCount(r.betsCount ?? 0);
    if (r.winningNumber != null) { setWinNum(r.winningNumber); setWinColor(r.winningColor); }
    if (r.phaseEndsAt) startTimer(r.phaseEndsAt);
  }, []);

  // ── Fetch initial round + history ─────────────────────────────────────────
  useEffect(() => {
    api.get("/roulette/current").then(({ data }) => { if (data) applyRound(data); }).catch(() => {});
    api.get("/roulette/history?limit=20").then(({ data }) => setHistory(data ?? [])).catch(() => {});
  }, [applyRound]);

  // ── Socket ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    socket.emit("joinRoom", "roulette");

    socket.on("roulette:newRound", (d: any) => {
      setPhase("BETTING");
      setWinNum(null); setWinColor(null);
      setBets([]); setMyWin(null);
      applyRound({ ...d, status: "BETTING", phase: "BETTING", winningNumber: null, winningColor: null, betsCount: 0, totalWagered: 0 });
    });

    socket.on("roulette:bettingClosed", (d: any) => {
      setPhase("CLOSED");
      if (d.phaseEndsAt) startTimer(d.phaseEndsAt);
    });

    socket.on("roulette:betPlaced", (d: any) => {
      setPlayerCount(p => p + 1);
      setTotalWagered(t => t + (d.amount ?? 0));
    });

    socket.on("roulette:spin", (d: any) => {
      setPhase("SPINNING");
      setWinNum(d.winningNumber);
      setWinColor(d.winningColor);
      setSpinKey(k => k + 1);
      if (d.phaseEndsAt) startTimer(d.phaseEndsAt);
      if (!muted && spinAudio.current) {
        spinAudio.current.currentTime = 0;
        spinAudio.current.play().catch(() => {});
      }
    });

    socket.on("roulette:result", (d: any) => {
      setPhase("SETTLED");
      if (d.phaseEndsAt) startTimer(d.phaseEndsAt);
      setHistory(h => [{ id: d.roundId, roundNumber: 0, winningNumber: d.winningNumber, winningColor: d.winningColor, settledAt: new Date().toISOString() }, ...h.slice(0, 19)]);

      // My win?
      const myBet = (d.bets ?? []).find((b: any) => b.userId === user?.id && b.isWin);
      if (myBet) {
        setMyWin({ amount: myBet.payout, number: d.winningNumber });
        playWinSound();
        mutateWallet();
      }

      // Win feed
      const winners = (d.bets ?? []).filter((b: any) => b.isWin && b.payout > 0);
      const feedEntries: WinEntry[] = winners.map((b: any) => ({
        id: b.betId,
        number: d.winningNumber,
        color: d.winningColor,
        payout: b.payout,
        username: b.userId === user?.id ? (user?.username ?? "You") : FAKE_NAMES[Math.floor(Math.random() * FAKE_NAMES.length)]!,
        ts: Date.now(),
      }));
      if (feedEntries.length === 0 && Math.random() < 0.6) {
        feedEntries.push({
          id: `fake-${Date.now()}`, number: d.winningNumber, color: d.winningColor,
          payout: [200, 450, 900, 1950, 2250][Math.floor(Math.random() * 5)]!,
          username: FAKE_NAMES[Math.floor(Math.random() * FAKE_NAMES.length)]!,
          ts: Date.now(),
        });
      }
      setWinFeed(f => [...feedEntries, ...f].slice(0, 8));
    });

    return () => {
      socket.off("roulette:newRound");
      socket.off("roulette:bettingClosed");
      socket.off("roulette:betPlaced");
      socket.off("roulette:spin");
      socket.off("roulette:result");
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, muted]);

  // ── Place bet ─────────────────────────────────────────────────────────────
  async function placeBet(betType: BetType, betValue?: string) {
    if (phase !== "BETTING") { setErrorMsg("Betting is closed"); return; }
    if (!user) { setErrorMsg("Login to bet"); return; }
    const amount = chip;
    playChipSound();
    // Optimistic
    setBets(b => [...b, { betType, betValue, amount }]);
    try {
      await api.post("/roulette/bet", { betType, betValue, amount });
      mutateWallet();
    } catch (e: any) {
      setBets(b => b.slice(0, -1));
      setErrorMsg(e?.response?.data?.message ?? "Bet failed");
      setTimeout(() => setErrorMsg(null), 3000);
    }
  }

  function clearBets() { setBets([]); }
  const totalBet = bets.reduce((s, b) => s + b.amount, 0);

  // Summarise my bets for display
  const betSummary = bets.reduce<Record<string, number>>((acc, b) => {
    const key = b.betType + (b.betValue != null ? `:${b.betValue}` : "");
    acc[key] = (acc[key] ?? 0) + b.amount;
    return acc;
  }, {});

  const canBet = phase === "BETTING";

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0c0c14] text-white flex flex-col overflow-x-hidden" style={{ fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <audio ref={spinAudio} src="/sounds/roulette-spin.mp3" preload="none" />

      {/* ── Top Bar ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 flex items-center gap-3 px-4 py-3 border-b border-white/5"
        style={{ background: "rgba(12,12,20,0.95)", backdropFilter: "blur(12px)" }}>
        <Link href="/casino" className="flex items-center gap-1.5 text-gray-400 hover:text-white transition">
          <ArrowLeft size={16} /> <span className="text-sm hidden sm:inline">Casino</span>
        </Link>
        <div className="flex-1 text-center">
          <span className="font-black text-base tracking-tight" style={{ background: "linear-gradient(90deg,#ff6b6b,#ffd700,#00e676)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Mini Roulette
          </span>
        </div>
        <div className="flex items-center gap-3">
          {wallet && (
            <span className="text-sm font-bold text-yellow-400">₹{fmt(wallet.balance)}</span>
          )}
          <button onClick={() => setMuted(m => !m)} className="text-gray-400 hover:text-white transition">
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>
      </div>

      {/* ── Live stats strip ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-6 px-4 py-2 border-b border-white/5" style={{ background: "rgba(255,255,255,0.02)" }}>
        <Stat Icon={Users}      label="Players"  value={playerCount} />
        <Stat Icon={TrendingUp} label="Pool"     value={`₹${fmt(totalWagered)}`} />
        <Stat Icon={Clock}      label="Round"    value={round?.roundNumber ?? "—"} />
        <PhaseChip phase={phase} seconds={secondsLeft} />
      </div>

      {/* ── Main layout ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row flex-1 gap-0 lg:gap-4 px-2 lg:px-6 py-4 lg:py-6 max-w-6xl mx-auto w-full">

        {/* LEFT: Wheel + History */}
        <div className="flex flex-col items-center gap-4 lg:w-[380px] lg:shrink-0">
          <div className="relative">
            <RouletteWheel phase={phase} winningNumber={winningNumber} spinKey={spinKey} />

            {/* Big win overlay */}
            <AnimatePresence>
              {myWin && phase === "SETTLED" && (
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none z-50"
                >
                  <div className="rounded-2xl border-2 border-yellow-400 px-6 py-4 text-center"
                    style={{ background: "rgba(0,0,0,0.85)", boxShadow: "0 0 40px rgba(255,200,0,0.5)" }}>
                    <div className="text-xs uppercase tracking-widest text-yellow-400 mb-1">You Won!</div>
                    <div className="text-4xl font-black text-yellow-300">+₹{fmt(myWin.amount)}</div>
                    <div className="text-sm text-gray-400 mt-1">Number {myWin.number}</div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Recent results history */}
          <div className="w-full">
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2 text-center">Recent Results</div>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {history.slice(0, 20).map((h, i) => (
                <div key={h.id ?? i}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black border-2 transition-all"
                  style={{
                    background: numColor(h.winningNumber),
                    borderColor: h.winningColor === "green" ? "#00c853" : h.winningColor === "red" ? "#ff5252" : "#555",
                    color: "#fff",
                    boxShadow: i === 0 ? `0 0 10px 3px ${numColor(h.winningNumber)}` : "none",
                  }}>
                  {h.winningNumber}
                </div>
              ))}
            </div>
          </div>

          {/* Win feed */}
          <div className="w-full rounded-xl border border-white/8 overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
            <div className="px-3 py-2 border-b border-white/5 text-[10px] uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
              <Trophy size={10} className="text-yellow-400" /> Recent Winners
            </div>
            <div className="divide-y divide-white/5 max-h-40 overflow-y-auto">
              <AnimatePresence>
                {winFeed.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-gray-600">Waiting for results…</div>
                ) : winFeed.map(w => (
                  <motion.div key={w.id}
                    initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                    className="flex items-center justify-between px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black"
                        style={{ background: numColor(w.number), color: "#fff" }}>{w.number}</div>
                      <span className="text-gray-300 font-medium">{w.username}</span>
                    </div>
                    <span className="text-emerald-400 font-bold">+₹{fmt(w.payout)}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* RIGHT: Betting panel */}
        <div className="flex-1 flex flex-col gap-4 mt-4 lg:mt-0">

          {/* Error toast */}
          <AnimatePresence>
            {errorMsg && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-red-300 border border-red-500/30"
                style={{ background: "rgba(239,68,68,0.08)" }}>
                {errorMsg}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Chip selector */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Select Chip</div>
            <div className="flex gap-2 flex-wrap">
              {CHIPS.map(c => {
                const s = CHIP_STYLE[c]!;
                return (
                  <button key={c} onClick={() => setChip(c)}
                    className="relative rounded-full font-black text-xs transition-all duration-150"
                    style={{
                      width: 48, height: 48,
                      background: s.bg, color: s.color,
                      boxShadow: chip === c ? `0 0 0 3px #ffcc00, ${s.shadow}` : s.shadow,
                      transform: chip === c ? "scale(1.15)" : "scale(1)",
                      border: chip === c ? "2px solid #ffcc00" : "2px solid transparent",
                    }}>
                    {c >= 1000 ? `${c/1000}K` : c}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color / chance bets */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Color & Chance</div>
            <div className="grid grid-cols-3 gap-2">
              <BetBtn label="RED"   sub="2×"     color="#e53935" onClick={() => placeBet("red")}   disabled={!canBet} glowColor="rgba(229,57,53,0.6)" />
              <BetBtn label="BLACK" sub="2.25×"  color="#444"    onClick={() => placeBet("black")} disabled={!canBet} glowColor="rgba(100,100,100,0.5)" />
              <BetBtn label="GREEN 0" sub="9×"   color="#00c853" onClick={() => placeBet("green","0")} disabled={!canBet} glowColor="rgba(0,200,83,0.6)" />
            </div>
            <div className="grid grid-cols-4 gap-2 mt-2">
              <BetBtn label="ODD"  sub="1.95×" color="#7c3aed" onClick={() => placeBet("odd")}  disabled={!canBet} glowColor="rgba(124,58,237,0.5)" />
              <BetBtn label="EVEN" sub="2.25×" color="#7c3aed" onClick={() => placeBet("even")} disabled={!canBet} glowColor="rgba(124,58,237,0.5)" />
              <BetBtn label="LOW 0-4" sub="1.95×" color="#0ea5e9" onClick={() => placeBet("low")}  disabled={!canBet} glowColor="rgba(14,165,233,0.5)" />
              <BetBtn label="HIGH 5-9" sub="1.95×" color="#0ea5e9" onClick={() => placeBet("high")} disabled={!canBet} glowColor="rgba(14,165,233,0.5)" />
            </div>
          </div>

          {/* Number buttons 0-9 */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Straight Up — 9×</div>
            <div className="grid grid-cols-5 gap-2">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                <button key={n} onClick={() => placeBet("number", String(n))} disabled={!canBet}
                  className="relative h-14 rounded-xl font-black text-xl transition-all duration-150 border-2 flex flex-col items-center justify-center"
                  style={{
                    background: numColor(n),
                    borderColor: canBet ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
                    opacity: canBet ? 1 : 0.6,
                    boxShadow: canBet ? `0 4px 16px ${numColor(n)}55` : "none",
                    cursor: canBet ? "pointer" : "not-allowed",
                  }}>
                  <span className="text-white leading-none">{n}</span>
                  {betSummary[`number:${n}`] && (
                    <span className="absolute -top-1 -right-1 bg-yellow-400 text-black text-[9px] font-black rounded-full px-1 leading-4">
                      ₹{betSummary[`number:${n}`]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Custom amount + controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 bg-white/5">
              <span className="text-xs text-gray-400">Custom</span>
              <span className="text-yellow-400 text-sm font-black">₹</span>
              <input type="number" min={10} placeholder="amount"
                className="w-24 bg-transparent text-sm text-white outline-none"
                onChange={e => { const v = Number(e.target.value); if (v >= 10) setChip(v); }} />
            </div>
            {bets.length > 0 && (
              <button onClick={clearBets} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-500/30 text-red-400 text-xs hover:bg-red-500/10 transition">
                <RotateCcw size={13} /> Clear
              </button>
            )}
          </div>

          {/* Current bets summary */}
          {bets.length > 0 && (
            <div className="rounded-xl border border-white/8 p-3" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Your Bets</div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {Object.entries(betSummary).map(([key, amt]) => {
                  const [type, val] = key.split(":");
                  return (
                    <span key={key} className="rounded-full px-2.5 py-1 text-[11px] font-bold border border-white/10 text-gray-200" style={{ background: "rgba(255,255,255,0.06)" }}>
                      {type === "number" ? `#${val}` : type?.toUpperCase()} · ₹{fmt(amt)}
                    </span>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">{bets.length} bet{bets.length > 1 ? "s" : ""}</span>
                <span className="font-black text-yellow-400">Total: ₹{fmt(totalBet)}</span>
              </div>
            </div>
          )}

          {/* My bets history toggle */}
          <button onClick={async () => {
            setShowMyBets(v => !v);
            if (!showMyBets && user) {
              const { data } = await api.get("/roulette/my-bets?limit=20").catch(() => ({ data: [] }));
              setMyBetsHistory(data ?? []);
            }
          }} className="text-xs text-gray-500 hover:text-gray-300 transition text-left flex items-center gap-1.5">
            <Zap size={11} className="text-yellow-400" />
            {showMyBets ? "Hide" : "Show"} my bet history
          </button>

          {showMyBets && (
            <div className="rounded-xl border border-white/8 overflow-hidden" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="divide-y divide-white/5 max-h-56 overflow-y-auto">
                {myBetsHistory.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-gray-600">No bets yet</div>
                ) : myBetsHistory.map((b: any) => (
                  <div key={b.id} className="flex items-center justify-between px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      {b.round?.winningNumber != null && (
                        <div className="w-6 h-6 rounded-full flex items-center justify-center font-black text-[10px]"
                          style={{ background: numColor(b.round.winningNumber), color: "#fff" }}>
                          {b.round.winningNumber}
                        </div>
                      )}
                      <span className="text-gray-400">{b.betType}{b.betValue ? ` #${b.betValue}` : ""}</span>
                      <span className="text-gray-600">₹{fmt(Number(b.amount))}</span>
                    </div>
                    <span className={b.isWin ? "text-emerald-400 font-bold" : "text-red-400"}>
                      {b.isWin ? `+₹${fmt(b.payout)}` : "-₹"+fmt(Number(b.amount))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payout table */}
          <div className="rounded-xl border border-white/6 overflow-hidden" style={{ background: "rgba(255,255,255,0.02)" }}>
            <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-gray-500 border-b border-white/5">Payouts</div>
            <div className="grid grid-cols-4 gap-0 text-xs divide-x divide-white/5">
              {(Object.entries(PAYOUTS) as [BetType, string][]).map(([type, pay]) => (
                <div key={type} className="flex flex-col items-center py-2 px-1">
                  <span className="text-gray-400 font-medium uppercase text-[10px]">{type}</span>
                  <span className="text-yellow-400 font-black mt-0.5">{pay}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────
function Stat({ Icon, label, value }: { Icon: any; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <Icon size={12} className="text-gray-500" />
      <span className="text-gray-500">{label}</span>
      <span className="font-bold text-gray-300">{value}</span>
    </div>
  );
}

function PhaseChip({ phase, seconds }: { phase: Phase; seconds: number }) {
  const cfg = {
    BETTING:  { label: "BETTING OPEN",  color: "#10b981", pulse: true  },
    CLOSED:   { label: "BETS CLOSED",   color: "#f59e0b", pulse: false },
    SPINNING: { label: "SPINNING",      color: "#6366f1", pulse: true  },
    SETTLED:  { label: "RESULT",        color: "#e53935", pulse: false },
  }[phase];
  return (
    <div className="flex items-center gap-1.5 text-xs font-bold" style={{ color: cfg.color }}>
      {cfg.pulse && <span className="inline-flex relative h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: cfg.color }} />
        <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: cfg.color }} />
      </span>}
      {cfg.label}
      {seconds > 0 && <span className="text-gray-400 font-normal ml-1">{seconds}s</span>}
    </div>
  );
}

function BetBtn({ label, sub, color, onClick, disabled, glowColor }: {
  label: string; sub: string; color: string;
  onClick: () => void; disabled: boolean; glowColor: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="rounded-xl py-3 flex flex-col items-center font-bold transition-all duration-150 border-2"
      style={{
        background: `linear-gradient(160deg, ${color}dd, ${color}88)`,
        borderColor: disabled ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.18)",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : `0 4px 20px ${glowColor}`,
      }}>
      <span className="text-white text-xs font-black tracking-wide">{label}</span>
      <span className="text-white/70 text-[10px] font-bold mt-0.5">{sub}</span>
    </button>
  );
}
