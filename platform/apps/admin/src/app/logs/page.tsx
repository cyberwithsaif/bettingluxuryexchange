"use client";
import useSWR from "swr";

export default function LogsPage() {
  const { data } = useSWR("/admin/logs?limit=200");
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl">Audit logs</h1>
      <div className="rounded-xl border border-line bg-panel/60 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-panel text-[10px] uppercase tracking-wider text-white/50">
            <tr><Th>Date</Th><Th>Actor</Th><Th>Action</Th><Th>Target</Th><Th>IP</Th><Th>Metadata</Th></tr>
          </thead>
          <tbody>
            {(data ?? []).map((l: any) => (
              <tr key={l.id} className="border-t border-line/60 align-top">
                <Td className="whitespace-nowrap">{new Date(l.createdAt).toLocaleString("en-IN", { hour12: false })}</Td>
                <Td className="font-semibold">{l.actor?.username ?? "—"} <span className="text-xs text-white/40">{l.actor?.role}</span></Td>
                <Td className="text-xs"><code>{l.action}</code></Td>
                <Td className="text-xs">{l.targetType}:{l.targetId?.slice(0, 8)}</Td>
                <Td className="text-xs text-white/50">{l.ip ?? "—"}</Td>
                <Td className="text-xs text-white/60 max-w-[26rem] truncate">{l.metadata ? JSON.stringify(l.metadata) : "—"}</Td>
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
