"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  ArrowLeft, User, Shield, CreditCard, TrendingUp, Activity, Settings,
  CheckCircle2, XCircle, Clock, Wallet, Lock, RefreshCw, Save, Bomb,
  Phone, Mail, Calendar, Key, BarChart3, Gamepad2, Ban,
  UserCheck, UserX, DollarSign, MessageSquare, AlertTriangle,
  Eye, Fingerprint, Building2, Bitcoin, Gift, Star, ShieldAlert,
  ToggleLeft, ToggleRight, Edit2, ChevronRight, Info, Plus,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProfileData {
  user: {
    id: string; username: string; email: string | null; phone: string | null;
    role: string; status: string; twoFactorEnabled: boolean;
    lastLoginAt: string | null; lastLoginIp: string | null;
    createdAt: string; updatedAt: string;
    partnershipBps: number; creditReference: number;
  };
  wallet: { balance: number; exposure: number; bonus: number };
  limits: {
    minStake: number; maxStake: number; maxMarketExposure: number;
    maxDailyLoss: number; betDelayMs: number; fancyEnabled: boolean; casinoEnabled: boolean;
  } | null;
  financials: {
    totalDeposits: number; totalWithdrawals: number; casinoWins: number;
    casinoBets: number; betWins: number; betLosses: number; adminCredits: number; bonusGranted: number;
  };
  bettingStats: { total: number; won: number; lost: number; open: number; cancelled: number; totalStake: number; winRate: number };
  casinoStats:  { totalGames: number; won: number; busted: number; totalBet: number; totalPayout: number };
  recentLogins: { userAgent: string | null; ip: string | null; createdAt: string }[];
  recentTxns:   { id: string; kind: string; method: string; amount: number | string; status: string; reference: string | null; createdAt: string }[];
  recentBets:   { id: string; side: string; stake: string | number; status: string; createdAt: string; market: { name: string; type: string } | null; runner: { name: string } | null }[];
  adminNotes:   { id: string; createdAt: string; metadata: any; actor: { username: string } | null }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  "₹" + Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const fmtShort = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "bg-ok/15 text-ok border-ok/20",
    SUSPENDED: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
    LOCKED: "bg-bad/15 text-bad border-bad/20",
    CLOSED: "bg-gray-500/15 text-gray-400 border-gray-500/20",
    BANNED: "bg-red-600/20 text-red-400 border-red-500/20",
  };
  return (
    <span className={cn("text-xs px-2.5 py-0.5 rounded-full font-bold border", map[status] ?? "bg-white/10 text-white/60 border-white/10")}>
      {status}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-accent/15 text-accentSoft border border-accent/20">
      {role}
    </span>
  );
}

function NA({ label }: { label?: string }) {
  return <span className="text-white/25 text-sm italic">{label ?? "Not available"}</span>;
}

function SectionCard({ title, icon: Icon, children, badge }: { title: string; icon: any; children: React.ReactNode; badge?: string }) {
  return (
    <div className="glass rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Icon size={15} className="text-accent" />
        <h3 className="font-bold text-sm uppercase tracking-wider text-white/70">{title}</h3>
        {badge && <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/30 border border-white/10">{badge}</span>}
      </div>
      {children}
    </div>
  );
}

function DataRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-line/30 last:border-0">
      <span className="text-xs text-white/50 shrink-0">{label}</span>
      <span className={cn("text-sm font-medium text-right", mono && "font-mono tabular-nums")}>{value}</span>
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-panel/60 rounded-lg p-3 border border-line/50">
      <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">{label}</p>
      <p className={cn("font-display text-lg tabular-nums", color ?? "text-white")}>{value}</p>
      {sub && <p className="text-[10px] text-white/30 mt-0.5">{sub}</p>}
    </div>
  );
}

function UnavailableSection({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg border border-dashed border-white/10 text-white/25 text-xs">
      <Info size={12} />
      {label} — not configured in this version
    </div>
  );
}

// ─── TABS ─────────────────────────────────────────────────────────────────────

const TABS = ["Overview", "Wallet & Finance", "Betting", "Casino", "Security", "Admin Controls"] as const;
type Tab = typeof TABS[number];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const [tab, setTab]   = useState<Tab>("Overview");
  const [saving, setSaving] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [limitForm, setLimitForm] = useState<any>(null);
  const [savingLimits, setSavingLimits] = useState(false);
  const [adjustAmt, setAdjustAmt] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  const key = `/admin/users/${id}/profile`;
  const { data, isLoading, error } = useSWR<ProfileData>(key);

  const refresh = () => mutate(key);

  if (isLoading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-white/5 rounded" />
      <div className="h-40 bg-white/5 rounded-xl" />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-64 bg-white/5 rounded-xl" />
        <div className="h-64 bg-white/5 rounded-xl" />
      </div>
    </div>
  );

  if (error || !data) return (
    <div className="text-center py-20 text-bad">
      <AlertTriangle size={32} className="mx-auto mb-3 opacity-50" />
      <p>Failed to load user profile.</p>
      <button onClick={() => router.back()} className="mt-4 text-sm text-white/50 hover:text-white underline">Go back</button>
    </div>
  );

  const { user, wallet, limits, financials, bettingStats, casinoStats, recentLogins, recentTxns, recentBets, adminNotes } = data;
  const avatarLetter = user.username[0]?.toUpperCase() ?? "U";

  // Derive: total winnings & net P&L
  const totalWinnings = financials.casinoWins + financials.betWins;
  const totalLosses   = financials.casinoBets  + financials.betLosses;
  const netPL         = totalWinnings - totalLosses;

  async function handleStatusChange(newStatus: string) {
    setSaving(true);
    try {
      await api.patch(`/users/${id}/status`, { status: newStatus });
      refresh();
    } finally { setSaving(false); }
  }

  async function handleAdjust() {
    const amt = parseFloat(adjustAmt);
    if (!amt) return;
    setAdjusting(true);
    try {
      await api.post("/admin/wallet/adjust", { userId: id, amount: amt, note: adjustNote || "Admin adjustment" });
      setAdjustAmt(""); setAdjustNote("");
      refresh();
    } finally { setAdjusting(false); }
  }

  async function handleSaveLimits() {
    if (!limitForm) return;
    setSavingLimits(true);
    try {
      await api.patch(`/users/${id}/limits`, limitForm);
      refresh();
    } finally { setSavingLimits(false); }
  }

  async function handleAddNote() {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      await api.post(`/admin/users/${id}/notes`, { note: noteText.trim() });
      setNoteText("");
      refresh();
    } finally { setAddingNote(false); }
  }

  async function handleResetPwd() {
    const pwd = prompt("New password (min 8 chars):");
    if (!pwd || pwd.length < 8) { alert("Min 8 characters."); return; }
    await api.patch(`/users/${id}/password`, { password: pwd });
    alert("Password reset successfully.");
  }

  const lf = limitForm ?? limits ?? {};

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Back */}
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-white/40 hover:text-white text-sm transition">
        <ArrowLeft size={14} /> Back to Users
      </button>

      {/* ── Profile Header ── */}
      <div className="glass rounded-xl p-5">
        <div className="flex flex-wrap items-start gap-4">
          {/* Avatar */}
          <div className="w-16 h-16 rounded-2xl bg-accent/20 border-2 border-accent/40 flex items-center justify-center shrink-0">
            <span className="font-display text-2xl text-accent">{avatarLetter}</span>
          </div>

          {/* Core info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="font-display text-2xl">{user.username}</h1>
              <StatusBadge status={user.status} />
              <RoleBadge role={user.role} />
              {user.twoFactorEnabled && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                  <Shield size={10} /> 2FA
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/40">
              {user.email  && <span className="flex items-center gap-1"><Mail size={10} />{user.email}</span>}
              {user.phone  && <span className="flex items-center gap-1"><Phone size={10} />{user.phone}</span>}
              <span className="flex items-center gap-1"><Calendar size={10} />Joined {fmtShort(user.createdAt)}</span>
              {user.lastLoginAt && <span className="flex items-center gap-1"><Clock size={10} />Last login {fmtDate(user.lastLoginAt)}</span>}
            </div>
          </div>

          {/* Quick wallet */}
          <div className="flex gap-3 shrink-0">
            <div className="text-right">
              <p className="text-[10px] text-white/40 uppercase tracking-wider">Balance</p>
              <p className="font-display text-xl text-ok">{fmt(wallet.balance)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-white/40 uppercase tracking-wider">Exposure</p>
              <p className="font-display text-xl text-bad">{fmt(wallet.exposure)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div className="flex gap-1 flex-wrap border-b border-line pb-0 -mb-2">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-semibold rounded-t-lg transition border-b-2",
              tab === t
                ? "text-accent border-accent bg-accent/5"
                : "text-white/40 border-transparent hover:text-white/70"
            )}
          >{t}</button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: Overview
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === "Overview" && (
        <div className="grid md:grid-cols-2 gap-5">
          {/* Basic Details */}
          <SectionCard title="Basic Details" icon={User}>
            <DataRow label="User ID"      value={<span className="font-mono text-xs text-white/50">{user.id}</span>} />
            <DataRow label="Username"     value={user.username} />
            <DataRow label="Full Name"    value={<NA label="Not set" />} />
            <DataRow label="Email"        value={user.email ?? <NA label="Not set" />} />
            <DataRow label="Mobile"       value={user.phone ?? <NA label="Not set" />} />
            <DataRow label="Date of Birth" value={<NA />} />
            <DataRow label="Gender"       value={<NA />} />
            <DataRow label="Member Since" value={fmtDate(user.createdAt)} />
            <DataRow label="Last Updated" value={fmtDate(user.updatedAt)} />
          </SectionCard>

          {/* Account Status */}
          <SectionCard title="Account Status" icon={Shield}>
            <DataRow label="Status"      value={<StatusBadge status={user.status} />} />
            <DataRow label="Role"        value={<RoleBadge role={user.role} />} />
            <DataRow label="Partnership" value={`${(user.partnershipBps / 100).toFixed(2)}%`} />
            <DataRow label="Credit Ref"  value={fmt(user.creditReference)} mono />
            <div className="pt-3 grid grid-cols-2 gap-2">
              {user.status !== "ACTIVE" ? (
                <button
                  onClick={() => handleStatusChange("ACTIVE")}
                  disabled={saving}
                  className="flex items-center justify-center gap-1.5 bg-ok/20 hover:bg-ok/30 border border-ok/30 text-ok text-xs font-bold py-2 rounded-lg transition disabled:opacity-50"
                >
                  <UserCheck size={12} /> Activate
                </button>
              ) : (
                <button
                  onClick={() => handleStatusChange("SUSPENDED")}
                  disabled={saving}
                  className="flex items-center justify-center gap-1.5 bg-yellow-500/15 hover:bg-yellow-500/25 border border-yellow-500/30 text-yellow-400 text-xs font-bold py-2 rounded-lg transition disabled:opacity-50"
                >
                  <UserX size={12} /> Suspend
                </button>
              )}
              <button
                onClick={() => handleStatusChange("LOCKED")}
                disabled={saving}
                className="flex items-center justify-center gap-1.5 bg-bad/15 hover:bg-bad/25 border border-bad/30 text-bad text-xs font-bold py-2 rounded-lg transition disabled:opacity-50"
              >
                <Lock size={12} /> Lock Account
              </button>
            </div>
          </SectionCard>

          {/* Activity Tracking */}
          <SectionCard title="Activity Tracking" icon={Activity}>
            <DataRow label="Last Login"   value={fmtDate(user.lastLoginAt)} />
            <DataRow label="Last IP"      value={user.lastLoginIp ?? <NA />} mono />
            <DataRow label="Country"      value={<NA />} />
            <DataRow label="Referral Source" value={<NA />} />
            <div className="pt-2 space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-white/30 font-semibold">Recent Sessions</p>
              {recentLogins.length === 0 && <p className="text-xs text-white/25">No session data</p>}
              {recentLogins.map((l, i) => (
                <div key={i} className="text-xs bg-panel/40 rounded p-2 border border-line/30">
                  <p className="font-mono text-white/60">{l.ip ?? "—"}</p>
                  <p className="text-white/30 mt-0.5 truncate">{l.userAgent ?? "Unknown browser"}</p>
                  <p className="text-white/25 text-[10px] mt-0.5">{fmtDate(l.createdAt)}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* KYC Details */}
          <SectionCard title="KYC Details" icon={Fingerprint} badge="Not Implemented">
            <UnavailableSection label="PAN Card" />
            <UnavailableSection label="Aadhaar Card" />
            <UnavailableSection label="Passport / Driving License" />
            <UnavailableSection label="Selfie Verification" />
            <UnavailableSection label="Address Proof" />
          </SectionCard>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: Wallet & Finance
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === "Wallet & Finance" && (
        <div className="space-y-5">
          {/* Wallet Balances */}
          <SectionCard title="Wallet Details" icon={Wallet}>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard label="Main Balance"   value={fmt(wallet.balance)}    color="text-ok" />
              <StatCard label="Exposure"        value={fmt(wallet.exposure)}   color="text-bad" />
              <StatCard label="Bonus Balance"   value={fmt(wallet.bonus)}      color="text-yellow-400" />
              <StatCard label="Total Deposits"  value={fmt(financials.totalDeposits)}  color="text-ok" />
              <StatCard label="Total Withdrawals" value={fmt(financials.totalWithdrawals)} color="text-bad" />
              <StatCard label="Admin Credits"   value={fmt(financials.adminCredits)}   color="text-blue-400" />
              <StatCard label="Total Winnings"  value={fmt(totalWinnings)}     color="text-ok" />
              <StatCard label="Total Losses"    value={fmt(totalLosses)}       color="text-bad" />
              <StatCard label="Net P&L"         value={fmt(netPL)}             color={netPL >= 0 ? "text-ok" : "text-bad"} />
            </div>
          </SectionCard>

          {/* Recent Transactions */}
          <SectionCard title="Recent Transactions" icon={CreditCard}>
            {recentTxns.length === 0
              ? <p className="text-sm text-white/30 text-center py-4">No transactions found.</p>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-[10px] uppercase tracking-wider text-white/30">
                      <tr className="border-b border-line/50">
                        <th className="text-left py-2 px-2">Type</th>
                        <th className="text-left py-2 px-2">Method</th>
                        <th className="text-right py-2 px-2">Amount</th>
                        <th className="text-left py-2 px-2">Status</th>
                        <th className="text-left py-2 px-2">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentTxns.map(t => (
                        <tr key={t.id} className="border-b border-line/20 hover:bg-white/[0.02]">
                          <td className="py-2 px-2 font-semibold">{t.kind}</td>
                          <td className="py-2 px-2 text-white/50">{t.method}</td>
                          <td className={cn("py-2 px-2 tabular-nums text-right font-bold", t.kind === "DEPOSIT" ? "text-ok" : "text-bad")}>
                            {t.kind === "WITHDRAWAL" ? "-" : "+"}{fmt(Number(t.amount))}
                          </td>
                          <td className="py-2 px-2">
                            <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold",
                              t.status === "APPROVED" || t.status === "COMPLETED" ? "bg-ok/15 text-ok" :
                              t.status === "REJECTED" || t.status === "FAILED"   ? "bg-bad/15 text-bad" :
                              "bg-yellow-500/15 text-yellow-400"
                            )}>{t.status}</span>
                          </td>
                          <td className="py-2 px-2 text-white/30">{fmtShort(t.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </SectionCard>

          {/* Banking & Crypto (N/A) */}
          <div className="grid md:grid-cols-2 gap-5">
            <SectionCard title="Banking Details" icon={Building2} badge="Not Implemented">
              <UnavailableSection label="Account Holder Name" />
              <UnavailableSection label="Bank Name / Account Number" />
              <UnavailableSection label="IFSC Code / Branch" />
              <UnavailableSection label="UPI ID" />
            </SectionCard>
            <SectionCard title="Crypto Details" icon={Bitcoin} badge="Not Implemented">
              <UnavailableSection label="BTC Address" />
              <UnavailableSection label="ETH Address" />
              <UnavailableSection label="USDT (TRC20 / ERC20) Address" />
            </SectionCard>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: Betting
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === "Betting" && (
        <div className="space-y-5">
          {/* Betting Stats */}
          <SectionCard title="Betting Statistics" icon={BarChart3}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Total Bets"   value={bettingStats.total}    />
              <StatCard label="Won"          value={bettingStats.won}       color="text-ok" />
              <StatCard label="Lost"         value={bettingStats.lost}      color="text-bad" />
              <StatCard label="Open"         value={bettingStats.open}      color="text-yellow-400" />
              <StatCard label="Win Rate"     value={`${bettingStats.winRate}%`} color="text-accentSoft" />
              <StatCard label="Total Stake"  value={fmt(bettingStats.totalStake)} />
              <StatCard label="Total Wins"   value={fmt(financials.betWins)}   color="text-ok" />
              <StatCard label="Total Losses" value={fmt(financials.betLosses)}  color="text-bad" />
            </div>
          </SectionCard>

          {/* Responsible Gaming */}
          <SectionCard title="Responsible Gaming / Limits" icon={Shield}>
            {limits ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <StatCard label="Min Stake"         value={fmt(limits.minStake)} />
                  <StatCard label="Max Stake"         value={fmt(limits.maxStake)} />
                  <StatCard label="Max Market Exp."   value={fmt(limits.maxMarketExposure)} />
                  <StatCard label="Max Daily Loss"    value={fmt(limits.maxDailyLoss)} />
                  <StatCard label="Bet Delay"         value={`${limits.betDelayMs}ms`} />
                  <StatCard label="Fancy Bets"        value={limits.fancyEnabled ? "Enabled" : "Disabled"} color={limits.fancyEnabled ? "text-ok" : "text-bad"} />
                </div>
                <div className="flex gap-3 text-xs font-semibold">
                  <span className={cn("px-3 py-1.5 rounded-lg border", limits.casinoEnabled ? "bg-ok/10 text-ok border-ok/20" : "bg-bad/10 text-bad border-bad/20")}>
                    Casino: {limits.casinoEnabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
              </div>
            ) : <p className="text-sm text-white/30">No custom limits set — using platform defaults.</p>}
            <div className="mt-1 space-y-1">
              <UnavailableSection label="Deposit Limit" />
              <UnavailableSection label="Daily Bet Limit / Loss Limit" />
              <UnavailableSection label="Session Timer / Self Exclusion" />
            </div>
          </SectionCard>

          {/* Recent Bets */}
          <SectionCard title="Recent Bets" icon={TrendingUp}>
            {recentBets.length === 0
              ? <p className="text-sm text-white/30 text-center py-4">No bets found.</p>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-[10px] uppercase tracking-wider text-white/30">
                      <tr className="border-b border-line/50">
                        <th className="text-left py-2 px-2">Market</th>
                        <th className="text-left py-2 px-2">Runner</th>
                        <th className="text-left py-2 px-2">Side</th>
                        <th className="text-right py-2 px-2">Stake</th>
                        <th className="text-left py-2 px-2">Status</th>
                        <th className="text-left py-2 px-2">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentBets.map(b => (
                        <tr key={b.id} className="border-b border-line/20 hover:bg-white/[0.02]">
                          <td className="py-2 px-2 max-w-[140px] truncate text-white/70">{b.market?.name ?? "—"}</td>
                          <td className="py-2 px-2 text-white/50">{b.runner?.name ?? "—"}</td>
                          <td className="py-2 px-2">
                            <span className={cn("font-bold", b.side === "BACK" ? "text-blue-400" : "text-orange-400")}>{b.side}</span>
                          </td>
                          <td className="py-2 px-2 tabular-nums text-right">{fmt(Number(b.stake))}</td>
                          <td className="py-2 px-2">
                            <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold",
                              b.status === "SETTLED_WON" ? "bg-ok/15 text-ok" :
                              b.status === "SETTLED_LOST" ? "bg-bad/15 text-bad" :
                              "bg-yellow-500/15 text-yellow-400"
                            )}>{b.status}</span>
                          </td>
                          <td className="py-2 px-2 text-white/30">{fmtShort(b.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </SectionCard>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: Casino
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === "Casino" && (
        <div className="space-y-5">
          <SectionCard title="Mines Game Statistics" icon={Bomb}>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard label="Total Games"    value={casinoStats.totalGames} />
              <StatCard label="Cashed Out"     value={casinoStats.won}    color="text-ok" />
              <StatCard label="Busted"         value={casinoStats.busted} color="text-bad" />
              <StatCard label="Win Rate"       value={casinoStats.totalGames > 0 ? `${((casinoStats.won / casinoStats.totalGames) * 100).toFixed(1)}%` : "0%"} color="text-accentSoft" />
              <StatCard label="Total Bet"      value={fmt(casinoStats.totalBet)}    />
              <StatCard label="Total Payout"   value={fmt(casinoStats.totalPayout)} color="text-ok" />
              <StatCard label="Casino Win Vol" value={fmt(financials.casinoWins)}   color="text-ok" />
              <StatCard label="Casino Bet Vol" value={fmt(financials.casinoBets)}   />
              <StatCard label="Net"            value={fmt(financials.casinoWins - financials.casinoBets)} color={financials.casinoWins >= financials.casinoBets ? "text-ok" : "text-bad"} />
            </div>
          </SectionCard>

          <div className="grid md:grid-cols-2 gap-5">
            <SectionCard title="Roulette Statistics" icon={Gamepad2} badge="Coming Soon">
              <UnavailableSection label="Roulette game stats not yet aggregated" />
            </SectionCard>
            <SectionCard title="Bonuses & Rewards" icon={Gift} badge="Not Implemented">
              <UnavailableSection label="Welcome Bonus" />
              <UnavailableSection label="Cashback Balance" />
              <UnavailableSection label="Reward Points" />
              <UnavailableSection label="Promo Code History" />
              <UnavailableSection label="Daily Rewards" />
            </SectionCard>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <SectionCard title="VIP & Loyalty" icon={Star} badge="Not Implemented">
              <UnavailableSection label="VIP Level / XP Points" />
              <UnavailableSection label="Favorite Game / Streak" />
            </SectionCard>
            <SectionCard title="Referral System" icon={ChevronRight} badge="Not Implemented">
              <UnavailableSection label="Referral Code" />
              <UnavailableSection label="Invited Users" />
              <UnavailableSection label="Referral Earnings / Commission" />
            </SectionCard>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: Security
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === "Security" && (
        <div className="space-y-5">
          <div className="grid md:grid-cols-2 gap-5">
            <SectionCard title="Security Settings" icon={Shield}>
              <DataRow
                label="Two-Factor Auth"
                value={user.twoFactorEnabled
                  ? <span className="flex items-center gap-1 text-ok text-xs font-bold"><CheckCircle2 size={12} /> Enabled</span>
                  : <span className="flex items-center gap-1 text-white/40 text-xs"><XCircle size={12} /> Disabled</span>}
              />
              <DataRow label="Email Verification" value={<NA label="Not tracked" />} />
              <DataRow label="Mobile Verification" value={<NA label="Not tracked" />} />
              <DataRow label="OTP Verification"    value={<NA />} />
              <DataRow label="Login PIN"           value={<NA />} />
              <div className="pt-3">
                <button
                  onClick={handleResetPwd}
                  className="flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 transition"
                >
                  <Key size={12} /> Reset Password
                </button>
              </div>
            </SectionCard>

            <SectionCard title="Security Flags" icon={ShieldAlert} badge="Not Implemented">
              <UnavailableSection label="VPN Detection" />
              <UnavailableSection label="Fraud Score" />
              <UnavailableSection label="Multi Account Detection" />
              <UnavailableSection label="Chargeback History" />
              <UnavailableSection label="Suspicious Activity Log" />
            </SectionCard>
          </div>

          <SectionCard title="Login History" icon={Activity}>
            {recentLogins.length === 0
              ? <p className="text-sm text-white/30 text-center py-4">No login sessions found.</p>
              : (
                <div className="space-y-2">
                  {recentLogins.map((l, i) => (
                    <div key={i} className="flex items-start gap-3 bg-panel/40 rounded-lg p-3 border border-line/30">
                      <Eye size={14} className="text-white/30 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-mono text-white/70">{l.ip ?? "Unknown IP"}</p>
                        <p className="text-xs text-white/30 mt-0.5 truncate">{l.userAgent ?? "Unknown device"}</p>
                      </div>
                      <p className="text-xs text-white/30 shrink-0">{fmtDate(l.createdAt)}</p>
                    </div>
                  ))}
                </div>
              )}
          </SectionCard>

          <div className="grid md:grid-cols-2 gap-5">
            <SectionCard title="Extra Settings" icon={Settings} badge="Not Implemented">
              <UnavailableSection label="Language Selection" />
              <UnavailableSection label="Notification Settings" />
              <UnavailableSection label="Telegram / Discord Link" />
            </SectionCard>
            <SectionCard title="KYC Verification" icon={Fingerprint} badge="Not Implemented">
              <DataRow label="KYC Status" value={<NA label="Not submitted" />} />
              <UnavailableSection label="PAN Card / Aadhaar / Passport" />
              <UnavailableSection label="Selfie Verification" />
            </SectionCard>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: Admin Controls
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === "Admin Controls" && (
        <div className="space-y-5">
          <div className="grid md:grid-cols-2 gap-5">
            {/* Admin Actions */}
            <SectionCard title="Admin Actions" icon={Settings}>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleStatusChange("ACTIVE")}
                  disabled={saving || user.status === "ACTIVE"}
                  className="flex items-center justify-center gap-1.5 bg-ok/10 hover:bg-ok/20 border border-ok/20 text-ok text-xs font-bold py-2.5 rounded-lg transition disabled:opacity-30"
                >
                  <UserCheck size={12} /> Activate
                </button>
                <button
                  onClick={() => handleStatusChange("SUSPENDED")}
                  disabled={saving}
                  className="flex items-center justify-center gap-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/20 text-yellow-400 text-xs font-bold py-2.5 rounded-lg transition disabled:opacity-50"
                >
                  <UserX size={12} /> Suspend
                </button>
                <button
                  onClick={() => handleStatusChange("LOCKED")}
                  disabled={saving}
                  className="flex items-center justify-center gap-1.5 bg-bad/10 hover:bg-bad/20 border border-bad/20 text-bad text-xs font-bold py-2.5 rounded-lg transition disabled:opacity-50"
                >
                  <Lock size={12} /> Lock
                </button>
                <button
                  onClick={() => handleStatusChange("CLOSED")}
                  disabled={saving}
                  className="flex items-center justify-center gap-1.5 bg-red-900/20 hover:bg-red-900/30 border border-red-900/30 text-red-400 text-xs font-bold py-2.5 rounded-lg transition disabled:opacity-50"
                >
                  <Ban size={12} /> Ban
                </button>
                <button
                  onClick={handleResetPwd}
                  className="col-span-2 flex items-center justify-center gap-1.5 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-purple-400 text-xs font-bold py-2.5 rounded-lg transition"
                >
                  <Key size={12} /> Reset Password
                </button>
              </div>
            </SectionCard>

            {/* Wallet Adjustment */}
            <SectionCard title="Adjust Balance" icon={DollarSign}>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/40 block mb-1">Amount (+ credit / − debit)</label>
                  <input
                    type="number"
                    value={adjustAmt}
                    onChange={e => setAdjustAmt(e.target.value)}
                    placeholder="e.g. 500 or -200"
                    className="w-full bg-panel/60 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/40 block mb-1">Note</label>
                  <input
                    type="text"
                    value={adjustNote}
                    onChange={e => setAdjustNote(e.target.value)}
                    placeholder="Reason for adjustment…"
                    className="w-full bg-panel/60 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  />
                </div>
                <button
                  onClick={handleAdjust}
                  disabled={adjusting || !adjustAmt}
                  className="flex items-center gap-2 bg-accent-grad px-5 py-2 rounded-lg font-semibold text-ink text-sm shadow-glow hover:brightness-110 disabled:opacity-50 transition"
                >
                  {adjusting ? <RefreshCw size={13} className="animate-spin" /> : <DollarSign size={13} />}
                  {adjusting ? "Applying…" : "Apply Adjustment"}
                </button>
              </div>
            </SectionCard>
          </div>

          {/* Limits Editor */}
          <SectionCard title="Betting Limits" icon={BarChart3}>
            {!limitForm ? (
              <div className="space-y-3">
                {limits ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <StatCard label="Min Stake"       value={fmt(limits.minStake)} />
                    <StatCard label="Max Stake"       value={fmt(limits.maxStake)} />
                    <StatCard label="Max Exposure"    value={fmt(limits.maxMarketExposure)} />
                    <StatCard label="Max Daily Loss"  value={fmt(limits.maxDailyLoss)} />
                    <StatCard label="Bet Delay"       value={`${limits.betDelayMs}ms`} />
                    <StatCard label="Casino"          value={limits.casinoEnabled ? "On" : "Off"} color={limits.casinoEnabled ? "text-ok" : "text-bad"} />
                  </div>
                ) : <p className="text-sm text-white/30">Using platform defaults.</p>}
                <button
                  onClick={() => setLimitForm(limits ?? { minStake: 100, maxStake: 100000, maxMarketExposure: 1000000, maxDailyLoss: 500000, betDelayMs: 0, fancyEnabled: true, casinoEnabled: true })}
                  className="flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg border border-accent/30 text-accentSoft hover:bg-accent/10 transition"
                >
                  <Edit2 size={12} /> Edit Limits
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: "minStake", label: "Min Stake" },
                    { key: "maxStake", label: "Max Stake" },
                    { key: "maxMarketExposure", label: "Max Market Exposure" },
                    { key: "maxDailyLoss", label: "Max Daily Loss" },
                    { key: "betDelayMs", label: "Bet Delay (ms)" },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="text-[10px] uppercase tracking-wider text-white/40 block mb-1">{f.label}</label>
                      <input
                        type="number"
                        value={lf[f.key] ?? ""}
                        onChange={e => setLimitForm((p: any) => ({ ...p, [f.key]: Number(e.target.value) }))}
                        className="w-full bg-panel/60 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                      />
                    </div>
                  ))}
                  <div className="flex items-center gap-3 col-span-2">
                    {(["fancyEnabled", "casinoEnabled"] as const).map(key => (
                      <button key={key} onClick={() => setLimitForm((p: any) => ({ ...p, [key]: !p[key] }))} className="flex items-center gap-2 text-sm">
                        {lf[key] ? <ToggleRight size={24} className="text-ok" /> : <ToggleLeft size={24} className="text-white/30" />}
                        <span className="text-white/60">{key === "fancyEnabled" ? "Fancy Bets" : "Casino"}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveLimits}
                    disabled={savingLimits}
                    className="flex items-center gap-2 bg-accent-grad px-5 py-2 rounded-lg font-semibold text-ink text-sm shadow-glow hover:brightness-110 disabled:opacity-50 transition"
                  >
                    {savingLimits ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                    {savingLimits ? "Saving…" : "Save Limits"}
                  </button>
                  <button onClick={() => setLimitForm(null)} className="px-4 py-2 text-sm text-white/40 hover:text-white border border-line rounded-lg transition">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </SectionCard>

          {/* Admin Notes */}
          <SectionCard title="Admin Notes" icon={MessageSquare}>
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddNote(); } }}
                  placeholder="Add a note about this user…"
                  className="flex-1 bg-panel/60 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                />
                <button
                  onClick={handleAddNote}
                  disabled={addingNote || !noteText.trim()}
                  className="flex items-center gap-1.5 bg-accent-grad px-4 py-2 rounded-lg font-semibold text-ink text-sm shadow-glow hover:brightness-110 disabled:opacity-50 transition"
                >
                  {addingNote ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />}
                  Add
                </button>
              </div>
              {adminNotes.length === 0
                ? <p className="text-sm text-white/25 text-center py-3">No notes yet.</p>
                : adminNotes.map(n => (
                  <div key={n.id} className="bg-panel/40 rounded-lg p-3 border border-line/30">
                    <p className="text-sm text-white/80">{n.metadata?.note ?? "—"}</p>
                    <p className="text-[10px] text-white/30 mt-1">
                      {n.actor?.username ?? "admin"} · {fmtDate(n.createdAt)}
                    </p>
                  </div>
                ))}
            </div>
          </SectionCard>

          {/* Placeholder sections */}
          <div className="grid md:grid-cols-2 gap-5">
            <SectionCard title="VIP Management" icon={Star} badge="Not Implemented">
              <UnavailableSection label="VIP Level / Tier" />
              <UnavailableSection label="Loyalty Points" />
            </SectionCard>
            <SectionCard title="Freeze Controls" icon={AlertTriangle} badge="Not Implemented">
              <UnavailableSection label="Freeze Withdrawals" />
              <UnavailableSection label="Mark Suspicious" />
            </SectionCard>
          </div>
        </div>
      )}
    </div>
  );
}
