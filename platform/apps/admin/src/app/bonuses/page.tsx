"use client";
import { useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { api } from "@/lib/api";
import { PageHeader, GlassCard, StatCard, Badge, DataTable, type Column } from "@/components/ui";
import { Gift, Plus, Trash2, Power, Ticket, Percent, Coins } from "lucide-react";

interface Promo {
  id: string; code: string; type: "DEPOSIT_BONUS" | "FREE_CREDIT" | "CASHBACK";
  amount: number; percentage: number; maxUses: number | null; usedCount: number;
  minDeposit: number; wagerMultiplier: number; expiresAt: string | null;
  active: boolean; redemptions: number; createdAt: string;
}

const inr = (n: number) => `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n)}`;
const KEY = "/admin/promos";
const TYPE_TONE: Record<string, string> = { DEPOSIT_BONUS: "violet", FREE_CREDIT: "emerald", CASHBACK: "sky" };
const TYPE_LABEL: Record<string, string> = { DEPOSIT_BONUS: "Deposit Bonus", FREE_CREDIT: "Free Credit", CASHBACK: "Cashback" };

const blank = { code: "", type: "FREE_CREDIT", amount: 0, percentage: 0, maxUses: "", minDeposit: 0, wagerMultiplier: 1, expiresAt: "" };

export default function BonusesPage() {
  const { data, isLoading } = useSWR<Promo[]>(KEY);
  const [form, setForm] = useState({ ...blank });
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const activeCount = (data ?? []).filter((p) => p.active).length;
  const totalRedemptions = (data ?? []).reduce((s, p) => s + p.usedCount, 0);

  const create = async () => {
    if (!form.code.trim()) return alert("Code is required");
    setBusy(true);
    try {
      await api.post(KEY, {
        code: form.code.trim(), type: form.type,
        amount: Number(form.amount), percentage: Number(form.percentage),
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        minDeposit: Number(form.minDeposit), wagerMultiplier: Number(form.wagerMultiplier),
        expiresAt: form.expiresAt || null,
      });
      globalMutate(KEY); setForm({ ...blank }); setCreating(false);
    } catch (e: any) { alert(e?.response?.data?.message ?? "Create failed"); }
    finally { setBusy(false); }
  };

  const toggle = async (p: Promo) => {
    try { await api.patch(`${KEY}/${p.id}`, { active: !p.active }); globalMutate(KEY); }
    catch { alert("Update failed"); }
  };
  const remove = async (p: Promo) => {
    if (!confirm(`Delete promo code ${p.code}?`)) return;
    try { await api.delete(`${KEY}/${p.id}`); globalMutate(KEY); }
    catch { alert("Delete failed"); }
  };

  const columns: Column<Promo>[] = [
    { key: "code", header: "Code", sortValue: (r) => r.code, render: (r) => <span className="font-mono font-bold text-yellow-400">{r.code}</span> },
    { key: "type", header: "Type", sortValue: (r) => r.type, render: (r) => <Badge tone={TYPE_TONE[r.type]}>{TYPE_LABEL[r.type]}</Badge> },
    { key: "value", header: "Value", render: (r) => r.type === "FREE_CREDIT" ? <span className="text-emerald-300 font-bold">{inr(r.amount)}</span> : <span className="text-sky-300 font-bold">{r.percentage / 100}%</span> },
    { key: "minDeposit", header: "Min Deposit", align: "right", sortValue: (r) => r.minDeposit, render: (r) => <span className="tabular-nums text-gray-400">{inr(r.minDeposit)}</span> },
    { key: "wager", header: "Wager ×", align: "right", render: (r) => <span className="tabular-nums text-gray-400">{r.wagerMultiplier}×</span> },
    { key: "usage", header: "Usage", align: "right", sortValue: (r) => r.usedCount, exportValue: (r) => `${r.usedCount}/${r.maxUses ?? "∞"}`, render: (r) => <span className="tabular-nums text-gray-300">{r.usedCount}/{r.maxUses ?? "∞"}</span> },
    { key: "expiresAt", header: "Expires", sortValue: (r) => r.expiresAt ?? "", render: (r) => <span className="text-gray-500 text-xs">{r.expiresAt ? new Date(r.expiresAt).toLocaleDateString("en-IN") : "never"}</span> },
    { key: "active", header: "Status", render: (r) => <Badge tone={r.active ? "emerald" : "slate"}>{r.active ? "Active" : "Disabled"}</Badge> },
    { key: "actions", header: "", render: (r) => (
      <div className="flex items-center gap-1 justify-end">
        <button onClick={() => toggle(r)} title={r.active ? "Disable" : "Enable"} className={`p-1.5 rounded-lg transition ${r.active ? "text-emerald-400 hover:bg-emerald-500/10" : "text-gray-500 hover:bg-gray-700/40"}`}><Power size={14} /></button>
        <button onClick={() => remove(r)} title="Delete" className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition"><Trash2 size={14} /></button>
      </div>
    ) },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title="Bonuses & Promo Codes" subtitle="Welcome bonuses, cashback, free credit & promo coupons"
        right={<button onClick={() => setCreating((v) => !v)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-gray-900 bg-gradient-to-r from-yellow-400 to-yellow-500 hover:brightness-110 transition"><Plus size={16} /> New Code</button>}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Total Codes"      value={String(data?.length ?? 0)} Icon={Ticket} accent="violet"  loading={isLoading} />
        <StatCard label="Active Codes"     value={String(activeCount)}       Icon={Power}  accent="emerald" loading={isLoading} />
        <StatCard label="Total Redemptions" value={String(totalRedemptions)} Icon={Gift}   accent="amber"   loading={isLoading} />
      </div>

      {creating && (
        <GlassCard className="p-5 animate-slide-in-down">
          <h2 className="font-black text-gray-100 mb-4">New Promo Code</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Code"><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className={inputCls} placeholder="WELCOME100" /></Field>
            <Field label="Type">
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={inputCls}>
                <option value="FREE_CREDIT">Free Credit</option>
                <option value="DEPOSIT_BONUS">Deposit Bonus</option>
                <option value="CASHBACK">Cashback</option>
              </select>
            </Field>
            {form.type === "FREE_CREDIT"
              ? <Field label="Credit Amount (₹)"><input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: +e.target.value })} className={inputCls} /></Field>
              : <Field label="Percentage (bps, 5000=50%)"><input type="number" value={form.percentage} onChange={(e) => setForm({ ...form, percentage: +e.target.value })} className={inputCls} /></Field>}
            <Field label="Max Uses (blank=∞)"><input type="number" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} className={inputCls} placeholder="∞" /></Field>
            <Field label="Min Deposit (₹)"><input type="number" value={form.minDeposit} onChange={(e) => setForm({ ...form, minDeposit: +e.target.value })} className={inputCls} /></Field>
            <Field label="Wager Multiplier"><input type="number" value={form.wagerMultiplier} onChange={(e) => setForm({ ...form, wagerMultiplier: +e.target.value })} className={inputCls} /></Field>
            <Field label="Expiry Date"><input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className={inputCls} /></Field>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={create} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-900 bg-gradient-to-r from-yellow-400 to-yellow-500 hover:brightness-110 disabled:opacity-50 transition">{busy ? "Saving…" : "Create Code"}</button>
            <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-400 border border-gray-700 hover:text-white transition">Cancel</button>
          </div>
        </GlassCard>
      )}

      <DataTable
        columns={columns}
        rows={data ?? []}
        loading={isLoading}
        searchKeys={["code", "type"]}
        searchPlaceholder="Search codes…"
        pageSize={15}
        exportName="promo-codes"
        rowKey={(r) => r.id}
        emptyText="No promo codes yet"
      />
    </div>
  );
}

const inputCls = "w-full bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-yellow-400/60 placeholder:text-gray-600";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <span className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold block mb-1">{label}</span>
      {children}
    </label>
  );
}
