"use client";
import useSWR from "swr";
import { useState } from "react";
import { cn } from "@/lib/cn";

interface CasinoBet {
  id: string;
  game: "mines" | "plinko" | "pump" | "dice" | "roulette";
  user: { id: string; username: string };
  betAmount: number;
  payout: number;
  profit: number;
  status: "WON" | "LOST";
  extra: string;
  createdAt: string;
}

const GAME_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  mines:    { label: "Mines",    emoji: "💣", color: "bg-red-500/15    text-red-300    border-red-500/30" },
  plinko:   { label: "Plinko",   emoji: "🎯", color: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  pump:     { label: "Pump",     emoji: "🎈", color: "bg-pink-500/15   text-pink-300   border-pink-500/30" },
  dice:     { label: "Dice",     emoji: "🎲", color: "bg-blue-500/15   text-blue-300   border-blue-500/30" },
  roulette: { label: "Roulette", emoji: "🎡", color: "bg-amber-500/15  text-amber-300  border-amber-500/30" },
};

function buildKey(q: string, game: string, skip: number) {
  const p = new URLSearchParams();
  if (q) p.set("username", q);
  if (game) p.set("game", game);
  p.set("limit", "50");
  p.set("skip", String(skip));
  return `/admin/casino-bets?${p.toString()}`;
}

export default function AdminCasinoBetsPage() {
  const [q, setQ]       = useState("");
  const [game, setGame] = useState("");
  const [skip, setSkip] = useState(0);

  const swrKey = buildKey(q, game, skip);
  const { data: bets, isLoading } = useSWR<CasinoBet[]>(swrKey);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black text-gray-100">All Casino Bets</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setSkip(0); }}
          placeholder="Search username…"
          className="border border-yellow-200 bg-gray-800 rounded-lg px-3 py-2 text-sm w-56 text-gray-200 placeholder-gray-400 focus:outline-none focus:border-yellow-400 shadow-sm"
        />
        <select
          value={game}
          onChange={(e) => { setGame(e.target.value); setSkip(0); }}
          className="border border-yellow-200 bg-gray-800 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-yellow-400 shadow-sm"
        >
          <option value="">All games</option>
          {Object.entries(GAME_LABELS).map(([v, { label, emoji }]) => (
            <option key={v} value={v}>{emoji} {label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-yellow-500/20 bg-gray-800 overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-800/80 border-b border-yellow-500/20">
              <Th>ID</Th>
              <Th>Game</Th>
              <Th>User</Th>
              <Th>Bet</Th>
              <Th>Payout</Th>
              <Th>Profit / Loss</Th>
              <Th>Details</Th>
              <Th>Result</Th>
              <Th>Time</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={9} className="text-center py-8 text-gray-500">Loading…</td>
              </tr>
            )}
            {!isLoading && (!bets || bets.length === 0) && (
              <tr>
                <td colSpan={9} className="text-center py-12 text-gray-500">
                  <p className="font-medium">No casino bets found.</p>
                  <p className="text-xs mt-1 text-gray-400">Try clearing the filters or selecting a different game.</p>
                </td>
              </tr>
            )}
            {(bets ?? []).map((bet) => {
              const g = GAME_LABELS[bet.game];
              return (
                <tr key={bet.id} className="border-t border-gray-700 hover:bg-gray-800/30 transition">
                  <Td className="font-mono text-xs text-gray-500">{bet.id.slice(0, 8)}</Td>
                  <Td>
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border", g?.color ?? "")}>
                      {g?.emoji} {g?.label ?? bet.game}
                    </span>
                  </Td>
                  <Td className="font-semibold text-gray-200">{bet.user.username}</Td>
                  <Td className="tabular-nums text-gray-300 font-semibold">₹{Number(bet.betAmount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</Td>
                  <Td className="tabular-nums text-gray-300">₹{Number(bet.payout).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</Td>
                  <Td className={cn("tabular-nums font-semibold", bet.profit >= 0 ? "text-emerald-400" : "text-red-500")}>
                    {bet.profit >= 0 ? "+" : ""}₹{Number(bet.profit).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </Td>
                  <Td className="text-xs text-gray-500 max-w-[100px] truncate">{bet.extra}</Td>
                  <Td>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-bold border",
                      bet.status === "WON"
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                        : "bg-red-500/15 text-red-300 border-red-500/30",
                    )}>
                      {bet.status}
                    </span>
                  </Td>
                  <Td className="text-xs text-gray-500">
                    {new Date(bet.createdAt).toLocaleString("en-IN", { hour12: false, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex gap-2 items-center">
        <button
          disabled={skip === 0}
          onClick={() => setSkip(Math.max(0, skip - 50))}
          className="px-4 py-2 rounded-lg border border-yellow-200 text-sm text-gray-400 font-medium disabled:opacity-40 hover:border-yellow-400 hover:bg-gray-800 transition"
        >← Prev</button>
        <span className="text-sm text-gray-500">Showing {skip + 1}–{skip + (bets?.length ?? 0)}</span>
        <button
          disabled={(bets?.length ?? 0) < 50}
          onClick={() => setSkip(skip + 50)}
          className="px-4 py-2 rounded-lg border border-yellow-200 text-sm text-gray-400 font-medium disabled:opacity-40 hover:border-yellow-400 hover:bg-gray-800 transition"
        >Next →</button>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 ${className ?? ""}`}>{children}</td>;
}
