"use client";
import { useState, useMemo } from "react";
import useSWR from "swr";
import Image from "next/image";
import { useAuthStore } from "@/lib/stores/auth";
import {
  Share2, Copy, CheckCircle2, Users, Wallet, Percent, Gift,
  Clock, Sparkles, ArrowUpRight, Ticket,
} from "lucide-react";

interface Referral {
  code: string; referralCount: number; totalCommission: number; commissionPct: number;
  recent: { id: string; amount: number; createdAt: string; note: string | null }[];
}
interface Promo {
  code: string; type: "DEPOSIT_BONUS" | "FREE_CREDIT" | "CASHBACK";
  amount: number; percentage: number; minDeposit: number; wagerMultiplier: number;
  expiresAt: string | null; remaining: number | null;
}

const TABS = ["Refer Friends", "My Earnings", "Promotions"] as const;
type Tab = (typeof TABS)[number];

const inr = (n: number) => "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);

function useCopy() {
  const [copied, setCopied] = useState("");
  const copy = (text: string, id = "x") => { navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(""), 2000); };
  return { copied, copy };
}

export default function ReferEarnPage() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>("Refer Friends");
  const { data: ref } = useSWR<Referral>(user ? "/users/me/referral" : null);
  const { data: promos } = useSWR<Promo[]>("/platform/promos");

  const code = ref?.code ?? (user ? `${user.username.toUpperCase().slice(0, 6)}${user.id?.slice(-4) ?? ""}` : "");
  const link = useMemo(
    () => (typeof window !== "undefined" ? `${window.location.origin}/?ref=${code}` : `/?ref=${code}`),
    [code],
  );

  if (!user) {
    return <div className="max-w-md mx-auto mt-10 glass rounded-2xl p-6 text-center text-white/70">Please sign in to refer &amp; earn.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-3 md:px-5 py-5 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: "linear-gradient(135deg, #a855f7, #7c3aed)" }}>
          <Share2 size={22} className="text-white" />
        </span>
        <div>
          <h1 className="font-display text-3xl leading-none">Refer &amp; Earn</h1>
          <p className="text-sm text-white/50 mt-1">Invite friends, earn commission on every wager.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-5 rounded-xl p-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition ${
              tab === t ? "text-white" : "text-white/45 hover:text-white/70"
            }`}
            style={tab === t ? { background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", boxShadow: "0 4px 16px rgba(124,58,237,0.4)" } : {}}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Refer Friends"   && <ReferFriends code={code} link={link} />}
      {tab === "My Earnings"     && <MyEarnings data={ref} />}
      {tab === "Promotions"      && <Promotions promos={promos} />}
    </div>
  );
}

/* ─── Refer Friends ──────────────────────────────────────── */
function ReferFriends({ code, link }: { code: string; link: string }) {
  const { copied, copy } = useCopy();
  return (
    <div className="space-y-4">
      {/* Purple hero */}
      <div className="relative overflow-hidden rounded-2xl p-6 md:p-8"
        style={{ background: "radial-gradient(120% 140% at 0% 0%, #8b5cf6 0%, #7c3aed 45%, #5b21b6 100%)" }}>
        <div className="absolute inset-0 opacity-30 pointer-events-none"
          style={{ background: "radial-gradient(60% 80% at 85% 50%, rgba(255,255,255,0.18), transparent)" }} />
        {/* chips art */}
        <div className="absolute right-2 bottom-0 top-0 w-1/2 hidden sm:block pointer-events-none">
          <Image src="/images/float.png" alt="" fill sizes="50vw" className="object-contain object-right" />
        </div>
        <div className="relative max-w-md">
          <h2 className="font-display text-3xl md:text-4xl text-white leading-tight">Refer Your Friends</h2>
          <p className="text-white/85 text-sm md:text-base mt-3 leading-relaxed">
            Share your promo code <b className="text-white">&ldquo;{code}&rdquo;</b> with your friends, and you&apos;ll
            receive <b className="text-white">commission on all of their wagers</b>. The more they play, the more you earn.
          </p>
          <button onClick={() => copy(code, "code")}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur px-4 py-2 text-sm font-bold text-white transition border border-white/20">
            {copied === "code" ? <CheckCircle2 size={15} /> : <Copy size={15} />}
            {copied === "code" ? "Copied!" : `Copy code ${code}`}
          </button>
        </div>
      </div>

      {/* Referral link */}
      <div>
        <label className="text-sm font-semibold text-white/70 mb-2 block">Share Your Referral Link</label>
        <div className="flex gap-2">
          <div className="flex-1 flex items-center rounded-xl px-4 py-3 font-mono text-sm text-white/85 truncate"
            style={{ background: "rgba(124,58,237,0.1)", border: "1px solid rgba(139,92,246,0.35)" }}>
            {link}
          </div>
          <button onClick={() => copy(link, "link")}
            className="px-5 rounded-xl font-bold text-white shrink-0 transition hover:brightness-110 flex items-center gap-2"
            style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)" }}>
            {copied === "link" ? <CheckCircle2 size={16} /> : <Copy size={16} />}
            {copied === "link" ? "Copied" : "Copy URL"}
          </button>
        </div>
      </div>

      {/* How it works */}
      <div className="grid sm:grid-cols-3 gap-3">
        {[
          { n: 1, t: "Share your code", d: "Send your link or code to friends." },
          { n: 2, t: "They sign up & play", d: "Friends join and place wagers." },
          { n: 3, t: "You earn commission", d: "Get a cut of their wagers, credited to you." },
        ].map((s) => (
          <div key={s.n} className="rounded-2xl p-4" style={{ background: "linear-gradient(135deg,#12183a,#0d1224)", border: "1px solid rgba(139,92,246,0.18)" }}>
            <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white mb-2"
              style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)" }}>{s.n}</span>
            <div className="text-sm font-bold text-white">{s.t}</div>
            <div className="text-xs text-white/45 mt-0.5">{s.d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── My Earnings ────────────────────────────────────────── */
function MyEarnings({ data }: { data?: Referral }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Referrals" value={String(data?.referralCount ?? 0)} Icon={Users} tone="#a855f7" />
        <Stat label="Commission Earned" value={inr(data?.totalCommission ?? 0)} Icon={Wallet} tone="#34d399" />
        <Stat label="Commission Rate" value={`${data?.commissionPct ?? 0}%`} Icon={Percent} tone="#f3c431" />
      </div>

      <div className="rounded-2xl p-5" style={{ background: "linear-gradient(135deg,#12183a,#0d1224)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <h3 className="font-semibold text-white flex items-center gap-2 mb-3"><ArrowUpRight size={16} className="text-violet-300" /> Recent Earnings</h3>
        {!data ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 rounded-lg bg-white/[0.04] animate-pulse" />)}</div>
        ) : data.recent.length === 0 ? (
          <div className="text-center py-8 text-white/40 text-sm">
            <Sparkles size={26} className="mx-auto mb-2 text-violet-300/50" />
            No commission yet — invite friends to start earning.
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {data.recent.map((r) => (
              <li key={r.id} className="py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm text-white/80">{r.note || "Referral commission"}</div>
                  <div className="text-[11px] text-white/40">{new Date(r.createdAt).toLocaleString("en-IN")}</div>
                </div>
                <span className="font-bold text-green-400 tabular-nums shrink-0">+{inr(r.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ─── Promotions ─────────────────────────────────────────── */
function Promotions({ promos }: { promos?: Promo[] }) {
  const { copied, copy } = useCopy();
  const typeMeta: Record<Promo["type"], { label: string; tone: string }> = {
    DEPOSIT_BONUS: { label: "Deposit Bonus", tone: "#34d399" },
    FREE_CREDIT:   { label: "Free Credit",   tone: "#f3c431" },
    CASHBACK:      { label: "Cashback",      tone: "#38bdf8" },
  };
  const value = (p: Promo) => p.type === "FREE_CREDIT" ? `${inr(p.amount)} free` : `${p.percentage}% ${p.type === "CASHBACK" ? "cashback" : "bonus"}`;

  if (!promos) return <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-24 rounded-2xl bg-white/[0.04] animate-pulse" />)}</div>;
  if (promos.length === 0) {
    return (
      <div className="rounded-2xl p-10 text-center text-white/40" style={{ background: "linear-gradient(135deg,#12183a,#0d1224)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <Gift size={30} className="mx-auto mb-2 text-violet-300/50" />
        No active promotions right now. Check back soon!
      </div>
    );
  }
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {promos.map((p) => {
        const m = typeMeta[p.type];
        return (
          <div key={p.code} className="rounded-2xl p-5 relative overflow-hidden"
            style={{ background: "linear-gradient(135deg,#12183a,#0d1224)", border: `1px solid ${m.tone}30` }}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg" style={{ background: `${m.tone}1f`, color: m.tone }}>{m.label}</span>
              <Ticket size={18} className="text-white/20" />
            </div>
            <div className="font-display text-2xl text-white">{value(p)}</div>
            <div className="text-xs text-white/45 mt-1 space-y-0.5">
              {p.minDeposit > 0 && <div>Min deposit {inr(p.minDeposit)}</div>}
              {p.wagerMultiplier > 1 && <div>Wager ×{p.wagerMultiplier}</div>}
              {p.expiresAt && <div className="flex items-center gap-1"><Clock size={11} /> Ends {new Date(p.expiresAt).toLocaleDateString("en-IN")}</div>}
              {p.remaining != null && <div>{p.remaining} left</div>}
            </div>
            <button onClick={() => copy(p.code, p.code)}
              className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-bold text-white transition hover:brightness-110"
              style={{ background: `linear-gradient(135deg, ${m.tone}cc, ${m.tone})` }}>
              {copied === p.code ? <CheckCircle2 size={15} /> : <Copy size={15} />}
              {copied === p.code ? "Copied!" : `Code: ${p.code}`}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value, Icon, tone }: { label: string; value: string; Icon: React.ElementType; tone: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "linear-gradient(135deg,#12183a,#0d1224)", border: `1px solid ${tone}22` }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wider text-white/40">{label}</span>
        <Icon size={15} style={{ color: tone }} />
      </div>
      <div className="font-display text-2xl leading-none" style={{ color: tone }}>{value}</div>
    </div>
  );
}
