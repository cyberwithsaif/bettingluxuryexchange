"use client";
import useSWR from "swr";
import { PageHeader, Badge, DataTable, Column } from "@/components/ui";

const inr = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dt = (s: string) => new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const kindLabel = (k: string) => k.replace(/_/g, " ");
const kindTone = (k: string) => (k === "BOOKIE_RECHARGE" ? "sky" : k === "USER_TO_BOOKIE" ? "emerald" : "amber");

export default function TransactionsPage() {
  const { data, isLoading } = useSWR<any[]>("/bookie/transactions");

  const columns: Column<any>[] = [
    { key: "createdAt", header: "Time", sortValue: (t) => t.createdAt, render: (t) => <span className="text-xs text-gray-500">{dt(t.createdAt)}</span> },
    { key: "kind", header: "Type", render: (t) => <Badge tone={kindTone(t.kind)}>{kindLabel(t.kind)}</Badge> },
    { key: "amount", header: "Amount", align: "right", sortValue: (t) => Number(t.amount),
      render: (t) => <span className={`tabular-nums font-semibold ${Number(t.amount) >= 0 ? "text-emerald-300" : "text-red-400"}`}>{Number(t.amount) >= 0 ? "+" : ""}{inr(Number(t.amount))}</span> },
    { key: "balanceAfter", header: "Balance After", align: "right", render: (t) => <span className="tabular-nums text-gray-300">{inr(Number(t.balanceAfter))}</span> },
    { key: "note", header: "Note", render: (t) => <span className="text-xs text-gray-500">{t.note ?? "—"}</span> },
  ];

  return (
    <div>
      <PageHeader title="Transactions" subtitle="Every wallet movement: recharges, funding and reclaims." />
      <DataTable columns={columns} rows={data ?? []} loading={isLoading} rowKey={(t) => t.id} exportName="transactions" emptyText="No transactions yet." />
    </div>
  );
}
