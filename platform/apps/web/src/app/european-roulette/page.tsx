"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "@/lib/stores/auth";
import { api } from "@/lib/api";
import { EuropeanRouletteWheel } from "@/components/roulette/EuropeanRouletteWheel";

const WS_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const EUR_RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

function numBg(n: number) {
  if (n === 0) return "bg-emerald-600";
  return EUR_RED.has(n) ? "bg-red-700" : "bg-zinc-700";
}

type Phase = "BETTING" | "SPINNING" | "SETTLED";

interface RoundState {
  id: string; roundNumber: number; status: string;
  phase: Phase; serverSeedHash: string;
  winningNumber: number | null; winningColor: string | null;
  phaseEndsAt: number; betsCount: number; totalWagered: number;
}
interface HistoryEntry { id: string; roundNumber: number; winningNumber: number; winningColor: string; settledAt: string; }
interface MyBet { id: string; betType: string; betValue: string | null; amount: string; payout: string; isWin: boolean; round: { roundNumber: number; winningNumber: number | null; status: string } }

const CHIPS = [10, 50, 100, 500, 1000, 5000];
type BetType = "number" | "red" | "black" | "odd" | "even" | "high" | "low" | "dozen1" | "dozen2" | "dozen3" | "col1" | "col2" | "col3";

function formatINR(v: number) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v); }
function useCountdown(target: number) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const tick = () => setSecs(Math.max(0, Math.ceil((target - Date.now()) / 1000)));
    tick(); const t = setInterval(tick, 250); return () => clearInterval(t);
  }, [target]);
  return secs;
}

export default function EuropeanRoulettePage() {
  const user = useAuthStore(s => s.user);
  const socketRef = useRef<Socket | null>(null);
  const [round, setRound] = useState<RoundState | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [myBets, setMyBets] = useState<MyBet[]>([]);
  const [chip, setChip] = useState(100);
  const [customAmt, setCustomAmt] = useState("");
  const [pending, setPending] = useState<Map<string, number>>(new Map());
  const [placing, setPlacing] = useState(false);
  const [winFeed, setWinFeed] = useState<{ id: number; msg: string }[]>([]);
  const [bigWin, setBigWin] = useState<{ amount: number } | null>(null);
  const [spinKey, setSpinKey] = useState(0);
  const [activeTab, setActiveTab] = useState<"table" | "bets">("table");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const betAmt = customAmt ? Number(customAmt) : chip;
  const countdown = useCountdown(round?.phaseEndsAt ?? 0);

  const fetchRound = useCallback(async () => {
    try { const r = await api.get("/european-roulette/current"); setRound(r.data); } catch { /* ignore */ }
  }, []);
  const fetchHistory = useCallback(async () => {
    try { const r = await api.get("/european-roulette/history"); setHistory(r.data); } catch { /* ignore */ }
  }, []);
  const fetchMyBets = useCallback(async () => {
    if (!user) return;
    try { const r = await api.get("/european-roulette/my-bets?limit=30"); setMyBets(r.data); } catch { /* ignore */ }
  }, [user]);

  useEffect(() => {
    fetchRound(); fetchHistory(); fetchMyBets();
    const sock = io(WS_URL, { transports: ["websocket"], withCredentials: true });
    socketRef.current = sock;
    sock.emit("european-roulette:subscribe");

    sock.on("european-roulette:newRound", (d: any) => {
      setRound(prev => prev ? { ...prev, ...d, phase: "BETTING" as Phase, winningNumber: null, winningColor: null } : d);
      setPending(new Map()); setSpinKey(k => k + 1);
    });
    sock.on("european-roulette:betPlaced", (d: any) => setRound(prev => prev ? { ...prev, betsCount: prev.betsCount + 1, totalWagered: prev.totalWagered + d.amount } : prev));
    sock.on("european-roulette:spin", (d: any) => { setRound(prev => prev ? { ...prev, phase: "SPINNING", winningNumber: d.winningNumber, winningColor: d.winningColor, phaseEndsAt: d.phaseEndsAt } : prev); setSpinKey(k => k + 1); });
    sock.on("european-roulette:result", async (d: any) => {
      setRound(prev => prev ? { ...prev, phase: "SETTLED", winningNumber: d.winningNumber, winningColor: d.winningColor, phaseEndsAt: d.phaseEndsAt } : prev);
      const mySettled = (d.bets ?? []).filter((b: any) => b.userId === user?.id);
      const totalWon  = mySettled.reduce((s: number, b: any) => s + (b.payout ?? 0), 0);
      if (totalWon >= 500) { setBigWin({ amount: totalWon }); setTimeout(() => setBigWin(null), 4000); }
      if (mySettled.some((b: any) => b.isWin)) setWinFeed(f => [{ id: Date.now(), msg: `You won ${formatINR(totalWon)}!` }, ...f].slice(0, 5));
      fetchHistory(); fetchMyBets();
    });
    return () => { sock.disconnect(); };
  }, [user, fetchRound, fetchHistory, fetchMyBets]);

  const placeBet = async (betType: BetType, betValue?: string) => {
    if (!user) { setErrMsg("Login to place bets"); setTimeout(() => setErrMsg(null), 3000); return; }
    if (round?.phase !== "BETTING") return;
    setPlacing(true);
    try {
      await api.post("/european-roulette/bet", { betType, betValue: betValue ?? null, amount: betAmt });
      const key = `${betType}:${betValue ?? ""}`;
      setPending(m => { const n = new Map(m); n.set(key, (n.get(key) ?? 0) + betAmt); return n; });
    } catch (e: any) {
      setErrMsg(e?.response?.data?.message ?? "Bet failed");
      setTimeout(() => setErrMsg(null), 3000);
    } finally { setPlacing(false); }
  };

  const phase = round?.phase ?? "BETTING";
  const canBet = phase === "BETTING" && !placing;
  const pendingFor = (t: string, v?: string) => pending.get(`${t}:${v ?? ""}`) ?? 0;
  const pLabel = (v: number) => v >= 1000 ? `+${formatINR(v)}` : `+₹${v}`;

  return (
    <div className="min-h-screen text-white pb-12" style={{ background: "#08080f" }}>
      {/* Big Win overlay */}
      <AnimatePresence>
        {bigWin && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-none">
            <motion.div initial={{ scale: 0.5, y: 40 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.8, opacity: 0 }} className="text-center">
              <p className="text-yellow-400 text-2xl font-bold mb-2">BIG WIN!</p>
              <p className="text-white text-6xl font-black drop-shadow-2xl">{formatINR(bigWin.amount)}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-6xl mx-auto px-3 py-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight">European Roulette</h1>
            <p className="text-xs text-gray-500 mt-0.5">0-36 · Classic single-zero wheel</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${phase === "BETTING" ? "bg-green-900/60 text-green-400" : phase === "SPINNING" ? "bg-yellow-900/60 text-yellow-400" : "bg-gray-800 text-gray-400"}`}>
              {phase === "BETTING" ? `BETTING ${countdown}s` : phase === "SPINNING" ? `SPINNING ${countdown}s` : "RESULT"}
            </span>
            {round && <span className="text-[10px] text-gray-600">Round #{round.roundNumber}</span>}
          </div>
        </div>

        {/* Error message */}
        <AnimatePresence>
          {errMsg && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2">
              {errMsg}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Win feed */}
        <div className="h-5 overflow-hidden">
          <AnimatePresence mode="popLayout">
            {winFeed.slice(0, 1).map(w => (
              <motion.p key={w.id} initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }}
                className="text-xs text-yellow-400 font-bold">{w.msg} 🎰</motion.p>
            ))}
          </AnimatePresence>
        </div>

        {/* Main layout */}
        <div className="grid lg:grid-cols-[420px_1fr] gap-4">
          {/* Left: wheel + history */}
          <div className="space-y-4">
            <div className="flex justify-center">
              <EuropeanRouletteWheel phase={phase} winningNumber={round?.winningNumber ?? null} spinKey={spinKey} />
            </div>

            {/* Recent history */}
            <div className="bg-[#0f0f1a] rounded-xl border border-white/5 p-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Recent Results</p>
              <div className="flex gap-1.5 flex-wrap">
                {history.slice(0, 20).map(h => (
                  <div key={h.id} className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold ${numBg(h.winningNumber)}`}>
                    {h.winningNumber}
                  </div>
                ))}
                {history.length === 0 && <p className="text-gray-600 text-xs">No results yet</p>}
              </div>
            </div>

            {/* Stats */}
            <div className="bg-[#0f0f1a] rounded-xl border border-white/5 p-3 grid grid-cols-3 gap-3 text-center">
              <div><p className="text-[10px] text-gray-500 mb-1">Bets placed</p><p className="text-sm font-bold">{round?.betsCount ?? 0}</p></div>
              <div><p className="text-[10px] text-gray-500 mb-1">Total wagered</p><p className="text-sm font-bold">{formatINR(round?.totalWagered ?? 0)}</p></div>
              <div><p className="text-[10px] text-gray-500 mb-1">House edge</p><p className="text-sm font-bold text-yellow-400">2.7%</p></div>
            </div>
          </div>

          {/* Right: betting */}
          <div className="space-y-3">
            {/* Tab toggle */}
            <div className="flex rounded-xl bg-white/5 p-0.5 gap-0.5">
              {(["table", "bets"] as const).map(t => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${activeTab === t ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"}`}>
                  {t === "table" ? "Betting Table" : `My Bets (${myBets.length})`}
                </button>
              ))}
            </div>

            {activeTab === "bets" ? (
              <div className="bg-[#0f0f1a] rounded-xl border border-white/5 p-3 space-y-2 max-h-[500px] overflow-y-auto">
                {myBets.length === 0 && <p className="text-gray-600 text-sm text-center py-8">No bets yet</p>}
                {myBets.map(b => (
                  <div key={b.id} className="flex items-center justify-between p-2 rounded-lg bg-white/3 text-xs">
                    <div>
                      <span className="font-bold text-gray-200 capitalize">{b.betType}{b.betValue ? ` (${b.betValue})` : ""}</span>
                      <span className="ml-2 text-gray-500">₹{Number(b.amount).toLocaleString()}</span>
                    </div>
                    <div className={b.isWin ? "text-green-400 font-bold" : b.round.status === "SETTLED" ? "text-gray-600" : "text-yellow-500"}>
                      {b.round.status === "SETTLED" ? (b.isWin ? `+₹${Number(b.payout).toLocaleString()}` : "Lost") : "Pending…"}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {/* Chip selector */}
                <div className="bg-[#0f0f1a] rounded-xl border border-white/5 p-3 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">Stake</p>
                  <div className="flex flex-wrap gap-1.5">
                    {CHIPS.map(c => (
                      <button key={c} onClick={() => { setChip(c); setCustomAmt(""); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${chip === c && !customAmt ? "bg-red-700 text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"}`}>
                        ₹{c.toLocaleString()}
                      </button>
                    ))}
                  </div>
                  <input type="number" placeholder="Custom amount" value={customAmt}
                    onChange={e => setCustomAmt(e.target.value)}
                    className="w-full bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-500/60 text-gray-200 placeholder-gray-600" />
                  <p className="text-xs text-gray-500">Betting: <span className="text-white font-bold">{formatINR(betAmt)}</span></p>
                </div>

                {/* Roulette betting table */}
                <div className="bg-[#050f06] rounded-xl border border-green-900/40 p-3 space-y-2 overflow-x-auto">
                  {/* Zero button */}
                  <div className="flex justify-center">
                    <button onClick={() => placeBet("number", "0")} disabled={!canBet}
                      className="relative w-16 h-10 rounded bg-emerald-700 hover:brightness-125 disabled:opacity-50 text-white font-black text-xl transition flex items-center justify-center">
                      0
                      {pendingFor("number", "0") > 0 && <span className="absolute -top-1.5 -right-1.5 text-[9px] bg-yellow-400 text-black rounded-full px-1 font-bold">{pLabel(pendingFor("number", "0"))}</span>}
                    </button>
                  </div>

                  {/* 3-row × 12-col number grid */}
                  <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(12, 1fr)" }}>
                    {Array.from({ length: 12 }, (_, col) =>
                      [3, 2, 1].map(row => {
                        const n = col * 3 + row;
                        const p = pendingFor("number", String(n));
                        return (
                          <button key={n} onClick={() => placeBet("number", String(n))} disabled={!canBet}
                            className={`relative h-9 rounded text-xs font-bold transition hover:brightness-125 disabled:opacity-50 flex items-center justify-center ${numBg(n)}`}>
                            {n}
                            {p > 0 && <span className="absolute -top-1.5 -right-1.5 text-[8px] bg-yellow-400 text-black rounded-full px-0.5 font-bold z-10">{pLabel(p)}</span>}
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Column bets */}
                  <div className="grid grid-cols-3 gap-1">
                    {(["col1","col2","col3"] as const).map(c => {
                      const p = pendingFor(c);
                      return (
                        <button key={c} onClick={() => placeBet(c)} disabled={!canBet}
                          className="relative py-2 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-bold text-gray-300 transition">
                          {c === "col1" ? "Col 1" : c === "col2" ? "Col 2" : "Col 3"} (2:1)
                          {p > 0 && <span className="absolute -top-1.5 -right-1.5 text-[9px] bg-yellow-400 text-black rounded-full px-1 font-bold">{pLabel(p)}</span>}
                        </button>
                      );
                    })}
                  </div>

                  {/* Dozen bets */}
                  <div className="grid grid-cols-3 gap-1">
                    {(["dozen1","dozen2","dozen3"] as const).map(d => {
                      const p = pendingFor(d);
                      return (
                        <button key={d} onClick={() => placeBet(d)} disabled={!canBet}
                          className="relative py-2 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-bold text-gray-300 transition">
                          {d === "dozen1" ? "1st 12" : d === "dozen2" ? "2nd 12" : "3rd 12"} (2:1)
                          {p > 0 && <span className="absolute -top-1.5 -right-1.5 text-[9px] bg-yellow-400 text-black rounded-full px-1 font-bold">{pLabel(p)}</span>}
                        </button>
                      );
                    })}
                  </div>

                  {/* Even-money bets row 1 */}
                  <div className="grid grid-cols-3 gap-1">
                    {(["low","high","red"] as const).map(t => {
                      const p = pendingFor(t);
                      const labels: Record<string, string> = { low: "1-18", high: "19-36", red: "Red" };
                      return (
                        <button key={t} onClick={() => placeBet(t)} disabled={!canBet}
                          className={`relative py-2.5 rounded text-xs font-bold transition disabled:opacity-50 ${t === "red" ? "bg-red-700 hover:bg-red-600 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-gray-300"}`}>
                          {labels[t]} (1:1)
                          {p > 0 && <span className="absolute -top-1.5 -right-1.5 text-[9px] bg-yellow-400 text-black rounded-full px-1 font-bold">{pLabel(p)}</span>}
                        </button>
                      );
                    })}
                  </div>

                  {/* Even-money bets row 2 */}
                  <div className="grid grid-cols-3 gap-1">
                    {(["even","odd","black"] as const).map(t => {
                      const p = pendingFor(t);
                      const labels: Record<string, string> = { even: "Even", odd: "Odd", black: "Black" };
                      return (
                        <button key={t} onClick={() => placeBet(t)} disabled={!canBet}
                          className={`relative py-2.5 rounded text-xs font-bold transition disabled:opacity-50 ${t === "black" ? "bg-zinc-900 border border-zinc-600 hover:bg-zinc-800 text-gray-300" : "bg-zinc-800 hover:bg-zinc-700 text-gray-300"}`}>
                          {labels[t]} (1:1)
                          {p > 0 && <span className="absolute -top-1.5 -right-1.5 text-[9px] bg-yellow-400 text-black rounded-full px-1 font-bold">{pLabel(p)}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {phase !== "BETTING" && (
                  <div className="text-center py-2 rounded-xl bg-white/3 border border-white/5 text-xs text-gray-500">
                    {phase === "SPINNING" ? "Wheel is spinning — wait for next round" : "Settling payouts…"}
                  </div>
                )}

                {/* Payout table */}
                <div className="bg-[#0f0f1a] rounded-xl border border-white/5 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Payouts</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                    {[["Number", "35:1"], ["Split (2 nums)", "17:1"], ["Street (3 nums)", "11:1"], ["Corner (4 nums)", "8:1"], ["Six Line (6 nums)", "5:1"], ["Dozen / Column", "2:1"], ["Even money bets", "1:1"]].map(([l, p]) => (
                      <div key={l} className="flex justify-between text-gray-400">
                        <span>{l}</span><span className="text-yellow-400 font-bold">{p}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
