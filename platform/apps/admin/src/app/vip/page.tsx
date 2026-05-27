"use client";
import { useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { api } from "@/lib/api";
import { PageHeader, GlassCard, StatCard, Badge } from "@/components/ui";
import { Crown, Plus, Trash2, UserPlus, Percent, Gift, Award, Pencil } from "lucide-react";

interface VipLevel {
  id: string; name: string; tier: number; minWagered: number;
  cashbackBps: number; bonusAmount: number; color: string; perks: string[];
  userCount: number; createdAt: string;
}

const inr = (n: number) => `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n)}`;
const KEY = "/admin/vip/levels";

const blankLevel = { name: "", tier: 0, minWagered: 0, cashbackBps: 0, bonusAmount: 0, color: "#fbbf24", perks: "" };

export default function VipPage() {
  const { data, isLoading } = useSWR<VipLevel[]>(KEY);
  const [form, setForm] = useState({ ...blankLevel });
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [assign, setAssign] = useState({ username: "", vipLevelId: "" });
  const [busy, setBusy] = useState(false);

  const totalMembers = (data ?? []).reduce((s, l) => s + l.userCount, 0);

  const openNew = () => { setEditId(null); setForm({ ...blankLevel }); setCreating((v) => !v); };
  const openEdit = (l: VipLevel) => {
    setEditId(l.id);
    setForm({
      name: l.name, tier: l.tier, minWagered: l.minWagered, cashbackBps: l.cashbackBps,
      bonusAmount: l.bonusAmount, color: l.color || "#fbbf24",
      perks: Array.isArray(l.perks) ? l.perks.join(", ") : "",
    });
    setCreating(true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const closeForm = () => { setCreating(false); setEditId(null); setForm({ ...blankLevel }); };

  const saveLevel = async () => {
    if (!form.name.trim()) return alert("Name is required");
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(), tier: Number(form.tier),
        minWagered: Number(form.minWagered), cashbackBps: Number(form.cashbackBps),
        bonusAmount: Number(form.bonusAmount), color: form.color,
        perks: form.perks.split(",").map((p) => p.trim()).filter(Boolean),
      };
      if (editId) await api.patch(`${KEY}/${editId}`, payload);
      else await api.post(KEY, payload);
      globalMutate(KEY);
      closeForm();
    } catch (e: any) { alert(e?.response?.data?.message ?? "Save failed"); }
    finally { setBusy(false); }
  };

  const removeLevel = async (id: string, name: string) => {
    if (!confirm(`Delete VIP level "${name}"? Members will be unassigned.`)) return;
    try { await api.delete(`${KEY}/${id}`); globalMutate(KEY); }
    catch (e: any) { alert(e?.response?.data?.message ?? "Delete failed"); }
  };

  const doAssign = async () => {
    if (!assign.username.trim() || !assign.vipLevelId) return alert("Pick a user and a level");
    setBusy(true);
    try {
      await api.post("/admin/vip/assign", { username: assign.username.trim(), vipLevelId: assign.vipLevelId });
      globalMutate(KEY);
      setAssign({ username: "", vipLevelId: "" });
      alert("VIP level assigned");
    } catch (e: any) { alert(e?.response?.data?.message ?? "Assign failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title="VIP Management" subtitle="Loyalty tiers, cashback & rewards"
        right={<button onClick={openNew} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-gray-900 bg-gradient-to-r from-yellow-400 to-yellow-500 hover:brightness-110 transition"><Plus size={16} /> New Tier</button>}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="VIP Tiers"      value={String(data?.length ?? 0)} Icon={Crown} accent="amber"   loading={isLoading} />
        <StatCard label="VIP Members"    value={String(totalMembers)}      Icon={Award} accent="violet"  loading={isLoading} />
        <StatCard label="Top Cashback"   value={`${Math.max(0, ...(data ?? []).map((l) => l.cashbackBps)) / 100}%`} Icon={Percent} accent="emerald" loading={isLoading} />
      </div>

      {/* Create form */}
      {creating && (
        <GlassCard className="p-5 animate-slide-in-down">
          <h2 className="font-black text-gray-100 mb-4">{editId ? "Edit VIP Tier" : "New VIP Tier"}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="Bronze" /></Field>
            <Field label="Tier (order)"><input type="number" value={form.tier} onChange={(e) => setForm({ ...form, tier: +e.target.value })} className={inputCls} /></Field>
            <Field label="Min Wagered (₹)"><input type="number" value={form.minWagered} onChange={(e) => setForm({ ...form, minWagered: +e.target.value })} className={inputCls} /></Field>
            <Field label="Cashback (bps, 500=5%)"><input type="number" value={form.cashbackBps} onChange={(e) => setForm({ ...form, cashbackBps: +e.target.value })} className={inputCls} /></Field>
            <Field label="Welcome Bonus (₹)"><input type="number" value={form.bonusAmount} onChange={(e) => setForm({ ...form, bonusAmount: +e.target.value })} className={inputCls} /></Field>
            <Field label="Color"><input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-9 w-full bg-gray-900/60 border border-gray-700 rounded-lg cursor-pointer" /></Field>
            <Field label="Perks (comma separated)" full><input value={form.perks} onChange={(e) => setForm({ ...form, perks: e.target.value })} className={inputCls} placeholder="Priority support, Higher limits, Weekly bonus" /></Field>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={saveLevel} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-900 bg-gradient-to-r from-yellow-400 to-yellow-500 hover:brightness-110 disabled:opacity-50 transition">{busy ? "Saving…" : editId ? "Save Changes" : "Create Tier"}</button>
            <button onClick={closeForm} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-400 border border-gray-700 hover:text-white transition">Cancel</button>
          </div>
        </GlassCard>
      )}

      {/* Tier cards */}
      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-40 bg-gray-700/40 rounded-xl animate-pulse" />)}</div>
      ) : (data?.length ?? 0) === 0 ? (
        <GlassCard className="p-10 text-center text-gray-500">No VIP tiers yet — create your first one.</GlassCard>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data!.map((l) => (
            <GlassCard key={l.id} glow className="p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-20" style={{ background: l.color }} />
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Crown size={20} style={{ color: l.color }} />
                  <h3 className="font-black text-gray-100">{l.name}</h3>
                  <Badge tone="slate">Tier {l.tier}</Badge>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(l)} className="p-1.5 rounded-lg text-gray-500 hover:text-yellow-400 hover:bg-yellow-500/10 transition" title="Edit tier"><Pencil size={15} /></button>
                  <button onClick={() => removeLevel(l.id, l.name)} className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition" title="Delete tier"><Trash2 size={15} /></button>
                </div>
              </div>
              <div className="space-y-1.5 text-sm">
                <Row icon={<Award size={13} />}   label="Members"      value={String(l.userCount)} />
                <Row icon={<Percent size={13} />} label="Cashback"     value={`${l.cashbackBps / 100}%`} />
                <Row icon={<Gift size={13} />}    label="Bonus"        value={inr(l.bonusAmount)} />
                <Row icon={<Crown size={13} />}   label="Min Wagered"  value={inr(l.minWagered)} />
              </div>
              {Array.isArray(l.perks) && l.perks.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {l.perks.map((p, i) => <Badge key={i} tone="amber">{p}</Badge>)}
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      )}

      {/* Manual assignment */}
      <GlassCard className="p-5">
        <div className="flex items-center gap-2 mb-4"><UserPlus size={18} className="text-yellow-400" /><h2 className="font-black text-gray-100">Assign VIP Tier to a User</h2></div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Username"><input value={assign.username} onChange={(e) => setAssign({ ...assign, username: e.target.value })} className={inputCls} placeholder="username" /></Field>
          <Field label="VIP Tier">
            <select value={assign.vipLevelId} onChange={(e) => setAssign({ ...assign, vipLevelId: e.target.value })} className={inputCls}>
              <option value="">— select tier —</option>
              {(data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name} (Tier {l.tier})</option>)}
            </select>
          </Field>
          <button onClick={doAssign} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-900 bg-gradient-to-r from-yellow-400 to-yellow-500 hover:brightness-110 disabled:opacity-50 transition">Assign</button>
        </div>
      </GlassCard>
    </div>
  );
}

const inputCls = "w-full bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-yellow-400/60 placeholder:text-gray-600";

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={full ? "sm:col-span-2 lg:col-span-3" : ""}>
      <span className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold block mb-1">{label}</span>
      {children}
    </label>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-gray-400">{icon}{label}</span>
      <span className="font-bold tabular-nums text-gray-200">{value}</span>
    </div>
  );
}
