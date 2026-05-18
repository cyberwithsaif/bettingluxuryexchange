"use client";
import useSWR from "swr";
import { useState } from "react";
import { TrendingUp, TrendingDown, Activity, BarChart3 } from "lucide-react";

interface ReportData {
  days: number;
  totalBets: number;
  openBets: number;
  settledBets: number;
  totalUserWin: number;
  totalOperatorPL: number;
  series: Array<{ date: string; volume: number; pl: number }>;
}

const QUICK_RANGES = [
  { label: "Today",  days: 1 },
  { label: "7 Days", days: 7 },
  { label: "30 Days", days: 30 },
  { label: "90 Days", days: 90 },
];

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

export default function AdminReportsPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useSWR<ReportData>(`/admin/reports?days=${days}`);

  const maxVol = Math.max(1, ...(data?.series ?? []).map((s) => s.volume));
  const maxPL  = Math.max(1, ...(data?.series ?? []).map((s) => Math.abs(s.pl)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display text-4xl">Platform Reports</h1>
        <div className="flex gap-1.5">
          {QUICK_RANGES.map(({ label, days: d }) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={
                "px-3 py-1.5 rounded-md text-sm font-semibold border transition " +
                (days === d
                  ? "bg-accent-grad text-ink border-transparent shadow-glow"
                  : "border-line text-white/70 hover:border-accent")
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Total Bets" value={data ? fmt(data.totalBets) : "—"} Icon={Activity} />
        <KPI label="Open Bets" value={data ? fmt(data.openBets) : "—"} Icon={BarChart3} />
        <KPI label="Total User Winnings" value={data ? `₹${fmt(data.totalUserWin)}` : "—"} Icon={TrendingUp} tone="bad" />
        <KPI
          label="Operator P/L"
          value={data ? `₹${fmt(data.totalOperatorPL)}` : "—"}
          Icon={data && data.totalOperatorPL >= 0 ? TrendingUp : TrendingDown}
          tone={data && data.totalOperatorPL >= 0 ? "ok" : "bad"}
        />
      </div>

      {/* Volume chart */}
      <div className="rounded-xl bg-panel/80 border border-line p-5">
        <h2 className="font-display text-2xl mb-1">Daily Bet Volume</h2>
        <p className="text-xs text-white/50 mb-4">Last {days} day{days > 1 ? "s" : ""}</p>
        {isLoading && <div className="h-32 animate-pulse bg-panel2 rounded" />}
        {!isLoading && data && (
          <div className="flex items-end gap-1 h-36 overflow-x-auto no-scrollbar">
            {data.series.length === 0 && (
              <p className="text-white/40 text-sm m-auto">No activity in this period.</p>
            )}
            {data.series.map((s) => {
              const h = Math.max(4, (s.volume / maxVol) * 100);
              return (
                <div key={s.date} className="flex flex-col items-center gap-1 shrink-0 flex-1 min-w-[24px]">
                  <div
                    style={{ height: `${h}%` }}
                    className="w-full rounded-t bg-accent/70 hover:bg-accent transition"
                    title={`${s.date}: ₹${fmt(s.volume)}`}
                  />
                  {data.series.length <= 14 && (
                    <span className="text-[9px] text-white/40">{s.date.slice(5)}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* P/L Chart */}
      <div className="rounded-xl bg-panel/80 border border-line p-5">
        <h2 className="font-display text-2xl mb-1">Daily Operator P/L</h2>
        <p className="text-xs text-white/50 mb-4">Positive = operator profit</p>
        {isLoading && <div className="h-32 animate-pulse bg-panel2 rounded" />}
        {!isLoading && data && (
          <div className="flex items-end gap-1 h-36 overflow-x-auto no-scrollbar">
            {data.series.length === 0 && (
              <p className="text-white/40 text-sm m-auto">No settlement activity yet.</p>
            )}
            {data.series.map((s) => {
              const h = Math.max(4, (Math.abs(s.pl) / maxPL) * 100);
              return (
                <div key={s.date} className="flex flex-col items-center gap-1 shrink-0 flex-1 min-w-[24px]">
                  <div
                    style={{ height: `${h}%` }}
                    className={"w-full rounded-t transition " + (s.pl >= 0 ? "bg-ok/70 hover:bg-ok" : "bg-bad/70 hover:bg-bad")}
                    title={`${s.date}: ₹${fmt(s.pl)}`}
                  />
                  {data.series.length <= 14 && (
                    <span className="text-[9px] text-white/40">{s.date.slice(5)}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tabular breakdown */}
      {data && data.series.length > 0 && (
        <div className="rounded-xl border border-line bg-panel/60 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-panel text-[10px] uppercase tracking-wider text-white/50">
              <tr>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-right">Volume</th>
                <th className="px-4 py-2 text-right">Operator P/L</th>
              </tr>
            </thead>
            <tbody>
              {[...data.series].reverse().map((s) => (
                <tr key={s.date} className="border-t border-line/60">
                  <td className="px-4 py-2 text-white/70">{s.date}</td>
                  <td className="px-4 py-2 text-right tabular-nums">₹{fmt(s.volume)}</td>
                  <td className={`px-4 py-2 text-right tabular-nums font-semibold ${s.pl >= 0 ? "text-ok" : "text-bad"}`}>
                    {s.pl >= 0 ? "+" : ""}₹{fmt(s.pl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function KPI({ label, value, Icon, tone }: { label: string; value: string; Icon: React.ElementType; tone?: "ok" | "bad" }) {
  return (
    <div className="rounded-xl bg-panel/80 border border-line p-4 flex items-start gap-3">
      <div className={`mt-0.5 p-2 rounded-md ${tone === "ok" ? "bg-ok/15 text-ok" : tone === "bad" ? "bg-bad/15 text-bad" : "bg-accent/15 text-accentSoft"}`}>
        <Icon size={16} />
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-white/50">{label}</p>
        <p className="font-display text-2xl mt-0.5">{value}</p>
      </div>
    </div>
  );
}
