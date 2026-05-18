"use client";
import { useState, useEffect } from "react";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";
import { Plus, Trash2, CheckCircle2, CreditCard, Wallet, Bitcoin } from "lucide-react";

type Method = "UPI" | "BANK_TRANSFER" | "CRYPTO";

interface SavedMethod {
  id: string;
  type: Method;
  label: string;      // e.g. "My SBI Account" or "Primary UPI"
  details: string;    // e.g. "saif@upi" or "SBI 12345678 SBIN0001234"
}

const METHOD_ICONS: Record<Method, React.ReactNode> = {
  UPI:           <Wallet size={14} />,
  BANK_TRANSFER: <CreditCard size={14} />,
  CRYPTO:        <Bitcoin size={14} />,
};

const STORAGE_KEY = "exch-saved-payout-methods";

function loadSaved(): SavedMethod[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); }
  catch { return []; }
}
function saveToDB(items: SavedMethod[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export default function WithdrawPage() {
  const [amount, setAmount]   = useState(0);
  const [method, setMethod]   = useState<Method>("UPI");
  const [reference, setReference] = useState("");
  const [label, setLabel]     = useState("");
  const [saveMethod, setSaveMethod] = useState(false);
  const [busy, setBusy]       = useState(false);
  const [msg, setMsg]         = useState<{ text: string; ok: boolean } | null>(null);
  const [saved, setSaved]     = useState<SavedMethod[]>([]);
  const [addingNew, setAddingNew] = useState(false);

  const user = useAuthStore((s) => s.user);
  const { data: wallet } = useSWR(user ? "/wallet/summary" : null);
  const { data: mine }   = useSWR(user ? "/transactions/mine" : null);

  // Load saved methods from localStorage
  useEffect(() => { setSaved(loadSaved()); }, []);

  function selectSaved(m: SavedMethod) {
    setMethod(m.type);
    setReference(m.details);
    setAddingNew(false);
  }

  function deleteSaved(id: string) {
    const updated = saved.filter((s) => s.id !== id);
    setSaved(updated);
    saveToDB(updated);
  }

  async function submit() {
    if (!reference.trim()) { setMsg({ text: "Enter payout details.", ok: false }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.post("/transactions", { kind: "WITHDRAWAL", method, amount, reference });
      // Save method if checkbox is ticked
      if (saveMethod && label.trim() && reference.trim()) {
        const newEntry: SavedMethod = {
          id: Date.now().toString(),
          type: method,
          label: label.trim(),
          details: reference.trim(),
        };
        const updated = [...saved, newEntry];
        setSaved(updated);
        saveToDB(updated);
      }
      setMsg({ text: "Withdrawal requested — admin will review.", ok: true });
      setAmount(0); setReference(""); setLabel(""); setSaveMethod(false);
      mutate("/transactions/mine");
      mutate("/wallet/summary");
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message || "Failed to submit.", ok: false });
    } finally { setBusy(false); }
  }

  const methodLabel = method === "UPI" ? "UPI ID" : method === "BANK_TRANSFER" ? "Account No · IFSC" : "Wallet Address";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl">Withdraw</h1>
        <div className="text-sm text-white/60 mt-1">
          Available: <span className="text-accent font-bold text-base">
            ₹{wallet?.available != null ? Number(wallet.available).toLocaleString("en-IN") : "—"}
          </span>
        </div>
      </div>

      {/* Saved Methods */}
      <section className="glass rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg">Saved Payout Methods</h2>
          <button
            onClick={() => setAddingNew((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-accentSoft hover:text-white transition"
          >
            <Plus size={13} /> Add new
          </button>
        </div>

        {saved.length === 0 && !addingNew && (
          <p className="text-xs text-white/40 text-center py-3">No saved methods yet. Add one below.</p>
        )}

        <div className="grid gap-2">
          {saved.map((m) => (
            <div
              key={m.id}
              onClick={() => selectSaved(m)}
              className={`flex items-center justify-between rounded-lg border px-3 py-2.5 cursor-pointer transition ${
                reference === m.details && method === m.type
                  ? "border-accent/60 bg-accent/10"
                  : "border-line/60 hover:border-accent/40 hover:bg-white/5"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-accentSoft">{METHOD_ICONS[m.type]}</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{m.label}</div>
                  <div className="text-xs text-white/50 truncate">{m.details}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-2 shrink-0">
                {reference === m.details && method === m.type && (
                  <CheckCircle2 size={14} className="text-accent" />
                )}
                <span className="text-[10px] uppercase text-white/30 border border-white/10 rounded px-1">{m.type.replace("_", " ")}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteSaved(m.id); }}
                  className="text-white/30 hover:text-bad transition p-1"
                  title="Remove saved method"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add New Method inline form */}
        {addingNew && (
          <div className="mt-3 rounded-lg border border-accent/20 bg-accent/5 p-3 space-y-2">
            <p className="text-xs text-white/60 font-semibold uppercase tracking-wider">New method</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase text-white/50 block mb-1">Type</label>
                <select value={method} onChange={(e) => setMethod(e.target.value as Method)} className="input text-sm">
                  <option value="UPI">UPI</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CRYPTO">Crypto</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase text-white/50 block mb-1">Nickname</label>
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. My SBI" className="input text-sm" />
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase text-white/50 block mb-1">{methodLabel}</label>
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={method === "UPI" ? "name@upi" : method === "BANK_TRANSFER" ? "Account · IFSC" : "0x..."} className="input text-sm" />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (!label.trim() || !reference.trim()) return;
                  const newEntry: SavedMethod = { id: Date.now().toString(), type: method, label: label.trim(), details: reference.trim() };
                  const updated = [...saved, newEntry];
                  setSaved(updated); saveToDB(updated);
                  setAddingNew(false); setLabel("");
                }}
                className="flex-1 rounded-md bg-accent-grad py-2 text-sm font-bold text-ink hover:brightness-110"
              >
                Save Method
              </button>
              <button onClick={() => setAddingNew(false)} className="px-4 rounded-md border border-line/60 text-sm text-white/60 hover:text-white">
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Withdrawal Form */}
      <div className="glass rounded-xl p-5 max-w-lg space-y-3">
        <h2 className="font-display text-lg">New Request</h2>

        <Field label="Method">
          <select value={method} onChange={(e) => setMethod(e.target.value as Method)} className="input">
            <option value="UPI">UPI</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="CRYPTO">Crypto</option>
          </select>
        </Field>

        <Field label="Amount (₹)">
          <input
            inputMode="decimal"
            value={amount || ""}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
            placeholder="Enter amount"
            className="input"
          />
        </Field>

        <Field label={methodLabel}>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={method === "UPI" ? "name@upi" : method === "BANK_TRANSFER" ? "Account No · IFSC · Bank name" : "Wallet address"}
            className="input"
          />
        </Field>

        {/* Save this method checkbox */}
        {reference.trim() && !saved.some((s) => s.details === reference.trim()) && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={saveMethod} onChange={(e) => setSaveMethod(e.target.checked)} className="accent-orange-500 w-4 h-4" />
              <span className="text-xs text-white/60">Save this method for future use</span>
            </label>
            {saveMethod && (
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nickname (e.g. My UPI, SBI Account)" className="input text-sm" />
            )}
          </div>
        )}

        {reference.trim() && saved.some((s) => s.details === reference.trim()) && (
          <p className="text-xs text-ok/70 flex items-center gap-1"><CheckCircle2 size={12} /> Saved method selected</p>
        )}

        <button
          disabled={busy || amount <= 0}
          onClick={submit}
          className="w-full rounded-md bg-accent-grad py-2.5 font-bold text-ink shadow-glow hover:brightness-110 disabled:opacity-50 transition"
        >
          {busy ? "Submitting…" : "Request Withdrawal"}
        </button>

        {msg && (
          <p className={`text-xs flex items-center gap-1.5 ${msg.ok ? "text-ok" : "text-bad"}`}>
            {msg.ok ? <CheckCircle2 size={13} /> : "⚠"} {msg.text}
          </p>
        )}
      </div>

      {/* Recent requests */}
      <section className="glass rounded-xl p-4">
        <h2 className="font-display text-xl mb-2">Recent requests</h2>
        <ul className="text-sm divide-y divide-line/40">
          {(mine ?? []).filter((t: any) => t.kind === "WITHDRAWAL").slice(0, 8).map((t: any) => (
            <li key={t.id} className="py-2 flex justify-between items-center">
              <div>
                <span className="font-semibold">₹{Number(t.amount).toLocaleString("en-IN")}</span>
                <span className="text-white/50 ml-2 text-xs">{t.method?.replace("_", " ")}</span>
                {t.reference && <div className="text-xs text-white/40 truncate max-w-[200px]">{t.reference}</div>}
              </div>
              <span className={`text-xs uppercase tracking-wider px-2 py-0.5 rounded font-semibold ${
                t.status === "APPROVED" ? "bg-ok/15 text-ok" :
                t.status === "REJECTED" ? "bg-bad/15 text-bad" :
                "text-white/50 border border-white/15"
              }`}>{t.status}</span>
            </li>
          ))}
          {(!mine || mine.filter((t: any) => t.kind === "WITHDRAWAL").length === 0) && (
            <li className="py-4 text-center text-white/40 text-xs">No withdrawal requests yet.</li>
          )}
        </ul>
      </section>

      <style jsx>{`
        :global(.input){width:100%;background:#170a10;border:1px solid rgba(255,122,24,0.2);border-radius:8px;padding:10px 12px;font-size:14px;color:#f4e7e7}
        :global(.input:focus){outline:none;border-color:#ff7a18}
        :global(.input::placeholder){color:rgba(255,255,255,0.2)}
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-white/60">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
