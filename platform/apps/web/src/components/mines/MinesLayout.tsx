"use client";

import React, { useState, useEffect, useRef } from "react";
import { getSocket, reauthSocket } from "@/lib/socket";
import { useAuthStore } from "@/lib/stores/auth";
import useSWR from "swr";
import MinesControls from "./MinesControls";
import MinesGrid from "./MinesGrid";
import ProvablyFairModal from "./ProvablyFairModal";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, ArrowLeft, AlertTriangle } from "lucide-react";
import Link from "next/link";

export type MinesStatus = "IDLE" | "IN_PROGRESS" | "CASHED_OUT" | "BUSTED";

export interface MinesState {
  id?: string;
  betAmount: number;
  minesCount: number;
  status: MinesStatus;
  multiplier: number;
  clickedTiles: { tile: number; isMine: boolean; multiplier?: number }[];
  minePositions?: number[];
  clientSeed: string;
  serverSeedHash?: string;
  serverSeed?: string;
  payout?: number;
}

export default function MinesLayout() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const { data: walletData, mutate: mutateWallet } = useSWR<{ available: number }>(user ? "/wallet/summary" : null);
  const { data: platformCfg } = useSWR<{ minesMinBet?: number; minesMaxBet?: number }>("/api/platform/settings",
    (url: string) => fetch(url).then(r => r.ok ? r.json() : {}),
    { revalidateOnFocus: false }
  );
  const minBet = platformCfg?.minesMinBet ?? 10;
  const maxBet = platformCfg?.minesMaxBet ?? 100000;
  const [liveBalance, setLiveBalance] = useState<number | null>(null);

  const [gameState, setGameState] = useState<MinesState>({
    betAmount: 10,
    minesCount: 3,
    status: "IDLE",
    multiplier: 1.0,
    clickedTiles: [],
    clientSeed: Math.random().toString(36).substring(2, 15),
  });

  // Sync default bet amount to minBet when config loads
  useEffect(() => {
    if (!platformCfg) return;
    setGameState(prev => {
      if (prev.status !== "IDLE") return prev;
      return { ...prev, betAmount: Math.max(prev.betAmount, minBet) };
    });
  }, [minBet, platformCfg]);

  const [loading, setLoading] = useState(false);
  const [showFairModal, setShowFairModal] = useState(false);
  const [resultPopup, setResultPopup] = useState<{ win: boolean; amount: number; multiplier: number } | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showError = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setErrorToast(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setErrorToast(null);
    }, 4500);
  };

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Restore an in-progress game on re-entry (instead of starting a new one and
  // orphaning the old session + its stake).
  useEffect(() => {
    if (!user) return;
    fetch("/api/mines/active", { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} })
      .then(r => (r.ok ? r.json() : null))
      .then(s => {
        if (!s) return;
        setGameState({
          id: s.id,
          betAmount: s.betAmount,
          minesCount: s.minesCount,
          clientSeed: s.clientSeed,
          serverSeedHash: s.serverSeedHash,
          status: "IN_PROGRESS",
          multiplier: s.multiplier,
          clickedTiles: s.clickedTiles ?? [],
        });
      })
      .catch(() => {});
  }, [user, accessToken]);

  useEffect(() => {
    const s = getSocket();

    const onStartResp = (resp: any) => {
      setLoading(false);
      if (!resp.ok) {
        showError(resp.message || "Failed to start");
        return;
      }
      setGameState({
        id: resp.session.id,
        betAmount: resp.session.betAmount,
        minesCount: resp.session.minesCount,
        clientSeed: resp.session.clientSeed,
        serverSeedHash: resp.session.serverSeedHash,
        status: "IN_PROGRESS",
        multiplier: 1.0,
        clickedTiles: [],
      });
      setResultPopup(null);
      mutateWallet();
    };

    const onClickResp = (resp: any) => {
      if (!resp.ok) {
        showError(resp.message || "Failed to click");
        return;
      }
      const data = resp.result;
      if (data.isMine) {
        // Busted
        setGameState((prev) => ({
          ...prev,
          status: "BUSTED",
          minePositions: data.minePositions,
          serverSeed: data.serverSeed,
          clickedTiles: [...prev.clickedTiles, { tile: data.tileIndex || 0, isMine: true }], // tileIndex might be missing in busted response if we didn't pass it back
        }));
        setResultPopup({ win: false, amount: 0, multiplier: 0 });
        playSound("bomb");
      } else {
        // Safe
        setGameState((prev) => {
          // If auto-cashed out (hit all safe tiles)
          if (data.status === "CASHED_OUT") {
            setResultPopup({ win: true, amount: data.payout, multiplier: data.multiplier });
            mutateWallet();
            playSound("win");
            return {
              ...prev,
              status: "CASHED_OUT",
              multiplier: data.multiplier,
              payout: data.payout,
              minePositions: data.minePositions,
              serverSeed: data.serverSeed,
              clickedTiles: [...prev.clickedTiles, { tile: data.tileIndex, isMine: false, multiplier: data.multiplier }]
            };
          }

          return {
            ...prev,
            multiplier: data.multiplier,
            clickedTiles: [...prev.clickedTiles, { tile: data.tileIndex, isMine: false, multiplier: data.multiplier }],
          };
        });
        if (data.status !== "CASHED_OUT") playSound("gem");
      }
    };

    const onCashoutResp = (resp: any) => {
      setLoading(false);
      if (!resp.ok) {
        showError(resp.message || "Cashout failed");
        return;
      }
      const data = resp.result;
      setGameState((prev) => ({
        ...prev,
        status: "CASHED_OUT",
        multiplier: data.multiplier,
        payout: data.payout,
        minePositions: data.minePositions,
        serverSeed: data.serverSeed,
      }));
      setResultPopup({ win: true, amount: data.payout, multiplier: data.multiplier });
      mutateWallet();
      playSound("cashout");
    };

    const onError = (data: any) => {
      setLoading(false);
      const msg: string = data?.message ?? "";
      if (msg.toLowerCase().includes("already clicked")) return;
      // Stale socket auth (e.g. after switching accounts) — reconnect silently.
      if (/unauthor|session expired/i.test(msg)) { reauthSocket(); return; }
      showError(msg);
    };

    const onException = (data: any) => {
      setLoading(false);
      const msg: string = data?.message || "An error occurred";
      // Transient socket auth hiccup (stale/expired token) — the socket layer
      // re-authenticates and reconnects on its own; don't toast or force logout.
      if (/unauthor|session expired|token|jwt/i.test(msg)) return;
      showError(msg);
    };

    const onBalanceUpdate = (data: { available: number }) => {
      setLiveBalance(data.available);
      mutateWallet();
    };

    s.on("mines:startResponse", onStartResp);
    s.on("mines:clickResponse", onClickResp);
    s.on("mines:cashoutResponse", onCashoutResp);
    s.on("mines:error", onError);
    s.on("exception", onException);
    s.on("wallet:balance", onBalanceUpdate);

    return () => {
      s.off("mines:startResponse", onStartResp);
      s.off("mines:clickResponse", onClickResp);
      s.off("mines:cashoutResponse", onCashoutResp);
      s.off("mines:error", onError);
      s.off("exception", onException);
      s.off("wallet:balance", onBalanceUpdate);
    };
  }, [mutateWallet]);

  const playSound = (type: "gem" | "bomb" | "win" | "cashout" | "bet") => {
    // Basic web audio api sounds
    try {
      if (type === "bet") {
        const audio = new Audio("/sounds/bet.mp3");
        audio.volume = 0.6;
        audio.play().catch(() => {});
        return;
      }

      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "gem") {
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start(); osc.stop(ctx.currentTime + 0.1);
      } else if (type === "bomb") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(100, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.5);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start(); osc.stop(ctx.currentTime + 0.5);
      } else if (type === "cashout" || type === "win") {
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start(); osc.stop(ctx.currentTime + 0.5);
      }
    } catch (e) { }
  };

  const handleBet = () => {
    if (!user) {
      window.location.href = "/auth/login";
      return;
    }
    const finalBet = Math.max(minBet, gameState.betAmount);
    setGameState(prev => ({ ...prev, betAmount: finalBet }));

    setLoading(true);
    playSound("bet");
    getSocket().emit("mines:start", {
      betAmount: finalBet,
      minesCount: gameState.minesCount,
      clientSeed: gameState.clientSeed,
    });
  };

  const handleCashout = () => {
    if (!gameState.id || gameState.status !== "IN_PROGRESS") return;
    setLoading(true);
    getSocket().emit("mines:cashout", { sessionId: gameState.id });
  };

  const handleTileClick = (index: number) => {
    if (gameState.status !== "IN_PROGRESS" || !gameState.id) return;
    if (gameState.clickedTiles.some((t) => t.tile === index)) return; // Already clicked

    getSocket().emit("mines:click", { sessionId: gameState.id, tileIndex: index });
  };

  const clickedSafeCount = gameState.clickedTiles.filter(t => !t.isMine).length;
  const totalSafeCount = 25 - gameState.minesCount;
  const profit = (gameState.multiplier - 1) * gameState.betAmount;

  return (
    <div className="min-h-screen bg-[#0F1923] text-white flex flex-col font-sans w-full">
      {/* Mobile-only back header */}
      <header className="md:hidden px-3 py-2 flex items-center justify-between gap-2 border-b border-gray-800 bg-[#0f212e] w-full shrink-0">
        <Link href="/" className="flex items-center gap-1.5 text-gray-400 hover:text-white transition font-bold text-sm">
          <ArrowLeft size={16} />
          Back
        </Link>
        <div className="font-bold tracking-widest text-xs text-green-400 uppercase">💣 Mines</div>
        <div className="bg-[#1a2c38] px-2 py-1 rounded-lg border border-gray-700 text-xs font-bold text-white">
          ₹{(liveBalance ?? (walletData ? Number(walletData.available) : null))?.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "0.00"}
        </div>
      </header>

      {/* Main Game Container — scrollable on mobile, centered on desktop */}
      <div className="flex-1 overflow-y-auto md:overflow-hidden md:flex md:items-center md:justify-center p-2 md:p-6 w-full max-w-6xl mx-auto">
        <div className="w-full flex flex-col-reverse md:flex-row bg-[#0f212e] rounded-xl overflow-hidden shadow-2xl border border-gray-800">
          {/* Controls — below grid on mobile, left sidebar on desktop */}
          <div className="w-full md:w-80 bg-[#213743] p-3 md:p-4 flex flex-col justify-between">
            <MinesControls
              isLoggedIn={!!user}
              gameState={gameState}
              setGameState={setGameState}
              handleBet={handleBet}
              handleCashout={handleCashout}
              loading={loading}
              minBet={minBet}
              maxBet={maxBet}
            />
            <div className="mt-3 md:mt-auto pt-3 md:pt-4 flex justify-between gap-2">
              <button
                className="flex-1 bg-gray-800 hover:bg-gray-700 p-2 rounded text-xs text-gray-400 flex items-center justify-center gap-2 transition"
                onClick={() => setShowFairModal(true)}
              >
                <ShieldCheck size={14} /> Fairness
              </button>
            </div>
          </div>

          {/* Grid area — top on mobile, right on desktop */}
          <div className="flex-1 bg-[#0f212e] p-3 md:p-6 relative flex flex-col items-center justify-center min-h-[300px]">
            {/* In-progress stats strip */}
            {gameState.status === "IN_PROGRESS" && (
              <div className="w-full flex flex-wrap justify-center gap-1.5 md:gap-3 mb-2 md:mb-0 md:absolute md:top-4 md:left-4 md:right-4 text-[10px] md:text-xs font-semibold pointer-events-none z-10">
                <div className="bg-[#1a2c38] px-2 md:px-3 py-1 md:py-1.5 rounded shadow text-green-400 border border-green-500/20">
                  {gameState.multiplier.toFixed(2)}×
                </div>
                <div className="bg-[#1a2c38] px-2 md:px-3 py-1 md:py-1.5 rounded shadow text-yellow-400 border border-yellow-500/20">
                  ₹{gameState.betAmount}
                </div>
                <div className="bg-[#1a2c38] px-2 md:px-3 py-1 md:py-1.5 rounded shadow text-white border border-gray-700">
                  💎 {clickedSafeCount}/{totalSafeCount}
                </div>
                <div className="bg-[#1a2c38] px-2 md:px-3 py-1 md:py-1.5 rounded shadow text-green-300 border border-gray-700">
                  +₹{profit.toFixed(2)}
                </div>
              </div>
            )}

            <div className={`w-full max-w-[480px] relative ${gameState.status === "IN_PROGRESS" ? "md:mt-10" : ""}`}>
              <MinesGrid gameState={gameState} onTileClick={handleTileClick} />

              {/* Result Overlay */}
              <AnimatePresence>
                {resultPopup && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    onClick={() => setResultPopup(null)}
                    className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-[3px] z-20 rounded-xl cursor-pointer select-none"
                  >
                    <div className={`w-56 md:w-64 text-center p-5 md:p-6 rounded-2xl shadow-2xl border-2 transition transform active:scale-95 ${
                      resultPopup.win
                        ? "bg-[#0f212e]/90 border-[#00e701] text-[#00e701] shadow-[0_0_20px_rgba(0,231,1,0.2)]"
                        : "bg-[#0f212e]/90 border-red-500 text-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]"
                    }`}>
                      <div className="text-lg md:text-xl font-bold uppercase tracking-wider mb-1">
                        {resultPopup.win ? `${resultPopup.multiplier.toFixed(2)}x Payout` : "Busted!"}
                      </div>
                      {resultPopup.win && (
                        <div className="text-2xl md:text-3xl font-black text-white mt-2">
                          ₹{resultPopup.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </div>
                      )}
                      <div className="text-[10px] text-gray-500 mt-3 md:mt-4 uppercase tracking-widest font-semibold">
                        Tap to Dismiss
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {showFairModal && <ProvablyFairModal gameState={gameState} onClose={() => setShowFairModal(false)} />}
        </div>
        {/* Spacer so content doesn't butt up against bottom on mobile */}
        <div className="h-4 md:hidden shrink-0" />
      </div>

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
