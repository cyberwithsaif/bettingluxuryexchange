"use client";
import useSWR, { mutate } from "swr";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Edit2, Wallet, UserX, UserCheck, KeyRound, X, Save, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

interface UserRecord {
  id: string;
  username: string;
  role: string;
  status: string;
  partnershipBps: number;
  creditReference: string;
  createdAt: string;
  wallet?: { balance: string; exposure: string } | null;
  limits?: {
    minStake: string; maxStake: string; maxMarketExposure: string;
    maxDailyLoss: string; betDelayMs: number; fancyEnabled: boolean; casinoEnabled: boolean;
  } | null;
}

const ROLES = ["USER", "AGENT", "MASTER", "SUPER_MASTER", "ADMIN"];

const STATUS_BG: Record<string, string> = {
  ACTIVE:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  SUSPENDED: "bg-gray-800  text-yellow-700  border-yellow-200",
  LOCKED:    "bg-red-50     text-red-600     border-red-200",
  CLOSED:    "bg-gray-700   text-gray-500    border-gray-700",
  BANNED:    "bg-red-100    text-red-700     border-red-300",
};

function buildKey(q: string, role: string) {
  return `/users/downline?${new URLSearchParams({ q, role }).toString()}`;
}

export default function UsersPage() {
  const router = useRouter();
  const [q, setQ]       = useState("");
  const [role, setRole] = useState("");
  const [editing, setEditing] = useState<UserRecord | null>(null);
  const [creating, setCreating] = useState(false);

  const swrKey = buildKey(q, role);
  const { data: users, isLoading } = useSWR<UserRecord[]>(swrKey);

  const refresh = () => mutate(swrKey);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-black text-gray-100">Users</h1>
        <button
          onClick={() => setCreating(true)}
          className="btn-primary text-sm"
        >
          + New User
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search username…"
          className="border border-yellow-200 bg-gray-800 rounded-lg px-3 py-2 text-sm w-64 text-gray-200 placeholder-gray-400 focus:outline-none focus:border-yellow-400 shadow-sm"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="border border-yellow-200 bg-gray-800 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-yellow-400 shadow-sm"
        >
          <option value="">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-yellow-100 bg-gray-800 overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-800/80 border-b border-yellow-100">
              <Th>Username</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Balance</Th>
              <Th>Exposure</Th>
              <Th>Partnership</Th>
              <Th>Credit Ref</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={8} className="text-center py-10 text-gray-500">Loading…</td></tr>
            )}
            {!isLoading && (users ?? []).map((u) => (
              <tr
                key={u.id}
                className="border-t border-gray-100 hover:bg-gray-800/40 transition cursor-pointer group"
                onClick={() => router.push(`/users/${u.id}`)}
              >
                <Td className="font-semibold text-gray-100 group-hover:text-yellow-700 transition">{u.username}</Td>
                <Td>
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    {u.role}
                  </span>
                </Td>
                <Td>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-semibold border", STATUS_BG[u.status] ?? "bg-gray-700 text-gray-500 border-gray-700")}>
                    {u.status}
                  </span>
                </Td>
                <Td className="tabular-nums text-emerald-700 font-semibold">₹{Number(u.wallet?.balance ?? 0).toLocaleString("en-IN")}</Td>
                <Td className="tabular-nums text-red-500 font-semibold">₹{Number(u.wallet?.exposure ?? 0).toLocaleString("en-IN")}</Td>
                <Td className="text-gray-400">{(u.partnershipBps / 100).toFixed(2)}%</Td>
                <Td className="tabular-nums text-gray-300">₹{Number(u.creditReference ?? 0).toLocaleString("en-IN")}</Td>
                <Td>
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <ActionBtn title="Edit user" icon={<Edit2 size={13} />}
                      className="hover:border-yellow-400 hover:text-yellow-600 hover:bg-gray-800"
                      onClick={() => setEditing(u)} />
                    <ActionBtn title="Wallet adjust" icon={<Wallet size={13} />}
                      className="hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50"
                      onClick={async () => {
                        const amt = Number(prompt("Credit (+) or Debit (-) amount:") || 0);
                        if (!amt) return;
                        await api.post("/admin/wallet/adjust", { userId: u.id, amount: amt, note: "Admin adjustment" });
                        refresh();
                      }} />
                    <ActionBtn
                      title={u.status === "ACTIVE" ? "Suspend" : "Activate"}
                      icon={u.status === "ACTIVE" ? <UserX size={13} /> : <UserCheck size={13} />}
                      className={u.status === "ACTIVE" ? "hover:border-red-400 hover:text-red-500 hover:bg-red-50" : "hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50"}
                      onClick={async () => {
                        await api.patch(`/users/${u.id}/status`, { status: u.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" });
                        refresh();
                      }} />
                    <ActionBtn title="Reset password" icon={<KeyRound size={13} />}
                      className="hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50"
                      onClick={async () => {
                        const pwd = prompt("New password (min 8 chars):");
                        if (!pwd || pwd.length < 8) { alert("Min 8 characters."); return; }
                        await api.patch(`/users/${u.id}/password`, { password: pwd });
                        alert("Password reset successfully.");
                      }} />
                  </div>
                </Td>
              </tr>
            ))}
            {!isLoading && (!users || users.length === 0) && (
              <tr><td colSpan={8} className="text-center py-12 text-gray-500">No users found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && <EditUserModal user={editing} onClose={(saved) => { setEditing(null); if (saved) refresh(); }} />}
      {creating && <CreateUserModal onClose={(saved) => { setCreating(false); if (saved) refresh(); }} />}
    </div>
  );
}

// ─── Edit User Modal ──────────────────────────────────────────────────────────

function EditUserModal({ user, onClose }: { user: UserRecord; onClose: (saved?: boolean) => void }) {
  const [tab, setTab] = useState<"profile" | "limits">("profile");
  const [profile, setProfile] = useState({
    role: user.role,
    partnershipBps: user.partnershipBps,
    creditReference: Number(user.creditReference ?? 0),
  });
  const [limits, setLimits] = useState({
    minStake:          Number(user.limits?.minStake          ?? 100),
    maxStake:          Number(user.limits?.maxStake          ?? 100000),
    maxMarketExposure: Number(user.limits?.maxMarketExposure ?? 1000000),
    maxDailyLoss:      Number(user.limits?.maxDailyLoss      ?? 500000),
    betDelayMs:        user.limits?.betDelayMs               ?? 0,
    fancyEnabled:      user.limits?.fancyEnabled             ?? true,
    casinoEnabled:     user.limits?.casinoEnabled            ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const [ok, setOk]     = useState<string | null>(null);

  async function saveProfile() {
    setBusy(true); setErr(null); setOk(null);
    try {
      await api.patch(`/users/${user.id}`, { role: profile.role, partnershipBps: profile.partnershipBps, creditReference: profile.creditReference });
      setOk("Profile saved.");
    } catch (e: any) { setErr(e?.response?.data?.message || "Failed."); }
    finally { setBusy(false); }
  }

  async function saveLimits() {
    setBusy(true); setErr(null); setOk(null);
    try {
      await api.patch(`/users/${user.id}/limits`, limits);
      setOk("Limits saved.");
    } catch (e: any) { setErr(e?.response?.data?.message || "Failed."); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-yellow-100 bg-gray-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-black text-gray-100">Edit User</h2>
            <p className="text-xs text-gray-500 mt-0.5">{user.username} Â· <span className="text-yellow-600 font-semibold">{user.role}</span></p>
          </div>
          <button onClick={() => onClose()} className="p-2 rounded-lg hover:bg-gray-700 text-gray-500 transition"><X size={18} /></button>
        </div>

        <div className="flex border-b border-gray-100">
          {(["profile", "limits"] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); setErr(null); setOk(null); }}
              className={cn(
                "flex-1 py-2.5 text-sm font-semibold capitalize transition border-b-2",
                tab === t ? "border-yellow-400 text-yellow-700" : "border-transparent text-gray-500 hover:text-gray-300"
              )}>{t}</button>
          ))}
        </div>

        <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
          {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}
          {ok  && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{ok}</div>}

          {tab === "profile" && (
            <div className="space-y-4">
              <Field label="Role">
                <select className="modal-input" value={profile.role} onChange={(e) => setProfile({ ...profile, role: e.target.value })}>
                  {ROLES.map((r) => <option key={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Partnership % (basis pts – 100 = 1%)">
                <input type="number" min={0} max={10000} className="modal-input"
                  value={profile.partnershipBps}
                  onChange={(e) => setProfile({ ...profile, partnershipBps: Number(e.target.value) })} />
              </Field>
              <Field label="Credit Reference (₹)">
                <input type="number" min={0} className="modal-input"
                  value={profile.creditReference}
                  onChange={(e) => setProfile({ ...profile, creditReference: Number(e.target.value) })} />
              </Field>
              <button onClick={saveProfile} disabled={busy} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
                <Save size={15} /> {busy ? "Saving…" : "Save Profile"}
              </button>
            </div>
          )}

          {tab === "limits" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Min Stake (₹)">
                  <input type="number" min={1} className="modal-input" value={limits.minStake}
                    onChange={(e) => setLimits({ ...limits, minStake: Number(e.target.value) })} />
                </Field>
                <Field label="Max Stake (₹)">
                  <input type="number" min={100} className="modal-input" value={limits.maxStake}
                    onChange={(e) => setLimits({ ...limits, maxStake: Number(e.target.value) })} />
                </Field>
                <Field label="Max Market Exposure (₹)">
                  <input type="number" min={1000} className="modal-input" value={limits.maxMarketExposure}
                    onChange={(e) => setLimits({ ...limits, maxMarketExposure: Number(e.target.value) })} />
                </Field>
                <Field label="Max Daily Loss (₹)">
                  <input type="number" min={1000} className="modal-input" value={limits.maxDailyLoss}
                    onChange={(e) => setLimits({ ...limits, maxDailyLoss: Number(e.target.value) })} />
                </Field>
                <Field label="Bet Delay (ms)">
                  <input type="number" min={0} max={10000} className="modal-input" value={limits.betDelayMs}
                    onChange={(e) => setLimits({ ...limits, betDelayMs: Number(e.target.value) })} />
                </Field>
              </div>
              <div className="space-y-2">
                {([["fancyEnabled", "Enable Fancy/Session Markets"], ["casinoEnabled", "Enable Casino Games"]] as [keyof typeof limits, string][]).map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between rounded-lg border border-yellow-100 bg-gray-800/40 px-4 py-2.5 cursor-pointer hover:border-yellow-300 transition">
                    <span className="text-sm text-gray-300 font-medium">{label}</span>
                    <input type="checkbox" className="w-4 h-4 accent-yellow-500"
                      checked={!!(limits[key])}
                      onChange={(e) => setLimits({ ...limits, [key]: e.target.checked })} />
                  </label>
                ))}
              </div>
              <button onClick={saveLimits} disabled={busy} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
                <Save size={15} /> {busy ? "Saving…" : "Save Limits"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Create User Modal ─────────────────────────────────────────────────────────

function CreateUserModal({ onClose }: { onClose: (saved?: boolean) => void }) {
  const [form, setForm] = useState({ username: "", password: "", role: "USER", partnershipBps: 0, creditReference: 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-yellow-100 bg-gray-800 shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-gray-100">New User</h2>
          <button onClick={() => onClose()} className="p-2 rounded-lg hover:bg-gray-700 text-gray-500"><X size={18} /></button>
        </div>

        <Field label="Username"><input className="modal-input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
        <Field label="Password (min 8 chars)"><input type="password" className="modal-input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <Field label="Role">
          <select className="modal-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Partnership (bps)">
            <input type="number" min={0} max={10000} className="modal-input" value={form.partnershipBps}
              onChange={(e) => setForm({ ...form, partnershipBps: Number(e.target.value) })} />
          </Field>
          <Field label="Credit Reference (₹)">
            <input type="number" min={0} className="modal-input" value={form.creditReference}
              onChange={(e) => setForm({ ...form, creditReference: Number(e.target.value) })} />
          </Field>
        </div>

        {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}

        <div className="flex gap-2 pt-1">
          <button onClick={() => onClose()} className="btn-secondary flex-1 text-sm">Cancel</button>
          <button disabled={busy} onClick={async () => {
            if (!form.username || form.password.length < 8) { setErr("Username required and password must be 8+ chars."); return; }
            setBusy(true); setErr(null);
            try { await api.post("/users/downline", form); onClose(true); }
            catch (e: any) { setErr(e?.response?.data?.message || "Failed"); }
            finally { setBusy(false); }
          }} className="btn-primary flex-1 text-sm disabled:opacity-50">
            {busy ? "Creating…" : "Create User"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function ActionBtn({ title, icon, className, onClick }: { title: string; icon: React.ReactNode; className?: string; onClick: () => void }) {
  return (
    <button title={title} onClick={onClick}
      className={cn("p-1.5 rounded-lg border border-gray-700 transition text-gray-500 bg-gray-800", className)}>
      {icon}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 text-gray-300 ${className ?? ""}`}>{children}</td>;
}
