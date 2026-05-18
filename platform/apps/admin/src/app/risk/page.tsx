"use client";
import useSWR from "swr";

export default function RiskPage() {
  const { data } = useSWR("/admin/risk?limit=50");
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl">Live Risk</h1>
      <p className="text-sm text-white/60">Top users by current exposure. Refresh updates from real-time wallet stream.</p>
      <div className="rounded-xl border border-line bg-panel/60 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-panel text-[10px] uppercase tracking-wider text-white/50">
            <tr><Th>User</Th><Th>Role</Th><Th>Balance</Th><Th>Exposure</Th><Th>Available</Th></tr>
          </thead>
          <tbody>
            {(data ?? []).map((w: any) => (
              <tr key={w.id} className="border-t border-line/60">
                <Td className="font-semibold">{w.user.username}</Td>
                <Td className="text-xs">{w.user.role}</Td>
                <Td className="tabular-nums">{Number(w.balance).toLocaleString("en-IN")}</Td>
                <Td className="tabular-nums text-bad">{Number(w.exposure).toLocaleString("en-IN")}</Td>
                <Td className="tabular-nums">{(Number(w.balance) - Number(w.exposure)).toLocaleString("en-IN")}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function Th({ children }: { children: React.ReactNode }) { return <th className="px-3 py-2 text-left">{children}</th>; }
function Td({ children, className }: { children: React.ReactNode; className?: string }) { return <td className={`px-3 py-2 ${className ?? ""}`}>{children}</td>; }
