"use client";
import { useState, useEffect } from "react";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import { Megaphone, Save, CheckCircle2 } from "lucide-react";

interface BannerSettings {
  subBanner:   string;
  marqueeText: string;
  siteName:    string;
  siteTagline: string;
}

const SETTINGS_KEY = "/admin/platform-settings";

const DEFAULTS: BannerSettings = {
  subBanner:   "Bet Now in Line Market and Get Commission Upto 2%",
  marqueeText: "📢 Live Markets Now Available — Play Smart, Win Big! • Bet Now in Line Markets and Get Commission Upto 2%",
  siteName:    "Future9",
  siteTagline: "Sports & Casino",
};

export default function BannerSettingsPage() {
  const { data } = useSWR<Record<string, any>>(SETTINGS_KEY);
  const [form, setForm] = useState<BannerSettings>(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [msg,  setMsg]  = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!data) return;
    setForm({
      subBanner:   data.subBanner   ?? DEFAULTS.subBanner,
      marqueeText: data.marqueeText ?? DEFAULTS.marqueeText,
      siteName:    data.siteName    ?? DEFAULTS.siteName,
      siteTagline: data.siteTagline ?? DEFAULTS.siteTagline,
    });
  }, [data]);

  function set(key: keyof BannerSettings, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api.post(SETTINGS_KEY, form);
      mutate(SETTINGS_KEY);
      setMsg({ text: "Banner settings saved!", ok: true });
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message || "Failed to save.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl animate-fade-in">
      <div>
        <h1 className="font-display text-3xl flex items-center gap-2">
          <Megaphone size={28} className="text-accent" />
          Banner Settings
        </h1>
        <p className="text-sm text-white/60 mt-1">
          Control the sub-banner text, marquee fallback, site name, and tagline shown to users.
        </p>
      </div>

      {/* Sub-banner */}
      <section className="glass rounded-lg p-5 space-y-4">
        <h2 className="font-bold text-sm uppercase tracking-wider text-white/70">Sub-Banner</h2>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-white/50 mb-1">
            Sub-Banner Text
          </label>
          <input
            value={form.subBanner}
            onChange={(e) => set("subBanner", e.target.value)}
            placeholder="Bet Now in Line Market and Get Commission Upto 2%"
            className="w-full bg-panel/60 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
          />
          <p className="text-xs text-white/40 mt-1">
            Shown in the yellow pulsing banner just below the main navigation tabs.
          </p>
        </div>
      </section>

      {/* Marquee */}
      <section className="glass rounded-lg p-5 space-y-4">
        <h2 className="font-bold text-sm uppercase tracking-wider text-white/70">Marquee Fallback</h2>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-white/50 mb-1">
            Marquee Text
          </label>
          <textarea
            rows={3}
            value={form.marqueeText}
            onChange={(e) => set("marqueeText", e.target.value)}
            placeholder="📢 Live Markets Now Available — Play Smart, Win Big!"
            className="w-full bg-panel/60 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none"
          />
          <p className="text-xs text-white/40 mt-1">
            Shown in the top-bar marquee when there are no active announcements. Use &quot;•&quot; to separate segments.
          </p>
        </div>
      </section>

      {/* Site Identity */}
      <section className="glass rounded-lg p-5 space-y-4">
        <h2 className="font-bold text-sm uppercase tracking-wider text-white/70">Site Identity</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-white/50 mb-1">
              Site Name
            </label>
            <input
              value={form.siteName}
              onChange={(e) => set("siteName", e.target.value)}
              placeholder="Future9"
              className="w-full bg-panel/60 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-white/50 mb-1">
              Site Tagline
            </label>
            <input
              value={form.siteTagline}
              onChange={(e) => set("siteTagline", e.target.value)}
              placeholder="Sports & Casino"
              className="w-full bg-panel/60 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
            />
          </div>
        </div>
        <p className="text-xs text-white/40">
          These values are exposed via the public <code className="text-accent/80">/platform/settings</code> API and can be used by frontend components.
        </p>
      </section>

      <div className="flex items-center gap-4">
        <button
          onClick={save}
          disabled={busy}
          className="flex items-center gap-2 bg-accent-grad px-6 py-2.5 rounded-lg font-semibold text-ink shadow-glow hover:brightness-110 disabled:opacity-50 transition"
        >
          <Save size={16} />
          {busy ? "Saving…" : "Save & Apply"}
        </button>
        {msg && (
          <p className={`text-sm flex items-center gap-1 ${msg.ok ? "text-ok" : "text-bad"}`}>
            {msg.ok && <CheckCircle2 size={14} />}
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}
