"use client";
import useSWR, { mutate as globalMutate } from "swr";
import { useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

type BetStatus = "OPEN" | "WON" | "LOST" | "VOID" | "CANCELLED";

interface Bet {
  id: string;
  side: "BACK" | "LAY";
  odds: number;
  stake: string;
  potentialPnl: string;
  status: BetStatus;
  createdAt: string;
  user: { id: string; username: string; role: string };
  market: { id: string; name: string; type: string };
  runner: { id: string; name: string };
}

const STATUS_COLORS: Record<BetStatus, string> = {
  OPEN:      "bg-blue-500/15 text-blue-300 border-blue-500/30",
  WON:       "bg-ok/15 text-ok border-ok/30",
  LOST:      "bg-bad/15 text-bad border-bad/30",
  VOID:      "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  CANCELLED: "bg-white/10 text-white/50 border-white/20",
};

function buildKey(q: string, status: string, skip: number) {
  const params = new URLSearchParams();
  if (q) params.set("username", q);
  if (status) params.set("status", status);
  params.set("limit", "50");
  params.set("skip", String(skip));
  return `/admin/bets?${params.toString()}`;
}

export default function AdminBetsPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const [skip, setSkip] = useState(0);

  const swrKey = buildKey(q, status, skip);
  const { data: bets, isLoading } = useSWR<Bet[]>(swrKey);

  const handleAction = async (betId: string, action: "void" | "cancel") => {
    if (!confirm(`${action === "void" ? "Void" : "Cancel"} bet ${betId.slice(0, 8)}?`)) return;
    try {
      // endpoint placeholder — extend admin controller to support void/cancel as needed
      await api.patch(`/admin/bets/${betId}`, { action });
      globalMutate(swrKey);
    } catch {
      alert("Action failed — ensure the endpoint is available.");
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl">All Bets</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setSkip(0); }}
          placeholder="Search username…"
          className="bg-panel border border-line rounded-md px-3 py-2 text-sm w-56 focus:outline-none focus:border-accent"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setSkip(0); }}
          className="bg-panel border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
        >
          <option value="">All statuses</option>
          {["OPEN", "WON", "LOST", "VOID", "CANCELLED"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-line bg-panel/60 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-panel text-[10px] uppercase tracking-wider text-white/50">
            <tr>
              <Th>Bet ID</Th>
              <Th>User</Th>
              <Th>Market</Th>
              <Th>Runner</Th>
              <Th>Side</Th>
              <Th>Odds</Th>
              <Th>Stake</Th>
              <Th>P/L</Th>
              <Th>Status</Th>
              <Th>Time</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={11} className="text-center py-8 text-white/50">Loading…</td>
              </tr>
            )}
            {!isLoading && (!bets || bets.length === 0) && (
              <tr>
                <td colSpan={11} className="text-center py-8 text-white/50">No bets found.</td>
              </tr>
            )}
            {(bets ?? []).map((bet) => (
              <tr key={bet.id} className="border-t border-line/60 hover:bg-panel2/20 transition">
                <Td className="font-mono text-xs">{bet.id.slice(0, 8)}</Td>
                <Td className="font-semibold">{bet.user.username}</Td>
                <Td className="text-xs text-white/70">{bet.market.name}</Td>
                <Td>{bet.runner.name}</Td>
                <Td>
                  <span className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-bold border",
                    bet.side === "BACK" ? "bg-back/15 text-back border-back/30" : "bg-lay/15 text-lay border-lay/30",
                  )}>
                    {bet.side}
                  </span>
                </Td>
                <Td className="tabular-nums">{Number(bet.odds).toFixed(2)}</Td>
                <Td className="tabular-nums">₹{Number(bet.stake).toLocaleString("en-IN")}</Td>
                <Td className={cn("tabular-nums", Number(bet.potentialPnl) >= 0 ? "text-ok" : "text-bad")}>
                  ₹{Number(bet.potentialPnl).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </Td>
                <Td>
                  <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold border", STATUS_COLORS[bet.status as BetStatus] ?? "")}>
                    {bet.status}
                  </span>
                </Td>
                <Td className="text-xs text-white/50">
                  {new Date(bet.createdAt).toLocaleString("en-IN", { hour12: false, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </Td>
                <Td>
                  {bet.status === "OPEN" && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleAction(bet.id, "void")}
                        className="text-xs px-2 py-1 rounded border border-line hover:border-yellow-400 hover:text-yellow-400 transition"
                      >Void</button>
                      <button
                        onClick={() => handleAction(bet.id, "cancel")}
                        className="text-xs px-2 py-1 rounded border border-line hover:border-bad hover:text-bad transition"
                      >Cancel</button>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex gap-2">
        <button
          disabled={skip === 0}
          onClick={() => setSkip(Math.max(0, skip - 50))}
          className="px-4 py-2 rounded border border-line text-sm disabled:opacity-40 hover:border-accent"
        >← Prev</button>
        <button
          disabled={(bets?.length ?? 0) < 50}
          onClick={() => setSkip(skip + 50)}
          className="px-4 py-2 rounded border border-line text-sm disabled:opacity-40 hover:border-accent"
        >Next →</button>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left">{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 ${className ?? ""}`}>{children}</td>;
}
