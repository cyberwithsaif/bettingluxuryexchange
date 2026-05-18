"use client";
import useSWR from "swr";
import { cn } from "@/lib/cn";

export default function StatementPage() {
  const { data } = useSWR("/wallet/ledger?limit=100");
  return (
    <div className="space-y-3">
      <h1 className="font-display text-3xl">Account statement</h1>
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-panel/40 text-[10px] uppercase tracking-wider text-white/40">
            <tr><Th>Date</Th><Th>Kind</Th><Th>Amount</Th><Th>Exposure Δ</Th><Th>Balance</Th><Th>Exposure</Th><Th>Note</Th></tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((e: any) => (
              <tr key={e.id} className="border-t border-line/30">
                <Td>{new Date(e.createdAt).toLocaleString("en-IN", { hour12: false })}</Td>
                <Td className="text-xs">{e.kind}</Td>
                <Td className={cn("tabular-nums", Number(e.amount) > 0 ? "text-ok" : Number(e.amount) < 0 ? "text-bad" : "")}>
                  {Number(e.amount).toLocaleString("en-IN")}
                </Td>
                <Td className="tabular-nums">{Number(e.exposureDelta).toLocaleString("en-IN")}</Td>
                <Td className="tabular-nums">{Number(e.balanceAfter).toLocaleString("en-IN")}</Td>
                <Td className="tabular-nums">{Number(e.exposureAfter).toLocaleString("en-IN")}</Td>
                <Td className="text-white/60">{e.note ?? "—"}</Td>
              </tr>
            ))}
            {(!data?.items?.length) && <tr><td colSpan={7} className="text-center py-8 text-white/50">No entries</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function Th({ children }: { children: React.ReactNode }) { return <th className="px-3 py-2 text-left">{children}</th>; }
function Td({ children, className }: { children: React.ReactNode; className?: string }) { return <td className={`px-3 py-2 ${className ?? ""}`}>{children}</td>; }
