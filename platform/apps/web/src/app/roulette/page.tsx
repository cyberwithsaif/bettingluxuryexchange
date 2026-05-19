"use client";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Coins, Trophy, History, Clock, Volume2, VolumeX, RotateCcw, X, Repeat, ChevronLeft, ChevronRight, ArrowLeft, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { getSocket } from "@/lib/socket";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";
import { RouletteWheel } from "@/components/roulette/RouletteWheel";
import { BettingTable, type BetType, type BetMode } from "@/components/roulette/BettingTable";
import useSWR from "swr";

export const dynamic = "force-dynamic";

const CHIPS = [10, 50, 100, 500, 1000, 5000];
const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

// Color rings for each chip denomination (NetEnt-style)
const CHIP_STYLES: Record<number, { bg: string; ring: string }> = {
  10:   { bg: "from-orange-400 to-orange-600",   ring: "border-orange-200" },
  50:   { bg: "from-yellow-400 to-yellow-600",   ring: "border-yellow-100" },
  100:  { bg: "from-blue-500 to-blue-700",       ring: "border-blue-200"   },
  500:  { bg: "from-emerald-500 to-emerald-700", ring: "border-emerald-200"},
  1000: { bg: "from-purple-500 to-purple-700",   ring: "border-purple-200" },
  5000: { bg: "from-red-500 to-red-700",         ring: "border-red-200"    },
};

interface CurrentRound {
  id: string;
  roundNumber: number;
  status: "BETTING" | "SPINNING" | "SETTLED";
  serverSeedHash: string;
  winningNumber: number | null;
  winningColor: string | null;
  phaseEndsAt: number;
  betsCount: number;
}

interface HistoryRound {
  id: string;
  roundNumber: number;
  winningNumber: number;
  winningColor: string;
  settledAt: string;
}

interface LocalBet {
  betType: BetType;
  betValue?: string | null;
  amount: number;
}

function color(n: number) {
  if (n === 0) return "#0d9b3f";
  return RED.has(n) ? "#c8102e" : "#1a1a1a";
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN").format(n);
}

export default function RoulettePage() {
  const user = useAuthStore(s => s.user);
  const [round, setRound] = useState<CurrentRound | null>(null);
  const [chip, setChip] = useState(50);
  const [bets, setBets] = useState<LocalBet[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [muted, setMuted] = useState(false);
  const [betMode, setBetMode] = useState<BetMode>("straight");
  const [resultPopup, setResultPopup] = useState<{ winningNumber: number; payout: number } | null>(null);
  const [globalBetCount, setGlobalBetCount] = useState(0);
  const [bettingAlert, setBettingAlert] = useState<{ type: "open" | "closed"; key: number } | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showError = useCallback((msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setErrorToast(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setErrorToast(null);
    }, 4500);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const prevStatusRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const { data: history, mutate: mutateHistory } = useSWR<HistoryRound[]>("/roulette/history?limit=15", { refreshInterval: 30000 });
  const { data: wallet, mutate: mutateWallet } = useSWR<{ available: number }>(user ? "/wallet/summary" : null);

  useEffect(() => {
    api.get<CurrentRound>("/roulette/current").then(r => {
      if (r.data) setRound(r.data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const s = getSocket();
    s.emit("roulette:subscribe");

    const onNewRound = (data: any) => {
      setRound({
        id: data.roundId,
        roundNumber: data.roundNumber,
        status: "BETTING",
        serverSeedHash: data.serverSeedHash,
        winningNumber: null,
        winningColor: null,
        phaseEndsAt: data.phaseEndsAt,
        betsCount: 0,
      });
      setBets([]);
      setGlobalBetCount(0);
      setResultPopup(null);
      setBetMode("straight");
    };

    const onSpin = (data: any) => {
      setRound(r => r ? { ...r, status: "SPINNING", winningNumber: data.winningNumber, winningColor: data.winningColor, phaseEndsAt: data.phaseEndsAt } : null);
      playSound("spin");
    };

    const onResult = (data: any) => {
      setRound(r => r ? { ...r, status: "SETTLED", winningNumber: data.winningNumber, winningColor: data.winningColor, phaseEndsAt: data.phaseEndsAt } : null);
      mutateHistory();
      mutateWallet();

      if (user) {
        const myBets = (data.bets as any[]).filter(b => b.userId === user.id);
        const totalPayout = myBets.reduce((sum, b) => sum + Number(b.payout), 0);
        const anyWin = myBets.some(b => b.isWin);
        if (myBets.length > 0) {
          setResultPopup({ winningNumber: data.winningNumber, payout: totalPayout });
          if (anyWin) playSound("win");
        }
      }
    };

    const onBetPlaced = () => {
      setGlobalBetCount(c => c + 1);
    };

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
      const left = Math.max(0, Math.ceil((round.phaseEndsAt - Date.now()) / 1000));
      setSecondsLeft(left);
    }, 200);
    return () => clearInterval(id);
  }, [round]);

  // ── Betting start / stop alerts ──────────────────────────────────────────
  useEffect(() => {
    const currentStatus = round?.status ?? null;
    const prev = prevStatusRef.current;

    if (currentStatus !== prev) {
      if (currentStatus === "BETTING" && prev !== null) {
        // A new betting phase just opened
        setBettingAlert({ type: "open", key: Date.now() });
        setTimeout(() => setBettingAlert(null), 3000);
      } else if (currentStatus === "SPINNING") {
        // Betting just closed
        setBettingAlert({ type: "closed", key: Date.now() });
        setTimeout(() => setBettingAlert(null), 3000);
      }
      prevStatusRef.current = currentStatus;
    }
  }, [round?.status]);

  function playSound(kind: "spin" | "win" | "chip") {
    if (muted) return;
    try {
      if (kind === "spin") {
        const audio = new Audio("/sounds/spinning.mp3");
        audio.volume = 0.6;
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
        o.start();
        o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.3);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        o.stop(ctx.currentTime + 0.4);
      }
    } catch {}
  }

  const placeBet = useCallback(async (bet: LocalBet) => {
    if (!user) {
      window.location.href = "/auth/login";
      return;
    }
    if (!round || round.status !== "BETTING") return;
    setBets(b => [...b, bet]);
    playSound("chip");
    try {
      await api.post("/roulette/bet", bet);
      mutateWallet();
    } catch (e: any) {
      setBets(b => {
        const idx = b.findIndex(x => x.betType === bet.betType && x.betValue === bet.betValue && x.amount === bet.amount);
        return idx >= 0 ? [...b.slice(0, idx), ...b.slice(idx + 1)] : b;
      });
      const msg = e?.response?.data?.message || "Bet failed";
      showError(typeof msg === "string" ? msg : "Bet failed");
    }
  }, [round, user, mutateWallet, muted]);

  const totalStaked = bets.reduce((sum, b) => sum + b.amount, 0);
  const status = round?.status ?? "BETTING";
  const lastWin = round?.status === "SETTLED" && resultPopup ? resultPopup.payout : 0;

  // Hot/Cold numbers calculated from history frequency
  const { hotNumbers, coldNumbers } = useMemo(() => {
    const freq: Record<number, number> = {};
    (history ?? []).forEach(h => { freq[h.winningNumber] = (freq[h.winningNumber] ?? 0) + 1; });
    const allNums = Array.from({ length: 37 }, (_, i) => i);
    const sorted = allNums.map(n => ({ n, count: freq[n] ?? 0 }));
    const hot = [...sorted].sort((a, b) => b.count - a.count).slice(0, 4);
    const cold = [...sorted].sort((a, b) => a.count - b.count).slice(0, 4);
    return { hotNumbers: hot, coldNumbers: cold };
  }, [history]);

  // Action handlers
  const lastBetsRef = useRef<LocalBet[]>([]);
  const undoBet = () => setBets(b => b.slice(0, -1));
  const clearBets = () => setBets([]);
  const repeatLastBets = useCallback(() => {
    if (!lastBetsRef.current.length || status !== "BETTING") return;
    lastBetsRef.current.forEach(b => placeBet(b));
  }, [placeBet, status]);
  const doubleBets = useCallback(() => {
    if (!bets.length || status !== "BETTING") return;
    bets.forEach(b => placeBet({ ...b }));
  }, [bets, placeBet, status]);

  useEffect(() => {
    if (status === "SPINNING" && bets.length > 0) {
      lastBetsRef.current = [...bets];
    }
  }, [status, bets]);

  return (
    <div className="h-[100dvh] bg-[#0F1923] text-white flex flex-col font-sans w-full overflow-x-hidden overflow-y-auto">
      {/* Minimal Header with Wallet Balance */}
      <header className="px-4 py-2 flex items-center justify-between border-b border-gray-800 bg-[#0f212e] w-full shrink-0">
        <Link href="/" className="flex items-center gap-1 md:gap-2 text-gray-400 hover:text-white transition font-bold text-xs md:text-sm">
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">Back to Lobby</span>
          <span className="sm:hidden">Back</span>
        </Link>
        <div className="font-bold tracking-widest text-xs md:text-sm text-yellow-400 uppercase">
          ☸ Roulette
        </div>
        <div className="flex items-center gap-1 md:gap-2 bg-[#1a2c38] px-2 md:px-3 py-1 md:py-1.5 rounded-lg border border-gray-700">
          <span className="hidden sm:inline text-[10px] text-gray-400 font-semibold">Balance:</span>
          <span className="text-xs md:text-sm font-bold text-white">
            ₹{wallet ? Number(wallet.available).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}
          </span>
        </div>
      </header>

      {/* Main Game Container */}
      <div className="flex-1 flex items-start md:items-center justify-center p-2 md:p-4 w-full max-w-7xl mx-auto">
        <div className="w-full rounded-xl border border-yellow-700/30 bg-[#0a0a0c] flex flex-col">

        {/* ===== MAIN CASINO STAGE — wheel left, betting controls right ===== */}
        <div
          className="relative px-2 md:px-4 pt-3 pb-4"
          style={{
            background:
              "radial-gradient(ellipse at top, #1a1a20 0%, #0a0a0c 70%)",
            backgroundImage:
              "repeating-linear-gradient(60deg, rgba(255,255,255,0.015) 0 1px, transparent 1px 28px), repeating-linear-gradient(-60deg, rgba(255,255,255,0.015) 0 1px, transparent 1px 28px), radial-gradient(ellipse at top, #1a1a20 0%, #0a0a0c 70%)",
          }}
        >
          {/* Top status bar */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`px-2 py-1 rounded text-[10px] uppercase tracking-widest font-bold border ${
                status === "BETTING" ? "bg-emerald-900/60 border-emerald-500/50 text-emerald-300" :
                status === "SPINNING" ? "bg-red-900/60 border-red-500/50 text-red-300 animate-pulse" :
                "bg-yellow-900/60 border-yellow-500/50 text-yellow-300"
              }`}>
                ● {status === "BETTING" ? "Place Bets" : status === "SPINNING" ? "No Bets" : "Result"}
              </div>
              <span className="text-white/40 text-[10px]">Round #{round?.roundNumber ?? "—"}</span>
            </div>

            {/* Hot/Cold compact strip — visible on desktop */}
            <div className="hidden lg:flex items-center gap-3 bg-black/40 border border-white/10 rounded px-3 py-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] uppercase tracking-widest text-orange-400">Hot</span>
                {hotNumbers.slice(0, 4).map(({ n }) => (
                  <div key={`hot-${n}`} className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ background: color(n), border: "1.5px solid #fca5a5" }}>
                    {n}
                  </div>
                ))}
              </div>
              <div className="w-px h-5 bg-white/15" />
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] uppercase tracking-widest text-blue-400">Cold</span>
                {coldNumbers.slice(0, 4).map(({ n }) => (
                  <div key={`cold-${n}`} className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ background: color(n), border: "1.5px solid rgba(255,255,255,0.4)" }}>
                    {n}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-black/60 rounded px-2 py-1 text-[10px] text-white/80 border border-white/10 flex items-center gap-1">
              <Clock size={10} />
              <span className="font-bold tabular-nums text-base" style={{
                color: status === "BETTING" ? (secondsLeft <= 5 ? "#ef4444" : "#facc15") : "#fff",
              }}>
                {secondsLeft}s
              </span>
            </div>
          </div>

          {/* Two-column layout: wheel left, controls right (stacks on mobile) */}
          <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] lg:grid-cols-[380px_1fr] gap-4">
            {/* LEFT: Wheel — bigger on all screens */}
            <div className="flex items-center justify-center mx-auto md:mx-0 w-[260px] h-[260px] md:w-[300px] md:h-[300px] lg:w-[380px] lg:h-[380px] overflow-visible">
              <div className="scale-[0.55] md:scale-[0.65] lg:scale-[0.82]" style={{ transformOrigin: "center center" }}>
                <RouletteWheel
                  winningNumber={round?.winningNumber ?? null}
                  spinning={status === "SPINNING"}
                  status={status}
                />
              </div>
            </div>

            {/* RIGHT: Betting table, chips, buttons */}
            <div className="space-y-2">


              {/* Betting table */}
              <div className="relative mt-5">
                <BettingTable
                  chip={chip}
                  bets={bets}
                  disabled={status !== "BETTING"}
                  betMode={betMode}
                  onPlaceBet={placeBet}
                />
              </div>

              {/* Last results strip */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] uppercase tracking-wider text-white/40">Last:</span>
                <div className="flex gap-1 overflow-x-auto flex-1">
                  {(history ?? []).slice(0, 20).map(h => (
                    <div
                      key={h.id}
                      className="shrink-0 w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold text-white"
                      style={{ background: color(h.winningNumber) }}
                    >
                      {h.winningNumber}
                    </div>
                  ))}
                  {(!history || history.length === 0) && (
                    <span className="text-[9px] text-white/30">No history yet</span>
                  )}
                </div>
                <div className="bg-black/60 rounded px-2 py-0.5 text-[9px] text-white/80 border border-white/10 flex items-center gap-1 shrink-0">
                  <Clock size={9} />
                  <span className="font-bold tabular-nums" style={{
                    color: status === "BETTING" ? (secondsLeft <= 5 ? "#ef4444" : "#facc15") : "#fff",
                  }}>
                    {secondsLeft}s
                  </span>
                </div>
              </div>

              {/* Chip selector — premium casino chip design */}
              <style>{`
                .casino-chip {
                  width: 48px;
                  height: 48px;
                  border-radius: 50%;
                  position: relative;
                  cursor: pointer;
                  transition: all 0.25s ease;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  overflow: hidden;
                }
                @media (min-width: 768px) {
                  .casino-chip {
                    width: 64px;
                    height: 64px;
                  }
                }
                .casino-chip:hover {
                  transform: translateY(-4px) scale(1.08);
                }
                .casino-chip.active {
                  transform: scale(1.12);
                  animation: chipPulse 1s infinite;
                }
                .casino-chip::before {
                  content: '';
                  position: absolute;
                  inset: 0;
                  border-radius: 50%;
                  padding: 3px;
                  background: repeating-conic-gradient(#fff 0deg 18deg, transparent 18deg 36deg);
                  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 8px), #fff calc(100% - 8px));
                  mask: radial-gradient(farthest-side, transparent calc(100% - 8px), #fff calc(100% - 8px));
                }
                @media (min-width: 768px) {
                  .casino-chip::before {
                    padding: 4px;
                    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 10px), #fff calc(100% - 10px));
                    mask: radial-gradient(farthest-side, transparent calc(100% - 10px), #fff calc(100% - 10px));
                  }
                }
                .casino-chip::after {
                  content: '';
                  position: absolute;
                  width: 65%;
                  height: 65%;

                  background: rgba(255, 255, 255, 0.08);
                  border-radius: 50%;
                  backdrop-filter: blur(3px);
                  border: 1.5px solid rgba(255, 255, 255, 0.15);
                  z-index: 2;
                }
                .casino-chip span {
                  position: relative;
                  z-index: 3;
                  font-size: 16px;
                  font-weight: 700;
                  color: white;
                  text-shadow: 0 0 6px rgba(255, 255, 255, 0.6);
                }
                @keyframes chipPulse {
                  0% { box-shadow: 0 0 10px currentColor; }
                  50% { box-shadow: 0 0 25px currentColor; }
                  100% { box-shadow: 0 0 10px currentColor; }
                }
              `}</style>

              <div className="bg-black/30 rounded-lg p-2 border border-white/10">
                <div className="text-[9px] uppercase tracking-wider text-white/60 mb-2">Chip Value</div>
                <div className="flex items-center gap-1.5 justify-center flex-wrap">
                  {CHIPS.map(c => {
                    const active = chip === c;
                    const chipGradients: Record<number, string> = {
                      10: "linear-gradient(145deg, #ff9a00, #ffcc00)",
                      50: "linear-gradient(145deg, #ffffff, #b8b8b8)",
                      100: "linear-gradient(145deg, #38bdf8, #2563eb)",
                      500: "linear-gradient(145deg, #10b981, #065f46)",
                      1000: "linear-gradient(145deg, #a855f7, #6d28d9)",
                      5000: "linear-gradient(145deg, #ef4444, #991b1b)",
                    };
                    const gradient = chipGradients[c] || chipGradients[10];
                    const glowColor = {
                      10: "rgba(255, 200, 0, 0.6)",
                      50: "rgba(255, 255, 255, 0.6)",
                      100: "rgba(56, 189, 248, 0.6)",
                      500: "rgba(16, 185, 129, 0.6)",
                      1000: "rgba(168, 85, 247, 0.6)",
                      5000: "rgba(239, 68, 68, 0.6)",
                    }[c] || "rgba(255, 200, 0, 0.6)";

                    return (
                      <button
                        key={c}
                        onClick={() => setChip(c)}
                        className={`casino-chip ${active ? "active" : ""}`}
                        style={{
                          background: gradient,
                          boxShadow: active ? `0 0 20px ${glowColor}` : `0 0 12px ${glowColor.replace("0.6", "0.3")}`,
                        }}
                      >
                        <span>{c >= 1000 ? `${c / 1000}k` : c}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action buttons + stats */}
              <style>{`
                .roulette-ctrl {
                  width: 48px;
                  height: 48px;
                  border: none;
                  outline: none;
                  border-radius: 12px;
                  background: #0f172a;
                  color: white;
                  font-size: 18px;
                  font-weight: 700;
                  cursor: pointer;
                  transition: 0.2s;
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                  box-shadow: inset 0 1px 1px rgba(255,255,255,.05), 0 0 10px rgba(0,0,0,.4);
                }
                .roulette-ctrl:hover:not(:disabled) {
                  transform: translateY(-3px);
                  background: #1e293b;
                }
                .roulette-ctrl:active:not(:disabled) {
                  transform: scale(0.95);
                }
                .roulette-ctrl:disabled {
                  opacity: 0.35;
                  cursor: not-allowed;
                }
                @media (min-width: 768px) {
                  .roulette-ctrl { width: 54px; height: 54px; font-size: 20px; }
                }
              `}</style>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 md:gap-3">
                  <button
                    onClick={doubleBets}
                    disabled={status !== "BETTING" || bets.length === 0}
                    title="Double bets"
                    className="roulette-ctrl"
                  >
                    ×2
                  </button>
                  <button
                    onClick={undoBet}
                    disabled={status !== "BETTING" || bets.length === 0}
                    title="Undo"
                    className="roulette-ctrl"
                  >
                    <RotateCcw size={18} />
                  </button>
                  <button
                    onClick={clearBets}
                    disabled={status !== "BETTING" || bets.length === 0}
                    title="Clear"
                    className="roulette-ctrl"
                  >
                    <X size={20} />
                  </button>
                  <button
                    onClick={repeatLastBets}
                    disabled={status !== "BETTING" || lastBetsRef.current.length === 0}
                    title="Repeat"
                    className="roulette-ctrl"
                  >
                    <Repeat size={18} />
                  </button>
                </div>

                <div className="text-right text-[9px] text-white/60 space-y-0.5">
                  <div><span className="text-white/40">Staked:</span> <span className="font-bold text-yellow-400">{fmt(totalStaked)}</span></div>
                  <div><span className="text-white/40">Bets:</span> <span className="font-bold text-white">{bets.length}</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===== BOTTOM STATUS BAR ===== */}
        <div className="relative bg-gradient-to-b from-[#1a1a1c] to-[#0a0a0c] px-4 py-3 border-t border-white/10 flex items-center justify-between gap-4">
          <button onClick={() => setMuted(m => !m)} className="flex items-center gap-2">
            {muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
            <span className="text-[9px] text-white/60">{muted ? "Muted" : "Sound"}</span>
          </button>

          <div className="flex items-center gap-6 text-[10px] uppercase tracking-widest">
            <div>
              <span className="text-white/40">Cash: </span>
              <span className="text-yellow-400 font-bold">{user ? fmt(Math.floor(wallet?.available ?? 0)) : "—"}</span>
            </div>
            <div>
              <span className="text-white/40">Bet: </span>
              <span className="text-white font-bold">{fmt(totalStaked)}</span>
            </div>
            <div>
              <span className="text-white/40">Win: </span>
              <span className="text-emerald-400 font-bold">{fmt(lastWin)}</span>
            </div>
          </div>

          <div className="text-[9px] text-white/50">
            {globalBetCount} bets placed
          </div>
        </div>

        {!user && (
          <div className="bg-red-900/30 border-t border-red-700/40 p-2 text-center text-xs">
            Please <a href="/auth/login" className="underline text-yellow-400 font-semibold">log in</a> to place bets.
          </div>
        )}
      </div>
    </div>

      {/* ── Betting Start / Stop Toast Alert ── */}
      <AnimatePresence mode="wait">
        {bettingAlert && (
          <motion.div
            key={bettingAlert.key}
            initial={{ opacity: 0, y: -60, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -40, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] pointer-events-none"
          >
            <div
              className={`flex items-center gap-3 px-6 py-3 rounded-2xl shadow-2xl border-2 font-bold text-lg tracking-wide backdrop-blur-md ${
                bettingAlert.type === "open"
                  ? "bg-emerald-900/90 border-emerald-400 text-emerald-200 shadow-emerald-900/60"
                  : "bg-red-900/90 border-red-400 text-red-200 shadow-red-900/60"
              }`}
            >
              <span className="text-2xl">{bettingAlert.type === "open" ? "🟢" : "🔴"}</span>
              <div>
                <div className={`text-base font-extrabold uppercase tracking-widest ${
                  bettingAlert.type === "open" ? "text-emerald-300" : "text-red-300"
                }`}>
                  {bettingAlert.type === "open" ? "Betting Open" : "No More Bets"}
                </div>
                <div className="text-xs font-normal text-white/70 mt-0.5">
                  {bettingAlert.type === "open"
                    ? "Place your bets now!"
                    : "Wheel is spinning – good luck!"}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Result Popup */}
      <AnimatePresence>
        {resultPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setResultPopup(null)}
          >
            <motion.div
              initial={{ scale: 0.7, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.7, y: 30 }}
              className={`rounded-2xl p-8 max-w-sm w-full text-center border-4 ${resultPopup.payout > 0 ? "bg-gradient-to-br from-yellow-600 to-amber-700 border-yellow-200" : "bg-gradient-to-br from-neutral-800 to-neutral-900 border-neutral-700"}`}
            >
              <div className="text-7xl mb-2">{resultPopup.payout > 0 ? "🎉" : "🎲"}</div>
              <h2 className="text-3xl font-bold text-white mb-2">
                {resultPopup.payout > 0 ? "You Won!" : "Better luck next time"}
              </h2>
              <div className="text-white/80 text-sm mb-4">
                Winning number: <span className="font-bold text-2xl" style={{ color: color(resultPopup.winningNumber) === "#1a1a1a" ? "#999" : color(resultPopup.winningNumber) }}>{resultPopup.winningNumber}</span>
              </div>
              {resultPopup.payout > 0 && (
                <div className="bg-black/30 rounded-lg p-3 mb-4">
                  <div className="text-xs uppercase tracking-wider text-white/60">Payout</div>
                  <div className="text-4xl font-bold text-yellow-200 flex items-center justify-center gap-2">
                    <Trophy size={28} /> {fmt(resultPopup.payout)}
                  </div>
                </div>
              )}
              <button onClick={() => setResultPopup(null)} className="w-full bg-black/40 hover:bg-black/60 text-white font-semibold py-2 rounded-lg transition">
                Continue
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Beautiful Premium Toast Notification ── */}
      <AnimatePresence>
        {errorToast && (
          <motion.div
            initial={{ opacity: 0, y: -50, x: "-50%", scale: 0.9 }}
            animate={{ opacity: 1, y: 0, x: "-50%", scale: 1 }}
            exit={{ opacity: 0, y: -20, x: "-50%", scale: 0.95 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className="fixed top-6 left-1/2 z-50 w-full max-w-sm px-4"
          >
            <div className="bg-[#180a0f]/95 border-2 border-red-500/50 backdrop-blur-xl p-4 rounded-xl shadow-[0_8px_32px_rgba(239,68,68,0.25),0_0_15px_rgba(239,68,68,0.15)] flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center text-red-400 shrink-0 border border-red-500/30 shadow-[inset_0_0_10px_rgba(239,68,68,0.2)] animate-pulse">
                <AlertTriangle size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-red-200 tracking-wide uppercase text-[10px]">Error Alert</h4>
                <p className="text-sm text-white/90 font-medium leading-relaxed mt-0.5 break-words">
                  {errorToast}
                </p>
              </div>
              <button
                onClick={() => setErrorToast(null)}
                className="text-white/40 hover:text-white/90 transition text-lg px-2 py-1 hover:bg-white/5 rounded-md self-start font-bold"
              >
                &times;
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
