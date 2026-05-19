"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "@/lib/stores/auth";
import { PlinkoBoard, PlinkoResult } from "@/components/plinko/PlinkoBoard";
import { io, Socket } from "socket.io-client";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown, ChevronUp, RefreshCw, Zap, Play, Square, RotateCcw, Shield, X,
} from "lucide-react";

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

export default function PlinkoPage() {
  const { user, accessToken: token } = useAuthStore();

  // ── Notifications ─────────────────────────────────────────────────────────
  const [notes, setNotes] = useState<Note[]>([]);
  const noteId = useRef(0);
  const notify = useCallback((text: string, kind: Note["kind"] = "info") => {
    const id = ++noteId.current;
    setNotes(p => [...p, { id, text, kind }].slice(-4));
    setTimeout(() => setNotes(p => p.filter(n => n.id !== id)), 3500);
  }, []);

  // ── Game config ───────────────────────────────────────────────────────────
  const [rows,       setRows]       = useState<Rows>(16);
  const [risk,       setRisk]       = useState<Risk>("medium");
  const [betAmount,  setBetAmount]  = useState(100);
  const [clientSeed, setClientSeed] = useState(
    () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36),
  );
  const [turbo, setTurbo] = useState(false);

  // ── Game state ────────────────────────────────────────────────────────────
  const [config,    setConfig]    = useState<{ minBet: number; maxBet: number; enabled: boolean } | null>(null);
  const [multTable, setMultTable] = useState<number[]>([]);
  const [result,    setResult]    = useState<(PlinkoResult & { payout: number; betAmount: number }) | null>(null);
  const [animating, setAnimating] = useState(false);
  const [dropping,  setDropping]  = useState(false);
  const [balance,   setBalance]   = useState<number | null>(null);

  // ── Auto-play ─────────────────────────────────────────────────────────────
  const [autoPlay,     setAutoPlay]     = useState(false);
  const [autoCount,    setAutoCount]    = useState(10);
  const [autoLeft,     setAutoLeft]     = useState(0);
  const [stopOnProfit, setStopOnProfit] = useState(0);
  const [stopOnLoss,   setStopOnLoss]   = useState(0);
  const [sessionProfit,setSessionProfit]= useState(0);

  // ── History / live feed ───────────────────────────────────────────────────
  const [history,  setHistory]  = useState<(PlinkoResult & { payout: number; betAmount: number })[]>([]);
  const [liveFeed, setLiveFeed] = useState<LiveBet[]>([]);

  const autoRef     = useRef(false);
  const animDoneRef = useRef<(() => void) | null>(null);

  // ── Fetch config ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/plinko/config?rows=${rows}&risk=${risk}`)
      .then(r => r.json())
      .then(d => { setConfig(d); setMultTable(d.multipliers ?? []); })
      .catch(() => {});
  }, [rows, risk]);

  // ── Fetch balance ─────────────────────────────────────────────────────────
  const fetchBalance = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch("/api/wallet/balance", { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setBalance(Number(d.balance ?? 0));
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  // ── WebSocket live feed ───────────────────────────────────────────────────
  useEffect(() => {
    const socket: Socket = io("/plinko", { path: "/socket.io", transports: ["websocket"] });
    socket.on("plinko:bet", (bet: LiveBet) => {
      setLiveFeed(prev => [bet, ...prev].slice(0, 20));
    });
    return () => { socket.disconnect(); };
  }, []);

  // ── Core drop ─────────────────────────────────────────────────────────────
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

      if (data.multiplier >= 10) {
        notify(`🎉 ${data.multiplier}× — Won ₹${data.payout.toLocaleString()}!`, "ok");
      }
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

  // ── Auto-play loop ────────────────────────────────────────────────────────
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

  const stopAuto  = () => { autoRef.current = false; setAutoPlay(false); };
  const handleDrop = () => { if (!autoPlay) drop(); };
  const handleAuto = () => { if (autoPlay) { stopAuto(); return; } setAutoPlay(true); startAuto(); };
  const half   = () => setBetAmount(a => Math.max(config?.minBet ?? 10, Math.floor(a / 2)));
  const dbl    = () => setBetAmount(a => Math.min(config?.maxBet ?? 100000, a * 2));

  return (
    <div className="min-h-screen bg-[#0d0e15] text-white flex flex-col">

      {/* ── Toast notifications ──────────────────────────────────────────── */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {notes.map(n => (
            <motion.div key={n.id}
              initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 60 }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium shadow-xl pointer-events-auto
                ${n.kind === "ok" ? "bg-green-700" : n.kind === "bad" ? "bg-red-700" : "bg-blue-700"} text-white`}>
              {n.text}
              <button onClick={() => setNotes(p => p.filter(x => x.id !== n.id))} className="ml-1 opacity-70 hover:opacity-100">
                <X size={13} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-lg">🎯</div>
          <div>
            <h1 className="font-bold text-lg leading-none">Plinko</h1>
            <p className="text-xs text-white/40">Provably Fair</p>
          </div>
        </div>
        {balance !== null && (
          <div className="text-sm">
            <span className="text-white/50">Balance </span>
            <span className="font-bold text-yellow-400">₹{balance.toLocaleString()}</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col lg:flex-row overflow-hidden">

        {/* ── Controls ─────────────────────────────────────────────────── */}
        <div className="w-full lg:w-72 shrink-0 bg-[#13141f] border-r border-white/8 flex flex-col p-4 gap-4 overflow-y-auto">

          {/* Bet amount */}
          <div>
            <label className="text-xs uppercase tracking-wider text-white/50 mb-1 block">Bet Amount</label>
            <div className="flex items-center gap-2">
              <span className="text-white/50 text-sm">₹</span>
              <input type="number" min={config?.minBet ?? 10} max={config?.maxBet ?? 100000}
                value={betAmount} onChange={e => setBetAmount(Math.max(1, Number(e.target.value)))}
                className="flex-1 bg-[#0d0e15] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500" />
            </div>
            <div className="flex gap-1 mt-2">
              {[10, 50, 100, 500, 1000].map(v => (
                <button key={v} onClick={() => setBetAmount(v)}
                  className="flex-1 text-xs py-1 rounded bg-white/8 hover:bg-white/15 transition">
                  {v >= 1000 ? `${v / 1000}k` : v}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-1.5">
              <button onClick={half} className="flex-1 text-xs py-1 rounded bg-white/8 hover:bg-white/15 transition">½</button>
              <button onClick={dbl}  className="flex-1 text-xs py-1 rounded bg-white/8 hover:bg-white/15 transition">2×</button>
              <button onClick={() => setBetAmount(balance ?? 100)} className="flex-1 text-xs py-1 rounded bg-white/8 hover:bg-white/15 transition">Max</button>
            </div>
          </div>

          {/* Risk */}
          <div>
            <label className="text-xs uppercase tracking-wider text-white/50 mb-1 block">Risk</label>
            <div className="grid grid-cols-3 gap-1">
              {RISK_OPTIONS.map(r => (
                <button key={r} onClick={() => setRisk(r)}
                  className={`py-2 rounded-lg text-xs font-bold capitalize transition ${
                    risk === r
                      ? r === "low" ? "bg-green-600 text-white" : r === "medium" ? "bg-yellow-600 text-white" : "bg-red-700 text-white"
                      : "bg-white/8 text-white/60 hover:bg-white/15"
                  }`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Rows */}
          <div>
            <label className="text-xs uppercase tracking-wider text-white/50 mb-1 block">Rows</label>
            <div className="grid grid-cols-4 gap-1">
              {ROWS_OPTIONS.map(r => (
                <button key={r} onClick={() => setRows(r)}
                  className={`py-2 rounded-lg text-xs font-bold transition ${rows === r ? "bg-purple-600 text-white" : "bg-white/8 text-white/60 hover:bg-white/15"}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Turbo */}
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input type="checkbox" checked={turbo} onChange={e => setTurbo(e.target.checked)} className="w-4 h-4 accent-purple-500" />
            <Zap size={14} className="text-yellow-400" /> Turbo mode
          </label>

          {/* Drop */}
          <button onClick={handleDrop}
            disabled={dropping || (animating && !turbo) || autoPlay || !user}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 font-bold text-lg tracking-wide disabled:opacity-40 hover:brightness-110 transition shadow-lg shadow-purple-900/40">
            {dropping ? <RefreshCw size={18} className="animate-spin mx-auto" /> : "Drop Ball"}
          </button>

          {/* Auto play */}
          <details className="group">
            <summary className="text-xs uppercase tracking-wider text-white/50 cursor-pointer flex items-center gap-1 select-none list-none">
              Auto Play <ChevronDown size={12} className="group-open:hidden" /><ChevronUp size={12} className="hidden group-open:block" />
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <label className="text-xs text-white/50 block mb-1">Number of bets</label>
                <input type="number" min={1} max={1000} value={autoCount} onChange={e => setAutoCount(Number(e.target.value))}
                  className="w-full bg-[#0d0e15] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="text-xs text-white/50 block mb-1">Stop on profit (₹)</label>
                <input type="number" min={0} value={stopOnProfit} onChange={e => setStopOnProfit(Number(e.target.value))}
                  className="w-full bg-[#0d0e15] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="text-xs text-white/50 block mb-1">Stop on loss (₹)</label>
                <input type="number" min={0} value={stopOnLoss} onChange={e => setStopOnLoss(Number(e.target.value))}
                  className="w-full bg-[#0d0e15] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500" />
              </div>
              {autoPlay && (
                <div className="text-xs text-white/60">
                  Bets left: <span className="text-white font-bold">{autoLeft}</span> •
                  P/L: <span className={sessionProfit >= 0 ? "text-green-400" : "text-red-400"}>₹{sessionProfit.toFixed(0)}</span>
                </div>
              )}
              <button onClick={handleAuto} disabled={!user}
                className={`w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition disabled:opacity-40 ${autoPlay ? "bg-red-700 hover:bg-red-600" : "bg-white/10 hover:bg-white/20"}`}>
                {autoPlay ? <><Square size={14} /> Stop Auto</> : <><Play size={14} /> Start Auto</>}
              </button>
            </div>
          </details>

          {/* Provably fair */}
          <details className="group">
            <summary className="text-xs uppercase tracking-wider text-white/50 cursor-pointer flex items-center gap-1 select-none list-none">
              <Shield size={12} /> Provably Fair <ChevronDown size={12} className="group-open:hidden" /><ChevronUp size={12} className="hidden group-open:block" />
            </summary>
            <div className="mt-3 space-y-2">
              <div>
                <label className="text-xs text-white/50 block mb-1">Client Seed</label>
                <div className="flex gap-1">
                  <input type="text" value={clientSeed} onChange={e => setClientSeed(e.target.value)}
                    className="flex-1 bg-[#0d0e15] border border-white/10 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-purple-500" />
                  <button onClick={() => setClientSeed(Math.random().toString(36).slice(2, 12))}
                    className="p-1 rounded bg-white/8 hover:bg-white/15"><RotateCcw size={12} /></button>
                </div>
              </div>
              <p className="text-xs text-white/40">Verify any bet at <span className="text-purple-400">/api/plinko/verify/:betId</span></p>
            </div>
          </details>
        </div>

        {/* ── Board ────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 relative">
            <PlinkoBoard rows={rows} riskLevel={risk} multiplierTable={multTable}
              result={result} animating={animating} turbo={turbo} onAnimComplete={onAnimComplete} />

            <AnimatePresence>
              {result && !animating && result.multiplier >= 2 && (
                <motion.div key={result.slot}
                  initial={{ opacity: 0, scale: 0.5, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }}
                  className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-none">
                  <div className={`px-6 py-3 rounded-2xl backdrop-blur-md text-center shadow-2xl border border-white/20
                    ${result.multiplier >= 100 ? "bg-white/20" : result.multiplier >= 20 ? "bg-yellow-900/60" : result.multiplier >= 5 ? "bg-orange-900/60" : "bg-green-900/60"}`}>
                    <div className={`text-4xl font-black ${multColor(result.multiplier)}`}>{result.multiplier}×</div>
                    <div className="text-sm text-white/70">₹{result.payout?.toLocaleString()}</div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* History strip */}
          {history.length > 0 && (
            <div className="border-t border-white/8 px-4 py-2 flex gap-2 overflow-x-auto no-scrollbar">
              {history.slice(0, 30).map((h, i) => (
                <div key={i} className={`shrink-0 text-xs px-2 py-1 rounded font-bold ${multColor(h.multiplier)}`}>{h.multiplier}×</div>
              ))}
            </div>
          )}
        </div>

        {/* ── Live feed ────────────────────────────────────────────────── */}
        <div className="w-full lg:w-64 shrink-0 bg-[#13141f] border-l border-white/8 flex flex-col">
          <div className="px-4 py-3 border-b border-white/8 text-xs uppercase tracking-wider text-white/50">Live Bets</div>
          <div className="flex-1 overflow-y-auto">
            <AnimatePresence initial={false}>
              {liveFeed.map(b => (
                <motion.div key={b.betId} initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 hover:bg-white/3 transition">
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{b.username}</div>
                    <div className="text-xs text-white/40">{b.rows}R {b.riskLevel}</div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <div className={`text-xs font-bold ${multColor(b.multiplier)}`}>{b.multiplier}×</div>
                    <div className="text-xs text-white/50">₹{b.betAmount}</div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {liveFeed.length === 0 && <div className="p-4 text-xs text-white/30 text-center">Waiting for bets…</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
