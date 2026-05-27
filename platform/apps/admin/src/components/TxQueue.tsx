"use client";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";

export function TxQueue({ kind, title }: { kind: "DEPOSIT" | "WITHDRAWAL"; title: string }) {
  const url = `/admin/transactions?kind=${kind}`;
  const { data } = useSWR(url);

  async function approve(id: string) {
    await api.post(`/admin/transactions/${id}/approve`);
    mutate(url);
  }
  async function reject(id: string) {
    const reason = prompt("Rejection reason (optional)") ?? "";
    await api.post(`/admin/transactions/${id}/reject`, { reason });
    mutate(url);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black text-gray-100">{title}</h1>
      <div className="rounded-xl border border-yellow-500/20 bg-gray-800 overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/80 border-b border-yellow-500/20 text-[10px] uppercase tracking-wider text-gray-500">
            <tr>
              <Th>Date</Th><Th>User</Th><Th>Method</Th><Th>Amount</Th><Th>Reference</Th><Th>Status</Th><Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((t: any) => (
              <tr key={t.id} className="border-t border-gray-700 hover:bg-gray-800/30 transition">
                <Td className="whitespace-nowrap text-gray-500">{new Date(t.createdAt).toLocaleString("en-IN", { hour12: false })}</Td>
                <Td className="font-semibold text-gray-200">{t.user.username}</Td>
                <Td className="text-xs text-gray-400">{t.method}</Td>
                <Td className="tabular-nums text-gray-200 font-semibold">₹{Number(t.amount).toLocaleString("en-IN")}</Td>
                <Td className="text-xs text-gray-500">{t.reference ?? "–"}</Td>
                <Td>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${
                    t.status === "PENDING"   ? "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" :
                    t.status === "COMPLETED" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" :
                                               "bg-red-500/15 text-red-300 border-red-500/30"
                  }`}>{t.status}</span>
                </Td>
                <Td className="flex gap-1">
                  {t.status === "PENDING" && (
                    <>
                      <button onClick={() => approve(t.id)} className="text-xs px-2 py-1 rounded-lg border border-emerald-500/30 text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 font-medium transition">Approve</button>
                      <button onClick={() => reject(t.id)} className="text-xs px-2 py-1 rounded-lg border border-red-500/30 text-red-400 bg-red-900/20 hover:bg-red-500/20 font-medium transition">Reject</button>
                    </>
                  )}
                </Td>
              </tr>
            ))}
            {(!data || data.length === 0) && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-gray-500">No pending {kind.toLowerCase()}s</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-3 text-left">{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 ${className ?? ""}`}>{children}</td>;
}
