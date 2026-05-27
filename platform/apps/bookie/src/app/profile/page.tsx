"use client";
import useSWR from "swr";
import { PageHeader, GlassCard, Badge, StatCard } from "@/components/ui";
import { Wallet, CreditCard, Percent, Users } from "lucide-react";

const inr = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const statusTone = (s: string) => (s === "ACTIVE" ? "emerald" : s === "SUSPENDED" ? "amber" : "red");

export default function ProfilePage() {
  const { data, isLoading } = useSWR<any>("/bookie/profile");

  const rows: [string, React.ReactNode][] = [
    ["Full Name", data?.fullName || "—"],
    ["Username", data ? `@${data.username}` : "—"],
    ["Email", data?.email || "—"],
    ["Phone", data?.phone || "—"],
    ["Status", data ? <Badge tone={statusTone(data.status)}>{data.status}</Badge> : "—"],
    ["Member Since", data ? new Date(data.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : "—"],
  ];

  return (
    <div>
      <PageHeader title="Profile" subtitle="Your account, commission and credit terms." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Wallet Balance" value={inr(data?.wallet?.balance ?? 0)} Icon={Wallet} accent="emerald" loading={isLoading} />
        <StatCard label="Credit Limit" value={inr(data?.creditLimit ?? 0)} sub={`Used ${inr(data?.creditUsed ?? 0)}`} Icon={CreditCard} accent="amber" loading={isLoading} />
        <StatCard label="Admin Commission" value={`${data?.commissionPct ?? 0}%`} sub="of your profit" Icon={Percent} accent="violet" loading={isLoading} />
        <StatCard label="Total Users" value={data?.totalUsers ?? 0} Icon={Users} accent="sky" loading={isLoading} />
      </div>

      <GlassCard className="p-6 max-w-2xl">
        <h3 className="font-black text-gray-100 mb-4">Account Details</h3>
        <dl className="divide-y divide-gray-800">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-3">
              <dt className="text-sm text-gray-500">{k}</dt>
              <dd className="text-sm font-semibold text-gray-200">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[11px] text-gray-500 mt-4">Commission and credit limit are set by your admin. Contact them for changes.</p>
      </GlassCard>
    </div>
  );
}
