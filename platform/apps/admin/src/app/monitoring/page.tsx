"use client";
import { useLiveData } from "@/lib/hooks";
import { PageHeader, GlassCard, StatCard, Badge, LiveDot, gaugeColor } from "@/components/ui";
import { Cpu, MemoryStick, Database, Activity, Users, Gamepad2, ArrowDownToLine, ArrowUpToLine, Trophy, Server } from "lucide-react";
import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from "recharts";

interface Monitoring {
  online: { users: number; openBets: number; activeSessions: number; sessionsByGame: Record<string, number> };
  flow: { depositsHour: { count: number; amount: number }; withdrawalsHour: { count: number; amount: number } };
  bigWins: { username: string; amount: number; at: string }[];
  system: {
    cpuCount: number; load1: number; loadPct: number;
    memTotalMB: number; memUsedMB: number; memUsedPct: number;
    heapUsedMB: number; rssMB: number; uptimeSec: number; dbLatencyMs: number;
  };
}

const inr = (n: number) => `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n)}`;
const fmt = (n: number) => new Intl.NumberFormat("en-IN").format(n);

function uptime(sec: number) {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function MonitoringPage() {
  const { data, isLoading } = useLiveData<Monitoring>("/admin/monitoring", 4000);
  const s = data?.system;

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title="Real-time Monitoring" subtitle="Live platform & server health" right={<LiveDot label="Live · 4s" />} />

      {/* Live activity cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Online Users"    value={fmt(data?.online.users ?? 0)}        Icon={Users}     accent="emerald" loading={isLoading} sub="active in 5 min" />
        <StatCard label="Active Sessions" value={fmt(data?.online.activeSessions ?? 0)} Icon={Gamepad2}  accent="violet"  loading={isLoading} sub="live casino rounds" />
        <StatCard label="Open Bets"       value={fmt(data?.online.openBets ?? 0)}     Icon={Trophy}    accent="sky"     loading={isLoading} />
        <StatCard label="Deposits / hr"   value={inr(data?.flow.depositsHour.amount ?? 0)}    Icon={ArrowDownToLine} accent="emerald" loading={isLoading} sub={`${data?.flow.depositsHour.count ?? 0} txns`} />
        <StatCard label="Withdrawals / hr" value={inr(data?.flow.withdrawalsHour.amount ?? 0)} Icon={ArrowUpToLine}   accent="orange"  loading={isLoading} sub={`${data?.flow.withdrawalsHour.count ?? 0} txns`} />
        <StatCard label="DB Latency"      value={`${s?.dbLatencyMs ?? "–"} ms`}       Icon={Database}  accent={(s?.dbLatencyMs ?? 0) > 200 ? "red" : "emerald"} loading={isLoading} sub="health probe" />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* System gauges */}
        <GlassCard className="p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Server size={18} className="text-yellow-400" />
            <h2 className="font-black text-gray-100">Server Health</h2>
            {s && <span className="ml-auto text-xs text-gray-500">uptime {uptime(s.uptimeSec)} · {s.cpuCount} vCPU</span>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 items-center">
            <Gauge label="CPU Load" pct={s?.loadPct ?? 0} subtitle={`load ${s?.load1 ?? 0}`} Icon={Cpu} />
            <Gauge label="Memory" pct={s?.memUsedPct ?? 0} subtitle={`${s?.memUsedMB ?? 0}/${s?.memTotalMB ?? 0} MB`} Icon={MemoryStick} />
            <Metric label="Heap (API)" value={`${s?.heapUsedMB ?? 0} MB`} Icon={Activity} />
            <Metric label="RSS (API)" value={`${s?.rssMB ?? 0} MB`} Icon={Activity} />
          </div>
        </GlassCard>

        {/* Active sessions by game */}
        <GlassCard className="p-5">
          <h2 className="font-black text-gray-100 mb-4">Live Sessions by Game</h2>
          <div className="space-y-2.5">
            {Object.entries(data?.online.sessionsByGame ?? { mines: 0, towers: 0, "chicken-road": 0, pump: 0 }).map(([game, count]) => {
              const max = Math.max(1, ...Object.values(data?.online.sessionsByGame ?? { x: 1 }));
              return (
                <div key={game}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="capitalize text-gray-300 font-medium">{game.replace("-", " ")}</span>
                    <span className="tabular-nums text-gray-400">{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-900/60 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-500" style={{ width: `${(count / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      </div>

      {/* Big wins feed */}
      <GlassCard className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Trophy size={18} className="text-amber-400" />
          <h2 className="font-black text-gray-100">Big Wins — last hour</h2>
        </div>
        {isLoading ? (
          <div className="grid sm:grid-cols-2 gap-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 bg-gray-700/40 rounded-lg animate-pulse" />)}</div>
        ) : (data?.bigWins.length ?? 0) === 0 ? (
          <p className="text-gray-500 text-sm py-4 text-center">No casino wins in the last hour</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {data!.bigWins.map((w, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-gray-900/40 border border-gray-700/50">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 grid place-items-center rounded-full bg-amber-500/15 text-amber-400 text-xs font-black">{i + 1}</span>
                  <span className="text-sm font-medium text-gray-200">{w.username}</span>
                </div>
                <Badge tone="emerald">+{inr(w.amount)}</Badge>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}

function Gauge({ label, pct, subtitle, Icon }: { label: string; pct: number; subtitle?: string; Icon?: any }) {
  const color = gaugeColor(pct);
  const chart = [{ value: pct, fill: color }];
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-28 h-28">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart innerRadius="72%" outerRadius="100%" data={chart} startAngle={90} endAngle={-270}>
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar background={{ fill: "#1f2937" }} dataKey="value" cornerRadius={10} isAnimationActive />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-black tabular-nums" style={{ color }}>{pct}%</span>
          {Icon && <Icon size={13} className="text-gray-500 mt-0.5" />}
        </div>
      </div>
      <p className="text-xs font-semibold text-gray-300 mt-1">{label}</p>
      {subtitle && <p className="text-[10px] text-gray-500">{subtitle}</p>}
    </div>
  );
}

function Metric({ label, value, Icon }: { label: string; value: string; Icon?: any }) {
  return (
    <div className="flex flex-col items-center justify-center h-28 rounded-xl bg-gray-900/40 border border-gray-700/50">
      {Icon && <Icon size={18} className="text-gray-500 mb-1.5" />}
      <span className="text-lg font-black text-gray-100 tabular-nums">{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-gray-500 mt-0.5">{label}</span>
    </div>
  );
}
