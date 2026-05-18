"use client";
import { useState } from "react";
import { api } from "@/lib/api";

export default function SettingsPage() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function ingestCricket() {
    setBusy(true); setMsg(null);
    try {
      const series = await api.post("/sports/cricket/sync/series");
      setMsg(`Imported ${series.data.synced} series. Use the series page to import matches.`);
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "Failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="font-display text-4xl">Settings</h1>

      <section className="rounded-xl border border-line bg-panel/60 p-5">
        <h2 className="font-display text-2xl">Cricket data sync</h2>
        <p className="text-sm text-white/60 mt-1">
          Uses the configured Cricket API token (admin → API Keys → Cricket API). The free demo token only returns completed competitions.
        </p>
        <button onClick={ingestCricket} disabled={busy} className="mt-3 rounded-md bg-accent-grad px-4 py-2 font-bold text-ink shadow-glow disabled:opacity-50">
          {busy ? "Syncing…" : "Import series"}
        </button>
        {msg && <p className="mt-2 text-xs text-accentSoft">{msg}</p>}
      </section>

      <section className="rounded-xl border border-line bg-panel/60 p-5">
        <h2 className="font-display text-2xl">Platform info</h2>
        <ul className="text-sm text-white/70 mt-2 space-y-1">
          <li>Default partnership: 0 (set per-user in Users)</li>
          <li>Default user limits: min stake 100, max stake 100,000, max market exposure 1,000,000</li>
          <li>Wallet currency: INR</li>
        </ul>
      </section>
    </div>
  );
}
