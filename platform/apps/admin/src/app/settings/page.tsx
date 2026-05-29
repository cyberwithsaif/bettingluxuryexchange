"use client";
import useSWR, { mutate } from "swr";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";
import { Settings2, RefreshCw, Shield, Database, CreditCard, Navigation, ChevronRight, KeyRound, ArrowUpToLine } from "lucide-react";

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
  minWithdrawal: number;
  maxWithdrawal: number;
}

const SETTINGS_KEY = "/admin/platform-settings";

const inputCls = "w-full bg-gray-800 border border-yellow-500/30 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-500/20 transition";

export default function SettingsPage() {
  const { data, isLoading } = useSWR<PlatformSettings>(SETTINGS_KEY);
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [form, setForm] = useState<PlatformSettings | null>(null);
  const [toggleBusy, setToggleBusy] = useState<string | null>(null);
  const [toggleMsg, setToggleMsg] = useState<{ key: string; ok: boolean } | null>(null);

  // Change password
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null);

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

  async function changePassword() {
    if (pw.next.length < 8) { setPwMsg({ text: "New password must be at least 8 characters.", ok: false }); return; }
    if (pw.next !== pw.confirm) { setPwMsg({ text: "New password and confirmation do not match.", ok: false }); return; }
    setPwBusy(true); setPwMsg(null);
    try {
      const { data: res } = await api.post("/auth/change-password", { currentPassword: pw.current, newPassword: pw.next });
      // The API rotates tokens on password change — adopt the new ones so this
      // session stays logged in instead of getting kicked to /login.
      if (res?.accessToken) {
        useAuthStore.getState().set({ accessToken: res.accessToken, refreshToken: res.refreshToken, user: res.user });
      }
      setPw({ current: "", next: "", confirm: "" });
      setPwMsg({ text: "Password changed successfully.", ok: true });
    } catch (e: any) {
      setPwMsg({ text: e?.response?.data?.message || "Failed to change password.", ok: false });
    } finally { setPwBusy(false); }
  }

  async function syncCricket() {
    setSyncBusy(true); setMsg(null);
    try {
      const res = await api.post("/sports/cricket/sync/series");
      setMsg({ text: `Imported ${res.data.synced} series from the Cricket API.`, ok: true });
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message || "Sync failed — check your Cricket API key in API Keys.", ok: false });
    } finally { setSyncBusy(false); }
  }

  function set(key: keyof PlatformSettings, value: any) {
    setForm((prev) => ({ ...(prev ?? data!), [key]: value }));
  }

  async function toggleSave(key: keyof PlatformSettings, value: boolean) {
    setToggleBusy(key);
    setToggleMsg(null);
    setForm((prev) => ({ ...(prev ?? data!), [key]: value }));
    try {
      await api.post(SETTINGS_KEY, { [key]: value });
      mutate(SETTINGS_KEY);
      setToggleMsg({ key, ok: true });
      setTimeout(() => setToggleMsg(null), 2000);
    } catch {
      setForm((prev) => ({ ...(prev ?? data!), [key]: !value }));
      setToggleMsg({ key, ok: false });
      setTimeout(() => setToggleMsg(null), 3000);
    } finally { setToggleBusy(null); }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-black text-gray-100">Settings</h1>
        <div className="h-40 animate-pulse bg-gray-700 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-black text-gray-100 flex items-center gap-3"><Settings2 size={24} /> Platform Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Configure betting limits, features, and platform behaviour</p>
      </div>

      {msg && (
        <div className={`text-sm px-4 py-2.5 rounded-lg border font-medium ${
          msg.ok ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" : "bg-red-500/15 border-red-500/30 text-red-300"
        }`}>
          {msg.text}
        </div>
      )}

      {/* Betting limits */}
      <Section title="Betting Limits" Icon={Shield}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Min Stake (₹)">
            <input type="number" min={1} className={inputCls} value={current?.minStake ?? 100}
              onChange={(e) => set("minStake", Number(e.target.value))} />
          </Field>
          <Field label="Max Stake (₹)">
            <input type="number" min={100} className={inputCls} value={current?.maxStake ?? 100000}
              onChange={(e) => set("maxStake", Number(e.target.value))} />
          </Field>
          <Field label="Max Market Exposure (₹)">
            <input type="number" min={1000} className={inputCls} value={current?.maxMarketExposure ?? 1000000}
              onChange={(e) => set("maxMarketExposure", Number(e.target.value))} />
          </Field>
          <Field label="Default Partnership (basis pts, 100=1%)">
            <input type="number" min={0} max={10000} className={inputCls} value={current?.defaultPartnershipBps ?? 0}
              onChange={(e) => set("defaultPartnershipBps", Number(e.target.value))} />
          </Field>
        </div>
      </Section>

      {/* Withdrawal limits */}
      <Section title="Withdrawal Limits" Icon={ArrowUpToLine}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Min Withdrawal (₹)">
            <input type="number" min={0} className={inputCls} value={current?.minWithdrawal ?? 100}
              onChange={(e) => set("minWithdrawal", Number(e.target.value))} />
          </Field>
          <Field label="Max Withdrawal (₹)">
            <input type="number" min={0} className={inputCls} value={current?.maxWithdrawal ?? 500000}
              onChange={(e) => set("maxWithdrawal", Number(e.target.value))} />
          </Field>
        </div>
        <p className="text-xs text-gray-500 mt-3">Enforced when a user requests a withdrawal. Set max to 0 for no upper limit.</p>
      </Section>

      {/* Feature toggles */}
      <Section title="Feature Toggles" Icon={Settings2}>
        <div className="grid grid-cols-2 gap-4">
          {([
            ["maintenanceMode",     "Maintenance Mode", "red"],
            ["registrationEnabled", "New User Registration", "emerald"],
            ["depositEnabled",      "Deposits",         "emerald"],
            ["withdrawalEnabled",   "Withdrawals",      "emerald"],
          ] as [keyof PlatformSettings, string, string][]).map(([key, label, tone]) => {
            const isOn   = !!(current?.[key]);
            const saving = toggleBusy === key;
            const fb     = toggleMsg?.key === key;
            return (
              <div key={key} className={`flex items-center justify-between rounded-lg border px-4 py-3 transition ${
                saving ? "opacity-70 pointer-events-none" : "cursor-pointer hover:border-yellow-400 hover:bg-gray-800"
              } ${
                fb ? (toggleMsg!.ok ? "border-emerald-500/50 bg-emerald-900/20" : "border-red-500/50 bg-red-900/20") : "border-yellow-500/20 bg-gray-800/50"
              }`}
                onClick={() => !saving && toggleSave(key, !isOn)}
              >
                <span className="text-sm text-gray-300 flex items-center gap-2 select-none">
                  <span className={`h-2 w-2 rounded-full transition-colors ${
                    saving ? "bg-gray-500 animate-pulse" :
                    fb && !toggleMsg!.ok ? "bg-red-400" :
                    (tone === "red" ? (isOn ? "bg-red-400" : "bg-gray-600") : (isOn ? "bg-emerald-400" : "bg-gray-600"))
                  }`} />
                  {label}
                  {saving && <span className="text-[10px] text-gray-500 ml-1">saving…</span>}
                  {fb && toggleMsg!.ok && <span className="text-[10px] text-emerald-400 ml-1">✓ saved</span>}
                  {fb && !toggleMsg!.ok && <span className="text-[10px] text-red-400 ml-1">✗ failed</span>}
                </span>
                {/* Toggle switch */}
                <div className={`relative w-10 h-5 rounded-full transition-colors ${isOn ? (tone === "red" ? "bg-red-500" : "bg-emerald-500") : "bg-gray-600"}`}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isOn ? "translate-x-5" : "translate-x-0.5"}`} />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Maintenance mode shows a maintenance page to all users — admins can still log in. Other toggles reject those actions platform-wide.
        </p>
      </Section>

      {/* Save button */}
      <button
        onClick={save}
        disabled={busy || !current}
        className="rounded-lg bg-gradient-to-r from-yellow-400 to-amber-500 px-6 py-2.5 font-bold text-gray-900 shadow-sm disabled:opacity-40 hover:brightness-110 transition"
      >
        {busy ? "Saving…" : "Save Settings"}
      </button>

      {/* Change admin password */}
      <Section title="Change Admin Password" Icon={KeyRound}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Current Password">
            <input type="password" autoComplete="current-password" className={inputCls} value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </Field>
          <Field label="New Password (8+ chars)">
            <input type="password" autoComplete="new-password" className={inputCls} value={pw.next}
              onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </Field>
          <Field label="Confirm New Password">
            <input type="password" autoComplete="new-password" className={inputCls} value={pw.confirm}
              onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </Field>
        </div>
        {pwMsg && (
          <div className={`mt-3 text-sm px-3 py-2 rounded-lg border font-medium ${
            pwMsg.ok ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" : "bg-red-500/15 border-red-500/30 text-red-300"
          }`}>{pwMsg.text}</div>
        )}
        <button
          onClick={changePassword}
          disabled={pwBusy || !pw.current || !pw.next}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-yellow-400 to-amber-500 px-5 py-2 font-bold text-gray-900 shadow-sm disabled:opacity-40 hover:brightness-110 transition"
        >
          <KeyRound size={15} /> {pwBusy ? "Updating…" : "Change Password"}
        </button>
        <p className="text-xs text-gray-500 mt-3">Changing your password signs out every other device. This session stays active.</p>
      </Section>

      {/* Navigation Bar */}
      <Link href="/settings/nav">
        <section className="rounded-xl border border-yellow-500/20 bg-gray-800 p-5 hover:border-yellow-400 hover:shadow-sm transition cursor-pointer group shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-gray-200 flex items-center gap-2">
              <Navigation size={18} className="text-yellow-500" /> Navigation Bar
            </h2>
            <ChevronRight size={18} className="text-gray-500 group-hover:text-yellow-500 transition" />
          </div>
          <p className="text-sm text-gray-500 mt-1">Add, edit, delete, reorder and toggle visibility of top navigation tabs.</p>
        </section>
      </Link>

      {/* Payment Methods */}
      <Link href="/settings/payment-methods">
        <section className="rounded-xl border border-yellow-500/20 bg-gray-800 p-5 hover:border-yellow-400 hover:shadow-sm transition cursor-pointer group shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-gray-200 flex items-center gap-2">
              <CreditCard size={18} className="text-yellow-500" /> Payment Methods
            </h2>
            <ChevronRight size={18} className="text-gray-500 group-hover:text-yellow-500 transition" />
          </div>
          <p className="text-sm text-gray-500 mt-1">Configure UPI, Bank Transfer, and Crypto deposit methods shown to users.</p>
        </section>
      </Link>

      {/* Cricket Sync */}
      <Section title="Data Sync" Icon={Database}>
        <p className="text-sm text-gray-500 mb-3">
          Sync live cricket series from the Cricket API (requires an API key set under <span className="text-yellow-400 font-semibold">API Keys → Cricket API</span>).
        </p>
        <button
          onClick={syncCricket}
          disabled={syncBusy}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-yellow-400 to-amber-500 px-4 py-2 font-bold text-gray-900 shadow-sm disabled:opacity-50 hover:brightness-110 transition"
        >
          <RefreshCw size={16} className={syncBusy ? "animate-spin" : ""} />
          {syncBusy ? "Syncing…" : "Sync Cricket Series"}
        </button>
      </Section>

      {/* Platform info */}
      <Section title="Platform Info" Icon={Database}>
        <ul className="text-sm text-gray-400 space-y-2">
          <li>Currency: <span className="text-gray-100 font-semibold">{current?.currency ?? "INR"}</span></li>
          <li>Exchange type: <span className="text-gray-100 font-semibold">P2P Betting Exchange</span></li>
          <li>Settlement: <span className="text-gray-100 font-semibold">Queue-based (BullMQ)</span></li>
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, Icon, children }: { title: string; Icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-yellow-500/20 bg-gray-800 p-5 shadow-sm">
      <h2 className="text-base font-black text-gray-200 flex items-center gap-2 mb-4">
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
