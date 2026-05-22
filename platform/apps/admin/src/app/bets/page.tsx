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

const STATUS_STYLE: Record<BetStatus, string> = {
  OPEN:      "bg-blue-50   text-blue-700   border-blue-200",
  WON:       "bg-emerald-50 text-emerald-700 border-emerald-200",
  LOST:      "bg-red-50    text-red-600    border-red-200",
  VOID:      "bg-yellow-50 text-yellow-700 border-yellow-200",
  CANCELLED: "bg-gray-100  text-gray-500   border-gray-200",
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
      alert("Action failed — ensure the endpoint is available.");
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black text-gray-900">All Bets</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setSkip(0); }}
          placeholder="Search username…"
          className="border border-yellow-200 bg-white rounded-lg px-3 py-2 text-sm w-56 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-yellow-400 shadow-sm"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setSkip(0); }}
          className="border border-yellow-200 bg-white rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-yellow-400 shadow-sm"
        >
          <option value="">All statuses</option>
          {["OPEN", "WON", "LOST", "VOID", "CANCELLED"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-yellow-100 bg-white overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-yellow-50/80 border-b border-yellow-100">
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
                <td colSpan={11} className="text-center py-8 text-gray-400">Loading bets…</td>
              </tr>
            )}
            {!isLoading && (!bets || bets.length === 0) && (
              <tr>
                <td colSpan={11} className="text-center py-12 text-gray-400">
                  <p className="font-medium">No bets found.</p>
                  <p className="text-xs mt-1 text-gray-300">Try clearing the filters or check a different status.</p>
                </td>
              </tr>
            )}
            {(bets ?? []).map((bet) => (
              <tr key={bet.id} className="border-t border-gray-100 hover:bg-yellow-50/30 transition">
                <Td className="font-mono text-xs text-gray-500">{bet.id.slice(0, 8)}</Td>
                <Td className="font-semibold text-gray-800">{bet.user.username}</Td>
                <Td className="text-xs text-gray-600 max-w-[140px] truncate">{bet.market.name}</Td>
                <Td className="text-gray-600">{bet.runner.name}</Td>
                <Td>
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-black border",
                    bet.side === "BACK"
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "bg-orange-50 text-orange-600 border-orange-200")}>
                    {bet.side}
                  </span>
                </Td>
                <Td className="tabular-nums text-gray-700 font-semibold">{Number(bet.odds).toFixed(2)}</Td>
                <Td className="tabular-nums text-gray-800 font-semibold">₹{Number(bet.stake).toLocaleString("en-IN")}</Td>
                <Td className={cn("tabular-nums font-semibold", Number(bet.potentialPnl) >= 0 ? "text-emerald-600" : "text-red-500")}>
                  ₹{Number(bet.potentialPnl).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </Td>
                <Td>
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border", STATUS_STYLE[bet.status as BetStatus] ?? "")}>
                    {bet.status}
                  </span>
                </Td>
                <Td className="text-xs text-gray-400">
                  {new Date(bet.createdAt).toLocaleString("en-IN", { hour12: false, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </Td>
                <Td>
                  {bet.status === "OPEN" && (
                    <div className="flex gap-1">
                      <button onClick={() => handleAction(bet.id, "void")}
                        className="text-xs px-2 py-1 rounded-lg border border-yellow-200 text-yellow-700 bg-yellow-50 hover:bg-yellow-100 font-medium transition">
                        Void
                      </button>
                      <button onClick={() => handleAction(bet.id, "cancel")}
                        className="text-xs px-2 py-1 rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 font-medium transition">
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
          className="px-4 py-2 rounded-lg border border-yellow-200 text-sm text-gray-600 font-medium disabled:opacity-40 hover:border-yellow-400 hover:bg-yellow-50 transition"
        >← Prev</button>
        <span className="text-sm text-gray-400">Showing {skip + 1}–{skip + (bets?.length ?? 0)}</span>
        <button
          disabled={(bets?.length ?? 0) < 50}
          onClick={() => setSkip(skip + 50)}
          className="px-4 py-2 rounded-lg border border-yellow-200 text-sm text-gray-600 font-medium disabled:opacity-40 hover:border-yellow-400 hover:bg-yellow-50 transition"
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
