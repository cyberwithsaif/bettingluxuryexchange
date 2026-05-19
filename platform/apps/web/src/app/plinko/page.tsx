"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "@/lib/stores/auth";
import { PlinkoBoard, QueueItem } from "@/components/plinko/PlinkoBoard";
import { io, Socket } from "socket.io-client";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Play, Square, RotateCcw, Shield, ChevronDown, RefreshCw } from "lucide-react";

const ROWS_OPTIONS = [8, 12, 16, 24] as const;
const RISK_OPTIONS = ["low", "medium", "high"] as const;
type Rows = (typeof ROWS_OPTIONS)[number];
type Risk = (typeof RISK_OPTIONS)[number];

interface LiveBet {
  betId: string; username: string; betAmount: number;
  rows: number; riskLevel: string; multiplier: number; payout: number;
}
interface Note { id: number; text: string; kind: "ok" | "bad" | "info" }

function multColor(m: number) {
  if (m >= 100) return "text-white font-black";
  if (m >= 20)  return "text-yellow-400 font-bold";
  if (m >= 5)   return "text-orange-400 font-bold";
  if (m >= 2)   return "text-green-400";
  if (m >= 1)   return "text-sky-400";
  return "text-red-400";
}

const RISK_ACTIVE: Record<Risk, string> = {
  low:    "bg-green-600/25 border-green-500/60 text-green-300",
  medium: "bg-amber-600/25 border-amber-500/60 text-amber-300",
  high:   "bg-red-700/25 border-red-600/60 text-red-300",
};

export default function PlinkoPage() {
  const { user, accessToken: token } = useAuthStore();

  // Toast
  const [notes, setNotes] = useState<Note[]>([]);
  const noteId = useRef(0);
  const notify = useCallback((text: string, kind: Note["kind"] = "info") => {
    const id = ++noteId.current;
    setNotes(p => [...p, { id, text, kind }].slice(-3));
    setTimeout(() => setNotes(p => p.filter(n => n.id !== id)), 3200);
  }, []);

  // Config
  const [rows,      setRows]      = useState<Rows>(16);
  const [risk,      setRisk]      = useState<Risk>("medium");
  const [betAmount, setBetAmount] = useState(100);
  const [clientSeed,setClientSeed]= useState(() => Math.random().toString(36).slice(2,12) + Date.now().toString(36));
  const [turbo,     setTurbo]     = useState(false);

  const [config,    setConfig]    = useState<{ minBet:number; maxBet:number; enabled:boolean }|null>(null);
  const [multTable, setMultTable] = useState<number[]>([]);
  const [balance,   setBalance]   = useState<number|null>(null);

  // Multi-ball queue
  const [queue,     setQueue]     = useState<QueueItem[]>([]);
  const dropIdRef   = useRef(0);

  // History
  const [history,   setHistory]   = useState<{ mult: number; payout: number }[]>([]);
  const [liveFeed,  setLiveFeed]  = useState<LiveBet[]>([]);

  // Auto-play
  const [autoPlay,     setAutoPlay]      = useState(false);
  const [autoCount,    setAutoCount]     = useState(10);
  const [autoLeft,     setAutoLeft]      = useState(0);
  const [stopOnProfit, setStopOnProfit]  = useState(0);
  const [stopOnLoss,   setStopOnLoss]    = useState(0);
  const [sessionPL,    setSessionPL]     = useState(0);
  const [showAuto,     setShowAuto]      = useState(false);
  const [showFair,     setShowFair]      = useState(false);
  const autoRef = useRef(false);
  const sessionPLRef = useRef(0);

  // Fetch config on rows/risk change
  useEffect(() => {
    fetch(`/api/plinko/config?rows=${rows}&risk=${risk}`)
      .then(r => r.json())
      .then(d => { setConfig(d); setMultTable(d.multipliers ?? []); })
      .catch(() => {});
  }, [rows, risk]);

  // Balance
  const fetchBalance = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch("/api/wallet/summary", { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setBalance(Number(d.balance ?? 0));
    } catch { /* ignore */ }
  }, [token]);
  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  // Live feed
  useEffect(() => {
    const socket: Socket = io("/plinko", { path: "/socket.io", transports: ["websocket"] });
    socket.on("plinko:bet", (bet: LiveBet) => setLiveFeed(p => [bet, ...p].slice(0, 20)));
    return () => { socket.disconnect(); };
  }, []);

  // Drop — no animation guard, allows unlimited concurrent balls
  const drop = useCallback(async (): Promise<number> => {
    if (!token)           { notify("Login to play", "bad"); return 0; }
    if (!config?.enabled) { notify("Plinko disabled", "bad"); return 0; }
    if (betAmount < (config?.minBet ?? 10)) { notify(`Min bet ₹${config.minBet}`, "bad"); return 0; }
    try {
      const res = await fetch("/api/plinko/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ betAmount, rows, riskLevel: risk, clientSeed }),
      });
      const data = await res.json();
      if (!res.ok) { notify(data.message ?? "Bet failed", "bad"); return 0; }

      const id = ++dropIdRef.current;
      setQueue(prev => [...prev, { id, path: data.path, slot: data.slot, multiplier: data.multiplier }]);
      setHistory(prev => [{ mult: data.multiplier, payout: data.payout }, ...prev].slice(0, 60));
      const pl = data.profit as number;
      setSessionPL(prev => { sessionPLRef.current = prev + pl; return prev + pl; });
      fetchBalance();
      if (data.multiplier >= 10) notify(`${data.multiplier}× — Won ₹${data.payout.toLocaleString()}!`, "ok");
      return pl;
    } catch {
      notify("Connection error", "bad"); return 0;
    }
  }, [token, config, betAmount, rows, risk, clientSeed, fetchBalance, notify]);

  const onBallDone = useCallback((id: number) => {
    setQueue(prev => prev.filter(q => q.id !== id));
  }, []);

  // Auto-play loop
  const startAuto = useCallback(async () => {
    autoRef.current = true;
    sessionPLRef.current = 0;
    setSessionPL(0);
    let left = autoCount;
    setAutoLeft(left);

    while (left > 0 && autoRef.current) {
      await drop();
      left--;
      setAutoLeft(left);
      if (stopOnProfit > 0 && sessionPLRef.current >= stopOnProfit) { notify("Profit target reached", "info"); break; }
      if (stopOnLoss   > 0 && sessionPLRef.current <= -stopOnLoss)  { notify("Loss limit reached",    "info"); break; }
      await new Promise(r => setTimeout(r, turbo ? 80 : 500));
    }
    autoRef.current = false;
    setAutoPlay(false);
  }, [autoCount, drop, stopOnProfit, stopOnLoss, turbo, notify]);

  const handleAuto = () => {
    if (autoPlay) { autoRef.current = false; setAutoPlay(false); return; }
    setAutoPlay(true);
    startAuto();
  };

  const half = () => setBetAmount(a => Math.max(config?.minBet ?? 1, Math.floor(a / 2)));
  const dbl  = () => setBetAmount(a => Math.min(config?.maxBet ?? 100000, a * 2));

  const activeBalls = queue.length;

  return (
    <div className="h-[calc(100vh-56px)] bg-[#0b0c12] text-white flex overflow-hidden">

      {/* Toasts */}
      <div className="fixed top-16 right-3 z-50 flex flex-col gap-1 pointer-events-none">
        <AnimatePresence>
          {notes.map(n => (
            <motion.div key={n.id}
              initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xl backdrop-blur
                ${n.kind === "ok" ? "bg-green-600/90" : n.kind === "bad" ? "bg-red-600/90" : "bg-indigo-600/90"}`}>
              {n.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Left Controls ───────────────────────────────────────────────────── */}
      <aside className="w-[196px] shrink-0 bg-[#0f1018] border-r border-white/[0.07] flex flex-col overflow-y-auto scrollbar-none">
        <div className="p-3 space-y-3">

          {/* Header */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-xs shrink-0">🎯</div>
            <div className="min-w-0">
              <div className="text-xs font-bold truncate">Plinko</div>
              <div className="text-[9px] text-white/40">Provably Fair</div>
            </div>
            {balance !== null && (
              <div className="ml-auto text-right shrink-0">
                <div className="text-[8px] text-white/40">Balance</div>
                <div className="text-[10px] font-bold text-yellow-400">₹{balance.toLocaleString()}</div>
              </div>
            )}
          </div>

          {/* Bet Amount */}
          <div className="space-y-1">
            <div className="text-[9px] uppercase tracking-widest text-white/40">Bet Amount</div>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-white/40 text-xs">₹</span>
              <input type="number" min={config?.minBet ?? 1} max={config?.maxBet ?? 100000}
                value={betAmount} onChange={e => setBetAmount(Math.max(1, Number(e.target.value)))}
                className="w-full bg-[#0b0c12] border border-white/10 rounded-lg pl-5 pr-2 py-1.5 text-xs focus:outline-none focus:border-violet-500 transition" />
            </div>
            <div className="grid grid-cols-5 gap-0.5">
              {[10, 50, 100, 500, 1000].map(v => (
                <button key={v} onClick={() => setBetAmount(v)}
                  className="text-[9px] py-1 rounded bg-white/[0.06] hover:bg-white/[0.13] transition font-medium">
                  {v >= 1000 ? "1k" : v}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-0.5">
              <button onClick={half} className="text-[9px] py-1 rounded bg-white/[0.06] hover:bg-white/[0.13] transition">½</button>
              <button onClick={dbl}  className="text-[9px] py-1 rounded bg-white/[0.06] hover:bg-white/[0.13] transition">2×</button>
              <button onClick={() => setBetAmount(Math.floor(balance ?? 100))}
                className="text-[9px] py-1 rounded bg-white/[0.06] hover:bg-white/[0.13] transition">Max</button>
            </div>
          </div>

          {/* Risk */}
          <div className="space-y-1">
            <div className="text-[9px] uppercase tracking-widest text-white/40">Risk</div>
            <div className="grid grid-cols-3 gap-0.5">
              {RISK_OPTIONS.map(r => (
                <button key={r} onClick={() => setRisk(r)}
                  className={`py-1.5 rounded text-[9px] font-bold capitalize border transition ${
                    risk === r ? RISK_ACTIVE[r] : "bg-transparent border-white/10 text-white/40 hover:border-white/25"
                  }`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Rows */}
          <div className="space-y-1">
            <div className="text-[9px] uppercase tracking-widest text-white/40">Rows</div>
            <div className="grid grid-cols-4 gap-0.5">
              {ROWS_OPTIONS.map(r => (
                <button key={r} onClick={() => setRows(r)}
                  className={`py-1.5 rounded text-[9px] font-bold border transition ${
                    rows === r ? "bg-violet-600/25 border-violet-500/60 text-violet-300" : "bg-transparent border-white/10 text-white/40 hover:border-white/25"
                  }`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Turbo */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div onClick={() => setTurbo(v => !v)}
              className={`w-7 h-3.5 rounded-full transition relative shrink-0 ${turbo ? "bg-violet-600" : "bg-white/10"}`}>
              <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${turbo ? "left-[14px]" : "left-0.5"}`} />
            </div>
            <Zap size={10} className={turbo ? "text-yellow-400" : "text-white/30"} />
            <span className="text-[9px] text-white/50">Turbo</span>
          </label>

          {/* Drop Button */}
          <button onClick={() => drop()}
            disabled={!user}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 font-bold text-sm tracking-wide disabled:opacity-40 hover:brightness-110 active:scale-95 transition shadow-lg shadow-violet-900/30 relative">
            {!user ? "Login to Play" : "Drop Ball"}
            {activeBalls > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-yellow-400 text-black text-[9px] font-black flex items-center justify-center">
                {activeBalls}
              </span>
            )}
          </button>

          {/* Auto Play */}
          <div className="border border-white/[0.08] rounded-lg overflow-hidden">
            <button onClick={() => setShowAuto(v => !v)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 text-[9px] uppercase tracking-widest text-white/40 hover:text-white/60 transition">
              Auto Play
              <ChevronDown size={10} className={`transition-transform ${showAuto ? "rotate-180" : ""}`} />
            </button>
            {showAuto && (
              <div className="px-2.5 pb-2.5 space-y-1.5 border-t border-white/[0.08]">
                <div>
                  <div className="text-[8px] text-white/40 mb-0.5 mt-1.5">Bets</div>
                  <input type="number" min={1} max={1000} value={autoCount} onChange={e => setAutoCount(Number(e.target.value))}
                    className="w-full bg-[#0b0c12] border border-white/10 rounded px-2 py-1 text-xs focus:outline-none focus:border-violet-500" />
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <div>
                    <div className="text-[8px] text-white/40 mb-0.5">Stop profit</div>
                    <input type="number" min={0} value={stopOnProfit} onChange={e => setStopOnProfit(Number(e.target.value))}
                      className="w-full bg-[#0b0c12] border border-white/10 rounded px-2 py-1 text-[10px] focus:outline-none focus:border-violet-500" />
                  </div>
                  <div>
                    <div className="text-[8px] text-white/40 mb-0.5">Stop loss</div>
                    <input type="number" min={0} value={stopOnLoss} onChange={e => setStopOnLoss(Number(e.target.value))}
                      className="w-full bg-[#0b0c12] border border-white/10 rounded px-2 py-1 text-[10px] focus:outline-none focus:border-violet-500" />
                  </div>
                </div>
                {autoPlay && (
                  <div className="text-[9px] text-white/50 flex justify-between">
                    <span>Left: <b className="text-white">{autoLeft}</b></span>
                    <span className={sessionPL >= 0 ? "text-green-400" : "text-red-400"}>₹{sessionPL.toFixed(0)}</span>
                  </div>
                )}
                <button onClick={handleAuto} disabled={!user}
                  className={`w-full py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1 transition disabled:opacity-40 ${
                    autoPlay ? "bg-red-700/80 hover:bg-red-600 text-white" : "bg-violet-600/30 hover:bg-violet-600/60 text-violet-200"
                  }`}>
                  {autoPlay ? <><Square size={9} />Stop</> : <><Play size={9} />Start Auto</>}
                </button>
              </div>
            )}
          </div>

          {/* Provably Fair */}
          <div className="border border-white/[0.08] rounded-lg overflow-hidden">
            <button onClick={() => setShowFair(v => !v)}
              className="w-full flex items-center gap-1 px-2.5 py-1.5 text-[9px] uppercase tracking-widest text-white/40 hover:text-white/60 transition">
              <Shield size={9} /> Fair
              <ChevronDown size={10} className={`ml-auto transition-transform ${showFair ? "rotate-180" : ""}`} />
            </button>
            {showFair && (
              <div className="px-2.5 pb-2.5 border-t border-white/[0.08]">
                <div className="text-[8px] text-white/40 mb-0.5 mt-1.5">Client Seed</div>
                <div className="flex gap-1">
                  <input type="text" value={clientSeed} onChange={e => setClientSeed(e.target.value)}
                    className="flex-1 bg-[#0b0c12] border border-white/10 rounded px-1.5 py-1 text-[9px] font-mono focus:outline-none focus:border-violet-500 min-w-0" />
                  <button onClick={() => setClientSeed(Math.random().toString(36).slice(2,12))}
                    className="p-1 rounded bg-white/[0.06] hover:bg-white/[0.12] transition shrink-0">
                    <RotateCcw size={9} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── Board ─────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-start overflow-y-auto min-w-0 bg-[#0b0c12] py-2 px-2">
        {/* Board canvas — fixed sensible max size */}
        <div className="relative w-full" style={{ maxWidth: 680, height: Math.min(520, rows * 28 + 100) }}>
          <PlinkoBoard
            rows={rows} riskLevel={risk} multiplierTable={multTable}
            turbo={turbo} queue={queue} onBallDone={onBallDone}
          />
          {activeBalls > 1 && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur text-[10px] text-white/60 pointer-events-none">
              <RefreshCw size={9} className="animate-spin" />
              {activeBalls} balls
            </div>
          )}
        </div>

        {/* History strip */}
        <div className="w-full mt-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none" style={{ maxWidth: 680 }}>
          {history.length === 0
            ? <span className="text-[9px] text-white/20">Drop a ball to start…</span>
            : history.map((h, i) => (
                <span key={i} className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-white/5 font-bold ${multColor(h.mult)}`}>
                  {h.mult}×
                </span>
              ))
          }
        </div>
      </div>

      {/* ── Live Feed ─────────────────────────────────────────────────────────── */}
      <aside className="w-[148px] shrink-0 bg-[#0f1018] border-l border-white/[0.07] flex flex-col">
        <div className="px-2.5 py-2 border-b border-white/[0.07] flex items-center gap-1.5 text-[8px] uppercase tracking-widest text-white/30">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
          Live Bets
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-none">
          <AnimatePresence initial={false}>
            {liveFeed.map(b => (
              <motion.div key={b.betId}
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                className="flex flex-col px-2.5 py-1.5 border-b border-white/[0.04]">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[9px] font-medium truncate text-white/80">{b.username}</span>
                  <span className={`text-[9px] font-bold shrink-0 ${multColor(b.multiplier)}`}>{b.multiplier}×</span>
                </div>
                <div className="text-[8px] text-white/30">₹{b.betAmount} · {b.rows}R</div>
              </motion.div>
            ))}
          </AnimatePresence>
          {liveFeed.length === 0 && <div className="p-3 text-[9px] text-white/20 text-center">Waiting…</div>}
        </div>
      </aside>
    </div>
  );
}
