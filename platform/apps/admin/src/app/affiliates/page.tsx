"use client";
import { useLiveData } from "@/lib/hooks";
import { PageHeader, GlassCard, StatCard, Badge, DataTable, type Column } from "@/components/ui";
import { Share2, Users, Wallet } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface AffiliateRow {
  id: string; username: string; role: string;
  referrals: number; partnershipBps: number; commissionEarned: number; createdAt: string;
}
interface AffiliateData {
  summary: { affiliates: number; totalReferrals: number; totalCommission: number };
  rows: AffiliateRow[];
}

const inr = (n: number) => `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n)}`;
const ROLE_TONE: Record<string, string> = {
  SUPER_ADMIN: "red", ADMIN: "amber", SUPER_MASTER: "violet", MASTER: "sky", AGENT: "emerald", USER: "slate",
};

export default function AffiliatesPage() {
  const { data, isLoading } = useLiveData<AffiliateData>("/admin/affiliates?limit=300", 30000);

  const topByCommission = (data?.rows ?? [])
    .filter((r) => r.commissionEarned > 0)
    .slice(0, 8)
    .map((r) => ({ name: r.username, value: r.commissionEarned }));

  const columns: Column<AffiliateRow>[] = [
    { key: "username", header: "Affiliate", sortValue: (r) => r.username, render: (r) => <span className="font-medium text-gray-200">{r.username}</span> },
    { key: "role", header: "Role", sortValue: (r) => r.role, render: (r) => <Badge tone={ROLE_TONE[r.role] ?? "slate"}>{r.role.replace("_", " ")}</Badge> },
    { key: "referrals", header: "Referrals", align: "right", sortValue: (r) => r.referrals, exportValue: (r) => r.referrals, render: (r) => <span className="tabular-nums font-bold text-sky-300">{r.referrals}</span> },
    { key: "partnershipBps", header: "Partnership", align: "right", sortValue: (r) => r.partnershipBps, exportValue: (r) => r.partnershipBps, render: (r) => <span className="tabular-nums text-gray-300">{(r.partnershipBps / 100).toFixed(2)}%</span> },
    { key: "commissionEarned", header: "Commission", align: "right", sortValue: (r) => r.commissionEarned, exportValue: (r) => r.commissionEarned, render: (r) => <span className="tabular-nums font-bold text-emerald-300">{inr(r.commissionEarned)}</span> },
    { key: "createdAt", header: "Joined", sortValue: (r) => r.createdAt, render: (r) => <span className="text-gray-500 text-xs whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString("en-IN")}</span> },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title="Affiliates & Referrals" subtitle="Agent hierarchy, downline referrals and commission earnings" />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Total Affiliates"  value={String(data?.summary.affiliates ?? 0)}    Icon={Share2} accent="violet"  loading={isLoading} />
        <StatCard label="Total Referrals"   value={String(data?.summary.totalReferrals ?? 0)} Icon={Users}  accent="sky"     loading={isLoading} />
        <StatCard label="Commission Paid"   value={inr(data?.summary.totalCommission ?? 0)}  Icon={Wallet} accent="emerald" loading={isLoading} />
      </div>

      {/* Top affiliates by commission */}
      <GlassCard className="p-5">
        <h2 className="font-black text-gray-100 mb-1">Top Affiliates by Commission</h2>
        <p className="text-xs text-gray-500 mb-4">Highest-earning referrers</p>
        {isLoading ? (
          <div className="h-56 bg-gray-700/40 rounded-lg animate-pulse" />
        ) : topByCommission.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-gray-500 text-sm">No commission payouts yet</div>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topByCommission} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#374151" }} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`} />
                <Tooltip
                  cursor={{ fill: "rgba(255,204,0,0.06)" }}
                  contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,204,0,0.25)", borderRadius: 10, fontSize: 12 }}
                  labelStyle={{ color: "#e5e7eb" }}
                  formatter={(v: number) => [inr(v), "Commission"]}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive>
                  {topByCommission.map((_, i) => <Cell key={i} fill="#34d399" />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </GlassCard>

      <DataTable
        columns={columns}
        rows={data?.rows ?? []}
        loading={isLoading}
        searchKeys={["username", "role"]}
        searchPlaceholder="Search affiliates…"
        pageSize={15}
        exportName="affiliates"
        rowKey={(r) => r.id}
        emptyText="No affiliates with referrals yet"
      />
    </div>
  );
}
