"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ChevronDown, Shield } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth";
import { api } from "@/lib/api";

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

// ── Helpers ──────────────────────────────────────────────────────────────────

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: "EASY",   label: "Easy" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HARD",   label: "Hard" },
  { value: "EXPERT", label: "Expert" },
  { value: "INSANE", label: "Insane" },
];

function fmtMult(m: number): string {
  return `${m.toFixed(2)}×`;
}

function fmtMoney(n: number): string {
  return `$${(n).toFixed(2)}`;
}

function balloonColorFor(mult: number): string {
  if (mult >= 10)  return "#FFD700";
  if (mult >= 5)   return "#A855F7";
  if (mult >= 2.5) return "#22D3EE";
  if (mult >= 1.5) return "#3B82F6";
  return "#22C55E"; // green (Stake default)
}

// ── Balloon SVG (Stake-style) ────────────────────────────────────────────────

function Balloon({ scale, color, popped }: { scale: number; color: string; popped: boolean }) {
  if (popped) {
    return (
      <div className="relative w-[260px] h-[260px] flex items-center justify-center">
        <div className="text-7xl">💥</div>
      </div>
    );
  }
  return (
    <motion.svg
      width="260" height="300"
      viewBox="0 0 260 300"
      animate={{ scale }}
      transition={{ type: "spring", stiffness: 90, damping: 18 }}
      style={{ filter: `drop-shadow(0 8px 32px ${color}44)` }}
    >
      {/* Balloon body */}
      <ellipse cx="130" cy="135" rx="92" ry="105" fill={color} />
      {/* Highlight */}
      <ellipse cx="98" cy="90" rx="22" ry="32" fill="white" opacity="0.55" />
      {/* Knot */}
      <path d="M120 238 L130 252 L140 238 Z" fill={color} />
      {/* Nozzle connector */}
      <rect x="124" y="248" width="12" height="14" fill="#475569" />
    </motion.svg>
  );
}

// ── Pump machine SVG ─────────────────────────────────────────────────────────

function PumpMachine({ active }: { active: boolean }) {
  return (
    <motion.svg
      width="320" height="80"
      viewBox="0 0 320 80"
      animate={active ? { y: [0, -1.5, 0] } : { y: 0 }}
      transition={{ duration: 0.25, repeat: active ? Infinity : 0 }}
    >
      {/* base */}
      <rect x="0" y="50" width="320" height="30" rx="14" fill="#2A3441" />
      {/* central pump column */}
      <rect x="138" y="20" width="44" height="35" rx="6" fill="#2A3441" />
      <rect x="148" y="10" width="24" height="14" rx="4" fill="#2A3441" />
    </motion.svg>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function PumpGame() {
  const { user } = useAuthStore();

  // Settings/form
  const [mode,        setMode]        = useState<Mode>("manual");
  const [betAmount,   setBetAmount]   = useState("0.00000000");
  const [difficulty,  setDifficulty]  = useState<Difficulty>("EASY");

  // Session state
  const [session,     setSession]     = useState<ActiveSession | null>(null);
  const [status,      setStatus]      = useState<Status>("IDLE");
  const [busy,        setBusy]        = useState<"none" | "bet" | "pump" | "cashout">("none");
  const [poppedMult,  setPoppedMult]  = useState<number | null>(null);

  // Multipliers (table) for current difficulty — shown as scrolling chips
  const [multTable,   setMultTable]   = useState<number[]>([]);
  const [tableLoaded, setTableLoaded] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const notify = useCallback((text: string, ok = true) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Auto-mode settings
  const [autoBets,    setAutoBets]    = useState("10");
  const [autoCashAt,  setAutoCashAt]  = useState("3");      // cashout after N pumps survived
  const [autoRunning, setAutoRunning] = useState(false);
  const autoRunCount  = useRef(0);
  const autoTargetRef = useRef(10);

  // ── Difficulty change → fetch table ────────────────────────────────────────

  const loadTable = useCallback(async (d: Difficulty) => {
    setTableLoaded(false);
    try {
      const r = await api.get(`/casino/pump/difficulty/${d}`);
      setMultTable(r.data.table ?? []);
    } catch {
      setMultTable([]);
    } finally {
      setTableLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadTable(difficulty);
  }, [difficulty, loadTable]);

  // ── Restore active session on mount ───────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    api.get("/casino/pump/active")
      .then(r => {
        const s = r.data;
        if (!s) return;
        setSession(s);
        setStatus("ACTIVE");
        setDifficulty(s.difficulty);
        setBetAmount(String(s.betAmount));
        setMultTable(s.multTable ?? []);
        setTableLoaded(true);
      })
      .catch(() => {});
  }, [user]);

  // ── Bet ───────────────────────────────────────────────────────────────────

  const placeBet = useCallback(async () => {
    if (!user) { notify("Please login to play", false); return; }
    if (status === "ACTIVE") return;
    const amt = parseFloat(betAmount);
    if (isNaN(amt) || amt <= 0) { notify("Enter a bet amount", false); return; }

    setBusy("bet");
    setPoppedMult(null);
    try {
      const r = await api.post("/casino/pump/bet", { betAmount: amt, difficulty });
      const data = r.data;
      setSession({
        betId:          data.betId,
        betAmount:      amt,
        difficulty:     data.difficulty,
        pumpsCount:     data.pumpsCount,
        currentMult:    data.currentMult,
        serverSeedHash: data.serverSeedHash,
        maxPumps:       data.maxPumps,
        multTable:      data.multTable,
        status:         "ACTIVE",
      });
      setMultTable(data.multTable);
      setStatus("ACTIVE");
    } catch (e: any) {
      notify(e?.response?.data?.message ?? "Bet failed", false);
    } finally {
      setBusy("none");
    }
  }, [user, status, betAmount, difficulty, notify]);

  // ── Pump ─────────────────────────────────────────────────────────────────

  const pumpOnce = useCallback(async () => {
    if (!session || status !== "ACTIVE" || busy !== "none") return;
    setBusy("pump");
    try {
      const r = await api.post("/casino/pump/pump", { betId: session.betId });
      const data = r.data;
      if (data.popped) {
        setPoppedMult(session.currentMult);
        setSession(prev => prev ? { ...prev, pumpsCount: data.pumpsCount } : prev);
        setStatus("POPPED");
        notify(`Balloon popped at pump #${data.pumpsCount}!`, false);
      } else {
        setSession(prev => prev ? {
          ...prev,
          pumpsCount:  data.pumpsCount,
          currentMult: data.currentMult,
        } : prev);
      }
    } catch (e: any) {
      notify(e?.response?.data?.message ?? "Pump failed", false);
    } finally {
      setBusy("none");
    }
  }, [session, status, busy, notify]);

  // ── Cashout ──────────────────────────────────────────────────────────────

  const cashout = useCallback(async () => {
    if (!session || status !== "ACTIVE" || busy !== "none") return;
    if (session.pumpsCount < 1) { notify("Pump at least once first", false); return; }
    setBusy("cashout");
    try {
      const r = await api.post("/casino/pump/cashout", { betId: session.betId });
      const data = r.data;
      setStatus("CASHED");
      notify(`Cashed out ${fmtMult(data.multiplier)} — won ${fmtMoney(data.payout)}!`, true);
    } catch (e: any) {
      notify(e?.response?.data?.message ?? "Cashout failed", false);
    } finally {
      setBusy("none");
    }
  }, [session, status, busy, notify]);

  // ── Reset for a new session (after pop/cashout) ──────────────────────────

  const reset = useCallback(() => {
    setSession(null);
    setStatus("IDLE");
    setPoppedMult(null);
  }, []);

  // ── Auto-bet loop ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!autoRunning) return;
    if (status === "IDLE") {
      // Start a new session
      const target = autoTargetRef.current;
      if (autoRunCount.current >= target) {
        setAutoRunning(false);
        return;
      }
      placeBet();
      return;
    }
    if (status === "ACTIVE" && session) {
      const cashAtPumps = parseInt(autoCashAt);
      if (!isNaN(cashAtPumps) && session.pumpsCount >= cashAtPumps) {
        cashout();
      } else {
        const t = setTimeout(() => { pumpOnce(); }, 350);
        return () => clearTimeout(t);
      }
    }
    if (status === "CASHED" || status === "POPPED") {
      autoRunCount.current += 1;
      const t = setTimeout(() => { reset(); }, 800);
      return () => clearTimeout(t);
    }
  }, [autoRunning, status, session, autoCashAt, placeBet, pumpOnce, cashout, reset]);

  const startAuto = () => {
    const n = parseInt(autoBets);
    autoTargetRef.current = isNaN(n) || n < 1 ? 1 : n;
    autoRunCount.current = 0;
    setAutoRunning(true);
  };
  const stopAuto = () => setAutoRunning(false);

  // ── Derived UI ───────────────────────────────────────────────────────────

  const currentMult   = session?.currentMult ?? 1.00;
  const balloonScale  = useMemo(() => {
    const base = session ? Math.min(1 + session.pumpsCount * 0.06, 1.6) : 1;
    return base;
  }, [session]);
  const balloonColor  = balloonColorFor(currentMult);

  const profit = session
    ? Math.round(session.betAmount * session.currentMult * 100) / 100 - session.betAmount
    : 0;

  // Bottom chip strip: current pump highlight + next 8 pumps
  const chipMults = useMemo(() => {
    if (!multTable.length) return [];
    const start = Math.max(0, (session?.pumpsCount ?? 0) - 1);
    return [
      { mult: 1.00, isCurrent: !session || session.pumpsCount === 0 },
      ...multTable.slice(start, start + 12).map((m, i) => ({
        mult: m,
        isCurrent: session ? (start + i + 1 === session.pumpsCount) : false,
      })),
    ];
  }, [multTable, session]);

  const canPump  = status === "ACTIVE" && busy === "none";
  const canCash  = status === "ACTIVE" && busy === "none" && (session?.pumpsCount ?? 0) >= 1;
  const canBet   = status !== "ACTIVE" && busy === "none";

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen w-full flex flex-col bg-[#0f212e]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#0a1922]">
        <Link href="/" className="flex items-center gap-2 text-sm text-white/60 hover:text-white">
          <ArrowLeft size={16} /> <span className="hidden sm:inline">Back</span>
        </Link>
        <div className="flex items-center gap-2 text-xs text-white/50">
          <Shield size={12} />
          <span className="hidden sm:inline">Provably Fair</span>
          {session?.serverSeedHash && <span className="text-white/30">{session.serverSeedHash.slice(0, 8)}…</span>}
        </div>
        <div className="text-[11px] text-white/40 uppercase tracking-wider">Pump</div>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm font-semibold shadow-2xl"
            style={{
              background: toast.ok ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
              border: `1px solid ${toast.ok ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`,
              color: toast.ok ? "#22C55E" : "#EF4444",
            }}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* ── Left Panel ─────────────────────────────────────── */}
        <div className="w-full lg:w-[340px] flex-shrink-0 p-4 lg:p-5 bg-[#0f212e] border-r border-white/5">
          <div className="rounded-2xl bg-[#1a2c38] p-4 flex flex-col gap-4 max-w-md mx-auto">
            {/* Manual / Auto */}
            <div className="flex items-center bg-[#0f212e] rounded-full p-1">
              <button
                onClick={() => setMode("manual")}
                className={`flex-1 py-2 rounded-full text-sm font-semibold transition ${
                  mode === "manual" ? "bg-[#2f4553] text-white" : "text-white/50 hover:text-white"
                }`}
              >
                Manual
              </button>
              <button
                onClick={() => setMode("auto")}
                className={`flex-1 py-2 rounded-full text-sm font-semibold transition ${
                  mode === "auto" ? "bg-[#2f4553] text-white" : "text-white/50 hover:text-white"
                }`}
              >
                Auto
              </button>
            </div>

            {/* Bet Amount */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-white/60 font-semibold">Bet Amount</label>
                <span className="text-xs text-white/40">${(parseFloat(betAmount) || 0).toFixed(2)}</span>
              </div>
              <div className="flex items-stretch gap-1 bg-[#0f212e] rounded-lg border border-white/5">
                <div className="flex items-center pl-3 flex-1 gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={betAmount}
                    onChange={e => setBetAmount(e.target.value)}
                    disabled={status === "ACTIVE"}
                    className="bg-transparent outline-none text-white text-sm font-semibold flex-1 min-w-0 py-2.5 disabled:opacity-60"
                  />
                  <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-[10px] font-black text-white mr-2">T</div>
                </div>
                <button
                  onClick={() => setBetAmount(v => String((parseFloat(v) || 0) / 2))}
                  disabled={status === "ACTIVE"}
                  className="px-3 text-xs font-bold text-white/70 hover:text-white border-l border-white/5 disabled:opacity-40"
                >½</button>
                <button
                  onClick={() => setBetAmount(v => String((parseFloat(v) || 0) * 2))}
                  disabled={status === "ACTIVE"}
                  className="px-3 text-xs font-bold text-white/70 hover:text-white border-l border-white/5 disabled:opacity-40"
                >2×</button>
              </div>
            </div>

            {/* Difficulty */}
            <div>
              <label className="text-xs text-white/60 font-semibold block mb-1.5">Difficulty</label>
              <div className="relative">
                <select
                  value={difficulty}
                  onChange={e => setDifficulty(e.target.value as Difficulty)}
                  disabled={status === "ACTIVE"}
                  className="w-full appearance-none bg-[#0f212e] border border-white/5 rounded-lg px-3 py-2.5 text-sm text-white font-semibold outline-none focus:border-white/20 disabled:opacity-60"
                >
                  {DIFFICULTIES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
              </div>
            </div>

            {/* Auto-mode extras */}
            {mode === "auto" && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-white/60 font-semibold block mb-1">Number of Bets</label>
                  <input
                    type="number" min={1}
                    value={autoBets}
                    onChange={e => setAutoBets(e.target.value)}
                    disabled={autoRunning}
                    className="w-full bg-[#0f212e] border border-white/5 rounded-lg px-3 py-2 text-sm text-white outline-none disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-white/60 font-semibold block mb-1">Cash After N Pumps</label>
                  <input
                    type="number" min={1}
                    value={autoCashAt}
                    onChange={e => setAutoCashAt(e.target.value)}
                    disabled={autoRunning}
                    className="w-full bg-[#0f212e] border border-white/5 rounded-lg px-3 py-2 text-sm text-white outline-none disabled:opacity-60"
                  />
                </div>
              </div>
            )}

            {/* Action buttons */}
            {mode === "manual" ? (
              <>
                {/* Cashout */}
                <button
                  onClick={cashout}
                  disabled={!canCash}
                  className="w-full py-3 rounded-lg font-bold text-sm transition disabled:cursor-not-allowed"
                  style={{
                    background: canCash ? "#1d75ff" : "#2f4553",
                    color: canCash ? "#fff" : "rgba(255,255,255,0.4)",
                  }}
                >
                  Cashout {session && session.pumpsCount >= 1 ? fmtMult(session.currentMult) : ""}
                </button>

                {/* Pump or Bet */}
                {status === "ACTIVE" ? (
                  <button
                    onClick={pumpOnce}
                    disabled={!canPump}
                    className="w-full py-3 rounded-lg font-bold text-sm transition bg-[#2f4553] hover:bg-[#3b5468] text-white disabled:opacity-50"
                  >
                    {busy === "pump" ? "Pumping…" : "Pump"}
                  </button>
                ) : (status === "POPPED" || status === "CASHED") ? (
                  <button
                    onClick={reset}
                    className="w-full py-3 rounded-lg font-bold text-sm bg-emerald-500 hover:bg-emerald-400 text-white"
                  >
                    New Game
                  </button>
                ) : (
                  <button
                    onClick={placeBet}
                    disabled={!canBet}
                    className="w-full py-3 rounded-lg font-bold text-sm bg-emerald-500 hover:bg-emerald-400 text-white disabled:opacity-50"
                  >
                    {(busy as string) === "bet" ? "Placing…" : "Bet"}
                  </button>
                )}
              </>
            ) : (
              <>
                {!autoRunning ? (
                  <button
                    onClick={startAuto}
                    disabled={status === "ACTIVE"}
                    className="w-full py-3 rounded-lg font-bold text-sm bg-emerald-500 hover:bg-emerald-400 text-white disabled:opacity-50"
                  >
                    Start Auto Bet
                  </button>
                ) : (
                  <button
                    onClick={stopAuto}
                    className="w-full py-3 rounded-lg font-bold text-sm bg-red-500 hover:bg-red-400 text-white"
                  >
                    Stop ({autoRunCount.current}/{autoTargetRef.current})
                  </button>
                )}
              </>
            )}

            {/* Total profit */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-white/60 font-semibold">Total Profit ({fmtMult(currentMult)})</label>
                <span className="text-xs text-white/40">{fmtMoney(profit)}</span>
              </div>
              <div className="flex items-center pl-3 bg-[#0f212e] rounded-lg border border-white/5 py-2.5">
                <span className="flex-1 text-white text-sm font-semibold">{profit.toFixed(8)}</span>
                <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-[10px] font-black text-white mr-3">T</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Center: Balloon stage ───────────────────────────── */}
        <div className="flex-1 flex flex-col bg-[#0f212e]">
          <div className="flex-1 flex flex-col items-center justify-center relative px-6 py-10">
            {/* Multiplier readout inside balloon */}
            <div className="relative">
              <Balloon
                scale={balloonScale}
                color={status === "POPPED" ? "#475569" : balloonColor}
                popped={status === "POPPED"}
              />
              {/* multiplier label centered over balloon */}
              {status !== "POPPED" && (
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  style={{ marginTop: "-12px" }}
                >
                  {session && session.pumpsCount >= 1 ? (
                    <div className="text-center">
                      <div className="text-4xl sm:text-5xl font-black text-white tracking-tight" style={{ textShadow: "0 2px 16px rgba(0,0,0,0.4)" }}>
                        {currentMult.toFixed(2)}x
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
              {status === "POPPED" && poppedMult != null && (
                <div className="absolute inset-x-0 -bottom-2 text-center">
                  <p className="text-red-400 font-black text-lg">POPPED at {fmtMult(poppedMult)}</p>
                </div>
              )}
            </div>

            {/* Pump machine */}
            <div className="mt-2">
              <PumpMachine active={busy === "pump"} />
            </div>

            {/* Pump-count dots */}
            <div className="flex items-center gap-1.5 mt-3">
              {Array.from({ length: Math.min(8, session?.maxPumps ?? 8) }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-full transition-all"
                  style={{
                    width: 6, height: 6,
                    background: (session?.pumpsCount ?? 0) > i ? "#22C55E" : "rgba(255,255,255,0.15)",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Bottom multiplier chips */}
          <div className="px-4 pb-4">
            <div className="flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
              {!tableLoaded && (
                <div className="text-xs text-white/40 px-2 py-3">Loading multipliers…</div>
              )}
              {tableLoaded && chipMults.map((c, i) => (
                <div
                  key={i}
                  className="flex-shrink-0 px-4 py-3 rounded-lg text-sm font-bold tabular-nums transition-all"
                  style={{
                    background: c.isCurrent ? "#22C55E" : "#2f4553",
                    color: c.isCurrent ? "#fff" : "rgba(255,255,255,0.8)",
                    minWidth: 72,
                    textAlign: "center",
                  }}
                >
                  {c.mult.toFixed(2)}×
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
