"use client";
import { useEffect, useState } from "react";
import { mutate as globalMutate } from "swr";
import { api } from "@/lib/api";
import { useLiveData } from "@/lib/hooks";
import { PageHeader, GlassCard, StatCard } from "@/components/ui";
import {
  Gauge, TrendingUp, TrendingDown, Wallet, Gamepad2, Save, Skull,
  Sparkles, Lock, Zap, AlertTriangle,
} from "lucide-react";

interface GameStats { wagered: number; payout: number; pl: number; bets: number; wins: number; winRate: number; }
interface GameKeys { houseEdge?: string; hardness?: string; minBet: string; maxBet: string; enabled: string; }
interface Game {
  id: string; name: string; emoji: string;
  controlType: "edge" | "rtp" | "fixed";
  target: "platform" | "endpoint" | "none";
  endpoint?: string; hasHardness?: boolean; hasForce?: boolean;
  keys?: GameKeys;
  config: {
    houseEdge?: number; hardness?: number; rtpPercent?: number;
    maxPayout?: number; minBet?: number; maxBet?: number; enabled?: boolean;
  };
  stats: GameStats;
}
interface PlControl { games: Game[]; summary: { wagered: number; payout: number; pl: number; bets: number }; }

const KEY = "/admin/pl-control";
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export default function PlControlPage() {
  const { data, isLoading } = useLiveData<PlControl>(KEY, 15000);
  const s = data?.summary;

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title="P/L Control" subtitle="Win / loss, house edge & difficulty controls for every casino game" />

      {/* Banner */}
      <div className="rounded-xl px-4 py-3 flex items-start gap-3 border" style={{ background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.3)" }}>
        <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
        <p className="text-xs text-red-200/80 leading-relaxed">
          <b className="text-red-300">House P/L = money kept by the casino.</b> Each game's <b>Player Payout (RTP)</b> slider runs 0–100% — drag <b>left = house wins more</b> (more profit), <b>right = players win more</b>. Changes apply to new bets immediately.
        </p>
      </div>

      {/* Global summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Wagered" value={inr(s?.wagered ?? 0)} Icon={Wallet}   accent="sky"     loading={isLoading} sub="all casino games" />
        <StatCard label="Total Paid Out" value={inr(s?.payout ?? 0)} Icon={TrendingDown} accent="amber" loading={isLoading} sub="to players" />
        <StatCard label="House P/L" value={inr(s?.pl ?? 0)} Icon={(s?.pl ?? 0) >= 0 ? TrendingUp : Skull} accent={(s?.pl ?? 0) >= 0 ? "emerald" : "red"} loading={isLoading} sub={(s?.pl ?? 0) >= 0 ? "house profit" : "house loss"} />
        <StatCard label="Total Bets" value={(s?.bets ?? 0).toLocaleString("en-IN")} Icon={Gamepad2} accent="violet" loading={isLoading} />
      </div>

      {/* Game controls */}
      <div className="grid lg:grid-cols-2 gap-4">
        {(data?.games ?? []).map((g) => <GameControl key={g.id} game={g} />)}
      </div>
    </div>
  );
}

function GameControl({ game }: { game: Game }) {
  const c = game.config;
  const [edge, setEdge] = useState(c.houseEdge ?? 0);
  const [hardness, setHardness] = useState(c.hardness ?? 0);
  const [rtp, setRtp] = useState(c.rtpPercent ?? 97);
  const [maxPayout, setMaxPayout] = useState(c.maxPayout ?? 0);
  const [minBet, setMinBet] = useState(c.minBet ?? 10);
  const [maxBet, setMaxBet] = useState(c.maxBet ?? 100000);
  const [enabled, setEnabled] = useState(c.enabled ?? true);
  const [forceWin, setForceWin] = useState("");
  const [forceWinPumps, setForceWinPumps] = useState(5);
  const [forceLoss, setForceLoss] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Re-sync local state when fresh server data arrives
  useEffect(() => {
    setEdge(c.houseEdge ?? 0); setHardness(c.hardness ?? 0); setRtp(c.rtpPercent ?? 97);
    setMaxPayout(c.maxPayout ?? 0); setMinBet(c.minBet ?? 10); setMaxBet(c.maxBet ?? 100000);
    setEnabled(c.enabled ?? true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.houseEdge, c.hardness, c.rtpPercent, c.maxPayout, c.minBet, c.maxBet, c.enabled]);

  const stats = game.stats;
  const houseProfit = stats.pl >= 0;

  async function save() {
    setBusy(true); setMsg(null);
    try {
      if (game.target === "platform" && game.keys) {
        const body: Record<string, unknown> = {
          [game.keys.minBet]: minBet, [game.keys.maxBet]: maxBet, [game.keys.enabled]: enabled,
        };
        if (game.keys.houseEdge) body[game.keys.houseEdge] = edge;
        if (game.keys.hardness) body[game.keys.hardness] = hardness;
        await api.post("/admin/pl-control", body);
      } else if (game.target === "endpoint" && game.endpoint) {
        const body: Record<string, unknown> = { rtpPercent: rtp, maxPayout, minBet, maxBet, enabled };
        if (game.hasForce) {
          if (forceWin.trim()) { body.forceWinUsername = forceWin.trim(); body.forceWinPumps = forceWinPumps; }
          if (forceLoss.trim()) body.forceLossUsername = forceLoss.trim();
        }
        await api.post(game.endpoint, body);
        setForceWin(""); setForceLoss("");
      }
      setMsg({ ok: true, text: "Saved — applies to new bets." });
      globalMutate(KEY);
    } catch (e: any) {
      setMsg({ ok: false, text: e?.response?.data?.message || "Save failed" });
    } finally { setBusy(false); }
  }

  async function clearForce(kind: "win" | "loss") {
    if (!game.endpoint) return;
    setBusy(true);
    try {
      await api.post(game.endpoint, kind === "win" ? { forceWinUsername: null } : { forceLossUsername: null });
      setMsg({ ok: true, text: `Force-${kind} cleared.` });
      globalMutate(KEY);
    } catch { setMsg({ ok: false, text: "Failed" }); }
    finally { setBusy(false); }
  }

  return (
    <GlassCard className="p-5 flex flex-col">
      {/* Header + enabled */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">{game.emoji}</span>
          <div>
            <div className="font-black text-gray-100">{game.name}</div>
            <div className="text-[10px] uppercase tracking-wider text-gray-500">
              {game.controlType === "edge" ? "House-edge control" : game.controlType === "rtp" ? "RTP control" : "Fixed odds"}
            </div>
          </div>
        </div>
        {game.controlType !== "fixed" ? (
          <button onClick={() => setEnabled((v) => !v)}
            className={`relative w-12 h-6 rounded-full transition ${enabled ? "bg-emerald-500" : "bg-gray-600"}`} title={enabled ? "Enabled" : "Disabled"}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${enabled ? "left-[26px]" : "left-0.5"}`} />
          </button>
        ) : (
          <span className="text-[10px] text-gray-500 flex items-center gap-1"><Lock size={11} /> built-in</span>
        )}
      </div>

      {/* Live stats */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <Mini label="Wagered" value={inr(stats.wagered)} />
        <Mini label="Paid Out" value={inr(stats.payout)} />
        <Mini label="House P/L" value={(houseProfit ? "+" : "") + inr(stats.pl)} tone={houseProfit ? "#34d399" : "#f87171"} />
        <Mini label="Win Rate" value={`${stats.winRate}%`} sub={`${stats.bets} bets`} />
      </div>

      {/* Controls */}
      {game.controlType === "edge" && (
        <div className="space-y-3">
          <Slider label="Player Payout (RTP)" value={Math.round((1 - edge) * 100)} min={0} max={100} step={1}
            onChange={(v) => setEdge((100 - v) / 100)} suffix="%" hint="← house wins   ·   players win →" tone="#34d399" />
          {game.hasHardness && (
            <Slider label="Extra Difficulty" value={hardness} min={0} max={10} step={1}
              onChange={setHardness} suffix="" hint="bias toward harder boards (0 = off)" tone="#fbbf24" />
          )}
          <BetRange minBet={minBet} maxBet={maxBet} setMin={setMinBet} setMax={setMaxBet} />
        </div>
      )}

      {game.controlType === "rtp" && (
        <div className="space-y-3">
          <Slider label="Player Payout (RTP)" value={rtp} min={0} max={100} step={1}
            onChange={setRtp} suffix="%" hint="← house wins   ·   players win →" tone="#34d399" />
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">Max Payout (₹, 0 = unlimited)</label>
            <input type="number" value={maxPayout} onChange={(e) => setMaxPayout(Number(e.target.value) || 0)}
              className="w-full bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-yellow-400/60" />
          </div>
          <BetRange minBet={minBet} maxBet={maxBet} setMin={setMinBet} setMax={setMaxBet} />
          {game.hasForce && (
            <div className="rounded-lg border border-gray-700/60 p-3 space-y-2.5 bg-gray-900/30">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1"><Zap size={11} className="text-yellow-400" /> Per-user overrides</div>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-[10px] text-emerald-400 block mb-1">Force WIN — username</label>
                  <input value={forceWin} onChange={(e) => setForceWin(e.target.value)} placeholder="username"
                    className="w-full bg-gray-900/60 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-emerald-400/60" />
                </div>
                <div className="w-20">
                  <label className="text-[10px] text-gray-500 block mb-1">pumps</label>
                  <input type="number" value={forceWinPumps} onChange={(e) => setForceWinPumps(Number(e.target.value) || 1)}
                    className="w-full bg-gray-900/60 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-emerald-400/60" />
                </div>
                <button onClick={() => clearForce("win")} className="text-[10px] px-2 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white">Clear</button>
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-[10px] text-red-400 block mb-1">Force LOSS — username</label>
                  <input value={forceLoss} onChange={(e) => setForceLoss(e.target.value)} placeholder="username"
                    className="w-full bg-gray-900/60 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-red-400/60" />
                </div>
                <button onClick={() => clearForce("loss")} className="text-[10px] px-2 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white">Clear</button>
              </div>
            </div>
          )}
        </div>
      )}

      {game.controlType === "fixed" && (
        <div className="rounded-lg bg-gray-900/40 border border-gray-700/50 px-4 py-3 text-sm text-gray-400 flex items-center gap-2">
          <Sparkles size={14} className="text-yellow-400" />
          European roulette — fixed mathematical odds (~2.7% house edge). No manual tuning.
        </div>
      )}

      {/* Save */}
      {game.controlType !== "fixed" && (
        <div className="mt-4 flex items-center gap-3">
          <button onClick={save} disabled={busy}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-red-500 to-red-600 hover:brightness-110 disabled:opacity-50 transition">
            <Save size={15} /> {busy ? "Saving…" : "Save"}
          </button>
          {msg && <span className={`text-xs ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</span>}
        </div>
      )}
    </GlassCard>
  );
}

function Mini({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-gray-900/40 border border-gray-700/40 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className="text-sm font-bold tabular-nums leading-tight truncate" style={{ color: tone ?? "#e5e7eb" }}>{value}</div>
      {sub && <div className="text-[9px] text-gray-600">{sub}</div>}
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, suffix, hint, tone }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; suffix: string; hint: string; tone: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] uppercase tracking-wider text-gray-500">{label}</label>
        <span className="text-sm font-black tabular-nums" style={{ color: tone }}>{value.toFixed(step < 1 ? 1 : 0)}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-red-500" style={{ accentColor: tone }} />
      <div className="text-[9px] text-gray-600 mt-0.5">{hint}</div>
    </div>
  );
}

function BetRange({ minBet, maxBet, setMin, setMax }: { minBet: number; maxBet: number; setMin: (v: number) => void; setMax: (v: number) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">Min Bet (₹)</label>
        <input type="number" value={minBet} onChange={(e) => setMin(Number(e.target.value) || 0)}
          className="w-full bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-yellow-400/60" />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">Max Bet (₹)</label>
        <input type="number" value={maxBet} onChange={(e) => setMax(Number(e.target.value) || 0)}
          className="w-full bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-yellow-400/60" />
      </div>
    </div>
  );
}
