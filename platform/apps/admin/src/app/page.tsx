"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveData } from "@/lib/hooks";
import {
  Users, UserCheck, UserPlus, Target, Percent, Clock,
  ArrowDownToLine, ArrowUpToLine, TrendingUp,
  Activity, Gamepad2, Share2, AlertCircle, Wallet, ShieldAlert,
  CalendarDays, Scale, Trophy, Dices, Coins,
} from "lucide-react";

interface SeriesPoint { date: string; label?: string; }
interface RevenuePoint extends SeriesPoint { pl: number; }
interface BetPoint extends SeriesPoint { sports: number; casino: number; total: number; }
interface GrowthPoint extends SeriesPoint { count: number; }
interface DepWdPoint extends SeriesPoint { deposits: number; withdrawals: number; }

interface RangeStats {
  pl: number; casinoPL: number; sportsPL: number;
  deposits: number; depositCount: number; avgDeposit: number;
  withdrawals: number; withdrawalCount: number; netCashflow: number;
  newUsers: number; sportsBets: number; casinoBets: number; referralPaid: number;
}
interface GameRow { game: string; pl: number; wagered: number; bets: number; }

interface DashboardData {
  range: { from: string | null; to: string | null } | null;
  bucket: "hour" | "day" | "week";
  rangeStats: RangeStats;
  casinoByGame: GameRow[];
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
const moneySigned = (n: number | undefined) =>
  n == null ? "–" : `${n >= 0 ? "+" : "−"}₹${fmtCompact(Math.abs(n))}`;

/* ─── Date-range presets ─────────────────────────────────────────────────── */

type Preset = "today" | "yesterday" | "7d" | "14d" | "30d" | "all" | "custom";
const PRESETS: { key: Preset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7 Days" },
  { key: "14d", label: "14 Days" },
  { key: "30d", label: "30 Days" },
  { key: "all", label: "All Time" },
];

const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const prettyYMD = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default function AdminDashboard() {
  const [preset, setPreset] = useState<Preset>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const range = useMemo((): { from: string; to: string } | null => {
    switch (preset) {
      case "today":     return { from: toYMD(new Date()), to: toYMD(new Date()) };
      case "yesterday": return { from: toYMD(daysAgo(1)), to: toYMD(daysAgo(1)) };
      case "7d":        return { from: toYMD(daysAgo(6)),  to: toYMD(new Date()) };
      case "14d":       return { from: toYMD(daysAgo(13)), to: toYMD(new Date()) };
      case "30d":       return { from: toYMD(daysAgo(29)), to: toYMD(new Date()) };
      case "custom":    return customFrom && customTo ? { from: customFrom, to: customTo } : null;
      default:          return null; // all time
    }
  }, [preset, customFrom, customTo]);

  const rangeLabel = preset === "all" || !range
    ? "All Time"
    : preset === "custom"
    ? `${prettyYMD(range.from)} – ${prettyYMD(range.to)}`
    : PRESETS.find(p => p.key === preset)?.label ?? "Custom";

  const qs = range ? `?from=${range.from}&to=${range.to}` : "";
  const { data, isLoading } = useLiveData<DashboardData>(`/admin/dashboard${qs}`, 15000);

  const rs = data?.rangeStats;
  const totalSettled = (data?.betsWon ?? 0) + (data?.betsLost ?? 0);
  const winRate = totalSettled > 0 ? ((data?.betsWon ?? 0) / totalSettled) * 100 : 0;
  const bucketWord = data?.bucket === "hour" ? "hour" : data?.bucket === "week" ? "week" : "day";

  // Cumulative P/L line (client-side accumulation of the revenue series)
  const cumulative = useMemo(() => {
    let acc = 0;
    return (data?.revenueSeries ?? []).map(d => { acc += d.pl; return { ...d, pl: Math.round(acc * 100) / 100 }; });
  }, [data?.revenueSeries]);

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

      {/* ── Date filter ── */}
      <div className="bg-gray-800 rounded-xl border border-yellow-500/20 p-3 flex flex-wrap items-center gap-2">
        <CalendarDays size={15} className="text-yellow-500 shrink-0 ml-1" />
        {PRESETS.map(p => (
          <button key={p.key} onClick={() => setPreset(p.key)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
              preset === p.key
                ? "bg-gradient-to-r from-yellow-500 to-amber-500 text-gray-900 shadow"
                : "bg-gray-900/60 text-gray-400 border border-gray-700 hover:text-gray-200 hover:border-gray-500"}`}>
            {p.label}
          </button>
        ))}
        <span className="hidden md:block w-px h-6 bg-gray-700 mx-1" />
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={customFrom} max={toYMD(new Date())}
            onChange={e => { setCustomFrom(e.target.value); if (e.target.value && customTo) setPreset("custom"); }}
            className="bg-gray-900/60 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-yellow-400/60 [color-scheme:dark]" />
          <span className="text-gray-500 text-xs font-bold">to</span>
          <input type="date" value={customTo} max={toYMD(new Date())} min={customFrom || undefined}
            onChange={e => { setCustomTo(e.target.value); if (customFrom && e.target.value) setPreset("custom"); }}
            className="bg-gray-900/60 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-yellow-400/60 [color-scheme:dark]" />
          {preset === "custom" && customFrom && customTo && (
            <span className="text-[11px] font-bold text-yellow-400">{rangeLabel}</span>
          )}
        </div>
      </div>

      {/* ── Range stats ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-black uppercase tracking-wider text-gray-400">Performance — <span className="text-yellow-400">{rangeLabel}</span></h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <Stat label="Profit / Loss" href="/reports" value={moneySigned(rs?.pl)} Icon={TrendingUp} loading={isLoading}
                accent={(rs?.pl ?? 0) >= 0 ? "emerald" : "red"} sub="operator P/L in range" />
          <Stat label="Casino GGR" href="/pl-control" value={moneySigned(rs?.casinoPL)} Icon={Dices} loading={isLoading}
                accent={(rs?.casinoPL ?? 0) >= 0 ? "emerald" : "red"} sub={`${fmtCompact(rs?.casinoBets)} casino bets`} />
          <Stat label="Sports P/L" href="/bets" value={moneySigned(rs?.sportsPL)} Icon={Trophy} loading={isLoading}
                accent={(rs?.sportsPL ?? 0) >= 0 ? "emerald" : "red"} sub={`${fmtCompact(rs?.sportsBets)} sports bets`} />
          <Stat label="Deposits" href="/deposits" value={money(rs?.deposits)} Icon={ArrowDownToLine} loading={isLoading} accent="emerald"
                sub={`${fmtFull(rs?.depositCount)} approved · avg ${money(rs?.avgDeposit)}`} />
          <Stat label="Withdrawals" href="/withdrawals" value={money(rs?.withdrawals)} Icon={ArrowUpToLine} loading={isLoading} accent="orange"
                sub={`${fmtFull(rs?.withdrawalCount)} approved`} />
          <Stat label="Net Cashflow" href="/reports" value={moneySigned(rs?.netCashflow)} Icon={Scale} loading={isLoading}
                accent={(rs?.netCashflow ?? 0) >= 0 ? "emerald" : "red"} sub="deposits − withdrawals" />
          <Stat label="New Users" href="/users" value={fmtFull(rs?.newUsers)} Icon={UserPlus} loading={isLoading} accent="sky" />
          <Stat label="Total Bets" href="/bets" value={fmtFull((rs?.sportsBets ?? 0) + (rs?.casinoBets ?? 0))} Icon={Target} loading={isLoading} accent="violet"
                sub={`${fmtCompact(rs?.sportsBets)} sports · ${fmtCompact(rs?.casinoBets)} casino`} />
          <Stat label="Referral Paid" href="/affiliates" value={money(rs?.referralPaid)} Icon={Share2} loading={isLoading} accent="amber" />
          <Stat label="Avg Deposit" href="/deposits" value={money(rs?.avgDeposit)} Icon={Coins} loading={isLoading} accent="slate" />
        </div>
      </div>

      {/* ── Platform stat cards (point-in-time / all-time) ── */}
      <div>
        <h2 className="text-sm font-black uppercase tracking-wider text-gray-400 mb-3">Platform Totals</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          <Stat label="Total Users" href="/users"          value={fmtFull(data?.users)}                Icon={Users}          loading={isLoading} accent="violet" />
          <Stat label="Active Online" href="/users"        value={fmtFull(data?.onlineUsers)}          Icon={UserCheck}      loading={isLoading} accent="emerald"
                sub={`${fmtFull(data?.activeUsers24h)} in last 24h`} />
          <Stat label="New Today" href="/users"            value={fmtFull(data?.newRegistrationsToday)} Icon={UserPlus}      loading={isLoading} accent="sky" />
          <Stat label="Total Deposits" href="/deposits"       value={money(data?.totalDeposits)}          Icon={ArrowDownToLine} loading={isLoading} accent="emerald" />
          <Stat label="Total Withdrawals" href="/withdrawals"    value={money(data?.totalWithdrawals)}       Icon={ArrowUpToLine}  loading={isLoading} accent="orange" />
          <Stat label="Total Profit" href="/reports"         value={money(data?.totalProfit)}            Icon={TrendingUp}     loading={isLoading}
                accent={(data?.totalProfit ?? 0) >= 0 ? "emerald" : "red"} />
          <Stat label="Today P/L" href="/reports"            value={money(data?.todayPL)}                Icon={Activity}       loading={isLoading}
                accent={(data?.todayPL ?? 0) >= 0 ? "emerald" : "red"} />
          <Stat label="Total Bets" href="/bets"           value={fmtFull(data?.totalBets)}            Icon={Target}         loading={isLoading} accent="violet" />
          <Stat label="Win / Loss Ratio" href="/bets"     value={`${winRate.toFixed(1)}%`}            Icon={Percent}        loading={isLoading} accent="sky"
                sub={`${fmtCompact(data?.betsWon)}W · ${fmtCompact(data?.betsLost)}L`} />
          <Stat label="Pending Withdrawals" href="/withdrawals"  value={fmtFull(data?.pendingWithdrawals)}   Icon={Clock}          loading={isLoading}
                accent={(data?.pendingWithdrawals ?? 0) > 0 ? "amber" : "slate"}
                sub={money(data?.pendingWithdrawalAmount)} />
          <Stat label="Game Revenue" href="/pl-control"         value={money(data?.gameRevenue)}            Icon={Gamepad2}       loading={isLoading}
                accent={(data?.gameRevenue ?? 0) >= 0 ? "emerald" : "red"} />
          <Stat label="Affiliate Revenue" href="/affiliates"    value={money(data?.affiliateRevenue)}       Icon={Share2}         loading={isLoading} accent="amber" />
        </div>
      </div>

      {/* ── Secondary money row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniStat label="Player Balances" href="/users"  value={money(data?.totalBalance, false)}  Icon={Wallet}      loading={isLoading} />
        <MiniStat label="Platform Exposure" href="/risk" value={money(data?.totalExposure, false)} Icon={ShieldAlert} loading={isLoading} tone="bad" />
        <MiniStat label="Open Bets" href="/bets"        value={fmtFull(data?.openBets)}           Icon={Target}      loading={isLoading} />
        <MiniStat label="Live Markets" href="/markets"     value={fmtFull(data?.activeMarkets)}      Icon={Activity}    loading={isLoading} />
      </div>

      {/* ── Charts ── */}
      <div className="grid lg:grid-cols-2 gap-5">
        <ChartCard
          title="Revenue"
          subtitle={`Operator P/L per ${bucketWord} — ${rangeLabel}`}
          right={data ? <span className={(data.revenueSeries.reduce((s, d) => s + d.pl, 0)) >= 0 ? "text-emerald-400" : "text-red-400"}>
            {money(data.revenueSeries.reduce((s, d) => s + d.pl, 0))}
          </span> : undefined}
          delay={100}
        >
          <SignedBarChart data={(data?.revenueSeries ?? []).map(d => ({ label: d.label ?? d.date.slice(8, 10), full: d.date, value: d.pl }))} loading={isLoading} unit="₹" />
        </ChartCard>

        <ChartCard
          title="Cumulative P/L"
          subtitle={`Running total — ${rangeLabel}`}
          right={cumulative.length ? <span className={(cumulative[cumulative.length - 1]!.pl) >= 0 ? "text-emerald-400" : "text-red-400"}>
            {moneySigned(cumulative[cumulative.length - 1]!.pl)}
          </span> : undefined}
          delay={130}
        >
          <SignedLineChart data={cumulative.map(d => ({ label: d.label ?? d.date.slice(8, 10), full: d.date, value: d.pl }))} loading={isLoading} />
        </ChartCard>

        <ChartCard
          title="Bet Activity"
          subtitle={`Sports vs Casino bets per ${bucketWord}`}
          right={data ? <span className="text-violet-300">{fmtFull(data.betActivitySeries.reduce((s, d) => s + d.total, 0))}</span> : undefined}
          delay={160}
          legend={[{ label: "Sports", color: "#a78bfa" }, { label: "Casino", color: "#fbbf24" }]}
        >
          <StackedBarChart
            data={(data?.betActivitySeries ?? []).map(d => ({ label: d.label ?? d.date.slice(8, 10), full: d.date, a: d.sports, b: d.casino }))}
            loading={isLoading}
            colorA="#a78bfa" colorB="#fbbf24" nameA="Sports" nameB="Casino"
          />
        </ChartCard>

        <ChartCard
          title="Casino P/L by Game"
          subtitle={`House profit per game — ${rangeLabel}`}
          delay={190}
        >
          <GameBars rows={data?.casinoByGame ?? []} loading={isLoading} />
        </ChartCard>

        <ChartCard
          title="User Growth"
          subtitle={`New registrations per ${bucketWord}`}
          right={data ? <span className="text-sky-300">+{fmtFull(data.userGrowthSeries.reduce((s, d) => s + d.count, 0))}</span> : undefined}
          delay={220}
        >
          <AreaChart data={(data?.userGrowthSeries ?? []).map(d => ({ label: d.label ?? d.date.slice(8, 10), full: d.date, value: d.count }))} loading={isLoading} color="#38bdf8" />
        </ChartCard>

        <ChartCard
          title="Deposits vs Withdrawals"
          subtitle={`Approved transactions per ${bucketWord}`}
          delay={250}
          legend={[{ label: "Deposits", color: "#34d399" }, { label: "Withdrawals", color: "#fb923c" }]}
        >
          <GroupedBarChart
            data={(data?.depositWithdrawalSeries ?? []).map(d => ({ label: d.label ?? d.date.slice(8, 10), full: d.date, a: d.deposits, b: d.withdrawals }))}
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

function Stat({ label, value, Icon, accent = "violet", sub, loading, href }: {
  label: string; value: string; Icon: any; accent?: keyof typeof ACCENT | string; sub?: string; loading?: boolean; href?: string;
}) {
  const a: AccentStyle = ACCENT[accent] ?? VIOLET;
  const inner = (
    <div className={`bg-gray-800 rounded-xl border border-yellow-500/20 p-4 shadow-sm hover:border-yellow-400/60 transition-all duration-200 h-full ${href ? "cursor-pointer hover:bg-gray-800/80 active:scale-[0.99]" : ""}`}>
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
  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner;
}

function MiniStat({ label, value, Icon, tone, loading, href }: {
  label: string; value: string; Icon: any; tone?: "bad"; loading?: boolean; href?: string;
}) {
  const inner = (
    <div className={`bg-gray-800/60 rounded-xl border border-gray-700 p-3 flex items-center gap-3 h-full ${href ? "cursor-pointer hover:border-gray-500 active:scale-[0.99] transition" : ""}`}>
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
  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner;
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

const Empty = () => <div className="h-44 flex items-center justify-center text-gray-500 text-sm">No data in this range</div>;
const Loading = () => <div className="h-44 w-full bg-gray-700/50 rounded-lg animate-pulse" />;

/* ─── Charts (dependency-free SVG / flex) ────────────────────────────────── */

interface Pt1 { label: string; full: string; value: number; }
interface Pt2 { label: string; full: string; a: number; b: number; }

const BARS_H = 158;

// Hide overcrowded x-labels: show at most ~14 evenly-spaced ones.
const showLabel = (i: number, n: number) => n <= 14 || i % Math.ceil(n / 14) === 0;

function XLabels({ items }: { items: { key: string; label: string }[] }) {
  const n = items.length;
  return (
    <div className="flex gap-1 mt-1">
      {items.map((it, i) => (
        <span key={it.key} className="flex-1 text-center text-[9px] text-gray-600 truncate">
          {showLabel(i, n) ? it.label : ""}
        </span>
      ))}
    </div>
  );
}

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
              title={`${d.label}: ${unit}${Math.round(d.value).toLocaleString("en-IN")}`}>
              <div
                style={{ height: `${h}%` }}
                className={`w-full rounded-t-md transition-all group-hover:brightness-125 cursor-pointer ${d.value >= 0 ? "bg-emerald-400" : "bg-red-400"}`}
              />
            </div>
          );
        })}
      </div>
      <XLabels items={data.map(d => ({ key: d.full, label: d.label }))} />
    </div>
  );
}

function SignedLineChart({ data, loading }: { data: Pt1[]; loading?: boolean }) {
  if (loading) return <Loading />;
  if (!data.length) return <Empty />;
  const W = 100, H = 44;
  const min = Math.min(0, ...data.map(d => d.value));
  const max = Math.max(1, ...data.map(d => d.value));
  const span = Math.max(1, max - min);
  const n = data.length;
  const y = (v: number) => H - ((v - min) / span) * (H - 6) - 3;
  const pts = data.map((d, i) => ({ x: n === 1 ? W / 2 : (i / (n - 1)) * W, y: y(d.value), d }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const zeroY = y(0);
  const last = data[data.length - 1]!.value;
  const color = last >= 0 ? "#34d399" : "#f87171";
  return (
    <div className="h-44 relative">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[calc(100%-16px)]">
        <defs>
          <linearGradient id="cum-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#cum-grad)" />
        <line x1="0" x2={W} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
        <path d={line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map(p => (
          <circle key={p.d.full} cx={p.x} cy={p.y} r="1.4" fill={color} vectorEffect="non-scaling-stroke">
            <title>{`${p.d.label}: ₹${Math.round(p.d.value).toLocaleString("en-IN")}`}</title>
          </circle>
        ))}
      </svg>
      <XLabels items={data.map(d => ({ key: d.full, label: d.label }))} />
    </div>
  );
}

function GameBars({ rows, loading }: { rows: GameRow[]; loading?: boolean }) {
  if (loading) return <Loading />;
  if (!rows.length) return <Empty />;
  const max = Math.max(1, ...rows.map(r => Math.abs(r.pl)));
  return (
    <div className="space-y-2 h-44 overflow-y-auto pr-1">
      {rows.map(r => (
        <div key={r.game} title={`Wagered ₹${Math.round(r.wagered).toLocaleString("en-IN")} · ${r.bets} bets`}>
          <div className="flex items-center justify-between text-[11px] mb-0.5">
            <span className="font-bold text-gray-300 capitalize truncate">{r.game}</span>
            <span className={`font-black tabular-nums ${r.pl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {r.pl >= 0 ? "+" : "−"}₹{fmtCompact(Math.abs(r.pl))}
            </span>
          </div>
          <div className="h-2 rounded-full bg-gray-700/60 overflow-hidden">
            <div className={`h-full rounded-full ${r.pl >= 0 ? "bg-emerald-400" : "bg-red-400"}`}
              style={{ width: `${Math.max(3, (Math.abs(r.pl) / max) * 100)}%` }} />
          </div>
          <p className="text-[9px] text-gray-600 mt-0.5">₹{fmtCompact(r.wagered)} wagered · {fmtCompact(r.bets)} bets</p>
        </div>
      ))}
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
              title={`${d.label}\n${nameA}: ${d.a}\n${nameB}: ${d.b}`}>
              <div style={{ height: `${hb}%`, background: colorB }} className="w-full rounded-t-md transition-all group-hover:brightness-125" />
              <div style={{ height: `${ha}%`, background: colorA }} className="w-full transition-all group-hover:brightness-125" />
            </div>
          );
        })}
      </div>
      <XLabels items={data.map(d => ({ key: d.full, label: d.label }))} />
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
            title={`${d.label}\n${nameA}: ${unit}${Math.round(d.a).toLocaleString("en-IN")}\n${nameB}: ${unit}${Math.round(d.b).toLocaleString("en-IN")}`}>
            <div style={{ height: `${Math.max(2, (d.a / max) * 100)}%`, background: colorA }} className="w-1/2 rounded-t-md transition-all group-hover:brightness-125" />
            <div style={{ height: `${Math.max(2, (d.b / max) * 100)}%`, background: colorB }} className="w-1/2 rounded-t-md transition-all group-hover:brightness-125" />
          </div>
        ))}
      </div>
      <XLabels items={data.map(d => ({ key: d.full, label: d.label }))} />
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
            <title>{`${p.d.label}: +${p.d.value}`}</title>
          </circle>
        ))}
      </svg>
      <XLabels items={data.map(d => ({ key: d.full, label: d.label }))} />
    </div>
  );
}
