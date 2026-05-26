"use client";
import { useLiveData } from "@/lib/hooks";
import {
  Users, UserCheck, UserPlus, Target, Percent, Clock,
  ArrowDownToLine, ArrowUpToLine, TrendingUp, TrendingDown,
  Activity, Gamepad2, Share2, AlertCircle, Wallet, ShieldAlert,
} from "lucide-react";

interface SeriesPoint { date: string; }
interface RevenuePoint extends SeriesPoint { pl: number; }
interface BetPoint extends SeriesPoint { sports: number; casino: number; total: number; }
interface GrowthPoint extends SeriesPoint { count: number; }
interface DepWdPoint extends SeriesPoint { deposits: number; withdrawals: number; }

interface DashboardData {
  users: number;
  onlineUsers: number;
  activeUsers24h: number;
  newRegistrationsToday: number;
  openBets: number;
  activeMarkets: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
  pendingWithdrawalAmount: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalProfit: number;
  todayPL: number;
  gameRevenue: number;
  affiliateRevenue: number;
  totalBalance: number;
  totalExposure: number;
  totalBets: number;
  betsWon: number;
  betsLost: number;
  revenueSeries: RevenuePoint[];
  betActivitySeries: BetPoint[];
  userGrowthSeries: GrowthPoint[];
  depositWithdrawalSeries: DepWdPoint[];
}

const fmtFull = (n: number | undefined) =>
  n == null ? "–" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
const fmtCompact = (n: number | undefined) =>
  n == null ? "–" : new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const money = (n: number | undefined, compact = true) =>
  n == null ? "–" : `₹${compact ? fmtCompact(n) : fmtFull(n)}`;
const dayLabel = (d: string) => d.slice(8); // DD

export default function AdminDashboard() {
  const { data, isLoading } = useLiveData<DashboardData>("/admin/dashboard", 15000);

  const totalSettled = (data?.betsWon ?? 0) + (data?.betsLost ?? 0);
  const winRate = totalSettled > 0 ? ((data?.betsWon ?? 0) / totalSettled) * 100 : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-100">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Real-time platform overview</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          Live · refreshes every 15s
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        <Stat label="Total Users"          value={fmtFull(data?.users)}                Icon={Users}          loading={isLoading} accent="violet" />
        <Stat label="Active Online"        value={fmtFull(data?.onlineUsers)}          Icon={UserCheck}      loading={isLoading} accent="emerald"
              sub={`${fmtFull(data?.activeUsers24h)} in last 24h`} />
        <Stat label="New Today"            value={fmtFull(data?.newRegistrationsToday)} Icon={UserPlus}      loading={isLoading} accent="sky" />
        <Stat label="Total Deposits"       value={money(data?.totalDeposits)}          Icon={ArrowDownToLine} loading={isLoading} accent="emerald" />
        <Stat label="Total Withdrawals"    value={money(data?.totalWithdrawals)}       Icon={ArrowUpToLine}  loading={isLoading} accent="orange" />
        <Stat label="Total Profit"         value={money(data?.totalProfit)}            Icon={TrendingUp}     loading={isLoading}
              accent={(data?.totalProfit ?? 0) >= 0 ? "emerald" : "red"} />

        <Stat label="Today P/L"            value={money(data?.todayPL)}                Icon={Activity}       loading={isLoading}
              accent={(data?.todayPL ?? 0) >= 0 ? "emerald" : "red"} />
        <Stat label="Total Bets"           value={fmtFull(data?.totalBets)}            Icon={Target}         loading={isLoading} accent="violet" />
        <Stat label="Win / Loss Ratio"     value={`${winRate.toFixed(1)}%`}            Icon={Percent}        loading={isLoading} accent="sky"
              sub={`${fmtCompact(data?.betsWon)}W · ${fmtCompact(data?.betsLost)}L`} />
        <Stat label="Pending Withdrawals"  value={fmtFull(data?.pendingWithdrawals)}   Icon={Clock}          loading={isLoading}
              accent={(data?.pendingWithdrawals ?? 0) > 0 ? "amber" : "slate"}
              sub={money(data?.pendingWithdrawalAmount)} />
        <Stat label="Game Revenue"         value={money(data?.gameRevenue)}            Icon={Gamepad2}       loading={isLoading}
              accent={(data?.gameRevenue ?? 0) >= 0 ? "emerald" : "red"} />
        <Stat label="Affiliate Revenue"    value={money(data?.affiliateRevenue)}       Icon={Share2}         loading={isLoading} accent="amber" />
      </div>

      {/* ── Secondary money row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniStat label="Player Balances"  value={money(data?.totalBalance, false)}  Icon={Wallet}      loading={isLoading} />
        <MiniStat label="Platform Exposure" value={money(data?.totalExposure, false)} Icon={ShieldAlert} loading={isLoading} tone="bad" />
        <MiniStat label="Open Bets"        value={fmtFull(data?.openBets)}           Icon={Target}      loading={isLoading} />
        <MiniStat label="Live Markets"     value={fmtFull(data?.activeMarkets)}      Icon={Activity}    loading={isLoading} />
      </div>

      {/* ── Charts ── */}
      <div className="grid lg:grid-cols-2 gap-5">
        <ChartCard
          title="Daily Revenue"
          subtitle="Operator P/L (14 days)"
          right={data ? <span className={(data.revenueSeries.reduce((s, d) => s + d.pl, 0)) >= 0 ? "text-emerald-400" : "text-red-400"}>
            {money(data.revenueSeries.reduce((s, d) => s + d.pl, 0))}
          </span> : undefined}
          delay={100}
        >
          <SignedBarChart data={(data?.revenueSeries ?? []).map(d => ({ label: dayLabel(d.date), full: d.date, value: d.pl }))} loading={isLoading} unit="₹" />
        </ChartCard>

        <ChartCard
          title="Bet Activity"
          subtitle="Sports vs Casino bets / day"
          right={data ? <span className="text-violet-300">{fmtFull(data.betActivitySeries.reduce((s, d) => s + d.total, 0))}</span> : undefined}
          delay={150}
          legend={[{ label: "Sports", color: "#a78bfa" }, { label: "Casino", color: "#fbbf24" }]}
        >
          <StackedBarChart
            data={(data?.betActivitySeries ?? []).map(d => ({ label: dayLabel(d.date), full: d.date, a: d.sports, b: d.casino }))}
            loading={isLoading}
            colorA="#a78bfa" colorB="#fbbf24" nameA="Sports" nameB="Casino"
          />
        </ChartCard>

        <ChartCard
          title="User Growth"
          subtitle="New registrations / day"
          right={data ? <span className="text-sky-300">+{fmtFull(data.userGrowthSeries.reduce((s, d) => s + d.count, 0))}</span> : undefined}
          delay={200}
        >
          <AreaChart data={(data?.userGrowthSeries ?? []).map(d => ({ label: dayLabel(d.date), full: d.date, value: d.count }))} loading={isLoading} color="#38bdf8" />
        </ChartCard>

        <ChartCard
          title="Deposits vs Withdrawals"
          subtitle="Approved transactions / day"
          delay={250}
          legend={[{ label: "Deposits", color: "#34d399" }, { label: "Withdrawals", color: "#fb923c" }]}
        >
          <GroupedBarChart
            data={(data?.depositWithdrawalSeries ?? []).map(d => ({ label: dayLabel(d.date), full: d.date, a: d.deposits, b: d.withdrawals }))}
            loading={isLoading}
            colorA="#34d399" colorB="#fb923c" nameA="Deposits" nameB="Withdrawals" unit="₹"
          />
        </ChartCard>
      </div>

      {/* Alerts */}
      {((data?.pendingDeposits ?? 0) > 0 || (data?.pendingWithdrawals ?? 0) > 0) && (
        <div className="bg-orange-900/30 rounded-xl border border-orange-700 p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-orange-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-bold text-orange-300">Pending Actions Required</p>
            <p className="text-orange-400 mt-0.5">
              {data?.pendingDeposits} deposit{data?.pendingDeposits !== 1 ? "s" : ""} and{" "}
              {data?.pendingWithdrawals} withdrawal{data?.pendingWithdrawals !== 1 ? "s" : ""} waiting for approval.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Stat cards ─────────────────────────────────────────────────────────── */

type AccentStyle = { icon: string; bg: string; value: string };
const VIOLET: AccentStyle = { icon: "text-violet-400", bg: "bg-violet-500/10", value: "text-gray-100" };
const ACCENT: Record<string, AccentStyle> = {
  violet:  VIOLET,
  emerald: { icon: "text-emerald-400", bg: "bg-emerald-500/10", value: "text-emerald-300" },
  sky:     { icon: "text-sky-400",     bg: "bg-sky-500/10",     value: "text-sky-300" },
  orange:  { icon: "text-orange-400",  bg: "bg-orange-500/10",  value: "text-orange-300" },
  amber:   { icon: "text-amber-400",   bg: "bg-amber-500/10",   value: "text-amber-300" },
  red:     { icon: "text-red-400",     bg: "bg-red-500/10",     value: "text-red-400" },
  slate:   { icon: "text-gray-400",    bg: "bg-gray-700/40",    value: "text-gray-200" },
};

function Stat({ label, value, Icon, accent = "violet", sub, loading }: {
  label: string; value: string; Icon: any; accent?: keyof typeof ACCENT | string; sub?: string; loading?: boolean;
}) {
  const a: AccentStyle = ACCENT[accent] ?? VIOLET;
  return (
    <div className="bg-gray-800 rounded-xl border border-yellow-500/20 p-4 shadow-sm hover:border-yellow-400/60 transition-all duration-200">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2 truncate">{label}</p>
          {loading ? (
            <div className="h-7 w-20 bg-gray-700 rounded animate-pulse" />
          ) : (
            <p className={`text-xl font-black tabular-nums ${a.value}`}>{value}</p>
          )}
          {sub && !loading && <p className="text-[11px] text-gray-500 mt-1 truncate">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg shrink-0 ${a.bg}`}>
          <Icon size={16} className={a.icon} />
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, Icon, tone, loading }: {
  label: string; value: string; Icon: any; tone?: "bad"; loading?: boolean;
}) {
  return (
    <div className="bg-gray-800/60 rounded-xl border border-gray-700 p-3 flex items-center gap-3">
      <div className={`p-2 rounded-lg shrink-0 ${tone === "bad" ? "bg-red-500/10" : "bg-gray-700/50"}`}>
        <Icon size={15} className={tone === "bad" ? "text-red-400" : "text-yellow-500"} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold truncate">{label}</p>
        {loading ? <div className="h-5 w-16 bg-gray-700 rounded animate-pulse mt-1" />
          : <p className={`text-base font-black tabular-nums ${tone === "bad" ? "text-red-400" : "text-gray-100"}`}>{value}</p>}
      </div>
    </div>
  );
}

/* ─── Chart shell ────────────────────────────────────────────────────────── */

function ChartCard({ title, subtitle, right, legend, delay, children }: {
  title: string; subtitle?: string; right?: React.ReactNode;
  legend?: { label: string; color: string }[]; delay?: number; children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-800 rounded-xl border border-yellow-500/20 p-5 shadow-sm animate-slide-in-up" style={{ animationDelay: `${delay ?? 0}ms` }}>
      <div className="flex items-start justify-between mb-4 gap-2">
        <div>
          <h2 className="text-base font-black text-gray-100">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {right && <p className="text-xl font-black tabular-nums">{right}</p>}
      </div>
      {legend && (
        <div className="flex items-center gap-4 mb-3">
          {legend.map(l => (
            <div key={l.label} className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: l.color }} />{l.label}
            </div>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

const Empty = () => <div className="h-44 flex items-center justify-center text-gray-500 text-sm">No data yet</div>;
const Loading = () => <div className="h-44 w-full bg-gray-700/50 rounded-lg animate-pulse" />;

/* ─── Charts (dependency-free SVG / flex) ────────────────────────────────── */

interface Pt1 { label: string; full: string; value: number; }
interface Pt2 { label: string; full: string; a: number; b: number; }

const BARS_H = 158;

function SignedBarChart({ data, loading, unit = "" }: { data: Pt1[]; loading?: boolean; unit?: string }) {
  if (loading) return <Loading />;
  if (!data.length) return <Empty />;
  const max = Math.max(1, ...data.map(d => Math.abs(d.value)));
  return (
    <div>
      <div className="flex items-end gap-1" style={{ height: BARS_H }}>
        {data.map(d => {
          const h = Math.max(2, (Math.abs(d.value) / max) * 100);
          return (
            <div key={d.full} className="flex-1 h-full flex items-end group"
              title={`${d.full}: ${unit}${Math.round(d.value).toLocaleString("en-IN")}`}>
              <div
                style={{ height: `${h}%` }}
                className={`w-full rounded-t-md transition-all group-hover:brightness-125 cursor-pointer ${d.value >= 0 ? "bg-emerald-400" : "bg-red-400"}`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 mt-1">
        {data.map(d => <span key={d.full} className="flex-1 text-center text-[9px] text-gray-600">{d.label}</span>)}
      </div>
    </div>
  );
}

function StackedBarChart({ data, loading, colorA, colorB, nameA, nameB }: {
  data: Pt2[]; loading?: boolean; colorA: string; colorB: string; nameA: string; nameB: string;
}) {
  if (loading) return <Loading />;
  if (!data.length || data.every(d => d.a + d.b === 0)) return <Empty />;
  const max = Math.max(1, ...data.map(d => d.a + d.b));
  return (
    <div>
      <div className="flex items-end gap-1" style={{ height: BARS_H }}>
        {data.map(d => {
          const ha = (d.a / max) * 100;
          const hb = (d.b / max) * 100;
          return (
            <div key={d.full} className="flex-1 h-full flex flex-col justify-end group"
              title={`${d.full}\n${nameA}: ${d.a}\n${nameB}: ${d.b}`}>
              <div style={{ height: `${hb}%`, background: colorB }} className="w-full rounded-t-md transition-all group-hover:brightness-125" />
              <div style={{ height: `${ha}%`, background: colorA }} className="w-full transition-all group-hover:brightness-125" />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 mt-1">
        {data.map(d => <span key={d.full} className="flex-1 text-center text-[9px] text-gray-600">{d.label}</span>)}
      </div>
    </div>
  );
}

function GroupedBarChart({ data, loading, colorA, colorB, nameA, nameB, unit = "" }: {
  data: Pt2[]; loading?: boolean; colorA: string; colorB: string; nameA: string; nameB: string; unit?: string;
}) {
  if (loading) return <Loading />;
  if (!data.length || data.every(d => d.a + d.b === 0)) return <Empty />;
  const max = Math.max(1, ...data.map(d => Math.max(d.a, d.b)));
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height: BARS_H }}>
        {data.map(d => (
          <div key={d.full} className="flex-1 h-full flex items-end justify-center gap-0.5 group"
            title={`${d.full}\n${nameA}: ${unit}${Math.round(d.a).toLocaleString("en-IN")}\n${nameB}: ${unit}${Math.round(d.b).toLocaleString("en-IN")}`}>
            <div style={{ height: `${Math.max(2, (d.a / max) * 100)}%`, background: colorA }} className="w-1/2 rounded-t-md transition-all group-hover:brightness-125" />
            <div style={{ height: `${Math.max(2, (d.b / max) * 100)}%`, background: colorB }} className="w-1/2 rounded-t-md transition-all group-hover:brightness-125" />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1">
        {data.map(d => <span key={d.full} className="flex-1 text-center text-[9px] text-gray-600">{d.label}</span>)}
      </div>
    </div>
  );
}

function AreaChart({ data, loading, color }: { data: Pt1[]; loading?: boolean; color: string }) {
  if (loading) return <Loading />;
  if (!data.length) return <Empty />;
  const W = 100, H = 44;
  const max = Math.max(1, ...data.map(d => d.value));
  const n = data.length;
  const pts = data.map((d, i) => {
    const x = n === 1 ? W / 2 : (i / (n - 1)) * W;
    const y = H - (d.value / max) * (H - 4) - 2;
    return { x, y, d };
  });
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const gid = "area-grad";
  return (
    <div className="h-44 relative">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[calc(100%-16px)]">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.45" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map(p => (
          <circle key={p.d.full} cx={p.x} cy={p.y} r="1.6" fill={color} vectorEffect="non-scaling-stroke">
            <title>{`${p.d.full}: +${p.d.value}`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between mt-1">
        {data.map(d => <span key={d.full} className="text-[9px] text-gray-600">{d.label}</span>)}
      </div>
    </div>
  );
}
