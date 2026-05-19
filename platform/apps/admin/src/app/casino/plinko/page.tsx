"use client";
import useSWR, { mutate } from "swr";
import { useState } from "react";
import { api } from "@/lib/api";
import {
  Target, TrendingUp, TrendingDown, Users, DollarSign,
  ToggleLeft, ToggleRight, Save, RefreshCw, ShieldCheck,
} from "lucide-react";

interface PlinkoConfig {
  enabled: boolean;
  minBet: number;
  maxBet: number;
  maxPayout: number;
  rtpPercent: number;
}

interface PlinkoStats {
  totalBets: number;
  totalWagered: number;
  totalPaid: number;
  houseProfit: number;
  actualRTP: number;
  avgMultiplier: number;
  avgBet: number;
  activePlayers: number;
  bigWins: any[];
  recentBets: any[];
}

const RISK_COLOR: Record<string, string> = {
  low: "text-green-400", medium: "text-yellow-400", high: "text-red-400",
};

function multColor(m: number) {
  if (m >= 100) return "text-white font-black";
  if (m >= 20)  return "text-yellow-400 font-bold";
  if (m >= 5)   return "text-orange-400 font-bold";
  if (m >= 2)   return "text-green-400";
  return "text-red-400";
}

export default function AdminPlinkoPage() {
  const { data: stats, isLoading: statsLoading, mutate: mutateStats } =
    useSWR<PlinkoStats>("/plinko/admin/stats", { refreshInterval: 15_000 });
  const { data: cfg, isLoading: cfgLoading } =
    useSWR<PlinkoConfig>("/plinko/admin/config");

  const [form, setForm] = useState<PlinkoConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg,  setMsg]  = useState<{ text: string; ok: boolean } | null>(null);

  const current = form ?? cfg;

  function set(key: keyof PlinkoConfig, val: any) {
    setForm(prev => ({ ...(prev ?? cfg!), [key]: val }));
  }

  async function save() {
    if (!current) return;
    setBusy(true); setMsg(null);
    try {
      await api.post("/plinko/admin/config", current);
      mutate("/plinko/admin/config");
      setForm(null);
      setMsg({ text: "Config saved.", ok: true });
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message ?? "Save failed", ok: false });
    } finally { setBusy(false); }
  }

  if (statsLoading || cfgLoading) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-4xl flex items-center gap-3"><Target size={30} /> Plinko</h1>
        <div className="h-40 animate-pulse bg-panel/60 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-4xl flex items-center gap-3"><Target size={30} /> Plinko Admin</h1>
        <button onClick={() => mutateStats()} className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {msg && (
        <div className={`text-sm px-4 py-2.5 rounded-lg border ${msg.ok ? "bg-ok/10 border-ok/30 text-ok" : "bg-bad/10 border-bad/30 text-bad"}`}>
          {msg.text}
        </div>
      )}

      {/* ── Stat cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: DollarSign, label: "Total Wagered",   value: `₹${(stats?.totalWagered ?? 0).toLocaleString()}`, color: "text-sky-400" },
          { icon: TrendingUp, label: "House Profit",    value: `₹${(stats?.houseProfit  ?? 0).toLocaleString()}`, color: stats && stats.houseProfit >= 0 ? "text-green-400" : "text-red-400" },
          { icon: Target,     label: "Actual RTP",      value: `${stats?.actualRTP ?? 0}%`,                        color: "text-yellow-400" },
          { icon: Users,      label: "Active / 1h",     value: String(stats?.activePlayers ?? 0),                  color: "text-purple-400" },
          { icon: ShieldCheck,label: "Total Bets",      value: (stats?.totalBets ?? 0).toLocaleString(),            color: "text-white" },
          { icon: TrendingDown,label: "Total Paid Out", value: `₹${(stats?.totalPaid ?? 0).toLocaleString()}`,     color: "text-orange-400" },
          { icon: Target,     label: "Avg Multiplier",  value: `${stats?.avgMultiplier ?? 0}×`,                    color: "text-pink-400" },
          { icon: DollarSign, label: "Avg Bet",         value: `₹${stats?.avgBet ?? 0}`,                          color: "text-white/70" },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="rounded-xl border border-line bg-panel/60 p-4">
            <div className="flex items-center gap-2 text-white/50 text-xs mb-1"><Icon size={14} />{label}</div>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Configuration ─────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-line bg-panel/60 p-5">
        <h2 className="font-display text-xl mb-4">Configuration</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">

          {/* Enable toggle */}
          <div className="col-span-2 lg:col-span-3">
            <button onClick={() => set("enabled", !current?.enabled)}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border transition font-semibold ${
                current?.enabled
                  ? "border-ok/40 bg-ok/10 text-ok"
                  : "border-bad/40 bg-bad/10 text-bad"
              }`}>
              {current?.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
              Plinko is {current?.enabled ? "Enabled" : "Disabled"}
            </button>
          </div>

          {/* RTP */}
          <div className="col-span-2 lg:col-span-3">
            <label className="text-xs uppercase tracking-wider text-white/50 block mb-1">
              RTP Target — {current?.rtpPercent ?? 97}%
              <span className="ml-2 text-white/30 font-normal normal-case">(scales all multipliers proportionally)</span>
            </label>
            <input type="range" min={50} max={99} step={1}
              value={current?.rtpPercent ?? 97}
              onChange={e => set("rtpPercent", Number(e.target.value))}
              className="w-full accent-purple-500"
            />
            <div className="flex justify-between text-xs text-white/30 mt-0.5">
              <span>50% (high edge)</span><span>99% (near-fair)</span>
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-white/50 block mb-1">Min Bet (₹)</label>
            <input type="number" min={1} value={current?.minBet ?? 10}
              onChange={e => set("minBet", Number(e.target.value))}
              className="w-full bg-[#0d0e15] border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-white/50 block mb-1">Max Bet (₹)</label>
            <input type="number" min={100} value={current?.maxBet ?? 100000}
              onChange={e => set("maxBet", Number(e.target.value))}
              className="w-full bg-[#0d0e15] border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-white/50 block mb-1">Max Single Payout (₹)</label>
            <input type="number" min={1000} value={current?.maxPayout ?? 5000000}
              onChange={e => set("maxPayout", Number(e.target.value))}
              className="w-full bg-[#0d0e15] border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
          </div>
        </div>

        <button onClick={save} disabled={busy || !form}
          className="mt-4 flex items-center gap-2 rounded-md bg-accent-grad px-6 py-2.5 font-bold text-ink shadow-glow disabled:opacity-40 hover:brightness-110 transition">
          <Save size={16} /> {busy ? "Saving…" : "Save Config"}
        </button>
      </section>

      {/* ── Big Wins ──────────────────────────────────────────────────────── */}
      {(stats?.bigWins?.length ?? 0) > 0 && (
        <section className="rounded-xl border border-line bg-panel/60 p-5">
          <h2 className="font-display text-xl mb-3">🏆 Biggest Wins</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/40 text-xs uppercase tracking-wider">
                  <th className="text-left pb-2">User</th>
                  <th className="text-left pb-2">Bet</th>
                  <th className="text-left pb-2">Rows / Risk</th>
                  <th className="text-left pb-2">Multiplier</th>
                  <th className="text-left pb-2">Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {stats!.bigWins.map((b: any) => (
                  <tr key={b.id} className="hover:bg-white/3 transition">
                    <td className="py-2 font-medium">{b.username}</td>
                    <td className="py-2 text-white/60">₹{b.betAmount.toLocaleString()}</td>
                    <td className="py-2 text-white/60">{b.rows}R <span className={RISK_COLOR[b.riskLevel]}>{b.riskLevel}</span></td>
                    <td className={`py-2 ${multColor(b.multiplier)}`}>{b.multiplier}×</td>
                    <td className="py-2 text-green-400 font-bold">₹{b.payout.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Recent Bets ───────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-line bg-panel/60 p-5">
        <h2 className="font-display text-xl mb-3">Recent Bets</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/40 text-xs uppercase tracking-wider">
                <th className="text-left pb-2">User</th>
                <th className="text-left pb-2">Bet</th>
                <th className="text-left pb-2">Rows</th>
                <th className="text-left pb-2">Risk</th>
                <th className="text-left pb-2">Slot</th>
                <th className="text-left pb-2">Mult</th>
                <th className="text-left pb-2">Payout</th>
                <th className="text-left pb-2">P/L</th>
                <th className="text-left pb-2">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(stats?.recentBets ?? []).map((b: any) => (
                <tr key={b.id} className="hover:bg-white/3 transition">
                  <td className="py-2 font-medium">{b.username}</td>
                  <td className="py-2 text-white/60">₹{b.betAmount.toLocaleString()}</td>
                  <td className="py-2 text-white/60">{b.rows}</td>
                  <td className={`py-2 ${RISK_COLOR[b.riskLevel]}`}>{b.riskLevel}</td>
                  <td className="py-2 text-white/60">{b.slot}</td>
                  <td className={`py-2 ${multColor(b.multiplier)}`}>{b.multiplier}×</td>
                  <td className="py-2 text-white/80">₹{b.payout.toLocaleString()}</td>
                  <td className={`py-2 font-semibold ${b.profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {b.profit >= 0 ? "+" : ""}₹{b.profit.toFixed(0)}
                  </td>
                  <td className="py-2 text-white/40 text-xs">
                    {new Date(b.createdAt).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
              {(stats?.recentBets ?? []).length === 0 && (
                <tr><td colSpan={9} className="py-8 text-center text-white/30">No bets yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
