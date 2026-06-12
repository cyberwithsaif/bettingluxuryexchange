"use client";
import { useState } from "react";
import { mutate as globalMutate } from "swr";
import { api } from "@/lib/api";
import { useRiskData } from "@/lib/hooks";
import { PageHeader, GlassCard } from "@/components/ui";
import {
  ShieldAlert, Scale, AlertTriangle, Wrench, ChevronDown, ChevronRight,
  RefreshCw, Target, CheckCircle2, XCircle, User as UserIcon,
} from "lucide-react";

interface Row {
  userId: string; username: string; role: string; userStatus: string; lastLoginAt: string | null;
  balance: number; exposure: number; liveExposure: number; mismatch: number; available: number;
  openBets: number; openLiability: number;
}
interface Summary {
  wallets: number; totalExposure: number; liveExposure: number;
  leaked: number; leakedWallets: number; negativeWallets: number; openBets: number;
}
interface Overview { summary: Summary; rows: Row[]; }

interface DetailMarket { marketId: string; name: string; status: string; live: boolean; worstCase: number; updatedAt: string; }
interface DetailBet {
  id: string; market: string; marketStatus: string; runner: string; side: "BACK" | "LAY";
  odds: number; stake: number; liability: number; potentialProfit: number; createdAt: string;
}
interface Detail {
  user: { id: string; username: string; role: string; status: string; createdAt: string; lastLoginAt: string | null };
  wallet: { balance: number; exposure: number; available: number };
  liveExposure: number; mismatch: number;
  markets: DetailMarket[]; openBets: DetailBet[];
}

const KEY = "/admin/exposure";
const inr = (n: number | undefined) =>
  n == null ? "–" : "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
const ago = (s: string | null) => {
  if (!s) return "never";
  const m = Math.floor((Date.now() - new Date(s).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
};

export default function ExposurePage() {
  const { data, isLoading } = useRiskData<Overview>(KEY); // 5s live refresh
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // userId | "ALL" | bet:<id>
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const s = data?.summary;

  async function loadDetail(userId: string) {
    if (openUser === userId) { setOpenUser(null); setDetail(null); return; }
    setOpenUser(userId);
    setDetail(null);
    setDetailLoading(true);
    try {
      const { data: d } = await api.get(`/admin/exposure/${userId}`);
      setDetail(d);
    } catch { setMsg({ ok: false, text: "Failed to load detail" }); }
    finally { setDetailLoading(false); }
  }

  async function reconcile(userId: string) {
    setBusy(userId); setMsg(null);
    try {
      const { data: r } = await api.post(`/admin/exposure/${userId}/reconcile`);
      setMsg({ ok: true, text: r.changed ? `Reconciled — exposure ${inr(r.current)} → ${inr(r.live)}` : "Already in sync — nothing to fix." });
      globalMutate(KEY);
      if (openUser === userId) { const { data: d } = await api.get(`/admin/exposure/${userId}`); setDetail(d); }
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || "Reconcile failed" }); }
    finally { setBusy(null); }
  }

  // ── Settle dialog ──
  const [settleFor, setSettleFor] = useState<Row | null>(null);
  const [outcome, setOutcome] = useState<"LOSS" | "WIN" | "VOID">("LOSS");
  const [amount, setAmount] = useState(0);
  const [profit, setProfit] = useState(0);

  function openSettle(r: Row) {
    setSettleFor(r);
    setOutcome("LOSS");
    const def = r.mismatch > 0.009 ? r.mismatch : r.exposure;
    setAmount(Math.round(def * 100) / 100);
    setProfit(Math.round(def * 100) / 100);
  }

  async function applySettle() {
    if (!settleFor) return;
    setBusy(settleFor.userId); setMsg(null);
    try {
      const body: Record<string, unknown> = { outcome, amount };
      if (outcome === "WIN") body.profit = profit;
      const { data: r } = await api.post(`/admin/exposure/${settleFor.userId}/settle`, body);
      setMsg({
        ok: true,
        text: r.outcome === "LOSS"
          ? `Settled as LOSS — ₹${r.released} taken from ${settleFor.username}'s balance, exposure released.`
          : r.outcome === "WIN"
          ? `Settled as WIN — ₹${r.profit} paid to ${settleFor.username}, ₹${r.released} exposure released.`
          : `Released ₹${r.released} exposure (void) — balance untouched.`,
      });
      setSettleFor(null);
      globalMutate(KEY);
      if (openUser === settleFor.userId) { const { data: d } = await api.get(`/admin/exposure/${settleFor.userId}`); setDetail(d); }
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || "Settle failed" }); }
    finally { setBusy(null); }
  }

  async function reconcileAll() {
    if (!window.confirm("Reconcile every mismatched wallet? Exposure will be reset to the live open-bet liability for each user.")) return;
    setBusy("ALL"); setMsg(null);
    try {
      const { data: r } = await api.post("/admin/exposure/reconcile-all");
      setMsg({ ok: true, text: `Reconciled ${r.fixed} wallet${r.fixed === 1 ? "" : "s"} — net ${inr(r.released)} exposure released.` });
      globalMutate(KEY);
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || "Reconcile failed" }); }
    finally { setBusy(null); }
  }

  async function voidBet(betId: string) {
    if (!window.confirm("Void this bet? The stake is returned and its exposure released.")) return;
    setBusy(`bet:${betId}`); setMsg(null);
    try {
      await api.patch(`/admin/bets/${betId}`, { action: "void" });
      setMsg({ ok: true, text: "Bet voided — exposure released." });
      globalMutate(KEY);
      if (openUser) { const { data: d } = await api.get(`/admin/exposure/${openUser}`); setDetail(d); }
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || "Void failed" }); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title="Exposure Control" subtitle="Every wallet holding exposure — what backs it, what leaked, and one-click settlement" />

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card label="Total Exposure" value={inr(s?.totalExposure)} tone={(s?.totalExposure ?? 0) > 0 ? "red" : "ok"} Icon={ShieldAlert} loading={isLoading} />
        <Card label="Backed by Open Bets" value={inr(s?.liveExposure)} tone="neutral" Icon={Target} loading={isLoading} sub="live market liability" />
        <Card label="Leaked / Stale" value={inr(s?.leaked)} tone={(s?.leaked ?? 0) > 0 ? "amber" : "ok"} Icon={AlertTriangle} loading={isLoading}
          sub={`${s?.leakedWallets ?? 0} wallet${(s?.leakedWallets ?? 0) === 1 ? "" : "s"}`} />
        <Card label="Negative Wallets" value={String(s?.negativeWallets ?? 0)} tone={(s?.negativeWallets ?? 0) > 0 ? "red" : "ok"} Icon={XCircle} loading={isLoading} sub="exposure below zero" />
        <Card label="Wallets w/ Exposure" value={String(s?.wallets ?? 0)} tone="neutral" Icon={UserIcon} loading={isLoading} />
        <Card label="Open Sports Bets" value={String(s?.openBets ?? 0)} tone="neutral" Icon={Scale} loading={isLoading} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={reconcileAll} disabled={busy !== null || (s ? s.leakedWallets === 0 && s.negativeWallets === 0 : true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-red-500 to-red-600 hover:brightness-110 disabled:opacity-40 transition">
          <Wrench size={15} /> {busy === "ALL" ? "Reconciling…" : "Reconcile All Mismatched"}
        </button>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          Live · refreshes every 5s
        </div>
        {msg && <span className={`text-xs font-semibold ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</span>}
      </div>

      {/* Table */}
      <GlassCard className="overflow-x-auto p-0">
        <table className="w-full text-sm min-w-[920px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-700/60">
              <th className="px-4 py-3">User</th>
              <th className="px-3 py-3 text-right">Balance</th>
              <th className="px-3 py-3 text-right">Exposure</th>
              <th className="px-3 py-3 text-right">Backed (Live)</th>
              <th className="px-3 py-3 text-center">Health</th>
              <th className="px-3 py-3 text-right">Open Bets</th>
              <th className="px-3 py-3 text-right">Available</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && !data && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">Loading exposure…</td></tr>
            )}
            {data && data.rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                <CheckCircle2 size={22} className="inline mr-2 text-emerald-400" /> No wallet is holding any exposure.
              </td></tr>
            )}
            {(data?.rows ?? []).map((r) => {
              const leaked = r.mismatch > 0.009;
              const negative = r.exposure < 0;
              const expanded = openUser === r.userId;
              return (
                <FragmentRow key={r.userId}>
                  <tr className={`border-b border-gray-800 hover:bg-gray-800/40 transition ${expanded ? "bg-gray-800/40" : ""}`}>
                    <td className="px-4 py-2.5">
                      <button onClick={() => loadDetail(r.userId)} className="flex items-center gap-2 group">
                        {expanded ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-600 group-hover:text-gray-400" />}
                        <span className="font-bold text-gray-100">{r.username}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-700/70 text-gray-400 uppercase">{r.role}</span>
                        <span className="text-[10px] text-gray-600">{ago(r.lastLoginAt)}</span>
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-300">{inr(r.balance)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-black ${negative ? "text-red-400" : "text-orange-300"}`}>{inr(r.exposure)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-300">{inr(r.liveExposure)}</td>
                    <td className="px-3 py-2.5 text-center">
                      {negative ? <Badge tone="red" text="NEGATIVE" />
                        : leaked ? <Badge tone="amber" text={`LEAKED +${inr(r.mismatch)}`} />
                        : <Badge tone="green" text="HEALTHY" />}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-300">
                      {r.openBets}{r.openLiability > 0 && <span className="text-[10px] text-gray-500"> · {inr(r.openLiability)}</span>}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-bold ${r.available < 0 ? "text-red-400" : "text-emerald-300"}`}>{inr(r.available)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {negative ? (
                        <button onClick={() => reconcile(r.userId)} disabled={busy !== null}
                          title="Negative exposure is corrupt state — reset it to the live liability"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition disabled:opacity-30 border-red-500/50 text-red-300 hover:bg-red-500/10">
                          {busy === r.userId ? <RefreshCw size={11} className="animate-spin" /> : <Wrench size={11} />}
                          Fix
                        </button>
                      ) : (
                        <button onClick={() => openSettle(r)} disabled={busy !== null || r.exposure <= 0.009}
                          title="Settle this exposure — choose player win, player loss, or release"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition disabled:opacity-30 border-amber-500/50 text-amber-300 hover:bg-amber-500/10">
                          <Wrench size={11} />
                          Settle
                        </button>
                      )}
                    </td>
                  </tr>

                  {expanded && (
                    <tr className="border-b border-gray-800 bg-gray-900/40">
                      <td colSpan={8} className="px-6 py-4">
                        {detailLoading && <p className="text-gray-500 text-xs py-4">Loading breakdown…</p>}
                        {detail && detail.user.id === r.userId && (
                          <div className="grid lg:grid-cols-2 gap-5">
                            {/* Markets holding exposure */}
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">Exposure by Market</p>
                              {detail.markets.length === 0 ? (
                                <p className="text-xs text-gray-600">No market exposure rows — this exposure is fully orphaned. Use Settle to release it.</p>
                              ) : (
                                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                                  {detail.markets.map((m) => (
                                    <div key={m.marketId} className="flex items-center justify-between gap-2 rounded-lg bg-gray-800/70 border border-gray-700/50 px-3 py-2">
                                      <div className="min-w-0">
                                        <p className="text-xs font-bold text-gray-200 truncate">{m.name}</p>
                                        <p className="text-[10px] text-gray-500">{new Date(m.updatedAt).toLocaleString("en-IN")}</p>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <Badge tone={m.live ? "green" : "gray"} text={m.status} />
                                        <span className="tabular-nums font-bold text-orange-300 text-xs">{inr(m.worstCase)}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Open bets */}
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">Open Bets ({detail.openBets.length})</p>
                              {detail.openBets.length === 0 ? (
                                <p className="text-xs text-gray-600">No open sports bets.</p>
                              ) : (
                                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                                  {detail.openBets.map((b) => (
                                    <div key={b.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-800/70 border border-gray-700/50 px-3 py-2">
                                      <div className="min-w-0">
                                        <p className="text-xs font-bold text-gray-200 truncate">{b.market} — {b.runner}</p>
                                        <p className="text-[10px] text-gray-500">
                                          <span className={b.side === "BACK" ? "text-sky-400 font-bold" : "text-pink-400 font-bold"}>{b.side}</span>
                                          {" "}@ {b.odds} · stake {inr(b.stake)} · liab {inr(b.liability)} · {new Date(b.createdAt).toLocaleString("en-IN")}
                                        </p>
                                      </div>
                                      <button onClick={() => voidBet(b.id)} disabled={busy !== null}
                                        className="shrink-0 px-2.5 py-1 rounded-md text-[10px] font-bold border border-red-500/50 text-red-300 hover:bg-red-500/10 transition disabled:opacity-40">
                                        {busy === `bet:${b.id}` ? "…" : "Void"}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </FragmentRow>
              );
            })}
          </tbody>
        </table>
      </GlassCard>

      <p className="text-[11px] text-gray-600 leading-relaxed max-w-3xl">
        <b className="text-gray-400">How settle works:</b> a wallet&apos;s exposure should equal the worst-case liability of its
        open bets on unsettled markets (&ldquo;Backed&rdquo;). <b className="text-amber-400">Leaked</b> exposure was orphaned by
        deleted/settled markets; <b className="text-red-400">negative</b> exposure is corrupt state. Settle lets you resolve held
        exposure as a <b className="text-red-300">player loss</b> (amount moves out of their balance — house wins), a{" "}
        <b className="text-emerald-300">player win</b> (profit paid to their balance), or a plain <b className="text-gray-300">release</b>{" "}
        (void, balance untouched). Every action is an audited ledger entry. Voiding a bet refunds the stake and releases its share.
      </p>

      {/* ── Settle dialog ── */}
      {settleFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={() => busy === null && setSettleFor(null)} />
          <div className="relative w-full max-w-md rounded-2xl border border-yellow-500/25 bg-gray-800 p-5 shadow-2xl">
            <h3 className="text-base font-black text-gray-100">Settle Exposure — {settleFor.username}</h3>
            <p className="text-[11px] text-gray-500 mt-1">
              Exposure {inr(settleFor.exposure)} · backed {inr(settleFor.liveExposure)} ·{" "}
              {settleFor.mismatch > 0.009 ? <span className="text-amber-400 font-bold">leaked {inr(settleFor.mismatch)}</span> : "fully backed"}
              {" "}· balance {inr(settleFor.balance)}
            </p>

            {/* Outcome */}
            <div className="mt-4 space-y-2">
              {([
                { key: "LOSS", title: "Player Loses", desc: "Amount is deducted from the player's balance (house wins) and released from exposure.", tone: "border-red-500/50 bg-red-500/5", active: "ring-2 ring-red-400/60" },
                { key: "WIN",  title: "Player Wins",  desc: "Profit is credited to the player's balance; the exposure amount is released.",          tone: "border-emerald-500/50 bg-emerald-500/5", active: "ring-2 ring-emerald-400/60" },
                { key: "VOID", title: "Release Only (Void)", desc: "Exposure is unlocked; balance untouched. Use for leaked/orphaned exposure.",     tone: "border-gray-600 bg-gray-700/20", active: "ring-2 ring-gray-400/60" },
              ] as const).map(o => (
                <button key={o.key} onClick={() => setOutcome(o.key)}
                  className={`w-full text-left rounded-xl border px-3.5 py-2.5 transition ${o.tone} ${outcome === o.key ? o.active : "opacity-75 hover:opacity-100"}`}>
                  <p className="text-sm font-black text-gray-100">{o.title}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{o.desc}</p>
                </button>
              ))}
            </div>

            {/* Amounts */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">
                  {outcome === "LOSS" ? "Loss amount (₹)" : "Exposure to release (₹)"}
                </label>
                <input type="number" min={0.01} max={settleFor.exposure} value={amount || ""}
                  onChange={e => setAmount(Number(e.target.value) || 0)}
                  className="w-full bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-yellow-400/60" />
                <p className="text-[9px] text-gray-600 mt-0.5">max {inr(settleFor.exposure)}</p>
              </div>
              {outcome === "WIN" && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-emerald-400 block mb-1">Profit to pay (₹)</label>
                  <input type="number" min={0} value={profit || ""}
                    onChange={e => setProfit(Number(e.target.value) || 0)}
                    className="w-full bg-gray-900/60 border border-emerald-700/60 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-emerald-400/60" />
                </div>
              )}
            </div>

            {outcome === "LOSS" && amount > settleFor.balance && (
              <p className="mt-3 text-[11px] text-red-300 flex items-start gap-1.5">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                Loss amount exceeds the player&apos;s balance ({inr(settleFor.balance)}) — their balance will go negative.
              </p>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button onClick={() => setSettleFor(null)} disabled={busy !== null}
                className="px-4 py-2 rounded-lg text-xs font-bold text-gray-400 border border-gray-700 hover:text-white transition">Cancel</button>
              <button onClick={applySettle} disabled={busy !== null || amount <= 0}
                className={`px-5 py-2 rounded-lg text-xs font-black text-white transition disabled:opacity-40 ${
                  outcome === "LOSS" ? "bg-gradient-to-r from-red-500 to-red-600" :
                  outcome === "WIN" ? "bg-gradient-to-r from-emerald-500 to-emerald-600" :
                  "bg-gradient-to-r from-gray-500 to-gray-600"}`}>
                {busy !== null ? "Applying…" :
                  outcome === "LOSS" ? `Settle as LOSS — take ${inr(amount)}` :
                  outcome === "WIN" ? `Settle as WIN — pay ${inr(profit)}` :
                  `Release ${inr(amount)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) { return <>{children}</>; }

function Badge({ tone, text }: { tone: "green" | "amber" | "red" | "gray"; text: string }) {
  const map = {
    green: "bg-emerald-500/10 border-emerald-500/40 text-emerald-300",
    amber: "bg-amber-500/10 border-amber-500/50 text-amber-300",
    red:   "bg-red-500/10 border-red-500/50 text-red-300",
    gray:  "bg-gray-700/40 border-gray-600/50 text-gray-400",
  };
  return <span className={`inline-block px-2 py-0.5 rounded-md border text-[9px] font-black tracking-wide ${map[tone]}`}>{text}</span>;
}

function Card({ label, value, sub, tone, Icon, loading }: {
  label: string; value: string; sub?: string; tone: "red" | "amber" | "ok" | "neutral"; Icon: any; loading?: boolean;
}) {
  const color = tone === "red" ? "text-red-400" : tone === "amber" ? "text-amber-300" : tone === "ok" ? "text-emerald-300" : "text-gray-100";
  const iconBg = tone === "red" ? "bg-red-500/10 text-red-400" : tone === "amber" ? "bg-amber-500/10 text-amber-400" : tone === "ok" ? "bg-emerald-500/10 text-emerald-400" : "bg-gray-700/40 text-gray-400";
  return (
    <div className="bg-gray-800 rounded-xl border border-yellow-500/20 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2 truncate">{label}</p>
          {loading ? <div className="h-6 w-16 bg-gray-700 rounded animate-pulse" />
            : <p className={`text-lg font-black tabular-nums ${color}`}>{value}</p>}
          {sub && !loading && <p className="text-[10px] text-gray-600 mt-0.5">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg shrink-0 ${iconBg}`}><Icon size={15} /></div>
      </div>
    </div>
  );
}
