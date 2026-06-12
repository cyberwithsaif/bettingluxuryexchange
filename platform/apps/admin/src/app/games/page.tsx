"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, GlassCard } from "@/components/ui";
import {
  ArrowUp, ArrowDown, Upload, Save, Star, Trash2, Plus,
  RefreshCw, Home, LayoutGrid,
} from "lucide-react";

interface Game {
  id: string;
  name: string;
  description: string;
  href: string;
  thumbnail: string | null;
  emoji: string;
  bg: string;
  sortOrder: number;
  featured?: boolean;
}

// Built-in games can be edited & hidden from the homepage but not deleted —
// the API re-merges missing defaults back on every read.
const BUILTIN_IDS = new Set(["roulette", "mines", "plinko", "baloon", "dice", "towers", "coin", "chicken-road", "crash", "slots", "lottery"]);

const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function GamesPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [add, setAdd] = useState({ name: "", href: "", emoji: "🎮" });
  const fileTarget = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/platform-settings");
      const list: Game[] = (data?.inhouseGames ?? []).map((g: Game, i: number) => ({ featured: true, ...g, sortOrder: i }));
      setGames(list.sort((a, b) => a.sortOrder - b.sortOrder));
      setDirty(false);
    } catch {
      setMsg({ ok: false, text: "Failed to load games" });
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function patch(id: string, p: Partial<Game>) {
    setGames(gs => gs.map(g => (g.id === id ? { ...g, ...p } : g)));
    setDirty(true);
  }

  function move(idx: number, dir: -1 | 1) {
    setGames(gs => {
      const next = [...gs];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return gs;
      [next[idx], next[j]] = [next[j]!, next[idx]!];
      return next;
    });
    setDirty(true);
  }

  function removeGame(id: string) {
    setGames(gs => gs.filter(g => g.id !== id));
    setDirty(true);
  }

  function addGame() {
    const name = add.name.trim();
    const href = add.href.trim();
    if (!name || !href) { setMsg({ ok: false, text: "Name and link are required" }); return; }
    const id = slug(name) || `game-${games.length + 1}`;
    if (games.some(g => g.id === id)) { setMsg({ ok: false, text: `A game with id "${id}" already exists` }); return; }
    setGames(gs => [...gs, {
      id, name, description: "", href: href.startsWith("/") ? href : `/${href}`,
      thumbnail: null, emoji: add.emoji || "🎮",
      bg: "linear-gradient(135deg,#1a1433 0%,#3b0a6e 100%)",
      sortOrder: gs.length, featured: false,
    }]);
    setAdd({ name: "", href: "", emoji: "🎮" });
    setShowAdd(false);
    setDirty(true);
  }

  function pickFile(id: string) {
    fileTarget.current = id;
    fileInput.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    const id = fileTarget.current;
    e.target.value = "";
    if (!f || !id) return;
    setUploadingId(id);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await api.post("/admin/upload?type=thumbnail", fd, { timeout: 60_000 });
      if (data?.url) patch(id, { thumbnail: data.url });
      setMsg({ ok: true, text: "Thumbnail uploaded — remember to Save." });
    } catch (err: any) {
      setMsg({ ok: false, text: err?.response?.data?.message || "Upload failed" });
    } finally { setUploadingId(null); }
  }

  async function saveAll() {
    setBusy(true); setMsg(null);
    try {
      const payload = games.map((g, i) => ({ ...g, sortOrder: i }));
      await api.post("/admin/platform-settings", { inhouseGames: payload });
      setGames(payload);
      setDirty(false);
      setMsg({ ok: true, text: "Saved — live on the site within seconds." });
    } catch (err: any) {
      setMsg({ ok: false, text: err?.response?.data?.message || "Save failed" });
    } finally { setBusy(false); }
  }

  const featuredCount = games.filter(g => g.featured !== false).length;

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title="Casino Games" subtitle="Edit thumbnails & details, feature games on the homepage, and set the display order" />

      {/* hidden shared file input */}
      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={onFile} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={saveAll} disabled={busy || !dirty}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-red-500 to-red-600 hover:brightness-110 disabled:opacity-40 transition">
          <Save size={15} /> {busy ? "Saving…" : dirty ? "Save Changes" : "Saved"}
        </button>
        <button onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-gray-200 border border-gray-600 hover:border-gray-400 transition">
          <Plus size={15} /> Add Game
        </button>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-gray-400 border border-gray-700 hover:text-white transition">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Reload
        </button>
        {msg && <span className={`text-xs font-semibold ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</span>}
      </div>

      {/* Legend */}
      <div className="rounded-xl px-4 py-3 border text-xs text-gray-400 leading-relaxed flex flex-wrap gap-x-6 gap-y-1"
        style={{ background: "rgba(59,130,246,0.06)", borderColor: "rgba(59,130,246,0.25)" }}>
        <span className="flex items-center gap-1.5"><Home size={12} className="text-yellow-400" /> <b className="text-gray-300">Featured</b> = shown on the homepage carousel &amp; mobile strip ({featuredCount} featured)</span>
        <span className="flex items-center gap-1.5"><LayoutGrid size={12} className="text-sky-400" /> Order below = display order on the casino page <b className="text-gray-300">and</b> the homepage</span>
      </div>

      {/* Add form */}
      {showAdd && (
        <GlassCard className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">Name</label>
            <input value={add.name} onChange={e => setAdd({ ...add, name: e.target.value })} placeholder="My Game"
              className="bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-yellow-400/60 w-44" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">Link (page path)</label>
            <input value={add.href} onChange={e => setAdd({ ...add, href: e.target.value })} placeholder="/my-game"
              className="bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-yellow-400/60 w-44" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">Emoji</label>
            <input value={add.emoji} onChange={e => setAdd({ ...add, emoji: e.target.value.slice(0, 4) })}
              className="bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-yellow-400/60 w-16 text-center" />
          </div>
          <button onClick={addGame} className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:brightness-110 transition">Add</button>
        </GlassCard>
      )}

      {/* Games list */}
      {loading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl bg-white/[0.04] animate-pulse" />)}</div>
      ) : (
        <div className="space-y-2">
          {games.map((g, idx) => (
            <GlassCard key={g.id} className="p-3 md:p-4">
              <div className="flex flex-wrap md:flex-nowrap items-center gap-3 md:gap-4">

                {/* Order controls */}
                <div className="flex md:flex-col items-center gap-1 shrink-0">
                  <button onClick={() => move(idx, -1)} disabled={idx === 0}
                    className="p-1.5 rounded-md border border-gray-700 text-gray-400 hover:text-white disabled:opacity-25 transition"><ArrowUp size={13} /></button>
                  <span className="text-[10px] text-gray-500 font-bold w-6 text-center">#{idx + 1}</span>
                  <button onClick={() => move(idx, 1)} disabled={idx === games.length - 1}
                    className="p-1.5 rounded-md border border-gray-700 text-gray-400 hover:text-white disabled:opacity-25 transition"><ArrowDown size={13} /></button>
                </div>

                {/* Thumb */}
                <div className="shrink-0 relative">
                  <div className="w-[64px] h-[84px] rounded-lg overflow-hidden border border-gray-700 flex items-center justify-center text-2xl"
                    style={{ background: g.thumbnail ? "#0f1320" : g.bg }}>
                    {g.thumbnail
                      ? <img src={g.thumbnail} alt={g.name} className="w-full h-full object-cover" />
                      : <span>{g.emoji}</span>}
                  </div>
                  <button onClick={() => pickFile(g.id)} disabled={uploadingId === g.id}
                    className="absolute -bottom-2 -right-2 p-1.5 rounded-full bg-sky-600 hover:brightness-110 text-white shadow disabled:opacity-50"
                    title="Upload thumbnail">
                    {uploadingId === g.id ? <RefreshCw size={12} className="animate-spin" /> : <Upload size={12} />}
                  </button>
                </div>

                {/* Fields */}
                <div className="flex-1 min-w-[230px] grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="flex gap-2">
                    <input value={g.emoji} onChange={e => patch(g.id, { emoji: e.target.value.slice(0, 4) })} title="Emoji"
                      className="w-12 bg-gray-900/60 border border-gray-700 rounded-lg px-1 py-1.5 text-sm text-center text-gray-200 outline-none focus:border-yellow-400/60" />
                    <input value={g.name} onChange={e => patch(g.id, { name: e.target.value })} placeholder="Name"
                      className="flex-1 bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-1.5 text-sm font-bold text-gray-100 outline-none focus:border-yellow-400/60" />
                  </div>
                  <input value={g.description} onChange={e => patch(g.id, { description: e.target.value })} placeholder="Short description"
                    className="bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 outline-none focus:border-yellow-400/60" />
                  <input value={g.thumbnail ?? ""} onChange={e => patch(g.id, { thumbnail: e.target.value || null })} placeholder="Thumbnail URL (or use upload button)"
                    className="bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-1.5 text-[11px] font-mono text-gray-400 outline-none focus:border-yellow-400/60" />
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-gray-500 shrink-0">Link</span>
                    <input value={g.href} onChange={e => patch(g.id, { href: e.target.value })}
                      className="flex-1 bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-1.5 text-[11px] font-mono text-gray-400 outline-none focus:border-yellow-400/60" />
                  </div>
                </div>

                {/* Featured + delete */}
                <div className="flex md:flex-col items-center gap-2 shrink-0 ml-auto">
                  <button onClick={() => patch(g.id, { featured: !(g.featured !== false) })}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border transition ${
                      g.featured !== false
                        ? "bg-yellow-500/15 border-yellow-400/60 text-yellow-300"
                        : "bg-gray-800/60 border-gray-700 text-gray-500 hover:text-gray-300"}`}
                    title="Show on homepage">
                    <Star size={12} fill={g.featured !== false ? "currentColor" : "none"} />
                    {g.featured !== false ? "Featured" : "Hidden"}
                  </button>
                  {!BUILTIN_IDS.has(g.id) && (
                    <button onClick={() => removeGame(g.id)}
                      className="p-1.5 rounded-md border border-red-900/60 text-red-400/70 hover:text-red-300 transition" title="Remove game">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {dirty && !loading && (
        <div className="sticky bottom-4 flex justify-center">
          <button onClick={saveAll} disabled={busy}
            className="flex items-center gap-2 px-6 py-3 rounded-full text-sm font-black text-white bg-gradient-to-r from-red-500 to-red-600 shadow-2xl hover:brightness-110 disabled:opacity-50 transition">
            <Save size={15} /> {busy ? "Saving…" : "Save Changes"}
          </button>
        </div>
      )}
    </div>
  );
}
