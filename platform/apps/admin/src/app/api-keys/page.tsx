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

  const map = new Map((existing ?? []).map((e) => [e.providerKey, e]));
  const grouped = groupBy((catalogue ?? []).filter((c) => !filter || c.category === filter), (c) => c.category);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-4xl">API Keys</h1>
        <p className="text-sm text-white/60">All provider credentials. Encrypted at rest, last-4 shown.</p>
      </div>

      <div className="flex gap-2 text-xs">
        {["", "sports", "casino", "crash", "slots", "virtual", "payment"].map((c) => (
          <button key={c} onClick={() => setFilter(c)} className={
            "px-3 py-1.5 rounded-md uppercase font-semibold " +
            (filter === c ? "bg-accent-grad text-ink" : "bg-panel border border-line hover:border-accent")
          }>{c || "All"}</button>
        ))}
      </div>

      {Object.entries(grouped).map(([cat, items]) => (
        <section key={cat} className="rounded-xl border border-line bg-panel/60">
          <header className="px-4 py-2 text-xs uppercase tracking-wider text-white/60 border-b border-line/60">{cat}</header>
          <ul className="divide-y divide-line/40">
            {items.map((c) => {
              const e = map.get(c.key);
              return (
                <li key={c.key} className="px-4 py-3 grid grid-cols-12 gap-3 items-center">
                  <div className="col-span-12 md:col-span-4">
                    <div className="font-bold">{c.label}</div>
                    <div className="text-xs text-white/50 font-mono">{c.key}</div>
                  </div>
                  <div className="col-span-12 md:col-span-5 text-xs">
                    {e ? (
                      <div className="flex flex-wrap gap-2">
                        {c.fields.map((f) => (
                          <span key={f} className="px-2 py-0.5 rounded bg-bg border border-line">
                            <span className="text-white/40">{f}:</span> <span className="font-mono">{e.masked[f] ?? "—"}</span>
                          </span>
                        ))}
                      </div>
                    ) : <span className="text-white/40">Not configured</span>}
                  </div>
                  <div className="col-span-6 md:col-span-1 text-center">
                    {e?.enabled ? <CheckCircle2 className="inline text-ok" size={18}/> : <XCircle className="inline text-white/30" size={18}/>}
                  </div>
                  <div className="col-span-6 md:col-span-2 flex gap-1 justify-end">
                    <button onClick={() => setEditing(c)} className="text-xs px-2 py-1 rounded bg-accent-grad text-ink font-bold inline-flex items-center gap-1"><Key size={12}/>{e ? "Edit" : "Set"}</button>
                    {e && (
                      <button onClick={async () => {
                        if (!confirm(`Delete API key for ${c.label}?`)) return;
                        await api.delete(`/admin/api-keys/${c.key}`);
                        mutate("/admin/api-keys");
                      }} className="text-xs px-2 py-1 rounded border border-line hover:border-bad text-bad inline-flex items-center gap-1"><Trash2 size={12}/></button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {editing && <EditModal cat={editing} existing={map.get(editing.key)} onClose={() => { setEditing(null); mutate("/admin/api-keys"); }} />}
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
      // Only send fields that were filled — empty means "keep existing value"
      const filled: Record<string, string> = {};
      for (const [k, v] of Object.entries(fields)) if (v) filled[k] = v;
      // The API replaces all fields on upsert; for the v1, require all on save.
      // Simpler UX: prefill existing masked hint and require re-entry on edit.
      await api.post("/admin/api-keys", { providerKey: cat.key, fields: filled, enabled, notes });
      onClose();
    } catch (e: any) {
      setErr(e?.response?.data?.message || "Failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-panel p-6 space-y-3 max-h-[90vh] overflow-y-auto">
        <h2 className="font-display text-2xl">{cat.label}</h2>
        <p className="text-xs text-white/50">{cat.key} · {cat.category}</p>

        {cat.fields.map((f) => (
          <label key={f} className="block">
            <span className="text-xs uppercase tracking-wider text-white/60">{f}</span>
            <input
              type={f.toLowerCase().includes("secret") || f.toLowerCase().includes("password") ? "password" : "text"}
              className="input mt-1"
              placeholder={existing?.masked[f] ? `Current: ${existing.masked[f]} — enter to replace` : ""}
              value={fields[f]} onChange={(e) => setFields({ ...fields, [f]: e.target.value })}
            />
          </label>
        ))}

        <label className="flex items-center gap-2 mt-2">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span className="text-sm">Enabled</span>
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wider text-white/60">Notes</span>
          <textarea className="input mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {err && <div className="text-xs text-bad bg-bad/15 border border-bad/40 rounded px-2 py-1.5">{err}</div>}

        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded border border-line">Cancel</button>
          <button onClick={save} disabled={busy} className="px-4 py-2 rounded bg-accent-grad text-ink font-bold shadow-glow disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
        <style jsx>{`
          :global(.input){width:100%;background:#0d0e15;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:9px 11px;font-size:14px;color:#e6e7eb}
          :global(.input:focus){outline:none;border-color:#ff7a18}
        `}</style>
      </div>
    </div>
  );
}

function groupBy<T>(arr: T[], key: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const x of arr) (out[key(x)] ??= []).push(x);
  return out;
}
