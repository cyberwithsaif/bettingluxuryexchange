"use client";
import useSWR from "swr";

export default function RiskPage() {
  const { data, isLoading } = useSWR("/admin/risk?limit=50");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-gray-900">Live Risk</h1>
        <p className="text-sm text-gray-500 mt-0.5">Top users by current exposure. Auto-refreshes from real-time wallet stream.</p>
      </div>
      <div className="rounded-xl border border-yellow-100 bg-white overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-yellow-50/80 border-b border-yellow-100">
            <tr>
              <Th>User</Th><Th>Role</Th><Th>Balance</Th><Th>Exposure</Th><Th>Available</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-500">Loading risk dataâ€¦</td>
              </tr>
            )}
            {!isLoading && (!data || (data as any[]).length === 0) && (
              <tr>
                <td colSpan={5} className="text-center py-12 text-gray-500">
                  <p className="font-medium">No exposure data.</p>
                  <p className="text-xs mt-1 text-gray-400">Users with open bets will appear here.</p>
                </td>
              </tr>
            )}
            {(data as any[] ?? []).map((w: any) => (
              <tr key={w.id} className="border-t border-gray-100 hover:bg-yellow-50/30 transition">
                <Td className="font-semibold text-gray-800">{w.user.username}</Td>
                <Td className="text-xs">
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-semibold uppercase">
                    {w.user.role}
                  </span>
                </Td>
                <Td className="tabular-nums text-gray-700">â‚¹{Number(w.balance).toLocaleString("en-IN")}</Td>
                <Td className="tabular-nums text-red-600 font-semibold">â‚¹{Number(w.exposure).toLocaleString("en-IN")}</Td>
                <Td className="tabular-nums text-emerald-600 font-semibold">â‚¹{(Number(w.balance) - Number(w.exposure)).toLocaleString("en-IN")}</Td>
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
