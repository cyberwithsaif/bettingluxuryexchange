"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "@/lib/stores/auth";
import { PlinkoBoard, PlinkoResult } from "@/components/plinko/PlinkoBoard";
import { io, Socket } from "socket.io-client";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, Zap, Play, Square, RotateCcw, Shield, ChevronDown } from "lucide-react";

const ROWS_OPTIONS = [8, 12, 16, 24] as const;
const RISK_OPTIONS = ["low", "medium", "high"] as const;
type Rows = (typeof ROWS_OPTIONS)[number];
type Risk = (typeof RISK_OPTIONS)[number];

interface LiveBet {
  betId: string; username: string; betAmount: number;
  rows: number; riskLevel: string; slot: number;
  multiplier: number; payout: number;
}

interface Note { id: number; text: string; kind: "ok" | "bad" | "info" }

function multColor(m: number) {
  if (m >= 100) return "text-white font-black";
  if (m >= 20)  return "text-yellow-400 font-bold";
  if (m >= 5)   return "text-orange-400 font-bold";
  if (m >= 2)   return "text-green-400 font-semibold";
  if (m >= 1)   return "text-sky-400";
  return "text-red-400";
}

const RISK_STYLES: Record<Risk, string> = {
  low:    "bg-green-600/20 border-green-500/40 text-green-400",
  medium: "bg-yellow-600/20 border-yellow-500/40 text-yellow-400",
  high:   "bg-red-700/20 border-red-600/40 text-red-400",
};

export default function PlinkoPage() {
  const { user, accessToken: token } = useAuthStore();

  const [notes, setNotes] = useState<Note[]>([]);
  const noteId = useRef(0);
  const notify = useCallback((text: string, kind: Note["kind"] = "info") => {
    const id = ++noteId.current;
    setNotes(p => [...p, { id, text, kind }].slice(-3));
    setTimeout(() => setNotes(p => p.filter(n => n.id !== id)), 3500);
  }, []);

  const [rows,       setRows]       = useState<Rows>(16);
  const [risk,       setRisk]       = useState<Risk>("medium");
  const [betAmount,  setBetAmount]  = useState(100);
  const [clientSeed, setClientSeed] = useState(
    () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36),
  );
  const [turbo, setTurbo] = useState(false);

  const [config,    setConfig]    = useState<{ minBet: number; maxBet: number; enabled: boolean } | null>(null);
  const [multTable, setMultTable] = useState<number[]>([]);
  const [result,    setResult]    = useState<(PlinkoResult & { payout: number; betAmount: number }) | null>(null);
  const [animating, setAnimating] = useState(false);
  const [dropping,  setDropping]  = useState(false);
  const [balance,   setBalance]   = useState<number | null>(null);

  const [autoPlay,     setAutoPlay]     = useState(false);
  const [autoCount,    setAutoCount]    = useState(10);
  const [autoLeft,     setAutoLeft]     = useState(0);
  const [stopOnProfit, setStopOnProfit] = useState(0);
  const [stopOnLoss,   setStopOnLoss]   = useState(0);
  const [sessionProfit,setSessionProfit]= useState(0);
  const [showAuto,     setShowAuto]     = useState(false);
  const [showFair,     setShowFair]     = useState(false);

  const [history,  setHistory]  = useState<(PlinkoResult & { payout: number; betAmount: number })[]>([]);
  const [liveFeed, setLiveFeed] = useState<LiveBet[]>([]);

  const autoRef     = useRef(false);
  const animDoneRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    fetch(`/api/plinko/config?rows=${rows}&risk=${risk}`)
      .then(r => r.json())
      .then(d => { setConfig(d); setMultTable(d.multipliers ?? []); })
      .catch(() => {});
  }, [rows, risk]);

  const fetchBalance = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch("/api/wallet/summary", { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setBalance(Number(d.balance ?? 0));
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  useEffect(() => {
    const socket: Socket = io("/plinko", { path: "/socket.io", transports: ["websocket"] });
    socket.on("plinko:bet", (bet: LiveBet) => {
      setLiveFeed(prev => [bet, ...prev].slice(0, 15));
    });
    return () => { socket.disconnect(); };
  }, []);

  const drop = useCallback(async (): Promise<boolean> => {
    if (!token)           { notify("Please log in to play", "bad"); return false; }
    if (!config?.enabled) { notify("Plinko is currently disabled", "bad"); return false; }
    if (animating && !turbo) return false;
    if (betAmount < (config?.minBet ?? 10)) {
      notify(`Minimum bet is ₹${config?.minBet}`, "bad"); return false;
    }
    setDropping(true);
    try {
      const res = await fetch("/api/plinko/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ betAmount, rows, riskLevel: risk, clientSeed }),
      });
      const data = await res.json();
      if (!res.ok) { notify(data.message ?? "Bet failed", "bad"); return false; }

      const r: PlinkoResult & { payout: number; betAmount: number } = {
        path: data.path, slot: data.slot, multiplier: data.multiplier,
        payout: data.payout, betAmount,
      };
      setResult(r);
      setAnimating(true);
      setHistory(prev => [r, ...prev].slice(0, 50));
      setSessionProfit(prev => prev + data.profit);
      fetchBalance();
      if (data.multiplier >= 10) notify(`${data.multiplier}× — Won ₹${data.payout.toLocaleString()}!`, "ok");
      return true;
    } catch {
      notify("Connection error", "bad"); return false;
    } finally {
      setDropping(false);
    }
  }, [token, config, animating, turbo, betAmount, rows, risk, clientSeed, fetchBalance, notify]);

  const onAnimComplete = useCallback(() => {
    setAnimating(false);
    animDoneRef.current?.();
    animDoneRef.current = null;
  }, []);

  const startAuto = useCallback(async () => {
    autoRef.current = true;
    setAutoLeft(autoCount);
    setSessionProfit(0);
    let left = autoCount;
    let profit = 0;
    while (left > 0 && autoRef.current) {
      if (animating) await new Promise<void>(res => { animDoneRef.current = res; });
      const ok = await drop();
      if (!ok) break;
      await new Promise<void>(res => { animDoneRef.current = res; });
      left--;
      setAutoLeft(left);
      profit = sessionProfit;
      if (stopOnProfit > 0 && profit >= stopOnProfit) { notify("Auto-play: profit target reached", "info"); break; }
      if (stopOnLoss   > 0 && profit <= -stopOnLoss)  { notify("Auto-play: loss limit reached", "info"); break; }
    }
    autoRef.current = false;
    setAutoPlay(false);
  }, [autoCount, animating, drop, sessionProfit, stopOnProfit, stopOnLoss, notify]);

  const stopAuto   = () => { autoRef.current = false; setAutoPlay(false); };
  const handleDrop = () => { if (!autoPlay) drop(); };
  const handleAuto = () => { if (autoPlay) { stopAuto(); return; } setAutoPlay(true); startAuto(); };
  const half = () => setBetAmount(a => Math.max(config?.minBet ?? 10, Math.floor(a / 2)));
  const dbl  = () => setBetAmount(a => Math.min(config?.maxBet ?? 100000, a * 2));

  return (
    <div className="h-[calc(100vh-56px)] bg-[#0b0c12] text-white flex overflow-hidden">

      {/* Toast */}
      <div className="fixed top-16 right-3 z-50 flex flex-col gap-1.5 pointer-events-none">
        <AnimatePresence>
          {notes.map(n => (
            <motion.div key={n.id}
              initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }}
              className={`px-3 py-2 rounded-lg text-xs font-semibold shadow-xl
                ${n.kind === "ok" ? "bg-green-600/90" : n.kind === "bad" ? "bg-red-600/90" : "bg-indigo-600/90"} text-white backdrop-blur`}>
              {n.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Left Controls ─────────────────────────────────────────────────── */}
      <aside className="w-[220px] shrink-0 bg-[#10111a] border-r border-white/[0.07] flex flex-col p-3 gap-3 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">

        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-sm">🎯</div>
          <div>
            <div className="font-bold text-sm leading-tight">Plinko</div>
            <div className="text-[10px] text-white/40">Provably Fair</div>
          </div>
          {balance !== null && (
            <div className="ml-auto text-right">
              <div className="text-[9px] text-white/40">Balance</div>
              <div className="text-xs font-bold text-yellow-400">₹{balance.toLocaleString()}</div>
            </div>
          )}
        </div>

        {/* Bet Amount */}
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-widest text-white/40">Bet Amount</div>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40 text-xs">₹</span>
            <input type="number" min={config?.minBet ?? 10} max={config?.maxBet ?? 100000}
              value={betAmount} onChange={e => setBetAmount(Math.max(1, Number(e.target.value)))}
              className="w-full bg-[#0b0c12] border border-white/10 rounded-lg pl-6 pr-3 py-1.5 text-sm focus:outline-none focus:border-violet-500 transition" />
          </div>
          <div className="grid grid-cols-5 gap-1">
            {[10, 50, 100, 500, 1000].map(v => (
              <button key={v} onClick={() => setBetAmount(v)}
                className="text-[10px] py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] transition font-medium">
                {v >= 1000 ? "1k" : v}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-1">
            <button onClick={half} className="text-[10px] py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] transition">½</button>
            <button onClick={dbl}  className="text-[10px] py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] transition">2×</button>
            <button onClick={() => setBetAmount(balance ?? 100)} className="text-[10px] py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] transition">Max</button>
          </div>
        </div>

        {/* Risk */}
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-widest text-white/40">Risk</div>
          <div className="grid grid-cols-3 gap-1">
            {RISK_OPTIONS.map(r => (
              <button key={r} onClick={() => setRisk(r)}
                className={`py-1.5 rounded-lg text-[10px] font-bold capitalize border transition ${
                  risk === r ? RISK_STYLES[r] : "bg-transparent border-white/10 text-white/40 hover:border-white/25"
                }`}>
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Rows */}
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-widest text-white/40">Rows</div>
          <div className="grid grid-cols-4 gap-1">
            {ROWS_OPTIONS.map(r => (
              <button key={r} onClick={() => setRows(r)}
                className={`py-1.5 rounded-lg text-[10px] font-bold border transition ${
                  rows === r ? "bg-violet-600/25 border-violet-500/50 text-violet-300" : "bg-transparent border-white/10 text-white/40 hover:border-white/25"
                }`}>
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Turbo */}
        <label className="flex items-center gap-2 cursor-pointer select-none group">
          <div onClick={() => setTurbo(v => !v)}
            className={`w-8 h-4 rounded-full transition relative ${turbo ? "bg-violet-600" : "bg-white/10"}`}>
            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${turbo ? "left-4.5" : "left-0.5"}`} />
          </div>
          <Zap size={11} className={turbo ? "text-yellow-400" : "text-white/30"} />
          <span className="text-[10px] text-white/50 group-hover:text-white/70 transition">Turbo</span>
        </label>

        {/* Drop Button */}
        <button onClick={handleDrop}
          disabled={dropping || (animating && !turbo) || autoPlay || !user}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 font-bold text-sm tracking-wide disabled:opacity-40 hover:brightness-110 active:scale-95 transition shadow-lg shadow-violet-900/30 flex items-center justify-center gap-2">
          {dropping
            ? <RefreshCw size={15} className="animate-spin" />
            : !user ? "Login to Play" : "Drop Ball"}
        </button>

        {/* Auto Play */}
        <div className="border border-white/[0.07] rounded-xl overflow-hidden">
          <button onClick={() => setShowAuto(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] uppercase tracking-widest text-white/40 hover:text-white/60 transition">
            Auto Play
            <ChevronDown size={11} className={`transition-transform ${showAuto ? "rotate-180" : ""}`} />
          </button>
          {showAuto && (
            <div className="px-3 pb-3 space-y-2 border-t border-white/[0.07]">
              <div>
                <div className="text-[9px] text-white/40 mb-0.5 mt-2">Number of bets</div>
                <input type="number" min={1} max={1000} value={autoCount} onChange={e => setAutoCount(Number(e.target.value))}
                  className="w-full bg-[#0b0c12] border border-white/10 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-violet-500" />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <div className="text-[9px] text-white/40 mb-0.5">Stop profit ₹</div>
                  <input type="number" min={0} value={stopOnProfit} onChange={e => setStopOnProfit(Number(e.target.value))}
                    className="w-full bg-[#0b0c12] border border-white/10 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-violet-500" />
                </div>
                <div>
                  <div className="text-[9px] text-white/40 mb-0.5">Stop loss ₹</div>
                  <input type="number" min={0} value={stopOnLoss} onChange={e => setStopOnLoss(Number(e.target.value))}
                    className="w-full bg-[#0b0c12] border border-white/10 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-violet-500" />
                </div>
              </div>
              {autoPlay && (
                <div className="text-[10px] text-white/50 flex justify-between">
                  <span>Left: <b className="text-white">{autoLeft}</b></span>
                  <span className={sessionProfit >= 0 ? "text-green-400" : "text-red-400"}>₹{sessionProfit.toFixed(0)}</span>
                </div>
              )}
              <button onClick={handleAuto} disabled={!user}
                className={`w-full py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition disabled:opacity-40 ${
                  autoPlay ? "bg-red-700/80 hover:bg-red-600" : "bg-violet-600/40 hover:bg-violet-600/70 text-violet-200"
                }`}>
                {autoPlay ? <><Square size={11} /> Stop</> : <><Play size={11} /> Start Auto</>}
              </button>
            </div>
          )}
        </div>

        {/* Provably Fair */}
        <div className="border border-white/[0.07] rounded-xl overflow-hidden">
          <button onClick={() => setShowFair(v => !v)}
            className="w-full flex items-center gap-1.5 px-3 py-2 text-[10px] uppercase tracking-widest text-white/40 hover:text-white/60 transition">
            <Shield size={10} /> Provably Fair
            <ChevronDown size={11} className={`ml-auto transition-transform ${showFair ? "rotate-180" : ""}`} />
          </button>
          {showFair && (
            <div className="px-3 pb-3 border-t border-white/[0.07]">
              <div className="text-[9px] text-white/40 mb-1 mt-2">Client Seed</div>
              <div className="flex gap-1">
                <input type="text" value={clientSeed} onChange={e => setClientSeed(e.target.value)}
                  className="flex-1 bg-[#0b0c12] border border-white/10 rounded-lg px-2 py-1 text-[10px] font-mono focus:outline-none focus:border-violet-500 min-w-0" />
                <button onClick={() => setClientSeed(Math.random().toString(36).slice(2, 12))}
                  className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] transition shrink-0">
                  <RotateCcw size={10} />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Board area ────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">

        {/* Board */}
        <div className="flex-1 relative min-h-0">
          <PlinkoBoard rows={rows} riskLevel={risk} multiplierTable={multTable}
            result={result} animating={animating} turbo={turbo} onAnimComplete={onAnimComplete} />

          {/* Win popup */}
          <AnimatePresence>
            {result && !animating && result.multiplier >= 2 && (
              <motion.div key={result.slot}
                initial={{ opacity: 0, scale: 0.6, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
                className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none z-10">
                <div className={`px-5 py-2.5 rounded-2xl backdrop-blur-md text-center border
                  ${result.multiplier >= 100 ? "bg-white/20 border-white/40" :
                    result.multiplier >= 20  ? "bg-yellow-900/60 border-yellow-500/40" :
                    result.multiplier >= 5   ? "bg-orange-900/60 border-orange-500/40" :
                                               "bg-green-900/60 border-green-500/40"}`}>
                  <div className={`text-3xl font-black ${multColor(result.multiplier)}`}>{result.multiplier}×</div>
                  <div className="text-xs text-white/60 mt-0.5">₹{result.payout?.toLocaleString()}</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* History strip */}
        <div className="h-9 border-t border-white/[0.07] bg-[#10111a] flex items-center px-3 gap-2 overflow-x-auto scrollbar-none shrink-0">
          {history.length === 0
            ? <span className="text-[10px] text-white/20">No bets yet…</span>
            : history.slice(0, 40).map((h, i) => (
                <span key={i} className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-bold bg-white/5 ${multColor(h.multiplier)}`}>
                  {h.multiplier}×
                </span>
              ))
          }
        </div>
      </div>

      {/* ── Live Feed ─────────────────────────────────────────────────────────── */}
      <aside className="w-[160px] shrink-0 bg-[#10111a] border-l border-white/[0.07] flex flex-col">
        <div className="px-3 py-2 border-b border-white/[0.07] text-[9px] uppercase tracking-widest text-white/30 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Live Bets
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-none">
          <AnimatePresence initial={false}>
            {liveFeed.map(b => (
              <motion.div key={b.betId}
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                className="flex flex-col px-3 py-1.5 border-b border-white/[0.04] hover:bg-white/[0.03] transition">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium truncate text-white/80">{b.username}</span>
                  <span className={`text-[10px] font-bold ${multColor(b.multiplier)}`}>{b.multiplier}×</span>
                </div>
                <div className="text-[9px] text-white/30">₹{b.betAmount} · {b.rows}R</div>
              </motion.div>
            ))}
          </AnimatePresence>
          {liveFeed.length === 0 && (
            <div className="p-3 text-[10px] text-white/20 text-center pt-6">Waiting…</div>
          )}
        </div>
      </aside>
    </div>
  );
}
