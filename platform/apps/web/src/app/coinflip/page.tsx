"use client";
import Link from "next/link";
import { ArrowLeft, Volume2, VolumeX, ShieldCheck, ChevronDown, ChevronRight, Check, Crown, Rocket, RotateCcw, Zap, Trophy, History } from "lucide-react";
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

const FLIP_DUR = 1.4; // seconds — coin spin animation length
const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

// Ladder pill accent colors — warm → purple → pink → blue, like the design.
const LADDER_COLORS = ["#f3c431", "#c084fc", "#a855f7", "#d946ef", "#ec4899", "#8b5cf6", "#6366f1", "#3b82f6", "#38bdf8", "#22d3ee"];

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

// ─── Coin faces (SVG — everything scales with the coin size) ──────────────────

// HEADS — the website logo fills the coin face inside a gold rim.
function HeadsFace() {
  return (
    <svg viewBox="0 0 200 200" className="w-full h-full block select-none">
      <defs>
        <radialGradient id="cfHFace" cx="36%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#fff6cf" />
          <stop offset="38%" stopColor="#ffd84d" />
          <stop offset="75%" stopColor="#e3a818" />
          <stop offset="100%" stopColor="#9a6d06" />
        </radialGradient>
        <linearGradient id="cfHRim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffe79a" />
          <stop offset="55%" stopColor="#c8961e" />
          <stop offset="100%" stopColor="#7c5604" />
        </linearGradient>
        <clipPath id="cfHClip"><circle cx="100" cy="100" r="75" /></clipPath>
      </defs>
      <circle cx="100" cy="100" r="99" fill="url(#cfHRim)" />
      <circle cx="100" cy="100" r="90" fill="url(#cfHFace)" />
      <circle cx="100" cy="100" r="84" fill="none" stroke="rgba(122,82,0,0.45)" strokeWidth="2.5" strokeDasharray="5 9" />
      {/* logo fills the face */}
      <image href="/logo.png" x="25" y="25" width="150" height="150" clipPath="url(#cfHClip)" preserveAspectRatio="xMidYMid slice" />
      <circle cx="100" cy="100" r="75" fill="none" stroke="rgba(140,95,5,0.7)" strokeWidth="4" />
      <circle cx="100" cy="100" r="75" fill="none" stroke="rgba(255,243,194,0.35)" strokeWidth="1.5" />
    </svg>
  );
}

// TAILS — deep purple coin with the big T, like the design.
function TailsFace() {
  return (
    <svg viewBox="0 0 200 200" className="w-full h-full block select-none">
      <defs>
        <radialGradient id="cfTFace" cx="36%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#9d77ea" />
          <stop offset="40%" stopColor="#6a3fd0" />
          <stop offset="74%" stopColor="#3b2080" />
          <stop offset="100%" stopColor="#1d0e44" />
        </radialGradient>
        <linearGradient id="cfTRim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c9aaff" />
          <stop offset="55%" stopColor="#7a4fd0" />
          <stop offset="100%" stopColor="#2c1763" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="99" fill="url(#cfTRim)" />
      <circle cx="100" cy="100" r="90" fill="url(#cfTFace)" />
      <circle cx="100" cy="100" r="84" fill="none" stroke="rgba(200,170,255,0.35)" strokeWidth="2.5" strokeDasharray="5 9" />
      {/* big embossed T */}
      <text x="100" y="135" textAnchor="middle" fontSize="100" fontWeight="900" fontFamily="Arial Black, Arial, sans-serif" fill="#1d0e44">T</text>
      <text x="100" y="130" textAnchor="middle" fontSize="100" fontWeight="900" fontFamily="Arial Black, Arial, sans-serif" fill="#c9aaff">T</text>
      <text x="100" y="166" textAnchor="middle" fontSize="13" fontWeight="800" letterSpacing="6" fontFamily="Arial, sans-serif" fill="rgba(215,195,255,0.85)">TAILS</text>
    </svg>
  );
}

// ─── 3D Coin ───────────────────────────────────────────────────────────────────

function Coin({ rotation, flipping }: { rotation: number; flipping: boolean }) {
  return (
    <div className="relative flex flex-col items-center" style={{ perspective: 1400 }}>
      <motion.div
        className="relative w-[240px] h-[240px] md:w-[310px] md:h-[310px]"
        style={{ filter: "drop-shadow(0 20px 28px rgba(0,0,0,0.55)) drop-shadow(0 0 42px rgba(255,175,45,0.28))" }}
        animate={{ y: flipping ? [0, -70, 0] : 0 }}
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
    </div>
  );
}

// ─── Stage podium (SVG) ────────────────────────────────────────────────────────

function Podium() {
  return (
    <svg viewBox="0 0 380 130" className="w-[310px] md:w-[430px] -mt-6 md:-mt-9 block" aria-hidden>
      <defs>
        <linearGradient id="pdSide" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#332551" />
          <stop offset="100%" stopColor="#150e29" />
        </linearGradient>
        <radialGradient id="pdTop" cx="50%" cy="42%" r="70%">
          <stop offset="0%" stopColor="#3d2d63" />
          <stop offset="70%" stopColor="#251a44" />
          <stop offset="100%" stopColor="#1a1131" />
        </radialGradient>
        <filter id="pdBlur" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>

      {/* base */}
      <ellipse cx="190" cy="112" rx="172" ry="16" fill="#0d0918" />
      <ellipse cx="190" cy="108" rx="160" ry="15" fill="url(#pdSide)" />
      {/* body */}
      <path d="M70 50 L70 96 A120 14 0 0 0 310 96 L310 50 Z" fill="url(#pdSide)" />
      {/* glow ring around top edge */}
      <ellipse cx="190" cy="50" rx="121" ry="19" fill="none" stroke="#8b5cf6" strokeWidth="5" opacity="0.5" filter="url(#pdBlur)" />
      {/* top disc */}
      <ellipse cx="190" cy="50" rx="120" ry="18" fill="url(#pdTop)" stroke="#4b3878" strokeWidth="1.5" />
      <ellipse cx="190" cy="50" rx="92" ry="13" fill="none" stroke="rgba(160,120,255,0.25)" strokeWidth="1.5" strokeDasharray="3 8" />
      {/* spotlight under the coin */}
      <ellipse cx="190" cy="47" rx="62" ry="9" fill="rgba(255,190,70,0.30)" filter="url(#pdBlur)" />
      {/* rim lights */}
      {[-100, -64, -28, 8, 44, 80, 108].map((dx, i) => (
        <g key={i}>
          <circle cx={190 + dx} cy={50 + Math.sqrt(Math.max(0, 1 - (dx / 120) ** 2)) * 16} r="5" fill="rgba(180,130,255,0.35)" filter="url(#pdBlur)" />
          <circle cx={190 + dx} cy={50 + Math.sqrt(Math.max(0, 1 - (dx / 120) ** 2)) * 16} r="2.2" fill="#d9c2ff" />
        </g>
      ))}
    </svg>
  );
}

// ─── Floating decorative coins ─────────────────────────────────────────────────

const FLOATERS = [
  { left: "8%",  top: "14%", size: 34, dur: 4.2, delay: 0,   rot: -18, mobile: false },
  { left: "20%", top: "58%", size: 22, dur: 3.6, delay: 0.8, rot: 10,  mobile: true  },
  { left: "30%", top: "8%",  size: 18, dur: 3.2, delay: 1.6, rot: 24,  mobile: true  },
  { left: "72%", top: "10%", size: 26, dur: 4.6, delay: 0.4, rot: -8,  mobile: true  },
  { left: "86%", top: "30%", size: 38, dur: 5.0, delay: 1.2, rot: 18,  mobile: false },
  { left: "78%", top: "66%", size: 24, dur: 3.8, delay: 2.0, rot: -22, mobile: true  },
  { left: "12%", top: "40%", size: 16, dur: 4.4, delay: 2.6, rot: 6,   mobile: false },
];

function FloatCoin({ left, top, size, dur, delay, rot, mobile }: typeof FLOATERS[number]) {
  return (
    <motion.div
      className={`absolute pointer-events-none ${mobile ? "" : "hidden md:block"}`}
      style={{ left, top, width: size, height: size, zIndex: 1 }}
      animate={{ y: [0, -14, 0], rotate: [rot, rot + 10, rot] }}
      transition={{ duration: dur, repeat: Infinity, ease: "easeInOut", delay }}
    >
      <div className="w-full h-full rounded-full" style={{
        background: "radial-gradient(circle at 35% 30%, #ffeaa6 0%, #f3c431 55%, #b8860b 100%)",
        border: "2px solid #8a6508",
        boxShadow: "0 6px 14px rgba(0,0,0,0.45), inset 0 2px 4px rgba(255,250,220,0.6)",
      }} />
    </motion.div>
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

  const { data: cfg } = useSWR<Config>("/api/casino/coinflip/config",
    (url: string) => fetch(url).then(r => r.ok ? r.json() : null), { revalidateOnFocus: false });

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
    } else {
      setMultiplier(0);
      setPayout(0);
      setFinalSeed(r.serverSeed ?? null);
      setPhase("lost");
      sounds.lose();
    }
  }, [sounds]);

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
        setPhase("choice");
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
  }, [animateThenSettle, restoreActive, showError, sounds, phase]);

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
          className="w-full bg-[#00e701] hover:bg-[#1fff20] text-[#0f212e] font-black text-base md:text-lg py-3 rounded-xl shadow-[0_0_18px_rgba(0,231,1,0.4)] transition active:scale-95 disabled:opacity-50"
        >
          {loading ? "…" : <>CASHOUT&nbsp;&nbsp;{inr(payout)}</>}
        </button>
      )}
      {(phase === "idle" || phase === "choice" || phase === "flipping") && (
        <button
          onClick={handleFlip}
          disabled={loading || flipping || cfg?.enabled === false}
          className="relative w-full py-3.5 rounded-2xl transition active:scale-95 disabled:opacity-60 flex items-center justify-center gap-3 overflow-hidden"
          style={{
            background: "linear-gradient(180deg,#ffd23a 0%,#ffa200 50%,#ff7e00 100%)",
            border: "2px solid rgba(255,233,160,0.7)",
            boxShadow: "0 0 30px rgba(255,150,0,0.5), inset 0 2px 0 rgba(255,245,200,0.7), inset 0 -4px 8px rgba(150,60,0,0.35)",
          }}
        >
          {/* glossy shine */}
          <span className="absolute inset-x-0 top-0 h-1/2 pointer-events-none" style={{ background: "linear-gradient(180deg,rgba(255,255,255,0.32),transparent)" }} />
          {/* flying coin */}
          <span className="relative w-8 h-8 rounded-full shrink-0 overflow-hidden border-2"
            style={{ borderColor: "#8a5400", background: "radial-gradient(circle at 35% 30%, #fff6cf, #e3a818)", boxShadow: "-6px 4px 10px rgba(120,60,0,0.45), 0 0 12px rgba(255,230,150,0.8)" }}>
            <img src="/logo.png" alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
          </span>
          <span className="relative font-black text-xl md:text-2xl tracking-wide" style={{ color: "#3c1f00", textShadow: "0 1px 0 rgba(255,240,190,0.6)" }}>
            {!user ? "LOGIN TO PLAY"
              : flipping ? "FLIPPING…"
              : phase === "choice" ? `FLIP AGAIN · ${inr(nextWin)}`
              : cfg?.enabled === false ? "GAME DISABLED"
              : "FLIP COIN"}
          </span>
        </button>
      )}
      {(phase === "lost" || phase === "cashed") && (
        <button
          onClick={handleReset}
          className="w-full font-black text-lg py-3.5 rounded-xl transition active:scale-95 flex items-center justify-center gap-2 tracking-wide"
          style={{
            background: "linear-gradient(180deg,#ffc63a 0%,#ff9000 55%,#ff7a00 100%)",
            color: "#fff",
            textShadow: "0 1px 3px rgba(120,50,0,0.5)",
            boxShadow: "0 0 28px rgba(255,150,0,0.45), inset 0 2px 0 rgba(255,240,180,0.55), inset 0 -3px 0 rgba(150,60,0,0.35)",
          }}
        >
          <RotateCcw size={18} /> PLAY AGAIN
        </button>
      )}
    </div>
  );

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="bg-[#0a0712] text-white flex flex-col font-sans w-full min-h-screen md:min-h-0 md:overflow-hidden md:h-[calc(100vh-74px)]">

      {/* Mobile header */}
      <div className="md:hidden flex items-center justify-between gap-2 px-4 py-3 bg-[#0d0918] border-b border-white/10">
        <h1 className="font-black text-base tracking-wide flex items-center gap-2">
          <span className="w-5 h-5 rounded-full inline-block border border-[#8a6508]" style={{ background: "radial-gradient(circle at 35% 30%, #fff6cf, #e3a818)" }} />
          COINFLIP
        </h1>
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

      <div className="flex-1 md:overflow-hidden flex flex-col-reverse md:flex-row md:p-3 w-full max-w-[1500px] mx-auto md:gap-3 min-h-0">

        {/* ── Controls panel ── */}
        <div className="md:w-[350px] shrink-0 md:rounded-3xl p-4 flex flex-col gap-4 md:h-full md:overflow-y-auto border-t md:border"
          style={{ background: "linear-gradient(180deg,#15102a 0%,#0d0918 100%)", borderColor: "rgba(140,110,255,0.28)", boxShadow: "0 0 26px rgba(120,80,255,0.10)" }}>

          {/* Mobile: primary actions on top */}
          <div className="md:hidden">{actionButtons}</div>

          {/* Bet amount */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-[12px] font-black uppercase tracking-widest text-white">Bet Amount</span>
              <span className="text-[11px] text-white/45 font-bold">Min <span className="text-yellow-400">{inr(minBet)}</span> · Max <span className="text-yellow-400">{inr(maxBet)}</span></span>
            </div>
            {/* gold gradient border box */}
            <div className="flex rounded-2xl overflow-hidden"
              style={{
                border: "2px solid transparent",
                background: "linear-gradient(#0c0817,#0c0817) padding-box, linear-gradient(135deg,#ffd84d 0%,#b8860b 55%,#ffd84d 100%) border-box",
                boxShadow: "0 0 14px rgba(255,200,60,0.18)",
              }}>
              <input
                type="number"
                min={minBet} max={maxBet}
                className="w-full bg-transparent text-white px-4 py-3.5 outline-none font-black text-xl"
                value={betAmount || ""}
                onChange={(e) => setBetAmount(e.target.value === "" ? 0 : Number(e.target.value))}
                onBlur={() => setBetAmount(prev => Math.min(maxBet, Math.max(minBet, prev || minBet)))}
                disabled={inGame}
              />
              <button className="px-4 text-lg font-black text-white/85 hover:bg-white/8 disabled:opacity-40 border-l border-white/12" disabled={inGame}
                onClick={() => setBetAmount(p => Math.max(minBet, Math.round(p / 2)))}>½</button>
              <button className="px-4 text-lg font-black text-yellow-400 hover:bg-white/8 disabled:opacity-40 border-l border-white/12" disabled={inGame}
                onClick={() => setBetAmount(p => Math.min(maxBet, Math.round(p * 2)))}>2×</button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2.5">
              {[100, 500, 1000, 2500, 5000, 10000].map(v => {
                const c = Math.min(maxBet, Math.max(minBet, v));
                const active = betAmount === c;
                return (
                  <button key={v} onClick={() => setBetAmount(c)} disabled={inGame}
                    className="px-3.5 py-2 rounded-xl text-[12px] font-black transition disabled:opacity-40"
                    style={active
                      ? { background: "linear-gradient(180deg,#ffe066,#f0a818)", color: "#3a2400", border: "1px solid #ffe9a0", boxShadow: "0 0 14px rgba(255,200,60,0.45), inset 0 1px 0 rgba(255,250,220,0.7)" }
                      : { background: "rgba(122,90,248,0.08)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(140,110,255,0.22)" }}>
                    ₹{v.toLocaleString("en-IN")}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Side selector — big cards like the design */}
          <div>
            <p className="text-[12px] font-black uppercase tracking-widest text-white mb-2">
              {phase === "choice" ? "Pick Side for Next Flip" : "Pick Your Side"}
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {/* HEADS */}
              <button
                onClick={() => setSide("HEADS")}
                disabled={flipping || loading}
                className="relative h-[76px] rounded-2xl transition-all flex items-center gap-2.5 px-3 disabled:opacity-60 active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg,#0c1a3a 0%,#0a1228 100%)",
                  border: `2px solid ${side === "HEADS" ? "#38bdf8" : "rgba(56,140,248,0.30)"}`,
                  boxShadow: side === "HEADS" ? "0 0 20px rgba(56,189,248,0.45), inset 0 0 24px rgba(56,140,248,0.10)" : "none",
                }}
              >
                <span className="relative w-10 h-10 rounded-full shrink-0 overflow-hidden border-2"
                  style={{ borderColor: "#9a6d06", background: "radial-gradient(circle at 35% 30%, #fff6cf, #e3a818)", boxShadow: "0 0 12px rgba(255,210,90,0.5)" }}>
                  <img src="/logo.png" alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
                </span>
                <span className="font-black text-lg tracking-wide"
                  style={{ backgroundImage: "linear-gradient(180deg,#bfe8ff,#3b82f6)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", color: "transparent", filter: side === "HEADS" ? "drop-shadow(0 0 8px rgba(56,189,248,0.6))" : "none" }}>
                  HEADS
                </span>
                {side === "HEADS"
                  ? <span className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "#38bdf8", boxShadow: "0 0 8px rgba(56,189,248,0.8)" }}><Check size={13} strokeWidth={3.5} className="text-[#06203f]" /></span>
                  : <span className="absolute top-2 right-2 w-5 h-5 rounded-full border-2" style={{ borderColor: "rgba(120,170,255,0.5)" }} />}
              </button>

              {/* TAILS */}
              <button
                onClick={() => setSide("TAILS")}
                disabled={flipping || loading}
                className="relative h-[76px] rounded-2xl transition-all flex items-center gap-2.5 px-3 disabled:opacity-60 active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg,#1c0e38 0%,#120825 100%)",
                  border: `2px solid ${side === "TAILS" ? "#c026d3" : "rgba(160,90,240,0.30)"}`,
                  boxShadow: side === "TAILS" ? "0 0 20px rgba(192,38,211,0.5), inset 0 0 24px rgba(160,90,240,0.12)" : "none",
                }}
              >
                <span className="relative w-10 h-10 rounded-full shrink-0 flex items-center justify-center border-2"
                  style={{ borderColor: "#3d2380", background: "radial-gradient(circle at 35% 30%, #c9aaff 0%, #8456e0 55%, #4a2aa0 100%)", boxShadow: "0 0 12px rgba(170,110,255,0.55)" }}>
                  <Crown size={18} className="text-[#efe2ff]" fill="currentColor" />
                </span>
                <span className="font-black text-lg tracking-wide"
                  style={{ backgroundImage: "linear-gradient(180deg,#f0d9ff,#b04ae8)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", color: "transparent", filter: side === "TAILS" ? "drop-shadow(0 0 8px rgba(192,80,230,0.6))" : "none" }}>
                  TAILS
                </span>
                {side === "TAILS"
                  ? <span className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "#e879f9", boxShadow: "0 0 8px rgba(232,121,249,0.8)" }}><Check size={13} strokeWidth={3.5} className="text-[#3a0a45]" /></span>
                  : <span className="absolute top-2 right-2 w-5 h-5 rounded-full border-2" style={{ borderColor: "rgba(200,130,255,0.5)" }} />}
              </button>
            </div>
          </div>

          {/* Desktop: actions in natural position */}
          <div className="hidden md:block">{actionButtons}</div>

          {/* Game stats — themed cards like the design */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl py-2.5 px-1" style={{ background: "linear-gradient(135deg,#1a1030,#120a22)", border: "1.5px solid rgba(168,85,247,0.35)" }}>
              <p className="text-[9px] uppercase tracking-[0.14em] text-white/45 font-black">Per Flip</p>
              <p className="text-base font-black text-yellow-400 mt-1 flex items-center justify-center gap-1">
                <Rocket size={13} className="text-purple-400 shrink-0" /> {stepMult}×
              </p>
            </div>
            <div className="rounded-2xl py-2.5 px-1" style={{ background: "linear-gradient(135deg,#0e142e,#0a0e20)", border: "1.5px solid rgba(110,140,255,0.25)" }}>
              <p className="text-[9px] uppercase tracking-[0.14em] text-white/45 font-black">Streak</p>
              <p className="text-base font-black mt-0.5"><span className="text-[#7db5ff]">{streak}</span><span className="text-white/35">/{maxFlips}</span></p>
              <div className="flex justify-center gap-[3px] mt-1">
                {Array.from({ length: maxFlips }).map((_, i) => (
                  <span key={i} className="w-[6px] h-[6px] rounded-full"
                    style={{ background: i < streak ? "#22c55e" : "rgba(255,255,255,0.14)", boxShadow: i < streak ? "0 0 5px rgba(34,197,94,0.8)" : "none" }} />
                ))}
              </div>
            </div>
            <div className="rounded-2xl py-2.5 px-1" style={{ background: "linear-gradient(135deg,#0a2316,#07180f)", border: "1.5px solid rgba(34,197,94,0.4)" }}>
              <p className="text-[9px] uppercase tracking-[0.14em] text-white/45 font-black">Max Win</p>
              <p className="text-base font-black text-green-400 mt-1 flex items-center justify-center gap-1">
                <Trophy size={13} className="text-green-400 shrink-0" /> {ladder[ladder.length - 1]}×
              </p>
            </div>
          </div>

          {/* Provably fair */}
          <div className="rounded-2xl" style={{ background: "linear-gradient(135deg,#0a2014,#07160d)", border: "1.5px solid rgba(34,197,94,0.45)" }}>
            <button onClick={() => setShowFair(v => !v)} className="w-full flex items-center justify-between px-4 py-3">
              <span className="flex items-center gap-3">
                <ShieldCheck size={20} className="text-green-400 shrink-0" />
                <span className="text-left">
                  <span className="block text-sm font-black text-white leading-tight">Provably Fair</span>
                  <span className="block text-[11px] text-green-400/80 font-semibold leading-tight">100% Fair · Verified</span>
                </span>
              </span>
              {showFair
                ? <ChevronDown size={16} className="text-green-400/70" />
                : <ChevronRight size={16} className="text-green-400/70" />}
            </button>
            {showFair && (
              <div className="px-3.5 pb-3.5 space-y-2 text-[11px]">
                <div>
                  <p className="text-white/40 mb-0.5">Client Seed {inGame ? "(locked during game)" : "(editable)"}</p>
                  <input
                    value={clientSeed}
                    onChange={e => setClientSeed(e.target.value.slice(0, 64))}
                    disabled={inGame}
                    className="w-full bg-[#0a0712] border border-white/10 rounded-lg px-2.5 py-2 font-mono text-white/70 outline-none focus:border-yellow-400/40 disabled:opacity-50"
                  />
                </div>
                {seedHash && (
                  <div>
                    <p className="text-white/40 mb-0.5">Server Seed Hash (SHA-256)</p>
                    <p className="font-mono text-white/50 break-all bg-[#0a0712] rounded-lg px-2.5 py-2 border border-white/10">{seedHash}</p>
                  </div>
                )}
                {finalSeed && (
                  <div>
                    <p className="text-green-400/80 mb-0.5">Server Seed (revealed)</p>
                    <p className="font-mono text-green-300/80 break-all bg-green-950/30 rounded-lg px-2.5 py-2 border border-green-500/20">{finalSeed}</p>
                  </div>
                )}
                <p className="text-white/30 leading-relaxed">
                  Each flip = HMAC-SHA256(serverSeed, clientSeed:nonce:flip:i). Verify the hash matches after the game ends.
                </p>
              </div>
            )}
          </div>

          {/* View all games */}
          <Link
            href="/casino"
            className="w-full flex items-center justify-between rounded-2xl px-4 py-3.5 text-sm font-black text-white/85 hover:text-white transition group"
            style={{ background: "linear-gradient(135deg,#151028,#0e0a1d)", border: "1.5px solid rgba(140,110,255,0.22)" }}
          >
            <span className="flex items-center gap-2.5"><History size={16} className="text-white/50" /> VIEW ALL GAMES</span>
            <ChevronRight size={16} className="text-white/40 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {/* ── Game arena ── */}
        <div className="flex-1 relative md:rounded-2xl overflow-hidden flex flex-col min-h-[520px] md:min-h-0 border-b border-white/10 md:border md:border-white/8"
          style={{ background: "radial-gradient(ellipse 100% 80% at 50% 30%, #1b1230 0%, #0d081a 60%, #080510 100%)" }}>

          {/* ambience: gold core + purple right, like the design */}
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 46% 52% at 46% 46%, rgba(255,160,40,0.22) 0%, transparent 70%)" }} />
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 44% 64% at 88% 55%, rgba(140,80,255,0.25) 0%, transparent 70%)" }} />
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 30% 42% at 8% 60%, rgba(243,180,49,0.10) 0%, transparent 70%)" }} />

          {/* ghost coins flanking the stage */}
          <div className="absolute left-[-60px] md:left-[1%] top-[46%] -translate-y-1/2 w-[230px] h-[230px] md:w-[300px] md:h-[300px] opacity-[0.16] pointer-events-none hidden sm:block" style={{ filter: "saturate(0.7)" }}>
            <HeadsFace />
          </div>
          <div className="absolute right-[-60px] md:right-[1%] top-[46%] -translate-y-1/2 w-[230px] h-[230px] md:w-[300px] md:h-[300px] opacity-[0.22] pointer-events-none hidden sm:block" style={{ filter: "saturate(0.85)" }}>
            <TailsFace />
          </div>

          {/* floating coins */}
          {FLOATERS.map((f, i) => <FloatCoin key={i} {...f} />)}

          {/* sparkles */}
          {[["16%", "22%"], ["64%", "12%"], ["90%", "20%"], ["6%", "74%"], ["82%", "78%"]].map(([l, t], i) => (
            <motion.span key={i} className="absolute text-white/60 pointer-events-none text-xs"
              style={{ left: l, top: t }}
              animate={{ opacity: [0.15, 0.8, 0.15], scale: [0.8, 1.15, 0.8] }}
              transition={{ duration: 2.6 + i * 0.5, repeat: Infinity, delay: i * 0.4 }}>✦</motion.span>
          ))}

          {/* desktop title + sound */}
          <div className="hidden md:flex items-center justify-between px-5 pt-4 relative z-10">
            <h1 className="font-black text-lg tracking-wide flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full inline-block border border-[#8a6508] overflow-hidden relative" style={{ background: "radial-gradient(circle at 35% 30%, #fff6cf, #e3a818)" }}>
                <img src="/logo.png" alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
              </span>
              COINFLIP
            </h1>
            <button onClick={() => setSoundOn(v => !v)} className="text-white/40 hover:text-white transition" title="Sound">
              {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
          </div>

          {/* Multiplier ladder */}
          <div className="relative z-10 px-3 md:px-5 pt-3">
            <div className="flex gap-1.5 md:gap-2 overflow-x-auto pb-1 md:justify-center [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {ladder.map((m, i) => {
                const color = LADDER_COLORS[i] ?? "#3b82f6";
                const reached = streak >= i + 1;
                const isNext  = streak === i && inGame;
                return (
                  <div key={i}
                    className={`shrink-0 px-2.5 md:px-3 py-1.5 rounded-lg text-[11px] md:text-xs font-black border-[1.5px] transition-all ${isNext ? "animate-pulse" : ""}`}
                    style={reached
                      ? { background: "rgba(34,197,94,0.15)", borderColor: "rgba(74,222,128,0.7)", color: "#86efac" }
                      : { background: isNext ? `${color}26` : "rgba(255,255,255,0.03)", borderColor: isNext ? color : `${color}55`, color: isNext ? color : `${color}cc`, boxShadow: isNext ? `0 0 12px ${color}55` : "none" }}>
                    {m}×
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stage */}
          <div className="flex-1 flex flex-col items-center justify-center relative z-10 py-4">
            <div className="relative flex flex-col items-center">
              <div className="relative z-10"><Coin rotation={rotation} flipping={flipping} /></div>
              <Podium />
            </div>

            {/* floating win text */}
            <AnimatePresence>
              {lastWin !== null && phase === "choice" && (
                <motion.div
                  key={`win-${streak}`}
                  initial={{ opacity: 0, y: 10, scale: 0.8 }}
                  animate={{ opacity: 1, y: -16, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute top-[10%] text-2xl md:text-3xl font-black text-green-400 drop-shadow-[0_0_12px_rgba(74,222,128,0.5)]"
                >
                  +{inr(lastWin)} · {multiplier}×
                </motion.div>
              )}
            </AnimatePresence>

            {/* Session flip chips */}
            {flips.length > 0 && (
              <div className="flex gap-1.5 flex-wrap justify-center px-4 mt-3">
                {flips.map((f, i) => (
                  <div key={i}
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black border-2 ${
                      f.won ? "border-green-400/70" : "border-red-400/70"}`}
                    style={{
                      background: f.result === "HEADS"
                        ? "radial-gradient(circle at 35% 30%, #fff6cf, #e3a818)"
                        : "radial-gradient(circle at 35% 30%, #c9aaff, #5b34b8)",
                      color: f.result === "HEADS" ? "#5c4100" : "#f0e6ff",
                    }}>
                    {f.result === "HEADS" ? "H" : "T"}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom info bar */}
          <div className="relative z-10 mx-3 md:mx-10 mb-3 md:mb-5 rounded-2xl px-4 py-3.5 md:px-6 md:py-4"
            style={{ background: "rgba(12,8,22,0.78)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(10px)" }}>
            <p className="text-center text-sm md:text-[15px] text-white/70 font-semibold min-h-[20px]">
              {phase === "flipping" ? <span className="text-yellow-300/90 animate-pulse">Flipping…</span>
                : phase === "choice" ? <>
                    <span className="text-green-400 font-black">{inr(payout)}</span> locked — flip again for{" "}
                    <span className="text-yellow-300 font-black">{inr(nextWin)}</span> or cash out
                  </>
                : <>Pick a side, set your bet &amp; flip — each win pays <b className="text-white">{stepMult}×</b></>}
            </p>
            <div className="flex justify-center gap-2 md:gap-3 mt-3 flex-wrap">
              {[
                { icon: Zap,         color: "#22c55e", title: "FAST & FAIR", sub: "Instant results" },
                { icon: ShieldCheck, color: "#3b82f6", title: "SECURE",      sub: "Provably Fair" },
                { icon: Trophy,      color: "#a855f7", title: "BEST ODDS",   sub: "High Payouts" },
              ].map(({ icon: Icon, color, title, sub }) => (
                <div key={title} className="flex items-center gap-2.5 rounded-xl px-3.5 py-2 md:px-4 md:py-2.5"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <span className="w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${color}1c`, border: `1px solid ${color}45` }}>
                    <Icon size={15} style={{ color }} />
                  </span>
                  <span className="text-left">
                    <span className="block text-[11px] md:text-xs font-black text-white leading-tight">{title}</span>
                    <span className="block text-[10px] md:text-[11px] text-white/40 leading-tight">{sub}</span>
                  </span>
                </div>
              ))}
            </div>
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
                    className="px-7 py-2.5 rounded-xl font-black text-sm transition active:scale-95 text-white"
                    style={{ background: "linear-gradient(180deg,#ffc63a,#ff7a00)", textShadow: "0 1px 3px rgba(120,50,0,0.5)" }}>
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
                    className="px-7 py-2.5 rounded-xl font-black text-sm transition active:scale-95 text-white"
                    style={{ background: "linear-gradient(180deg,#ffc63a,#ff7a00)", textShadow: "0 1px 3px rgba(120,50,0,0.5)" }}>
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
