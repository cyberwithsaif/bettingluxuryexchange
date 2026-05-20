"use client";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Clock, Volume2, VolumeX, RotateCcw, X, Repeat, ArrowLeft, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { getSocket } from "@/lib/socket";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";
import { RouletteWheel } from "@/components/roulette/RouletteWheel";
import { BettingTable, type BetType } from "@/components/roulette/BettingTable";
import useSWR from "swr";

export const dynamic = "force-dynamic";

const CHIPS = [10, 50, 100, 500, 1000, 5000];
const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

const CHIP_GRADIENTS: Record<number, string> = {
  10:   "linear-gradient(145deg, #ff9a00, #ffcc00)",
  50:   "linear-gradient(145deg, #ffffff, #b8b8b8)",
  100:  "linear-gradient(145deg, #38bdf8, #2563eb)",
  500:  "linear-gradient(145deg, #10b981, #065f46)",
  1000: "linear-gradient(145deg, #a855f7, #6d28d9)",
  5000: "linear-gradient(145deg, #ef4444, #991b1b)",
};
const CHIP_GLOW: Record<number, string> = {
  10:   "rgba(255,200,0,0.6)",
  50:   "rgba(255,255,255,0.6)",
  100:  "rgba(56,189,248,0.6)",
  500:  "rgba(16,185,129,0.6)",
  1000: "rgba(168,85,247,0.6)",
  5000: "rgba(239,68,68,0.6)",
};

interface CurrentRound {
  id: string; roundNumber: number;
  status: "BETTING" | "SPINNING" | "SETTLED";
  serverSeedHash: string;
  winningNumber: number | null; winningColor: string | null;
  phaseEndsAt: number; betsCount: number;
}
interface HistoryRound {
  id: string; roundNumber: number;
  winningNumber: number; winningColor: string; settledAt: string;
}
interface LocalBet { betType: BetType; betValue?: string | null; amount: number; }
interface WinEntry { id: string; winningNumber: number; winningColor: string; payout: number; ts: number; }

function color(n: number) { return n === 0 ? "#0d9b3f" : RED.has(n) ? "#c8102e" : "#1a1a1a"; }
function fmt(n: number) { return new Intl.NumberFormat("en-IN").format(n); }

export default function RoulettePage() {
  const user = useAuthStore(s => s.user);
  const [round, setRound]             = useState<CurrentRound | null>(null);
  const [chip, setChip]               = useState(50);
  const [bets, setBets]               = useState<LocalBet[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [muted, setMuted]             = useState(false);
  const [myWin, setMyWin]             = useState<{ winningNumber: number; payout: number } | null>(null);
  const [globalBetCount, setGlobalBetCount] = useState(0);
  const [bettingAlert, setBettingAlert] = useState<{ type: "open" | "closed"; key: number } | null>(null);
  const [errorToast, setErrorToast]   = useState<string | null>(null);
  const [winFeed, setWinFeed]         = useState<WinEntry[]>([]);
  const toastTimeoutRef               = useRef<NodeJS.Timeout | null>(null);
  const prevStatusRef                 = useRef<string | null>(null);
  const audioCtxRef                   = useRef<AudioContext | null>(null);
  const spinAudioRef                  = useRef<HTMLAudioElement | null>(null);
  const lastBetsRef                   = useRef<LocalBet[]>([]);

  const showError = useCallback((msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setErrorToast(msg);
    toastTimeoutRef.current = setTimeout(() => setErrorToast(null), 4500);
  }, []);

  // Stop all audio on unmount (back navigation)
  useEffect(() => {
    return () => {
      spinAudioRef.current?.pause();
      spinAudioRef.current = null;
      audioCtxRef.current?.close().catch(() => {});
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Stop spin audio when wheel settles or new betting round starts
  useEffect(() => {
    if (round?.status === "SETTLED" || round?.status === "BETTING") {
      spinAudioRef.current?.pause();
      spinAudioRef.current = null;
    }
  }, [round?.status]);

  const { data: history, mutate: mutateHistory } = useSWR<HistoryRound[]>("/roulette/history?limit=15", { refreshInterval: 30000 });
  const { data: wallet, mutate: mutateWallet }   = useSWR<{ available: number }>(user ? "/wallet/summary" : null);

  useEffect(() => {
    api.get<CurrentRound>("/roulette/current").then(r => { if (r.data) setRound(r.data); }).catch(() => {});
  }, []);

  useEffect(() => {
    const s = getSocket();
    s.emit("roulette:subscribe");

    const onNewRound = (data: any) => {
      setRound({ id: data.roundId, roundNumber: data.roundNumber, status: "BETTING",
        serverSeedHash: data.serverSeedHash, winningNumber: null, winningColor: null,
        phaseEndsAt: data.phaseEndsAt, betsCount: 0 });
      setBets([]); setGlobalBetCount(0); setMyWin(null);
    };
    const onSpin = (data: any) => {
      setRound(r => r ? { ...r, status: "SPINNING", winningNumber: data.winningNumber, winningColor: data.winningColor, phaseEndsAt: data.phaseEndsAt } : null);
      playSound("spin");
    };
    const onResult = (data: any) => {
      setRound(r => r ? { ...r, status: "SETTLED", winningNumber: data.winningNumber, winningColor: data.winningColor, phaseEndsAt: data.phaseEndsAt } : null);
      mutateHistory(); mutateWallet();
      // Aggregate wins by user — one card per winning user
      const byUser = new Map<string, number>();
      (data.bets as any[]).filter(b => b.isWin && Number(b.payout) > 0).forEach(b => {
        byUser.set(b.userId, (byUser.get(b.userId) ?? 0) + Number(b.payout));
      });
      const winners: WinEntry[] = Array.from(byUser.entries()).map(([uid, payout]) => ({
        id: `${data.winningNumber}-${uid}-${Date.now()}`,
        winningNumber: data.winningNumber, winningColor: data.winningColor,
        payout, ts: Date.now(),
      }));
      if (winners.length > 0) setWinFeed(prev => [...winners, ...prev].slice(0, 30));
      if (user) {
        const myBets = (data.bets as any[]).filter(b => b.userId === user.id);
        const totalPayout = myBets.reduce((sum, b) => sum + Number(b.payout), 0);
        const anyWin = myBets.some(b => b.isWin);
        if (anyWin && totalPayout > 0) { setMyWin({ winningNumber: data.winningNumber, payout: totalPayout }); playSound("win"); setTimeout(() => setMyWin(null), 5000); }
      }
    };
    const onBetPlaced = () => setGlobalBetCount(c => c + 1);

    s.on("roulette:newRound", onNewRound);
    s.on("roulette:spin", onSpin);
    s.on("roulette:result", onResult);
    s.on("roulette:betPlaced", onBetPlaced);
    return () => {
      s.off("roulette:newRound", onNewRound);
      s.off("roulette:spin", onSpin);
      s.off("roulette:result", onResult);
      s.off("roulette:betPlaced", onBetPlaced);
    };
  }, [user, mutateHistory, mutateWallet]);

  useEffect(() => {
    if (!round) return;
    const id = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((round.phaseEndsAt - Date.now()) / 1000)));
    }, 200);
    return () => clearInterval(id);
  }, [round]);

  useEffect(() => {
    const currentStatus = round?.status ?? null;
    const prev = prevStatusRef.current;
    if (currentStatus !== prev) {
      if (currentStatus === "BETTING" && prev !== null) { setBettingAlert({ type: "open", key: Date.now() }); setTimeout(() => setBettingAlert(null), 3000); }
      else if (currentStatus === "SPINNING") { setBettingAlert({ type: "closed", key: Date.now() }); setTimeout(() => setBettingAlert(null), 3000); }
      prevStatusRef.current = currentStatus;
    }
  }, [round?.status]);

  function playSound(kind: "spin" | "win" | "chip") {
    if (muted) return;
    try {
      if (kind === "spin") {
        spinAudioRef.current?.pause();
        const audio = new Audio("/sounds/spinning.mp3");
        audio.volume = 0.6;
        spinAudioRef.current = audio;
        audio.play().catch(() => {});
        return;
      }
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      if (kind === "chip") {
        o.frequency.value = 1200; g.gain.value = 0.08;
        o.start(); o.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.1);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        o.stop(ctx.currentTime + 0.15);
      } else if (kind === "win") {
        o.frequency.value = 660; g.gain.value = 0.1;
        o.start(); o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.3);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        o.stop(ctx.currentTime + 0.4);
      }
    } catch {}
  }

  const placeBet = useCallback(async (bet: LocalBet) => {
    if (!user) { window.location.href = "/auth/login"; return; }
    if (!round || round.status !== "BETTING") return;
    setBets(b => [...b, bet]);
    playSound("chip");
    try {
      await api.post("/roulette/bet", bet);
      mutateWallet();
    } catch (e: any) {
      setBets(b => { const idx = b.findIndex(x => x.betType === bet.betType && x.betValue === bet.betValue && x.amount === bet.amount); return idx >= 0 ? [...b.slice(0, idx), ...b.slice(idx + 1)] : b; });
      const msg: string = e?.response?.data?.message || "Bet failed";
      if (typeof msg === "string" && msg.toLowerCase().includes("too many")) return;
      showError(typeof msg === "string" ? msg : "Bet failed");
    }
  }, [round, user, mutateWallet, muted]);

  const totalStaked = bets.reduce((sum, b) => sum + b.amount, 0);
  const status = round?.status ?? "BETTING";
  const lastWin = myWin?.payout ?? 0;

  const { hotNumbers, coldNumbers } = useMemo(() => {
    const freq: Record<number, number> = {};
    (history ?? []).forEach(h => { freq[h.winningNumber] = (freq[h.winningNumber] ?? 0) + 1; });
    const sorted = Array.from({ length: 37 }, (_, i) => i).map(n => ({ n, count: freq[n] ?? 0 }));
    return { hotNumbers: [...sorted].sort((a, b) => b.count - a.count).slice(0, 4), coldNumbers: [...sorted].sort((a, b) => a.count - b.count).slice(0, 4) };
  }, [history]);

  const undoBet    = () => setBets(b => b.slice(0, -1));
  const clearBets  = () => setBets([]);

  const placeBatch = useCallback(async (newBets: LocalBet[]) => {
    if (!user || !newBets.length) return;
    setBets(b => [...b, ...newBets]);
    try { await api.post("/roulette/bets-batch", { bets: newBets }); mutateWallet(); }
    catch (e: any) { setBets(b => b.slice(0, b.length - newBets.length)); showError(e?.response?.data?.message || "Batch bet failed"); }
  }, [user, mutateWallet, showError]);

  const repeatLastBets = useCallback(() => { if (!lastBetsRef.current.length || status !== "BETTING") return; placeBatch(lastBetsRef.current.map(b => ({ ...b }))); }, [placeBatch, status]);
  const doubleBets     = useCallback(() => { if (!bets.length || status !== "BETTING") return; placeBatch(bets.map(b => ({ ...b }))); }, [bets, placeBatch, status]);

  useEffect(() => { if (status === "SPINNING" && bets.length > 0) lastBetsRef.current = [...bets]; }, [status, bets]);

  // Chip + control button styles injected once
  const chipStyle = `
    .casino-chip { width:42px;height:42px;border-radius:50%;position:relative;cursor:pointer;transition:all .25s;display:flex;justify-content:center;align-items:center;overflow:hidden; }
    @media(min-width:768px){ .casino-chip{width:58px;height:58px;} }
    .casino-chip:hover { transform:translateY(-3px) scale(1.08); }
    .casino-chip.active { transform:scale(1.1);animation:chipPulse 1s infinite; }
    .casino-chip::before { content:'';position:absolute;inset:0;border-radius:50%;padding:3px;background:repeating-conic-gradient(#fff 0deg 18deg,transparent 18deg 36deg);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 7px),#fff calc(100% - 7px));mask:radial-gradient(farthest-side,transparent calc(100% - 7px),#fff calc(100% - 7px)); }
    @media(min-width:768px){ .casino-chip::before{padding:4px;-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 10px),#fff calc(100% - 10px));mask:radial-gradient(farthest-side,transparent calc(100% - 10px),#fff calc(100% - 10px));} }
    .casino-chip::after { content:'';position:absolute;width:65%;height:65%;background:rgba(255,255,255,0.08);border-radius:50%;border:1.5px solid rgba(255,255,255,0.15);z-index:2; }
    .casino-chip span { position:relative;z-index:3;font-size:13px;font-weight:700;color:white;text-shadow:0 0 6px rgba(255,255,255,0.6); }
    @media(min-width:768px){ .casino-chip span{font-size:16px;} }
    @keyframes chipPulse { 0%{box-shadow:0 0 10px currentColor}50%{box-shadow:0 0 22px currentColor}100%{box-shadow:0 0 10px currentColor} }
    @keyframes tickerScroll { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
    .rl-ctrl { width:42px;height:42px;border:none;outline:none;border-radius:10px;background:#0f172a;color:white;font-size:16px;font-weight:700;cursor:pointer;transition:.2s;display:inline-flex;align-items:center;justify-content:center;box-shadow:inset 0 1px 1px rgba(255,255,255,.05),0 0 10px rgba(0,0,0,.4); }
    @media(min-width:768px){ .rl-ctrl{width:52px;height:52px;font-size:20px;} }
    .rl-ctrl:hover:not(:disabled){transform:translateY(-2px);background:#1e293b;}
    .rl-ctrl:active:not(:disabled){transform:scale(0.95);}
    .rl-ctrl:disabled{opacity:.35;cursor:not-allowed;}
  `;

  return (
    <div className="h-[100dvh] bg-[#0F1923] text-white flex flex-col font-sans w-full overflow-hidden">
      <style>{chipStyle}</style>

      {/* ── Header ── */}
      <header className="px-3 py-2 flex items-center justify-between border-b border-gray-800 bg-[#0f212e] shrink-0">
        <Link href="/" className="flex items-center gap-1.5 text-gray-400 hover:text-white transition font-bold text-xs">
          <ArrowLeft size={15} /><span>Back</span>
        </Link>
        <div className="font-bold tracking-widest text-xs text-yellow-400 uppercase">☸ Roulette</div>
        <div className="flex items-center gap-1 bg-[#1a2c38] px-2 py-1 rounded-lg border border-gray-700">
          <span className="text-xs font-bold text-white">
            ₹{wallet ? Number(wallet.available).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}
          </span>
        </div>
      </header>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">

        {/* Casino stage */}
        <div
          className="px-2 pt-2 pb-3"
          style={{ background: "radial-gradient(ellipse at top, #1a1a20 0%, #0a0a0c 70%), repeating-linear-gradient(60deg,rgba(255,255,255,0.012) 0 1px,transparent 1px 28px), repeating-linear-gradient(-60deg,rgba(255,255,255,0.012) 0 1px,transparent 1px 28px)" }}
        >

          {/* Status row */}
          <div className="flex items-center justify-between mb-2 gap-1">
            <div className="flex items-center gap-1.5">
              <div className={`px-2 py-0.5 rounded text-[9px] uppercase tracking-widest font-bold border ${
                status === "BETTING"  ? "bg-emerald-900/60 border-emerald-500/50 text-emerald-300" :
                status === "SPINNING" ? "bg-red-900/60 border-red-500/50 text-red-300 animate-pulse" :
                                        "bg-yellow-900/60 border-yellow-500/50 text-yellow-300"
              }`}>
                ● {status === "BETTING" ? "Betting" : status === "SPINNING" ? "Spinning" : "Result"}
              </div>
              <span className="text-white/40 text-[9px]">#{round?.roundNumber ?? "—"}</span>
            </div>

            {/* Hot/Cold — hidden on small, shown md+ */}
            <div className="hidden md:flex items-center gap-3 bg-black/40 border border-white/10 rounded px-3 py-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] uppercase tracking-widest text-orange-400">Hot</span>
                {hotNumbers.slice(0, 4).map(({ n }) => (
                  <div key={`hot-${n}`} className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: color(n), border: "1.5px solid #fca5a5" }}>{n}</div>
                ))}
              </div>
              <div className="w-px h-5 bg-white/15" />
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] uppercase tracking-widest text-blue-400">Cold</span>
                {coldNumbers.slice(0, 4).map(({ n }) => (
                  <div key={`cold-${n}`} className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: color(n), border: "1.5px solid rgba(255,255,255,0.4)" }}>{n}</div>
                ))}
              </div>
            </div>

            <div className="bg-black/60 rounded px-2 py-1 text-[10px] text-white/80 border border-white/10 flex items-center gap-1">
              <Clock size={9} />
              <span className="font-bold tabular-nums text-sm" style={{ color: status === "BETTING" ? (secondsLeft <= 5 ? "#ef4444" : "#facc15") : "#fff" }}>
                {secondsLeft}s
              </span>
            </div>
          </div>

          {/* ── Two-column on md+, single column on mobile ── */}
          <div className="flex flex-col md:grid md:grid-cols-[286px_1fr] lg:grid-cols-[360px_1fr] gap-2 md:gap-4">

            {/* Wheel column */}
            <div className="flex flex-col items-center gap-2">
              {/* Wheel — 242px on mobile, 286px md, 360px lg */}
              <div
                className="wheel-outer relative overflow-hidden shrink-0 rounded-full"
                style={{ width: 242, height: 242 }}
              >
                <div
                  className="wheel-inner absolute"
                  style={{ width: 440, height: 440, transform: "scale(0.55)", transformOrigin: "top left" }}
                >
                  <RouletteWheel
                    winningNumber={round?.winningNumber ?? null}
                    spinning={status === "SPINNING"}
                    status={status}
                  />
                </div>
              </div>

              {/* Winning number badge — shown below wheel on mobile only */}
              {status === "SETTLED" && round?.winningNumber != null && (
                <div className="flex md:hidden items-center gap-2">
                  <div className="px-4 py-1.5 rounded-full font-extrabold text-lg text-white shadow-lg" style={{ background: color(round.winningNumber), minWidth: 56, textAlign: "center" }}>
                    {round.winningNumber}
                  </div>
                  <span className="text-xs text-white/50 uppercase tracking-widest">{round.winningColor}</span>
                </div>
              )}
            </div>

            {/* Controls column */}
            <div className="space-y-2">

              {/* Betting table */}
              <div className="overflow-x-auto mt-0 md:mt-4">
                <BettingTable chip={chip} bets={bets} disabled={status !== "BETTING"} onPlaceBet={placeBet} />
              </div>

              {/* Last results */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] uppercase tracking-wider text-white/40 shrink-0">Last:</span>
                <div className="flex gap-1 overflow-x-auto flex-1 no-scrollbar">
                  {(history ?? []).slice(0, 20).map(h => (
                    <div key={h.id} className="shrink-0 w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold text-white" style={{ background: color(h.winningNumber) }}>
                      {h.winningNumber}
                    </div>
                  ))}
                  {(!history || history.length === 0) && <span className="text-[9px] text-white/30">No history yet</span>}
                </div>
              </div>

              {/* Chip selector */}
              <div className="bg-black/30 rounded-lg px-2 py-2 border border-white/10">
                <div className="text-[9px] uppercase tracking-wider text-white/50 mb-1.5">Chip Value</div>
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {CHIPS.map(c => (
                    <button key={c} onClick={() => setChip(c)} className={`casino-chip shrink-0 ${chip === c ? "active" : ""}`}
                      style={{ background: CHIP_GRADIENTS[c] ?? CHIP_GRADIENTS[10], boxShadow: chip === c ? `0 0 18px ${CHIP_GLOW[c] ?? "rgba(255,200,0,0.6)"}` : `0 0 10px ${(CHIP_GLOW[c] ?? "rgba(255,200,0,0.6)").replace("0.6","0.25")}` }}>
                      <span>{c >= 1000 ? `${c/1000}k` : c}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button onClick={doubleBets}     disabled={status !== "BETTING" || bets.length === 0} title="Double" className="rl-ctrl">×2</button>
                  <button onClick={undoBet}         disabled={status !== "BETTING" || bets.length === 0} title="Undo"   className="rl-ctrl"><RotateCcw size={16} /></button>
                  <button onClick={clearBets}       disabled={status !== "BETTING" || bets.length === 0} title="Clear"  className="rl-ctrl"><X size={18} /></button>
                  <button onClick={repeatLastBets}  disabled={status !== "BETTING" || lastBetsRef.current.length === 0} title="Repeat" className="rl-ctrl"><Repeat size={16} /></button>
                </div>
                <div className="text-right text-[9px] text-white/60 space-y-0.5">
                  <div><span className="text-white/40">Staked:</span> <span className="font-bold text-yellow-400">{fmt(totalStaked)}</span></div>
                  <div><span className="text-white/40">Bets:</span> <span className="font-bold text-white">{bets.length}</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Live Wins Ticker ── */}
        <div className="border-t border-white/10 bg-black/50 py-2">
          <div className="flex items-center gap-2 px-3 mb-1.5">
            <span className="text-[8px] uppercase tracking-[0.18em] text-white/35 font-semibold">Live Wins</span>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          {winFeed.length === 0 ? (
            <p className="px-3 text-[10px] text-white/20 italic">Waiting for results…</p>
          ) : (
            <div className="overflow-hidden">
              <div
                className="flex gap-2 px-2"
                style={{
                  width: "max-content",
                  animation: `tickerScroll ${Math.max(winFeed.length * 4, 16)}s linear infinite`,
                }}
              >
                {[...winFeed, ...winFeed].map((w, i) => (
                  <div
                    key={`${w.id}-${i}`}
                    className="shrink-0 flex items-center gap-2 rounded-xl px-3 py-1.5 border border-white/10"
                    style={{ background: "rgba(255,255,255,0.05)" }}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold text-white shrink-0"
                      style={{
                        background: color(w.winningNumber),
                        boxShadow: `0 0 12px ${color(w.winningNumber) === "#1a1a1a" ? "rgba(255,255,255,0.2)" : color(w.winningNumber)}88`,
                        border: "2px solid rgba(255,255,255,0.2)",
                      }}
                    >
                      {w.winningNumber}
                    </div>
                    <div className="text-sm font-extrabold text-yellow-300 tabular-nums">
                      +{fmt(w.payout)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {!user && (
          <div className="bg-red-900/30 border-t border-red-700/40 p-2 text-center text-xs">
            Please <a href="/auth/login" className="underline text-yellow-400 font-semibold">log in</a> to place bets.
          </div>
        )}
      </div>

      {/* ── Bottom bar — outside scroll, always pinned to viewport bottom ── */}
      <div className="bg-[#0a0a0c] px-3 py-2 border-t border-white/10 flex items-center justify-between gap-2 shrink-0">
        <button onClick={() => setMuted(m => !m)} className="flex items-center gap-1 text-white/60 hover:text-white transition shrink-0">
          {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          <span className="text-[9px] hidden sm:inline">{muted ? "Muted" : "Sound"}</span>
        </button>

        <div className="flex items-center gap-3 md:gap-6 text-[10px] uppercase tracking-widest">
          <div><span className="text-white/40">Cash: </span><span className="text-yellow-400 font-bold">{user ? fmt(Math.floor(wallet?.available ?? 0)) : "—"}</span></div>
          <div><span className="text-white/40">Bet: </span><span className="text-white font-bold">{fmt(totalStaked)}</span></div>
          <div><span className="text-white/40">Win: </span><span className="text-emerald-400 font-bold">{fmt(lastWin)}</span></div>
        </div>

        <span className="text-[9px] text-white/40 shrink-0 hidden md:block">{globalBetCount} bets</span>
      </div>

      {/* ── Desktop wheel sizing override (md+) ── */}
      <style>{`
        @media(min-width:768px){
          .wheel-outer { width:286px!important; height:286px!important; }
          .wheel-inner { transform:scale(0.65) !important; }
        }
        @media(min-width:1024px){
          .wheel-outer { width:360px!important; height:360px!important; }
          .wheel-inner { transform:scale(0.818) !important; }
        }
      `}</style>

      {/* ── Betting alert toast ── */}
      <AnimatePresence mode="wait">
        {bettingAlert && (
          <motion.div key={bettingAlert.key} initial={{ opacity:0,y:-60,scale:.9 }} animate={{ opacity:1,y:0,scale:1 }} exit={{ opacity:0,y:-40,scale:.95 }} transition={{ type:"spring",stiffness:400,damping:28 }}
            className="fixed top-14 left-1/2 -translate-x-1/2 z-[100] pointer-events-none">
            <div className={`flex items-center gap-3 px-5 py-2.5 rounded-2xl shadow-2xl border-2 font-bold backdrop-blur-md ${
              bettingAlert.type === "open" ? "bg-emerald-900/90 border-emerald-400 text-emerald-200" : "bg-red-900/90 border-red-400 text-red-200"
            }`}>
              <span className="text-xl">{bettingAlert.type === "open" ? "🟢" : "🔴"}</span>
              <div>
                <div className={`text-sm font-extrabold uppercase tracking-widest ${bettingAlert.type === "open" ? "text-emerald-300" : "text-red-300"}`}>
                  {bettingAlert.type === "open" ? "Betting Open" : "No More Bets"}
                </div>
                <div className="text-[10px] font-normal text-white/70 mt-0.5">
                  {bettingAlert.type === "open" ? "Place your bets now!" : "Wheel is spinning – good luck!"}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── My win banner (non-blocking toast at bottom of screen) ── */}
      <AnimatePresence>
        {myWin && myWin.payout > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed bottom-16 left-1/2 z-50 pointer-events-none"
            style={{ transform: "translateX(-50%)" }}
          >
            <div className="flex items-center gap-3 px-5 py-3 rounded-2xl border-2 border-yellow-400/60 shadow-[0_0_30px_rgba(234,179,8,0.4)] backdrop-blur-md"
              style={{ background: "linear-gradient(135deg, rgba(120,53,15,0.95), rgba(92,44,13,0.95))" }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-extrabold text-white border-2 border-white/30 shrink-0"
                style={{ background: color(myWin.winningNumber), boxShadow: `0 0 14px ${color(myWin.winningNumber)}99` }}>
                {myWin.winningNumber}
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-widest text-yellow-300/70 font-semibold">You Won!</div>
                <div className="text-xl font-extrabold text-yellow-200 flex items-center gap-1.5 leading-none">
                  <Trophy size={16} className="text-yellow-400" /> {fmt(myWin.payout)}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Error toast ── */}
      <AnimatePresence>
        {errorToast && (
          <motion.div initial={{ opacity:0,y:-50,x:"-50%",scale:.9 }} animate={{ opacity:1,y:0,x:"-50%",scale:1 }} exit={{ opacity:0,y:-20,x:"-50%",scale:.95 }} transition={{ type:"spring",stiffness:350,damping:25 }}
            className="fixed top-14 left-1/2 z-50 w-full max-w-sm px-4">
            <div className="bg-[#180a0f]/95 border-2 border-red-500/50 backdrop-blur-xl p-4 rounded-xl shadow-[0_8px_32px_rgba(239,68,68,0.25)] flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-red-500/20 flex items-center justify-center text-red-400 shrink-0 border border-red-500/30 animate-pulse">
                <AlertTriangle size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-[10px] font-bold text-red-200 tracking-wide uppercase">Error</h4>
                <p className="text-sm text-white/90 font-medium leading-relaxed mt-0.5 break-words">{errorToast}</p>
              </div>
              <button onClick={() => setErrorToast(null)} className="text-white/40 hover:text-white/90 transition px-1 py-1 rounded-md font-bold text-lg self-start">&times;</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
