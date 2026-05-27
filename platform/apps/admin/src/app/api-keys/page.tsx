"use client";
import useSWR, { mutate } from "swr";
import { useState } from "react";
import { api } from "@/lib/api";
import { CheckCircle2, XCircle, Key, Trash2 } from "lucide-react";

interface Cat { key: string; label: string; category: string; fields: string[]; }
interface Existing {
  id: string; providerKey: string; label: string; category: string;
  enabled: boolean; masked: Record<string, string>;
  notes: string | null; lastUsedAt: string | null;
}

export default function ApiKeysPage() {
  const { data: catalogue } = useSWR<Cat[]>("/admin/api-keys/catalogue");
  const { data: existing }  = useSWR<Existing[]>("/admin/api-keys");
  const [editing, setEditing] = useState<Cat | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function syncSlotsLaunch() {
    setSyncing(true); setSyncMsg(null);
    try {
      const { data } = await api.post("/casino/slotslaunch/sync");
      setSyncMsg(`SlotsLaunch: imported ${data.synced} games from ${data.providers} providers (${data.pages} pages).${data.note ? " " + data.note : ""}`);
    } catch (e: any) {
      setSyncMsg(e?.response?.data?.message || "SlotsLaunch sync failed — check the token + host.");
    } finally { setSyncing(false); }
  }

  const map = new Map((existing ?? []).map((e) => [e.providerKey, e]));
  const grouped = groupBy((catalogue ?? []).filter((c) => !filter || c.category === filter), (c) => c.category);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-100">API Keys</h1>
          <p className="text-sm text-gray-500 mt-0.5">All provider credentials. Encrypted at rest, last-4 shown.</p>
        </div>
      </div>

      {syncMsg && (
        <div className="text-sm px-4 py-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">{syncMsg}</div>
      )}

      <div className="flex gap-2 flex-wrap text-xs">
        {["", "sports", "casino", "crash", "slots", "virtual", "payment"].map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`px-3 py-1.5 rounded-lg uppercase font-semibold border transition ${
              filter === c
                ? "bg-gradient-to-r from-yellow-400 to-amber-500 text-gray-100 border-transparent"
                : "bg-gray-800 border-yellow-200 text-gray-400 hover:border-yellow-400 hover:bg-gray-800"
            }`}
          >
            {c || "All"}
          </button>
        ))}
      </div>

      {Object.entries(grouped).map(([cat, items]) => (
        <section key={cat} className="rounded-xl border border-yellow-500/20 bg-gray-800 shadow-sm overflow-hidden">
          <header className="px-4 py-2.5 text-xs uppercase tracking-wider text-gray-500 font-semibold border-b border-yellow-500/20 bg-gray-800/80">{cat}</header>
          <ul className="divide-y divide-gray-100">
            {items.map((c) => {
              const e = map.get(c.key);
              return (
                <li key={c.key} className="px-4 py-3 grid grid-cols-12 gap-3 items-center hover:bg-gray-800/30 transition">
                  <div className="col-span-12 md:col-span-4">
                    <div className="font-semibold text-gray-200">{c.label}</div>
                    <div className="text-xs text-gray-500 font-mono">{c.key}</div>
                  </div>
                  <div className="col-span-12 md:col-span-5 text-xs">
                    {e ? (
                      <div className="flex flex-wrap gap-2">
                        {c.fields.map((f) => (
                          <span key={f} className="px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700">
                            <span className="text-gray-500">{f}:</span>
                            <span className="font-mono text-gray-300 ml-1">{e.masked[f] ?? "–"}</span>
                          </span>
                        ))}
                      </div>
                    ) : <span className="text-gray-500 italic">Not configured</span>}
                  </div>
                  <div className="col-span-6 md:col-span-1 text-center">
                    {e?.enabled
                      ? <CheckCircle2 className="inline text-emerald-500" size={18} />
                      : <XCircle className="inline text-gray-400" size={18} />}
                  </div>
                  <div className="col-span-6 md:col-span-2 flex gap-1 justify-end">
                    {c.key === "slotslaunch" && e?.enabled && (
                      <button
                        onClick={syncSlotsLaunch}
                        disabled={syncing}
                        className="text-xs px-2 py-1 rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold inline-flex items-center gap-1 hover:brightness-110 disabled:opacity-50 transition"
                        title="Import the demo-slot catalogue into the casino"
                      >
                        {syncing ? "Syncing…" : "Sync games"}
                      </button>
                    )}
                    <button
                      onClick={() => setEditing(c)}
                      className="text-xs px-2 py-1 rounded-lg bg-gradient-to-r from-yellow-400 to-amber-500 text-gray-100 font-bold inline-flex items-center gap-1 hover:brightness-110 transition"
                    >
                      <Key size={12} />{e ? "Edit" : "Set"}
                    </button>
                    {e && (
                      <button
                        onClick={async () => {
                          if (!confirm(`Delete API key for ${c.label}?`)) return;
                          await api.delete(`/admin/api-keys/${c.key}`);
                          mutate("/admin/api-keys");
                        }}
                        className="text-xs px-2 py-1 rounded-lg border border-gray-700 hover:border-red-200 hover:bg-red-900/20 text-red-500 inline-flex items-center gap-1 transition"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {editing && (
        <EditModal
          cat={editing}
          existing={map.get(editing.key)}
          onClose={() => { setEditing(null); mutate("/admin/api-keys"); }}
        />
      )}
    </div>
  );
}

function EditModal({ cat, existing, onClose }: { cat: Cat; existing?: Existing; onClose: () => void }) {
  const [fields, setFields] = useState<Record<string, string>>(() => Object.fromEntries(cat.fields.map((f) => [f, ""])));
  const [enabled, setEnabled] = useState<boolean>(existing?.enabled ?? true);
  const [notes, setNotes] = useState<string>(existing?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const filled: Record<string, string> = {};
      for (const [k, v] of Object.entries(fields)) if (v) filled[k] = v;
      await api.post("/admin/api-keys", { providerKey: cat.key, fields: filled, enabled, notes });
      onClose();
    } catch (e: any) {
      setErr(e?.response?.data?.message || "Failed");
    } finally { setBusy(false); }
  }

  const inputCls = "modal-input mt-1";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-yellow-500/20 bg-gray-800 p-6 space-y-3 max-h-[90vh] overflow-y-auto shadow-xl">
        <div>
          <h2 className="text-xl font-black text-gray-100">{cat.label}</h2>
          <p className="text-xs text-gray-500">{cat.key} Â· {cat.category}</p>
        </div>

        {cat.fields.map((f) => (
          <label key={f} className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">{f}</span>
            <input
              type={f.toLowerCase().includes("secret") || f.toLowerCase().includes("password") ? "password" : "text"}
              className={inputCls}
              placeholder={existing?.masked[f] ? `Current: ${existing.masked[f]} – enter to replace` : ""}
              value={fields[f]}
              onChange={(e) => setFields({ ...fields, [f]: e.target.value })}
            />
          </label>
        ))}

        <label className="flex items-center gap-2 mt-2">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-4 h-4 accent-yellow-500" />
          <span className="text-sm text-gray-300 font-medium">Enabled</span>
        </label>

        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Notes</span>
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {err && <div className="text-xs text-red-400 bg-red-900/20 border border-red-200 rounded px-2 py-1.5">{err}</div>}

        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:bg-gray-800 transition">Cancel</button>
          <button
            onClick={save}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-yellow-400 to-amber-500 text-gray-100 font-bold shadow-sm disabled:opacity-50 hover:brightness-110 transition"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function groupBy<T>(arr: T[], key: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const x of arr) (out[key(x)] ??= []).push(x);
  return out;
}
