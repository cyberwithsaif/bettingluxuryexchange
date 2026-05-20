"use client";
import { useRef, useState, useEffect } from "react";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";
import {
  Megaphone, Save, CheckCircle2, Plus, Trash2,
  GripVertical, Image as ImageIcon, Layout,
} from "lucide-react";

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

interface PromoBanner {
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

async function uploadImage(file: File, type: "hero" | "promo"): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(`/api/admin/upload?type=${type}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) throw new Error("Upload failed");
  const { url } = await res.json() as { url: string };
  return url;
}

// ── Reusable slide manager ────────────────────────────────────────────────────
function SlideManager({
  label,
  hint,
  slides,
  onSave,
  saving,
  uploadType,
  aspectClass,
}: {
  label: string;
  hint: string;
  slides: (HeroBannerSlide | PromoBanner)[];
  onSave: (s: (HeroBannerSlide | PromoBanner)[]) => Promise<void>;
  saving: boolean;
  uploadType: "hero" | "promo";
  aspectClass: string;
}) {
  const [newSlide, setNewSlide] = useState({ imageUrl: "", link: "", title: "" });
  const [uploading, setUploading]   = useState(false);
  const [msg, setMsg]               = useState<{ text: string; ok: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const url = await uploadImage(file, uploadType);
      setNewSlide(s => ({ ...s, imageUrl: url }));
    } catch {
      setMsg({ text: "Image upload failed.", ok: false });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function add() {
    if (!newSlide.imageUrl) { setMsg({ text: "Image is required.", ok: false }); return; }
    const slide = { id: Date.now().toString(), ...newSlide, sortOrder: slides.length };
    setMsg(null);
    await onSave([...slides, slide]);
    setMsg({ text: `${label} slide added!`, ok: true });
    setNewSlide({ imageUrl: "", link: "", title: "" });
  }

  async function move(i: number, dir: -1 | 1) {
    const updated = [...slides];
    const j = i + dir;
    [updated[i], updated[j]] = [updated[j]!, updated[i]!];
    updated.forEach((s, k) => { s.sortOrder = k; });
    await onSave(updated);
  }

  async function remove(i: number) {
    await onSave(slides.filter((_, j) => j !== i).map((s, k) => ({ ...s, sortOrder: k })));
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-white/40">{hint}</p>

      {slides.length > 0 && (
        <div className="space-y-2">
          {slides.map((slide, i) => (
            <div key={slide.id} className="flex items-center gap-3 bg-panel/40 border border-line rounded-lg p-3">
              <GripVertical size={16} className="text-white/30 shrink-0" />
              <div className={`${aspectClass} rounded overflow-hidden bg-white/5 shrink-0 flex items-center justify-center`}>
                {slide.imageUrl
                  ? <img src={slide.imageUrl} alt={slide.title} className="w-full h-full object-cover" />
                  : <ImageIcon size={16} className="text-white/20" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{slide.title || <span className="text-white/30 italic">No title</span>}</p>
                {slide.link && <p className="text-xs text-white/40 truncate">{slide.link}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button disabled={i === 0} onClick={() => move(i, -1)}
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 disabled:opacity-30 text-white/60 text-xs">↑</button>
                <button disabled={i === slides.length - 1} onClick={() => move(i, 1)}
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 disabled:opacity-30 text-white/60 text-xs">↓</button>
                <button onClick={() => remove(i)}
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-500/20 text-red-400 transition">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      <div className="border border-line/60 rounded-lg p-4 space-y-3 bg-panel/20">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/50">Add New Slide</p>
        <div>
          <label className="block text-xs text-white/50 mb-1">Image <span className="text-red-400">*</span></label>
          <div className="flex gap-2 items-start">
            <input
              value={newSlide.imageUrl}
              onChange={e => setNewSlide(s => ({ ...s, imageUrl: e.target.value }))}
              placeholder="https://... or click Browse"
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
              ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
            />
          </div>
          {newSlide.imageUrl && (
            <div className="mt-2 rounded overflow-hidden" style={{ maxWidth: 260 }}>
              <img src={newSlide.imageUrl} alt="preview" className="w-full object-cover" style={{ maxHeight: 80 }} />
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-white/50 mb-1">Title (optional)</label>
            <input
              value={newSlide.title}
              onChange={e => setNewSlide(s => ({ ...s, title: e.target.value }))}
              placeholder="Promo title overlay"
              className="w-full bg-panel/60 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1">Link (optional)</label>
            <input
              value={newSlide.link}
              onChange={e => setNewSlide(s => ({ ...s, link: e.target.value }))}
              placeholder="/exchange or https://..."
              className="w-full bg-panel/60 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={add}
            disabled={saving || uploading}
            className="flex items-center gap-2 bg-accent-grad px-4 py-2 rounded-lg font-semibold text-ink text-sm shadow-glow hover:brightness-110 disabled:opacity-50 transition"
          >
            <Plus size={15} />
            {saving ? "Saving…" : "Add Slide"}
          </button>
          {msg && (
            <p className={`text-sm flex items-center gap-1 ${msg.ok ? "text-ok" : "text-bad"}`}>
              {msg.ok && <CheckCircle2 size={14} />}
              {msg.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BannerSettingsPage() {
  const { data } = useSWR<Record<string, any>>(SETTINGS_KEY);
  const [form, setForm]         = useState<BannerSettings>(DEFAULTS);
  const [busy, setBusy]         = useState(false);
  const [msg,  setMsg]          = useState<{ text: string; ok: boolean } | null>(null);
  const [heroSlides, setHeroSlides]   = useState<HeroBannerSlide[]>([]);
  const [promoSlides, setPromoSlides] = useState<PromoBanner[]>([]);
  const [heroSaving, setHeroSaving]   = useState(false);
  const [promoSaving, setPromoSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm({
      subBanner:   data.subBanner   ?? DEFAULTS.subBanner,
      marqueeText: data.marqueeText ?? DEFAULTS.marqueeText,
      siteName:    data.siteName    ?? DEFAULTS.siteName,
      siteTagline: data.siteTagline ?? DEFAULTS.siteTagline,
    });
    setHeroSlides((data.heroBanners ?? []).slice().sort((a: HeroBannerSlide, b: HeroBannerSlide) => a.sortOrder - b.sortOrder));
    setPromoSlides((data.promoBanners ?? []).slice().sort((a: PromoBanner, b: PromoBanner) => a.sortOrder - b.sortOrder));
  }, [data]);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      await api.post(SETTINGS_KEY, form);
      mutate(SETTINGS_KEY);
      setMsg({ text: "Saved!", ok: true });
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message || "Failed to save.", ok: false });
    } finally { setBusy(false); }
  }

  async function saveHeroSlides(updated: HeroBannerSlide[]) {
    setHeroSaving(true);
    await api.post(SETTINGS_KEY, { heroBanners: updated });
    setHeroSlides(updated);
    mutate(SETTINGS_KEY);
    setHeroSaving(false);
  }

  async function savePromoSlides(updated: PromoBanner[]) {
    setPromoSaving(true);
    await api.post(SETTINGS_KEY, { promoBanners: updated });
    setPromoSlides(updated);
    mutate(SETTINGS_KEY);
    setPromoSaving(false);
  }

  return (
    <div className="space-y-6 max-w-3xl animate-fade-in">
      <div>
        <h1 className="font-display text-3xl flex items-center gap-2">
          <Megaphone size={28} className="text-accent" />
          Banner Settings
        </h1>
        <p className="text-sm text-white/60 mt-1">
          Control site identity, marquee text, hero carousel, and promo banner strip.
        </p>
      </div>

      {/* Sub-banner */}
      <section className="glass rounded-lg p-5 space-y-4">
        <h2 className="font-bold text-sm uppercase tracking-wider text-white/70">Sub-Banner</h2>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-white/50 mb-1">Sub-Banner Text</label>
          <input
            value={form.subBanner}
            onChange={e => setForm(p => ({ ...p, subBanner: e.target.value }))}
            placeholder="Bet Now in Line Market and Get Commission Upto 2%"
            className="w-full bg-panel/60 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
          />
          <p className="text-xs text-white/40 mt-1">Shown in the yellow pulsing banner just below the main navigation tabs.</p>
        </div>
      </section>

      {/* Marquee */}
      <section className="glass rounded-lg p-5 space-y-4">
        <h2 className="font-bold text-sm uppercase tracking-wider text-white/70">Marquee Fallback</h2>
        <textarea
          rows={3}
          value={form.marqueeText}
          onChange={e => setForm(p => ({ ...p, marqueeText: e.target.value }))}
          placeholder="📢 Live Markets Now Available — Play Smart, Win Big!"
          className="w-full bg-panel/60 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none"
        />
        <p className="text-xs text-white/40">Shown in the top-bar marquee when no active announcements. Use &quot;•&quot; to separate segments.</p>
      </section>

      {/* Site Identity */}
      <section className="glass rounded-lg p-5 space-y-4">
        <h2 className="font-bold text-sm uppercase tracking-wider text-white/70">Site Identity</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-white/50 mb-1">Site Name</label>
            <input value={form.siteName} onChange={e => setForm(p => ({ ...p, siteName: e.target.value }))}
              placeholder="Future9"
              className="w-full bg-panel/60 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-white/50 mb-1">Site Tagline</label>
            <input value={form.siteTagline} onChange={e => setForm(p => ({ ...p, siteTagline: e.target.value }))}
              placeholder="Sports & Casino"
              className="w-full bg-panel/60 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
          </div>
        </div>
      </section>

      <div className="flex items-center gap-4">
        <button onClick={save} disabled={busy}
          className="flex items-center gap-2 bg-accent-grad px-6 py-2.5 rounded-lg font-semibold text-ink shadow-glow hover:brightness-110 disabled:opacity-50 transition">
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

      {/* ── Hero Banner Slides ─────────────────────────────────────────────── */}
      <section className="glass rounded-lg p-5 space-y-4">
        <h2 className="font-bold text-sm uppercase tracking-wider text-white/70 flex items-center gap-2">
          <Layout size={16} className="text-accent" />
          Hero Banner Slides
        </h2>
        <p className="text-xs text-white/40">
          Full-width carousel (1920×480) on the exchange page. Auto-advances every 5 s. Upload high-quality images for best results.
        </p>
        <SlideManager
          label="Hero"
          hint="Recommended image: 1920×480 px, landscape. Use the Browse button to auto-resize on upload."
          slides={heroSlides}
          onSave={s => saveHeroSlides(s as HeroBannerSlide[])}
          saving={heroSaving}
          uploadType="hero"
          aspectClass="w-24 h-12"
        />
      </section>

      {/* ── Promo Banner Strip ─────────────────────────────────────────────── */}
      <section className="glass rounded-lg p-5 space-y-4">
        <h2 className="font-bold text-sm uppercase tracking-wider text-white/70 flex items-center gap-2">
          <Megaphone size={16} className="text-accent" />
          Promo Banner Strip
        </h2>
        <p className="text-xs text-white/40">
          Small scrolling promotional banners shown above the hero carousel. Recommended: 600×200 px. Auto-scroll left continuously.
        </p>
        <SlideManager
          label="Promo"
          hint="Recommended image: 600×200 px. These appear as a scrolling row of small promo cards."
          slides={promoSlides}
          onSave={s => savePromoSlides(s as PromoBanner[])}
          saving={promoSaving}
          uploadType="promo"
          aspectClass="w-16 h-10"
        />
      </section>
    </div>
  );
}
