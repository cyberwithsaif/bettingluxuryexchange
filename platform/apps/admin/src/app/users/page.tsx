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
    minStake: string;
    maxStake: string;
    maxMarketExposure: string;
    maxDailyLoss: string;
    betDelayMs: number;
    fancyEnabled: boolean;
    casinoEnabled: boolean;
  } | null;
}

const ROLES = ["USER", "AGENT", "MASTER", "SUPER_MASTER", "ADMIN"];

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
  const { data: users } = useSWR<UserRecord[]>(swrKey);

  const refresh = () => mutate(swrKey);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display text-4xl">Users</h1>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-md bg-accent-grad px-4 py-2 font-bold text-ink shadow-glow hover:brightness-110"
        >
          + New user
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search username…"
          className="bg-panel border border-line rounded-md px-3 py-2 text-sm w-64 focus:outline-none focus:border-accent"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="bg-panel border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
        >
          <option value="">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-line bg-panel/60 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-panel text-[10px] uppercase tracking-wider text-white/50">
            <tr>
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
            {(users ?? []).map((u) => (
              <tr key={u.id} className="border-t border-line/60 hover:bg-panel2/20 transition cursor-pointer group" onClick={() => router.push(`/users/${u.id}`)}>
                <Td className="font-semibold group-hover:text-accent transition">{u.username}</Td>
                <Td>
                  <span className="text-xs px-2 py-0.5 rounded bg-accent/15 text-accentSoft border border-accent/20">
                    {u.role}
                  </span>
                </Td>
                <Td>
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded font-semibold",
                    u.status === "ACTIVE" ? "bg-ok/15 text-ok" : "bg-bad/15 text-bad"
                  )}>
                    {u.status}
                  </span>
                </Td>
                <Td className="tabular-nums">₹{Number(u.wallet?.balance ?? 0).toLocaleString("en-IN")}</Td>
                <Td className="tabular-nums text-bad">₹{Number(u.wallet?.exposure ?? 0).toLocaleString("en-IN")}</Td>
                <Td>{(u.partnershipBps / 100).toFixed(2)}%</Td>
                <Td className="tabular-nums">₹{Number(u.creditReference ?? 0).toLocaleString("en-IN")}</Td>
                <Td>
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    {/* Edit */}
                    <ActionBtn
                      title="Edit user"
                      icon={<Edit2 size={13} />}
                      className="hover:border-accent hover:text-accent"
                      onClick={() => setEditing(u)}
                    />
                    {/* Wallet Adjust */}
                    <ActionBtn
                      title="Wallet adjust"
                      icon={<Wallet size={13} />}
                      className="hover:border-yellow-400 hover:text-yellow-400"
                      onClick={async () => {
                        const amt = Number(prompt("Credit (+) or Debit (-) amount:") || 0);
                        if (!amt) return;
                        await api.post("/admin/wallet/adjust", { userId: u.id, amount: amt, note: "Admin adjustment" });
                        refresh();
                      }}
                    />
                    {/* Suspend / Activate */}
                    <ActionBtn
                      title={u.status === "ACTIVE" ? "Suspend" : "Activate"}
                      icon={u.status === "ACTIVE" ? <UserX size={13} /> : <UserCheck size={13} />}
                      className={u.status === "ACTIVE" ? "hover:border-bad hover:text-bad" : "hover:border-ok hover:text-ok"}
                      onClick={async () => {
                        await api.patch(`/users/${u.id}/status`, {
                          status: u.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE",
                        });
                        refresh();
                      }}
                    />
                    {/* Reset Password */}
                    <ActionBtn
                      title="Reset password"
                      icon={<KeyRound size={13} />}
                      className="hover:border-purple-400 hover:text-purple-400"
                      onClick={async () => {
                        const pwd = prompt("New password (min 8 chars):");
                        if (!pwd || pwd.length < 8) { alert("Min 8 characters."); return; }
                        await api.patch(`/users/${u.id}/password`, { password: pwd });
                        alert("Password reset successfully.");
                      }}
                    />
                  </div>
                </Td>
              </tr>
            ))}
            {(!users || users.length === 0) && (
              <tr><td colSpan={8} className="text-center py-10 text-white/50">No users found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditUserModal
          user={editing}
          onClose={(saved) => { setEditing(null); if (saved) refresh(); }}
        />
      )}
      {creating && (
        <CreateUserModal
          onClose={(saved) => { setCreating(false); if (saved) refresh(); }}
        />
      )}
    </div>
  );
}

// ─── Edit User Modal ──────────────────────────────────────────────────────────

function EditUserModal({ user, onClose }: { user: UserRecord; onClose: (saved?: boolean) => void }) {
  const [tab, setTab] = useState<"profile" | "limits">("profile");

  // Profile form
  const [profile, setProfile] = useState({
    role: user.role,
    partnershipBps: user.partnershipBps,
    creditReference: Number(user.creditReference ?? 0),
  });

  // Limits form
  const [limits, setLimits] = useState({
    minStake:           Number(user.limits?.minStake          ?? 100),
    maxStake:           Number(user.limits?.maxStake          ?? 100000),
    maxMarketExposure:  Number(user.limits?.maxMarketExposure ?? 1000000),
    maxDailyLoss:       Number(user.limits?.maxDailyLoss      ?? 500000),
    betDelayMs:         user.limits?.betDelayMs               ?? 0,
    fancyEnabled:       user.limits?.fancyEnabled             ?? true,
    casinoEnabled:      user.limits?.casinoEnabled            ?? true,
  });

  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const [ok, setOk]     = useState<string | null>(null);

  async function saveProfile() {
    setBusy(true); setErr(null); setOk(null);
    try {
      await api.patch(`/users/${user.id}`, {
        role: profile.role,
        partnershipBps: profile.partnershipBps,
        creditReference: profile.creditReference,
      });
      setOk("Profile saved.");
    } catch (e: any) {
      setErr(e?.response?.data?.message || "Failed to save profile.");
    } finally { setBusy(false); }
  }

  async function saveLimits() {
    setBusy(true); setErr(null); setOk(null);
    try {
      await api.patch(`/users/${user.id}/limits`, {
        minStake: limits.minStake,
        maxStake: limits.maxStake,
        maxMarketExposure: limits.maxMarketExposure,
        maxDailyLoss: limits.maxDailyLoss,
        betDelayMs: limits.betDelayMs,
        fancyEnabled: limits.fancyEnabled,
        casinoEnabled: limits.casinoEnabled,
      });
      setOk("Limits saved.");
    } catch (e: any) {
      setErr(e?.response?.data?.message || "Failed to save limits.");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-panel shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <div>
            <h2 className="font-display text-2xl">Edit User</h2>
            <p className="text-xs text-white/50 mt-0.5">{user.username} · <span className="text-accentSoft">{user.role}</span></p>
          </div>
          <button onClick={() => onClose()} className="p-2 rounded-md hover:bg-white/5 transition">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-line">
          {(["profile", "limits"] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); setErr(null); setOk(null); }}
              className={cn(
                "flex-1 py-2.5 text-sm font-semibold capitalize transition border-b-2",
                tab === t ? "border-accent text-white" : "border-transparent text-white/50 hover:text-white"
              )}
            >{t}</button>
          ))}
        </div>

        <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
          {/* Status feedback */}
          {err && <div className="text-xs text-bad bg-bad/15 border border-bad/40 rounded px-3 py-2">{err}</div>}
          {ok  && <div className="text-xs text-ok  bg-ok/15  border border-ok/30  rounded px-3 py-2">{ok}</div>}

          {/* Profile Tab */}
          {tab === "profile" && (
            <div className="space-y-4">
              <Field label="Role">
                <select className="input" value={profile.role} onChange={(e) => setProfile({ ...profile, role: e.target.value })}>
                  {ROLES.map((r) => <option key={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Partnership % (basis pts — 100 = 1%)">
                <input type="number" min={0} max={10000} className="input"
                  value={profile.partnershipBps}
                  onChange={(e) => setProfile({ ...profile, partnershipBps: Number(e.target.value) })}
                />
              </Field>
              <Field label="Credit Reference (₹)">
                <input type="number" min={0} className="input"
                  value={profile.creditReference}
                  onChange={(e) => setProfile({ ...profile, creditReference: Number(e.target.value) })}
                />
              </Field>
              <div className="pt-2">
                <button onClick={saveProfile} disabled={busy}
                  className="w-full flex items-center justify-center gap-2 rounded-md bg-accent-grad py-2.5 font-bold text-ink shadow-glow disabled:opacity-50 hover:brightness-110">
                  <Save size={15} /> {busy ? "Saving…" : "Save Profile"}
                </button>
              </div>
            </div>
          )}

          {/* Limits Tab */}
          {tab === "limits" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Min Stake (₹)">
                  <input type="number" min={1} className="input"
                    value={limits.minStake}
                    onChange={(e) => setLimits({ ...limits, minStake: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Max Stake (₹)">
                  <input type="number" min={100} className="input"
                    value={limits.maxStake}
                    onChange={(e) => setLimits({ ...limits, maxStake: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Max Market Exposure (₹)">
                  <input type="number" min={1000} className="input"
                    value={limits.maxMarketExposure}
                    onChange={(e) => setLimits({ ...limits, maxMarketExposure: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Max Daily Loss (₹)">
                  <input type="number" min={1000} className="input"
                    value={limits.maxDailyLoss}
                    onChange={(e) => setLimits({ ...limits, maxDailyLoss: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Bet Delay (ms)">
                  <input type="number" min={0} max={10000} className="input"
                    value={limits.betDelayMs}
                    onChange={(e) => setLimits({ ...limits, betDelayMs: Number(e.target.value) })}
                  />
                </Field>
              </div>

              <div className="space-y-2">
                {([
                  ["fancyEnabled",  "Enable Fancy/Session Markets"],
                  ["casinoEnabled", "Enable Casino Games"],
                ] as [keyof typeof limits, string][]).map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between rounded-lg border border-line bg-panel/40 px-4 py-2.5 cursor-pointer hover:border-accent transition">
                    <span className="text-sm">{label}</span>
                    <input type="checkbox" className="w-4 h-4 accent-orange-500"
                      checked={!!(limits[key])}
                      onChange={(e) => setLimits({ ...limits, [key]: e.target.checked })}
                    />
                  </label>
                ))}
              </div>

              <div className="pt-1">
                <button onClick={saveLimits} disabled={busy}
                  className="w-full flex items-center justify-center gap-2 rounded-md bg-accent-grad py-2.5 font-bold text-ink shadow-glow disabled:opacity-50 hover:brightness-110">
                  <Save size={15} /> {busy ? "Saving…" : "Save Limits"}
                </button>
              </div>
            </div>
          )}
        </div>

        <style jsx>{`
          :global(.input){width:100%;background:#0d0e15;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:9px 11px;font-size:14px;color:#e6e7eb}
          :global(.input:focus){outline:none;border-color:#ff7a18}
        `}</style>
      </div>
    </div>
  );
}

// ─── Create User Modal ─────────────────────────────────────────────────────────

function CreateUserModal({ onClose }: { onClose: (saved?: boolean) => void }) {
  const [form, setForm] = useState({
    username: "", password: "", role: "USER", partnershipBps: 0, creditReference: 0,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">New User</h2>
          <button onClick={() => onClose()} className="p-2 rounded-md hover:bg-white/5"><X size={18} /></button>
        </div>

        <Field label="Username"><input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
        <Field label="Password (min 8 chars)"><input type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <Field label="Role">
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Partnership (bps)">
            <input type="number" min={0} max={10000} className="input" value={form.partnershipBps}
              onChange={(e) => setForm({ ...form, partnershipBps: Number(e.target.value) })} />
          </Field>
          <Field label="Credit Reference (₹)">
            <input type="number" min={0} className="input" value={form.creditReference}
              onChange={(e) => setForm({ ...form, creditReference: Number(e.target.value) })} />
          </Field>
        </div>

        {err && <div className="text-xs text-bad bg-bad/15 border border-bad/40 rounded px-2 py-1.5">{err}</div>}

        <div className="flex gap-2 pt-1">
          <button onClick={() => onClose()} className="flex-1 py-2 rounded border border-line text-sm">Cancel</button>
          <button disabled={busy} onClick={async () => {
            if (!form.username || form.password.length < 8) { setErr("Username required and password must be 8+ chars."); return; }
            setBusy(true); setErr(null);
            try { await api.post("/users/downline", form); onClose(true); }
            catch (e: any) { setErr(e?.response?.data?.message || "Failed"); }
            finally { setBusy(false); }
          }} className="flex-1 py-2 rounded bg-accent-grad font-bold text-ink shadow-glow disabled:opacity-50 text-sm">
            {busy ? "Creating…" : "Create User"}
          </button>
        </div>

        <style jsx>{`
          :global(.input){width:100%;background:#0d0e15;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:9px 11px;font-size:14px;color:#e6e7eb}
          :global(.input:focus){outline:none;border-color:#ff7a18}
        `}</style>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function ActionBtn({ title, icon, className, onClick }: {
  title: string; icon: React.ReactNode; className?: string; onClick: () => void;
}) {
  return (
    <button title={title} onClick={onClick}
      className={cn("p-1.5 rounded border border-line transition text-white/60", className)}>
      {icon}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs uppercase tracking-wider text-white/60">{label}</span><div className="mt-1">{children}</div></label>;
}
function Th({ children }: { children: React.ReactNode }) { return <th className="px-3 py-2 text-left">{children}</th>; }
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 ${className ?? ""}`}>{children}</td>;
}
