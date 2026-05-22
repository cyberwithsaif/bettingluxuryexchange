"use client";
import { useState, useEffect } from "react";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import { Save, CheckCircle2, Plus, Trash2, GripVertical, Layout, Megaphone } from "lucide-react";

interface CategoryBanner {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  emoji: string;
  gradient: string;
  sortOrder: number;
}

interface SiteSettings {
  siteName: string;
  siteTagline: string;
}

const SETTINGS_KEY = "/admin/platform-settings";
const DEFAULTS: SiteSettings = { siteName: "DiamondPlay22", siteTagline: "Bet & Win" };
const EMPTY_CAT: Omit<CategoryBanner, "id" | "sortOrder"> = {
  title: "", subtitle: "", href: "/casino", emoji: "🎰",
  gradient: "linear-gradient(135deg,#3d0810 0%,#6b0e1a 40%,#1a0408 100%)",
};

const GRADIENT_PRESETS = [
  { label: "Casino Red",  value: "linear-gradient(135deg,#3d0810 0%,#6b0e1a 40%,#1a0408 100%)" },
  { label: "Sports Blue", value: "linear-gradient(135deg,#0a1535 0%,#162a60 40%,#040c1a 100%)" },
  { label: "Green",       value: "linear-gradient(135deg,#0a3d1a 0%,#0e6b30 40%,#041a08 100%)" },
  { label: "Purple",      value: "linear-gradient(135deg,#2d0a5c 0%,#4e0e8c 40%,#1a0430 100%)" },
  { label: "Gold",        value: "linear-gradient(135deg,#3d2d00 0%,#6b4e0a 40%,#1a1200 100%)" },
];

const inputCls = "w-full bg-white border border-yellow-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-100 transition";

function CardForm({ value, onChange, onSubmit, label, saving }: {
  value: Omit<CategoryBanner, "id" | "sortOrder">;
  onChange: (v: Omit<CategoryBanner, "id" | "sortOrder">) => void;
  onSubmit: () => void;
  label: string;
  saving: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Title <span className="text-red-400">*</span></label>
          <input value={value.title} onChange={e => onChange({ ...value, title: e.target.value })} placeholder="Casino" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Subtitle</label>
          <input value={value.subtitle} onChange={e => onChange({ ...value, subtitle: e.target.value })} placeholder="Thousands of Games" className={inputCls} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Link</label>
          <input value={value.href} onChange={e => onChange({ ...value, href: e.target.value })} placeholder="/casino" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Emoji</label>
          <input value={value.emoji} onChange={e => onChange({ ...value, emoji: e.target.value })} placeholder="🎰" className={inputCls} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Background Gradient</label>
        <div className="flex gap-2 flex-wrap mb-2">
          {GRADIENT_PRESETS.map(p => (
            <button key={p.label} type="button" onClick={() => onChange({ ...value, gradient: p.value })}
              className="px-2.5 py-1 rounded text-[11px] font-semibold transition"
              style={{
                background: p.value,
                border: value.gradient === p.value ? "2px solid #f59e0b" : "1px solid rgba(0,0,0,0.1)",
                color: "white",
              }}>
              {p.label}
            </button>
          ))}
        </div>
        <input value={value.gradient} onChange={e => onChange({ ...value, gradient: e.target.value })} placeholder="linear-gradient(135deg,...)" className={inputCls} />
        <div className="mt-2 h-10 rounded-lg border border-gray-200 transition-all" style={{ background: value.gradient }} />
      </div>
      <button type="button" onClick={onSubmit} disabled={saving}
        className="flex items-center gap-2 bg-gradient-to-r from-yellow-400 to-amber-500 px-4 py-2 rounded-lg font-bold text-slate-900 text-sm shadow-sm hover:brightness-110 disabled:opacity-50 transition">
        <Save size={14} />
        {saving ? "Saving…" : label}
      </button>
    </div>
  );
}

export default function BannerSettingsPage() {
  const { data } = useSWR<Record<string, any>>(SETTINGS_KEY);

  const [siteForm, setSiteForm] = useState<SiteSettings>(DEFAULTS);
  const [siteBusy, setSiteBusy] = useState(false);
  const [siteMsg, setSiteMsg]   = useState<{ text: string; ok: boolean } | null>(null);

  const [banners, setBanners]     = useState<CategoryBanner[]>([]);
  const [saving, setSaving]       = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm]   = useState<Omit<CategoryBanner, "id" | "sortOrder">>(EMPTY_CAT);
  const [newForm, setNewForm]     = useState<Omit<CategoryBanner, "id" | "sortOrder">>(EMPTY_CAT);
  const [catMsg, setCatMsg]       = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!data) return;
    setSiteForm({ siteName: data.siteName ?? DEFAULTS.siteName, siteTagline: data.siteTagline ?? DEFAULTS.siteTagline });
    setBanners((data.categoryBanners ?? []).slice().sort((a: CategoryBanner, b: CategoryBanner) => a.sortOrder - b.sortOrder));
  }, [data]);

  async function saveSite() {
    setSiteBusy(true); setSiteMsg(null);
    try {
      await api.post(SETTINGS_KEY, siteForm);
      mutate(SETTINGS_KEY);
      setSiteMsg({ text: "Saved!", ok: true });
    } catch { setSiteMsg({ text: "Failed to save.", ok: false }); }
    finally { setSiteBusy(false); }
  }

  async function saveBanners(updated: CategoryBanner[]) {
    setSaving(true);
    await api.post(SETTINGS_KEY, { categoryBanners: updated });
    setBanners(updated);
    mutate(SETTINGS_KEY);
    setSaving(false);
  }

  async function addCard() {
    if (!newForm.title) { setCatMsg({ text: "Title is required.", ok: false }); return; }
    const card: CategoryBanner = { id: Date.now().toString(), sortOrder: banners.length, ...newForm };
    await saveBanners([...banners, card]);
    setNewForm(EMPTY_CAT);
    setCatMsg({ text: "Card added!", ok: true });
    setTimeout(() => setCatMsg(null), 3000);
  }

  async function saveEdit() {
    const updated = banners.map(c => c.id === editingId ? { ...c, ...editForm } : c);
    await saveBanners(updated);
    setEditingId(null);
    setCatMsg({ text: "Card updated!", ok: true });
    setTimeout(() => setCatMsg(null), 3000);
  }

  async function remove(id: string) {
    await saveBanners(banners.filter(c => c.id !== id).map((c, k) => ({ ...c, sortOrder: k })));
  }

  async function move(i: number, dir: -1 | 1) {
    const updated = [...banners];
    const j = i + dir;
    [updated[i], updated[j]] = [updated[j]!, updated[i]!];
    updated.forEach((c, k) => { c.sortOrder = k; });
    await saveBanners(updated);
  }

  return (
    <div className="space-y-6 max-w-3xl animate-fade-in">
      <div>
        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <Megaphone size={24} className="text-yellow-500" />
          Banner Settings
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">Manage homepage category cards and site identity.</p>
      </div>

      {/* Category Cards */}
      <section className="rounded-xl border border-yellow-100 bg-white p-5 space-y-4 shadow-sm">
        <div>
          <h2 className="font-black text-gray-800 text-sm uppercase tracking-wider flex items-center gap-2">
            <Layout size={16} className="text-yellow-500" />
            Category Cards (Homepage)
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            The large Casino & Sports Betting cards shown at the top of the homepage.
            Size: <span className="text-gray-600 font-semibold">~680 × 140 px</span> each.
          </p>
        </div>

        <div className="space-y-2">
          {banners.length === 0 && (
            <div className="text-xs text-gray-400 py-6 text-center border border-dashed border-gray-200 rounded-lg">
              No cards saved — defaults (Casino & Sports Betting) are showing on homepage.
            </div>
          )}
          {banners.map((cat, i) => (
            <div key={cat.id} className="border border-yellow-100 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 p-3 bg-gray-50">
                <GripVertical size={16} className="text-gray-300 shrink-0" />
                <div className="w-20 h-9 rounded-lg overflow-hidden shrink-0 border border-gray-200" style={{ background: cat.gradient }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{cat.emoji} {cat.title}</p>
                  <p className="text-xs text-gray-400 truncate">{cat.subtitle} · <span className="text-gray-300">{cat.href}</span></p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button disabled={i === 0} onClick={() => move(i, -1)}
                    className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 disabled:opacity-30 text-gray-500 text-xs">↑</button>
                  <button disabled={i === banners.length - 1} onClick={() => move(i, 1)}
                    className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 disabled:opacity-30 text-gray-500 text-xs">↓</button>
                  <button
                    onClick={() => {
                      if (editingId === cat.id) { setEditingId(null); }
                      else { setEditingId(cat.id); setEditForm({ title: cat.title, subtitle: cat.subtitle, href: cat.href, emoji: cat.emoji, gradient: cat.gradient }); }
                    }}
                    className="px-2.5 h-7 flex items-center justify-center rounded text-xs font-semibold transition"
                    style={{
                      color: editingId === cat.id ? "#ef4444" : "#7c3aed",
                      background: editingId === cat.id ? "rgba(239,68,68,0.08)" : "rgba(124,58,237,0.08)",
                    }}
                  >
                    {editingId === cat.id ? "Cancel" : "Edit"}
                  </button>
                  <button onClick={() => remove(cat.id)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {editingId === cat.id && (
                <div className="p-4 bg-white border-t border-yellow-100">
                  <CardForm value={editForm} onChange={setEditForm} onSubmit={saveEdit} label="Save Changes" saving={saving} />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="border border-yellow-100 rounded-xl p-4 space-y-3 bg-gray-50">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
            <Plus size={13} /> Add New Card
          </p>
          <CardForm value={newForm} onChange={setNewForm} onSubmit={addCard} label="Add Card" saving={saving} />
        </div>

        {catMsg && (
          <p className={`text-sm flex items-center gap-1.5 font-medium ${catMsg.ok ? "text-emerald-600" : "text-red-500"}`}>
            {catMsg.ok && <CheckCircle2 size={14} />} {catMsg.text}
          </p>
        )}
      </section>

      {/* Site Identity */}
      <section className="rounded-xl border border-yellow-100 bg-white p-5 space-y-4 shadow-sm">
        <div>
          <h2 className="font-black text-gray-800 text-sm uppercase tracking-wider">Site Identity</h2>
          <p className="text-xs text-gray-400 mt-0.5">Used in the sidebar logo and browser tab title.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Site Name</label>
            <input value={siteForm.siteName} onChange={e => setSiteForm(p => ({ ...p, siteName: e.target.value }))} placeholder="DiamondPlay22" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Site Tagline</label>
            <input value={siteForm.siteTagline} onChange={e => setSiteForm(p => ({ ...p, siteTagline: e.target.value }))} placeholder="Bet & Win" className={inputCls} />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={saveSite}
            disabled={siteBusy}
            className="flex items-center gap-2 bg-gradient-to-r from-yellow-400 to-amber-500 px-5 py-2 rounded-lg font-bold text-slate-900 text-sm shadow-sm hover:brightness-110 disabled:opacity-50 transition"
          >
            <Save size={15} />
            {siteBusy ? "Saving…" : "Save"}
          </button>
          {siteMsg && (
            <p className={`text-sm flex items-center gap-1 font-medium ${siteMsg.ok ? "text-emerald-600" : "text-red-500"}`}>
              {siteMsg.ok && <CheckCircle2 size={14} />} {siteMsg.text}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
