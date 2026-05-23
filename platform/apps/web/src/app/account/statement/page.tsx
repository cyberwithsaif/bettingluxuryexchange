"use client";
import useSWR from "swr";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  ArrowDownLeft, ArrowUpRight, Gift, Zap, AlertCircle,
  Wallet, CreditCard, BarChart3, TrendingUp, TrendingDown,
} from "lucide-react";

const KIND_CONFIG: Record<
  string,
  { icon: React.ReactNode; color: string; bg: string; displayName: string }
> = {
  DEPOSIT: {
    icon: <ArrowDownLeft size={14} />,
    color: "#22c55e",
    bg: "rgba(34,197,94,0.1)",
    displayName: "Deposit",
  },
  WITHDRAWAL: {
    icon: <ArrowUpRight size={14} />,
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.1)",
    displayName: "Withdrawal",
  },
  BET_PLACED: {
    icon: <Zap size={14} />,
    color: "#fbbf24",
    bg: "rgba(251,191,36,0.1)",
    displayName: "Bet Placed",
  },
  BET_SETTLED: {
    icon: <BarChart3 size={14} />,
    color: "#38bdf8",
    bg: "rgba(56,189,248,0.1)",
    displayName: "Bet Settled",
  },
  BONUS: {
    icon: <Gift size={14} />,
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.1)",
    displayName: "Bonus",
  },
  ADJUSTMENT: {
    icon: <AlertCircle size={14} />,
    color: "#f87171",
    bg: "rgba(248,113,113,0.1)",
    displayName: "Adjustment",
  },
};

function fmt(n: number | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function StatementPage() {
  const { data } = useSWR("/wallet/ledger?limit=200");
  const [kindFilter, setKindFilter] = useState<string | null>(null);

  const items = useMemo(() => {
    if (!data?.items) return [];
    if (!kindFilter) return data.items;
    return data.items.filter((e: any) => e.kind === kindFilter);
  }, [data, kindFilter]);

  const stats = useMemo(() => {
    if (!data?.items) return { totalIn: 0, totalOut: 0, net: 0 };
    const totalIn = data.items
      .filter((e: any) => Number(e.amount) > 0)
      .reduce((s: number, e: any) => s + Number(e.amount), 0);
    const totalOut = data.items
      .filter((e: any) => Number(e.amount) < 0)
      .reduce((s: number, e: any) => s + Math.abs(Number(e.amount)), 0);
    return { totalIn, totalOut, net: totalIn - totalOut };
  }, [data]);

  const uniqueKinds = useMemo(() => {
    if (!data?.items) return [];
    return [...new Set(data.items.map((e: any) => e.kind))];
  }, [data]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl">Account Statement</h1>
        <p className="text-sm text-white/50 mt-1">Complete transaction history and wallet movements</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <SummaryCard
          label="Total In"
          value={`₹${fmt(stats.totalIn)}`}
          icon={<ArrowDownLeft size={16} />}
          color="#22c55e"
        />
        <SummaryCard
          label="Total Out"
          value={`₹${fmt(stats.totalOut)}`}
          icon={<ArrowUpRight size={16} />}
          color="#f59e0b"
        />
        <SummaryCard
          label="Net Change"
          value={`₹${fmt(stats.net)}`}
          icon={stats.net >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          color={stats.net >= 0 ? "#22c55e" : "#f43f5e"}
        />
      </div>

      {/* Kind Filters */}
      {uniqueKinds.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
          <button
            onClick={() => setKindFilter(null)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wide whitespace-nowrap transition-all",
              !kindFilter
                ? "bg-accent-grad text-ink"
                : "bg-white/5 border border-white/10 text-white/60 hover:text-white"
            )}
          >
            All
          </button>
          {uniqueKinds.map((k) => {
            const cfg = KIND_CONFIG[k] || { icon: null, color: "#fff", displayName: k };
            const isActive = kindFilter === k;
            return (
              <button
                key={k}
                onClick={() => setKindFilter(k)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wide whitespace-nowrap transition-all"
                style={{
                  background: isActive ? cfg.bg : "rgba(255,255,255,0.05)",
                  color: isActive ? cfg.color : "rgba(255,255,255,0.5)",
                  border: isActive ? `1px solid ${cfg.color}40` : "1px solid rgba(255,255,255,0.1)",
                }}
              >
                {cfg.icon}
                {cfg.displayName}
              </button>
            );
          })}
        </div>
      )}

      {/* Transactions List */}
      {items.length === 0 ? (
        <div
          className="rounded-2xl p-12 text-center"
          style={{ background: "linear-gradient(135deg, #12183a, #0d1224)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <Wallet size={40} className="mx-auto mb-3 text-white/20" />
          <p className="text-white/40">No transactions yet</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((e: any) => {
            const amt = Number(e.amount);
            const isPositive = amt > 0;
            const cfg = KIND_CONFIG[e.kind] || {
              icon: <AlertCircle size={14} />,
              color: "#fff",
              bg: "rgba(255,255,255,0.05)",
              displayName: e.kind,
            };

            return (
              <div
                key={e.id}
                className="rounded-xl p-4 border transition-all"
                style={{
                  background: "linear-gradient(135deg, #12183a, #0d1224)",
                  borderColor: isPositive ? "rgba(34,197,94,0.2)" : "rgba(244,63,94,0.2)",
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Left - Type & Date */}
                  <div className="flex gap-3 flex-1 min-w-0">
                    <div className="rounded-lg p-2.5 shrink-0" style={{ background: cfg.bg }}>
                      {cfg.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-white">{cfg.displayName}</div>
                      <div className="text-xs text-white/50 mt-1">{fmtDate(e.createdAt)}</div>
                      {e.note && <div className="text-xs text-white/40 mt-1 truncate">{e.note}</div>}
                    </div>
                  </div>

                  {/* Right - Amounts */}
                  <div className="text-right shrink-0">
                    <div className={`font-display text-lg font-bold tabular-nums ${isPositive ? "text-green-400" : "text-red-400"}`}>
                      {isPositive ? "+" : ""}₹{fmt(Math.abs(amt))}
                    </div>
                    <div className="text-xs text-white/40 mt-1 tabular-nums">
                      Bal: ₹{fmt(e.balanceAfter)}
                    </div>
                  </div>
                </div>

                {/* Footer - Additional Info */}
                <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-white/30">
                  {e.exposureDelta !== 0 && <div>Exp Δ: ₹{fmt(e.exposureDelta)}</div>}
                  {e.exposureAfter !== undefined && <div>Exp: ₹{fmt(e.exposureAfter)}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <div
      className="rounded-xl p-4 border"
      style={{
        background: `${color}10`,
        borderColor: `${color}30`,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color }}>{icon}</span>
        <span className="text-[10px] text-white/40 uppercase tracking-widest">{label}</span>
      </div>
      <div className="font-display text-2xl font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
