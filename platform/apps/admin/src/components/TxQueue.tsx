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
      <h1 className="font-display text-4xl">{title}</h1>
      <div className="rounded-xl border border-line bg-panel/60 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-panel text-[10px] uppercase tracking-wider text-white/50">
            <tr>
              <Th>Date</Th><Th>User</Th><Th>Method</Th><Th>Amount</Th><Th>Reference</Th><Th>Status</Th><Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((t: any) => (
              <tr key={t.id} className="border-t border-line/60">
                <Td className="whitespace-nowrap">{new Date(t.createdAt).toLocaleString("en-IN", { hour12: false })}</Td>
                <Td className="font-semibold">{t.user.username}</Td>
                <Td className="text-xs">{t.method}</Td>
                <Td className="tabular-nums">{Number(t.amount).toLocaleString("en-IN")}</Td>
                <Td className="text-xs text-white/60">{t.reference ?? "—"}</Td>
                <Td><span className={"text-xs px-2 py-0.5 rounded " +
                  (t.status === "PENDING" ? "bg-accent/15 text-accentSoft" :
                   t.status === "COMPLETED" ? "bg-ok/15 text-ok" : "bg-bad/15 text-bad")}>{t.status}</span></Td>
                <Td className="flex gap-1">
                  {t.status === "PENDING" && (
                    <>
                      <button onClick={() => approve(t.id)} className="text-xs px-2 py-1 rounded bg-ok/15 text-ok hover:bg-ok/25">Approve</button>
                      <button onClick={() => reject(t.id)} className="text-xs px-2 py-1 rounded bg-bad/15 text-bad hover:bg-bad/25">Reject</button>
                    </>
                  )}
                </Td>
              </tr>
            ))}
            {(!data || data.length === 0) && <tr><td colSpan={7} className="text-center py-10 text-white/50">No pending {kind.toLowerCase()}s</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function Th({ children }: { children: React.ReactNode }) { return <th className="px-3 py-2 text-left">{children}</th>; }
function Td({ children, className }: { children: React.ReactNode; className?: string }) { return <td className={`px-3 py-2 ${className ?? ""}`}>{children}</td>; }
