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
  { href: "/crash",      label: "CRASH GAMES", emoji: "🚀", enabled: true },
  { href: "/virtual",    label: "VIRTUAL GAME",emoji: "🎮", enabled: true },
  { href: "/vr-games",   label: "VR GAMES",    emoji: "🥽", enabled: true },
  { href: "/slots",      label: "SLOT GAMES",  emoji: "âœ¨", enabled: true },
  { href: "/lottery",    label: "LOTTERY",     emoji: "🎟️", enabled: true },
  { href: "/sportsbook", label: "SPORTS BOOK", emoji: "🎯", enabled: true },
];

const inputCls = "bg-gray-800 border border-yellow-200 rounded px-2 py-1 text-sm text-gray-200 outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-100 transition";

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
    if (moved) next.splice(idx, 0, moved);
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
        <h1 className="text-2xl font-black text-gray-100">Nav Bar</h1>
        <div className="h-40 animate-pulse bg-gray-700 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black text-gray-100 flex items-center gap-3">
          <Navigation size={24} /> Navigation Bar
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Manage the top navigation tabs shown to all users. Drag to reorder, toggle visibility, or edit labels and links.
        </p>
      </div>

      {msg && (
        <div className={`text-sm px-4 py-2.5 rounded-lg border font-medium ${
          msg.ok ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-600"
        }`}>
          {msg.text}
        </div>
      )}

      {/* Items list */}
      <section className="rounded-xl border border-yellow-100 bg-gray-800 p-5 space-y-2 shadow-sm">
        {current.map((item, idx) => (
          <div
            key={idx}
            draggable
            onDragStart={() => onDragStart(idx)}
            onDragOver={(e) => onDragOver(e, idx)}
            onDragEnd={onDragEnd}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition ${
              dragIdx === idx ? "border-yellow-400 bg-gray-800" : "border-gray-100 bg-gray-800 hover:border-yellow-200"
            }`}
          >
            <GripVertical size={16} className="text-gray-400 cursor-grab shrink-0" />

            <input
              type="text"
              value={item.emoji}
              onChange={(e) => update(idx, { emoji: e.target.value })}
              className={`w-10 text-center text-lg ${inputCls}`}
            />

            <input
              type="text"
              value={item.label}
              onChange={(e) => update(idx, { label: e.target.value })}
              className={`flex-1 font-bold uppercase ${inputCls}`}
            />

            <input
              type="text"
              value={item.href}
              onChange={(e) => update(idx, { href: e.target.value })}
              className={`w-36 text-gray-500 ${inputCls}`}
            />

            <button
              onClick={() => update(idx, { enabled: !item.enabled })}
              className={`shrink-0 transition ${item.enabled ? "text-emerald-500" : "text-gray-400"}`}
              title={item.enabled ? "Visible – click to hide" : "Hidden – click to show"}
            >
              {item.enabled ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>

            <button onClick={() => remove(idx)} className="shrink-0 text-gray-400 hover:text-red-500 transition">
              <Trash2 size={16} />
            </button>
          </div>
        ))}

        {current.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">No nav items. Add one below.</p>
        )}
      </section>

      {/* Add new item */}
      <section className="rounded-xl border border-yellow-100 bg-gray-800 p-5 shadow-sm">
        <h2 className="text-base font-black text-gray-200 mb-3 flex items-center gap-2"><Plus size={16} /> Add Item</h2>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="🎮"
            value={newItem.emoji}
            onChange={(e) => setNewItem(p => ({ ...p, emoji: e.target.value }))}
            className={`w-12 text-center ${inputCls}`}
          />
          <input
            type="text"
            placeholder="LABEL"
            value={newItem.label}
            onChange={(e) => setNewItem(p => ({ ...p, label: e.target.value.toUpperCase() }))}
            className={`flex-1 font-bold ${inputCls}`}
          />
          <input
            type="text"
            placeholder="/path"
            value={newItem.href}
            onChange={(e) => setNewItem(p => ({ ...p, href: e.target.value }))}
            className={`w-36 text-gray-500 ${inputCls}`}
          />
          <button
            onClick={addItem}
            disabled={!newItem.href || !newItem.label}
            className="shrink-0 flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-yellow-400 to-amber-500 px-4 py-1.5 font-bold text-gray-100 text-sm disabled:opacity-40 hover:brightness-110 transition"
          >
            <Plus size={14} /> Add
          </button>
        </div>
      </section>

      <button
        onClick={save}
        disabled={busy}
        className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-yellow-400 to-amber-500 px-6 py-2.5 font-bold text-gray-100 shadow-sm disabled:opacity-40 hover:brightness-110 transition"
      >
        <Save size={16} />
        {busy ? "Saving…" : "Save Navigation"}
      </button>
    </div>
  );
}
