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
  ToggleLeft, ToggleRight, Edit2, ChevronRight, Info, Plus, Crown,
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
  vip: { name: string; tier: number; color: string; cashbackBps: number; minWagered: number; totalDeposited: number; nextThreshold: number | null; toNext: number; perks: string[] } | null;
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

const STATUS_STYLE: Record<string, string> = {
  ACTIVE:    "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  SUSPENDED: "bg-yellow-500/15  text-yellow-300  border-yellow-500/30",
  LOCKED:    "bg-red-500/15     text-red-300     border-red-500/30",
  CLOSED:    "bg-gray-700/50    text-gray-400    border-gray-600/50",
  BANNED:    "bg-red-500/20     text-red-300     border-red-500/40",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("text-xs px-2.5 py-0.5 rounded-full font-bold border", STATUS_STYLE[status] ?? "bg-gray-700 text-gray-500 border-gray-700")}>
      {status}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
      {role}
    </span>
  );
}

function NA({ label }: { label?: string }) {
  return <span className="text-gray-300 text-sm italic">{label ?? "Not available"}</span>;
}

function SectionCard({ title, icon: Icon, children, badge }: { title: string; icon: any; children: React.ReactNode; badge?: string }) {
  return (
    <div className="bg-gray-800 rounded-xl border border-yellow-500/20 p-5 space-y-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Icon size={15} className="text-yellow-500" />
        <h3 className="font-bold text-sm uppercase tracking-wider text-gray-500">{title}</h3>
        {badge && <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-gray-700 text-gray-400 border border-gray-700">{badge}</span>}
      </div>
      {children}
    </div>
  );
}

function DataRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-gray-700 last:border-0">
      <span className="text-xs text-gray-400 shrink-0">{label}</span>
      <span className={cn("text-sm font-medium text-gray-200 text-right", mono && "font-mono tabular-nums")}>{value}</span>
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-gray-800 rounded-xl p-3.5 border border-gray-700">
      <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">{label}</p>
      <p className={cn("font-black text-lg tabular-nums", color ?? "text-gray-200")}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function UnavailableSection({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg border border-dashed border-gray-700 text-gray-400 text-xs">
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
  const [adjustMode, setAdjustMode] = useState<"credit" | "debit">("credit");
  const [adjustStatus, setAdjustStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const key = `/admin/users/${id}/profile`;
  const { data, isLoading, error } = useSWR<ProfileData>(key);

  const refresh = () => mutate(key);

  if (isLoading) return (
    <div className="space-y-4">
      <div className="h-8 w-48 bg-gray-700 rounded animate-pulse" />
      <div className="h-40 bg-gray-700 rounded-xl animate-pulse" />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-64 bg-gray-700 rounded-xl animate-pulse" />
        <div className="h-64 bg-gray-700 rounded-xl animate-pulse" />
      </div>
    </div>
  );

  if (error || !data) return (
    <div className="text-center py-20 text-red-500">
      <AlertTriangle size={32} className="mx-auto mb-3 opacity-50" />
      <p className="font-semibold">Failed to load user profile.</p>
      <button onClick={() => router.back()} className="mt-4 text-sm text-gray-400 hover:text-gray-300 underline">Go back</button>
    </div>
  );

  const { user, wallet, limits, vip, financials, bettingStats, casinoStats, recentLogins, recentTxns, recentBets, adminNotes } = data;
  const avatarLetter = user.username[0]?.toUpperCase() ?? "U";
  const totalWinnings = financials.casinoWins + financials.betWins;
  const totalLosses   = financials.casinoBets + financials.betLosses;
  const netPL         = totalWinnings - totalLosses;

  async function handleStatusChange(newStatus: string) {
    setSaving(true);
    try { await api.patch(`/users/${id}/status`, { status: newStatus }); refresh(); }
    finally { setSaving(false); }
  }

  async function handleAdjust() {
    const raw = parseFloat(adjustAmt);
    if (!raw || raw <= 0) { setAdjustStatus({ kind: "err", msg: "Enter a positive amount." }); return; }
    const signed = adjustMode === "credit" ? raw : -raw;
    const verb = adjustMode === "credit" ? "credit" : "debit";
    if (!confirm(`Confirm ${verb} of ₹${raw.toLocaleString("en-IN")} for ${user.username}?`)) return;
    setAdjusting(true); setAdjustStatus(null);
    try {
      await api.post("/admin/wallet/adjust", { userId: id, amount: signed, note: adjustNote || `Admin ${verb}` });
      setAdjustAmt(""); setAdjustNote("");
      setAdjustStatus({ kind: "ok", msg: `₹${raw.toLocaleString("en-IN")} ${verb}ed successfully.` });
      refresh();
      setTimeout(() => setAdjustStatus(null), 4000);
    } catch (e: any) {
      setAdjustStatus({ kind: "err", msg: e?.response?.data?.message ?? "Adjustment failed." });
    } finally { setAdjusting(false); }
  }

  async function handleSaveLimits() {
    if (!limitForm) return;
    setSavingLimits(true);
    try { await api.patch(`/users/${id}/limits`, limitForm); refresh(); }
    finally { setSavingLimits(false); }
  }

  async function handleAddNote() {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try { await api.post(`/admin/users/${id}/notes`, { note: noteText.trim() }); setNoteText(""); refresh(); }
    finally { setAddingNote(false); }
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
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-gray-400 hover:text-gray-300 text-sm transition font-medium">
        <ArrowLeft size={14} /> Back to Users
      </button>

      {/* ── Profile Header ── */}
      <div className="bg-gray-800 rounded-xl border border-yellow-500/20 p-5 shadow-sm">
        <div className="flex flex-wrap items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-yellow-500/15 border-2 border-yellow-500/40 flex items-center justify-center shrink-0">
            <span className="font-black text-2xl text-yellow-400">{avatarLetter}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="font-black text-2xl text-gray-100">{user.username}</h1>
              <StatusBadge status={user.status} />
              <RoleBadge role={user.role} />
              {user.twoFactorEnabled && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 flex items-center gap-1 font-bold">
                  <Shield size={10} /> 2FA
                </span>
              )}
              {vip && (
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold border flex items-center gap-1"
                  style={{ background: `${vip.color}22`, color: vip.color, borderColor: `${vip.color}66` }}>
                  <Crown size={10} /> {vip.name} · Tier {vip.tier}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
              {user.email  && <span className="flex items-center gap-1"><Mail size={10} />{user.email}</span>}
              {user.phone  && <span className="flex items-center gap-1"><Phone size={10} />{user.phone}</span>}
              <span className="flex items-center gap-1"><Calendar size={10} />Joined {fmtShort(user.createdAt)}</span>
              {user.lastLoginAt && <span className="flex items-center gap-1"><Clock size={10} />Last login {fmtDate(user.lastLoginAt)}</span>}
            </div>
          </div>
          <div className="flex gap-4 shrink-0">
            <div className="text-right">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Balance</p>
              <p className="font-black text-xl text-emerald-400">{fmt(wallet.balance)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Exposure</p>
              <p className="font-black text-xl text-red-500">{fmt(wallet.exposure)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div className="flex gap-1 flex-wrap border-b border-gray-700 -mb-2">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-semibold rounded-t-lg transition border-b-2",
              tab === t ? "text-yellow-300 border-yellow-400 bg-gray-800" : "text-gray-400 border-transparent hover:text-gray-400"
            )}>{t}</button>
        ))}
      </div>

      {/* ══ TAB: Overview ══ */}
      {tab === "Overview" && (
        <div className="grid md:grid-cols-2 gap-5">
          <SectionCard title="Basic Details" icon={User}>
            <DataRow label="User ID"      value={<span className="font-mono text-xs text-gray-400">{user.id}</span>} />
            <DataRow label="Username"     value={user.username} />
            <DataRow label="Full Name"    value={<NA label="Not set" />} />
            <DataRow label="Email"        value={user.email ?? <NA label="Not set" />} />
            <DataRow label="Mobile"       value={user.phone ?? <NA label="Not set" />} />
            <DataRow label="Date of Birth" value={<NA />} />
            <DataRow label="Member Since" value={fmtDate(user.createdAt)} />
            <DataRow label="Last Updated" value={fmtDate(user.updatedAt)} />
          </SectionCard>

          <SectionCard title="Account Status" icon={Shield}>
            <DataRow label="Status"      value={<StatusBadge status={user.status} />} />
            <DataRow label="Role"        value={<RoleBadge role={user.role} />} />
            <DataRow label="Partnership" value={`${(user.partnershipBps / 100).toFixed(2)}%`} />
            <DataRow label="Credit Ref"  value={fmt(user.creditReference)} mono />
            <div className="pt-3 grid grid-cols-2 gap-2">
              {user.status !== "ACTIVE" ? (
                <button onClick={() => handleStatusChange("ACTIVE")} disabled={saving}
                  className="flex items-center justify-center gap-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-bold py-2 rounded-lg transition disabled:opacity-50">
                  <UserCheck size={12} /> Activate
                </button>
              ) : (
                <button onClick={() => handleStatusChange("SUSPENDED")} disabled={saving}
                  className="flex items-center justify-center gap-1.5 bg-yellow-500/15 hover:bg-yellow-500/25 border border-yellow-500/30 text-yellow-300 text-xs font-bold py-2 rounded-lg transition disabled:opacity-50">
                  <UserX size={12} /> Suspend
                </button>
              )}
              <button onClick={() => handleStatusChange("LOCKED")} disabled={saving}
                className="flex items-center justify-center gap-1.5 bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-xs font-bold py-2 rounded-lg transition disabled:opacity-50">
                <Lock size={12} /> Lock Account
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Activity Tracking" icon={Activity}>
            <DataRow label="Last Login"      value={fmtDate(user.lastLoginAt)} />
            <DataRow label="Last IP"         value={user.lastLoginIp ?? <NA />} mono />
            <DataRow label="Country"         value={<NA />} />
            <DataRow label="Referral Source" value={<NA />} />
            <div className="pt-2 space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Recent Sessions</p>
              {recentLogins.length === 0 && <p className="text-xs text-gray-300">No session data</p>}
              {recentLogins.map((l, i) => (
                <div key={i} className="text-xs bg-gray-800 rounded-lg p-2 border border-gray-700">
                  <p className="font-mono text-gray-400">{l.ip ?? "—"}</p>
                  <p className="text-gray-400 mt-0.5 truncate">{l.userAgent ?? "Unknown browser"}</p>
                  <p className="text-gray-300 text-[10px] mt-0.5">{fmtDate(l.createdAt)}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="KYC Details" icon={Fingerprint} badge="Not Implemented">
            <UnavailableSection label="PAN Card" />
            <UnavailableSection label="Aadhaar Card" />
            <UnavailableSection label="Passport / Driving License" />
            <UnavailableSection label="Selfie Verification" />
            <UnavailableSection label="Address Proof" />
          </SectionCard>
        </div>
      )}

      {/* ══ TAB: Wallet & Finance ══ */}
      {tab === "Wallet & Finance" && (
        <div className="space-y-5">
          <SectionCard title="Wallet Details" icon={Wallet}>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard label="Main Balance"     value={fmt(wallet.balance)}              color="text-emerald-400" />
              <StatCard label="Exposure"          value={fmt(wallet.exposure)}             color="text-red-500" />
              <StatCard label="Bonus Balance"     value={fmt(wallet.bonus)}               color="text-yellow-400" />
              <StatCard label="Total Deposits"    value={fmt(financials.totalDeposits)}   color="text-emerald-400" />
              <StatCard label="Total Withdrawals" value={fmt(financials.totalWithdrawals)} color="text-red-500" />
              <StatCard label="Admin Credits"     value={fmt(financials.adminCredits)}    color="text-blue-400" />
              <StatCard label="Total Winnings"    value={fmt(totalWinnings)}              color="text-emerald-400" />
              <StatCard label="Total Losses"      value={fmt(totalLosses)}                color="text-red-500" />
              <StatCard label="Net P&L"           value={fmt(netPL)}                      color={netPL >= 0 ? "text-emerald-400" : "text-red-500"} />
            </div>
          </SectionCard>

          <SectionCard title="Balance Management" icon={DollarSign}>
            {(() => {
              const amt = parseFloat(adjustAmt) || 0;
              const signed = adjustMode === "credit" ? amt : -amt;
              const projected = wallet.balance + signed;
              const QUICK = [100, 500, 1000, 5000, 10000, 50000, 100000];
              const isCredit = adjustMode === "credit";
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-gray-800 border border-gray-700">
                    <button type="button" onClick={() => setAdjustMode("credit")}
                      className={cn("flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm transition",
                        isCredit ? "bg-emerald-600 text-white shadow-md" : "text-gray-400 hover:text-gray-300")}>
                      <Plus size={16} /> Credit (Add)
                    </button>
                    <button type="button" onClick={() => setAdjustMode("debit")}
                      className={cn("flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm transition",
                        !isCredit ? "bg-red-600 text-white shadow-md" : "text-gray-400 hover:text-gray-300")}>
                      <span className="text-lg leading-none">−</span> Debit (Remove)
                    </button>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Amount</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                        <input type="number" inputMode="decimal" min={0} step="0.01"
                          value={adjustAmt} onChange={(e) => { setAdjustAmt(e.target.value); setAdjustStatus(null); }}
                          placeholder="0.00"
                          className="w-full pl-7 pr-3 py-3 bg-gray-800 border border-yellow-200 rounded-lg text-lg font-black tabular-nums text-gray-200 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition" />
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {QUICK.map(v => (
                          <button key={v} type="button" onClick={() => { setAdjustAmt(String(v)); setAdjustStatus(null); }}
                            className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-gray-800 border border-yellow-200 text-gray-400 hover:bg-gray-800 hover:border-yellow-400 hover:text-yellow-300 transition">
                            +{v >= 1000 ? `${v/1000}K` : v}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-[11px] uppercase tracking-wider text-gray-400">Current Balance</span>
                        <span className="font-black text-sm tabular-nums text-gray-300">{fmt(wallet.balance)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[11px] uppercase tracking-wider text-gray-400">Adjustment</span>
                        <span className={cn("font-black text-sm tabular-nums", isCredit ? "text-emerald-400" : "text-red-500")}>
                          {amt > 0 ? `${isCredit ? "+" : "−"}${fmt(amt)}` : "—"}
                        </span>
                      </div>
                      <div className="border-t border-gray-700 pt-2 flex justify-between">
                        <span className="text-[11px] uppercase tracking-wider text-gray-400 font-bold">New Balance</span>
                        <span className={cn("font-black text-xl tabular-nums", projected >= 0 ? "text-emerald-400" : "text-red-500")}>
                          {fmt(projected)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Note (optional)</label>
                    <input type="text" value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} maxLength={200}
                      placeholder="Reason or reference (e.g. manual deposit, bonus, correction)"
                      className="w-full px-3 py-2 bg-gray-800 border border-yellow-200 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-yellow-400 transition" />
                  </div>

                  {adjustStatus && (
                    <div className={cn("rounded-lg px-3 py-2 text-sm flex items-center gap-2 border",
                      adjustStatus.kind === "ok" ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" : "bg-red-500/15 border-red-500/30 text-red-300")}>
                      {adjustStatus.kind === "ok" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                      {adjustStatus.msg}
                    </div>
                  )}

                  <button type="button" onClick={handleAdjust} disabled={adjusting || !amt}
                    className={cn("w-full py-3 rounded-lg font-bold text-sm tracking-wide transition disabled:opacity-40 disabled:cursor-not-allowed",
                      isCredit ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-red-600 hover:bg-red-500 text-white")}>
                    {adjusting ? "Processing…" : amt > 0 ? `${isCredit ? "Credit" : "Debit"} ₹${amt.toLocaleString("en-IN")}` : `${isCredit ? "Credit" : "Debit"} Account`}
                  </button>
                </div>
              );
            })()}
          </SectionCard>

          <SectionCard title="Recent Transactions" icon={CreditCard}>
            {recentTxns.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No transactions found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-gray-400">Type</th>
                      <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-gray-400">Method</th>
                      <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider text-gray-400">Amount</th>
                      <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-gray-400">Status</th>
                      <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-gray-400">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTxns.map(t => (
                      <tr key={t.id} className="border-b border-gray-800 hover:bg-gray-800/40 transition">
                        <td className="py-2 px-2 font-semibold text-gray-300">{t.kind}</td>
                        <td className="py-2 px-2 text-gray-500">{t.method}</td>
                        <td className={cn("py-2 px-2 tabular-nums text-right font-bold", t.kind === "DEPOSIT" ? "text-emerald-400" : "text-red-500")}>
                          {t.kind === "WITHDRAWAL" ? "-" : "+"}{fmt(Number(t.amount))}
                        </td>
                        <td className="py-2 px-2">
                          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold",
                            t.status === "APPROVED" || t.status === "COMPLETED" ? "bg-emerald-500/15 text-emerald-300" :
                            t.status === "REJECTED" || t.status === "FAILED"   ? "bg-red-500/15 text-red-300" :
                            "bg-yellow-500/15 text-yellow-300")}>{t.status}</span>
                        </td>
                        <td className="py-2 px-2 text-gray-400">{fmtShort(t.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

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

      {/* ══ TAB: Betting ══ */}
      {tab === "Betting" && (
        <div className="space-y-5">
          <SectionCard title="Betting Statistics" icon={BarChart3}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Total Bets"   value={bettingStats.total} />
              <StatCard label="Won"          value={bettingStats.won}        color="text-emerald-400" />
              <StatCard label="Lost"         value={bettingStats.lost}       color="text-red-500" />
              <StatCard label="Open"         value={bettingStats.open}       color="text-yellow-400" />
              <StatCard label="Win Rate"     value={`${bettingStats.winRate}%`} color="text-blue-400" />
              <StatCard label="Total Stake"  value={fmt(bettingStats.totalStake)} />
              <StatCard label="Total Wins"   value={fmt(financials.betWins)}   color="text-emerald-400" />
              <StatCard label="Total Losses" value={fmt(financials.betLosses)}  color="text-red-500" />
            </div>
          </SectionCard>

          <SectionCard title="Responsible Gaming / Limits" icon={Shield}>
            {limits ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <StatCard label="Min Stake"       value={fmt(limits.minStake)} />
                  <StatCard label="Max Stake"       value={fmt(limits.maxStake)} />
                  <StatCard label="Max Market Exp." value={fmt(limits.maxMarketExposure)} />
                  <StatCard label="Max Daily Loss"  value={fmt(limits.maxDailyLoss)} />
                  <StatCard label="Bet Delay"       value={`${limits.betDelayMs}ms`} />
                  <StatCard label="Fancy Bets"      value={limits.fancyEnabled ? "Enabled" : "Disabled"} color={limits.fancyEnabled ? "text-emerald-400" : "text-red-500"} />
                </div>
                <div className="flex gap-3 text-xs font-semibold">
                  <span className={cn("px-3 py-1.5 rounded-lg border", limits.casinoEnabled ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "bg-red-500/15 text-red-300 border-red-500/30")}>
                    Casino: {limits.casinoEnabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
              </div>
            ) : <p className="text-sm text-gray-400">No custom limits set — using platform defaults.</p>}
            <div className="mt-1 space-y-1">
              <UnavailableSection label="Deposit Limit" />
              <UnavailableSection label="Daily Bet Limit / Loss Limit" />
              <UnavailableSection label="Session Timer / Self Exclusion" />
            </div>
          </SectionCard>

          <SectionCard title="Recent Bets" icon={TrendingUp}>
            {recentBets.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No bets found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-gray-400">Market</th>
                      <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-gray-400">Runner</th>
                      <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-gray-400">Side</th>
                      <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider text-gray-400">Stake</th>
                      <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-gray-400">Status</th>
                      <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-gray-400">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentBets.map(b => (
                      <tr key={b.id} className="border-b border-gray-800 hover:bg-gray-800/40 transition">
                        <td className="py-2 px-2 max-w-[140px] truncate text-gray-400 font-medium">{b.market?.name ?? "—"}</td>
                        <td className="py-2 px-2 text-gray-500">{b.runner?.name ?? "—"}</td>
                        <td className="py-2 px-2">
                          <span className={cn("font-black text-xs px-2 py-0.5 rounded",
                            b.side === "BACK" ? "bg-blue-900/20 text-blue-300" : "bg-orange-900/30 text-orange-400")}>{b.side}</span>
                        </td>
                        <td className="py-2 px-2 tabular-nums text-right text-gray-300 font-semibold">{fmt(Number(b.stake))}</td>
                        <td className="py-2 px-2">
                          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold",
                            b.status === "SETTLED_WON"  ? "bg-emerald-500/15 text-emerald-300" :
                            b.status === "SETTLED_LOST" ? "bg-red-500/15 text-red-300" :
                            "bg-yellow-500/15 text-yellow-300")}>{b.status}</span>
                        </td>
                        <td className="py-2 px-2 text-gray-400">{fmtShort(b.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* ══ TAB: Casino ══ */}
      {tab === "Casino" && (
        <div className="space-y-5">
          <SectionCard title="Mines Game Statistics" icon={Bomb}>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard label="Total Games"    value={casinoStats.totalGames} />
              <StatCard label="Cashed Out"     value={casinoStats.won}    color="text-emerald-400" />
              <StatCard label="Busted"         value={casinoStats.busted} color="text-red-500" />
              <StatCard label="Win Rate"       value={casinoStats.totalGames > 0 ? `${((casinoStats.won / casinoStats.totalGames) * 100).toFixed(1)}%` : "0%"} color="text-blue-400" />
              <StatCard label="Total Bet"      value={fmt(casinoStats.totalBet)} />
              <StatCard label="Total Payout"   value={fmt(casinoStats.totalPayout)} color="text-emerald-400" />
              <StatCard label="Casino Win Vol" value={fmt(financials.casinoWins)}   color="text-emerald-400" />
              <StatCard label="Casino Bet Vol" value={fmt(financials.casinoBets)} />
              <StatCard label="Net"            value={fmt(financials.casinoWins - financials.casinoBets)} color={financials.casinoWins >= financials.casinoBets ? "text-emerald-400" : "text-red-500"} />
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
            <SectionCard title="VIP & Loyalty" icon={Star}>
              {vip ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Crown size={16} style={{ color: vip.color }} />
                    <span className="font-black text-gray-100">{vip.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700/50 text-gray-300 border border-gray-600/50">Tier {vip.tier}</span>
                  </div>
                  <DataRow label="Cashback"        value={`${vip.cashbackBps / 100}%`} />
                  <DataRow label="Total Deposited" value={fmt(vip.totalDeposited)} mono />
                  <DataRow label="Tier Threshold"  value={fmt(vip.minWagered)} mono />
                  <DataRow label="To Next Tier"    value={vip.nextThreshold ? fmt(vip.toNext) : "Max tier"} mono />
                  {Array.isArray(vip.perks) && vip.perks.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {vip.perks.map((p, i) => <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-300 border border-yellow-500/30">{p}</span>)}
                    </div>
                  )}
                </div>
              ) : <p className="text-sm text-gray-400">No VIP tier assigned. Assign one from the Admin Controls tab.</p>}
            </SectionCard>
            <SectionCard title="Referral System" icon={ChevronRight} badge="Not Implemented">
              <UnavailableSection label="Referral Code" />
              <UnavailableSection label="Invited Users" />
              <UnavailableSection label="Referral Earnings / Commission" />
            </SectionCard>
          </div>
        </div>
      )}

      {/* ══ TAB: Security ══ */}
      {tab === "Security" && (
        <div className="space-y-5">
          <div className="grid md:grid-cols-2 gap-5">
            <SectionCard title="Security Settings" icon={Shield}>
              <DataRow label="Two-Factor Auth"
                value={user.twoFactorEnabled
                  ? <span className="flex items-center gap-1 text-emerald-300 text-xs font-bold"><CheckCircle2 size={12} /> Enabled</span>
                  : <span className="flex items-center gap-1 text-gray-400 text-xs"><XCircle size={12} /> Disabled</span>} />
              <DataRow label="Email Verification" value={<NA label="Not tracked" />} />
              <DataRow label="Mobile Verification" value={<NA label="Not tracked" />} />
              <DataRow label="OTP Verification"    value={<NA />} />
              <DataRow label="Login PIN"           value={<NA />} />
              <div className="pt-3">
                <button onClick={handleResetPwd}
                  className="flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg border border-purple-500/30 text-purple-300 bg-purple-500/15 hover:bg-purple-500/25 transition">
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
            {recentLogins.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No login sessions found.</p>
            ) : (
              <div className="space-y-2">
                {recentLogins.map((l, i) => (
                  <div key={i} className="flex items-start gap-3 bg-gray-800 rounded-lg p-3 border border-gray-700">
                    <Eye size={14} className="text-gray-300 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono text-gray-300">{l.ip ?? "Unknown IP"}</p>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{l.userAgent ?? "Unknown device"}</p>
                    </div>
                    <p className="text-xs text-gray-400 shrink-0">{fmtDate(l.createdAt)}</p>
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

      {/* ══ TAB: Admin Controls ══ */}
      {tab === "Admin Controls" && (
        <div className="space-y-5">
          <div>
            <SectionCard title="Admin Actions" icon={Settings}>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => handleStatusChange("ACTIVE")} disabled={saving || user.status === "ACTIVE"}
                  className="flex items-center justify-center gap-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-bold py-2.5 rounded-lg transition disabled:opacity-30">
                  <UserCheck size={12} /> Activate
                </button>
                <button onClick={() => handleStatusChange("SUSPENDED")} disabled={saving}
                  className="flex items-center justify-center gap-1.5 bg-yellow-500/15 hover:bg-yellow-500/25 border border-yellow-500/30 text-yellow-300 text-xs font-bold py-2.5 rounded-lg transition disabled:opacity-50">
                  <UserX size={12} /> Suspend
                </button>
                <button onClick={() => handleStatusChange("LOCKED")} disabled={saving}
                  className="flex items-center justify-center gap-1.5 bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-xs font-bold py-2.5 rounded-lg transition disabled:opacity-50">
                  <Lock size={12} /> Lock
                </button>
                <button onClick={() => handleStatusChange("CLOSED")} disabled={saving}
                  className="flex items-center justify-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-xs font-bold py-2.5 rounded-lg transition disabled:opacity-50">
                  <Ban size={12} /> Ban
                </button>
                <button onClick={handleResetPwd}
                  className="col-span-2 flex items-center justify-center gap-1.5 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 text-xs font-bold py-2.5 rounded-lg transition">
                  <Key size={12} /> Reset Password
                </button>
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Betting Limits" icon={BarChart3}>
            {!limitForm ? (
              <div className="space-y-3">
                {limits ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <StatCard label="Min Stake"      value={fmt(limits.minStake)} />
                    <StatCard label="Max Stake"      value={fmt(limits.maxStake)} />
                    <StatCard label="Max Exposure"   value={fmt(limits.maxMarketExposure)} />
                    <StatCard label="Max Daily Loss" value={fmt(limits.maxDailyLoss)} />
                    <StatCard label="Bet Delay"      value={`${limits.betDelayMs}ms`} />
                    <StatCard label="Casino"         value={limits.casinoEnabled ? "On" : "Off"} color={limits.casinoEnabled ? "text-emerald-400" : "text-red-500"} />
                  </div>
                ) : <p className="text-sm text-gray-400">Using platform defaults.</p>}
                <button onClick={() => setLimitForm(limits ?? { minStake: 100, maxStake: 100000, maxMarketExposure: 1000000, maxDailyLoss: 500000, betDelayMs: 0, fancyEnabled: true, casinoEnabled: true })}
                  className="flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg border border-yellow-500/30 text-yellow-300 bg-yellow-500/10 hover:bg-yellow-500/20 transition">
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
                      <label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold block mb-1">{f.label}</label>
                      <input type="number" value={lf[f.key] ?? ""}
                        onChange={e => setLimitForm((p: any) => ({ ...p, [f.key]: Number(e.target.value) }))}
                        className="w-full bg-gray-800 border border-yellow-200 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-yellow-400 transition" />
                    </div>
                  ))}
                  <div className="flex items-center gap-4 col-span-2 pt-1">
                    {(["fancyEnabled", "casinoEnabled"] as const).map(k => (
                      <button key={k} onClick={() => setLimitForm((p: any) => ({ ...p, [k]: !p[k] }))} className="flex items-center gap-2 text-sm">
                        {lf[k] ? <ToggleRight size={24} className="text-emerald-500" /> : <ToggleLeft size={24} className="text-gray-300" />}
                        <span className="text-gray-400 font-medium">{k === "fancyEnabled" ? "Fancy Bets" : "Casino"}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleSaveLimits} disabled={savingLimits}
                    className="btn-primary flex items-center gap-2 disabled:opacity-50">
                    {savingLimits ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                    {savingLimits ? "Saving…" : "Save Limits"}
                  </button>
                  <button onClick={() => setLimitForm(null)}
                    className="btn-secondary text-sm">Cancel</button>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Admin Notes" icon={MessageSquare}>
            <div className="space-y-2">
              <div className="flex gap-2">
                <input value={noteText} onChange={e => setNoteText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddNote(); } }}
                  placeholder="Add a note about this user…"
                  className="flex-1 bg-gray-800 border border-yellow-200 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-yellow-400 transition" />
                <button onClick={handleAddNote} disabled={addingNote || !noteText.trim()}
                  className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
                  {addingNote ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />} Add
                </button>
              </div>
              {adminNotes.length === 0
                ? <p className="text-sm text-gray-400 text-center py-3">No notes yet.</p>
                : adminNotes.map(n => (
                  <div key={n.id} className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                    <p className="text-sm text-gray-300">{n.metadata?.note ?? "—"}</p>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {n.actor?.username ?? "admin"} · {fmtDate(n.createdAt)}
                    </p>
                  </div>
                ))}
            </div>
          </SectionCard>

          <div className="grid md:grid-cols-2 gap-5">
            <SectionCard title="VIP Level" icon={Star}>
              {vip && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Crown size={16} style={{ color: vip.color }} />
                    <span className="font-black text-gray-100">{vip.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700/50 text-gray-300 border border-gray-600/50">Tier {vip.tier}</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Levels are assigned automatically from total deposits (deposits + admin credit).{" "}
                    {vip.nextThreshold ? `${fmt(vip.toNext)} more to reach the next tier.` : "Highest tier reached."}
                  </p>
                  <DataRow label="Cashback"        value={`${vip.cashbackBps / 100}%`} />
                  <DataRow label="Total Deposited" value={fmt(vip.totalDeposited)} mono />
                </div>
              )}
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
