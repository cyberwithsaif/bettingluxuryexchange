"use client";
import { useLiveData } from "@/lib/hooks";
import { TrendingUp, TrendingDown, AlertCircle } from "lucide-react";

export default function AdminDashboard() {
  const { data, isLoading } = useLiveData("/admin/dashboard", 4000);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-4xl tracking-wide">Dashboard</h1>
        <p className="text-white/60 text-sm mt-1">Real-time platform overview</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI label="Total Users" value={data?.users} icon="👥" loading={isLoading} />
        <KPI label="Open Bets" value={data?.openBets} icon="🎯" loading={isLoading} />
        <KPI label="Live Markets" value={data?.activeMarkets} icon="📊" loading={isLoading} />
        <KPI
          label="Pending Deposits"
          value={data?.pendingDeposits}
          icon="⬇️"
          tone={data?.pendingDeposits > 0 ? "warn" : undefined}
          loading={isLoading}
        />
        <KPI
          label="Pending Withdrawals"
          value={data?.pendingWithdrawals}
          icon="⬆️"
          tone={data?.pendingWithdrawals > 0 ? "warn" : undefined}
          loading={isLoading}
        />
        <KPI label="Platform Exposure" value={fmt(data?.totalExposure)} icon="⚠️" tone="bad" loading={isLoading} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* 7-day P/L Chart */}
        <section className="glass rounded-lg p-6 animate-slide-in-up" style={{ animationDelay: "100ms" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-xl">7-Day P/L</h2>
              <p className="text-xs text-white/50">Operator revenue</p>
            </div>
            <div className="text-right">
              <p className="font-display text-2xl text-ok">{fmt(data?.totalPL7d)}</p>
              <p className="text-xs text-white/50">Net</p>
            </div>
          </div>
          <div className="space-y-2">
            {isLoading ? (
              <div className="h-40 bg-panel/50 rounded animate-pulse" />
            ) : (
              <div className="grid grid-cols-7 gap-2 h-40 items-end">
                {(data?.pl7d ?? []).map((d: any) => {
                  const max = Math.max(1, ...(data?.pl7d ?? []).map((x: any) => Math.abs(x.pl)));
                  const h = Math.max(8, Math.abs(d.pl) / max * 100);
                  return (
                    <div key={d.date} className="flex flex-col items-center gap-2 group">
                      <div
                        style={{ height: `${h}%` }}
                        className={`w-full rounded-t transition-all duration-300 group-hover:brightness-125 cursor-pointer ${
                          d.pl >= 0 ? "bg-ok" : "bg-bad"
                        }`}
                        title={`${d.date}: ${Math.round(d.pl).toLocaleString("en-IN")}`}
                      />
                      <span className="text-[10px] text-white/40 group-hover:text-white/70 transition-colors">
                        {d.date.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Key Metrics */}
        <section className="glass rounded-lg p-6 animate-slide-in-up space-y-3" style={{ animationDelay: "200ms" }}>
          <h2 className="font-display text-xl">Key Metrics</h2>

          <div className="space-y-2">
            {isLoading ? (
              Array(4).fill(0).map((_, i) => <div key={i} className="h-12 bg-panel/50 rounded animate-pulse" />)
            ) : (
              <>
                <MetricRow label="Total Revenue" value={fmt(data?.totalRevenue)} trend={data?.revenueTrend} />
                <MetricRow label="Commission Earned" value={fmt(data?.commission)} trend={data?.commissionTrend} />
                <MetricRow label="Active Users 24h" value={data?.activeUsers24h} />
                <MetricRow label="Avg Bet Size" value={fmt(data?.avgBetSize)} />
              </>
            )}
          </div>
        </section>
      </div>

      {/* Alerts */}
      {(data?.pendingDeposits > 0 || data?.pendingWithdrawals > 0) && (
        <div className="glass rounded-lg p-4 border border-orange-500/30 bg-orange-500/5 animate-pulse">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="text-orange-400 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-orange-400">Pending Actions Required</p>
              <p className="text-white/70 mt-1">
                {data?.pendingDeposits} deposit{data?.pendingDeposits !== 1 ? "s" : ""} and{" "}
                {data?.pendingWithdrawals} withdrawal{data?.pendingWithdrawals !== 1 ? "s" : ""} waiting for approval.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KPI({
  label,
  value,
  icon,
  tone,
  loading,
}: {
  label: string;
  value: any;
  icon?: string;
  tone?: "warn" | "bad";
  loading?: boolean;
}) {
  return (
    <div className="glass rounded-lg p-4 hover:border-accent/50 transition-all duration-300 animate-slide-in-up cursor-default">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/50 font-semibold">{label}</p>
          {loading ? (
            <div className="h-8 w-16 mt-2 bg-panel/50 rounded animate-pulse" />
          ) : (
            <p
              className={`font-display text-2xl mt-1 tabular-nums ${
                tone === "warn" ? "text-accentSoft" : tone === "bad" ? "text-bad" : "text-white"
              }`}
            >
              {value ?? "—"}
            </p>
          )}
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  trend,
}: {
  label: string;
  value: string;
  trend?: number;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-panel/40 hover:bg-panel/60 transition-colors">
      <span className="text-sm text-white/70">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-semibold tabular-nums">{value}</span>
        {trend !== undefined && (
          <div className={`text-xs flex items-center gap-1 ${trend > 0 ? "text-ok" : "text-bad"}`}>
            {trend > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
    </div>
  );
}

function fmt(n: number | undefined) {
  return n == null ? "—" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}
