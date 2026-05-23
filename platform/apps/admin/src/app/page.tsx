"use client";
import { useLiveData } from "@/lib/hooks";
import { TrendingUp, TrendingDown, AlertCircle, Users, Target, BarChart2, ArrowDownToLine, ArrowUpToLine, ShieldAlert } from "lucide-react";

interface DashboardData {
  users: number;
  openBets: number;
  activeMarkets: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
  totalExposure: number;
  totalPL7d: number;
  totalRevenue: number;
  commission: number;
  activeUsers24h: number;
  avgBetSize: number;
  revenueTrend: number;
  commissionTrend: number;
  pl7d: Array<{ date: string; pl: number }>;
}

function fmt(n: number | undefined) {
  return n == null ? "–" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

export default function AdminDashboard() {
  const { data, isLoading } = useLiveData<DashboardData>("/admin/dashboard", 15000);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-black text-gray-100">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-0.5">Real-time platform overview</p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI label="Total Users"          value={data?.users}              Icon={Users}           loading={isLoading} />
        <KPI label="Open Bets"            value={data?.openBets}           Icon={Target}          loading={isLoading} />
        <KPI label="Live Markets"         value={data?.activeMarkets}      Icon={BarChart2}       loading={isLoading} />
        <KPI label="Pending Deposits"     value={data?.pendingDeposits}    Icon={ArrowDownToLine} loading={isLoading} tone={(data?.pendingDeposits ?? 0) > 0 ? "warn" : undefined} />
        <KPI label="Pending Withdrawals"  value={data?.pendingWithdrawals} Icon={ArrowUpToLine}   loading={isLoading} tone={(data?.pendingWithdrawals ?? 0) > 0 ? "warn" : undefined} />
        <KPI label="Platform Exposure"    value={`₹${fmt(data?.totalExposure)}`} Icon={ShieldAlert} loading={isLoading} tone="bad" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* 7-day P/L Chart */}
        <div className="bg-gray-800 rounded-xl border border-yellow-100 p-6 shadow-sm animate-slide-in-up" style={{ animationDelay: "100ms" }}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-black text-gray-100">7-Day P/L</h2>
              <p className="text-xs text-gray-500 mt-0.5">Operator revenue</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-emerald-600">{data?.pl7d ? `₹${fmt(data.pl7d.reduce((s, d) => s + d.pl, 0))}` : "–"}</p>
              <p className="text-xs text-gray-500">Net</p>
            </div>
          </div>
          <div className="h-40 flex items-end gap-1.5">
            {isLoading ? (
              <div className="w-full h-full bg-gray-700 rounded-lg animate-pulse" />
            ) : (data?.pl7d ?? []).length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">No data yet</div>
            ) : (
              (data?.pl7d ?? []).map((d: any) => {
                const max = Math.max(1, ...(data?.pl7d ?? []).map((x: any) => Math.abs(x.pl)));
                const h = Math.max(8, Math.abs(d.pl) / max * 100);
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1.5 group">
                    <div
                      style={{ height: `${h}%` }}
                      className={`w-full rounded-t-md transition-all duration-300 group-hover:brightness-110 cursor-pointer ${
                        d.pl >= 0 ? "bg-emerald-400" : "bg-red-400"
                      }`}
                      title={`${d.date}: ₹${Math.round(d.pl).toLocaleString("en-IN")}`}
                    />
                    <span className="text-[10px] text-gray-500 group-hover:text-gray-400 transition-colors">
                      {d.date.slice(5)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Key Metrics */}
        <div className="bg-gray-800 rounded-xl border border-yellow-100 p-6 shadow-sm animate-slide-in-up space-y-4" style={{ animationDelay: "200ms" }}>
          <h2 className="text-lg font-black text-gray-100">Key Metrics</h2>
          <div className="space-y-2">
            {isLoading ? (
              Array(4).fill(0).map((_, i) => <div key={i} className="h-12 bg-gray-700 rounded-lg animate-pulse" />)
            ) : (
              <>
                <MetricRow label="Total Revenue"     value={`₹${fmt(data?.totalRevenue)}`}  trend={data?.revenueTrend} />
                <MetricRow label="Commission Earned" value={`₹${fmt(data?.commission)}`}    trend={data?.commissionTrend} />
                <MetricRow label="Active Users 24h"  value={String(data?.activeUsers24h ?? "–")} />
                <MetricRow label="Avg Bet Size"      value={`₹${fmt(data?.avgBetSize)}`} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Alerts */}
      {((data?.pendingDeposits ?? 0) > 0 || (data?.pendingWithdrawals ?? 0) > 0) && (
        <div className="bg-orange-50 rounded-xl border border-orange-200 p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-orange-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-bold text-orange-700">Pending Actions Required</p>
            <p className="text-orange-600 mt-0.5">
              {data?.pendingDeposits} deposit{data?.pendingDeposits !== 1 ? "s" : ""} and{" "}
              {data?.pendingWithdrawals} withdrawal{data?.pendingWithdrawals !== 1 ? "s" : ""} waiting for approval.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function KPI({ label, value, Icon, tone, loading }: {
  label: string; value: any; Icon: any; tone?: "warn" | "bad"; loading?: boolean;
}) {
  const valueColor = tone === "warn" ? "text-yellow-600" : tone === "bad" ? "text-red-500" : "text-gray-100";
  return (
    <div className="bg-gray-800 rounded-xl border border-yellow-100 p-4 shadow-sm hover:border-yellow-300 transition-all duration-200">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">{label}</p>
          {loading ? (
            <div className="h-7 w-16 bg-gray-700 rounded animate-pulse" />
          ) : (
            <p className={`text-xl font-black tabular-nums ${valueColor}`}>{value ?? "–"}</p>
          )}
        </div>
        <div className={`p-2 rounded-lg shrink-0 ${
          tone === "warn" ? "bg-gray-800" : tone === "bad" ? "bg-red-50" : "bg-gray-800"
        }`}>
          <Icon size={16} className={tone === "warn" ? "text-yellow-500" : tone === "bad" ? "text-red-400" : "text-yellow-500"} />
        </div>
      </div>
    </div>
  );
}

function MetricRow({ label, value, trend }: { label: string; value: string; trend?: number }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-gray-800 border border-gray-100 hover:bg-gray-800/50 transition-colors">
      <span className="text-sm text-gray-400 font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-bold tabular-nums text-gray-200">{value}</span>
        {trend !== undefined && (
          <div className={`text-xs flex items-center gap-1 font-semibold ${trend > 0 ? "text-emerald-600" : "text-red-500"}`}>
            {trend > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
    </div>
  );
}
