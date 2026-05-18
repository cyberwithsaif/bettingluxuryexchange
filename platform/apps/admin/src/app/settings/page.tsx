"use client";
import useSWR, { mutate } from "swr";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Settings2, RefreshCw, Shield, Database, CreditCard, ChevronRight } from "lucide-react";

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

export default function SettingsPage() {
  const { data, isLoading } = useSWR<PlatformSettings>(SETTINGS_KEY);
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [form, setForm] = useState<PlatformSettings | null>(null);

  // Populate form once data arrives
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
      setMsg({ text: `✓ Imported ${res.data.synced} series from Cricket API.`, ok: true });
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message || "Sync failed — check your Cricket API key in API Keys.", ok: false });
    } finally { setSyncBusy(false); }
  }

  function set(key: keyof PlatformSettings, value: any) {
    setForm((prev) => ({ ...(prev ?? data!), [key]: value }));
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-4xl">Settings</h1>
        <div className="h-40 animate-pulse bg-panel/60 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="font-display text-4xl flex items-center gap-3"><Settings2 size={32} /> Platform Settings</h1>

      {msg && (
        <div className={`text-sm px-4 py-2.5 rounded-lg border ${msg.ok ? "bg-ok/10 border-ok/30 text-ok" : "bg-bad/10 border-bad/30 text-bad"}`}>
          {msg.text}
        </div>
      )}

      {/* Betting limits */}
      <Section title="Betting Limits" Icon={Shield}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Min Stake (₹)">
            <input type="number" min={1} className="input" value={current?.minStake ?? 100}
              onChange={(e) => set("minStake", Number(e.target.value))} />
          </Field>
          <Field label="Max Stake (₹)">
            <input type="number" min={100} className="input" value={current?.maxStake ?? 100000}
              onChange={(e) => set("maxStake", Number(e.target.value))} />
          </Field>
          <Field label="Max Market Exposure (₹)">
            <input type="number" min={1000} className="input" value={current?.maxMarketExposure ?? 1000000}
              onChange={(e) => set("maxMarketExposure", Number(e.target.value))} />
          </Field>
          <Field label="Default Partnership (basis pts, 100=1%)">
            <input type="number" min={0} max={10000} className="input" value={current?.defaultPartnershipBps ?? 0}
              onChange={(e) => set("defaultPartnershipBps", Number(e.target.value))} />
          </Field>
        </div>
      </Section>

      {/* Feature toggles */}
      <Section title="Feature Toggles" Icon={Settings2}>
        <div className="grid grid-cols-2 gap-4">
          {([
            ["maintenanceMode",      "🔴 Maintenance Mode (disables site)"],
            ["registrationEnabled",  "✅ New User Registration"],
            ["depositEnabled",       "✅ Deposits"],
            ["withdrawalEnabled",    "✅ Withdrawals"],
          ] as [keyof PlatformSettings, string][]).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between rounded-lg border border-line bg-panel/40 px-4 py-3 cursor-pointer hover:border-accent transition">
              <span className="text-sm">{label}</span>
              <input type="checkbox" className="w-4 h-4 accent-orange-500"
                checked={!!(current?.[key])}
                onChange={(e) => set(key, e.target.checked)} />
            </label>
          ))}
        </div>
      </Section>

      {/* Payment Methods */}
      <Link href="/settings/payment-methods">
        <section className="rounded-xl border border-line bg-panel/60 p-5 hover:border-accent/60 transition cursor-pointer group">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl flex items-center gap-2">
              <CreditCard size={18} className="text-accentSoft" /> Payment Methods
            </h2>
            <ChevronRight size={18} className="text-white/40 group-hover:text-accent transition" />
          </div>
          <p className="text-sm text-white/50 mt-1">Configure UPI, Bank Transfer, and Crypto deposit methods shown to users.</p>
        </section>
      </Link>

      {/* Save button */}
      <button onClick={save} disabled={busy || !form}
        className="rounded-md bg-accent-grad px-6 py-2.5 font-bold text-ink shadow-glow disabled:opacity-40 hover:brightness-110 transition">
        {busy ? "Saving…" : "Save Settings"}
      </button>

      {/* Cricket Sync */}
      <Section title="Data Sync" Icon={Database}>
        <p className="text-sm text-white/60 mb-3">
          Sync live cricket series from the Cricket API (requires an API key set under <span className="text-accentSoft">API Keys → Cricket API</span>).
        </p>
        <button onClick={syncCricket} disabled={syncBusy}
          className="inline-flex items-center gap-2 rounded-md bg-accent-grad px-4 py-2 font-bold text-ink shadow-glow disabled:opacity-50">
          <RefreshCw size={16} className={syncBusy ? "animate-spin" : ""} />
          {syncBusy ? "Syncing…" : "Sync Cricket Series"}
        </button>
      </Section>

      {/* Platform info */}
      <Section title="Platform Info" Icon={Database}>
        <ul className="text-sm text-white/70 space-y-1">
          <li>Currency: <span className="text-white font-semibold">{current?.currency ?? "INR"}</span></li>
          <li>Exchange type: <span className="text-white font-semibold">P2P Betting Exchange</span></li>
          <li>Settlement: <span className="text-white font-semibold">Queue-based (BullMQ)</span></li>
        </ul>
      </Section>

      <style jsx>{`
        :global(.input){width:100%;background:#0d0e15;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:9px 11px;font-size:14px;color:#e6e7eb}
        :global(.input:focus){outline:none;border-color:#ff7a18}
      `}</style>
    </div>
  );
}

function Section({ title, Icon, children }: { title: string; Icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-panel/60 p-5">
      <h2 className="font-display text-xl flex items-center gap-2 mb-4">
        <Icon size={18} className="text-accentSoft" /> {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs uppercase tracking-wider text-white/60">{label}</span><div className="mt-1">{children}</div></label>;
}
