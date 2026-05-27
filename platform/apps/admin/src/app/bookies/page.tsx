"use client";
import useSWR, { mutate } from "swr";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { PageHeader, StatCard, Badge, DataTable, Column } from "@/components/ui";
import {
  Store, Wallet, Users as UsersIcon, CreditCard, Plus, X, Eye,
  PlusCircle, UserX, UserCheck, LogOut, Save,
} from "lucide-react";

interface Bookie {
  id: string;
  username: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  partnershipBps: number;
  commissionPct: number;
  creditLimit: number;
  creditUsed: number;
  available: number;
  totalUsers: number;
  lastLoginAt: string | null;
  createdAt: string;
  wallet: { balance: number; exposure: number } | null;
}

const KEY = "/admin/bookies";
const inr = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const statusTone = (s: string) => (s === "ACTIVE" ? "emerald" : s === "SUSPENDED" ? "amber" : "red");

export default function BookiesPage() {
  const router = useRouter();
  const { data: bookies, isLoading } = useSWR<Bookie[]>(KEY);
  const [creating, setCreating] = useState(false);
  const [recharge, setRecharge] = useState<Bookie | null>(null);

  const list = bookies ?? [];
  const totalFloat = list.reduce((s, b) => s + (b.wallet?.balance ?? 0), 0);
  const totalCredit = list.reduce((s, b) => s + b.creditUsed, 0);
  const totalUsers = list.reduce((s, b) => s + b.totalUsers, 0);

  async function act(b: Bookie, action: "suspend" | "activate" | "logout") {
    try {
      if (action === "logout") {
        if (!confirm(`Force-logout ${b.username}? All their sessions end immediately.`)) return;
        await api.post(`${KEY}/${b.id}/force-logout`);
      } else {
        await api.patch(`${KEY}/${b.id}/status`, { status: action === "suspend" ? "SUSPENDED" : "ACTIVE" });
      }
      mutate(KEY);
    } catch (e: any) {
      alert(e?.response?.data?.message || "Action failed");
    }
  }

  const columns: Column<Bookie>[] = [
    { key: "name", header: "Bookie", sortValue: (b) => b.username,
      render: (b) => (
        <div className="min-w-0">
          <div className="font-semibold text-gray-100 truncate">{b.fullName || b.username}</div>
          <div className="text-[11px] text-gray-500">@{b.username}</div>
        </div>
      ) },
    { key: "balance", header: "Wallet", align: "right", sortValue: (b) => b.wallet?.balance ?? 0,
      exportValue: (b) => b.wallet?.balance ?? 0,
      render: (b) => <span className="tabular-nums text-emerald-300 font-semibold">{inr(b.wallet?.balance ?? 0)}</span> },
    { key: "credit", header: "Credit Used", align: "right", sortValue: (b) => b.creditUsed,
      render: (b) => (
        <span className="tabular-nums text-gray-300">
          {b.creditUsed > 0 ? <span className="text-amber-300">{inr(b.creditUsed)}</span> : "—"}
          <span className="text-gray-600 text-[11px]"> / {inr(b.creditLimit)}</span>
        </span>
      ) },
    { key: "available", header: "Available", align: "right", sortValue: (b) => b.available,
      render: (b) => <span className="tabular-nums text-sky-300">{inr(b.available)}</span> },
    { key: "users", header: "Users", align: "center", sortValue: (b) => b.totalUsers,
      render: (b) => <span className="tabular-nums text-gray-200 font-semibold">{b.totalUsers}</span> },
    { key: "commission", header: "Comm.", align: "right", sortValue: (b) => b.commissionPct,
      render: (b) => <span className="tabular-nums text-gray-400">{b.commissionPct}%</span> },
    { key: "status", header: "Status", align: "center", sortValue: (b) => b.status,
      render: (b) => <Badge tone={statusTone(b.status)}>{b.status}</Badge> },
    { key: "lastLogin", header: "Last Login", sortValue: (b) => b.lastLoginAt ?? "",
      render: (b) => <span className="text-xs text-gray-500">{b.lastLoginAt ? new Date(b.lastLoginAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Never"}</span> },
    { key: "actions", header: "Actions", align: "center",
      render: (b) => (
        <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
          <IconBtn title="View" onClick={() => router.push(`/bookies/${b.id}`)} className="hover:border-sky-400 hover:text-sky-400"><Eye size={13} /></IconBtn>
          <IconBtn title="Recharge wallet" onClick={() => setRecharge(b)} className="hover:border-emerald-400 hover:text-emerald-400"><PlusCircle size={13} /></IconBtn>
          {b.status === "ACTIVE"
            ? <IconBtn title="Suspend" onClick={() => act(b, "suspend")} className="hover:border-red-400 hover:text-red-400"><UserX size={13} /></IconBtn>
            : <IconBtn title="Activate" onClick={() => act(b, "activate")} className="hover:border-emerald-400 hover:text-emerald-400"><UserCheck size={13} /></IconBtn>}
          <IconBtn title="Force logout" onClick={() => act(b, "logout")} className="hover:border-amber-400 hover:text-amber-400"><LogOut size={13} /></IconBtn>
        </div>
      ) },
  ];

  return (
    <div>
      <PageHeader
        title="Manage Bookies"
        subtitle="Create and fund bookies, set commission & credit, and monitor their downline."
        right={
          <button onClick={() => setCreating(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600 shadow-[0_2px_12px_rgba(0,200,83,0.4)] hover:brightness-110 transition">
            <Plus size={16} /> Create Bookie
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total Bookies" value={list.length} Icon={Store} accent="emerald" loading={isLoading} />
        <StatCard label="Total Float" value={inr(totalFloat)} Icon={Wallet} accent="sky" loading={isLoading} />
        <StatCard label="Credit Outstanding" value={inr(totalCredit)} Icon={CreditCard} accent="amber" loading={isLoading} />
        <StatCard label="Users Under Bookies" value={totalUsers} Icon={UsersIcon} accent="violet" loading={isLoading} />
      </div>

      <DataTable
        columns={columns}
        rows={list}
        loading={isLoading}
        rowKey={(b) => b.id}
        searchKeys={["username", (b) => b.fullName ?? ""]}
        searchPlaceholder="Search bookies…"
        exportName="bookies"
        emptyText="No bookies yet. Click “Create Bookie” to add one."
      />

      {creating && <CreateBookieModal onClose={(saved) => { setCreating(false); if (saved) mutate(KEY); }} />}
      {recharge && <RechargeModal bookie={recharge} onClose={(saved) => { setRecharge(null); if (saved) mutate(KEY); }} />}
    </div>
  );
}

// ── Create Bookie ───────────────────────────────────────────────────────────

function CreateBookieModal({ onClose }: { onClose: (saved?: boolean) => void }) {
  const [f, setF] = useState({ username: "", password: "", fullName: "", phone: "", email: "", initialBalance: 0, commissionBps: 0, creditLimit: 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!f.username || f.password.length < 8) { setErr("Username required and password must be 8+ characters."); return; }
    setBusy(true); setErr(null);
    try {
      await api.post("/admin/bookies", {
        username: f.username, password: f.password,
        fullName: f.fullName || undefined, phone: f.phone || undefined, email: f.email || undefined,
        initialBalance: Number(f.initialBalance) || 0,
        commissionBps: Number(f.commissionBps) || 0,
        creditLimit: Number(f.creditLimit) || 0,
      });
      onClose(true);
    } catch (e: any) { setErr(e?.response?.data?.message || "Failed to create bookie."); }
    finally { setBusy(false); }
  }

  return (
    <Modal title="Create Bookie" onClose={() => onClose()}>
      <div className="grid grid-cols-2 gap-3">
        <ModalField label="Full Name" className="col-span-2"><input className="modal-input" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} placeholder="Acme Bookmakers" /></ModalField>
        <ModalField label="Username"><input className="modal-input" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></ModalField>
        <ModalField label="Password (8+)"><input type="password" className="modal-input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></ModalField>
        <ModalField label="Phone"><input className="modal-input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></ModalField>
        <ModalField label="Email"><input className="modal-input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></ModalField>
        <ModalField label="Initial Wallet (₹)"><input type="number" min={0} className="modal-input" value={f.initialBalance} onChange={(e) => setF({ ...f, initialBalance: Number(e.target.value) })} /></ModalField>
        <ModalField label="Commission (bps · 100=1%)"><input type="number" min={0} max={10000} className="modal-input" value={f.commissionBps} onChange={(e) => setF({ ...f, commissionBps: Number(e.target.value) })} /></ModalField>
        <ModalField label="Credit Limit (₹)" className="col-span-2"><input type="number" min={0} className="modal-input" value={f.creditLimit} onChange={(e) => setF({ ...f, creditLimit: Number(e.target.value) })} /></ModalField>
      </div>
      {err && <p className="text-xs text-red-400 bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2 mt-3">{err}</p>}
      <div className="flex gap-2 mt-4">
        <button onClick={() => onClose()} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-gray-300 border border-gray-700 hover:bg-gray-800 transition">Cancel</button>
        <button onClick={submit} disabled={busy} className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600 hover:brightness-110 disabled:opacity-50 transition flex items-center justify-center gap-2">
          <Save size={15} /> {busy ? "Creating…" : "Create Bookie"}
        </button>
      </div>
    </Modal>
  );
}

// ── Recharge ──────────────────────────────────────────────────────────────

function RechargeModal({ bookie, onClose }: { bookie: Bookie; onClose: (saved?: boolean) => void }) {
  const [mode, setMode] = useState<"add" | "deduct">("add");
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!amount || amount <= 0) { setErr("Enter an amount greater than 0."); return; }
    setBusy(true); setErr(null);
    try {
      await api.post(`/admin/bookies/${bookie.id}/recharge`, { amount: mode === "add" ? amount : -amount, note: note || undefined });
      onClose(true);
    } catch (e: any) { setErr(e?.response?.data?.message || "Recharge failed."); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={`Wallet — ${bookie.fullName || bookie.username}`} onClose={() => onClose()}>
      <p className="text-sm text-gray-400 mb-3">Current balance: <span className="text-emerald-300 font-semibold tabular-nums">{inr(bookie.wallet?.balance ?? 0)}</span></p>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button onClick={() => setMode("add")} className={`py-2 rounded-lg text-sm font-bold border transition ${mode === "add" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" : "border-gray-700 text-gray-400 hover:border-gray-600"}`}>+ Add Balance</button>
        <button onClick={() => setMode("deduct")} className={`py-2 rounded-lg text-sm font-bold border transition ${mode === "deduct" ? "bg-red-500/15 text-red-300 border-red-500/40" : "border-gray-700 text-gray-400 hover:border-gray-600"}`}>− Deduct</button>
      </div>
      <ModalField label="Amount (₹)"><input type="number" min={0} className="modal-input" value={amount} onChange={(e) => setAmount(Number(e.target.value))} autoFocus /></ModalField>
      <div className="mt-3"><ModalField label="Note (optional)"><input className="modal-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason / reference" /></ModalField></div>
      {err && <p className="text-xs text-red-400 bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2 mt-3">{err}</p>}
      <div className="flex gap-2 mt-4">
        <button onClick={() => onClose()} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-gray-300 border border-gray-700 hover:bg-gray-800 transition">Cancel</button>
        <button onClick={submit} disabled={busy} className={`flex-1 py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-50 transition ${mode === "add" ? "bg-gradient-to-r from-emerald-500 to-green-600" : "bg-gradient-to-r from-red-500 to-red-600"} hover:brightness-110`}>
          {busy ? "Processing…" : mode === "add" ? `Add ${inr(amount)}` : `Deduct ${inr(amount)}`}
        </button>
      </div>
    </Modal>
  );
}

// ── shared bits ─────────────────────────────────────────────────────────────

function IconBtn({ title, onClick, className, children }: { title: string; onClick: () => void; className?: string; children: React.ReactNode }) {
  return (
    <button title={title} onClick={onClick} className={`p-1.5 rounded-lg border border-gray-700 text-gray-500 bg-gray-900/40 transition ${className ?? ""}`}>
      {children}
    </button>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-emerald-500/20 bg-gray-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-black text-gray-100">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-700 text-gray-500 transition"><X size={18} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function ModalField({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
