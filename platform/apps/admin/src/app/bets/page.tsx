"use client";
import useSWR, { mutate as globalMutate } from "swr";
import { useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

type BetStatus = "OPEN" | "MATCHED" | "SETTLED_WON" | "SETTLED_LOST" | "VOID" | "CANCELLED";

interface Bet {
  id: string;
  side: "BACK" | "LAY";
  odds: number;
  stake: string;
  potentialProfit: string;
  status: BetStatus;
  createdAt: string;
  user: { id: string; username: string; role: string };
  market: { id: string; name: string; type: string };
  runner: { id: string; name: string };
}

const STATUS_STYLE: Record<BetStatus, string> = {
  OPEN:         "bg-blue-500/15    text-blue-300    border-blue-500/30",
  MATCHED:      "bg-blue-500/15    text-blue-300    border-blue-500/30",
  SETTLED_WON:  "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  SETTLED_LOST: "bg-red-500/15     text-red-300     border-red-500/30",
  VOID:         "bg-yellow-500/15  text-yellow-300  border-yellow-500/30",
  CANCELLED:    "bg-gray-700/40    text-gray-400    border-gray-600/50",
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
  const [q, setQ]         = useState("");
  const [status, setStatus] = useState<string>("");
  const [skip, setSkip]   = useState(0);

  const swrKey = buildKey(q, status, skip);
  const { data: bets, isLoading } = useSWR<Bet[]>(swrKey);

  const handleAction = async (betId: string, action: "void" | "cancel") => {
    if (!confirm(`${action === "void" ? "Void" : "Cancel"} bet ${betId.slice(0, 8)}?`)) return;
    try {
      await api.patch(`/admin/bets/${betId}`, { action });
      globalMutate(swrKey);
    } catch {
      alert("Action failed – ensure the endpoint is available.");
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black text-gray-100">All Bets</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setSkip(0); }}
          placeholder="Search username…"
          className="border border-yellow-200 bg-gray-800 rounded-lg px-3 py-2 text-sm w-56 text-gray-200 placeholder-gray-400 focus:outline-none focus:border-yellow-400 shadow-sm"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setSkip(0); }}
          className="border border-yellow-200 bg-gray-800 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-yellow-400 shadow-sm"
        >
          <option value="">All statuses</option>
          {[
            { v: "OPEN",         label: "Open" },
            { v: "SETTLED_WON",  label: "Won" },
            { v: "SETTLED_LOST", label: "Lost" },
            { v: "VOID",         label: "Void" },
            { v: "CANCELLED",    label: "Cancelled" },
          ].map(({ v, label }) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-yellow-500/20 bg-gray-800 overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-800/80 border-b border-yellow-500/20">
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
                <td colSpan={11} className="text-center py-8 text-gray-500">Loading bets…</td>
              </tr>
            )}
            {!isLoading && (!bets || bets.length === 0) && (
              <tr>
                <td colSpan={11} className="text-center py-12 text-gray-500">
                  <p className="font-medium">No bets found.</p>
                  <p className="text-xs mt-1 text-gray-400">Try clearing the filters or check a different status.</p>
                </td>
              </tr>
            )}
            {(bets ?? []).map((bet) => (
              <tr key={bet.id} className="border-t border-gray-700 hover:bg-gray-800/30 transition">
                <Td className="font-mono text-xs text-gray-500">{bet.id.slice(0, 8)}</Td>
                <Td className="font-semibold text-gray-200">{bet.user.username}</Td>
                <Td className="text-xs text-gray-400 max-w-[140px] truncate">{bet.market.name}</Td>
                <Td className="text-gray-400">{bet.runner.name}</Td>
                <Td>
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-black border",
                    bet.side === "BACK"
                      ? "bg-blue-900/20 text-blue-300 border-blue-200"
                      : "bg-orange-900/30 text-orange-400 border-orange-700")}>
                    {bet.side}
                  </span>
                </Td>
                <Td className="tabular-nums text-gray-300 font-semibold">{Number(bet.odds).toFixed(2)}</Td>
                <Td className="tabular-nums text-gray-200 font-semibold">₹{Number(bet.stake).toLocaleString("en-IN")}</Td>
                <Td className={cn("tabular-nums font-semibold", Number(bet.potentialProfit) >= 0 ? "text-emerald-400" : "text-red-500")}>
                  ₹{Number(bet.potentialProfit).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </Td>
                <Td>
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border", STATUS_STYLE[bet.status as BetStatus] ?? "")}>
                    {bet.status}
                  </span>
                </Td>
                <Td className="text-xs text-gray-500">
                  {new Date(bet.createdAt).toLocaleString("en-IN", { hour12: false, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </Td>
                <Td>
                  {bet.status === "OPEN" && (
                    <div className="flex gap-1">
                      <button onClick={() => handleAction(bet.id, "void")}
                        className="text-xs px-2 py-1 rounded-lg border border-yellow-500/30 text-yellow-300 bg-gray-800 hover:bg-yellow-500/20 font-medium transition">
                        Void
                      </button>
                      <button onClick={() => handleAction(bet.id, "cancel")}
                        className="text-xs px-2 py-1 rounded-lg border border-red-500/30 text-red-400 bg-red-900/20 hover:bg-red-500/20 font-medium transition">
                        Cancel
                      </button>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
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
