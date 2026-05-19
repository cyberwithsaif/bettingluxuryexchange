"use client";
import { useRef, useState, useEffect } from "react";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import { Megaphone, Save, CheckCircle2, Plus, Trash2, GripVertical, Image as ImageIcon } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth";

interface BannerSettings {
  subBanner:   string;
  marqueeText: string;
  siteName:    string;
  siteTagline: string;
}

interface HeroBannerSlide {
  id: string;
  imageUrl: string;
  link: string;
  title: string;
  sortOrder: number;
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

  // Hero banners state
  const [slides, setSlides] = useState<HeroBannerSlide[]>([]);
  const [slideBusy, setSlideBusy] = useState(false);
  const [slideMsg, setSlideMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [newSlide, setNewSlide] = useState<Omit<HeroBannerSlide, "id" | "sortOrder">>({ imageUrl: "", link: "", title: "" });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!data) return;
    setForm({
      subBanner:   data.subBanner   ?? DEFAULTS.subBanner,
      marqueeText: data.marqueeText ?? DEFAULTS.marqueeText,
      siteName:    data.siteName    ?? DEFAULTS.siteName,
      siteTagline: data.siteTagline ?? DEFAULTS.siteTagline,
    });
    setSlides((data.heroBanners ?? []).slice().sort((a: HeroBannerSlide, b: HeroBannerSlide) => a.sortOrder - b.sortOrder));
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

  async function saveSlides(updated: HeroBannerSlide[]) {
    setSlideBusy(true); setSlideMsg(null);
    try {
      await api.post(SETTINGS_KEY, { heroBanners: updated });
      setSlides(updated);
      mutate(SETTINGS_KEY);
      setSlideMsg({ text: "Banner slides saved!", ok: true });
    } catch {
      setSlideMsg({ text: "Failed to save.", ok: false });
    } finally { setSlideBusy(false); }
  }

  async function uploadBannerImage(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const token = useAuthStore.getState().accessToken;
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) throw new Error();
      const { url } = await res.json() as { url: string };
      setNewSlide((s) => ({ ...s, imageUrl: url }));
    } catch {
      setSlideMsg({ text: "Image upload failed.", ok: false });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function addSlide() {
    if (!newSlide.imageUrl) { setSlideMsg({ text: "Image URL is required.", ok: false }); return; }
    const slide: HeroBannerSlide = { id: Date.now().toString(), ...newSlide, sortOrder: slides.length };
    saveSlides([...slides, slide]);
    setNewSlide({ imageUrl: "", link: "", title: "" });
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

      {/* Hero Banner Slides */}
      <section className="glass rounded-lg p-5 space-y-4">
        <h2 className="font-bold text-sm uppercase tracking-wider text-white/70">Hero Banner Slides</h2>
        <p className="text-xs text-white/40">
          Full-width image carousel shown on the exchange homepage. Slides auto-advance every 5 seconds.
        </p>

        {/* Existing slides */}
        {slides.length > 0 && (
          <div className="space-y-2">
            {slides.map((slide, i) => (
              <div key={slide.id} className="flex items-center gap-3 bg-panel/40 border border-line rounded-lg p-3">
                <GripVertical size={16} className="text-white/30 shrink-0" />
                <div className="w-20 h-12 rounded overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">
                  {slide.imageUrl
                    ? <img src={slide.imageUrl} alt={slide.title ?? ""} className="w-full h-full object-cover" />
                    : <ImageIcon size={18} className="text-white/20" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{slide.title || <span className="text-white/30 italic">No title</span>}</p>
                  {slide.link && <p className="text-xs text-white/40 truncate">{slide.link}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    disabled={i === 0}
                    onClick={() => {
                      const updated = [...slides];
                      [updated[i - 1], updated[i]] = [updated[i], updated[i - 1]];
                      updated.forEach((s, j) => { s.sortOrder = j; });
                      saveSlides(updated);
                    }}
                    className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 disabled:opacity-30 text-white/60 text-xs"
                    title="Move up"
                  >↑</button>
                  <button
                    disabled={i === slides.length - 1}
                    onClick={() => {
                      const updated = [...slides];
                      [updated[i], updated[i + 1]] = [updated[i + 1], updated[i]];
                      updated.forEach((s, j) => { s.sortOrder = j; });
                      saveSlides(updated);
                    }}
                    className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 disabled:opacity-30 text-white/60 text-xs"
                    title="Move down"
                  >↓</button>
                  <button
                    onClick={() => saveSlides(slides.filter((_, j) => j !== i).map((s, j) => ({ ...s, sortOrder: j })))}
                    className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-500/20 text-red-400 transition"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add new slide form */}
        <div className="border border-line/60 rounded-lg p-4 space-y-3 bg-panel/20">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/50">Add New Slide</p>

          {/* Image upload */}
          <div>
            <label className="block text-xs text-white/50 mb-1">Banner Image <span className="text-red-400">*</span></label>
            <div className="flex gap-2 items-start">
              <input
                value={newSlide.imageUrl}
                onChange={(e) => setNewSlide((s) => ({ ...s, imageUrl: e.target.value }))}
                placeholder="https://... or upload →"
                className="flex-1 bg-panel/60 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="px-3 py-2 rounded-lg border border-line bg-panel/60 hover:bg-white/10 text-sm text-white/70 disabled:opacity-50 transition flex items-center gap-1.5 shrink-0"
              >
                <ImageIcon size={14} />
                {uploading ? "Uploading…" : "Browse"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBannerImage(f); }}
              />
            </div>
            {newSlide.imageUrl && (
              <div className="mt-2 rounded overflow-hidden" style={{ maxWidth: 320 }}>
                <img src={newSlide.imageUrl} alt="preview" className="w-full object-cover" style={{ maxHeight: 100 }} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/50 mb-1">Title (optional)</label>
              <input
                value={newSlide.title}
                onChange={(e) => setNewSlide((s) => ({ ...s, title: e.target.value }))}
                placeholder="Promo title overlay"
                className="w-full bg-panel/60 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1">Link (optional)</label>
              <input
                value={newSlide.link}
                onChange={(e) => setNewSlide((s) => ({ ...s, link: e.target.value }))}
                placeholder="/exchange or https://..."
                className="w-full bg-panel/60 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={addSlide}
              disabled={slideBusy || uploading}
              className="flex items-center gap-2 bg-accent-grad px-4 py-2 rounded-lg font-semibold text-ink text-sm shadow-glow hover:brightness-110 disabled:opacity-50 transition"
            >
              <Plus size={15} />
              {slideBusy ? "Saving…" : "Add Slide"}
            </button>
            {slideMsg && (
              <p className={`text-sm flex items-center gap-1 ${slideMsg.ok ? "text-ok" : "text-bad"}`}>
                {slideMsg.ok && <CheckCircle2 size={14} />}
                {slideMsg.text}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
