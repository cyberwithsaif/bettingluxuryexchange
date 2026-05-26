"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import useSWR from "swr";
import { useAuthStore } from "@/lib/stores/auth";
import { getSocket } from "@/lib/socket";

interface Round {
  id: string;
  resultCoin: "HEADS" | "TAILS";
  createdAt: string;
}

interface GameState {
  roundActive: boolean;
  currentRound?: Round;
}

export default function CoinflipPage() {
  const { user } = useAuthStore();
  const socket = useRef(getSocket());
  const [gameState, setGameState] = useState<GameState>({ roundActive: false });
  const [betAmount, setBetAmount] = useState(100);
  const [selectedSide, setSelectedSide] = useState<"HEADS" | "TAILS" | null>(null);
  const [result, setResult] = useState<"HEADS" | "TAILS" | null>(null);
  const [isFlipping, setIsFlipping] = useState(false);
  const [wager, setWager] = useState<{ id: string; result: string; multiplier: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data: history } = useSWR(
    `/api/casino/coinflip/history`,
    (url: string) => fetch(url).then(r => r.ok ? r.json() : [])
  );

  useEffect(() => {
    const s = socket.current;
    if (!s) return;

    s.on("coinflip:round:start", (data: GameState) => {
      setGameState(data);
      setResult(null);
      setWager(null);
    });

    s.on("coinflip:round:end", (data: { round: Round }) => {
      setIsFlipping(false);
      setResult(data.round.resultCoin);

      if (selectedSide === data.round.resultCoin) {
        setWager({
          id: data.round.id,
          result: "WIN",
          multiplier: 1.98,
        });
      } else {
        setWager({
          id: data.round.id,
          result: "LOSS",
          multiplier: 0,
        });
      }
    });

    return () => {
      s.off("coinflip:round:start");
      s.off("coinflip:round:end");
    };
  }, [selectedSide]);

  const placeBet = useCallback(async () => {
    if (!selectedSide || !user) {
      setError("Select Heads or Tails");
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = setTimeout(() => setError(null), 3000);
      return;
    }

    setIsFlipping(true);
    try {
      await fetch("/api/casino/coinflip/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prediction: selectedSide,
          amount: betAmount,
        }),
      });
    } catch (err) {
      setError("Bet failed");
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = setTimeout(() => setError(null), 3000);
      setIsFlipping(false);
    }
  }, [selectedSide, betAmount, user]);

  return (
    <>
      <div className="md:hidden flex items-center justify-end gap-2 px-4 py-3 bg-[#0F1923] border-b border-white/10 sticky top-0 z-10">
        <Link href="/" className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm font-semibold transition">
          <ArrowLeft size={16} /> Back
        </Link>
      </div>

      <div className="min-h-screen bg-gradient-to-b from-[#0f111a] via-[#0f111a] to-[#0a0c14] text-white">
        <div className="max-w-6xl mx-auto px-3 md:px-4 py-4 md:py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8">
            {/* Main Game */}
            <div className="lg:col-span-2">
              <div className="rounded-2xl border border-blue-900/40 bg-gradient-to-br from-blue-950/20 via-[#0c1520] to-[#0f0603] p-4 md:p-8">
                <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight mb-2">Coinflip</h2>
                <p className="text-white/50 text-sm mb-6 md:mb-8">Pick Heads or Tails and watch the coin flip in real-time!</p>

                {/* Coin Display */}
                <div className="flex justify-center mb-8 md:mb-12">
                  <motion.div
                    animate={{ rotateY: isFlipping ? 1080 : 0 }}
                    transition={{ duration: isFlipping ? 1.5 : 0, ease: "easeOut" }}
                    className="w-32 h-32 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-600 flex items-center justify-center shadow-2xl border-4 border-yellow-400"
                    style={{ perspective: 1000 }}
                  >
                    <span className="text-5xl font-black" style={{ backfaceVisibility: "hidden" }}>
                      {result ? (result === "HEADS" ? "H" : "T") : "?"}
                    </span>
                  </motion.div>
                </div>

                {/* Selection Buttons */}
                <div className="grid grid-cols-2 gap-4 mb-8">
                  <button
                    onClick={() => setSelectedSide("HEADS")}
                    disabled={isFlipping}
                    className={`py-6 rounded-xl font-bold text-2xl transition-all ${
                      selectedSide === "HEADS"
                        ? "bg-blue-600 text-white ring-2 ring-blue-400"
                        : "bg-white/10 text-white/70 hover:bg-white/20"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    HEADS
                  </button>
                  <button
                    onClick={() => setSelectedSide("TAILS")}
                    disabled={isFlipping}
                    className={`py-6 rounded-xl font-bold text-2xl transition-all ${
                      selectedSide === "TAILS"
                        ? "bg-blue-600 text-white ring-2 ring-blue-400"
                        : "bg-white/10 text-white/70 hover:bg-white/20"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    TAILS
                  </button>
                </div>

                {/* Bet Amount */}
                <div className="mb-6">
                  <label className="block text-xs uppercase tracking-widest text-white/50 mb-3">Bet Amount (₹)</label>
                  <input
                    type="number"
                    value={betAmount}
                    onChange={(e) => setBetAmount(Math.max(10, parseInt(e.target.value) || 10))}
                    disabled={isFlipping}
                    className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Bet Button */}
                <button
                  onClick={placeBet}
                  disabled={!selectedSide || isFlipping}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed font-bold uppercase tracking-widest transition-all text-white"
                >
                  {isFlipping ? "Flipping..." : "Flip Coin"}
                </button>

                {/* Error/Result */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="mt-6 p-4 rounded-xl text-center font-bold bg-red-950/40 border border-red-600/40 text-red-300"
                    >
                      {error}
                    </motion.div>
                  )}
                  {wager && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className={`mt-6 p-4 rounded-xl text-center font-bold ${
                        wager.result === "WIN"
                          ? "bg-green-950/40 border border-green-600/40 text-green-300"
                          : "bg-red-950/40 border border-red-600/40 text-red-300"
                      }`}
                    >
                      {wager.result === "WIN" ? `🎉 You Won! ${wager.multiplier}× Payout` : "You Lost. Try Again!"}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Game Info */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h3 className="text-sm uppercase font-bold tracking-wider text-white/70 mb-4">Game Rules</h3>
                <div className="space-y-3 text-sm text-white/60">
                  <div>
                    <p className="font-semibold text-white/80">Max Payout</p>
                    <p>1.98×</p>
                  </div>
                  <div>
                    <p className="font-semibold text-white/80">House Edge</p>
                    <p>~1%</p>
                  </div>
                  <div>
                    <p className="font-semibold text-white/80">Min Bet</p>
                    <p>₹10</p>
                  </div>
                </div>
              </div>

              {/* Recent Flips */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 max-h-96 overflow-y-auto">
                <h3 className="text-sm uppercase font-bold tracking-wider text-white/70 mb-4">Recent Flips</h3>
                <div className="space-y-2">
                  {history && history.slice(0, 10).map((flip: Round) => (
                    <div key={flip.id} className="flex justify-between items-center p-2 rounded-lg bg-white/5">
                      <span className="text-sm text-white/60">{new Date(flip.createdAt).toLocaleTimeString()}</span>
                      <span className={`font-bold ${flip.resultCoin === "HEADS" ? "text-blue-300" : "text-purple-300"}`}>
                        {flip.resultCoin}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
