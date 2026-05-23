"use client";
import useSWR from "swr";

export default function LogsPage() {
  const { data, isLoading } = useSWR("/admin/logs?limit=200");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-gray-900">Audit Logs</h1>
        <p className="text-sm text-gray-500 mt-0.5">Admin actions and system events</p>
      </div>
      <div className="rounded-xl border border-yellow-100 bg-white overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-yellow-50/80 border-b border-yellow-100">
            <tr>
              <Th>Date</Th><Th>Actor</Th><Th>Action</Th><Th>Target</Th><Th>IP</Th><Th>Metadata</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-500">Loading logsâ€¦</td>
              </tr>
            )}
            {!isLoading && (!data || (data as any[]).length === 0) && (
              <tr>
                <td colSpan={6} className="text-center py-12 text-gray-500">
                  <p className="font-medium">No audit logs found.</p>
                  <p className="text-xs mt-1 text-gray-400">Admin actions will appear here.</p>
                </td>
              </tr>
            )}
            {(data as any[] ?? []).map((l: any) => (
              <tr key={l.id} className="border-t border-gray-100 hover:bg-yellow-50/30 transition align-top">
                <Td className="whitespace-nowrap text-gray-500">{new Date(l.createdAt).toLocaleString("en-IN", { hour12: false })}</Td>
                <Td className="font-semibold text-gray-800">
                  {l.actor?.username ?? "â€”"}
                  <span className="text-xs text-gray-500 ml-1">{l.actor?.role}</span>
                </Td>
                <Td className="text-xs">
                  <code className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-mono">{l.action}</code>
                </Td>
                <Td className="text-xs text-gray-600">{l.targetType}:{l.targetId?.slice(0, 8)}</Td>
                <Td className="text-xs text-gray-500">{l.ip ?? "â€”"}</Td>
                <Td className="text-xs text-gray-500 max-w-[26rem] truncate">{l.metadata ? JSON.stringify(l.metadata) : "â€”"}</Td>
              </tr>
            ))}
          </tbody>
        </table>
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
