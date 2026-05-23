"use client";
import useSWR, { mutate } from "swr";
import { useState } from "react";
import { api, fetcher } from "@/lib/api";
import {
  Zap, TrendingUp, Users, DollarSign, BarChart2,
  Shield, Settings, AlertTriangle, RefreshCw,
} from "lucide-react";

type Difficulty = "EASY" | "MEDIUM" | "HARD" | "EXPERT" | "INSANE";

interface DifficultyParams {
  popChance: number;
  maxPumps: number;
}

interface PumpConfig {
  enabled: boolean;
  minBet: number;
  maxBet: number;
  maxPayout: number;
  rtpPercent: number;
  difficulties: Record<Difficulty, DifficultyParams>;
  forceWinUserId: string | null;
  forceWinPumps: number | null;
  forceLossUserId: string | null;
  forceNextPopPump: number | null;
}

interface PumpStats {
  totalSessions: number;
  totalCashed: number;
  totalPopped: number;
  totalWagered: number;
  totalPaid: number;
  houseProfit: number;
  actualRTP: number;
  avgBet: number;
  avgCashoutX: number;
  activePlayers: number;
  bigWins: { id: string; username: string; betAmount: number; multiplier: number; difficulty: string; payout: number; createdAt: string }[];
}

const CONFIG_KEY = "/casino/pump/admin/config";
const STATS_KEY  = "/casino/pump/admin/stats";

const RTP_PRESETS = [85, 90, 92, 95, 97, 99];

const DIFFICULTIES: Difficulty[] = ["EASY", "MEDIUM", "HARD", "EXPERT", "INSANE"];

export default function PumpAdminPage() {
  const { data: rawConfig, isLoading: configLoading } = useSWR<PumpConfig>(CONFIG_KEY, fetcher);
  const { data: stats, isLoading: statsLoading, mutate: refreshStats } = useSWR<PumpStats>(STATS_KEY, fetcher, { refreshInterval: 10_000 });

  const [form,   setForm]   = useState<Partial<PumpConfig> | null>(null);
  const [busy,   setBusy]   = useState(false);
  const [msg,    setMsg]    = useState<{ text: string; ok: boolean } | null>(null);

  // Win control inputs
  const [winUsername,  setWinUsername]  = useState("");
  const [winPumps,     setWinPumps]     = useState("5");
  const [lossUsername, setLossUsername] = useState("");
  const [globalPop,    setGlobalPop]    = useState("");

  const config = { ...(rawConfig ?? {}), ...(form ?? {}) } as PumpConfig;

  function patch<K extends keyof PumpConfig>(key: K, value: PumpConfig[K]) {
    setForm(prev => ({ ...(prev ?? rawConfig ?? {}), [key]: value }));
  }

  function patchDifficulty(d: Difficulty, field: keyof DifficultyParams, value: number) {
    const prev = (form?.difficulties ?? rawConfig?.difficulties ?? {}) as Record<Difficulty, DifficultyParams>;
    const nextDiff = { ...prev, [d]: { ...prev[d], [field]: value } } as Record<Difficulty, DifficultyParams>;
    setForm(p => ({ ...(p ?? rawConfig ?? {}), difficulties: nextDiff }));
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

  async function applyForceWin() {
    const pumps = parseInt(winPumps);
    if (!winUsername.trim()) { setMsg({ text: "Enter a username", ok: false }); return; }
    if (isNaN(pumps) || pumps < 1) { setMsg({ text: "Enter valid pump count", ok: false }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.post(CONFIG_KEY, { forceWinUsername: winUsername.trim(), forceWinPumps: pumps });
      mutate(CONFIG_KEY);
      setMsg({ text: `Next bet from '${winUsername}' will let them cash out up to pump #${pumps - 1}`, ok: true });
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message ?? "Failed", ok: false });
    } finally { setBusy(false); }
  }

  async function applyForceLoss() {
    if (!lossUsername.trim()) { setMsg({ text: "Enter a username", ok: false }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.post(CONFIG_KEY, { forceLossUsername: lossUsername.trim() });
      mutate(CONFIG_KEY);
      setMsg({ text: `Next bet from '${lossUsername}' will pop on pump #1`, ok: true });
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message ?? "Failed", ok: false });
    } finally { setBusy(false); }
  }

  async function clearForceWin() {
    setBusy(true);
    try { await api.post(CONFIG_KEY, { forceWinUsername: null }); mutate(CONFIG_KEY); setMsg({ text: "Force-win cleared.", ok: true }); }
    finally { setBusy(false); }
  }
  async function clearForceLoss() {
    setBusy(true);
    try { await api.post(CONFIG_KEY, { forceLossUsername: null }); mutate(CONFIG_KEY); setMsg({ text: "Force-loss cleared.", ok: true }); }
    finally { setBusy(false); }
  }

  async function applyGlobalPop() {
    const v = parseInt(globalPop);
    if (isNaN(v) || v < 1) { setMsg({ text: "Enter valid pop pump #", ok: false }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.post(CONFIG_KEY, { forceNextPopPump: v });
      mutate(CONFIG_KEY);
      setGlobalPop("");
      setMsg({ text: `Next session (any user) will pop on pump #${v}`, ok: true });
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message ?? "Failed", ok: false });
    } finally { setBusy(false); }
  }
  async function clearGlobalPop() {
    setBusy(true);
    try { await api.post(CONFIG_KEY, { forceNextPopPump: null }); mutate(CONFIG_KEY); setMsg({ text: "Global pop override cleared.", ok: true }); }
    finally { setBusy(false); }
  }

  function fmt(n: number) { return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n); }

  if (configLoading) return <div className="animate-pulse h-40 bg-panel/60 rounded-xl" />;

  return (
    <div className="space-y-6 max-w-6xl">
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

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Sessions", value: stats.totalSessions,                   icon: BarChart2,   color: "#3B82F6" },
            { label: "Cashed Out",     value: stats.totalCashed,                     icon: TrendingUp,  color: "#22C55E" },
            { label: "Popped",         value: stats.totalPopped,                     icon: AlertTriangle, color: "#EF4444" },
            { label: "Active (1h)",    value: stats.activePlayers,                   icon: Users,       color: "#A855F7" },
            { label: "Wagered",        value: `₹${fmt(stats.totalWagered)}`,         icon: DollarSign,  color: "#00FFB2" },
            { label: "Paid Out",       value: `₹${fmt(stats.totalPaid)}`,            icon: DollarSign,  color: "#3B82F6" },
            { label: "House Profit",   value: `₹${fmt(stats.houseProfit)}`,          icon: TrendingUp,  color: "#FFD700" },
            { label: "Actual RTP",     value: `${stats.actualRTP}%`,                 icon: Shield,      color: stats.actualRTP > 100 ? "#EF4444" : "#22C55E" },
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Game Config ─────────────────────────────────────── */}
        <section className="rounded-xl border border-line bg-panel/60 p-5 space-y-4">
          <h2 className="font-display text-xl flex items-center gap-2">
            <Settings size={18} className="text-accentSoft" /> Game Config
          </h2>

          <label className="flex items-center justify-between rounded-lg border border-line bg-panel/40 px-4 py-3 cursor-pointer hover:border-accent transition">
            <span className="text-sm">Game Enabled</span>
            <input
              type="checkbox"
              className="w-4 h-4 accent-orange-500"
              checked={config.enabled ?? true}
              onChange={e => patch("enabled", e.target.checked)}
            />
          </label>

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
          </div>

          <button
            onClick={save}
            disabled={busy || !form}
            className="w-full rounded-lg bg-accent-grad py-2.5 font-bold text-ink shadow-glow disabled:opacity-40 hover:brightness-110 transition text-sm"
          >
            {busy ? "Saving…" : "Save Config"}
          </button>
        </section>

        {/* ── RTP Control ────────────────────────────────────── */}
        <section className="rounded-xl border border-line bg-panel/60 p-5 space-y-4">
          <h2 className="font-display text-xl flex items-center gap-2">
            <Shield size={18} className="text-accentSoft" /> RTP Control
          </h2>
          <p className="text-xs text-white/50">
            Global RTP multiplier — scales every multiplier in every difficulty. Current: <span className="font-bold text-white">{config.rtpPercent ?? 97}%</span>
          </p>

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
                  borderColor: (config.rtpPercent ?? 97) === rtp ? "#ff7a18" : "rgba(255,255,255,0.08)",
                  color: (config.rtpPercent ?? 97) === rtp ? "#fff" : "rgba(255,255,255,0.6)",
                }}
              >
                {rtp}%
              </button>
            ))}
          </div>

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

        {/* ── Per-difficulty controls ──────────────────────────── */}
        <section className="rounded-xl border border-line bg-panel/60 p-5 space-y-4 lg:col-span-2">
          <h2 className="font-display text-xl flex items-center gap-2">
            <Zap size={18} className="text-accentSoft" /> Difficulty Tuning
          </h2>
          <p className="text-xs text-white/50">
            Pop chance = probability balloon pops on each pump (higher = more loss per pump, bigger multipliers).
            Max pumps = hard ceiling on pump count.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-white/40">
                  <th className="text-left py-2 pr-2">Difficulty</th>
                  <th className="text-left py-2 pr-2">Pop Chance / Pump</th>
                  <th className="text-left py-2 pr-2">Max Pumps</th>
                  <th className="text-left py-2 pr-2">First × (preview)</th>
                </tr>
              </thead>
              <tbody>
                {DIFFICULTIES.map(d => {
                  const params = config.difficulties?.[d] ?? { popChance: 0.04, maxPumps: 25 };
                  const rtp = config.rtpPercent ?? 97;
                  const firstMult = ((rtp / 100) / (1 - params.popChance)).toFixed(2);
                  return (
                    <tr key={d} className="border-t border-white/5">
                      <td className="py-3 pr-2 font-bold">{d}</td>
                      <td className="py-3 pr-2">
                        <input
                          type="number"
                          step="0.01" min="0.01" max="0.95"
                          value={params.popChance}
                          onChange={e => patchDifficulty(d, "popChance", Math.min(0.95, Math.max(0.01, Number(e.target.value))))}
                          className="inp w-28"
                        />
                        <span className="text-[10px] text-white/40 ml-2">{(params.popChance * 100).toFixed(1)}%</span>
                      </td>
                      <td className="py-3 pr-2">
                        <input
                          type="number" min={3} max={50}
                          value={params.maxPumps}
                          onChange={e => patchDifficulty(d, "maxPumps", Math.min(50, Math.max(3, Number(e.target.value))))}
                          className="inp w-20"
                        />
                      </td>
                      <td className="py-3 pr-2 text-white/70 tabular-nums">{firstMult}×</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            onClick={save}
            disabled={busy || !form}
            className="w-full rounded-lg bg-accent-grad py-2.5 font-bold text-ink shadow-glow disabled:opacity-40 hover:brightness-110 transition text-sm"
          >
            {busy ? "Saving…" : "Save Difficulty Settings"}
          </button>
        </section>

        {/* ── Win Control ─────────────────────────────────────── */}
        <section className="rounded-xl border border-emerald-900/40 bg-emerald-950/10 p-5 space-y-3">
          <h2 className="font-display text-xl flex items-center gap-2 text-emerald-400">
            <TrendingUp size={18} /> Force Win
          </h2>
          <p className="text-xs text-white/50">
            Make a specific user's next session pop at pump #N — they can cash out anywhere up to pump #N-1.
            {rawConfig?.forceWinUserId && (
              <span className="ml-1 font-bold text-emerald-400">
                Active: pop pump #{rawConfig.forceWinPumps}
              </span>
            )}
          </p>
          <Fld label="Username">
            <input type="text" value={winUsername} onChange={e => setWinUsername(e.target.value)} placeholder="player_username" className="inp" />
          </Fld>
          <Fld label="Pop on Pump #">
            <input type="number" min={2} value={winPumps} onChange={e => setWinPumps(e.target.value)} className="inp" />
          </Fld>
          <div className="flex gap-2">
            <button
              onClick={applyForceWin}
              disabled={busy}
              className="flex-1 py-2.5 rounded-lg font-bold text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 transition text-white"
            >
              Set Force Win
            </button>
            {rawConfig?.forceWinUserId && (
              <button
                onClick={clearForceWin}
                disabled={busy}
                className="px-4 py-2.5 rounded-lg font-bold text-sm border border-emerald-900/40 hover:border-emerald-600 text-emerald-400 transition"
              >Clear</button>
            )}
          </div>
        </section>

        {/* ── Loss Control ────────────────────────────────────── */}
        <section className="rounded-xl border border-red-900/40 bg-red-950/10 p-5 space-y-3">
          <h2 className="font-display text-xl flex items-center gap-2 text-red-400">
            <AlertTriangle size={18} /> Force Loss
          </h2>
          <p className="text-xs text-white/50">
            Make a specific user's next session pop on pump #1 (instant loss). One-time use.
            {rawConfig?.forceLossUserId && <span className="ml-1 font-bold text-red-400">Active</span>}
          </p>
          <Fld label="Username">
            <input type="text" value={lossUsername} onChange={e => setLossUsername(e.target.value)} placeholder="player_username" className="inp" />
          </Fld>
          <div className="flex gap-2">
            <button
              onClick={applyForceLoss}
              disabled={busy}
              className="flex-1 py-2.5 rounded-lg font-bold text-sm bg-red-600 hover:bg-red-500 disabled:opacity-40 transition text-white"
            >
              Set Force Loss
            </button>
            {rawConfig?.forceLossUserId && (
              <button
                onClick={clearForceLoss}
                disabled={busy}
                className="px-4 py-2.5 rounded-lg font-bold text-sm border border-red-900/40 hover:border-red-600 text-red-400 transition"
              >Clear</button>
            )}
          </div>
        </section>

        {/* ── Global pop override ─────────────────────────────── */}
        <section className="rounded-xl border border-amber-900/40 bg-amber-950/10 p-5 space-y-3">
          <h2 className="font-display text-xl flex items-center gap-2 text-amber-400">
            <AlertTriangle size={18} /> Global Next-Pop Override
          </h2>
          <p className="text-xs text-white/50">
            Force the next session (any user, any difficulty) to pop on a specific pump #.
            One-time use.
            {rawConfig?.forceNextPopPump != null && (
              <span className="ml-1 font-bold text-amber-400">Active: pop #{rawConfig.forceNextPopPump}</span>
            )}
          </p>
          <Fld label="Pop on Pump #">
            <input type="number" min={1} value={globalPop} onChange={e => setGlobalPop(e.target.value)} className="inp" />
          </Fld>
          <div className="flex gap-2">
            <button
              onClick={applyGlobalPop}
              disabled={busy || !globalPop}
              className="flex-1 py-2.5 rounded-lg font-bold text-sm bg-amber-600 hover:bg-gray-8000 disabled:opacity-40 transition text-white"
            >
              Set Override
            </button>
            {rawConfig?.forceNextPopPump != null && (
              <button
                onClick={clearGlobalPop}
                disabled={busy}
                className="px-4 py-2.5 rounded-lg font-bold text-sm border border-amber-900/40 hover:border-amber-600 text-amber-400 transition"
              >Clear</button>
            )}
          </div>
        </section>

        {/* ── Big Wins ────────────────────────────────────────── */}
        <section className="rounded-xl border border-line bg-panel/60 p-5 space-y-3 lg:col-span-2">
          <h2 className="font-display text-xl flex items-center gap-2">
            <TrendingUp size={18} className="text-accentSoft" /> Top Wins
          </h2>
          {statsLoading && <div className="animate-pulse h-24 bg-gray-800/5 rounded-lg" />}
          {stats?.bigWins?.length === 0 && <p className="text-sm text-white/40">No wins yet.</p>}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {stats?.bigWins?.map(w => (
              <div key={w.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-800/4 border border-line">
                <div>
                  <p className="text-sm font-bold text-white">{w.username}</p>
                  <p className="text-[11px] text-white/50">Bet ₹{fmt(w.betAmount)} · {w.difficulty}</p>
                </div>
                <div className="text-right">
                  <p className="font-black" style={{ color: "#FFD700" }}>{w.multiplier.toFixed(2)}×</p>
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
