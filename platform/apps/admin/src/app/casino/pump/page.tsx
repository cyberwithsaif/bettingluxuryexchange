"use client";
import useSWR, { mutate } from "swr";
import { useState } from "react";
import { api, fetcher } from "@/lib/api";
import {
  Zap, TrendingUp, Users, DollarSign, BarChart2,
  Shield, Settings, AlertTriangle, RefreshCw,
} from "lucide-react";

interface PumpConfig {
  enabled: boolean;
  minBet: number;
  maxBet: number;
  maxPayout: number;
  rtpPercent: number;
  autoCashLimit: number;
  forceNextCrash: number | null;
}

interface PumpStats {
  totalRounds: number;
  totalBets: number;
  totalWagered: number;
  totalPaid: number;
  houseProfit: number;
  actualRTP: number;
  avgBet: number;
  avgCashout: number;
  activePlayers: number;
  currentRound: string | null;
  bigWins: { id: string; username: string; betAmount: number; cashOutAt: number; payout: number; createdAt: string }[];
}

const CONFIG_KEY = "/casino/pump/admin/config";
const STATS_KEY  = "/casino/pump/admin/stats";

const RTP_PRESETS = [85, 90, 92, 95, 97, 99];

export default function PumpAdminPage() {
  const { data: rawConfig, isLoading: configLoading } = useSWR<PumpConfig>(CONFIG_KEY, fetcher);
  const { data: stats, isLoading: statsLoading, mutate: refreshStats } = useSWR<PumpStats>(STATS_KEY, fetcher, { refreshInterval: 10_000 });

  const [form,   setForm]   = useState<Partial<PumpConfig> | null>(null);
  const [busy,   setBusy]   = useState(false);
  const [msg,    setMsg]    = useState<{ text: string; ok: boolean } | null>(null);
  const [forceCrash, setForceCrash] = useState("");

  const config  = { ...(rawConfig ?? {}), ...(form ?? {}) } as PumpConfig;

  function patch<K extends keyof PumpConfig>(key: K, value: PumpConfig[K]) {
    setForm(prev => ({ ...(prev ?? rawConfig ?? {}), [key]: value }));
  }

  async function save() {
    if (!form) return;
    setBusy(true); setMsg(null);
    try {
      await api.post(CONFIG_KEY, form);
      mutate(CONFIG_KEY);
      setForm(null);
      setMsg({ text: "Pump config saved.", ok: true });
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message ?? "Save failed", ok: false });
    } finally { setBusy(false); }
  }

  async function applyForceNextCrash() {
    const v = parseFloat(forceCrash);
    if (isNaN(v) || v < 1) { setMsg({ text: "Enter a valid multiplier ≥ 1.00", ok: false }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.post(CONFIG_KEY, { forceNextCrash: v });
      mutate(CONFIG_KEY);
      setForceCrash("");
      setMsg({ text: `Next round will crash at ${v.toFixed(2)}×`, ok: true });
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message ?? "Failed", ok: false });
    } finally { setBusy(false); }
  }

  async function clearForceNextCrash() {
    setBusy(true);
    try {
      await api.post(CONFIG_KEY, { forceNextCrash: null });
      mutate(CONFIG_KEY);
      setMsg({ text: "Force crash cleared.", ok: true });
    } finally { setBusy(false); }
  }

  function fmt(n: number) { return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n); }

  if (configLoading) return <div className="animate-pulse h-40 bg-panel/60 rounded-xl" />;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl flex items-center gap-3">
          <span className="text-3xl">🎈</span> Pump Game Admin
        </h1>
        <button
          onClick={() => refreshStats()}
          className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-line hover:border-accent transition"
        >
          <RefreshCw size={14} /> Refresh Stats
        </button>
      </div>

      {msg && (
        <div className={`text-sm px-4 py-2.5 rounded-lg border ${msg.ok ? "bg-ok/10 border-ok/30 text-ok" : "bg-bad/10 border-bad/30 text-bad"}`}>
          {msg.text}
        </div>
      )}

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Rounds",  value: stats.totalRounds,                     icon: BarChart2,   color: "#3B82F6" },
            { label: "Total Bets",    value: stats.totalBets,                        icon: Users,       color: "#8A5CFF" },
            { label: "Wagered (₹)",   value: `₹${fmt(stats.totalWagered)}`,          icon: DollarSign,  color: "#00FFB2" },
            { label: "House Profit",  value: `₹${fmt(stats.houseProfit)}`,           icon: TrendingUp,  color: "#FFD700" },
            { label: "Actual RTP",    value: `${stats.actualRTP}%`,                  icon: Shield,      color: stats.actualRTP > 100 ? "#FF375F" : "#00FFB2" },
            { label: "Avg Bet",       value: `₹${fmt(stats.avgBet)}`,                icon: DollarSign,  color: "#3B82F6" },
            { label: "Avg Cashout",   value: `${(stats.avgCashout || 0).toFixed(2)}×`, icon: Zap,       color: "#FFD700" },
            { label: "Active (1h)",   value: stats.activePlayers,                    icon: Users,       color: "#00FFB2" },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-line bg-panel/60 p-4">
              <div className="flex items-center gap-2 mb-1">
                <s.icon size={14} style={{ color: s.color }} />
                <span className="text-[11px] uppercase tracking-wider text-white/50">{s.label}</span>
              </div>
              <p className="text-xl font-black" style={{ color: s.color }}>{String(s.value)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* ── Game Config ─────────────────────────────────────── */}
        <section className="rounded-xl border border-line bg-panel/60 p-5 space-y-4">
          <h2 className="font-display text-xl flex items-center gap-2">
            <Settings size={18} className="text-accentSoft" /> Game Config
          </h2>

          {/* Enable/disable */}
          <label className="flex items-center justify-between rounded-lg border border-line bg-panel/40 px-4 py-3 cursor-pointer hover:border-accent transition">
            <span className="text-sm">Game Enabled</span>
            <input
              type="checkbox"
              className="w-4 h-4 accent-orange-500"
              checked={config.enabled ?? true}
              onChange={e => patch("enabled", e.target.checked)}
            />
          </label>

          {/* Betting limits */}
          <div className="grid grid-cols-2 gap-3">
            <Fld label="Min Bet (₹)">
              <input type="number" min={1} value={config.minBet ?? 10} className="inp"
                onChange={e => patch("minBet", Number(e.target.value))} />
            </Fld>
            <Fld label="Max Bet (₹)">
              <input type="number" min={100} value={config.maxBet ?? 100000} className="inp"
                onChange={e => patch("maxBet", Number(e.target.value))} />
            </Fld>
            <Fld label="Max Payout (₹)">
              <input type="number" min={1000} value={config.maxPayout ?? 5000000} className="inp"
                onChange={e => patch("maxPayout", Number(e.target.value))} />
            </Fld>
            <Fld label="Auto Cash Limit (×)">
              <input type="number" min={2} step={1} value={config.autoCashLimit ?? 100} className="inp"
                onChange={e => patch("autoCashLimit", Number(e.target.value))} />
            </Fld>
          </div>

          <button
            onClick={save}
            disabled={busy || !form}
            className="w-full rounded-lg bg-accent-grad py-2.5 font-bold text-ink shadow-glow disabled:opacity-40 hover:brightness-110 transition text-sm"
          >
            {busy ? "Saving…" : "Save Config"}
          </button>
        </section>

        {/* ── RTP Control ─────────────────────────────────────── */}
        <section className="rounded-xl border border-line bg-panel/60 p-5 space-y-4">
          <h2 className="font-display text-xl flex items-center gap-2">
            <Shield size={18} className="text-accentSoft" /> RTP Control
          </h2>
          <p className="text-xs text-white/50">
            Controls crash-point probability distribution. Higher RTP = rarer early crashes. Current: <span className="font-bold text-white">{config.rtpPercent ?? 97}%</span>
          </p>

          {/* Preset buttons */}
          <div className="grid grid-cols-3 gap-2">
            {RTP_PRESETS.map(rtp => (
              <button
                key={rtp}
                onClick={() => patch("rtpPercent", rtp)}
                className="py-2 rounded-lg text-sm font-bold transition-all hover:brightness-110 border"
                style={{
                  background: (config.rtpPercent ?? 97) === rtp
                    ? "linear-gradient(135deg,#ff7a18,#ff4500)"
                    : "rgba(255,255,255,0.05)",
                  borderColor: (config.rtpPercent ?? 97) === rtp
                    ? "#ff7a18"
                    : "rgba(255,255,255,0.08)",
                  color: (config.rtpPercent ?? 97) === rtp ? "#fff" : "rgba(255,255,255,0.6)",
                }}
              >
                {rtp}%
              </button>
            ))}
          </div>

          {/* Custom RTP slider */}
          <Fld label={`Custom RTP: ${config.rtpPercent ?? 97}%`}>
            <input
              type="range" min={80} max={99} step={1}
              value={config.rtpPercent ?? 97}
              className="w-full accent-orange-500"
              onChange={e => patch("rtpPercent", Number(e.target.value))}
            />
            <div className="flex justify-between text-[10px] text-white/40 mt-0.5">
              <span>80% (tight)</span>
              <span>99% (loose)</span>
            </div>
          </Fld>

          <button
            onClick={save}
            disabled={busy || !form}
            className="w-full rounded-lg bg-accent-grad py-2.5 font-bold text-ink shadow-glow disabled:opacity-40 hover:brightness-110 transition text-sm"
          >
            {busy ? "Saving…" : "Apply RTP"}
          </button>
        </section>

        {/* ── Win Control (Force Crash) ────────────────────────── */}
        <section className="rounded-xl border border-red-900/40 bg-red-950/10 p-5 space-y-4">
          <h2 className="font-display text-xl flex items-center gap-2 text-red-400">
            <AlertTriangle size={18} /> Winning Control
          </h2>
          <p className="text-xs text-white/50">
            Force the next round to crash at a specific multiplier. Overrides the provably fair result for ONE round only.
            {rawConfig?.forceNextCrash && (
              <span className="ml-1 font-bold text-red-400">
                Active: next crash at {rawConfig.forceNextCrash.toFixed(2)}×
              </span>
            )}
          </p>

          <Fld label="Force Next Crash At (×)">
            <input
              type="number"
              step="0.01"
              min="1"
              placeholder="e.g. 1.50"
              value={forceCrash}
              onChange={e => setForceCrash(e.target.value)}
              className="inp border-red-900/40 focus:border-red-500"
            />
          </Fld>

          <div className="grid grid-cols-2 gap-2">
            {/* Quick presets */}
            {[1.00, 1.50, 2.00, 5.00].map(v => (
              <button
                key={v}
                onClick={() => setForceCrash(String(v))}
                className="py-1.5 rounded-lg text-xs font-bold border border-red-900/40 hover:border-red-600/60 text-red-400 hover:text-red-300 transition"
              >
                {v.toFixed(2)}×
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={applyForceNextCrash}
              disabled={busy || !forceCrash}
              className="flex-1 py-2.5 rounded-lg font-bold text-sm bg-red-600 hover:bg-red-500 disabled:opacity-40 transition text-white"
            >
              Set Force Crash
            </button>
            {rawConfig?.forceNextCrash && (
              <button
                onClick={clearForceNextCrash}
                disabled={busy}
                className="px-4 py-2.5 rounded-lg font-bold text-sm border border-red-900/40 hover:border-red-600 text-red-400 transition"
              >
                Clear
              </button>
            )}
          </div>
        </section>

        {/* ── Big Wins ────────────────────────────────────────── */}
        <section className="rounded-xl border border-line bg-panel/60 p-5 space-y-3">
          <h2 className="font-display text-xl flex items-center gap-2">
            <TrendingUp size={18} className="text-accentSoft" /> Top Wins
          </h2>
          {statsLoading && <div className="animate-pulse h-24 bg-white/5 rounded-lg" />}
          {stats?.bigWins?.length === 0 && (
            <p className="text-sm text-white/40">No wins yet.</p>
          )}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {stats?.bigWins?.map(w => (
              <div key={w.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/4 border border-line">
                <div>
                  <p className="text-sm font-bold text-white">{w.username}</p>
                  <p className="text-[11px] text-white/50">Bet ₹{fmt(w.betAmount)}</p>
                </div>
                <div className="text-right">
                  <p className="font-black" style={{ color: "#FFD700" }}>{w.cashOutAt.toFixed(2)}×</p>
                  <p className="text-xs text-white/70">₹{fmt(w.payout)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <style jsx>{`
        :global(.inp) {
          width: 100%;
          background: #0d0e15;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          padding: 9px 11px;
          font-size: 14px;
          color: #e6e7eb;
        }
        :global(.inp:focus) { outline: none; border-color: #ff7a18; }
      `}</style>
    </div>
  );
}

function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-white/50">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
