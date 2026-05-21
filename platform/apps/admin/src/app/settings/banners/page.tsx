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

interface CategoryBanner {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  emoji: string;
  gradient: string;
  sortOrder: number;
}

const SETTINGS_KEY = "/admin/platform-settings";

const DEFAULTS: BannerSettings = {
  subBanner:   "Bet Now in Line Market and Get Commission Upto 2%",
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

const EMPTY_CATEGORY: Omit<CategoryBanner, "id" | "sortOrder"> = {
  title: "", subtitle: "", href: "/casino", emoji: "🎰",
  gradient: "linear-gradient(135deg,#3d0810 0%,#6b0e1a 40%,#1a0408 100%)",
};

const GRADIENT_PRESETS = [
  { label: "Casino Red",   value: "linear-gradient(135deg,#3d0810 0%,#6b0e1a 40%,#1a0408 100%)" },
  { label: "Sports Blue",  value: "linear-gradient(135deg,#0a1535 0%,#162a60 40%,#040c1a 100%)" },
  { label: "Green",        value: "linear-gradient(135deg,#0a3d1a 0%,#0e6b30 40%,#041a08 100%)" },
  { label: "Purple",       value: "linear-gradient(135deg,#2d0a5c 0%,#4e0e8c 40%,#1a0430 100%)" },
  { label: "Gold",         value: "linear-gradient(135deg,#3d2d00 0%,#6b4e0a 40%,#1a1200 100%)" },
];

function CategoryCardManager({ banners, saving, onSave }: {
  banners: CategoryBanner[];
  saving: boolean;
  onSave: (updated: CategoryBanner[]) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Omit<CategoryBanner, "id" | "sortOrder">>(EMPTY_CATEGORY);
  const [newForm, setNewForm] = useState<Omit<CategoryBanner, "id" | "sortOrder">>(EMPTY_CATEGORY);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  function startEdit(cat: CategoryBanner) {
    setEditingId(cat.id);
    setEditForm({ title: cat.title, subtitle: cat.subtitle, href: cat.href, emoji: cat.emoji, gradient: cat.gradient });
  }

  async function saveEdit() {
    const updated = banners.map(c => c.id === editingId ? { ...c, ...editForm } : c);
    await onSave(updated);
    setEditingId(null);
    setMsg({ text: "Card updated!", ok: true });
    setTimeout(() => setMsg(null), 3000);
  }

  async function addCard() {
    if (!newForm.title) { setMsg({ text: "Title is required.", ok: false }); return; }
    const card: CategoryBanner = { id: Date.now().toString(), sortOrder: banners.length, ...newForm };
    await onSave([...banners, card]);
    setNewForm(EMPTY_CATEGORY);
    setMsg({ text: "Card added!", ok: true });
    setTimeout(() => setMsg(null), 3000);
  }

  async function remove(id: string) {
    await onSave(banners.filter(c => c.id !== id).map((c, k) => ({ ...c, sortOrder: k })));
  }

  async function move(i: number, dir: -1 | 1) {
    const updated = [...banners];
    const j = i + dir;
    [updated[i], updated[j]] = [updated[j]!, updated[i]!];
    updated.forEach((c, k) => { c.sortOrder = k; });
    await onSave(updated);
  }

  const fieldClass = "w-full bg-panel/60 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent";

  function CardForm({ value, onChange, onSubmit, submitLabel }: {
    value: Omit<CategoryBanner, "id" | "sortOrder">;
    onChange: (v: Omit<CategoryBanner, "id" | "sortOrder">) => void;
    onSubmit: () => void;
    submitLabel: string;
  }) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-white/50 mb-1">Title <span className="text-red-400">*</span></label>
            <input value={value.title} onChange={e => onChange({ ...value, title: e.target.value })}
              placeholder="Casino" className={fieldClass} />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1">Subtitle</label>
            <input value={value.subtitle} onChange={e => onChange({ ...value, subtitle: e.target.value })}
              placeholder="Thousands of Games" className={fieldClass} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-white/50 mb-1">Link (href)</label>
            <input value={value.href} onChange={e => onChange({ ...value, href: e.target.value })}
              placeholder="/casino" className={fieldClass} />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1">Emoji / Icon</label>
            <input value={value.emoji} onChange={e => onChange({ ...value, emoji: e.target.value })}
              placeholder="🎰" className={fieldClass} />
          </div>
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1">Background Gradient</label>
          <div className="flex gap-2 flex-wrap mb-2">
            {GRADIENT_PRESETS.map(p => (
              <button key={p.label} onClick={() => onChange({ ...value, gradient: p.value })}
                className="px-2 py-1 rounded text-[11px] border transition"
                style={{
                  background: p.value,
                  border: value.gradient === p.value ? "1.5px solid #a78bfa" : "1px solid rgba(255,255,255,0.1)",
                  color: "white",
                }}>
                {p.label}
              </button>
            ))}
          </div>
          <input value={value.gradient} onChange={e => onChange({ ...value, gradient: e.target.value })}
            placeholder="linear-gradient(135deg,...)" className={fieldClass} />
          <div className="mt-2 h-10 rounded-lg border border-white/10" style={{ background: value.gradient }} />
        </div>
        <button onClick={onSubmit} disabled={saving}
          className="flex items-center gap-2 bg-accent-grad px-4 py-2 rounded-lg font-semibold text-ink text-sm shadow-glow hover:brightness-110 disabled:opacity-50 transition">
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    );
  }

  return (
    <section className="glass rounded-lg p-5 space-y-4">
      <div>
        <h2 className="font-bold text-sm uppercase tracking-wider text-white/70 flex items-center gap-2">
          <Layout size={16} className="text-accent" />
          Category Cards (Homepage)
        </h2>
        <p className="text-xs text-white/40 mt-1">
          The large Casino & Sports Betting cards on the homepage. Size: ~680×140 px each (2-column grid, desktop). Changes apply live on save.
        </p>
      </div>

      {/* Existing banners */}
      <div className="space-y-2">
        {banners.length === 0 && (
          <p className="text-xs text-white/30 py-4 text-center border border-dashed border-white/10 rounded-lg">
            No category cards configured — defaults will show (Casino & Sports Betting).
          </p>
        )}
        {banners.map((cat, i) => (
          <div key={cat.id} className="border border-line rounded-lg overflow-hidden">
            {/* Row */}
            <div className="flex items-center gap-3 p-3 bg-panel/40">
              <GripVertical size={16} className="text-white/30 shrink-0" />
              <div className="w-16 h-8 rounded overflow-hidden shrink-0 border border-white/10"
                style={{ background: cat.gradient }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{cat.emoji} {cat.title}</p>
                <p className="text-xs text-white/40 truncate">{cat.subtitle} · {cat.href}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button disabled={i === 0} onClick={() => move(i, -1)}
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 disabled:opacity-30 text-white/60 text-xs">↑</button>
                <button disabled={i === banners.length - 1} onClick={() => move(i, 1)}
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 disabled:opacity-30 text-white/60 text-xs">↓</button>
                <button onClick={() => editingId === cat.id ? setEditingId(null) : startEdit(cat)}
                  className="px-2.5 h-7 flex items-center justify-center rounded hover:bg-accent/20 text-accent text-xs font-semibold transition">
                  {editingId === cat.id ? "Cancel" : "Edit"}
                </button>
                <button onClick={() => remove(cat.id)}
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-500/20 text-red-400 transition">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {/* Inline edit form */}
            {editingId === cat.id && (
              <div className="p-4 bg-panel/20 border-t border-line">
                <CardForm value={editForm} onChange={setEditForm} onSubmit={saveEdit} submitLabel="Save Changes" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add new card */}
      <div className="border border-line/60 rounded-lg p-4 space-y-3 bg-panel/20">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/50 flex items-center gap-1.5">
          <Plus size={13} /> Add New Category Card
        </p>
        <CardForm value={newForm} onChange={setNewForm} onSubmit={addCard} submitLabel="Add Card" />
      </div>

      {msg && (
        <p className={`text-sm flex items-center gap-1 ${msg.ok ? "text-ok" : "text-bad"}`}>
          {msg.ok && <CheckCircle2 size={14} />} {msg.text}
        </p>
      )}
    </section>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BannerSettingsPage() {
  const { data } = useSWR<Record<string, any>>(SETTINGS_KEY);
  const [form, setForm]         = useState<BannerSettings>(DEFAULTS);
  const [busy, setBusy]         = useState(false);
  const [msg,  setMsg]          = useState<{ text: string; ok: boolean } | null>(null);
  const [heroSlides, setHeroSlides]       = useState<HeroBannerSlide[]>([]);
  const [promoSlides, setPromoSlides]     = useState<PromoBanner[]>([]);
  const [categoryBanners, setCategoryBanners] = useState<CategoryBanner[]>([]);
  const [promoSpeed, setPromoSpeed]       = useState(45);
  const [heroSaving, setHeroSaving]       = useState(false);
  const [promoSaving, setPromoSaving]     = useState(false);
  const [categorySaving, setcategorySaving] = useState(false);
  const [speedSaving, setSpeedSaving]     = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm({
      subBanner:   data.subBanner   ?? DEFAULTS.subBanner,
      siteName:    data.siteName    ?? DEFAULTS.siteName,
      siteTagline: data.siteTagline ?? DEFAULTS.siteTagline,
    });
    setHeroSlides((data.heroBanners ?? []).slice().sort((a: HeroBannerSlide, b: HeroBannerSlide) => a.sortOrder - b.sortOrder));
    setPromoSlides((data.promoBanners ?? []).slice().sort((a: PromoBanner, b: PromoBanner) => a.sortOrder - b.sortOrder));
    setCategoryBanners((data.categoryBanners ?? []).slice().sort((a: CategoryBanner, b: CategoryBanner) => a.sortOrder - b.sortOrder));
    setPromoSpeed(data.promoBannerSpeed ?? 45);
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
    await api.post(SETTINGS_KEY, { promoBanners: updated, promoBannerSpeed: promoSpeed });
    setPromoSlides(updated);
    mutate(SETTINGS_KEY);
    setPromoSaving(false);
  }

  async function savePromoSpeed() {
    setSpeedSaving(true);
    await api.post(SETTINGS_KEY, { promoBannerSpeed: promoSpeed });
    mutate(SETTINGS_KEY);
    setSpeedSaving(false);
  }

  async function saveCategoryBanners(updated: CategoryBanner[]) {
    setcategorySaving(true);
    await api.post(SETTINGS_KEY, { categoryBanners: updated });
    setCategoryBanners(updated);
    mutate(SETTINGS_KEY);
    setcategorySaving(false);
  }

  return (
    <div className="space-y-6 max-w-3xl animate-fade-in">
      <div>
        <h1 className="font-display text-3xl flex items-center gap-2">
          <Megaphone size={28} className="text-accent" />
          Banner Settings
        </h1>
        <p className="text-sm text-white/60 mt-1">
          Control site identity, hero carousel, and promo banner strip.
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

      {/* ── Category Banners (Homepage) ─────────────────────────────────────── */}
      <CategoryCardManager
        banners={categoryBanners}
        saving={categorySaving}
        onSave={saveCategoryBanners}
      />

      {/* ── Promo Banner Strip ─────────────────────────────────────────────── */}
      <section className="glass rounded-lg p-5 space-y-4">
        <h2 className="font-bold text-sm uppercase tracking-wider text-white/70 flex items-center gap-2">
          <Megaphone size={16} className="text-accent" />
          Promo Banner Strip
        </h2>
        <p className="text-xs text-white/40">
          Small scrolling promotional banners shown above the hero carousel. Recommended: 600×200 px. Auto-scroll left continuously.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-white/50 mb-2">Scroll Speed (seconds)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="5"
                max="120"
                value={promoSpeed}
                onChange={e => setPromoSpeed(Number(e.target.value))}
                className="flex-1 h-2 bg-panel/60 rounded-lg appearance-none cursor-pointer accent-accent"
              />
              <span className="text-sm font-semibold text-white/70 w-12 text-right">{promoSpeed}s</span>
            </div>
            <p className="text-xs text-white/40 mt-1">Lower values = faster scrolling (5–120 sec)</p>
          </div>
          <button
            onClick={savePromoSpeed}
            disabled={speedSaving}
            className="px-3 py-2 bg-accent-grad rounded-lg text-xs font-semibold text-ink shadow-glow hover:brightness-110 disabled:opacity-50 transition flex items-center gap-2 w-fit"
          >
            <Save size={14} />
            {speedSaving ? "Saving…" : "Save Speed"}
          </button>
        </div>
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
