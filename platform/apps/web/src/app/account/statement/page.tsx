"use client";
import useSWR from "swr";
import { useMemo, useState } from "react";
import {
  ArrowDownLeft, ArrowUpRight, Gift, Zap, Wallet,
  BarChart3, Shield, RefreshCw,
  Gamepad2, Trophy, XCircle, AlertCircle, Crown, Clock,
} from "lucide-react";

/* ─── Ledger kind metadata (matches backend LedgerKind enum) ─ */
const KIND_META: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string; category: string }> = {
  DEPOSIT:           { label: "Deposit",        icon: <ArrowDownLeft size={14}/>, color: "#22c55e", bg: "rgba(34,197,94,0.12)",   category: "funds"  },
  WITHDRAWAL:        { label: "Withdrawal",      icon: <ArrowUpRight size={14}/>,  color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  category: "funds"  },
  BET_PLACE:         { label: "Bet Placed",      icon: <Zap size={14}/>,           color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  category: "sports" },
  BET_SETTLE_WIN:    { label: "Bet Win",         icon: <Trophy size={14}/>,        color: "#22c55e", bg: "rgba(34,197,94,0.12)",   category: "sports" },
  BET_SETTLE_LOSS:   { label: "Bet Loss",        icon: <XCircle size={14}/>,       color: "#f43f5e", bg: "rgba(244,63,94,0.12)",   category: "sports" },
  BET_VOID:          { label: "Bet Void",        icon: <AlertCircle size={14}/>,   color: "#a78bfa", bg: "rgba(167,139,250,0.12)", category: "sports" },
  BET_CANCEL:        { label: "Bet Cancelled",   icon: <XCircle size={14}/>,       color: "#64748b", bg: "rgba(100,116,139,0.12)", category: "sports" },
  CASINO_BET:        { label: "Casino Bet",      icon: <Gamepad2 size={14}/>,      color: "#f87171", bg: "rgba(248,113,113,0.12)", category: "casino" },
  CASINO_WIN:        { label: "Casino Win",      icon: <Gamepad2 size={14}/>,      color: "#22c55e", bg: "rgba(34,197,94,0.12)",   category: "casino" },
  CASINO_REFUND:     { label: "Casino Refund",   icon: <RefreshCw size={14}/>,     color: "#38bdf8", bg: "rgba(56,189,248,0.12)",  category: "casino" },
  ROLLBACK:          { label: "Rollback",        icon: <RefreshCw size={14}/>,     color: "#38bdf8", bg: "rgba(56,189,248,0.12)",  category: "casino" },
  ADMIN_CREDIT:      { label: "Admin Credit",    icon: <Shield size={14}/>,        color: "#22c55e", bg: "rgba(34,197,94,0.12)",   category: "admin"  },
  ADMIN_DEBIT:       { label: "Admin Debit",     icon: <Shield size={14}/>,        color: "#f43f5e", bg: "rgba(244,63,94,0.12)",   category: "admin"  },
  BONUS_GRANT:       { label: "Bonus",           icon: <Gift size={14}/>,          color: "#a78bfa", bg: "rgba(167,139,250,0.12)", category: "bonus"  },
  BONUS_FORFEIT:     { label: "Bonus Forfeit",   icon: <Gift size={14}/>,          color: "#f87171", bg: "rgba(248,113,113,0.12)", category: "bonus"  },
  COMMISSION_PAYOUT: { label: "Commission",      icon: <Crown size={14}/>,         color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  category: "other"  },
};

function getMeta(kind: string) {
  return (KIND_META as any)[kind] ?? {
    label: kind.replace(/_/g, " "),
    icon: <BarChart3 size={14}/>,
    color: "#94a3b8",
    bg: "rgba(148,163,184,0.1)",
    category: "other",
  };
}

const CATEGORIES = [
  { key: "all",    label: "All" },
  { key: "sports", label: "Sports Bets" },
  { key: "casino", label: "Casino" },
  { key: "funds",  label: "Deposits & Withdrawals" },
  { key: "bonus",  label: "Bonuses" },
  { key: "admin",  label: "Admin" },
];

const BET_STATUSES = ["OPEN", "SETTLED_WON", "SETTLED_LOST", "VOID", "CANCELLED"] as const;

function fmt(n: number | undefined | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

/* ─── Bet row — rendered from /bets/mine API ──────────────── */
function BetRow({ b }: { b: any }) {
  const isWin  = b.status === "SETTLED_WON";
  const isLoss = b.status === "SETTLED_LOST";
  const isOpen = b.status === "OPEN";
  const isBack = b.side === "BACK";

  let amtColor = "#fbbf24";
  let amtLabel = "—";
  if (isWin)  { amtColor = "#22c55e"; amtLabel = `+₹${fmt(Number(b.potentialProfit))}`; }
  if (isLoss) { amtColor = "#f43f5e"; amtLabel = `-₹${fmt(Number(b.liability))}`; }
  if (isOpen) { amtLabel = `₹${fmt(Number(b.stake))}`; }

  const statusCfg = isWin
    ? { color: "#22c55e", bg: "rgba(34,197,94,0.12)", icon: <Trophy size={11}/>, label: "Won" }
    : isLoss
      ? { color: "#f43f5e", bg: "rgba(244,63,94,0.12)", icon: <XCircle size={11}/>, label: "Lost" }
      : isOpen
        ? { color: "#fbbf24", bg: "rgba(251,191,36,0.12)", icon: <Clock size={11}/>, label: "Open" }
        : { color: "#64748b", bg: "rgba(100,116,139,0.12)", icon: <AlertCircle size={11}/>, label: b.status };

  return (
    <div className="rounded-xl border transition-all"
      style={{
        background: "linear-gradient(135deg,#12183a,#0d1224)",
        borderColor: isWin ? "rgba(34,197,94,0.2)" : isLoss ? "rgba(244,63,94,0.2)" : "rgba(251,191,36,0.15)",
      }}>
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Icon */}
        <div className="rounded-lg p-2.5 shrink-0" style={{ background: "rgba(251,191,36,0.1)" }}>
          <Zap size={14} className="text-yellow-400"/>
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-white">{b.market?.match?.name ?? "Match"}</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: isBack ? "rgba(59,130,246,0.2)" : "rgba(244,63,94,0.2)", color: isBack ? "#38bdf8" : "#f43f5e" }}>
              {b.side}
            </span>
            <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: statusCfg.bg, color: statusCfg.color }}>
              {statusCfg.icon}{statusCfg.label}
            </span>
          </div>
          <div className="text-[10px] text-white/40 mt-0.5">
            {b.runner?.name} · Odds {Number(b.odds).toFixed(2)} · {fmtDate(b.createdAt)}
          </div>
        </div>
        {/* Amount */}
        <div className="text-right shrink-0 ml-2">
          <div className="font-display text-base font-bold tabular-nums" style={{ color: amtColor }}>
            {amtLabel}
          </div>
          <div className="text-[9px] text-white/30 mt-0.5">Stake ₹{fmt(Number(b.stake))}</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Ledger row ──────────────────────────────────────────── */
function LedgerRow({ e }: { e: any }) {
  const meta  = getMeta(e.kind);
  const amt   = Number(e.amount);
  const expD  = Number(e.exposureDelta);
  const isPos = amt > 0;
  const isNeg = amt < 0;
  const isExposureOnly = amt === 0 && expD !== 0;

  return (
    <div className="rounded-xl border transition-all"
      style={{
        background: "linear-gradient(135deg,#12183a,#0d1224)",
        borderColor: isPos ? "rgba(34,197,94,0.2)" : isNeg ? "rgba(244,63,94,0.2)" : "rgba(251,191,36,0.15)",
      }}>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="rounded-lg p-2.5 shrink-0" style={{ background: meta.bg }}>
          <span style={{ color: meta.color }}>{meta.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-white">{meta.label}</div>
          <div className="text-[10px] text-white/40 mt-0.5">{fmtDate(e.createdAt)}</div>
          {e.note && <div className="text-[10px] text-white/30 truncate mt-0.5">{e.note}</div>}
        </div>
        <div className="text-right shrink-0 ml-2">
          {isExposureOnly ? (
            <>
              <div className="text-xs font-bold text-yellow-400">
                {expD > 0 ? "−" : "+"}₹{fmt(Math.abs(expD))}
              </div>
              <div className="text-[9px] text-white/30 mt-0.5">Exposure {expD > 0 ? "locked" : "released"}</div>
            </>
          ) : (
            <>
              <div className="font-display text-base font-bold tabular-nums"
                style={{ color: isPos ? "#22c55e" : isNeg ? "#f43f5e" : "#fff" }}>
                {isPos ? "+" : ""}₹{fmt(Math.abs(amt))}
              </div>
              {expD !== 0 && (
                <div className="text-[9px] text-white/30 mt-0.5">Exp {expD > 0 ? "+" : ""}₹{fmt(expD)}</div>
              )}
            </>
          )}
          <div className="text-[9px] text-white/25 mt-1 tabular-nums">Bal: ₹{fmt(Number(e.balanceAfter))}</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ───────────────────────────────────────────── */
export default function StatementPage() {
  const { data: ledger, isLoading: ledgerLoading } = useSWR("/wallet/ledger?limit=200");
  const [category, setCategory] = useState("all");

  /* Fetch all bet statuses in parallel for the Sports tab */
  const { data: betsOpen }   = useSWR("/bets/mine?status=OPEN");
  const { data: betsWon }    = useSWR("/bets/mine?status=SETTLED_WON");
  const { data: betsLost }   = useSWR("/bets/mine?status=SETTLED_LOST");
  const { data: betsVoid }   = useSWR("/bets/mine?status=VOID");
  const { data: betsCancel } = useSWR("/bets/mine?status=CANCELLED");

  const allBets = useMemo(() => {
    const merged = [
      ...(Array.isArray(betsOpen)   ? betsOpen   : []),
      ...(Array.isArray(betsWon)    ? betsWon    : []),
      ...(Array.isArray(betsLost)   ? betsLost   : []),
      ...(Array.isArray(betsVoid)   ? betsVoid   : []),
      ...(Array.isArray(betsCancel) ? betsCancel : []),
    ];
    return merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [betsOpen, betsWon, betsLost, betsVoid, betsCancel]);

  const ledgerItems: any[] = useMemo(() => ledger?.items ?? [], [ledger]);

  /* ledger entries filtered by non-sports categories */
  const filteredLedger = useMemo(() => {
    if (category === "sports") return [];
    if (category === "all")    return ledgerItems.filter((e) => getMeta(e.kind).category !== "sports");
    return ledgerItems.filter((e) => getMeta(e.kind).category === category);
  }, [ledgerItems, category]);

  /* Stats */
  const stats = useMemo(() => {
    const totalIn  = ledgerItems.filter((e) => Number(e.amount) > 0).reduce((s, e) => s + Number(e.amount), 0);
    const totalOut = ledgerItems.filter((e) => Number(e.amount) < 0).reduce((s, e) => s + Math.abs(Number(e.amount)), 0);
    return { totalIn, totalOut };
  }, [ledgerItems]);

  const categoryCounts: Record<string, number> = useMemo(() => ({
    all:    ledgerItems.filter((e) => getMeta(e.kind).category !== "sports").length + allBets.length,
    sports: allBets.length,
    casino: ledgerItems.filter((e) => getMeta(e.kind).category === "casino").length,
    funds:  ledgerItems.filter((e) => getMeta(e.kind).category === "funds").length,
    bonus:  ledgerItems.filter((e) => getMeta(e.kind).category === "bonus").length,
    admin:  ledgerItems.filter((e) => getMeta(e.kind).category === "admin").length,
  }), [ledgerItems, allBets]);

  const isLoading = ledgerLoading;
  const showBets  = category === "sports" || category === "all";
  const showEmpty = (category === "sports" ? allBets.length === 0 : filteredLedger.length === 0) && !isLoading;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl">Account Statement</h1>
        <p className="text-sm text-white/50 mt-1">Complete transaction history — all debits and credits</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="Total In"  value={`₹${fmt(stats.totalIn)}`}  icon={<ArrowDownLeft size={15}/>} color="#22c55e" />
        <SummaryCard label="Total Out" value={`₹${fmt(stats.totalOut)}`} icon={<ArrowUpRight size={15}/>}  color="#f59e0b" />
      </div>

      {/* Category Filters */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {CATEGORIES.map(({ key, label }) => {
          const isActive = category === key;
          const count = categoryCounts[key] ?? 0;
          return (
            <button key={key} onClick={() => setCategory(key)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0"
              style={{
                background: isActive ? "rgba(255,122,24,0.15)" : "rgba(255,255,255,0.05)",
                color: isActive ? "#ff7a18" : "rgba(255,255,255,0.5)",
                border: isActive ? "1px solid rgba(255,122,24,0.35)" : "1px solid rgba(255,255,255,0.08)",
              }}>
              {label}
              {count > 0 && (
                <span className="rounded-full px-1.5 text-[9px] font-bold"
                  style={{ background: isActive ? "rgba(255,122,24,0.25)" : "rgba(255,255,255,0.1)", color: isActive ? "#ff7a18" : "rgba(255,255,255,0.4)" }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Entries */}
      {isLoading ? (
        <div className="rounded-2xl p-10 text-center" style={{ background: "linear-gradient(135deg,#12183a,#0d1224)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="h-6 w-6 rounded-full border-2 border-accentSoft border-t-transparent animate-spin mx-auto"/>
        </div>
      ) : showEmpty ? (
        <div className="rounded-2xl p-12 text-center" style={{ background: "linear-gradient(135deg,#12183a,#0d1224)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <Wallet size={40} className="mx-auto mb-3 text-white/20"/>
          <p className="text-white/40">No transactions in this category</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Sports Bets from /bets/mine (always reliable) */}
          {showBets && allBets.map((b: any) => <BetRow key={b.id} b={b}/>)}
          {/* Ledger entries (non-sports) */}
          {filteredLedger.map((e: any) => <LedgerRow key={e.id} e={e}/>)}
        </div>
      )}

      {ledger?.nextCursor && (
        <p className="text-center text-xs text-white/30 py-2">Showing last 200 ledger entries.</p>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="rounded-xl p-4 border" style={{ background: `${color}10`, borderColor: `${color}30` }}>
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color }}>{icon}</span>
        <span className="text-[10px] text-white/40 uppercase tracking-widest">{label}</span>
      </div>
      <div className="font-display text-xl font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
