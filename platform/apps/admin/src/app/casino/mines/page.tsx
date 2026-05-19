"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { cn } from "@/lib/cn";

export default function MinesAdminPage() {
  const { data: history, isLoading } = useSWR("/mines/history", fetcher);

  if (isLoading) return <div className="p-6 text-white">Loading Mines history...</div>;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-4xl tracking-wide text-white">Mines Game Dashboard</h1>
        <p className="text-white/60 text-sm mt-1">Manage and view recent mines sessions</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass rounded-lg p-6">
          <p className="text-[10px] uppercase tracking-wider text-white/50 font-semibold">Total Games Played (Recent)</p>
          <p className="font-display text-2xl mt-1 text-white tabular-nums">{history?.length || 0}</p>
        </div>
      </div>

      <div className="glass rounded-lg p-6">
        <h2 className="font-display text-xl mb-4 text-white">Recent Mines Sessions</h2>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-line/60 text-white/60">
                <Th>User</Th>
                <Th>Bet Amount</Th>
                <Th>Mines</Th>
                <Th>Status</Th>
                <Th>Multiplier</Th>
                <Th>Payout</Th>
                <Th>Date</Th>
              </tr>
            </thead>
            <tbody>
              {history?.map((session: any) => (
                <tr key={session.id} className="border-b border-line/40 hover:bg-panel2/20 transition">
                  <Td className="text-white font-medium">{session.user?.username || session.userId}</Td>
                  <Td className="text-white tabular-nums">{formatCurrency(session.betAmount)}</Td>
                  <Td className="text-gray-300 tabular-nums">{session.minesCount}</Td>
                  <Td>
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded font-semibold",
                      session.status === "CASHED_OUT" ? "bg-ok/15 text-ok" : "bg-bad/15 text-bad"
                    )}>
                      {session.status}
                    </span>
                  </Td>
                  <Td className="text-white tabular-nums">{Number(session.multiplier).toFixed(2)}x</Td>
                  <Td className={cn("tabular-nums font-semibold", session.payout > 0 ? "text-ok" : "text-bad")}>
                    {formatCurrency(session.payout)}
                  </Td>
                  <Td className="text-gray-400 text-sm">{formatDate(session.createdAt)}</Td>
                </tr>
              ))}
              {!history?.length && (
                <tr>
                  <td colSpan={7} className="text-center text-gray-500 py-6">No recent mines games found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-left font-semibold">{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 text-left", className)}>{children}</td>;
}
