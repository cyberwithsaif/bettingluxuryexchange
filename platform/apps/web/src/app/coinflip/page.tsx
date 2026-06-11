"use client";
import Link from "next/link";
import { ArrowLeft, Volume2, VolumeX, ShieldCheck, ChevronDown, RotateCcw } from "lucide-react";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import useSWR from "swr";
import { useAuthStore } from "@/lib/stores/auth";
import { getSocket, reauthSocket } from "@/lib/socket";

// ─── Types ─────────────────────────────────────────────────────────────────────

type CoinSide = "HEADS" | "TAILS";
type Phase = "idle" | "flipping" | "choice" | "lost" | "cashed";

interface FlipRecord { side: CoinSide; result: CoinSide; won: boolean; }

interface FlipResult {
  sessionId: string;
  won: boolean;
  result: CoinSide;
  side: CoinSide;
  status: "IN_PROGRESS" | "CASHED_OUT" | "LOST";
  streak: number;
  multiplier: number;
  payout: number;
  nextMultiplier: number | null;
  serverSeed?: string;
  serverSeedHash?: string;
  clientSeed?: string;
  flips: FlipRecord[];
  isAutoWin?: boolean;
}

interface Config {
  minBet: number; maxBet: number; enabled: boolean;
  stepMultiplier: number; maxFlips: number; multiplierTable: number[];
}

interface RecentGame {
  id: string; username: string; betAmount: number;
  multiplier: number; payout: number; streak: number;
  status: "CASHED_OUT" | "LOST"; createdAt: string;
}

const FLIP_DUR = 1.4; // seconds — coin spin animation length
const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

// ─── Sounds (tiny WebAudio synth — no asset files) ─────────────────────────────

function useSounds(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const tone = useCallback((freq: number, dur = 0.12, type: OscillatorType = "sine", vol = 0.15, sweepTo?: number) => {
    if (!enabled || typeof window === "undefined") return;
    try {
      ctxRef.current ??= new AudioContext();
      const ctx = ctxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, ctx.currentTime + dur);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.02);
    } catch { /* audio unavailable */ }
  }, [enabled]);

  return useMemo(() => ({
    flip:    () => { tone(380, 0.5, "triangle", 0.08, 980); },
    win:     () => { tone(659, 0.1); setTimeout(() => tone(880, 0.14), 100); },
    lose:    () => { tone(240, 0.3, "sawtooth", 0.1, 90); },
    cashout: () => { tone(523, 0.1); setTimeout(() => tone(659, 0.1), 100); setTimeout(() => tone(784, 0.2), 200); },
  }), [tone]);
}

// ─── Coin faces (inline SVG) ───────────────────────────────────────────────────

function HeadsFace() {
  return (
    <svg viewBox="0 0 200 200" className="w-full h-full block">
      <defs>
        <radialGradient id="cfH" cx="36%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#fff6cf" />
          <stop offset="38%" stopColor="#ffd84d" />
          <stop offset="72%" stopColor="#e3a818" />
          <stop offset="100%" stopColor="#9a6d06" />
        </radialGradient>
        <linearGradient id="cfHr" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffe79a" />
          <stop offset="50%" stopColor="#c8961e" />
          <stop offset="100%" stopColor="#7c5604" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="98" fill="url(#cfHr)" />
      <circle cx="100" cy="100" r="86" fill="url(#cfH)" />
      <circle cx="100" cy="100" r="76" fill="none" stroke="rgba(122,82,0,0.4)" strokeWidth="3" strokeDasharray="4 8" />
      {/* crown */}
      <path d="M72 66 L80 52 L92 62 L100 46 L108 62 L120 52 L128 66 L124 74 L76 74 Z" fill="#8a5d00" opacity="0.85" />
      <text x="100" y="143" textAnchor="middle" fontSize="74" fontWeight="900" fontFamily="Arial Black, sans-serif" fill="#7c5604">H</text>
      <text x="100" y="140" textAnchor="middle" fontSize="74" fontWeight="900" fontFamily="Arial Black, sans-serif" fill="#fff3c2">H</text>
      <text x="100" y="172" textAnchor="middle" fontSize="13" fontWeight="800" letterSpacing="4" fontFamily="Arial, sans-serif" fill="rgba(110,72,0,0.75)">HEADS</text>
    </svg>
  );
}

function TailsFace() {
  return (
    <svg viewBox="0 0 200 200" className="w-full h-full block">
      <defs>
        <radialGradient id="cfT" cx="36%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#f3ecff" />
          <stop offset="38%" stopColor="#c0a3f7" />
          <stop offset="72%" stopColor="#8456e0" />
          <stop offset="100%" stopColor="#3d2380" />
        </radialGradient>
        <linearGradient id="cfTr" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#dcc8ff" />
          <stop offset="50%" stopColor="#7a4fd0" />
          <stop offset="100%" stopColor="#2c1763" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="98" fill="url(#cfTr)" />
      <circle cx="100" cy="100" r="86" fill="url(#cfT)" />
      <circle cx="100" cy="100" r="76" fill="none" stroke="rgba(46,20,110,0.45)" strokeWidth="3" strokeDasharray="4 8" />
      {/* diamond */}
      <path d="M100 46 L122 66 L100 90 L78 66 Z" fill="#2c1763" opacity="0.85" />
      <path d="M100 52 L116 66 L100 83 L84 66 Z" fill="#b794f6" opacity="0.9" />
      <text x="100" y="143" textAnchor="middle" fontSize="74" fontWeight="900" fontFamily="Arial Black, sans-serif" fill="#2c1763">T</text>
      <text x="100" y="140" textAnchor="middle" fontSize="74" fontWeight="900" fontFamily="Arial Black, sans-serif" fill="#f0e6ff">T</text>
      <text x="100" y="172" textAnchor="middle" fontSize="13" fontWeight="800" letterSpacing="4" fontFamily="Arial, sans-serif" fill="rgba(36,16,90,0.8)">TAILS</text>
    </svg>
  );
}

// ─── 3D Coin ───────────────────────────────────────────────────────────────────

function Coin({ rotation, flipping }: { rotation: number; flipping: boolean }) {
  return (
    <div className="relative flex flex-col items-center" style={{ perspective: 1300 }}>
      <motion.div
        className="relative w-[200px] h-[200px] md:w-[250px] md:h-[250px]"
        animate={{ y: flipping ? [0, -60, 0] : 0 }}
        transition={{ duration: FLIP_DUR, times: [0, 0.42, 1], ease: ["easeOut", "easeIn"] }}
      >
        <motion.div
          className="w-full h-full relative"
          style={{ transformStyle: "preserve-3d" }}
          animate={{ rotateY: rotation }}
          transition={{ duration: flipping ? FLIP_DUR : 0, ease: [0.18, 0.55, 0.2, 1] }}
        >
          <div className="absolute inset-0" style={{ backfaceVisibility: "hidden" }}>
            <HeadsFace />
          </div>
          <div className="absolute inset-0" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
            <TailsFace />
          </div>
        </motion.div>
      </motion.div>
      {/* ground shadow */}
      <motion.div
        className="mt-3 h-4 w-[150px] md:w-[190px] rounded-[50%] bg-black/55 blur-md"
        animate={{ scaleX: flipping ? [1, 0.5, 1] : 1, opacity: flipping ? [0.55, 0.25, 0.55] : 0.55 }}
        transition={{ duration: FLIP_DUR, times: [0, 0.42, 1] }}
      />
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function CoinflipPage() {
  const { user, accessToken } = useAuthStore();
  const socket = useRef(getSocket());

  // Game state
  const [phase, setPhase]           = useState<Phase>("idle");
  const [sessionId, setSessionId]   = useState<string | null>(null);
  const [streak, setStreak]         = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [payout, setPayout]         = useState(0);
  const [flips, setFlips]           = useState<FlipRecord[]>([]);
  const [finalSeed, setFinalSeed]   = useState<string | null>(null);
  const [seedHash, setSeedHash]     = useState<string | null>(null);
  const [lastWin, setLastWin]       = useState<number | null>(null);

  // Coin animation
  const [rotation, setRotation]     = useState(0);
  const [flipping, setFlipping]     = useState(false);
  const pendingRef                  = useRef<FlipResult | null>(null);
  const settleTimer                 = useRef<NodeJS.Timeout | null>(null);

  // Controls
  const [betAmount, setBetAmount]   = useState(100);
  const [side, setSide]             = useState<CoinSide>("HEADS");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [soundOn, setSoundOn]       = useState(true);
  const [showFair, setShowFair]     = useState(false);
  const [clientSeed, setClientSeed] = useState(() =>
    typeof crypto !== "undefined" ? crypto.randomUUID().replace(/-/g, "").slice(0, 16) : "seed12345",
  );
  const errorTimer = useRef<NodeJS.Timeout | null>(null);
  const sounds = useSounds(soundOn);

  // Config + live feed
  const { data: cfg } = useSWR<Config>("/api/casino/coinflip/config",
    (url: string) => fetch(url).then(r => r.ok ? r.json() : null), { revalidateOnFocus: false });
  const { data: recent, mutate: refreshRecent } = useSWR<RecentGame[]>("/api/casino/coinflip/history",
    (url: string) => fetch(url).then(r => r.ok ? r.json() : []), { refreshInterval: 15_000 });

  const minBet = cfg?.minBet ?? 10;
  const maxBet = cfg?.maxBet ?? 100_000;
  const stepMult = cfg?.stepMultiplier ?? 1.98;
  const maxFlips = cfg?.maxFlips ?? 10;
  const ladder = useMemo(
    () => cfg?.multiplierTable ?? Array.from({ length: 10 }, (_, i) => +(Math.pow(1.98, i + 1).toFixed(2))),
    [cfg],
  );

  const inGame = phase === "flipping" || phase === "choice";

  const showError = useCallback((msg: string) => {
    setError(msg);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(null), 4000);
  }, []);

  // ── Coin landing math: spin N turns and land on the result face ─────────────
  const spinTo = useCallback((result: CoinSide) => {
    setRotation(prev => {
      const want = result === "HEADS" ? 0 : 180;
      const raw = prev + 1080; // 3 extra full turns minimum
      const delta = ((want - (raw % 360)) % 360 + 360) % 360;
      return raw + delta;
    });
  }, []);

  // ── Apply a server result once the coin animation finishes ──────────────────
  const settleResult = useCallback((r: FlipResult) => {
    setStreak(r.streak);
    setFlips(r.flips);
    if (r.status === "IN_PROGRESS") {
      setMultiplier(r.multiplier);
      setPayout(r.payout);
      setLastWin(r.payout);
      setPhase("choice");
      sounds.win();
    } else if (r.status === "CASHED_OUT") {
      setMultiplier(r.multiplier);
      setPayout(r.payout);
      setFinalSeed(r.serverSeed ?? null);
      setPhase("cashed");
      sounds.cashout();
      refreshRecent();
    } else {
      setMultiplier(0);
      setPayout(0);
      setFinalSeed(r.serverSeed ?? null);
      setPhase("lost");
      sounds.lose();
      refreshRecent();
    }
  }, [sounds, refreshRecent]);

  const animateThenSettle = useCallback((r: FlipResult) => {
    pendingRef.current = r;
    setSessionId(r.sessionId);
    if (r.serverSeedHash) setSeedHash(r.serverSeedHash);
    setFlipping(true);
    setLastWin(null);
    spinTo(r.result);
    sounds.flip();
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      setFlipping(false);
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) settleResult(pending);
    }, FLIP_DUR * 1000 + 80);
  }, [spinTo, settleResult, sounds]);

  // ── Restore an in-progress session (refresh / nav back) ─────────────────────
  const restoreActive = useCallback(async () => {
    try {
      const r = await fetch("/api/casino/coinflip/active", {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (!r.ok) return false;
      const s = await r.json();
      if (s && s.id) {
        setSessionId(s.id);
        setBetAmount(s.betAmount);
        setStreak(s.streak);
        setMultiplier(s.multiplier);
        setPayout(s.payout);
        setFlips((s.flips ?? []) as FlipRecord[]);
        setSeedHash(s.serverSeedHash ?? null);
        const last = (s.flips ?? [])[(s.flips ?? []).length - 1] as FlipRecord | undefined;
        if (last) setRotation(last.result === "HEADS" ? 0 : 180);
        setPhase(s.streak > 0 ? "choice" : "choice");
        return true;
      }
      return false;
    } catch { return false; }
  }, [accessToken]);

  useEffect(() => {
    if (!user) return;
    restoreActive();
  }, [user, restoreActive]);

  // Safety: never leave buttons locked if a socket response is lost.
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 8000);
    return () => clearTimeout(t);
  }, [loading]);

  // ── Socket wiring ────────────────────────────────────────────────────────────
  useEffect(() => {
    const s = socket.current;
    if (!s) return;

    const onStart = (data: { ok: boolean; result?: FlipResult; message?: string }) => {
      setLoading(false);
      if (!data.ok || !data.result) {
        if (/active game|cashout first|already/i.test(data.message ?? "")) restoreActive();
        else showError(data.message ?? "Failed to start");
        setPhase("idle");
        return;
      }
      animateThenSettle(data.result);
    };

    const onFlip = (data: { ok: boolean; result?: FlipResult; message?: string }) => {
      setLoading(false);
      if (!data.ok || !data.result) { showError(data.message ?? "Flip failed"); setPhase("choice"); return; }
      animateThenSettle(data.result);
    };

    const onCashout = (data: { ok: boolean; result?: FlipResult; message?: string }) => {
      setLoading(false);
      if (!data.ok || !data.result) { showError(data.message ?? "Cashout failed"); return; }
      const r = data.result;
      setStreak(r.streak);
      setMultiplier(r.multiplier);
      setPayout(r.payout);
      setFinalSeed(r.serverSeed ?? null);
      setPhase("cashed");
      sounds.cashout();
      refreshRecent();
    };

    const onError = (data: { message: string }) => {
      setLoading(false);
      if (/unauthor|session expired|not your/i.test(data.message ?? "")) { reauthSocket(); return; }
      showError(data.message);
      if (phase === "flipping") setPhase("idle");
    };

    s.on("coinflip:startResponse",   onStart);
    s.on("coinflip:flipResponse",    onFlip);
    s.on("coinflip:cashoutResponse", onCashout);
    s.on("coinflip:error",           onError);

    return () => {
      s.off("coinflip:startResponse",   onStart);
      s.off("coinflip:flipResponse",    onFlip);
      s.off("coinflip:cashoutResponse", onCashout);
      s.off("coinflip:error",           onError);
    };
  }, [animateThenSettle, restoreActive, showError, sounds, refreshRecent, phase]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const handleFlip = () => {
    if (!user) { window.location.href = "/auth/login"; return; }
    if (loading || flipping) return;

    if (phase === "choice" && sessionId) {
      setLoading(true);
      socket.current?.emit("coinflip:flip", { sessionId, side });
      return;
    }
    // fresh game
    if (betAmount < minBet) { showError(`Minimum bet is ${inr(minBet)}`); return; }
    if (betAmount > maxBet) { showError(`Maximum bet is ${inr(maxBet)}`); return; }
    setLoading(true);
    setFinalSeed(null);
    setFlips([]);
    setStreak(0);
    setMultiplier(1);
    setPayout(0);
    setPhase("flipping");
    socket.current?.emit("coinflip:start", { betAmount, side, clientSeed });
  };

  const handleCashout = () => {
    if (!sessionId || phase !== "choice" || loading || flipping) return;
    setLoading(true);
    const s = socket.current;
    if (s && s.disconnected) s.connect();
    s?.emit("coinflip:cashout", { sessionId });
  };

  const handleReset = () => {
    setPhase("idle");
    setSessionId(null);
    setStreak(0);
    setMultiplier(1);
    setPayout(0);
    setFlips([]);
    setLastWin(null);
    setFinalSeed(null);
    setSeedHash(null);
    setRotation(prev => ((prev % 360) + 360) % 360); // normalize so next spin counts up cleanly
    setClientSeed(crypto.randomUUID().replace(/-/g, "").slice(0, 16));
  };

  const nextWin = +(betAmount * Math.pow(stepMult, streak + 1)).toFixed(2);

  // ── Action buttons (shared mobile-top / desktop-bottom) ─────────────────────
  const actionButtons = (
    <div className="space-y-2">
      {phase === "choice" && (
        <button
          onClick={handleCashout}
          disabled={loading || flipping}
          className="w-full bg-[#00e701] hover:bg-[#1fff20] text-[#0f212e] font-black text-base md:text-lg py-3 rounded-lg shadow-[0_0_14px_rgba(0,231,1,0.35)] transition active:scale-95 disabled:opacity-50"
        >
          {loading ? "…" : <>CASHOUT&nbsp;&nbsp;{inr(payout)}</>}
        </button>
      )}
      {(phase === "idle" || phase === "choice" || phase === "flipping") && (
        <button
          onClick={handleFlip}
          disabled={loading || flipping || cfg?.enabled === false}
          className="w-full font-black text-base md:text-lg py-3 rounded-lg transition active:scale-95 disabled:opacity-60 text-white"
          style={{
            background: "linear-gradient(135deg,#f3c431 0%,#e08a00 100%)",
            color: "#3a2400",
            boxShadow: "0 0 16px rgba(243,196,49,0.3)",
          }}
        >
          {!user ? "LOGIN TO PLAY"
            : flipping ? "FLIPPING…"
            : phase === "choice" ? `FLIP AGAIN — WIN ${inr(nextWin)}`
            : cfg?.enabled === false ? "GAME DISABLED"
            : "FLIP COIN"}
        </button>
      )}
      {(phase === "lost" || phase === "cashed") && (
        <button
          onClick={handleReset}
          className="w-full font-black text-base md:text-lg py-3 rounded-lg transition active:scale-95 text-white flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg,#f3c431 0%,#e08a00 100%)", color: "#3a2400", boxShadow: "0 0 16px rgba(243,196,49,0.3)" }}
        >
          <RotateCcw size={17} /> PLAY AGAIN
        </button>
      )}
    </div>
  );

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="bg-[#0a0b12] text-white flex flex-col font-sans w-full min-h-screen md:min-h-0 md:overflow-hidden md:h-[calc(100vh-74px)]">

      {/* Mobile header */}
      <div className="md:hidden flex items-center justify-between gap-2 px-4 py-3 bg-[#0F1923] border-b border-white/10">
        <h1 className="font-black text-base tracking-wide">🪙 COINFLIP</h1>
        <Link href="/" className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm font-semibold transition">
          <ArrowLeft size={16} /> Back
        </Link>
      </div>

      {/* Error toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
            className="fixed top-16 md:top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full text-sm font-bold bg-red-950/90 border border-red-500/50 text-red-200 shadow-xl backdrop-blur"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 md:overflow-hidden flex flex-col-reverse md:flex-row md:p-3 w-full max-w-7xl mx-auto md:gap-3 min-h-0">

        {/* ── Controls panel ── */}
        <div className="md:w-80 shrink-0 bg-[#141826] md:rounded-xl p-4 flex flex-col gap-4 md:h-full md:overflow-y-auto border-t border-white/10 md:border md:border-white/5">

          {/* Mobile: primary actions on top */}
          <div className="md:hidden">{actionButtons}</div>

          {/* Bet amount */}
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1 font-semibold">
              <span>Bet Amount</span>
              <span>Min {inr(minBet)} · Max {inr(maxBet)}</span>
            </div>
            <div className="flex bg-[#0f1320] rounded-lg border border-white/10 overflow-hidden focus-within:border-yellow-400/50 transition">
              <input
                type="number"
                min={minBet} max={maxBet}
                className="w-full bg-transparent text-white p-2.5 outline-none font-bold"
                value={betAmount || ""}
                onChange={(e) => setBetAmount(e.target.value === "" ? 0 : Number(e.target.value))}
                onBlur={() => setBetAmount(prev => Math.min(maxBet, Math.max(minBet, prev || minBet)))}
                disabled={inGame}
              />
              <button className="px-3 bg-white/5 hover:bg-white/10 text-sm font-bold disabled:opacity-40" disabled={inGame}
                onClick={() => setBetAmount(p => Math.max(minBet, Math.round(p / 2)))}>½</button>
              <div className="w-px bg-white/10" />
              <button className="px-3 bg-white/5 hover:bg-white/10 text-sm font-bold disabled:opacity-40" disabled={inGame}
                onClick={() => setBetAmount(p => Math.min(maxBet, Math.round(p * 2)))}>2×</button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[100, 500, 1000, 2500, 5000, 10000].map(v => {
                const c = Math.min(maxBet, Math.max(minBet, v));
                return (
                  <button key={v} onClick={() => setBetAmount(c)} disabled={inGame}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold transition disabled:opacity-40 ${betAmount === c ? "bg-yellow-500/80 text-black" : "bg-white/8 text-gray-300 hover:bg-white/15"}`}>
                    ₹{v.toLocaleString("en-IN")}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Side selector */}
          <div>
            <p className="text-xs text-gray-400 mb-1.5 font-semibold">
              {phase === "choice" ? "Pick side for next flip" : "Pick your side"}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSide("HEADS")}
                disabled={flipping || loading}
                className="py-3 rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                style={{
                  background: side === "HEADS" ? "linear-gradient(135deg,#ffd84d,#c8961e)" : "rgba(255,255,255,0.05)",
                  color: side === "HEADS" ? "#3a2400" : "rgba(255,255,255,0.55)",
                  border: `2px solid ${side === "HEADS" ? "#ffd84d" : "rgba(255,255,255,0.1)"}`,
                  boxShadow: side === "HEADS" ? "0 0 14px rgba(255,216,77,0.35)" : "none",
                }}
              >
                <span className="w-5 h-5 rounded-full inline-block border" style={{ background: "radial-gradient(circle at 35% 30%, #fff6cf, #e3a818)", borderColor: "#9a6d06" }} />
                HEADS
              </button>
              <button
                onClick={() => setSide("TAILS")}
                disabled={flipping || loading}
                className="py-3 rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                style={{
                  background: side === "TAILS" ? "linear-gradient(135deg,#c0a3f7,#6d40d8)" : "rgba(255,255,255,0.05)",
                  color: side === "TAILS" ? "#1c0e44" : "rgba(255,255,255,0.55)",
                  border: `2px solid ${side === "TAILS" ? "#b794f6" : "rgba(255,255,255,0.1)"}`,
                  boxShadow: side === "TAILS" ? "0 0 14px rgba(183,148,246,0.35)" : "none",
                }}
              >
                <span className="w-5 h-5 rounded-full inline-block border" style={{ background: "radial-gradient(circle at 35% 30%, #f3ecff, #8456e0)", borderColor: "#3d2380" }} />
                TAILS
              </button>
            </div>
          </div>

          {/* Desktop: actions in natural position */}
          <div className="hidden md:block">{actionButtons}</div>

          {/* Game stats */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-white/4 border border-white/8 py-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Per Flip</p>
              <p className="text-sm font-black text-yellow-400">{stepMult}×</p>
            </div>
            <div className="rounded-lg bg-white/4 border border-white/8 py-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Streak</p>
              <p className="text-sm font-black">{streak}<span className="text-gray-500 font-bold">/{maxFlips}</span></p>
            </div>
            <div className="rounded-lg bg-white/4 border border-white/8 py-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Max Win</p>
              <p className="text-sm font-black text-green-400">{ladder[ladder.length - 1]}×</p>
            </div>
          </div>

          {/* Provably fair */}
          <div className="rounded-lg border border-white/8 bg-white/3">
            <button onClick={() => setShowFair(v => !v)} className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-bold text-gray-300">
              <span className="flex items-center gap-1.5"><ShieldCheck size={14} className="text-green-400" /> Provably Fair</span>
              <ChevronDown size={14} className={`transition-transform ${showFair ? "rotate-180" : ""}`} />
            </button>
            {showFair && (
              <div className="px-3 pb-3 space-y-2 text-[11px]">
                <div>
                  <p className="text-gray-500 mb-0.5">Client Seed {inGame ? "(locked during game)" : "(editable)"}</p>
                  <input
                    value={clientSeed}
                    onChange={e => setClientSeed(e.target.value.slice(0, 64))}
                    disabled={inGame}
                    className="w-full bg-[#0f1320] border border-white/10 rounded px-2 py-1.5 font-mono text-gray-300 outline-none focus:border-yellow-400/40 disabled:opacity-50"
                  />
                </div>
                {seedHash && (
                  <div>
                    <p className="text-gray-500 mb-0.5">Server Seed Hash (SHA-256)</p>
                    <p className="font-mono text-gray-400 break-all bg-[#0f1320] rounded px-2 py-1.5 border border-white/10">{seedHash}</p>
                  </div>
                )}
                {finalSeed && (
                  <div>
                    <p className="text-green-400/80 mb-0.5">Server Seed (revealed)</p>
                    <p className="font-mono text-green-300/80 break-all bg-green-950/30 rounded px-2 py-1.5 border border-green-500/20">{finalSeed}</p>
                  </div>
                )}
                <p className="text-gray-600 leading-relaxed">
                  Each flip = HMAC-SHA256(serverSeed, clientSeed:nonce:flip:i). Verify the hash matches after the game ends.
                </p>
              </div>
            )}
          </div>

          {/* Recent games */}
          <div className="hidden md:block flex-1 min-h-0">
            <p className="text-xs text-gray-400 mb-1.5 font-semibold">Recent Games</p>
            <div className="space-y-1">
              {(recent ?? []).slice(0, 8).map(g => (
                <div key={g.id} className="flex items-center justify-between rounded-md bg-white/4 px-2.5 py-1.5 text-[11px]">
                  <span className="text-gray-400 truncate max-w-[80px]">{g.username}</span>
                  <span className="text-gray-500">{g.streak}🔥</span>
                  <span className={`font-bold ${g.status === "CASHED_OUT" ? "text-green-400" : "text-red-400"}`}>
                    {g.status === "CASHED_OUT" ? `+${inr(g.payout)}` : `-${inr(g.betAmount)}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Game arena ── */}
        <div className="flex-1 relative md:rounded-xl overflow-hidden flex flex-col min-h-[480px] md:min-h-0"
          style={{ background: "radial-gradient(ellipse 90% 70% at 50% 30%, #181d33 0%, #0c0f1c 70%)" }}>

          {/* side glows */}
          <div className="absolute inset-y-0 left-0 w-1/2 pointer-events-none transition-opacity duration-300"
            style={{ background: "radial-gradient(ellipse 70% 55% at 18% 50%, rgba(243,196,49,0.13) 0%, transparent 65%)", opacity: side === "HEADS" ? 1 : 0.25 }} />
          <div className="absolute inset-y-0 right-0 w-1/2 pointer-events-none transition-opacity duration-300"
            style={{ background: "radial-gradient(ellipse 70% 55% at 82% 50%, rgba(132,86,224,0.16) 0%, transparent 65%)", opacity: side === "TAILS" ? 1 : 0.25 }} />

          {/* desktop title + sound */}
          <div className="hidden md:flex items-center justify-between px-5 pt-4 relative z-10">
            <h1 className="font-black text-lg tracking-wide">🪙 COINFLIP</h1>
            <button onClick={() => setSoundOn(v => !v)} className="text-white/40 hover:text-white transition" title="Sound">
              {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
          </div>

          {/* Multiplier ladder */}
          <div className="relative z-10 px-3 md:px-5 pt-3">
            <div className="flex gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {ladder.map((m, i) => {
                const reached = streak >= i + 1;
                const isNext  = streak === i && inGame;
                return (
                  <div key={i}
                    className={`shrink-0 px-2.5 py-1.5 rounded-md text-[11px] md:text-xs font-black border transition-all ${
                      reached ? "bg-green-500/20 border-green-400/60 text-green-300"
                      : isNext ? "bg-yellow-500/15 border-yellow-400/60 text-yellow-300 animate-pulse"
                      : "bg-white/4 border-white/8 text-gray-500"}`}>
                    {m}×
                  </div>
                );
              })}
            </div>
          </div>

          {/* Coin center */}
          <div className="flex-1 flex flex-col items-center justify-center relative z-10 py-6">
            <Coin rotation={rotation} flipping={flipping} />

            {/* floating win text */}
            <AnimatePresence>
              {lastWin !== null && phase === "choice" && (
                <motion.div
                  key={`win-${streak}`}
                  initial={{ opacity: 0, y: 10, scale: 0.8 }}
                  animate={{ opacity: 1, y: -16, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute top-[16%] text-2xl md:text-3xl font-black text-green-400 drop-shadow-[0_0_12px_rgba(74,222,128,0.5)]"
                >
                  +{inr(lastWin)} · {multiplier}×
                </motion.div>
              )}
            </AnimatePresence>

            {/* status line under coin */}
            <div className="mt-5 text-center min-h-[44px]">
              {phase === "idle" && <p className="text-white/40 text-sm font-semibold">Pick a side, set your bet & flip — each win pays {stepMult}×</p>}
              {phase === "flipping" && <p className="text-yellow-300/80 text-sm font-bold animate-pulse">Flipping…</p>}
              {phase === "choice" && (
                <p className="text-white/70 text-sm font-semibold">
                  <span className="text-green-400 font-black">{inr(payout)}</span> locked — flip again for <span className="text-yellow-300 font-black">{inr(nextWin)}</span> or cash out
                </p>
              )}
            </div>

            {/* Session flip chips */}
            {flips.length > 0 && (
              <div className="flex gap-1.5 flex-wrap justify-center px-4 mt-1">
                {flips.map((f, i) => (
                  <div key={i}
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black border-2 ${
                      f.won ? "border-green-400/70" : "border-red-400/70"}`}
                    style={{
                      background: f.result === "HEADS"
                        ? "radial-gradient(circle at 35% 30%, #fff6cf, #e3a818)"
                        : "radial-gradient(circle at 35% 30%, #f3ecff, #8456e0)",
                      color: f.result === "HEADS" ? "#5c4100" : "#241055",
                    }}>
                    {f.result === "HEADS" ? "H" : "T"}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Result banners */}
          <AnimatePresence>
            {phase === "cashed" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-[3px]"
              >
                <div className="rounded-2xl border-2 border-green-400/60 bg-[#0c1f12]/95 px-8 py-7 text-center shadow-[0_0_40px_rgba(34,197,94,0.3)] mx-4">
                  <p className="text-4xl mb-2">🎉</p>
                  <p className="text-green-300 text-xs font-black uppercase tracking-[0.2em] mb-1">
                    {streak >= maxFlips ? "Max Streak — Legendary!" : "Cashed Out"}
                  </p>
                  <p className="text-3xl md:text-4xl font-black text-green-400 mb-1">{inr(payout)}</p>
                  <p className="text-white/50 text-sm font-semibold mb-5">{multiplier}× · {streak} flip{streak > 1 ? "s" : ""} streak</p>
                  <button onClick={handleReset}
                    className="px-7 py-2.5 rounded-lg font-black text-sm transition active:scale-95"
                    style={{ background: "linear-gradient(135deg,#f3c431,#e08a00)", color: "#3a2400" }}>
                    PLAY AGAIN
                  </button>
                </div>
              </motion.div>
            )}
            {phase === "lost" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-[3px]"
              >
                <div className="rounded-2xl border-2 border-red-500/50 bg-[#1f0c0c]/95 px-8 py-7 text-center shadow-[0_0_40px_rgba(239,68,68,0.25)] mx-4">
                  <p className="text-4xl mb-2">💀</p>
                  <p className="text-red-300 text-xs font-black uppercase tracking-[0.2em] mb-1">Wrong Call</p>
                  <p className="text-2xl md:text-3xl font-black text-red-400 mb-1">-{inr(betAmount)}</p>
                  <p className="text-white/50 text-sm font-semibold mb-5">
                    {streak > 0 ? `Streak ended at ${streak} — the coin landed ${flips[flips.length - 1]?.result}` : `The coin landed ${flips[flips.length - 1]?.result}`}
                  </p>
                  <button onClick={handleReset}
                    className="px-7 py-2.5 rounded-lg font-black text-sm transition active:scale-95"
                    style={{ background: "linear-gradient(135deg,#f3c431,#e08a00)", color: "#3a2400" }}>
                    TRY AGAIN
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
