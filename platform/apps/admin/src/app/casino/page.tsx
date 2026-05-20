"use client";
import useSWR, { mutate as globalMutate } from "swr";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";
import { Plus, Trash2, Gamepad2, Pencil, Image, GripVertical, CheckCircle2, AlertCircle } from "lucide-react";

interface Provider { id: string; key: string; name: string; category: string; }
interface Game { id: string; name: string; category: string; thumbnail: string | null; isLive: boolean; sortOrder: number; provider: Provider; }
interface InHouseGame { id: string; name: string; description: string; href: string; thumbnail: string | null; emoji: string; bg: string; sortOrder: number; }

const PROVIDERS_KEY = "/casino/providers";
const GAMES_KEY = "/casino/games?limit=200";
const SETTINGS_KEY = "/admin/platform-settings";

export default function AdminCasinoPage() {
  const { data: providers, isLoading: provLoad } = useSWR<Provider[]>(PROVIDERS_KEY);
  const { data: games,     isLoading: gameLoad } = useSWR<Game[]>(GAMES_KEY);
  const { data: settings } = useSWR<{ inhouseGames?: InHouseGame[] }>(SETTINGS_KEY);
  const [showAddProvider,  setShowAddProvider]  = useState(false);
  const [showAddGame,      setShowAddGame]      = useState(false);
  const [editGame,         setEditGame]         = useState<Game | null>(null);
  const [editInhouse,      setEditInhouse]      = useState<InHouseGame | null>(null);
  const [showAddInhouse,   setShowAddInhouse]   = useState(false);
  const [activeTab, setActiveTab]               = useState<"providers" | "games" | "inhouse">("games");
  const [inhouseSaving,    setInhouseSaving]    = useState(false);
  const [inhouseMsg,       setInhouseMsg]       = useState<{ ok: boolean; text: string } | null>(null);

  const inhouseGames: InHouseGame[] = (settings?.inhouseGames ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);

  async function saveInhouseGames(updated: InHouseGame[]) {
    setInhouseSaving(true);
    setInhouseMsg(null);
    try {
      await api.post(SETTINGS_KEY, { inhouseGames: updated });
      await globalMutate(SETTINGS_KEY);
      setInhouseMsg({ ok: true, text: "Saved!" });
      setTimeout(() => setInhouseMsg(null), 2500);
    } catch {
      setInhouseMsg({ ok: false, text: "Save failed — try again." });
    } finally {
      setInhouseSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display text-4xl">Casino Management</h1>
        <div className="flex gap-2">
          {activeTab === "providers" && (
            <button onClick={() => setShowAddProvider(true)} className="inline-flex items-center gap-2 rounded-md bg-accent-grad px-4 py-2 font-bold text-ink shadow-glow hover:brightness-110">
              <Plus size={16} /> Add Provider
            </button>
          )}
          {activeTab === "games" && (
            <button onClick={() => setShowAddGame(true)} className="inline-flex items-center gap-2 rounded-md bg-accent-grad px-4 py-2 font-bold text-ink shadow-glow hover:brightness-110">
              <Plus size={16} /> Add Game
            </button>
          )}
          {activeTab === "inhouse" && (
            <div className="flex items-center gap-3">
              {inhouseMsg && (
                <span className={`flex items-center gap-1 text-sm font-medium ${inhouseMsg.ok ? "text-ok" : "text-bad"}`}>
                  {inhouseMsg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  {inhouseMsg.text}
                </span>
              )}
              {inhouseSaving && <span className="text-sm text-white/50 animate-pulse">Saving…</span>}
              <button onClick={() => setShowAddInhouse(true)} className="inline-flex items-center gap-2 rounded-md bg-accent-grad px-4 py-2 font-bold text-ink shadow-glow hover:brightness-110">
                <Plus size={16} /> Add In-House Game
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-line">
        {(["games", "inhouse", "providers"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={"px-4 py-2 text-sm font-semibold capitalize border-b-2 transition " + (activeTab === tab ? "border-accent text-white" : "border-transparent text-white/50 hover:text-white")}
          >{tab === "inhouse" ? "In-House Games" : tab}</button>
        ))}
      </div>

      {/* Games Table */}
      {activeTab === "games" && (
        <div className="rounded-xl border border-line bg-panel/60 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-panel text-[10px] uppercase tracking-wider text-white/50">
              <tr><Th>Thumb</Th><Th>Name</Th><Th>Category</Th><Th>Provider</Th><Th>Live</Th><Th>Order</Th><Th>Actions</Th></tr>
            </thead>
            <tbody>
              {gameLoad && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-line/40">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 rounded bg-white/5 animate-pulse" style={{ width: j === 0 ? 36 : "80%" }} />
                    </td>
                  ))}
                </tr>
              ))}
              {!gameLoad && (!games || games.length === 0) && (
                <tr><td colSpan={5} className="text-center py-10 text-white/50">
                  <Gamepad2 size={32} className="mx-auto mb-2 text-white/20" />
                  No games yet. Add a provider and create games above.
                </td></tr>
              )}
              {(games ?? []).map((g) => (
                <tr key={g.id} className="border-t border-line/60 hover:bg-panel2/20">
                  <Td>
                    {g.thumbnail
                      ? <img src={g.thumbnail} alt={g.name} className="w-10 h-12 object-cover rounded border border-line" />
                      : <div className="w-10 h-12 bg-white/5 rounded border border-line flex items-center justify-center"><Image size={14} className="text-white/30" /></div>
                    }
                  </Td>
                  <Td className="font-semibold">{g.name}</Td>
                  <Td className="text-xs text-white/60">{g.category}</Td>
                  <Td>{g.provider.name}</Td>
                  <Td>
                    <span className={"text-[10px] px-2 py-0.5 rounded " + (g.isLive ? "bg-ok/15 text-ok" : "bg-white/5 text-white/40")}>
                      {g.isLive ? "LIVE" : "RNG"}
                    </span>
                  </Td>
                  <Td className="text-xs text-white/50">{g.sortOrder ?? 0}</Td>
                  <Td>
                    <div className="flex gap-1">
                      <button onClick={() => setEditGame(g)} className="p-1.5 rounded border border-line hover:border-accent hover:text-accent transition">
                        <Pencil size={14} />
                      </button>
                      <button onClick={async () => {
                        if (!confirm(`Delete game "${g.name}"?`)) return;
                        await api.delete(`/casino/games/${g.id}`);
                        globalMutate(GAMES_KEY);
                      }} className="p-1.5 rounded border border-line hover:border-bad hover:text-bad transition">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Providers Table */}
      {activeTab === "providers" && (
        <div className="rounded-xl border border-line bg-panel/60 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-panel text-[10px] uppercase tracking-wider text-white/50">
              <tr><Th>Provider</Th><Th>Key</Th><Th>Category</Th><Th>Actions</Th></tr>
            </thead>
            <tbody>
              {provLoad && <tr><td colSpan={4} className="text-center py-8 text-white/50">Loading…</td></tr>}
              {!provLoad && (!providers || providers.length === 0) && (
                <tr><td colSpan={4} className="text-center py-10 text-white/50">No providers yet.</td></tr>
              )}
              {(providers ?? []).map((p) => (
                <tr key={p.id} className="border-t border-line/60 hover:bg-panel2/20">
                  <Td className="font-semibold">{p.name}</Td>
                  <Td className="font-mono text-xs text-white/60">{p.key}</Td>
                  <Td className="text-xs">{p.category}</Td>
                  <Td>
                    <button onClick={async () => {
                      if (!confirm(`Delete provider "${p.name}"? All games will also be removed.`)) return;
                      await api.delete(`/casino/providers/${p.id}`);
                      globalMutate(PROVIDERS_KEY);
                      globalMutate(GAMES_KEY);
                    }} className="p-1.5 rounded border border-line hover:border-bad hover:text-bad transition">
                      <Trash2 size={14} />
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* In-House Games Table */}
      {activeTab === "inhouse" && (
        <div className="rounded-xl border border-line bg-panel/60 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-panel text-[10px] uppercase tracking-wider text-white/50">
              <tr><Th>Order</Th><Th>Thumb / Emoji</Th><Th>Name</Th><Th>Description</Th><Th>Route</Th><Th>Actions</Th></tr>
            </thead>
            <tbody>
              {inhouseGames.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-white/50">
                  <Gamepad2 size={32} className="mx-auto mb-2 text-white/20" />
                  No in-house games yet. Click "Add In-House Game" to create one.
                </td></tr>
              )}
              {inhouseGames.map((g) => (
                <tr key={g.id} className="border-t border-line/60 hover:bg-panel2/20">
                  <Td>
                    <div className="flex items-center gap-1 text-white/40">
                      <GripVertical size={14} />
                      <span className="text-xs">{g.sortOrder}</span>
                    </div>
                  </Td>
                  <Td>
                    {g.thumbnail
                      ? <img src={g.thumbnail} alt={g.name} className="w-10 object-cover rounded-lg border border-line" style={{ aspectRatio: "3/4" }} />
                      : <div className="w-10 rounded-lg border border-line flex items-center justify-center text-xl" style={{ aspectRatio: "3/4", background: g.bg }}>{g.emoji}</div>
                    }
                  </Td>
                  <Td className="font-semibold">{g.name}</Td>
                  <Td className="text-xs text-white/60">{g.description}</Td>
                  <Td className="font-mono text-xs text-white/60">{g.href}</Td>
                  <Td>
                    <div className="flex gap-1">
                      <button onClick={() => setEditInhouse(g)} className="p-1.5 rounded border border-line hover:border-accent hover:text-accent transition">
                        <Pencil size={14} />
                      </button>
                      <button onClick={async () => {
                        if (!confirm(`Delete in-house game "${g.name}"?`)) return;
                        const updated = inhouseGames.filter((x) => x.id !== g.id);
                        await saveInhouseGames(updated);
                      }} className="p-1.5 rounded border border-line hover:border-bad hover:text-bad transition">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddProvider && (
        <AddProviderModal onClose={(saved) => { setShowAddProvider(false); if (saved) globalMutate(PROVIDERS_KEY); }} />
      )}
      {showAddGame && (
        <AddGameModal providers={providers ?? []} onClose={(saved) => { setShowAddGame(false); if (saved) globalMutate(GAMES_KEY); }} />
      )}
      {editGame && (
        <EditGameModal game={editGame} onClose={(saved) => { setEditGame(null); if (saved) globalMutate(GAMES_KEY); }} />
      )}
      {showAddInhouse && (
        <AddInHouseGameModal
          nextOrder={inhouseGames.length}
          onClose={async (game) => { setShowAddInhouse(false); if (game) await saveInhouseGames([...inhouseGames, game]); }}
        />
      )}
      {editInhouse && (
        <EditInHouseGameModal
          game={editInhouse}
          onClose={async (updated) => {
            setEditInhouse(null);
            if (updated) await saveInhouseGames(inhouseGames.map((g) => g.id === updated.id ? updated : g));
          }}
        />
      )}
    </div>
  );
}

function AddProviderModal({ onClose }: { onClose: (saved?: boolean) => void }) {
  const [form, setForm] = useState({ name: "", key: "", category: "casino" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <Modal title="Add Provider" onClose={() => onClose()}>
      <Field label="Provider Name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Evolution Gaming" /></Field>
      <Field label="Provider Key (unique slug)"><input className="input" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase().replace(/\s+/g, "-") })} placeholder="e.g. evolution" /></Field>
      <Field label="Category">
        <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {["casino", "crash", "slots", "virtual", "lottery"].map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      {err && <div className="text-xs text-bad bg-bad/15 border border-bad/40 rounded px-2 py-1.5">{err}</div>}
      <div className="flex gap-2 justify-end pt-1">
        <button onClick={() => onClose()} className="px-4 py-2 rounded border border-line text-sm">Cancel</button>
        <button disabled={busy} onClick={async () => {
          if (!form.name || !form.key) { setErr("Name and key are required."); return; }
          setBusy(true); setErr(null);
          try { await api.post("/casino/providers", form); onClose(true); }
          catch (e: any) { setErr(e?.response?.data?.message || "Failed"); }
          finally { setBusy(false); }
        }} className="px-4 py-2 rounded bg-accent-grad font-bold text-ink shadow-glow disabled:opacity-50 text-sm">
          {busy ? "Saving…" : "Save Provider"}
        </button>
      </div>
    </Modal>
  );
}

function AddGameModal({ providers, onClose }: { providers: Provider[]; onClose: (saved?: boolean) => void }) {
  const [form, setForm] = useState({ name: "", category: "LIVE", providerId: providers[0]?.id ?? "", thumbnail: "", isLive: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <Modal title="Add Game" onClose={() => onClose()}>
      <Field label="Game Name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Teen Patti Gold" /></Field>
      <Field label="Provider">
        <select className="input" value={form.providerId} onChange={(e) => setForm({ ...form, providerId: e.target.value })}>
          {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label="Category">
        <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {["LIVE", "SLOT", "CRASH", "TABLE", "LOTTERY", "VIRTUAL"].map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <ThumbnailField label="Thumbnail URL (optional)" value={form.thumbnail || null} onChange={(v) => setForm({ ...form, thumbnail: v ?? "" })} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.isLive} onChange={(e) => setForm({ ...form, isLive: e.target.checked })} />
        Live dealer game
      </label>
      {err && <div className="text-xs text-bad bg-bad/15 border border-bad/40 rounded px-2 py-1.5">{err}</div>}
      <div className="flex gap-2 justify-end pt-1">
        <button onClick={() => onClose()} className="px-4 py-2 rounded border border-line text-sm">Cancel</button>
        <button disabled={busy} onClick={async () => {
          if (!form.name || !form.providerId) { setErr("Name and provider are required."); return; }
          setBusy(true); setErr(null);
          try { await api.post("/casino/games", { ...form, thumbnail: form.thumbnail || undefined }); onClose(true); }
          catch (e: any) { setErr(e?.response?.data?.message || "Failed"); }
          finally { setBusy(false); }
        }} className="px-4 py-2 rounded bg-accent-grad font-bold text-ink shadow-glow disabled:opacity-50 text-sm">
          {busy ? "Saving…" : "Save Game"}
        </button>
      </div>
    </Modal>
  );
}

function EditGameModal({ game, onClose }: { game: Game; onClose: (saved?: boolean) => void }) {
  const [form, setForm] = useState({ name: game.name, thumbnail: game.thumbnail ?? "", isLive: game.isLive, category: game.category, sortOrder: game.sortOrder ?? 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <Modal title="Edit Game" onClose={() => onClose()}>
      <Field label="Game Name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <ThumbnailField value={form.thumbnail || null} onChange={(v) => setForm({ ...form, thumbnail: v ?? "" })} />
      <Field label="Category">
        <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {["LIVE", "SLOT", "CRASH", "TABLE", "LOTTERY", "VIRTUAL"].map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Sort Order (lower = first)"><input className="input" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} /></Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.isLive} onChange={(e) => setForm({ ...form, isLive: e.target.checked })} />
        Live dealer game
      </label>
      {err && <div className="text-xs text-bad bg-bad/15 border border-bad/40 rounded px-2 py-1.5">{err}</div>}
      <div className="flex gap-2 justify-end pt-1">
        <button onClick={() => onClose()} className="px-4 py-2 rounded border border-line text-sm">Cancel</button>
        <button disabled={busy} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            await api.patch(`/casino/games/${game.id}`, { ...form, thumbnail: form.thumbnail || null });
            onClose(true);
          } catch (e: any) { setErr(e?.response?.data?.message || "Failed"); }
          finally { setBusy(false); }
        }} className="px-4 py-2 rounded bg-accent-grad font-bold text-ink shadow-glow disabled:opacity-50 text-sm">
          {busy ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </Modal>
  );
}

function AddInHouseGameModal({ nextOrder, onClose }: { nextOrder: number; onClose: (game?: InHouseGame) => void }) {
  const [form, setForm] = useState<InHouseGame>({
    id: "", name: "", description: "", href: "", thumbnail: null, emoji: "🎮",
    bg: "linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)", sortOrder: nextOrder,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <Modal title="Add In-House Game" onClose={() => onClose()}>
      <Field label="ID (unique slug, e.g. roulette)">
        <input className="input" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value.toLowerCase().replace(/\s+/g, "-") })} placeholder="e.g. roulette" />
      </Field>
      <Field label="Name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Roulette" /></Field>
      <Field label="Description"><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. European Roulette" /></Field>
      <Field label="Route (href)"><input className="input" value={form.href} onChange={(e) => setForm({ ...form, href: e.target.value })} placeholder="e.g. /roulette" /></Field>
      <ThumbnailField value={form.thumbnail} onChange={(v) => setForm({ ...form, thumbnail: v })} />
      <Field label="Emoji (fallback when no thumbnail)"><input className="input" value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} placeholder="🎮" /></Field>
      <Field label="Background gradient (fallback)"><input className="input" value={form.bg} onChange={(e) => setForm({ ...form, bg: e.target.value })} placeholder="linear-gradient(135deg,#000 0%,#111 100%)" /></Field>
      <Field label="Sort Order (lower = first)"><input className="input" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} /></Field>
      {err && <div className="text-xs text-bad bg-bad/15 border border-bad/40 rounded px-2 py-1.5">{err}</div>}
      <div className="flex gap-2 justify-end pt-1">
        <button onClick={() => onClose()} className="px-4 py-2 rounded border border-line text-sm">Cancel</button>
        <button disabled={busy} onClick={async () => {
          if (!form.thumbnail) { setErr("Thumbnail is required."); return; }
          setBusy(true); setErr(null);
          try { onClose(form); }
          catch (e: any) { setErr("Failed"); setBusy(false); }
        }} className="px-4 py-2 rounded bg-accent-grad font-bold text-ink shadow-glow disabled:opacity-50 text-sm">
          {busy ? "Saving…" : "Add Game"}
        </button>
      </div>
    </Modal>
  );
}

function EditInHouseGameModal({ game, onClose }: { game: InHouseGame; onClose: (updated?: InHouseGame) => void }) {
  const [form, setForm] = useState<InHouseGame>({ ...game });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <Modal title="Edit In-House Game" onClose={() => onClose()}>
      <Field label="Name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Description"><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <Field label="Route (href)"><input className="input" value={form.href} onChange={(e) => setForm({ ...form, href: e.target.value })} /></Field>
      <ThumbnailField value={form.thumbnail} onChange={(v) => setForm({ ...form, thumbnail: v })} />
      <Field label="Emoji (fallback when no thumbnail)"><input className="input" value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} /></Field>
      <Field label="Background gradient (fallback)"><input className="input" value={form.bg} onChange={(e) => setForm({ ...form, bg: e.target.value })} /></Field>
      <Field label="Sort Order (lower = first)"><input className="input" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} /></Field>
      {err && <div className="text-xs text-bad bg-bad/15 border border-bad/40 rounded px-2 py-1.5">{err}</div>}
      <div className="flex gap-2 justify-end pt-1">
        <button onClick={() => onClose()} className="px-4 py-2 rounded border border-line text-sm">Cancel</button>
        <button disabled={busy} onClick={async () => {
          if (!form.thumbnail) { setErr("Thumbnail is required."); return; }
          setBusy(true); setErr(null);
          try { onClose(form); }
          catch (e: any) { setErr("Failed"); setBusy(false); }
        }} className="px-4 py-2 rounded bg-accent-grad font-bold text-ink shadow-glow disabled:opacity-50 text-sm">
          {busy ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-panel p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="font-display text-2xl">{title}</h2>
        {children}
        <style jsx>{`
          :global(.input){width:100%;background:#0d0e15;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:9px 11px;font-size:14px;color:#e6e7eb}
          :global(.input:focus){outline:none;border-color:#ff7a18}
        `}</style>
      </div>
    </div>
  );
}

function ThumbnailField({ value, onChange, label = "Thumbnail URL (optional, overrides emoji)" }: { value: string | null; onChange: (url: string | null) => void; label?: string }) {
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);           // 0-100
  const [etaSec, setEtaSec]     = useState<number | null>(null);
  const [bytesPerSec, setBps]   = useState(0);
  const [phase, setPhase]       = useState<"uploading" | "processing" | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadErr(null); setProgress(0); setEtaSec(null); setBps(0); setPhase("uploading");

    const fd = new FormData();
    fd.append("file", file);
    const token = useAuthStore.getState().accessToken;

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/upload?type=thumbnail");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    const startMs = Date.now();
    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable) return;
      const pct = Math.round((ev.loaded / ev.total) * 100);
      setProgress(pct);
      const elapsed = (Date.now() - startMs) / 1000;
      if (elapsed > 0.2) {
        const bps = ev.loaded / elapsed;
        setBps(bps);
        const remaining = (ev.total - ev.loaded) / bps;
        setEtaSec(Math.max(0, Math.round(remaining)));
      }
    };
    xhr.upload.onload = () => { setPhase("processing"); setProgress(100); setEtaSec(null); };
    xhr.onload = () => {
      setUploading(false); setPhase(null);
      if (ref.current) ref.current.value = "";
      if (xhr.status >= 200 && xhr.status < 300) {
        try { const data = JSON.parse(xhr.responseText) as { url: string }; onChange(data.url); }
        catch { setUploadErr("Server returned invalid response."); }
      } else {
        setUploadErr(`Upload failed (status ${xhr.status}). Check file type (JPG/PNG/WEBP/GIF) and size (max 5 MB).`);
      }
    };
    xhr.onerror = () => { setUploading(false); setPhase(null); setUploadErr("Network error. Try again."); };
    xhr.send(fd);
  }

  const kbps = bytesPerSec / 1024;
  const speedLabel = kbps > 1024 ? `${(kbps / 1024).toFixed(1)} MB/s` : `${Math.round(kbps)} KB/s`;
  const etaLabel = etaSec === null ? "—" : etaSec > 60 ? `${Math.floor(etaSec / 60)}m ${etaSec % 60}s` : `${etaSec}s`;

  return (
    <Field label={label}>
      <div className="flex gap-2 items-center">
        <input className="input flex-1" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} placeholder="https://… or upload →" />
        <button type="button" onClick={() => ref.current?.click()}
          disabled={uploading}
          className="shrink-0 px-3 py-2 rounded border border-line text-xs font-semibold hover:border-accent hover:text-accent transition disabled:opacity-50">
          {uploading ? "Uploading…" : "Browse"}
        </button>
        <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleFile} />
      </div>
      {uploading && (
        <div className="mt-2 space-y-1">
          <div className="h-2 w-full rounded-full bg-white/8 overflow-hidden">
            <div
              className={`h-full transition-all duration-150 ${phase === "processing" ? "bg-yellow-400 animate-pulse" : "bg-accent"}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-white/55 font-mono">
            <span>
              {phase === "processing"
                ? "⚡ Processing image on server…"
                : `📤 Uploading ${progress}% · ${speedLabel}`}
            </span>
            <span>{phase === "uploading" && etaSec !== null ? `ETA ${etaLabel}` : ""}</span>
          </div>
        </div>
      )}
      {uploadErr && <p className="text-[10px] text-bad mt-1">{uploadErr}</p>}
      <p className="text-[10px] text-white/35 mt-1">
        Any size · HD up to 600×800 · JPG/PNG/WEBP · max 5 MB · auto-compressed under 900 KB · full image always visible
      </p>
      {value && (
        <div className="mt-2 flex items-start gap-3">
          {/* Tile preview — same aspect-ratio + object-cover as the actual site tile */}
          <div className="relative shrink-0 rounded-xl overflow-hidden border border-line" style={{ width: 110, aspectRatio: "3/4", background: "#0f1923" }}>
            <img
              src={value}
              alt="preview"
              className="absolute inset-0 w-full h-full object-fill"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          </div>
          <div className="flex flex-col gap-1 pt-1">
            <span className="text-[10px] text-white/40">Tile preview (exact)</span>
            <button type="button" onClick={() => onChange(null)} className="text-[10px] text-bad/70 hover:text-bad">✕ Remove image</button>
          </div>
        </div>
      )}
    </Field>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs uppercase tracking-wider text-white/60">{label}</span><div className="mt-1">{children}</div></label>;
}
function Th({ children }: { children: React.ReactNode }) { return <th className="px-3 py-2 text-left">{children}</th>; }
function Td({ children, className }: { children: React.ReactNode; className?: string }) { return <td className={`px-3 py-2 ${className ?? ""}`}>{children}</td>; }
