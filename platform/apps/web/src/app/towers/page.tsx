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
  resultTowers: number[];
  createdAt: string;
}

interface GameState {
  roundActive: boolean;
  currentRound?: Round;
}

export default function TowersPage() {
  const { user } = useAuthStore();
  const socket = useRef(getSocket());
  const [gameState, setGameState] = useState<GameState>({ roundActive: false });
  const [betAmount, setBetAmount] = useState(100);
  const [selectedPath, setSelectedPath] = useState<number[]>([]);
  const [result, setResult] = useState<number[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [wager, setWager] = useState<{ id: string; result: string; multiplier: number; level: number } | null>(null);
  const LEVELS = 8;
  const TOWERS = 3;

  const { data: history } = useSWR(
    `/api/casino/towers/history`,
    (url: string) => fetch(url).then(r => r.ok ? r.json() : [])
  );

  useEffect(() => {
    const s = socket.current;
    if (!s) return;

    s.on("towers:round:start", (data: GameState) => {
      setGameState(data);
      setResult([]);
      setWager(null);
      setSelectedPath([]);
    });

    s.on("towers:round:end", (data: { round: Round; playerPath: number[]; survived: number }) => {
      setIsPlaying(false);
      setResult(data.round.resultTowers);

      if (data.playerPath.length > 0) {
        const multiplier = Math.pow(1.5, data.survived);
        setWager({
          id: data.round.id,
          result: data.survived === LEVELS ? "WIN" : "LOSS",
          multiplier,
          level: data.survived,
        });
      }
    });

    return () => {
      s.off("towers:round:start");
      s.off("towers:round:end");
    };
  }, []);

  const selectCell = useCallback((row: number, tower: number) => {
    if (selectedPath.includes(row) || isPlaying) return;
    setSelectedPath([...selectedPath, tower]);
  }, [selectedPath, isPlaying]);

  const startGame = useCallback(async () => {
    if (!user) {
      showToast("Login required", "error");
      return;
    }

    setIsPlaying(true);
    try {
      await fetch("/api/casino/towers/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: betAmount,
        }),
      });
    } catch (err) {
      showToast("Game failed", "error");
      setIsPlaying(false);
    }
  }, [betAmount, user]);

  const cashOut = useCallback(async () => {
    try {
      await fetch("/api/casino/towers/cashout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      showToast("Cash out failed", "error");
    }
  }, []);

  return (
    <>
      <div className="md:hidden flex items-center gap-2 px-4 py-3 bg-[#0F1923] border-b border-white/10 sticky top-0 z-10">
        <Link href="/" className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm font-semibold transition">
          <ArrowLeft size={16} /> Back
        </Link>
        <span className="text-white font-bold text-sm">Towers</span>
      </div>

      <div className="min-h-screen bg-gradient-to-b from-[#0f111a] via-[#0f111a] to-[#0a0c14] text-white">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Game */}
            <div className="lg:col-span-2">
              <div className="rounded-2xl border border-purple-900/40 bg-gradient-to-br from-purple-950/20 via-[#1a0c20] to-[#0f0603] p-8">
                <h2 className="text-3xl font-black uppercase tracking-tight mb-2">Towers</h2>
                <p className="text-white/50 text-sm mb-8">Navigate through 3 towers, avoiding bombs. Each level doubles your payout!</p>

                {/* Tower Grid */}
                <div className="flex justify-center gap-6 mb-8">
                  {Array.from({ length: TOWERS }).map((_, towerIdx) => (
                    <div key={towerIdx} className="flex flex-col gap-2">
                      {Array.from({ length: LEVELS }).map((_, levelIdx) => {
                        const isBomb = result[levelIdx] === towerIdx;
                        const isSelected = selectedPath.includes(towerIdx) && selectedPath.length === levelIdx + 1;

                        return (
                          <motion.button
                            key={`${towerIdx}-${levelIdx}`}
                            onClick={() => selectCell(levelIdx, towerIdx)}
                            disabled={isPlaying || selectedPath.length !== levelIdx}
                            whileHover={!isPlaying && selectedPath.length === levelIdx ? { scale: 1.05 } : {}}
                            className={`w-16 h-16 rounded-lg font-bold text-lg transition-all ${
                              isBomb
                                ? "bg-red-600 text-white"
                                : isSelected
                                ? "bg-green-600 text-white"
                                : "bg-white/10 text-white/70 hover:bg-white/20"
                            } disabled:opacity-50`}
                          >
                            {isBomb && "💣"}
                            {isSelected && "✓"}
                          </motion.button>
                        );
                      })}
                    </div>
                  ))}
                </div>

                {/* Bet Amount */}
                <div className="mb-6">
                  <label className="block text-xs uppercase tracking-widest text-white/50 mb-3">Bet Amount (₹)</label>
                  <input
                    type="number"
                    value={betAmount}
                    onChange={(e) => setBetAmount(Math.max(10, parseInt(e.target.value) || 10))}
                    disabled={isPlaying}
                    className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-purple-500"
                  />
                </div>

                {/* Control Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={startGame}
                    disabled={isPlaying}
                    className="flex-1 py-4 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed font-bold uppercase tracking-widest transition-all text-white"
                  >
                    {isPlaying && selectedPath.length > 0 ? "Playing..." : "Start Game"}
                  </button>
                  <button
                    onClick={cashOut}
                    disabled={!isPlaying || selectedPath.length === 0}
                    className="flex-1 py-4 rounded-xl bg-gradient-to-r from-yellow-600 to-yellow-700 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed font-bold uppercase tracking-widest transition-all text-white"
                  >
                    Cash Out
                  </button>
                </div>

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
                      {wager.result === "WIN" ? `🎉 Level ${wager.level}! ${wager.multiplier.toFixed(1)}× Payout` : "💣 Hit a Bomb! Game Over"}
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
                    <p>256×</p>
                  </div>
                  <div>
                    <p className="font-semibold text-white/80">Levels</p>
                    <p>{LEVELS}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-white/80">Min Bet</p>
                    <p>₹10</p>
                  </div>
                </div>
              </div>

              {/* Recent Games */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 max-h-96 overflow-y-auto">
                <h3 className="text-sm uppercase font-bold tracking-wider text-white/70 mb-4">Recent Games</h3>
                <div className="space-y-2">
                  {history && history.slice(0, 10).map((game: Round) => (
                    <div key={game.id} className="flex justify-between items-center p-2 rounded-lg bg-white/5">
                      <span className="text-sm text-white/60">{new Date(game.createdAt).toLocaleTimeString()}</span>
                      <span className="font-bold text-white">Level {game.resultTowers.length}</span>
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
