"use client";
import useSWR, { mutate } from "swr";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Settings2, RefreshCw, Shield, Database, CreditCard, Navigation, ChevronRight } from "lucide-react";

interface PlatformSettings {
  minStake: number;
  maxStake: number;
  maxMarketExposure: number;
  defaultPartnershipBps: number;
  currency: string;
  maintenanceMode: boolean;
  registrationEnabled: boolean;
  withdrawalEnabled: boolean;
  depositEnabled: boolean;
}

const SETTINGS_KEY = "/admin/platform-settings";

const inputCls = "w-full bg-white border border-yellow-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition";

export default function SettingsPage() {
  const { data, isLoading } = useSWR<PlatformSettings>(SETTINGS_KEY);
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [form, setForm] = useState<PlatformSettings | null>(null);

  const current = form ?? data;

  async function save() {
    if (!current) return;
    setBusy(true); setMsg(null);
    try {
      await api.post(SETTINGS_KEY, current);
      mutate(SETTINGS_KEY);
      setForm(null);
      setMsg({ text: "Settings saved successfully.", ok: true });
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message || "Failed to save settings.", ok: false });
    } finally { setBusy(false); }
  }

  async function syncCricket() {
    setSyncBusy(true); setMsg(null);
    try {
      const res = await api.post("/sports/cricket/sync/series");
      setMsg({ text: `âœ“ Imported ${res.data.synced} series from Cricket API.`, ok: true });
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message || "Sync failed â€” check your Cricket API key in API Keys.", ok: false });
    } finally { setSyncBusy(false); }
  }

  function set(key: keyof PlatformSettings, value: any) {
    setForm((prev) => ({ ...(prev ?? data!), [key]: value }));
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-black text-gray-900">Settings</h1>
        <div className="h-40 animate-pulse bg-gray-100 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-3"><Settings2 size={24} /> Platform Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Configure betting limits, features, and platform behaviour</p>
      </div>

      {msg && (
        <div className={`text-sm px-4 py-2.5 rounded-lg border font-medium ${
          msg.ok ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-600"
        }`}>
          {msg.text}
        </div>
      )}

      {/* Betting limits */}
      <Section title="Betting Limits" Icon={Shield}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Min Stake (â‚¹)">
            <input type="number" min={1} className={inputCls} value={current?.minStake ?? 100}
              onChange={(e) => set("minStake", Number(e.target.value))} />
          </Field>
          <Field label="Max Stake (â‚¹)">
            <input type="number" min={100} className={inputCls} value={current?.maxStake ?? 100000}
              onChange={(e) => set("maxStake", Number(e.target.value))} />
          </Field>
          <Field label="Max Market Exposure (â‚¹)">
            <input type="number" min={1000} className={inputCls} value={current?.maxMarketExposure ?? 1000000}
              onChange={(e) => set("maxMarketExposure", Number(e.target.value))} />
          </Field>
          <Field label="Default Partnership (basis pts, 100=1%)">
            <input type="number" min={0} max={10000} className={inputCls} value={current?.defaultPartnershipBps ?? 0}
              onChange={(e) => set("defaultPartnershipBps", Number(e.target.value))} />
          </Field>
        </div>
      </Section>

      {/* Feature toggles */}
      <Section title="Feature Toggles" Icon={Settings2}>
        <div className="grid grid-cols-2 gap-4">
          {([
            ["maintenanceMode",     "ðŸ”´ Maintenance Mode (disables site)"],
            ["registrationEnabled", "âœ… New User Registration"],
            ["depositEnabled",      "âœ… Deposits"],
            ["withdrawalEnabled",   "âœ… Withdrawals"],
          ] as [keyof PlatformSettings, string][]).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between rounded-lg border border-yellow-100 bg-yellow-50/50 px-4 py-3 cursor-pointer hover:border-yellow-300 hover:bg-yellow-50 transition">
              <span className="text-sm text-gray-700">{label}</span>
              <input type="checkbox" className="w-4 h-4 accent-yellow-500"
                checked={!!(current?.[key])}
                onChange={(e) => set(key, e.target.checked)} />
            </label>
          ))}
        </div>
      </Section>

      {/* Navigation Bar */}
      <Link href="/settings/nav">
        <section className="rounded-xl border border-yellow-100 bg-white p-5 hover:border-yellow-300 hover:shadow-sm transition cursor-pointer group shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-gray-800 flex items-center gap-2">
              <Navigation size={18} className="text-yellow-500" /> Navigation Bar
            </h2>
            <ChevronRight size={18} className="text-gray-500 group-hover:text-yellow-500 transition" />
          </div>
          <p className="text-sm text-gray-500 mt-1">Add, edit, delete, reorder and toggle visibility of top navigation tabs.</p>
        </section>
      </Link>

      {/* Payment Methods */}
      <Link href="/settings/payment-methods">
        <section className="rounded-xl border border-yellow-100 bg-white p-5 hover:border-yellow-300 hover:shadow-sm transition cursor-pointer group shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-gray-800 flex items-center gap-2">
              <CreditCard size={18} className="text-yellow-500" /> Payment Methods
            </h2>
            <ChevronRight size={18} className="text-gray-500 group-hover:text-yellow-500 transition" />
          </div>
          <p className="text-sm text-gray-500 mt-1">Configure UPI, Bank Transfer, and Crypto deposit methods shown to users.</p>
        </section>
      </Link>

      {/* Save button */}
      <button
        onClick={save}
        disabled={busy || !form}
        className="rounded-lg bg-gradient-to-r from-yellow-400 to-amber-500 px-6 py-2.5 font-bold text-slate-900 shadow-sm disabled:opacity-40 hover:brightness-110 transition"
      >
        {busy ? "Savingâ€¦" : "Save Settings"}
      </button>

      {/* Cricket Sync */}
      <Section title="Data Sync" Icon={Database}>
        <p className="text-sm text-gray-500 mb-3">
          Sync live cricket series from the Cricket API (requires an API key set under <span className="text-yellow-600 font-semibold">API Keys â†’ Cricket API</span>).
        </p>
        <button
          onClick={syncCricket}
          disabled={syncBusy}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-yellow-400 to-amber-500 px-4 py-2 font-bold text-slate-900 shadow-sm disabled:opacity-50 hover:brightness-110 transition"
        >
          <RefreshCw size={16} className={syncBusy ? "animate-spin" : ""} />
          {syncBusy ? "Syncingâ€¦" : "Sync Cricket Series"}
        </button>
      </Section>

      {/* Platform info */}
      <Section title="Platform Info" Icon={Database}>
        <ul className="text-sm text-gray-600 space-y-2">
          <li>Currency: <span className="text-gray-900 font-semibold">{current?.currency ?? "INR"}</span></li>
          <li>Exchange type: <span className="text-gray-900 font-semibold">P2P Betting Exchange</span></li>
          <li>Settlement: <span className="text-gray-900 font-semibold">Queue-based (BullMQ)</span></li>
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, Icon, children }: { title: string; Icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-yellow-100 bg-white p-5 shadow-sm">
      <h2 className="text-base font-black text-gray-800 flex items-center gap-2 mb-4">
        <Icon size={18} className="text-yellow-500" /> {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
