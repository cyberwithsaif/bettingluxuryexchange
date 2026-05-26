"use client";
import { useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";
import { PageHeader, GlassCard, Badge, DataTable, type Column } from "@/components/ui";
import { ShieldCheck, Check, X } from "lucide-react";

interface Staff {
  id: string; username: string; email: string | null; role: string;
  status: string; lastLoginAt: string | null; lastLoginIp: string | null; createdAt: string;
}

const ROLES = ["SUPER_ADMIN", "ADMIN", "SUPER_MASTER", "MASTER", "AGENT", "USER"] as const;
const ROLE_TONE: Record<string, string> = {
  SUPER_ADMIN: "red", ADMIN: "amber", SUPER_MASTER: "violet", MASTER: "sky", AGENT: "emerald", USER: "slate",
};

// Descriptive capability matrix (mirrors the API's @Roles guards & finance gates).
const PERMISSIONS: { label: string; roles: string[] }[] = [
  { label: "Full platform access",       roles: ["SUPER_ADMIN"] },
  { label: "Manage admin roles",         roles: ["SUPER_ADMIN"] },
  { label: "Edit user balances",         roles: ["SUPER_ADMIN", "ADMIN"] },
  { label: "Approve withdrawals",        roles: ["SUPER_ADMIN", "ADMIN"] },
  { label: "Manage markets & settle",    roles: ["SUPER_ADMIN", "ADMIN"] },
  { label: "Manage game RTP / settings", roles: ["SUPER_ADMIN", "ADMIN"] },
  { label: "View reports & risk",        roles: ["SUPER_ADMIN", "ADMIN", "SUPER_MASTER", "MASTER"] },
  { label: "Manage downline / agents",   roles: ["SUPER_ADMIN", "ADMIN", "SUPER_MASTER", "MASTER", "AGENT"] },
];

export default function RolesPage() {
  const me = useAuthStore((s) => s.user);
  const { data, isLoading } = useSWR<Staff[]>("/admin/staff");
  const [saving, setSaving] = useState<string | null>(null);

  const changeRole = async (id: string, role: string, username: string) => {
    if (!confirm(`Change ${username}'s role to ${role.replace("_", " ")}?`)) return;
    setSaving(id);
    try {
      await api.patch(`/admin/users/${id}/role`, { role });
      globalMutate("/admin/staff");
    } catch (e: any) {
      alert(e?.response?.data?.message ?? "Role change failed");
    } finally {
      setSaving(null);
    }
  };

  const counts = (data ?? []).reduce<Record<string, number>>((m, s) => { m[s.role] = (m[s.role] ?? 0) + 1; return m; }, {});
  const isSuper = me?.role === "SUPER_ADMIN";

  const columns: Column<Staff>[] = [
    { key: "username", header: "User", sortValue: (r) => r.username, render: (r) => (
      <div>
        <div className="font-medium text-gray-200">{r.username}{r.id === me?.id && <span className="ml-1.5 text-[10px] text-yellow-400">(you)</span>}</div>
        {r.email && <div className="text-[11px] text-gray-500">{r.email}</div>}
      </div>
    ) },
    { key: "role", header: "Current Role", sortValue: (r) => r.role, render: (r) => <Badge tone={ROLE_TONE[r.role] ?? "slate"}>{r.role.replace("_", " ")}</Badge> },
    { key: "status", header: "Status", render: (r) => <Badge tone={r.status === "ACTIVE" ? "emerald" : "amber"}>{r.status}</Badge> },
    { key: "lastLoginAt", header: "Last Login", sortValue: (r) => r.lastLoginAt ?? "", render: (r) => (
      <span className="text-gray-500 text-xs whitespace-nowrap">{r.lastLoginAt ? new Date(r.lastLoginAt).toLocaleString("en-IN") : "never"}</span>
    ) },
    { key: "lastLoginIp", header: "IP", render: (r) => <span className="font-mono text-xs text-gray-500">{r.lastLoginIp ?? "—"}</span> },
    { key: "actions", header: "Assign Role", render: (r) => {
      const lockedSelf = r.id === me?.id;
      const lockedSuper = r.role === "SUPER_ADMIN" && !isSuper;
      const disabled = saving === r.id || lockedSelf || lockedSuper;
      return (
        <select
          value={r.role}
          disabled={disabled}
          onChange={(e) => changeRole(r.id, e.target.value, r.username)}
          className="bg-gray-900/70 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-yellow-400/60 disabled:opacity-40 disabled:cursor-not-allowed"
          title={lockedSelf ? "You can't change your own role" : lockedSuper ? "Only a Super Admin can change this" : undefined}
        >
          {ROLES.map((role) => <option key={role} value={role}>{role.replace("_", " ")}</option>)}
        </select>
      );
    } },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title="Admin & Role Management" subtitle="Staff accounts, roles and capability matrix" />

      {!isSuper && (
        <GlassCard className="px-4 py-3 border-amber-500/30">
          <p className="text-sm text-amber-300">You are signed in as <b>{me?.role?.replace("_", " ")}</b>. Only a Super Admin can grant or revoke the Super Admin role.</p>
        </GlassCard>
      )}

      {/* Role counts */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {ROLES.map((role) => (
          <GlassCard key={role} glow className="p-3 text-center">
            <div className="flex justify-center mb-1.5"><Badge tone={ROLE_TONE[role]}>{role.replace("_", " ")}</Badge></div>
            <div className="text-2xl font-black tabular-nums text-gray-100">{role === "USER" ? "—" : counts[role] ?? 0}</div>
          </GlassCard>
        ))}
      </div>

      {/* Permission matrix */}
      <GlassCard className="p-5 overflow-x-auto">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck size={18} className="text-yellow-400" />
          <h2 className="font-black text-gray-100">Capability Matrix</h2>
        </div>
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-gray-700/60">
              <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Capability</th>
              {ROLES.filter((r) => r !== "USER").map((role) => (
                <th key={role} className="px-3 py-2 text-center text-[11px] uppercase tracking-wider text-gray-500 font-semibold">{role.replace("_", " ")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((p) => (
              <tr key={p.label} className="border-b border-gray-800/40">
                <td className="px-3 py-2.5 text-gray-300">{p.label}</td>
                {ROLES.filter((r) => r !== "USER").map((role) => (
                  <td key={role} className="px-3 py-2.5 text-center">
                    {p.roles.includes(role)
                      ? <Check size={15} className="text-emerald-400 inline" />
                      : <X size={15} className="text-gray-700 inline" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>

      <DataTable
        columns={columns}
        rows={data ?? []}
        loading={isLoading}
        searchKeys={["username", "role", (r) => r.email ?? ""]}
        searchPlaceholder="Search staff…"
        pageSize={15}
        exportName="admin-staff"
        rowKey={(r) => r.id}
        emptyText="No staff accounts"
      />
    </div>
  );
}
