"use client";
import useSWR from "swr";
import { useState } from "react";
import { cn } from "@/lib/cn";

const tabs = ["OPEN", "SETTLED_WON", "SETTLED_LOST", "VOID", "CANCELLED"] as const;

export default function BetsPage() {
  const [tab, setTab] = useState<typeof tabs[number]>("OPEN");
  const { data: bets } = useSWR(`/bets/mine?status=${tab}`);

  return (
    <div className="space-y-3">
      <h1 className="font-display text-3xl">My Bets</h1>
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn(
            "px-3 py-1.5 rounded-md text-xs font-semibold uppercase",
            tab === t ? "bg-accent-grad text-ink" : "bg-panel2 text-white/70 hover:text-white",
          )}>{t.replace("_", " ")}</button>
        ))}
      </div>
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-panel/40 text-[10px] uppercase tracking-wider text-white/40">
            <tr>
              <Th>Date</Th><Th>Match</Th><Th>Runner</Th><Th>Side</Th><Th>Odds</Th><Th>Stake</Th><Th>Liability</Th><Th>P/L</Th><Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {(bets ?? []).map((b: any) => (
              <tr key={b.id} className="border-t border-line/30">
                <Td>{new Date(b.createdAt).toLocaleString("en-IN", { hour12: false })}</Td>
                <Td className="font-semibold">{b.market.match.name}</Td>
                <Td>{b.runner.name}</Td>
                <Td className={b.side === "BACK" ? "text-back" : "text-lay"}>{b.side}</Td>
                <Td className="tabular-nums">{Number(b.odds).toFixed(2)}</Td>
                <Td className="tabular-nums">{Number(b.stake).toLocaleString("en-IN")}</Td>
                <Td className="tabular-nums">{Number(b.liability).toLocaleString("en-IN")}</Td>
                <Td className={"tabular-nums " + (b.status === "SETTLED_WON" ? "text-ok" : b.status === "SETTLED_LOST" ? "text-bad" : "")}>
                  {b.status === "SETTLED_WON" ? "+" + Number(b.potentialProfit).toLocaleString("en-IN")
                   : b.status === "SETTLED_LOST" ? "-" + Number(b.liability).toLocaleString("en-IN")
                   : "—"}
                </Td>
                <Td className="text-xs">{b.status}</Td>
              </tr>
            ))}
            {(!bets || bets.length === 0) && <tr><td colSpan={9} className="text-center py-8 text-white/50">No bets</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) { return <th className="px-3 py-2 text-left">{children}</th>; }
function Td({ children, className }: { children: React.ReactNode; className?: string }) { return <td className={`px-3 py-2 ${className ?? ""}`}>{children}</td>; }
