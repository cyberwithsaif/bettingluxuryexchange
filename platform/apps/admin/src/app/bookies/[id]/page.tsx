"use client";
import useSWR, { mutate } from "swr";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { PageHeader, StatCard, Badge, DataTable, Column, GlassCard } from "@/components/ui";
import { ModalField } from "../page";
import {
  ArrowLeft, Wallet, Users as UsersIcon, Ticket, TrendingDown, Percent, CreditCard, Save,
} from "lucide-react";

const inr = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dt = (s: string) => new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const statusTone = (s: string) => (s === "ACTIVE" ? "emerald" : s === "SUSPENDED" ? "amber" : "red");

type Tab = "overview" | "users" | "wallet" | "activity";

export default function BookieDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const key = `/admin/bookies/${id}`;
  const { data, isLoading } = useSWR<any>(key);

  const bookie = data?.bookie;
  const stats = data?.stats;

  return (
    <div>
      <button onClick={() => router.push("/bookies")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-emerald-400 transition mb-3">
        <ArrowLeft size={15} /> Back to bookies
      </button>

      <PageHeader
        title={bookie?.fullName || bookie?.username || "Bookie"}
        subtitle={bookie ? `@${bookie.username} · ${bookie.email || "no email"} · ${bookie.phone || "no phone"}` : "Loading…"}
        right={bookie && <Badge tone={statusTone(bookie.status)}>{bookie.status}</Badge>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        <StatCard label="Wallet Balance" value={inr(bookie?.wallet?.balance ?? 0)} Icon={Wallet} accent="emerald" loading={isLoading} />
        <StatCard label="Credit Used" value={inr(bookie?.creditUsed ?? 0)} sub={`Limit ${inr(bookie?.creditLimit ?? 0)}`} Icon={CreditCard} accent="amber" loading={isLoading} />
        <StatCard label="Users" value={`${stats?.activeUsers ?? 0}/${stats?.totalUsers ?? 0}`} sub="active / total" Icon={UsersIcon} accent="violet" loading={isLoading} />
        <StatCard label="Total Bets" value={stats?.totalBets ?? 0} Icon={Ticket} accent="sky" loading={isLoading} />
        <StatCard label="Bookie Profit" value={inr(stats?.bookieProfit ?? 0)} sub="total player losses" Icon={TrendingDown} accent="amber" loading={isLoading} />
        <StatCard label="Admin Commission" value={inr(stats?.adminCommission ?? 0)} sub={`${stats?.commissionPct ?? 0}% · ${inr(stats?.commissionCollected ?? 0)} collected`} Icon={Percent} accent="emerald" loading={isLoading} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-700/60">
        {([["overview", "Overview & Settings"], ["users", "Users"], ["wallet", "Wallet Logs"], ["activity", "Activity Logs"]] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${tab === t ? "border-emerald-500 text-emerald-300" : "border-transparent text-gray-500 hover:text-gray-300"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "overview"  && <SettingsCard id={id} bookie={bookie} onSaved={() => mutate(key)} />}
      {tab === "users"     && <UsersTab id={id} />}
      {tab === "wallet"    && <WalletLogsTab id={id} />}
      {tab === "activity"  && <ActivityTab id={id} />}
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────

function SettingsCard({ id, bookie, onSaved }: { id: string; bookie: any; onSaved: () => void }) {
  const [f, setF] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // initialise once data arrives
  if (bookie && !f) {
    setF({ fullName: bookie.fullName ?? "", phone: bookie.phone ?? "", email: bookie.email ?? "", commissionBps: bookie.partnershipBps ?? 0, creditLimit: bookie.creditLimit ?? 0 });
  }
  if (!f) return <GlassCard className="p-6 text-gray-500 text-sm">Loading…</GlassCard>;

  async function save() {
    setBusy(true); setMsg(null);
    try {
      await api.patch(`/admin/bookies/${id}`, {
        fullName: f.fullName || undefined, phone: f.phone || undefined, email: f.email || undefined,
        commissionBps: Number(f.commissionBps) || 0, creditLimit: Number(f.creditLimit) || 0,
      });
      setMsg("Saved."); onSaved();
    } catch (e: any) { setMsg(e?.response?.data?.message || "Failed."); }
    finally { setBusy(false); }
  }

  return (
    <GlassCard className="p-6 max-w-2xl">
      <h3 className="font-black text-gray-100 mb-4">Bookie Settings</h3>
      <div className="grid grid-cols-2 gap-3">
        <ModalField label="Full Name" className="col-span-2"><input className="modal-input" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></ModalField>
        <ModalField label="Phone"><input className="modal-input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></ModalField>
        <ModalField label="Email"><input className="modal-input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></ModalField>
        <ModalField label="Admin Commission % (bps · 100=1%)"><input type="number" min={0} max={10000} className="modal-input" value={f.commissionBps} onChange={(e) => setF({ ...f, commissionBps: Number(e.target.value) })} /></ModalField>
        <ModalField label="Credit Limit (₹)"><input type="number" min={0} className="modal-input" value={f.creditLimit} onChange={(e) => setF({ ...f, creditLimit: Number(e.target.value) })} /></ModalField>
      </div>
      <div className="flex items-center gap-3 mt-4">
        <button onClick={save} disabled={busy} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600 hover:brightness-110 disabled:opacity-50 transition">
          <Save size={15} /> {busy ? "Saving…" : "Save Settings"}
        </button>
        {msg && <span className="text-sm text-gray-400">{msg}</span>}
      </div>
    </GlassCard>
  );
}

// ── Users ───────────────────────────────────────────────────────────────────

function UsersTab({ id }: { id: string }) {
  const { data, isLoading } = useSWR<any[]>(`/admin/bookies/${id}/users`);
  const columns: Column<any>[] = [
    { key: "username", header: "Username", sortValue: (u) => u.username, render: (u) => <span className="font-semibold text-gray-100">{u.username}</span> },
    { key: "balance", header: "Balance", align: "right", sortValue: (u) => u.wallet?.balance ?? 0, render: (u) => <span className="tabular-nums text-emerald-300">{inr(u.wallet?.balance ?? 0)}</span> },
    { key: "exposure", header: "Exposure", align: "right", sortValue: (u) => u.wallet?.exposure ?? 0, render: (u) => <span className="tabular-nums text-red-400">{inr(u.wallet?.exposure ?? 0)}</span> },
    { key: "status", header: "Status", align: "center", render: (u) => <Badge tone={statusTone(u.status)}>{u.status}</Badge> },
    { key: "created", header: "Joined", sortValue: (u) => u.createdAt, render: (u) => <span className="text-xs text-gray-500">{dt(u.createdAt)}</span> },
  ];
  return <DataTable columns={columns} rows={data ?? []} loading={isLoading} rowKey={(u) => u.id} searchKeys={["username"]} searchPlaceholder="Search users…" exportName="bookie-users" emptyText="This bookie has no users yet." />;
}

// ── Wallet logs ──────────────────────────────────────────────────────────────

function WalletLogsTab({ id }: { id: string }) {
  const { data, isLoading } = useSWR<any[]>(`/admin/bookies/${id}/wallet-logs`);
  const kindTone = (k: string) => (k === "BOOKIE_RECHARGE" ? "sky" : k === "USER_TO_BOOKIE" ? "emerald" : k === "COMMISSION_PAYOUT" ? "red" : "amber");
  const kindLabel = (k: string) => (k === "COMMISSION_PAYOUT" ? "ADMIN COMMISSION" : k.replace(/_/g, " "));
  const columns: Column<any>[] = [
    { key: "createdAt", header: "Time", sortValue: (l) => l.createdAt, render: (l) => <span className="text-xs text-gray-500">{dt(l.createdAt)}</span> },
    { key: "kind", header: "Type", render: (l) => <Badge tone={kindTone(l.kind)}>{kindLabel(l.kind)}</Badge> },
    { key: "amount", header: "Amount", align: "right", sortValue: (l) => Number(l.amount), render: (l) => <span className={`tabular-nums font-semibold ${Number(l.amount) >= 0 ? "text-emerald-300" : "text-red-400"}`}>{Number(l.amount) >= 0 ? "+" : ""}{inr(Number(l.amount))}</span> },
    { key: "balanceAfter", header: "Balance After", align: "right", render: (l) => <span className="tabular-nums text-gray-300">{inr(Number(l.balanceAfter))}</span> },
    { key: "note", header: "Note", render: (l) => <span className="text-xs text-gray-500">{l.note ?? "—"}</span> },
  ];
  return <DataTable columns={columns} rows={data ?? []} loading={isLoading} rowKey={(l) => l.id} exportName="bookie-wallet-logs" emptyText="No wallet movements yet." />;
}

// ── Activity ─────────────────────────────────────────────────────────────────

function ActivityTab({ id }: { id: string }) {
  const { data, isLoading } = useSWR<any[]>(`/admin/bookies/${id}/activity`);
  const columns: Column<any>[] = [
    { key: "createdAt", header: "Time", sortValue: (a) => a.createdAt, render: (a) => <span className="text-xs text-gray-500">{dt(a.createdAt)}</span> },
    { key: "action", header: "Action", render: (a) => <Badge tone="violet">{a.action}</Badge> },
    { key: "target", header: "Target", render: (a) => <span className="text-xs text-gray-400">{a.targetType ? `${a.targetType}:${String(a.targetId ?? "").slice(0, 8)}` : "—"}</span> },
    { key: "ip", header: "IP", render: (a) => <span className="text-xs text-gray-500 font-mono">{a.ip ?? "—"}</span> },
    { key: "metadata", header: "Details", render: (a) => <span className="text-xs text-gray-500 max-w-[200px] truncate inline-block">{a.metadata ? JSON.stringify(a.metadata) : "—"}</span> },
  ];
  return <DataTable columns={columns} rows={data ?? []} loading={isLoading} rowKey={(a) => a.id} exportName="bookie-activity" emptyText="No activity recorded yet." />;
}
