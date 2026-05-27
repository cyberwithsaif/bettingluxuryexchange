"use client";
import useSWR from "swr";
import { PageHeader, StatCard, Badge, DataTable, Column } from "@/components/ui";
import { Wallet, CreditCard, TrendingUp, TrendingDown, Clock } from "lucide-react";

const inr = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dt = (s: string) => new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const kindLabel = (k: string) => (k === "COMMISSION_PAYOUT" ? "ADMIN COMMISSION" : k.replace(/_/g, " "));
const kindTone = (k: string) =>
  k === "BOOKIE_RECHARGE" ? "sky" : k === "USER_TO_BOOKIE" ? "emerald" : k === "BOOKIE_TO_USER" ? "amber" : k === "COMMISSION_PAYOUT" ? "red" : "violet";

export default function WalletPage() {
  const { data, isLoading } = useSWR<any>("/bookie/wallet");

  const columns: Column<any>[] = [
    { key: "createdAt", header: "Time", sortValue: (l) => l.createdAt, render: (l) => <span className="text-xs text-gray-500">{dt(l.createdAt)}</span> },
    { key: "kind", header: "Type", render: (l) => <Badge tone={kindTone(l.kind)}>{kindLabel(l.kind)}</Badge> },
    { key: "amount", header: "Amount", align: "right", sortValue: (l) => Number(l.amount),
      render: (l) => <span className={`tabular-nums font-semibold ${Number(l.amount) >= 0 ? "text-emerald-300" : "text-red-400"}`}>{Number(l.amount) >= 0 ? "+" : ""}{inr(Number(l.amount))}</span> },
    { key: "balanceAfter", header: "Balance After", align: "right", render: (l) => <span className="tabular-nums text-gray-300">{inr(Number(l.balanceAfter))}</span> },
    { key: "note", header: "Note", render: (l) => <span className="text-xs text-gray-500">{l.note ?? "—"}</span> },
  ];

  return (
    <div>
      <PageHeader title="Wallet" subtitle="Your float, credit and complete ledger." />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <StatCard label="Balance" value={inr(data?.balance ?? 0)} Icon={Wallet} accent="emerald" loading={isLoading} />
        <StatCard label="Available" value={inr(data?.available ?? 0)} sub={`incl. credit ${inr(data?.creditLimit ?? 0)}`} Icon={CreditCard} accent="sky" loading={isLoading} />
        <StatCard label="Total Added" value={inr(data?.totalAdded ?? 0)} Icon={TrendingUp} accent="emerald" loading={isLoading} />
        <StatCard label="Total Deducted" value={inr(data?.totalDeducted ?? 0)} Icon={TrendingDown} accent="red" loading={isLoading} />
        <StatCard label="Pending Withdrawals" value={data?.pendingWithdrawals ?? 0} Icon={Clock} accent="amber" loading={isLoading} />
      </div>

      <DataTable columns={columns} rows={data?.ledger ?? []} loading={isLoading} rowKey={(l) => l.id} exportName="wallet-ledger" emptyText="No wallet movements yet." />
    </div>
  );
}
