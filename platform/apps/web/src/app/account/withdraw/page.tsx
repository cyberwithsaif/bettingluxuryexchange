"use client";
import { useState, useEffect } from "react";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";
import { Plus, Trash2, CheckCircle2, CreditCard, Wallet, Bitcoin, X } from "lucide-react";

type Method = "UPI" | "BANK_TRANSFER" | "CRYPTO";

interface SavedMethod {
  id: string;
  type: Method;
  label: string;   // "My SBI Account"
  details: string; // UPI ID / account number / wallet address
}

const ICONS: Record<Method, React.ReactNode> = {
  UPI:           <Wallet size={18} />,
  BANK_TRANSFER: <CreditCard size={18} />,
  CRYPTO:        <Bitcoin size={18} />,
};
const METHOD_LABELS: Record<Method, string> = {
  UPI:           "UPI",
  BANK_TRANSFER: "Bank Transfer",
  CRYPTO:        "Crypto Wallet",
};

const STORAGE_KEY = "exch-saved-payout-methods";
function load(): SavedMethod[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}
function persist(items: SavedMethod[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export default function WithdrawPage() {
  const user = useAuthStore((s) => s.user);
  const { data: wallet } = useSWR(user ? "/wallet/summary" : null);
  const { data: mine }   = useSWR(user ? "/transactions/mine" : null);

  const [saved, setSaved]         = useState<SavedMethod[]>([]);
  const [selected, setSelected]   = useState<SavedMethod | null>(null);
  const [amount, setAmount]       = useState(0);
  const [busy, setBusy]           = useState(false);
  const [msg, setMsg]             = useState<{ text: string; ok: boolean } | null>(null);

  // Add-method modal state
  const [showAdd, setShowAdd]     = useState(false);
  const [newType, setNewType]     = useState<Method>("UPI");
  const [newLabel, setNewLabel]   = useState("");
  const [newDetails, setNewDetails] = useState("");

  useEffect(() => { setSaved(load()); }, []);

  function addMethod() {
    if (!newLabel.trim() || !newDetails.trim()) return;
    const entry: SavedMethod = { id: Date.now().toString(), type: newType, label: newLabel.trim(), details: newDetails.trim() };
    const updated = [...saved, entry];
    setSaved(updated); persist(updated);
    setShowAdd(false); setNewLabel(""); setNewDetails(""); setNewType("UPI");
  }

  function removeMethod(id: string) {
    const updated = saved.filter((s) => s.id !== id);
    setSaved(updated); persist(updated);
    if (selected?.id === id) setSelected(null);
  }

  async function submit() {
    if (!selected) { setMsg({ text: "Please select a payout method.", ok: false }); return; }
    if (amount <= 0) { setMsg({ text: "Enter a valid amount.", ok: false }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.post("/transactions", {
        kind: "WITHDRAWAL",
        method: selected.type,
        amount,
        reference: `${selected.label}: ${selected.details}`,
      });
      setMsg({ text: "Withdrawal requested — admin will process via your selected method.", ok: true });
      setAmount(0); setSelected(null);
      mutate("/transactions/mine");
      mutate("/wallet/summary");
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message || "Failed to submit.", ok: false });
    } finally { setBusy(false); }
  }

  const detailPlaceholder = newType === "UPI" ? "e.g. name@upi" : newType === "BANK_TRANSFER" ? "e.g. 123456789 · SBIN0001234 · SBI" : "e.g. 0x1a2b3c...";

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl">Withdraw</h1>
        <p className="text-sm text-white/60 mt-1">
          Available: <span className="text-accent font-bold text-base">
            ₹{wallet?.available != null ? Number(wallet.available).toLocaleString("en-IN") : "—"}
          </span>
        </p>
      </div>

      {/* Step 1 — Select payout method */}
      <section className="glass rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white/90 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-accent-grad text-ink text-xs font-bold flex items-center justify-center">1</span>
            Select Payout Method
          </h2>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 text-xs text-accentSoft hover:text-white border border-accent/30 hover:border-accent/60 rounded-md px-3 py-1.5 transition"
          >
            <Plus size={12} /> Add Method
          </button>
        </div>

        {saved.length === 0 ? (
          <div className="text-center py-6 text-white/40 space-y-2">
            <Wallet size={32} className="mx-auto opacity-30" />
            <p className="text-sm">No saved methods. Click <span className="text-accentSoft">Add Method</span> to add your UPI / bank.</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {saved.map((m) => {
              const isSelected = selected?.id === m.id;
              return (
                <div key={m.id} className="flex items-center gap-3">
                  <button
                    onClick={() => setSelected(isSelected ? null : m)}
                    className={`flex-1 flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                      isSelected
                        ? "border-accent bg-accent/10 shadow-glow/30"
                        : "border-line/60 hover:border-accent/40 hover:bg-white/5"
                    }`}
                  >
                    <span className={`p-2 rounded-lg ${isSelected ? "bg-accent/20 text-accent" : "bg-white/10 text-white/60"}`}>
                      {ICONS[m.type]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">{m.label}</div>
                      <div className="text-xs text-white/50 truncate">{m.details}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase text-white/30 border border-white/10 rounded px-1.5 py-0.5">
                        {METHOD_LABELS[m.type]}
                      </span>
                      {isSelected && <CheckCircle2 size={16} className="text-accent" />}
                    </div>
                  </button>
                  <button
                    onClick={() => removeMethod(m.id)}
                    className="p-2 text-white/30 hover:text-bad transition rounded-lg hover:bg-bad/10"
                    title="Remove"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Step 2 — Amount */}
      <section className="glass rounded-xl p-5">
        <h2 className="font-semibold text-white/90 flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-full bg-accent-grad text-ink text-xs font-bold flex items-center justify-center">2</span>
          Enter Amount
        </h2>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 font-semibold">₹</span>
          <input
            type="number"
            min={1}
            inputMode="decimal"
            value={amount || ""}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
            placeholder="0"
            className="input pl-7 text-xl font-bold"
          />
        </div>
        {/* Quick amounts */}
        <div className="flex gap-2 mt-2 flex-wrap">
          {[500, 1000, 2000, 5000, 10000].map((v) => (
            <button key={v} onClick={() => setAmount(v)} className="text-xs border border-line/60 hover:border-accent/60 hover:text-accent rounded-md px-3 py-1 transition">
              ₹{v.toLocaleString("en-IN")}
            </button>
          ))}
        </div>
      </section>

      {/* Submit */}
      <div className="space-y-2">
        {selected && amount > 0 && (
          <div className="text-xs text-white/50 bg-white/5 rounded-lg px-4 py-2.5 flex items-center gap-2">
            <CheckCircle2 size={13} className="text-accent shrink-0" />
            Withdraw <strong className="text-white">₹{amount.toLocaleString("en-IN")}</strong> via{" "}
            <strong className="text-accentSoft">{selected.label}</strong> ({METHOD_LABELS[selected.type]})
          </div>
        )}
        <button
          disabled={busy || !selected || amount <= 0}
          onClick={submit}
          className="w-full rounded-md bg-accent-grad py-3 font-bold text-ink shadow-glow hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition text-base"
        >
          {busy ? "Submitting…" : "Request Withdrawal"}
        </button>
        {msg && (
          <p className={`text-sm flex items-center gap-1.5 ${msg.ok ? "text-ok" : "text-bad"}`}>
            {msg.ok ? <CheckCircle2 size={14} /> : "⚠"} {msg.text}
          </p>
        )}
      </div>

      {/* Recent requests */}
      <section className="glass rounded-xl p-4">
        <h2 className="font-display text-xl mb-3">Recent Requests</h2>
        <ul className="text-sm divide-y divide-line/40">
          {(mine ?? []).filter((t: any) => t.kind === "WITHDRAWAL").slice(0, 8).map((t: any) => (
            <li key={t.id} className="py-2.5 flex justify-between items-start gap-2">
              <div className="min-w-0">
                <span className="font-semibold">₹{Number(t.amount).toLocaleString("en-IN")}</span>
                <span className="text-white/50 ml-2 text-xs">{(t.method ?? "").replace("_", " ")}</span>
                {t.reference && <div className="text-xs text-white/40 truncate">{t.reference}</div>}
              </div>
              <span className={`text-xs uppercase tracking-wider px-2.5 py-1 rounded-md font-bold shrink-0 ${
                ["APPROVED", "COMPLETED"].includes(t.status) ? "bg-green-500/20 text-green-400 border border-green-500/30" :
                t.status === "REJECTED"                      ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                                                               "bg-amber-500/15 text-amber-400 border border-amber-500/30"
              }`}>{t.status === "APPROVED" ? "COMPLETED" : t.status}</span>
            </li>
          ))}
          {(!mine || mine.filter((t: any) => t.kind === "WITHDRAWAL").length === 0) && (
            <li className="py-5 text-center text-white/40 text-xs">No withdrawal requests yet.</li>
          )}
        </ul>
      </section>

      {/* Add Method Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm glass rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl">Add Payout Method</h2>
              <button onClick={() => setShowAdd(false)} className="p-1 rounded hover:bg-white/10 text-white/60"><X size={18} /></button>
            </div>
            <div>
              <label className="text-xs uppercase text-white/50 block mb-1">Method Type</label>
              <div className="grid grid-cols-3 gap-2">
                {(["UPI", "BANK_TRANSFER", "CRYPTO"] as Method[]).map((t) => (
                  <button key={t} onClick={() => setNewType(t)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 text-xs font-semibold transition ${newType === t ? "border-accent bg-accent/10 text-accent" : "border-line/60 text-white/50 hover:border-accent/40"}`}>
                    {ICONS[t]}
                    {METHOD_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs uppercase text-white/50 block mb-1">Nickname</label>
              <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder={newType === "UPI" ? "e.g. Primary UPI" : newType === "BANK_TRANSFER" ? "e.g. My SBI Account" : "e.g. MetaMask"} className="input" />
            </div>
            <div>
              <label className="text-xs uppercase text-white/50 block mb-1">
                {newType === "UPI" ? "UPI ID" : newType === "BANK_TRANSFER" ? "Account Details" : "Wallet Address"}
              </label>
              <input value={newDetails} onChange={(e) => setNewDetails(e.target.value)} placeholder={detailPlaceholder} className="input" />
              {newType === "BANK_TRANSFER" && (
                <p className="text-[10px] text-white/30 mt-1">Format: Account No · IFSC · Bank Name</p>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={addMethod} disabled={!newLabel.trim() || !newDetails.trim()}
                className="flex-1 rounded-md bg-accent-grad py-2.5 font-bold text-ink hover:brightness-110 disabled:opacity-40">
                Save Method
              </button>
              <button onClick={() => setShowAdd(false)} className="px-4 rounded-md border border-line/60 text-white/60 hover:text-white">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        :global(.input){width:100%;background:#170a10;border:1px solid rgba(255,122,24,0.2);border-radius:8px;padding:10px 12px;font-size:14px;color:#f4e7e7}
        :global(.input:focus){outline:none;border-color:#ff7a18}
        :global(.input::placeholder){color:rgba(255,255,255,0.2)}
      `}</style>
    </div>
  );
}
