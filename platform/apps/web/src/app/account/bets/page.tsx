"use client";
import useSWR from "swr";
import { useState, useMemo } from "react";
import { cn } from "@/lib/cn";
import {
  CheckCircle2, XCircle, Clock, TrendingUp, TrendingDown,
  Target, BarChart3, Trophy, AlertCircle,
} from "lucide-react";

const tabs = ["OPEN", "SETTLED_WON", "SETTLED_LOST", "VOID", "CANCELLED"] as const;

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function BetsPage() {
  const [tab, setTab] = useState<typeof tabs[number]>("OPEN");
  const { data: bets } = useSWR(`/bets/mine?status=${tab}`);

  /* Calculate stats from current tab bets */
  const stats = useMemo(() => {
    if (!bets || !Array.isArray(bets)) return { count: 0, totalStake: 0, totalLiability: 0, totalPL: 0, winCount: 0 };
    return {
      count: bets.length,
      totalStake: bets.reduce((s, b) => s + Number(b.stake), 0),
      totalLiability: bets.reduce((s, b) => s + Number(b.liability), 0),
      totalPL: bets.reduce((s, b) => {
        if (b.status === "SETTLED_WON") return s + Number(b.potentialProfit);
        if (b.status === "SETTLED_LOST") return s - Number(b.liability);
        return s;
      }, 0),
      winCount: bets.filter((b) => b.status === "SETTLED_WON").length,
    };
  }, [bets]);

  const tabConfig: Record<
    typeof tabs[number],
    { color: string; bg: string; icon: React.ReactNode; label: string }
  > = {
    OPEN: { color: "#fbbf24", bg: "rgba(251, 191, 36, 0.1)", icon: <Clock size={14} />, label: "Open" },
    SETTLED_WON: { color: "#22c55e", bg: "rgba(34, 197, 94, 0.1)", icon: <CheckCircle2 size={14} />, label: "Won" },
    SETTLED_LOST: { color: "#f43f5e", bg: "rgba(244, 63, 94, 0.1)", icon: <XCircle size={14} />, label: "Lost" },
    VOID: { color: "#a78bfa", bg: "rgba(167, 139, 250, 0.1)", icon: <AlertCircle size={14} />, label: "Void" },
    CANCELLED: { color: "#64748b", bg: "rgba(100, 116, 139, 0.1)", icon: <XCircle size={14} />, label: "Cancelled" },
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl">My Bets</h1>
        <p className="text-sm text-white/50 mt-1">Track all your bets and performance</p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
        {tabs.map((t) => {
          const cfg = tabConfig[t];
          const isActive = tab === t;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wide shrink-0 transition-all whitespace-nowrap"
              style={{
                background: isActive ? cfg.bg : "rgba(255,255,255,0.05)",
                color: isActive ? cfg.color : "rgba(255,255,255,0.5)",
                border: isActive ? `1px solid ${cfg.color}40` : "1px solid rgba(255,255,255,0.1)",
              }}
            >
              {cfg.icon}
              {cfg.label}
            </button>
          );
        })}
      </div>

      {/* Stats Cards */}
      {stats.count > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Total Bets"
            value={String(stats.count)}
            icon={<Target size={16} />}
            color="#ff7a18"
          />
          <StatCard
            label="Total Stake"
            value={`₹${fmt(stats.totalStake)}`}
            icon={<BarChart3 size={16} />}
            color="#f59e0b"
          />
          {tab === "SETTLED_WON" && (
            <StatCard
              label="Total Winnings"
              value={`₹${fmt(stats.totalPL)}`}
              icon={<TrendingUp size={16} />}
              color="#22c55e"
            />
          )}
          {tab === "SETTLED_LOST" && (
            <StatCard
              label="Total Loss"
              value={`₹${fmt(Math.abs(stats.totalPL))}`}
              icon={<TrendingDown size={16} />}
              color="#f43f5e"
            />
          )}
          {(tab === "OPEN" || tab === "VOID" || tab === "CANCELLED") && (
            <StatCard
              label="Total Liability"
              value={`₹${fmt(stats.totalLiability)}`}
              icon={<AlertCircle size={16} />}
              color="#a78bfa"
            />
          )}
        </div>
      )}

      {/* Bets List */}
      {(!bets || bets.length === 0) ? (
        <div
          className="rounded-2xl p-12 text-center"
          style={{ background: "linear-gradient(135deg, #12183a, #0d1224)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <Trophy size={40} className="mx-auto mb-3 text-white/20" />
          <p className="text-white/40">No bets in this category</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {bets.map((b: any) => {
            const isWin = b.status === "SETTLED_WON";
            const isLoss = b.status === "SETTLED_LOST";
            const isOpen = b.status === "OPEN";
            const isBack = b.side === "BACK";

            let plAmount = 0;
            let plColor = "text-white/60";
            if (isWin) {
              plAmount = Number(b.potentialProfit);
              plColor = "text-green-400";
            } else if (isLoss) {
              plAmount = -Number(b.liability);
              plColor = "text-red-400";
            }

            return (
              <div
                key={b.id}
                className="rounded-xl p-4 border transition-all hover:border-opacity-100"
                style={{
                  background: "linear-gradient(135deg, #12183a, #0d1224)",
                  borderColor: isWin ? "rgba(34,197,94,0.2)" : isLoss ? "rgba(244,63,94,0.2)" : isOpen ? "rgba(251,191,36,0.2)" : "rgba(255,255,255,0.06)",
                }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
                  {/* Match Info */}
                  <div>
                    <div className="text-[10px] text-white/40 uppercase tracking-widest mb-1">Match</div>
                    <div className="font-semibold text-sm text-white">{b.market?.match?.name ?? "Match"}</div>
                    <div className="text-xs text-white/50 mt-0.5">{b.runner?.name}</div>
                  </div>

                  {/* Bet Details */}
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-1 sm:space-y-2">
                    <div>
                      <div className="text-[10px] text-white/40 uppercase tracking-widest mb-0.5">Side</div>
                      <div
                        className="text-xs font-bold px-2 py-1 rounded-lg text-center"
                        style={{
                          background: isBack ? "rgba(59,130,246,0.15)" : "rgba(244,63,94,0.15)",
                          color: isBack ? "#38bdf8" : "#f43f5e",
                        }}
                      >
                        {b.side}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-white/40 uppercase tracking-widest mb-0.5">Odds</div>
                      <div className="font-mono font-bold text-sm text-white">{Number(b.odds).toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-white/40 uppercase tracking-widest mb-0.5">Stake</div>
                      <div className="font-bold text-sm text-accentSoft">₹{fmt(Number(b.stake))}</div>
                    </div>
                  </div>

                  {/* Status & P/L */}
                  <div className="flex flex-col sm:flex-row gap-3 sm:justify-end sm:items-center">
                    <div>
                      <div className="text-[10px] text-white/40 uppercase tracking-widest mb-0.5">Status</div>
                      <div className="flex items-center gap-1.5">
                        {isWin && <CheckCircle2 size={12} className="text-green-400" />}
                        {isLoss && <XCircle size={12} className="text-red-400" />}
                        {isOpen && <Clock size={12} className="text-yellow-400" />}
                        <span
                          className="text-xs font-bold uppercase px-2 py-1 rounded-lg"
                          style={{
                            background: isWin
                              ? "rgba(34,197,94,0.15)"
                              : isLoss
                                ? "rgba(244,63,94,0.15)"
                                : "rgba(251,191,36,0.15)",
                            color: isWin ? "#22c55e" : isLoss ? "#f43f5e" : "#fbbf24",
                          }}
                        >
                          {b.status === "SETTLED_WON" ? "Won" : b.status === "SETTLED_LOST" ? "Lost" : b.status}
                        </span>
                      </div>
                    </div>

                    {!isOpen && (
                      <div className="text-right">
                        <div className="text-[10px] text-white/40 uppercase tracking-widest mb-0.5">P/L</div>
                        <div className={`font-display text-lg font-bold tabular-nums ${plColor}`}>
                          {plAmount > 0 ? "+" : ""}₹{fmt(Math.abs(plAmount))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer - Date & Liability */}
                <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-3 text-xs text-white/40">
                  <span>{fmtDate(b.createdAt)}</span>
                  <span>Liability: ₹{fmt(Number(b.liability))}</span>
                  {b.market?.match?.startTime && (
                    <span>Match: {new Date(b.market.match.startTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="rounded-xl p-3 border" style={{ background: `${color}10`, borderColor: `${color}30` }}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span style={{ color }}>{icon}</span>
        <span className="text-[10px] text-white/40 uppercase tracking-wider">{label}</span>
      </div>
      <div className="font-display text-lg font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
