"use client";
import useSWR, { mutate } from "swr";
import { useState } from "react";
import { api } from "@/lib/api";

export default function UsersPage() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const { data: users } = useSWR(`/users/downline?${new URLSearchParams({ q, role }).toString()}`);

  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-4xl">Users</h1>
        <button onClick={() => setOpen(true)} className="rounded-md bg-accent-grad px-4 py-2 font-bold text-ink shadow-glow">+ New user</button>
      </div>
      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search username…" className="bg-panel border border-line rounded-md px-3 py-2 text-sm w-64 focus:outline-none focus:border-accent" />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="bg-panel border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent">
          <option value="">All roles</option>
          <option value="USER">User</option><option value="AGENT">Agent</option><option value="MASTER">Master</option><option value="SUPER_MASTER">Super Master</option><option value="ADMIN">Admin</option>
        </select>
      </div>

      <div className="rounded-xl border border-line bg-panel/60 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-panel text-[10px] uppercase tracking-wider text-white/50">
            <tr><Th>Username</Th><Th>Role</Th><Th>Status</Th><Th>Balance</Th><Th>Exposure</Th><Th>Partnership</Th><Th>Actions</Th></tr>
          </thead>
          <tbody>
            {(users ?? []).map((u: any) => (
              <tr key={u.id} className="border-t border-line/60">
                <Td className="font-semibold">{u.username}</Td>
                <Td className="text-xs">{u.role}</Td>
                <Td><span className={"text-xs px-2 py-0.5 rounded " + (u.status === "ACTIVE" ? "bg-ok/15 text-ok" : "bg-bad/15 text-bad")}>{u.status}</span></Td>
                <Td className="tabular-nums">{Number(u.wallet?.balance ?? 0).toLocaleString("en-IN")}</Td>
                <Td className="tabular-nums">{Number(u.wallet?.exposure ?? 0).toLocaleString("en-IN")}</Td>
                <Td>{(u.partnershipBps / 100).toFixed(2)}%</Td>
                <Td className="flex gap-1">
                  <button
                    onClick={async () => {
                      const amt = Number(prompt("Credit amount (positive) or debit (negative):") || 0);
                      if (!amt) return;
                      await api.post("/admin/wallet/adjust", { userId: u.id, amount: amt, note: "Admin adjustment" });
                      mutate(`/users/downline?${new URLSearchParams({ q, role }).toString()}`);
                    }}
                    className="text-xs px-2 py-1 rounded border border-line hover:border-accent">Adjust</button>
                  <button
                    onClick={async () => {
                      await api.patch(`/users/${u.id}/status`, { status: u.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" });
                      mutate(`/users/downline?${new URLSearchParams({ q, role }).toString()}`);
                    }}
                    className="text-xs px-2 py-1 rounded border border-line hover:border-bad">{u.status === "ACTIVE" ? "Suspend" : "Activate"}</button>
                </Td>
              </tr>
            ))}
            {(!users || users.length === 0) && <tr><td colSpan={7} className="text-center py-8 text-white/50">No users</td></tr>}
          </tbody>
        </table>
      </div>

      {open && <CreateUserModal onClose={(saved) => { setOpen(false); if (saved) mutate(`/users/downline?${new URLSearchParams({ q, role }).toString()}`); }} />}
    </div>
  );
}
function Th({ children }: { children: React.ReactNode }) { return <th className="px-3 py-2 text-left">{children}</th>; }
function Td({ children, className }: { children: React.ReactNode; className?: string }) { return <td className={`px-3 py-2 ${className ?? ""}`}>{children}</td>; }

function CreateUserModal({ onClose }: { onClose: (saved?: boolean) => void }) {
  const [form, setForm] = useState({ username: "", password: "", role: "USER", partnershipBps: 0, creditReference: 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-6">
        <h2 className="font-display text-2xl">New user</h2>
        <div className="space-y-3 mt-4">
          <Field label="Username"><input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
          <Field label="Password"><input type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label="Role">
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {["USER", "AGENT", "MASTER", "SUPER_MASTER", "ADMIN"].map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Partnership (basis points, 100 = 1%)">
            <input type="number" min={0} max={10000} className="input" value={form.partnershipBps} onChange={(e) => setForm({ ...form, partnershipBps: Number(e.target.value) })} />
          </Field>
          <Field label="Credit reference">
            <input type="number" min={0} className="input" value={form.creditReference} onChange={(e) => setForm({ ...form, creditReference: Number(e.target.value) })} />
          </Field>
          {err && <div className="text-xs text-bad bg-bad/15 border border-bad/40 rounded px-2 py-1.5">{err}</div>}
        </div>
        <div className="mt-5 flex gap-2 justify-end">
          <button onClick={() => onClose()} className="px-4 py-2 rounded border border-line">Cancel</button>
          <button disabled={busy} onClick={async () => {
            setBusy(true); setErr(null);
            try { await api.post("/users/downline", form); onClose(true); }
            catch (e: any) { setErr(e?.response?.data?.message || "Failed"); }
            finally { setBusy(false); }
          }} className="px-4 py-2 rounded bg-accent-grad font-bold text-ink shadow-glow disabled:opacity-50">{busy ? "Saving…" : "Create"}</button>
        </div>
        <style jsx>{`
          :global(.input){width:100%;background:#0d0e15;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:9px 11px;font-size:14px;color:#e6e7eb}
          :global(.input:focus){outline:none;border-color:#ff7a18}
        `}</style>
      </div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs uppercase tracking-wider text-white/60">{label}</span><div className="mt-1">{children}</div></label>;
}
