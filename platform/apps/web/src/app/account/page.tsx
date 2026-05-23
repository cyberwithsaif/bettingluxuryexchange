"use client";
import useSWR from "swr";
import Link from "next/link";
import { useAuthStore } from "@/lib/stores/auth";
import {
  Wallet, TrendingUp, Shield, Gift, Users, Headphones,
  ChevronRight, Copy, CheckCircle2, AlertCircle, Lock,
  Star, Crown, Gem, Medal, Award, Zap, ArrowUpRight,
  ArrowDownLeft, BarChart3, Bitcoin, Phone, Mail,
} from "lucide-react";
import { useState, useMemo } from "react";
import { VIP_TIERS, getTierIndex, calcTotalDeposited } from "@/lib/vip";

/* Icon map for each tier (same order as VIP_TIERS) */
const TIER_ICONS = [Medal, Star, Award, Crown, Gem] as const;

/* ─── Formatters ──────────────────────────────────────────── */
function fmt(n: number | undefined, opts?: Intl.NumberFormatOptions) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, ...opts }).format(n);
}
function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/* ─── Main Dashboard ──────────────────────────────────────── */
export default function AccountDashboard() {
  const user = useAuthStore((s) => s.user);
  const { data: wallet } = useSWR(user ? "/wallet/summary" : null);
  const { data: bets } = useSWR(user ? "/bets/mine?status=OPEN" : null);
  const { data: ledger } = useSWR(user ? "/wallet/ledger?limit=200" : null);
  const [copied, setCopied] = useState(false);

  const referralCode = user ? `${user.username.toUpperCase().slice(0, 6)}${user.id?.slice(-4) ?? "0000"}` : "";

  /* derive VIP data from ledger entries */
  const { totalDeposited, recentTxns } = useMemo(() => {
    const items: any[] = ledger?.items ?? [];
    const totalDeposited = calcTotalDeposited(items);
    const recentTxns = items.slice(0, 5);
    return { totalDeposited, recentTxns };
  }, [ledger]);

  const tierIdx = getTierIndex(totalDeposited);
  const tierBase = VIP_TIERS[tierIdx]!;
  const TierIcon = TIER_ICONS[tierIdx]!;
  const tier = { ...tierBase, Icon: TierIcon };
  const nextTier = VIP_TIERS[tierIdx + 1] ?? null;
  const tierProgress = nextTier
    ? Math.min(100, Math.round(((totalDeposited - tier.min) / (nextTier.min - tier.min)) * 100))
    : 100;
  const amountToNext = nextTier ? Math.max(0, nextTier.min - totalDeposited) : 0;

  const joinDate = "Jan 2025"; // placeholder until backend exposes createdAt

  function copyReferral() {
    navigator.clipboard.writeText(referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!user)
    return (
      <p className="glass rounded-xl p-6">
        Please <Link className="text-accentSoft" href="/auth/login">sign in</Link>.
      </p>
    );

  return (
    <div className="space-y-4 pb-8">

      {/* ── Profile Hero ─────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl p-5 md:p-6"
        style={{ background: "linear-gradient(135deg, #12183a 0%, #0d1224 60%, #1a0a1a 100%)", border: "1px solid rgba(255,122,24,0.15)" }}>
        {/* decorative glow */}
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-20 blur-3xl pointer-events-none"
          style={{ background: tier.grad }} />
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center font-black text-2xl text-white"
              style={{ background: tier.grad }}>
              {user.username[0]?.toUpperCase()}
            </div>
            <div className="absolute -bottom-1 -right-1 rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase text-white"
              style={{ background: tier.grad, fontSize: "8px" }}>
              {tier.name}
            </div>
          </div>
          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl md:text-3xl truncate">{user.username}</h1>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-white"
                style={{ background: tier.grad }}>{tier.name}</span>
            </div>
            <p className="text-xs text-white/50 mt-0.5">Member since {joinDate} · UID {user.id?.slice(-8)}</p>
          </div>
          {/* Quick stats */}
          <div className="flex gap-3 shrink-0">
            <StatChip label="Cashback" value={`${tier.cashback}%`} color={tier.color} />
            <StatChip label="Open Bets" value={String(bets?.length ?? 0)} color="#f59e0b" />
          </div>
        </div>
      </div>

      {/* ── Wallet Cards ─────────────────────────────────── */}
      <section>
        <SectionHeader icon={<Wallet size={15} />} title="Wallet" link="/account/deposit" linkLabel="Deposit" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <WalletCard label="Available" value={fmt(wallet?.available)} accent sub="Withdrawable balance" />
          <WalletCard label="Balance" value={fmt(wallet?.balance)} sub="Total account balance" />
          <WalletCard label="Exposure" value={fmt(wallet?.exposure)} bad sub="At-risk amount" />
          <WalletCard label="Bonus" value={fmt(wallet?.bonus)} bonus sub="Bonus credits" />
        </div>
      </section>

      {/* ── VIP Level ────────────────────────────────────── */}
      <section>
        <SectionHeader icon={<Crown size={15} />} title="VIP & Loyalty" />
        <div className="grid md:grid-cols-2 gap-3">
          {/* Current level card */}
          <div className="rounded-2xl p-5 relative overflow-hidden"
            style={{ background: "linear-gradient(135deg, #12183a, #0d1224)", border: `1px solid ${tier.color}30` }}>
            <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ background: tier.grad }} />
            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Current Level</div>
                  <div className="flex items-center gap-2">
                    <tier.Icon size={20} style={{ color: tier.color }} />
                    <span className="font-display text-2xl" style={{ color: tier.color }}>{tier.name}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-white/40 uppercase tracking-wider">Cashback</div>
                  <div className="text-2xl font-black" style={{ color: tier.color }}>{tier.cashback}%</div>
                </div>
              </div>

              {/* Progress bar */}
              {nextTier && (
                <div className="mb-3">
                  <div className="flex justify-between text-[10px] text-white/50 mb-1.5">
                    <span>{tier.name}</span>
                    <span>{nextTier.name}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${tierProgress}%`, background: tier.grad }} />
                  </div>
                  <div className="flex justify-between items-center mt-1.5">
                    <span className="text-[10px] text-white/40">{tierProgress}% there</span>
                    <span className="text-[10px]" style={{ color: tier.color }}>
                      ₹{fmt(amountToNext)} to {nextTier.name}
                    </span>
                  </div>
                </div>
              )}
              {!nextTier && (
                <div className="mb-3 py-2 px-3 rounded-lg text-xs text-center font-semibold"
                  style={{ background: `${tier.color}20`, color: tier.color }}>
                  ✦ Maximum Level Reached ✦
                </div>
              )}

              {/* Perks */}
              <div className="space-y-1.5">
                {tier.perks.map((p) => (
                  <div key={p} className="flex items-center gap-2 text-xs text-white/70">
                    <CheckCircle2 size={12} style={{ color: tier.color }} className="shrink-0" />
                    {p}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Next level preview */}
          <div className="rounded-2xl p-5" style={{ background: "linear-gradient(135deg, #12183a, #0d1224)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="text-[10px] uppercase tracking-widest text-white/40 mb-3">All VIP Levels</div>
            <div className="space-y-2">
              {VIP_TIERS.map((t, i) => {
                const isActive = i === tierIdx;
                const isPast = i < tierIdx;
                const RowIcon = TIER_ICONS[i]!;
                return (
                  <div key={t.name} className="flex items-center gap-3 rounded-xl px-3 py-2 transition-all"
                    style={{
                      background: isActive ? `${t.color}15` : "rgba(255,255,255,0.02)",
                      border: isActive ? `1px solid ${t.color}40` : "1px solid transparent",
                    }}>
                    <RowIcon size={14} style={{ color: isPast || isActive ? t.color : "rgba(255,255,255,0.2)" }} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs font-semibold ${isActive ? "" : isPast ? "text-white/50" : "text-white/30"}`}
                        style={isActive ? { color: t.color } : {}}>
                        {t.name}
                        {isActive && <span className="ml-2 text-[9px] opacity-70">← YOU</span>}
                      </div>
                      <div className="text-[9px] text-white/30">
                        {t.min === 0 ? "Start" : `₹${(t.min / 1000).toFixed(0)}K`} — {t.max === Infinity ? "∞" : `₹${(t.max / 1000).toFixed(0)}K`}
                      </div>
                    </div>
                    <div className="text-[10px] font-bold" style={{ color: isPast || isActive ? t.color : "rgba(255,255,255,0.2)" }}>
                      {t.cashback}%
                    </div>
                    {(isPast || isActive) && (
                      <CheckCircle2 size={12} style={{ color: t.color }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Wager Progress + Quick Actions ───────────────── */}
      <div className="grid md:grid-cols-3 gap-3">
        {/* Wager Progress */}
        <div className="md:col-span-2 rounded-2xl p-5"
          style={{ background: "linear-gradient(135deg, #12183a, #0d1224)", border: "1px solid rgba(255,122,24,0.1)" }}>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={15} className="text-accentSoft" />
            <span className="text-sm font-semibold">Wager Progress</span>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl p-3" style={{ background: "rgba(255,122,24,0.08)" }}>
              <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Total Deposited</div>
              <div className="font-display text-lg text-accentSoft">₹{fmt(totalDeposited)}</div>
            </div>
            <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)" }}>
              <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Available Balance</div>
              <div className="font-display text-lg text-white">₹{fmt(wallet?.balance)}</div>
            </div>
          </div>
          {/* Weekly wager goal */}
          <div>
            <div className="flex justify-between text-[10px] text-white/40 mb-1.5">
              <span>Weekly Wager Goal</span>
              <span>₹{fmt(wallet?.balance ?? 0)} / ₹50,000</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="h-full rounded-full" style={{
                width: `${Math.min(100, ((wallet?.balance ?? 0) / 50000) * 100).toFixed(1)}%`,
                background: "linear-gradient(90deg, #ff7a18, #f59e0b)",
              }} />
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-2xl p-5" style={{ background: "linear-gradient(135deg, #12183a, #0d1224)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="text-[10px] uppercase tracking-widest text-white/40 mb-3">Quick Actions</div>
          <div className="space-y-2">
            <QuickAction href="/account/deposit" icon={<ArrowDownLeft size={14} />} label="Deposit Funds" color="#22c55e" />
            <QuickAction href="/account/withdraw" icon={<ArrowUpRight size={14} />} label="Withdraw" color="#f59e0b" />
            <QuickAction href="/account/bets" icon={<BarChart3 size={14} />} label="My Bets" color="#38bdf8" />
            <QuickAction href="/account/statement" icon={<Wallet size={14} />} label="Statement" color="#a78bfa" />
            <QuickAction href="/account/security" icon={<Shield size={14} />} label="Security & 2FA" color="#f43f5e" />
          </div>
        </div>
      </div>

      {/* ── Open Bets + Recent Transactions ──────────────── */}
      <div className="grid md:grid-cols-2 gap-3">
        {/* Open Bets */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "linear-gradient(135deg, #12183a, #0d1224)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="px-5 py-3 flex items-center justify-between border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Zap size={14} className="text-yellow-400" />
              Open Bets
              {bets?.length > 0 && (
                <span className="rounded-full px-1.5 py-0.5 text-[9px] font-black bg-yellow-400/20 text-yellow-400">{bets.length}</span>
              )}
            </div>
            <Link href="/account/bets" className="text-[10px] text-accentSoft hover:text-accent flex items-center gap-1">
              View all <ChevronRight size={10} />
            </Link>
          </div>
          <div className="p-3">
            {(!bets || bets.length === 0) ? (
              <div className="py-8 text-center">
                <Zap size={24} className="mx-auto mb-2 text-white/20" />
                <p className="text-sm text-white/40">No open bets</p>
                <Link href="/" className="text-xs text-accentSoft hover:text-accent mt-1 inline-block">Browse markets →</Link>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {bets.slice(0, 5).map((b: any) => (
                  <li key={b.id} className="rounded-lg px-3 py-2.5 flex items-center justify-between text-xs"
                    style={{ background: "rgba(255,255,255,0.04)" }}>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{b.market?.match?.name ?? "Match"}</div>
                      <div className="text-white/50 text-[10px]">{b.runner?.name} · {b.side}</div>
                    </div>
                    <div className="text-right ml-3 shrink-0 tabular-nums">
                      <div className="text-yellow-400">{fmt(Number(b.stake))} @ {Number(b.odds).toFixed(2)}</div>
                      <div className="text-white/40 text-[10px]">Liab: {fmt(Number(b.liability))}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "linear-gradient(135deg, #12183a, #0d1224)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="px-5 py-3 flex items-center justify-between border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Wallet size={14} className="text-purple-400" />
              Recent Transactions
            </div>
            <Link href="/account/statement" className="text-[10px] text-accentSoft hover:text-accent flex items-center gap-1">
              View all <ChevronRight size={10} />
            </Link>
          </div>
          <div className="p-3">
            {recentTxns.length === 0 ? (
              <div className="py-8 text-center">
                <Wallet size={24} className="mx-auto mb-2 text-white/20" />
                <p className="text-sm text-white/40">No transactions yet</p>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {recentTxns.map((e: any) => {
                  const amt = Number(e.amount);
                  const isPos = amt > 0;
                  return (
                    <li key={e.id} className="rounded-lg px-3 py-2.5 flex items-center justify-between text-xs"
                      style={{ background: "rgba(255,255,255,0.04)" }}>
                      <div className="min-w-0">
                        <div className="font-semibold">{e.kind?.replace(/_/g, " ")}</div>
                        <div className="text-white/40 text-[10px]">{fmtDate(e.createdAt)}</div>
                      </div>
                      <div className={`tabular-nums font-bold text-xs ${isPos ? "text-green-400" : "text-red-400"}`}>
                        {isPos ? "+" : ""}₹{fmt(Math.abs(amt))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* ── Referral + Security ───────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-3">
        {/* Referral */}
        <div className="rounded-2xl p-5" style={{ background: "linear-gradient(135deg, #12183a, #0d1224)", border: "1px solid rgba(255,122,24,0.12)" }}>
          <div className="flex items-center gap-2 mb-4">
            <Users size={15} className="text-accentSoft" />
            <span className="text-sm font-semibold">Referral Earnings</span>
          </div>
          <div className="mb-4 rounded-xl p-3 flex items-center gap-3" style={{ background: "rgba(255,122,24,0.08)", border: "1px solid rgba(255,122,24,0.2)" }}>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">Your Referral Code</div>
              <div className="font-mono text-sm font-bold text-accentSoft tracking-widest">{referralCode}</div>
            </div>
            <button onClick={copyReferral} className="shrink-0 p-2 rounded-lg transition-all hover:scale-105"
              style={{ background: "rgba(255,122,24,0.2)" }}>
              {copied ? <CheckCircle2 size={14} className="text-green-400" /> : <Copy size={14} className="text-accentSoft" />}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <RefStat label="Total Refs" value="0" />
            <RefStat label="Active" value="0" />
            <RefStat label="Earned" value="₹0" color="#f59e0b" />
          </div>
          <div className="text-[10px] text-white/30 leading-relaxed">
            Share your code and earn <span className="text-accentSoft font-semibold">5% commission</span> on every deposit your referrals make. Earnings credited instantly.
          </div>
        </div>

        {/* Security */}
        <div className="rounded-2xl p-5" style={{ background: "linear-gradient(135deg, #12183a, #0d1224)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2 mb-4">
            <Shield size={15} className="text-blue-400" />
            <span className="text-sm font-semibold">Security Status</span>
          </div>
          <div className="space-y-2.5">
            <SecurityItem icon={<CheckCircle2 size={13} />} label="Email Verified" status="verified" />
            <SecurityItem icon={<Lock size={13} />} label="2FA (TOTP)" status="setup" link="/account/security" />
            <SecurityItem icon={<AlertCircle size={13} />} label="KYC Verification" status="pending" link="/account/security" />
            <SecurityItem icon={<CheckCircle2 size={13} />} label="Password Set" status="verified" />
          </div>
          <Link href="/account/security"
            className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition-all hover:opacity-90"
            style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.2)" }}>
            <Shield size={12} /> Manage Security
          </Link>
        </div>
      </div>

      {/* ── Crypto & Support ──────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-3">
        {/* Crypto Support */}
        <div className="rounded-2xl p-5" style={{ background: "linear-gradient(135deg, #12183a, #0d1224)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2 mb-4">
            <Bitcoin size={15} className="text-yellow-400" />
            <span className="text-sm font-semibold">Crypto Support</span>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { name: "Bitcoin", sym: "BTC", color: "#f59e0b" },
              { name: "Ethereum", sym: "ETH", color: "#818cf8" },
              { name: "USDT", sym: "USDT", color: "#22c55e" },
              { name: "Litecoin", sym: "LTC", color: "#94a3b8" },
              { name: "USDC", sym: "USDC", color: "#38bdf8" },
              { name: "BNB", sym: "BNB", color: "#fbbf24" },
            ].map(({ name, sym, color }) => (
              <div key={sym} className="rounded-lg p-2 text-center" style={{ background: `${color}10`, border: `1px solid ${color}25` }}>
                <div className="text-xs font-bold" style={{ color }}>{sym}</div>
                <div className="text-[9px] text-white/30 mt-0.5">{name}</div>
              </div>
            ))}
          </div>
          <Link href="/account/deposit"
            className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold"
            style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.2)" }}>
            <Bitcoin size={12} /> Deposit Crypto
          </Link>
        </div>

        {/* Support */}
        <div className="rounded-2xl p-5" style={{ background: "linear-gradient(135deg, #12183a, #0d1224)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2 mb-4">
            <Headphones size={15} className="text-green-400" />
            <span className="text-sm font-semibold">Support</span>
            <span className="ml-auto rounded-full px-2 py-0.5 text-[9px] font-bold bg-green-400/20 text-green-400">24/7</span>
          </div>
          <div className="space-y-2">
            <SupportItem icon={<Phone size={13} />} label="Live Chat" sub="Instant response" color="#22c55e" action="Chat Now" />
            <SupportItem icon={<Mail size={13} />} label="Email Support" sub="support@diamondplay22.site" color="#38bdf8" action="Email" />
            <SupportItem icon={<Gift size={13} />} label="Bonus Issues" sub="Claim / dispute bonuses" color="#f59e0b" action="Claim" />
          </div>
          {tierIdx >= 3 && (
            <div className="mt-3 rounded-xl px-3 py-2.5 text-xs flex items-center gap-2"
              style={{ background: `${tier.color}10`, border: `1px solid ${tier.color}30`, color: tier.color }}>
              <Crown size={12} />
              <span>You have a <strong>Personal Manager</strong> — contact them directly for priority support.</span>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

/* ─── Helper Sub-components ───────────────────────────────── */
function SectionHeader({ icon, title, link, linkLabel }: { icon: React.ReactNode; title: string; link?: string; linkLabel?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-accentSoft">{icon}</span>
      <h2 className="font-semibold text-sm text-white/80">{title}</h2>
      {link && (
        <Link href={link} className="ml-auto text-[10px] text-accentSoft hover:text-accent flex items-center gap-1">
          {linkLabel} <ChevronRight size={10} />
        </Link>
      )}
    </div>
  );
}

function WalletCard({ label, value, accent, bad, bonus, sub }: { label: string; value: string; accent?: boolean; bad?: boolean; bonus?: boolean; sub?: string }) {
  const color = accent ? "#ff7a18" : bad ? "#f43f5e" : bonus ? "#a78bfa" : "white";
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-1"
      style={{ background: "linear-gradient(135deg, #12183a, #0d1224)", border: `1px solid ${color}18` }}>
      <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
      <p className="font-display text-2xl md:text-3xl" style={{ color }}>{value === "—" ? value : `₹${value}`}</p>
      {sub && <p className="text-[10px] text-white/30">{sub}</p>}
    </div>
  );
}

function StatChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl px-3 py-2 text-center min-w-[60px]" style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
      <div className="font-bold text-sm" style={{ color }}>{value}</div>
      <div className="text-[9px] text-white/40 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function QuickAction({ href, icon, label, color }: { href: string; icon: React.ReactNode; label: string; color: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium transition-all hover:scale-[1.01] hover:opacity-90"
      style={{ background: `${color}10`, border: `1px solid ${color}20`, color }}>
      <span>{icon}</span>
      <span className="text-white/80 group-hover:text-white">{label}</span>
      <ChevronRight size={10} className="ml-auto text-white/30" />
    </Link>
  );
}

function RefStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg p-2 text-center" style={{ background: "rgba(255,255,255,0.04)" }}>
      <div className="font-bold text-sm" style={{ color: color ?? "white" }}>{value}</div>
      <div className="text-[9px] text-white/40">{label}</div>
    </div>
  );
}

function SecurityItem({ icon, label, status, link }: { icon: React.ReactNode; label: string; status: "verified" | "pending" | "setup"; link?: string }) {
  const cfg = {
    verified: { color: "#22c55e", text: "Verified", bg: "rgba(34,197,94,0.1)" },
    pending: { color: "#f59e0b", text: "Pending", bg: "rgba(245,158,11,0.1)" },
    setup: { color: "#38bdf8", text: "Set Up", bg: "rgba(56,189,248,0.1)" },
  }[status];
  const inner = (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: cfg.bg }}>
      <span style={{ color: cfg.color }}>{icon}</span>
      <span className="text-xs flex-1 text-white/70">{label}</span>
      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${cfg.color}20`, color: cfg.color }}>
        {cfg.text}
      </span>
    </div>
  );
  return link && status !== "verified" ? <Link href={link}>{inner}</Link> : <div>{inner}</div>;
}

function SupportItem({ icon, label, sub, color, action }: { icon: React.ReactNode; label: string; sub: string; color: string; action: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.04)" }}>
      <span style={{ color }}>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-white/80">{label}</div>
        <div className="text-[10px] text-white/40 truncate">{sub}</div>
      </div>
      <button className="text-[10px] font-bold px-2 py-1 rounded-lg shrink-0" style={{ background: `${color}15`, color }}>
        {action}
      </button>
    </div>
  );
}
