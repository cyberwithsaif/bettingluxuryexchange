"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import useSWR from "swr";
import { useAuthStore } from "@/lib/stores/auth";
import { getSocket } from "@/lib/socket";
import { showToast } from "@/lib/toast";

interface Round {
  id: string;
  resultDice: number;
  createdAt: string;
}

interface GameState {
  roundActive: boolean;
  currentRound?: Round;
}

export default function DicePage() {
  const { user } = useAuthStore();
  const socket = useRef(getSocket());
  const [gameState, setGameState] = useState<GameState>({ roundActive: false });
  const [betAmount, setBetAmount] = useState(100);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [result, setResult] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [wager, setWager] = useState<{ id: string; result: string; multiplier: number } | null>(null);

  const { data: history } = useSWR(
    `/api/casino/dice/history`,
    (url: string) => fetch(url).then(r => r.ok ? r.json() : [])
  );

  useEffect(() => {
    const s = socket.current;
    if (!s) return;

    s.on("dice:round:start", (data: GameState) => {
      setGameState(data);
      setResult(null);
      setWager(null);
    });

    s.on("dice:round:end", (data: { round: Round }) => {
      setIsRolling(false);
      setResult(data.round.resultDice);

      if (selectedNumber === data.round.resultDice) {
        const multiplier = 5;
        setWager({
          id: data.round.id,
          result: "WIN",
          multiplier,
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
      s.off("dice:round:start");
      s.off("dice:round:end");
    };
  }, [selectedNumber]);

  const placeBet = useCallback(async () => {
    if (!selectedNumber || !user) {
      showToast("Select a number to bet on", "error");
      return;
    }

    setIsRolling(true);
    try {
      await fetch("/api/casino/dice/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prediction: selectedNumber,
          amount: betAmount,
        }),
      });
    } catch (err) {
      showToast("Bet failed", "error");
      setIsRolling(false);
    }
  }, [selectedNumber, betAmount, user]);

  return (
    <>
      <div className="md:hidden flex items-center gap-2 px-4 py-3 bg-[#0F1923] border-b border-white/10 sticky top-0 z-10">
        <Link href="/" className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm font-semibold transition">
          <ArrowLeft size={16} /> Back
        </Link>
        <span className="text-white font-bold text-sm">Dice</span>
      </div>

      <div className="min-h-screen bg-gradient-to-b from-[#0f111a] via-[#0f111a] to-[#0a0c14] text-white">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Game */}
            <div className="lg:col-span-2">
              <div className="rounded-2xl border border-orange-900/40 bg-gradient-to-br from-orange-950/20 via-[#1a0c08] to-[#0f0603] p-8">
                <h2 className="text-3xl font-black uppercase tracking-tight mb-2">Dice Roll</h2>
                <p className="text-white/50 text-sm mb-8">Pick a number from 1–6, and watch the dice land!</p>

                {/* Dice Display */}
                <div className="flex justify-center mb-8">
                  <motion.div
                    animate={{ rotateX: isRolling ? 360 : 0, rotateY: isRolling ? 360 : 0 }}
                    transition={{ duration: isRolling ? 0.5 : 0 }}
                    className="w-24 h-24 bg-gradient-to-br from-white to-gray-200 rounded-2xl flex items-center justify-center shadow-2xl"
                  >
                    <span className="text-6xl font-black text-black">{result || "?"}</span>
                  </motion.div>
                </div>

                {/* Number Selection */}
                <div className="grid grid-cols-6 gap-3 mb-8">
                  {[1, 2, 3, 4, 5, 6].map((num) => (
                    <button
                      key={num}
                      onClick={() => setSelectedNumber(num)}
                      disabled={isRolling}
                      className={`py-4 rounded-xl font-bold text-lg transition-all ${
                        selectedNumber === num
                          ? "bg-orange-600 text-white ring-2 ring-orange-400"
                          : "bg-white/10 text-white/70 hover:bg-white/20"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {num}
                    </button>
                  ))}
                </div>

                {/* Bet Amount */}
                <div className="mb-6">
                  <label className="block text-xs uppercase tracking-widest text-white/50 mb-3">Bet Amount (₹)</label>
                  <input
                    type="number"
                    value={betAmount}
                    onChange={(e) => setBetAmount(Math.max(10, parseInt(e.target.value) || 10))}
                    disabled={isRolling}
                    className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-orange-500"
                  />
                </div>

                {/* Bet Button */}
                <button
                  onClick={placeBet}
                  disabled={!selectedNumber || isRolling}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-orange-600 to-orange-700 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed font-bold uppercase tracking-widest transition-all text-white"
                >
                  {isRolling ? "Rolling..." : "Roll Dice"}
                </button>

                {/* Result */}
                <AnimatePresence>
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
                    <p>5×</p>
                  </div>
                  <div>
                    <p className="font-semibold text-white/80">Odds</p>
                    <p>1 in 6</p>
                  </div>
                  <div>
                    <p className="font-semibold text-white/80">Min Bet</p>
                    <p>₹10</p>
                  </div>
                </div>
              </div>

              {/* Recent Rolls */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 max-h-96 overflow-y-auto">
                <h3 className="text-sm uppercase font-bold tracking-wider text-white/70 mb-4">Recent Rolls</h3>
                <div className="space-y-2">
                  {history && history.slice(0, 10).map((roll: Round) => (
                    <div key={roll.id} className="flex justify-between items-center p-2 rounded-lg bg-white/5">
                      <span className="text-sm text-white/60">{new Date(roll.createdAt).toLocaleTimeString()}</span>
                      <span className="font-bold text-white">{roll.resultDice}</span>
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
