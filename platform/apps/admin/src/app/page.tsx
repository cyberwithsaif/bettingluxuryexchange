"use client";
import useSWR from "swr";

export default function AdminDashboard() {
  const { data } = useSWR("/admin/dashboard");

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl">Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI label="Users"               value={data?.users} />
        <KPI label="Open Bets"           value={data?.openBets} />
        <KPI label="Active Markets"      value={data?.activeMarkets} />
        <KPI label="Pending Deposits"    value={data?.pendingDeposits}    tone={data?.pendingDeposits ? "warn" : undefined} />
        <KPI label="Pending Withdrawals" value={data?.pendingWithdrawals} tone={data?.pendingWithdrawals ? "warn" : undefined} />
        <KPI label="Total Exposure"      value={fmt(data?.totalExposure)} tone="bad" />
      </div>

      <section className="rounded-xl bg-panel/80 border border-line p-5">
        <h2 className="font-display text-2xl mb-3">7-day platform P/L (operator side)</h2>
        <div className="grid grid-cols-7 gap-2 h-32 items-end">
          {(data?.pl7d ?? []).map((d: any) => {
            const max = Math.max(1, ...(data?.pl7d ?? []).map((x: any) => Math.abs(x.pl)));
            const h = Math.max(4, Math.abs(d.pl) / max * 100);
            return (
              <div key={d.date} className="flex flex-col items-center gap-1">
                <div style={{ height: `${h}%` }} className={
                  "w-full rounded " + (d.pl >= 0 ? "bg-ok" : "bg-bad")
                }/>
                <span className="text-[10px] text-white/50">{d.date.slice(5)}</span>
                <span className="text-xs tabular-nums">{Math.round(d.pl).toLocaleString("en-IN")}</span>
              </div>
            );
          })}
          {!data?.pl7d?.length && <p className="col-span-7 text-white/50 text-sm">No settlement activity yet.</p>}
        </div>
      </section>
    </div>
  );
}

function fmt(n: number | undefined) { return n == null ? "—" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n); }
function KPI({ label, value, tone }: { label: string; value: any; tone?: "warn" | "bad" }) {
  return (
    <div className="rounded-xl bg-panel/80 border border-line p-4">
      <p className="text-[10px] uppercase tracking-wider text-white/50">{label}</p>
      <p className={"font-display text-3xl mt-1 " + (tone === "warn" ? "text-accentSoft" : tone === "bad" ? "text-bad" : "text-white")}>
        {value ?? "—"}
      </p>
    </div>
  );
}
