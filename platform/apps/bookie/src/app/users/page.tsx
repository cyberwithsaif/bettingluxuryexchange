"use client";
import useSWR, { mutate } from "swr";
import { useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, Badge, DataTable, Column, Modal, Field } from "@/components/ui";
import { Plus, ArrowUpCircle, ArrowDownCircle, UserX, UserCheck, KeyRound, Save } from "lucide-react";

const KEY = "/bookie/users";
const inr = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const statusTone = (s: string) => (s === "ACTIVE" ? "emerald" : s === "SUSPENDED" ? "amber" : "red");

interface U {
  id: string; username: string; status: string; createdAt: string;
  wallet: { balance: number; exposure: number } | null;
}

export default function MyUsersPage() {
  const { data, isLoading } = useSWR<U[]>(KEY);
  const [creating, setCreating] = useState(false);
  const [xfer, setXfer] = useState<{ user: U; dir: "credit" | "debit" } | null>(null);

  async function act(u: U, action: "suspend" | "activate" | "resetpwd") {
    try {
      if (action === "resetpwd") {
        const pwd = prompt("New password (min 8 chars):");
        if (!pwd) return;
        if (pwd.length < 8) { alert("Min 8 characters."); return; }
        await api.patch(`${KEY}/${u.id}/password`, { password: pwd });
        alert("Password reset.");
        return;
      }
      await api.patch(`${KEY}/${u.id}/status`, { status: action === "suspend" ? "SUSPENDED" : "ACTIVE" });
      mutate(KEY);
    } catch (e: any) { alert(e?.response?.data?.message || "Action failed"); }
  }

  const columns: Column<U>[] = [
    { key: "username", header: "Username", sortValue: (u) => u.username, render: (u) => <span className="font-semibold text-gray-100">{u.username}</span> },
    { key: "balance", header: "Balance", align: "right", sortValue: (u) => u.wallet?.balance ?? 0, exportValue: (u) => u.wallet?.balance ?? 0,
      render: (u) => <span className="tabular-nums text-emerald-300 font-semibold">{inr(u.wallet?.balance ?? 0)}</span> },
    { key: "exposure", header: "Exposure", align: "right", sortValue: (u) => u.wallet?.exposure ?? 0,
      render: (u) => <span className="tabular-nums text-red-400">{inr(u.wallet?.exposure ?? 0)}</span> },
    { key: "status", header: "Status", align: "center", sortValue: (u) => u.status, render: (u) => <Badge tone={statusTone(u.status)}>{u.status}</Badge> },
    { key: "created", header: "Joined", sortValue: (u) => u.createdAt, render: (u) => <span className="text-xs text-gray-500">{new Date(u.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span> },
    { key: "actions", header: "Actions", align: "center", render: (u) => (
      <div className="flex items-center justify-center gap-1">
        <IconBtn title="Add funds" onClick={() => setXfer({ user: u, dir: "credit" })} className="hover:border-emerald-400 hover:text-emerald-400"><ArrowUpCircle size={14} /></IconBtn>
        <IconBtn title="Withdraw funds" onClick={() => setXfer({ user: u, dir: "debit" })} className="hover:border-amber-400 hover:text-amber-400"><ArrowDownCircle size={14} /></IconBtn>
        {u.status === "ACTIVE"
          ? <IconBtn title="Suspend" onClick={() => act(u, "suspend")} className="hover:border-red-400 hover:text-red-400"><UserX size={14} /></IconBtn>
          : <IconBtn title="Activate" onClick={() => act(u, "activate")} className="hover:border-emerald-400 hover:text-emerald-400"><UserCheck size={14} /></IconBtn>}
        <IconBtn title="Reset password" onClick={() => act(u, "resetpwd")} className="hover:border-sky-400 hover:text-sky-400"><KeyRound size={14} /></IconBtn>
      </div>
    ) },
  ];

  return (
    <div>
      <PageHeader title="My Users" subtitle="Players you created. Fund or withdraw straight from your wallet."
        right={<button onClick={() => setCreating(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600 shadow-[0_2px_12px_rgba(0,200,83,0.4)] hover:brightness-110 transition"><Plus size={16} /> Create User</button>} />

      <DataTable columns={columns} rows={data ?? []} loading={isLoading} rowKey={(u) => u.id}
        searchKeys={["username"]} searchPlaceholder="Search users…" exportName="my-users"
        emptyText="No users yet. Click “Create User” to add your first player." />

      {creating && <CreateUserModal onClose={(s) => { setCreating(false); if (s) mutate(KEY); }} />}
      {xfer && <TransferModal user={xfer.user} dir={xfer.dir} onClose={(s) => { setXfer(null); if (s) mutate(KEY); }} />}
    </div>
  );
}

function CreateUserModal({ onClose }: { onClose: (saved?: boolean) => void }) {
  const [f, setF] = useState({ username: "", password: "", phone: "", email: "", initialBalance: 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit() {
    if (!f.username || f.password.length < 8) { setErr("Username required and password 8+ chars."); return; }
    setBusy(true); setErr(null);
    try {
      await api.post(KEY, { username: f.username, password: f.password, phone: f.phone || undefined, email: f.email || undefined, initialBalance: Number(f.initialBalance) || 0 });
      onClose(true);
    } catch (e: any) { setErr(e?.response?.data?.message || "Failed."); }
    finally { setBusy(false); }
  }
  return (
    <Modal title="Create User" onClose={() => onClose()}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Username"><input className="modal-input" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>
        <Field label="Password (8+)"><input type="password" className="modal-input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <Field label="Phone"><input className="modal-input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Email"><input className="modal-input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Opening Balance (₹)" className="col-span-2"><input type="number" min={0} className="modal-input" value={f.initialBalance} onChange={(e) => setF({ ...f, initialBalance: Number(e.target.value) })} /></Field>
      </div>
      <p className="text-[11px] text-gray-500 mt-2">Opening balance is deducted from your wallet automatically.</p>
      {err && <p className="text-xs text-red-400 bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2 mt-3">{err}</p>}
      <div className="flex gap-2 mt-4">
        <button onClick={() => onClose()} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-gray-300 border border-gray-700 hover:bg-gray-800 transition">Cancel</button>
        <button onClick={submit} disabled={busy} className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600 hover:brightness-110 disabled:opacity-50 transition flex items-center justify-center gap-2"><Save size={15} /> {busy ? "Creating…" : "Create User"}</button>
      </div>
    </Modal>
  );
}

function TransferModal({ user, dir, onClose }: { user: U; dir: "credit" | "debit"; onClose: (saved?: boolean) => void }) {
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const credit = dir === "credit";
  async function submit() {
    if (!amount || amount <= 0) { setErr("Enter an amount greater than 0."); return; }
    setBusy(true); setErr(null);
    try {
      await api.post("/bookie/transfer", { userId: user.id, amount, direction: dir });
      onClose(true);
    } catch (e: any) { setErr(e?.response?.data?.message || "Transfer failed."); }
    finally { setBusy(false); }
  }
  return (
    <Modal title={`${credit ? "Add funds to" : "Withdraw from"} ${user.username}`} onClose={() => onClose()}>
      <p className="text-sm text-gray-400 mb-3">User balance: <span className="text-emerald-300 font-semibold tabular-nums">{inr(user.wallet?.balance ?? 0)}</span></p>
      <Field label="Amount (₹)"><input type="number" min={0} className="modal-input" value={amount} onChange={(e) => setAmount(Number(e.target.value))} autoFocus /></Field>
      <p className="text-[11px] text-gray-500 mt-2">{credit ? "Deducted from your wallet and credited to the user." : "Pulled from the user back into your wallet."}</p>
      {err && <p className="text-xs text-red-400 bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2 mt-3">{err}</p>}
      <div className="flex gap-2 mt-4">
        <button onClick={() => onClose()} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-gray-300 border border-gray-700 hover:bg-gray-800 transition">Cancel</button>
        <button onClick={submit} disabled={busy} className={`flex-1 py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-50 transition hover:brightness-110 ${credit ? "bg-gradient-to-r from-emerald-500 to-green-600" : "bg-gradient-to-r from-amber-500 to-orange-600"}`}>
          {busy ? "Processing…" : credit ? `Add ${inr(amount)}` : `Withdraw ${inr(amount)}`}
        </button>
      </div>
    </Modal>
  );
}

function IconBtn({ title, onClick, className, children }: { title: string; onClick: () => void; className?: string; children: React.ReactNode }) {
  return <button title={title} onClick={onClick} className={`p-1.5 rounded-lg border border-gray-700 text-gray-500 bg-gray-900/40 transition ${className ?? ""}`}>{children}</button>;
}
