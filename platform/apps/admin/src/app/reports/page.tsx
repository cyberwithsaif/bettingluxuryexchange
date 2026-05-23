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
  { label: "Today",   days: 1 },
  { label: "7 Days",  days: 7 },
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
        <div>
          <h1 className="text-2xl font-black text-gray-100">Platform Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Bet volume and operator P/L over time</p>
        </div>
        <div className="flex gap-1.5">
          {QUICK_RANGES.map(({ label, days: d }) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition ${
                days === d
                  ? "bg-gradient-to-r from-yellow-400 to-amber-500 text-gray-100 border-transparent shadow-sm"
                  : "border-yellow-200 text-gray-400 hover:border-yellow-400 hover:bg-gray-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Total Bets"         value={data ? fmt(data.totalBets) : "–"}            Icon={Activity}    />
        <KPI label="Open Bets"          value={data ? fmt(data.openBets)  : "–"}            Icon={BarChart3}   />
        <KPI label="Total User Wins"    value={data ? `₹${fmt(data.totalUserWin)}` : "–"}  Icon={TrendingUp}   tone="bad" />
        <KPI
          label="Operator P/L"
          value={data ? `₹${fmt(data.totalOperatorPL)}` : "–"}
          Icon={data && data.totalOperatorPL >= 0 ? TrendingUp : TrendingDown}
          tone={data && data.totalOperatorPL >= 0 ? "ok" : "bad"}
        />
      </div>

      {/* Volume chart */}
      <div className="rounded-xl bg-gray-800 border border-yellow-500/20 p-5 shadow-sm">
        <h2 className="text-lg font-black text-gray-100 mb-1">Daily Bet Volume</h2>
        <p className="text-xs text-gray-500 mb-4">Last {days} day{days > 1 ? "s" : ""}</p>
        {isLoading && <div className="h-32 animate-pulse bg-gray-700 rounded-lg" />}
        {!isLoading && data && (
          <div className="flex items-end gap-1 h-36 overflow-x-auto">
            {data.series.length === 0 && (
              <p className="text-gray-500 text-sm m-auto">No activity in this period.</p>
            )}
            {data.series.map((s) => {
              const h = Math.max(4, (s.volume / maxVol) * 100);
              return (
                <div key={s.date} className="flex flex-col items-center gap-1 shrink-0 flex-1 min-w-[24px] group">
                  <div
                    style={{ height: `${h}%` }}
                    className="w-full rounded-t bg-yellow-400 hover:bg-gray-8000 transition cursor-pointer"
                    title={`${s.date}: ₹${fmt(s.volume)}`}
                  />
                  {data.series.length <= 14 && (
                    <span className="text-[9px] text-gray-500 group-hover:text-gray-400 transition-colors">{s.date.slice(5)}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* P/L Chart */}
      <div className="rounded-xl bg-gray-800 border border-yellow-500/20 p-5 shadow-sm">
        <h2 className="text-lg font-black text-gray-100 mb-1">Daily Operator P/L</h2>
        <p className="text-xs text-gray-500 mb-4">Positive = operator profit</p>
        {isLoading && <div className="h-32 animate-pulse bg-gray-700 rounded-lg" />}
        {!isLoading && data && (
          <div className="flex items-end gap-1 h-36 overflow-x-auto">
            {data.series.length === 0 && (
              <p className="text-gray-500 text-sm m-auto">No settlement activity yet.</p>
            )}
            {data.series.map((s) => {
              const h = Math.max(4, (Math.abs(s.pl) / maxPL) * 100);
              return (
                <div key={s.date} className="flex flex-col items-center gap-1 shrink-0 flex-1 min-w-[24px] group">
                  <div
                    style={{ height: `${h}%` }}
                    className={`w-full rounded-t transition cursor-pointer ${s.pl >= 0 ? "bg-emerald-400 hover:bg-emerald-500" : "bg-red-400 hover:bg-red-900/200"}`}
                    title={`${s.date}: ₹${fmt(s.pl)}`}
                  />
                  {data.series.length <= 14 && (
                    <span className="text-[9px] text-gray-500 group-hover:text-gray-400 transition-colors">{s.date.slice(5)}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tabular breakdown */}
      {data && data.series.length > 0 && (
        <div className="rounded-xl border border-yellow-500/20 bg-gray-800 overflow-x-auto shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/80 border-b border-yellow-500/20">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Date</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Volume</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Operator P/L</th>
              </tr>
            </thead>
            <tbody>
              {[...data.series].reverse().map((s) => (
                <tr key={s.date} className="border-t border-gray-700 hover:bg-gray-800/30 transition">
                  <td className="px-4 py-2.5 text-gray-400">{s.date}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-300 font-semibold">₹{fmt(s.volume)}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${s.pl >= 0 ? "text-emerald-400" : "text-red-500"}`}>
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

function KPI({ label, value, Icon, tone }: {
  label: string; value: string; Icon: React.ElementType; tone?: "ok" | "bad";
}) {
  return (
    <div className="rounded-xl bg-gray-800 border border-yellow-500/20 p-4 shadow-sm flex items-start gap-3">
      <div className={`mt-0.5 p-2 rounded-lg ${
        tone === "ok"  ? "bg-emerald-50 text-emerald-400" :
        tone === "bad" ? "bg-red-900/20 text-red-500" :
                         "bg-gray-800 text-yellow-400"
      }`}>
        <Icon size={16} />
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{label}</p>
        <p className="text-2xl font-black text-gray-100 mt-0.5 tabular-nums">{value}</p>
      </div>
    </div>
  );
}
