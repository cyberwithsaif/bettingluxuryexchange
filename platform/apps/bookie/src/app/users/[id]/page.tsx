"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import { GlassCard, Badge, Modal, Field } from "@/components/ui";
import {
  ArrowLeft, User, Wallet, BarChart3, Gamepad2, CreditCard, TrendingUp,
  Activity, Send, ShieldAlert, Lock, KeyRound, SlidersHorizontal, XCircle, CheckCircle2,
  Clock, AlertTriangle, MessageSquare,
} from "lucide-react";

const inr = (n: number) => "₹" + Number(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtShort = (d: string | null) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—";
const statusTone = (s: string) => (s === "ACTIVE" ? "emerald" : s === "SUSPENDED" ? "amber" : "red");

interface Profile {
  user: { id: string; username: string; email: string | null; phone: string | null; status: string; createdAt: string; lastLoginAt: string | null; lastLoginIp: string | null };
  wallet: { balance: number; exposure: number; bonus: number; available: number };
  limits: { minStake: number; maxStake: number; maxMarketExposure: number; maxDailyLoss: number; casinoEnabled: boolean; fancyEnabled: boolean } | null;
  financials: { totalDeposits: number; totalWithdrawals: number; casinoWins: number; casinoBets: number; betWins: number; betLosses: number };
  bettingStats: { total: number; won: number; lost: number; open: number; totalStake: number; winRate: number };
  casinoByGame: { game: string; bets: number; wagered: number; payout: number; net: number }[];
  recentTxns: { id: string; kind: string; method: string; amount: number; status: string; reference: string | null; createdAt: string }[];
  recentBets: { id: string; side: string; stake: number; status: string; createdAt: string; market: string | null; runner: string | null }[];
  ledger: { id: string; kind: string; amount: number; balanceAfter: number; exposureDelta: number; note: string | null; createdAt: string }[];
  pendingRequests: number;
}

const REQUESTS = [
  { type: "BLOCK",          label: "Block / Suspend",   Icon: Lock,             tone: "red" },
  { type: "UNBLOCK",        label: "Unblock",           Icon: CheckCircle2,     tone: "emerald" },
  { type: "RESET_PASSWORD", label: "Reset Password",    Icon: KeyRound,         tone: "sky" },
  { type: "ADJUST_LIMIT",   label: "Adjust Limits",     Icon: SlidersHorizontal,tone: "amber" },
  { type: "CLOSE_ACCOUNT",  label: "Close Account",     Icon: XCircle,          tone: "red" },
  { type: "OTHER",          label: "Other Change",      Icon: MessageSquare,    tone: "slate" },
] as const;

const TABS = ["Overview", "Wallet", "Betting", "Casino"] as const;
type Tab = typeof TABS[number];

export default function BookieUserProfile() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const key = `/bookie/users/${id}/profile`;
  const { data, isLoading, error } = useSWR<Profile>(key);
  const [tab, setTab] = useState<Tab>("Overview");
  const [reqType, setReqType] = useState<string | null>(null);

  if (isLoading) return <div className="space-y-4"><div className="h-8 w-48 bg-gray-800 rounded animate-pulse" /><div className="h-40 bg-gray-800 rounded-xl animate-pulse" /></div>;
  if (error || !data) return (
    <div className="text-center py-20 text-red-400">
      <AlertTriangle size={32} className="mx-auto mb-3 opacity-50" />
      <p className="font-semibold">Couldn&apos;t load this player.</p>
      <button onClick={() => router.back()} className="mt-4 text-sm text-gray-400 hover:text-gray-300 underline">Go back</button>
    </div>
  );

  const { user, wallet, limits, financials, bettingStats, casinoByGame, recentTxns, recentBets, ledger } = data;
  const netPL = (financials.casinoWins + financials.betWins) - (financials.casinoBets + financials.betLosses);

  return (
    <div className="space-y-5">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-gray-400 hover:text-gray-300 text-sm transition font-medium">
        <ArrowLeft size={14} /> Back to My Users
      </button>

      {/* Read-only banner */}
      <div className="rounded-xl px-4 py-2.5 flex items-center gap-2.5 border text-xs"
        style={{ background: "rgba(56,189,248,0.06)", borderColor: "rgba(56,189,248,0.25)", color: "rgba(186,230,253,0.85)" }}>
        <Eye size={14} className="text-sky-400 shrink-0" />
        <span>View-only profile. To <b className="text-sky-300">block or change</b> this player, send a request below — an admin will action it.</span>
      </div>

      {/* Header */}
      <GlassCard className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border-2 border-emerald-500/40 flex items-center justify-center shrink-0">
            <span className="font-black text-xl text-emerald-400">{user.username[0]?.toUpperCase() ?? "U"}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="font-black text-2xl text-gray-100">{user.username}</h1>
              <Badge tone={statusTone(user.status)}>{user.status}</Badge>
              {data.pendingRequests > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1 font-bold">
                  <Clock size={10} /> {data.pendingRequests} pending request{data.pendingRequests > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
              {user.email && <span>{user.email}</span>}
              {user.phone && <span>{user.phone}</span>}
              <span>Joined {fmtShort(user.createdAt)}</span>
              {user.lastLoginAt && <span>Last login {fmtDate(user.lastLoginAt)}</span>}
            </div>
          </div>
          <div className="flex gap-4 shrink-0">
            <div className="text-right"><p className="text-[10px] text-gray-400 uppercase tracking-wider">Balance</p><p className="font-black text-xl text-emerald-400">{inr(wallet.balance)}</p></div>
            <div className="text-right"><p className="text-[10px] text-gray-400 uppercase tracking-wider">Exposure</p><p className="font-black text-xl text-red-400">{inr(wallet.exposure)}</p></div>
            <div className="text-right"><p className="text-[10px] text-gray-400 uppercase tracking-wider">Available</p><p className="font-black text-xl text-sky-300">{inr(wallet.available)}</p></div>
          </div>
        </div>
      </GlassCard>

      {/* Request panel */}
      <GlassCard className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Send size={15} className="text-emerald-400" />
          <h3 className="font-bold text-sm uppercase tracking-wider text-gray-400">Request an Admin Action</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {REQUESTS.map(({ type, label, Icon, tone }) => (
            <button key={type} onClick={() => setReqType(type)}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-bold transition
                ${tone === "red" ? "border-red-500/30 text-red-300 hover:bg-red-500/10"
                : tone === "emerald" ? "border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                : tone === "sky" ? "border-sky-500/30 text-sky-300 hover:bg-sky-500/10"
                : tone === "amber" ? "border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
                : "border-gray-700 text-gray-300 hover:bg-gray-800"}`}>
              <Icon size={17} /> {label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-500 mt-2">Requests go to the admin Support queue. You&apos;ll see their status in the player&apos;s pending badge.</p>
      </GlassCard>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap border-b border-gray-800">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition border-b-2 ${tab === t ? "text-emerald-300 border-emerald-400 bg-gray-800/60" : "text-gray-400 border-transparent hover:text-gray-300"}`}>{t}</button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className="grid md:grid-cols-2 gap-5">
          <Section title="Player Details" Icon={User}>
            <Row label="User ID" value={<span className="font-mono text-xs text-gray-400">{user.id}</span>} />
            <Row label="Username" value={user.username} />
            <Row label="Email" value={user.email ?? "—"} />
            <Row label="Phone" value={user.phone ?? "—"} />
            <Row label="Status" value={<Badge tone={statusTone(user.status)}>{user.status}</Badge>} />
            <Row label="Member Since" value={fmtDate(user.createdAt)} />
            <Row label="Last Login" value={fmtDate(user.lastLoginAt)} />
            <Row label="Last IP" value={user.lastLoginIp ?? "—"} mono />
          </Section>
          <Section title="Limits" Icon={ShieldAlert}>
            {limits ? (
              <>
                <Row label="Min Stake" value={inr(limits.minStake)} mono />
                <Row label="Max Stake" value={inr(limits.maxStake)} mono />
                <Row label="Max Market Exposure" value={inr(limits.maxMarketExposure)} mono />
                <Row label="Max Daily Loss" value={inr(limits.maxDailyLoss)} mono />
                <Row label="Casino" value={limits.casinoEnabled ? "Enabled" : "Disabled"} />
                <Row label="Fancy Bets" value={limits.fancyEnabled ? "Enabled" : "Disabled"} />
              </>
            ) : <p className="text-sm text-gray-500">Using platform default limits.</p>}
          </Section>
        </div>
      )}

      {tab === "Wallet" && (
        <div className="space-y-5">
          <Section title="Financial Summary" Icon={Wallet}>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Mini label="Balance" value={inr(wallet.balance)} color="text-emerald-400" />
              <Mini label="Exposure" value={inr(wallet.exposure)} color="text-red-400" />
              <Mini label="Bonus" value={inr(wallet.bonus)} color="text-yellow-400" />
              <Mini label="Total Deposits" value={inr(financials.totalDeposits)} color="text-emerald-400" />
              <Mini label="Total Withdrawals" value={inr(financials.totalWithdrawals)} color="text-red-400" />
              <Mini label="Net P&L" value={inr(netPL)} color={netPL >= 0 ? "text-emerald-400" : "text-red-400"} />
            </div>
          </Section>
          <Section title="Recent Transactions" Icon={CreditCard}>
            <TxTable rows={recentTxns} />
          </Section>
          <Section title="Wallet Ledger" Icon={Activity} badge={`last ${ledger.length}`}>
            {ledger.length === 0 ? <Empty /> : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-900"><tr className="border-b border-gray-800 text-left text-[10px] uppercase tracking-wider text-gray-500">
                    <th className="py-2 px-2">Kind</th><th className="py-2 px-2 text-right">Amount</th><th className="py-2 px-2 text-right">Balance After</th><th className="py-2 px-2">Note</th><th className="py-2 px-2">Date</th>
                  </tr></thead>
                  <tbody>{ledger.map(l => (
                    <tr key={l.id} className="border-b border-gray-800/60 hover:bg-gray-800/40">
                      <td className="py-1.5 px-2"><span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-800 text-gray-300">{l.kind}</span></td>
                      <td className={`py-1.5 px-2 text-right tabular-nums font-bold ${l.amount > 0 ? "text-emerald-400" : l.amount < 0 ? "text-red-400" : "text-gray-500"}`}>{l.amount > 0 ? "+" : ""}{inr(l.amount)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-gray-300">{inr(l.balanceAfter)}</td>
                      <td className="py-1.5 px-2 text-gray-400 max-w-[200px] truncate" title={l.note ?? ""}>{l.note ?? "—"}</td>
                      <td className="py-1.5 px-2 text-gray-500 whitespace-nowrap">{fmtDate(l.createdAt)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      )}

      {tab === "Betting" && (
        <div className="space-y-5">
          <Section title="Betting Statistics" Icon={BarChart3}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Mini label="Total Bets" value={String(bettingStats.total)} />
              <Mini label="Won" value={String(bettingStats.won)} color="text-emerald-400" />
              <Mini label="Lost" value={String(bettingStats.lost)} color="text-red-400" />
              <Mini label="Open" value={String(bettingStats.open)} color="text-yellow-400" />
              <Mini label="Win Rate" value={`${bettingStats.winRate}%`} color="text-sky-400" />
              <Mini label="Total Stake" value={inr(bettingStats.totalStake)} />
              <Mini label="Bet Wins" value={inr(financials.betWins)} color="text-emerald-400" />
              <Mini label="Bet Losses" value={inr(financials.betLosses)} color="text-red-400" />
            </div>
          </Section>
          <Section title="Recent Bets" Icon={TrendingUp}>
            {recentBets.length === 0 ? <Empty /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-gray-800 text-left text-[10px] uppercase tracking-wider text-gray-500">
                    <th className="py-2 px-2">Market</th><th className="py-2 px-2">Runner</th><th className="py-2 px-2">Side</th><th className="py-2 px-2 text-right">Stake</th><th className="py-2 px-2">Status</th><th className="py-2 px-2">Date</th>
                  </tr></thead>
                  <tbody>{recentBets.map(b => (
                    <tr key={b.id} className="border-b border-gray-800/60 hover:bg-gray-800/40">
                      <td className="py-2 px-2 max-w-[140px] truncate text-gray-300">{b.market ?? "—"}</td>
                      <td className="py-2 px-2 text-gray-500">{b.runner ?? "—"}</td>
                      <td className="py-2 px-2"><span className={`font-black px-2 py-0.5 rounded ${b.side === "BACK" ? "bg-blue-900/30 text-blue-300" : "bg-orange-900/30 text-orange-400"}`}>{b.side}</span></td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-300 font-semibold">{inr(b.stake)}</td>
                      <td className="py-2 px-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${b.status === "SETTLED_WON" ? "bg-emerald-500/15 text-emerald-300" : b.status === "SETTLED_LOST" ? "bg-red-500/15 text-red-300" : "bg-yellow-500/15 text-yellow-300"}`}>{b.status}</span></td>
                      <td className="py-2 px-2 text-gray-500">{fmtShort(b.createdAt)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      )}

      {tab === "Casino" && (
        <Section title="All Games Breakdown" Icon={Gamepad2} badge={`${casinoByGame.length} games`}>
          {casinoByGame.length === 0 ? <Empty /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-gray-800 text-left text-[10px] uppercase tracking-wider text-gray-500">
                  <th className="py-2 px-2">Game</th><th className="py-2 px-2 text-right">Bets</th><th className="py-2 px-2 text-right">Wagered</th><th className="py-2 px-2 text-right">Paid Out</th><th className="py-2 px-2 text-right">Player Net</th>
                </tr></thead>
                <tbody>{casinoByGame.map(g => (
                  <tr key={g.game} className="border-b border-gray-800/60 hover:bg-gray-800/40">
                    <td className="py-2 px-2 font-bold text-gray-200 capitalize">{g.game}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-gray-300">{g.bets.toLocaleString("en-IN")}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-gray-300">{inr(g.wagered)}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-gray-300">{inr(g.payout)}</td>
                    <td className={`py-2 px-2 text-right tabular-nums font-bold ${g.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>{g.net >= 0 ? "+" : ""}{inr(g.net)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {reqType && <RequestModal userId={id} username={user.username} type={reqType} onClose={(ok) => { setReqType(null); if (ok) mutate(key); }} />}
    </div>
  );
}

function RequestModal({ userId, username, type, onClose }: { userId: string; username: string; type: string; onClose: (ok?: boolean) => void }) {
  const meta = REQUESTS.find(r => r.type === type)!;
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    if (reason.trim().length < 3) { setErr("Please describe what you need."); return; }
    setBusy(true); setErr(null);
    try {
      await api.post(`/bookie/users/${userId}/request`, { type, reason: reason.trim() });
      setDone(true);
      setTimeout(() => onClose(true), 1100);
    } catch (e: any) { setErr(e?.response?.data?.message || "Failed to send request."); setBusy(false); }
  }

  return (
    <Modal title={`Request: ${meta.label}`} onClose={() => onClose()}>
      {done ? (
        <div className="py-6 text-center">
          <CheckCircle2 size={40} className="mx-auto text-emerald-400 mb-2" />
          <p className="font-bold text-gray-100">Request sent to admin</p>
          <p className="text-sm text-gray-500 mt-1">You&apos;ll see its status in the player&apos;s pending badge.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-400 mb-3">
            Player: <span className="font-semibold text-gray-200">{username}</span>
          </p>
          <Field label="Reason / details (required)">
            <textarea className="modal-input min-h-[90px] resize-y" value={reason} onChange={e => setReason(e.target.value)} maxLength={500}
              placeholder={type === "ADJUST_LIMIT" ? "e.g. raise max stake to ₹50,000" : type === "BLOCK" ? "e.g. suspected fraud / chargeback" : "Describe what you need the admin to do…"} autoFocus />
          </Field>
          {err && <p className="text-xs text-red-400 bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2 mt-3">{err}</p>}
          <div className="flex gap-2 mt-4">
            <button onClick={() => onClose()} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-gray-300 border border-gray-700 hover:bg-gray-800 transition">Cancel</button>
            <button onClick={submit} disabled={busy} className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600 hover:brightness-110 disabled:opacity-50 transition flex items-center justify-center gap-2">
              <Send size={15} /> {busy ? "Sending…" : "Send Request"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ── small presentational helpers ── */
function Section({ title, Icon, badge, children }: { title: string; Icon: any; badge?: string; children: React.ReactNode }) {
  return (
    <GlassCard className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Icon size={15} className="text-emerald-400" />
        <h3 className="font-bold text-sm uppercase tracking-wider text-gray-400">{title}</h3>
        {badge && <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">{badge}</span>}
      </div>
      {children}
    </GlassCard>
  );
}
function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-gray-800 last:border-0">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className={`text-sm font-medium text-gray-200 text-right ${mono ? "font-mono tabular-nums" : ""}`}>{value}</span>
    </div>
  );
}
function Mini({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-gray-800/60 rounded-xl p-3 border border-gray-700">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</p>
      <p className={`font-black text-lg tabular-nums ${color ?? "text-gray-200"}`}>{value}</p>
    </div>
  );
}
function Empty() { return <p className="text-sm text-gray-500 text-center py-4">No records.</p>; }
function TxTable({ rows }: { rows: Profile["recentTxns"] }) {
  if (!rows.length) return <Empty />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="border-b border-gray-800 text-left text-[10px] uppercase tracking-wider text-gray-500">
          <th className="py-2 px-2">Type</th><th className="py-2 px-2">Method</th><th className="py-2 px-2 text-right">Amount</th><th className="py-2 px-2">Status</th><th className="py-2 px-2">Date</th>
        </tr></thead>
        <tbody>{rows.map(t => (
          <tr key={t.id} className="border-b border-gray-800/60 hover:bg-gray-800/40">
            <td className="py-2 px-2 font-semibold text-gray-300">{t.kind}</td>
            <td className="py-2 px-2 text-gray-500">{t.method}</td>
            <td className={`py-2 px-2 text-right tabular-nums font-bold ${t.kind === "DEPOSIT" ? "text-emerald-400" : "text-red-400"}`}>{t.kind === "WITHDRAWAL" ? "-" : "+"}{inr(t.amount)}</td>
            <td className="py-2 px-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${t.status === "APPROVED" || t.status === "COMPLETED" ? "bg-emerald-500/15 text-emerald-300" : t.status === "REJECTED" || t.status === "FAILED" ? "bg-red-500/15 text-red-300" : "bg-yellow-500/15 text-yellow-300"}`}>{t.status}</span></td>
            <td className="py-2 px-2 text-gray-500">{fmtShort(t.createdAt)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

// local icon (avoid an extra import line churn)
function Eye({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
}
