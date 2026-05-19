"use client";
import useSWR, { mutate } from "swr";
import { useState } from "react";
import { api } from "@/lib/api";
import { Navigation, Plus, Trash2, GripVertical, Eye, EyeOff, Save } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  emoji: string;
  enabled: boolean;
}

interface PlatformSettings {
  navItems?: NavItem[];
}

const SETTINGS_KEY = "/admin/platform-settings";

const DEFAULT_ITEMS: NavItem[] = [
  { href: "/exchange",   label: "EXCHANGE",    emoji: "🎰", enabled: true },
  { href: "/casino",     label: "LIVE CASINO", emoji: "🎲", enabled: true },
  { href: "/crash",      label: "CRASH GAMES", emoji: "🚀", enabled: true },
  { href: "/virtual",    label: "VIRTUAL GAME",emoji: "🎮", enabled: true },
  { href: "/vr-games",   label: "VR GAMES",    emoji: "🥽", enabled: true },
  { href: "/slots",      label: "SLOT GAMES",  emoji: "✨", enabled: true },
  { href: "/lottery",    label: "LOTTERY",     emoji: "🎟️", enabled: true },
  { href: "/sportsbook", label: "SPORTS BOOK", emoji: "🎯", enabled: true },
];

export default function NavSettingsPage() {
  const { data, isLoading } = useSWR<PlatformSettings>(SETTINGS_KEY);
  const [items, setItems] = useState<NavItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [newItem, setNewItem] = useState<NavItem>({ href: "", label: "", emoji: "🎮", enabled: true });

  const current: NavItem[] = items ?? data?.navItems ?? DEFAULT_ITEMS;

  function update(idx: number, patch: Partial<NavItem>) {
    setItems(current.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function remove(idx: number) {
    setItems(current.filter((_, i) => i !== idx));
  }

  function addItem() {
    if (!newItem.href || !newItem.label) return;
    const href = newItem.href.startsWith("/") ? newItem.href : "/" + newItem.href;
    setItems([...current, { ...newItem, href }]);
    setNewItem({ href: "", label: "", emoji: "🎮", enabled: true });
  }

  function onDragStart(idx: number) { setDragIdx(idx); }
  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const next = [...current];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(idx, 0, moved);
    setItems(next);
    setDragIdx(idx);
  }
  function onDragEnd() { setDragIdx(null); }

  async function save() {
    setBusy(true); setMsg(null);
    try {
      await api.post(SETTINGS_KEY, { navItems: current });
      mutate(SETTINGS_KEY);
      setItems(null);
      setMsg({ text: "Navigation saved successfully.", ok: true });
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message || "Failed to save.", ok: false });
    } finally { setBusy(false); }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-4xl">Nav Bar</h1>
        <div className="h-40 animate-pulse bg-panel/60 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="font-display text-4xl flex items-center gap-3">
        <Navigation size={32} /> Navigation Bar
      </h1>
      <p className="text-sm text-white/50">
        Manage the top navigation tabs shown to all users. Drag to reorder, toggle visibility, or edit labels and links.
      </p>

      {msg && (
        <div className={`text-sm px-4 py-2.5 rounded-lg border ${msg.ok ? "bg-ok/10 border-ok/30 text-ok" : "bg-bad/10 border-bad/30 text-bad"}`}>
          {msg.text}
        </div>
      )}

      {/* Items list */}
      <section className="rounded-xl border border-line bg-panel/60 p-5 space-y-2">
        {current.map((item, idx) => (
          <div
            key={idx}
            draggable
            onDragStart={() => onDragStart(idx)}
            onDragOver={(e) => onDragOver(e, idx)}
            onDragEnd={onDragEnd}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition ${
              dragIdx === idx ? "border-accent bg-accent/5" : "border-line bg-black/20 hover:border-white/20"
            }`}
          >
            <GripVertical size={16} className="text-white/30 cursor-grab shrink-0" />

            {/* Emoji */}
            <input
              type="text"
              value={item.emoji}
              onChange={(e) => update(idx, { emoji: e.target.value })}
              className="w-10 bg-transparent text-center text-lg outline-none border border-line rounded px-1"
            />

            {/* Label */}
            <input
              type="text"
              value={item.label}
              onChange={(e) => update(idx, { label: e.target.value })}
              className="flex-1 bg-transparent border border-line rounded px-2 py-1 text-sm font-bold uppercase outline-none focus:border-accent"
            />

            {/* Href */}
            <input
              type="text"
              value={item.href}
              onChange={(e) => update(idx, { href: e.target.value })}
              className="w-36 bg-transparent border border-line rounded px-2 py-1 text-sm text-white/60 outline-none focus:border-accent"
            />

            {/* Toggle visibility */}
            <button
              onClick={() => update(idx, { enabled: !item.enabled })}
              className={`shrink-0 transition ${item.enabled ? "text-ok" : "text-white/30"}`}
              title={item.enabled ? "Visible — click to hide" : "Hidden — click to show"}
            >
              {item.enabled ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>

            {/* Delete */}
            <button
              onClick={() => remove(idx)}
              className="shrink-0 text-white/30 hover:text-bad transition"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}

        {current.length === 0 && (
          <p className="text-sm text-white/40 text-center py-4">No nav items. Add one below.</p>
        )}
      </section>

      {/* Add new item */}
      <section className="rounded-xl border border-line bg-panel/60 p-5">
        <h2 className="font-display text-lg mb-3 flex items-center gap-2"><Plus size={16} /> Add Item</h2>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="🎮"
            value={newItem.emoji}
            onChange={(e) => setNewItem(p => ({ ...p, emoji: e.target.value }))}
            className="w-12 text-center bg-black/40 border border-line rounded px-1 py-1.5 text-sm outline-none focus:border-accent"
          />
          <input
            type="text"
            placeholder="LABEL"
            value={newItem.label}
            onChange={(e) => setNewItem(p => ({ ...p, label: e.target.value.toUpperCase() }))}
            className="flex-1 bg-black/40 border border-line rounded px-2 py-1.5 text-sm font-bold outline-none focus:border-accent"
          />
          <input
            type="text"
            placeholder="/path"
            value={newItem.href}
            onChange={(e) => setNewItem(p => ({ ...p, href: e.target.value }))}
            className="w-36 bg-black/40 border border-line rounded px-2 py-1.5 text-sm text-white/60 outline-none focus:border-accent"
          />
          <button
            onClick={addItem}
            disabled={!newItem.href || !newItem.label}
            className="shrink-0 flex items-center gap-1.5 rounded-md bg-accent-grad px-4 py-1.5 font-bold text-ink text-sm disabled:opacity-40"
          >
            <Plus size={14} /> Add
          </button>
        </div>
      </section>

      <button
        onClick={save}
        disabled={busy}
        className="flex items-center gap-2 rounded-md bg-accent-grad px-6 py-2.5 font-bold text-ink shadow-glow disabled:opacity-40 hover:brightness-110 transition"
      >
        <Save size={16} />
        {busy ? "Saving…" : "Save Navigation"}
      </button>
    </div>
  );
}
