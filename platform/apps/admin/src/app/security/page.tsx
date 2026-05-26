"use client";
import { useState, useEffect } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { api } from "@/lib/api";
import { useLiveData } from "@/lib/hooks";
import { PageHeader, GlassCard, StatCard, Badge, DataTable, type Column } from "@/components/ui";
import { ShieldCheck, KeyRound, Monitor, Activity, LogOut, Globe, Plus, Trash2, Save, Lock, ShieldAlert } from "lucide-react";

interface Overview {
  staffTotal: number; staff2fa: number; activeSessions: number;
  adminActions24h: number; uniqueIps24h: number;
  ipAllowlist: string[]; antiDdosEnabled: boolean;
}
interface Session {
  id: string; userId: string; username: string; role: string;
  ip: string | null; userAgent: string | null; createdAt: string; expiresAt: string;
}
interface TwoFa {
  id: string; username: string; role: string; twoFactorEnabled: boolean;
  lastLoginAt: string | null; lastLoginIp: string | null;
}
interface AdminLog {
  id: string; action: string; ip: string | null; createdAt: string;
  actor: { username: string } | null;
}

const ROLE_TONE: Record<string, string> = { SUPER_ADMIN: "red", ADMIN: "amber", SUPER_MASTER: "violet", MASTER: "sky", AGENT: "emerald", USER: "slate" };

function deviceLabel(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg/.test(ua) ? "Edge" : /Chrome/.test(ua) ? "Chrome" : /Firefox/.test(ua) ? "Firefox" : /Safari/.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return `${browser}${os ? " · " + os : ""}`;
}

export default function SecurityPage() {
  const { data: ov, isLoading } = useLiveData<Overview>("/admin/security/overview", 15000);
  const { data: sessions } = useSWR<Session[]>("/admin/security/sessions");
  const { data: twofa } = useSWR<TwoFa[]>("/admin/security/2fa");
  const { data: logs } = useSWR<AdminLog[]>("/admin/logs?limit=25");

  const twofaPct = ov && ov.staffTotal > 0 ? Math.round((ov.staff2fa / ov.staffTotal) * 100) : 0;

  const revokeSession = async (id: string) => {
    if (!confirm("Revoke this session? The user will be signed out on next token refresh.")) return;
    try { await api.delete(`/admin/security/sessions/${id}`); globalMutate("/admin/security/sessions"); globalMutate("/admin/security/overview"); }
    catch { alert("Revoke failed"); }
  };
  const forceLogout = async (userId: string, username: string) => {
    if (!confirm(`Force logout ALL sessions for ${username}?`)) return;
    try { const r = await api.post("/admin/security/sessions/revoke-user", { userId }); globalMutate("/admin/security/sessions"); globalMutate("/admin/security/overview"); alert(`Revoked ${r.data.revoked} session(s)`); }
    catch { alert("Force logout failed"); }
  };

  const sessionCols: Column<Session>[] = [
    { key: "username", header: "User", sortValue: (r) => r.username, render: (r) => (
      <div className="flex items-center gap-2"><span className="font-medium text-gray-200">{r.username}</span><Badge tone={ROLE_TONE[r.role] ?? "slate"}>{r.role.replace("_", " ")}</Badge></div>
    ) },
    { key: "ip", header: "IP", render: (r) => <span className="font-mono text-xs text-gray-400">{r.ip ?? "—"}</span> },
    { key: "device", header: "Device", render: (r) => <span className="text-xs text-gray-400">{deviceLabel(r.userAgent)}</span> },
    { key: "createdAt", header: "Started", sortValue: (r) => r.createdAt, render: (r) => <span className="text-gray-500 text-xs whitespace-nowrap">{new Date(r.createdAt).toLocaleString("en-IN")}</span> },
    { key: "expiresAt", header: "Expires", sortValue: (r) => r.expiresAt, render: (r) => <span className="text-gray-500 text-xs whitespace-nowrap">{new Date(r.expiresAt).toLocaleDateString("en-IN")}</span> },
    { key: "actions", header: "", render: (r) => (
      <div className="flex items-center gap-1 justify-end">
        <button onClick={() => revokeSession(r.id)} title="Revoke session" className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition"><LogOut size={14} /></button>
        <button onClick={() => forceLogout(r.userId, r.username)} title="Force logout all sessions" className="px-2 py-1 rounded-lg text-[11px] font-semibold text-red-400 border border-red-500/30 hover:bg-red-500/10 transition">Logout all</button>
      </div>
    ) },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title="Security Center" subtitle="2FA coverage, active sessions, access control & admin activity" />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="2FA Coverage"    value={`${twofaPct}%`} Icon={KeyRound} accent={twofaPct >= 80 ? "emerald" : twofaPct >= 40 ? "amber" : "red"} loading={isLoading} sub={`${ov?.staff2fa ?? 0}/${ov?.staffTotal ?? 0} staff`} />
        <StatCard label="Active Sessions" value={String(ov?.activeSessions ?? 0)} Icon={Monitor} accent="violet"  loading={isLoading} />
        <StatCard label="Admin Actions"   value={String(ov?.adminActions24h ?? 0)} Icon={Activity} accent="sky"   loading={isLoading} sub="last 24h" />
        <StatCard label="Unique IPs"      value={String(ov?.uniqueIps24h ?? 0)} Icon={Globe}   accent="amber"   loading={isLoading} sub="last 24h" />
        <StatCard label="Staff Accounts"  value={String(ov?.staffTotal ?? 0)} Icon={ShieldCheck} accent="emerald" loading={isLoading} />
      </div>

      {/* Access control */}
      <AccessControl overview={ov} />

      {/* Active sessions */}
      <div>
        <h2 className="font-black text-gray-100 mb-3 flex items-center gap-2"><Monitor size={18} className="text-yellow-400" /> Active Sessions</h2>
        <DataTable
          columns={sessionCols}
          rows={sessions ?? []}
          loading={!sessions}
          searchKeys={["username", (r) => r.ip ?? ""]}
          searchPlaceholder="Search sessions…"
          pageSize={10}
          exportName="active-sessions"
          rowKey={(r) => r.id}
          emptyText="No active sessions"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* 2FA coverage */}
        <GlassCard className="p-5">
          <h2 className="font-black text-gray-100 mb-4 flex items-center gap-2"><KeyRound size={18} className="text-yellow-400" /> Two-Factor Status</h2>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {(twofa ?? []).map((u) => (
              <div key={u.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-900/40 border border-gray-700/50">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-200">{u.username}</span>
                  <Badge tone={ROLE_TONE[u.role] ?? "slate"}>{u.role.replace("_", " ")}</Badge>
                </div>
                {u.twoFactorEnabled ? <Badge tone="emerald"><Lock size={11} /> 2FA on</Badge> : <Badge tone="red">2FA off</Badge>}
              </div>
            ))}
            {(twofa?.length ?? 0) === 0 && <p className="text-gray-500 text-sm text-center py-6">No staff accounts</p>}
          </div>
        </GlassCard>

        {/* Admin activity */}
        <GlassCard className="p-5">
          <h2 className="font-black text-gray-100 mb-4 flex items-center gap-2"><Activity size={18} className="text-yellow-400" /> Recent Admin Activity</h2>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {(logs ?? []).map((l) => (
              <div key={l.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-900/40 border border-gray-700/50">
                <div className="min-w-0">
                  <span className="text-sm font-mono text-gray-300">{l.action}</span>
                  <span className="text-xs text-gray-500 ml-2">by {l.actor?.username ?? "system"}</span>
                </div>
                <span className="text-[11px] text-gray-500 whitespace-nowrap ml-2">{new Date(l.createdAt).toLocaleString("en-IN")}</span>
              </div>
            ))}
            {(logs?.length ?? 0) === 0 && <p className="text-gray-500 text-sm text-center py-6">No recent activity</p>}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function AccessControl({ overview }: { overview?: Overview }) {
  const [ips, setIps] = useState<string[]>([]);
  const [newIp, setNewIp] = useState("");
  const [ddos, setDdos] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (overview) { setIps(overview.ipAllowlist ?? []); setDdos(overview.antiDdosEnabled ?? false); }
  }, [overview]);

  const addIp = () => {
    const ip = newIp.trim();
    if (!ip || ips.includes(ip)) return;
    setIps([...ips, ip]); setNewIp("");
  };
  const save = async (nextIps = ips, nextDdos = ddos) => {
    setBusy(true);
    try { await api.post("/admin/security/config", { ipAllowlist: nextIps, antiDdosEnabled: nextDdos }); globalMutate("/admin/security/overview"); }
    catch { alert("Save failed"); }
    finally { setBusy(false); }
  };

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2 mb-1"><ShieldAlert size={18} className="text-yellow-400" /><h2 className="font-black text-gray-100">Access Control</h2></div>
      <p className="text-xs text-gray-500 mb-4">Admin IP allowlist & rate-limit posture. <span className="text-amber-400/80">Advisory config — enforced at the API gateway/middleware layer.</span></p>

      <div className="grid md:grid-cols-2 gap-5">
        {/* IP allowlist */}
        <div>
          <label className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold block mb-2">Admin IP Allowlist</label>
          <div className="flex gap-2 mb-3">
            <input value={newIp} onChange={(e) => setNewIp(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addIp()}
              placeholder="e.g. 203.0.113.5" className="flex-1 bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-yellow-400/60 placeholder:text-gray-600 font-mono" />
            <button onClick={addIp} className="px-3 py-2 rounded-lg text-sm font-bold text-gray-900 bg-gradient-to-r from-yellow-400 to-yellow-500 hover:brightness-110 transition"><Plus size={16} /></button>
          </div>
          <div className="space-y-1.5 mb-3 max-h-40 overflow-y-auto">
            {ips.length === 0 ? <p className="text-xs text-gray-600">No IPs — allowlist disabled (all IPs allowed)</p>
              : ips.map((ip) => (
                <div key={ip} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-gray-900/40 border border-gray-700/50">
                  <span className="font-mono text-sm text-gray-300">{ip}</span>
                  <button onClick={() => setIps(ips.filter((x) => x !== ip))} className="p-1 rounded text-gray-500 hover:text-red-400 transition"><Trash2 size={13} /></button>
                </div>
              ))}
          </div>
        </div>

        {/* Anti-DDoS / rate limit */}
        <div>
          <label className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold block mb-2">Rate Limiting / Anti-DDoS</label>
          <button onClick={() => { const v = !ddos; setDdos(v); save(ips, v); }}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition ${ddos ? "bg-emerald-500/10 border-emerald-500/40" : "bg-gray-900/40 border-gray-700"}`}>
            <span className="text-sm font-semibold text-gray-200">Strict rate limiting</span>
            <span className={`relative w-11 h-6 rounded-full transition ${ddos ? "bg-emerald-500" : "bg-gray-600"}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${ddos ? "left-[22px]" : "left-0.5"}`} />
            </span>
          </button>
        </div>
      </div>

      <button onClick={() => save()} disabled={busy} className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-gray-900 bg-gradient-to-r from-yellow-400 to-yellow-500 hover:brightness-110 disabled:opacity-50 transition">
        <Save size={15} /> {busy ? "Saving…" : "Save Allowlist"}
      </button>
    </GlassCard>
  );
}
