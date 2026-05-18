"use client";
import useSWR, { mutate as globalMutate } from "swr";
import { useState } from "react";
import { api } from "@/lib/api";
import { Plus, Trash2, ToggleLeft, ToggleRight, Gamepad2 } from "lucide-react";

interface Provider { id: string; key: string; name: string; category: string; }
interface Game { id: string; name: string; category: string; thumbnail: string | null; isLive: boolean; provider: Provider; }

const PROVIDERS_KEY = "/casino/providers";
const GAMES_KEY = "/casino/games?limit=200";

export default function AdminCasinoPage() {
  const { data: providers, isLoading: provLoad } = useSWR<Provider[]>(PROVIDERS_KEY);
  const { data: games,     isLoading: gameLoad } = useSWR<Game[]>(GAMES_KEY);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [showAddGame,     setShowAddGame]     = useState(false);
  const [activeTab, setActiveTab]             = useState<"providers" | "games">("games");

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
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-line">
        {(["games", "providers"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={"px-4 py-2 text-sm font-semibold capitalize border-b-2 transition " + (activeTab === tab ? "border-accent text-white" : "border-transparent text-white/50 hover:text-white")}
          >{tab}</button>
        ))}
      </div>

      {/* Games Table */}
      {activeTab === "games" && (
        <div className="rounded-xl border border-line bg-panel/60 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-panel text-[10px] uppercase tracking-wider text-white/50">
              <tr><Th>Name</Th><Th>Category</Th><Th>Provider</Th><Th>Live</Th><Th>Actions</Th></tr>
            </thead>
            <tbody>
              {gameLoad && <tr><td colSpan={5} className="text-center py-8 text-white/50">Loading…</td></tr>}
              {!gameLoad && (!games || games.length === 0) && (
                <tr><td colSpan={5} className="text-center py-10 text-white/50">
                  <Gamepad2 size={32} className="mx-auto mb-2 text-white/20" />
                  No games yet. Add a provider and create games above.
                </td></tr>
              )}
              {(games ?? []).map((g) => (
                <tr key={g.id} className="border-t border-line/60 hover:bg-panel2/20">
                  <Td className="font-semibold">{g.name}</Td>
                  <Td className="text-xs text-white/60">{g.category}</Td>
                  <Td>{g.provider.name}</Td>
                  <Td>
                    <span className={"text-[10px] px-2 py-0.5 rounded " + (g.isLive ? "bg-ok/15 text-ok" : "bg-white/5 text-white/40")}>
                      {g.isLive ? "LIVE" : "RNG"}
                    </span>
                  </Td>
                  <Td>
                    <button onClick={async () => {
                      if (!confirm(`Delete game "${g.name}"?`)) return;
                      await api.delete(`/casino/games/${g.id}`);
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

      {showAddProvider && (
        <AddProviderModal onClose={(saved) => { setShowAddProvider(false); if (saved) globalMutate(PROVIDERS_KEY); }} />
      )}
      {showAddGame && (
        <AddGameModal providers={providers ?? []} onClose={(saved) => { setShowAddGame(false); if (saved) globalMutate(GAMES_KEY); }} />
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
  const [form, setForm] = useState({ name: "", category: "Teen Patti", providerId: providers[0]?.id ?? "", thumbnail: "", isLive: true });
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
      <Field label="Category"><input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Teen Patti" /></Field>
      <Field label="Thumbnail URL (optional)"><input className="input" value={form.thumbnail} onChange={(e) => setForm({ ...form, thumbnail: e.target.value })} placeholder="https://…" /></Field>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs uppercase tracking-wider text-white/60">{label}</span><div className="mt-1">{children}</div></label>;
}
function Th({ children }: { children: React.ReactNode }) { return <th className="px-3 py-2 text-left">{children}</th>; }
function Td({ children, className }: { children: React.ReactNode; className?: string }) { return <td className={`px-3 py-2 ${className ?? ""}`}>{children}</td>; }
