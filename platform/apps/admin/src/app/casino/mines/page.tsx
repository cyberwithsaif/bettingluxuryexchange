"use client";

import { useState, useEffect } from "react";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  Bomb, Activity, TrendingUp, TrendingDown, Users, Settings,
  RefreshCw, CheckCircle2, AlertCircle, ToggleLeft, ToggleRight, Trash2,
} from "lucide-react";

const STATS_KEY  = "/mines/admin/stats";
const LIVE_KEY   = "/mines/admin/live";
const HIST_KEY   = "/mines/admin/history?limit=50";
const CONFIG_KEY = "/mines/admin/config";

function fmt(v: number) {
  return "₹" + Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d: string) {
  return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function elapsed(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

export default function MinesAdminPage() {
  const { data: stats, isLoading: statsLoad } = useSWR(STATS_KEY);
  const { data: live,  isLoading: liveLoad, mutate: mutateLive } = useSWR(LIVE_KEY, { refreshInterval: 5000 });
  const { data: hist,  isLoading: histLoad } = useSWR(HIST_KEY);
  const { data: cfg } = useSWR<{
    minesHouseEdge: number; minesMinBet: number; minesMaxBet: number; minesEnabled: boolean; minesHardness: number;
  }>(CONFIG_KEY);

  const [form, setForm] = useState({ minesHouseEdge: 0.01, minesMinBet: 10, minesMaxBet: 100000, minesEnabled: true, minesHardness: 0 });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (cfg) setForm({ minesHouseEdge: cfg.minesHouseEdge, minesMinBet: cfg.minesMinBet, minesMaxBet: cfg.minesMaxBet, minesEnabled: cfg.minesEnabled, minesHardness: cfg.minesHardness ?? 0 });
  }, [cfg]);

  // Re-render every second so elapsed timers stay live
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  async function resetStats() {
    if (!confirmReset) { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 4000); return; }
    setResetting(true); setConfirmReset(false);
    try {
      await api.post("/mines/admin/stats/reset");
      mutate(STATS_KEY); mutate(HIST_KEY);
    } finally { setResetting(false); }
  }

  async function saveConfig() {
    setSaving(true); setSaveMsg(null);
    try {
      await api.post(CONFIG_KEY, form);
      mutate(CONFIG_KEY);
      setSaveMsg({ ok: true, text: "Config saved!" });
      setTimeout(() => setSaveMsg(null), 3000);
    } catch {
      setSaveMsg({ ok: false, text: "Save failed." });
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl flex items-center gap-2">
            <Bomb size={26} className="text-accent" /> Mines Control Panel
          </h1>
          <p className="text-sm text-white/50 mt-1">Live sessions, game history, house edge & bet limits.</p>
        </div>
        <button
          onClick={resetStats}
          disabled={resetting}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition",
            confirmReset
              ? "bg-red-600 border-red-500 text-white animate-pulse"
              : "border-red-500/40 text-red-400 hover:bg-red-500/10"
          )}
        >
          {resetting ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
          {resetting ? "Resetting…" : confirmReset ? "Click again to confirm" : "Reset Stats"}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total Games",    value: statsLoad ? "…" : (stats?.total ?? 0),             Icon: Bomb,        color: "text-white" },
          { label: "Active Now",     value: statsLoad ? "…" : (stats?.active ?? 0),            Icon: Activity,    color: "text-ok" },
          { label: "Total Bet Vol",  value: statsLoad ? "…" : fmt(stats?.totalBetsVol ?? 0),   Icon: TrendingUp,  color: "text-accent" },
          { label: "Total Payouts",  value: statsLoad ? "…" : fmt(stats?.totalPayouts ?? 0),   Icon: TrendingDown,color: "text-yellow-400" },
          { label: "House Profit",   value: statsLoad ? "…" : fmt(stats?.houseProfit ?? 0),    Icon: TrendingUp,  color: stats?.houseProfit >= 0 ? "text-ok" : "text-bad" },
        ].map(({ label, value, Icon, color }) => (
          <div key={label} className="glass rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon size={14} className={color} />
              <p className="text-[10px] uppercase tracking-wider text-white/50 font-semibold">{label}</p>
            </div>
            <p className={cn("font-display text-xl tabular-nums", color)}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Config */}
        <section className="glass rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Settings size={16} className="text-accent" />
            <h2 className="font-bold text-sm uppercase tracking-wider text-white/70">Game Config</h2>
          </div>

          <div>
            <label className="block text-xs text-white/50 mb-1">House Edge %</label>
            <div className="flex items-center gap-2">
              <input
                type="range" min={0} max={10} step={0.1}
                value={+(form.minesHouseEdge * 100).toFixed(1)}
                onChange={e => setForm(f => ({ ...f, minesHouseEdge: Number(e.target.value) / 100 }))}
                className="flex-1 accent-orange-500"
              />
              <span className="w-14 text-right font-bold text-accent text-sm">
                {(form.minesHouseEdge * 100).toFixed(1)}%
              </span>
            </div>
            <p className="text-xs text-white/30 mt-0.5">RTP = {(100 - form.minesHouseEdge * 100).toFixed(1)}%</p>
          </div>

          <div>
            <label className="block text-xs text-white/50 mb-1">Hardness %</label>
            <div className="flex items-center gap-2">
              <input
                type="range" min={0} max={100} step={1}
                value={form.minesHardness}
                onChange={e => setForm(f => ({ ...f, minesHardness: Number(e.target.value) }))}
                className="flex-1 accent-red-500"
              />
              <span className={cn("w-14 text-right font-bold text-sm", form.minesHardness === 0 ? "text-ok" : form.minesHardness < 30 ? "text-yellow-400" : "text-bad")}>
                {form.minesHardness}%
              </span>
            </div>
            <p className="text-xs text-white/30 mt-0.5">
              {form.minesHardness === 0
                ? "Fair — no forced busts"
                : `Each safe click has ${form.minesHardness}% extra chance to bust`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/50 mb-1">Min Bet (₹)</label>
              <input
                type="number" min={1} value={form.minesMinBet}
                onChange={e => setForm(f => ({ ...f, minesMinBet: Number(e.target.value) }))}
                className="w-full bg-panel/60 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1">Max Bet (₹)</label>
              <input
                type="number" min={100} value={form.minesMaxBet}
                onChange={e => setForm(f => ({ ...f, minesMaxBet: Number(e.target.value) }))}
                className="w-full bg-panel/60 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="flex items-center justify-between py-2 border-t border-line">
            <div>
              <p className="text-sm font-semibold">Game Enabled</p>
              <p className="text-xs text-white/40">Toggle to enable/disable Mines for all users</p>
            </div>
            <button onClick={() => setForm(f => ({ ...f, minesEnabled: !f.minesEnabled }))} className="text-2xl">
              {form.minesEnabled
                ? <ToggleRight size={36} className="text-ok" />
                : <ToggleLeft  size={36} className="text-white/30" />
              }
            </button>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={saveConfig} disabled={saving}
              className="flex items-center gap-2 bg-accent-grad px-5 py-2 rounded-lg font-semibold text-ink text-sm shadow-glow hover:brightness-110 disabled:opacity-50 transition"
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Settings size={14} />}
              {saving ? "Saving…" : "Save Config"}
            </button>
            {saveMsg && (
              <span className={`flex items-center gap-1 text-sm ${saveMsg.ok ? "text-ok" : "text-bad"}`}>
                {saveMsg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                {saveMsg.text}
              </span>
            )}
          </div>
        </section>

        {/* Live Sessions */}
        <section className="glass rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-ok animate-pulse" />
              <h2 className="font-bold text-sm uppercase tracking-wider text-white/70">Live Sessions</h2>
              {!liveLoad && <span className="text-xs bg-ok/20 text-ok px-2 py-0.5 rounded-full">{(live as any[])?.length ?? 0} active</span>}
            </div>
            <button onClick={() => mutateLive()} className="p-1.5 hover:bg-white/10 rounded transition">
              <RefreshCw size={13} className="text-white/40" />
            </button>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {liveLoad && <div className="text-center text-white/30 py-6 text-sm">Loading…</div>}
            {!liveLoad && (!(live as any[])?.length) && (
              <div className="text-center text-white/30 py-6 text-sm flex flex-col items-center gap-2">
                <Users size={24} className="text-white/10" />
                No active sessions
              </div>
            )}
            {(live as any[])?.map((s: any) => (
              <div key={s.id} className="flex items-center gap-3 bg-panel/40 border border-line rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{s.user?.username}</p>
                  <p className="text-xs text-white/40">
                    {fmt(s.betAmount)} bet • {s.minesCount} mines • {(s.clickedTiles as any[])?.length ?? 0} tiles clicked
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-mono text-ok">{Number(s.multiplier).toFixed(2)}x</p>
                  <p className="text-[10px] text-white/30">{elapsed(s.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Game History */}
      <section className="glass rounded-xl p-5 space-y-3">
        <h2 className="font-bold text-sm uppercase tracking-wider text-white/70">Game History (last 50)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-white/40">
              <tr className="border-b border-line">
                {["User","Bet","Mines","Tiles","Status","Multiplier","Payout","Time"].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {histLoad && Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-line/30">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className="px-3 py-2.5">
                      <div className="h-3 rounded bg-white/5 animate-pulse" style={{ width: j === 0 ? 80 : "70%" }} />
                    </td>
                  ))}
                </tr>
              ))}
              {!histLoad && (hist as any[])?.map((s: any) => (
                <tr key={s.id} className="border-b border-line/30 hover:bg-white/[0.02] transition">
                  <td className="px-3 py-2.5 font-medium text-white">{s.user?.username ?? s.userId.slice(0,8)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{fmt(s.betAmount)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-white/70">{s.minesCount}</td>
                  <td className="px-3 py-2.5 tabular-nums text-white/70">{(s.clickedTiles as any[])?.filter((t: any) => !t.isMine).length ?? 0}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-semibold",
                      s.status === "CASHED_OUT" ? "bg-ok/15 text-ok" :
                      s.status === "BUSTED"     ? "bg-bad/15 text-bad" :
                      "bg-yellow-500/15 text-yellow-400"
                    )}>{s.status}</span>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums font-bold">{Number(s.multiplier).toFixed(2)}x</td>
                  <td className={cn("px-3 py-2.5 tabular-nums font-semibold", s.payout > 0 ? "text-ok" : "text-bad")}>
                    {fmt(s.payout ?? 0)}
                  </td>
                  <td className="px-3 py-2.5 text-white/40 text-xs">{fmtDate(s.createdAt)}</td>
                </tr>
              ))}
              {!histLoad && !(hist as any[])?.length && (
                <tr><td colSpan={8} className="text-center py-10 text-white/30">No game history yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
