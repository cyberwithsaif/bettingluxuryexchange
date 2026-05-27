"use client";
import { useState, useEffect } from "react";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";
import {
  Plus, Trash2, CheckCircle2, CreditCard, Wallet, Bitcoin, X,
  ArrowUpCircle, ShieldCheck, Clock, Headphones, Info, Sparkles, Banknote,
} from "lucide-react";

type Method = "UPI" | "BANK_TRANSFER" | "CRYPTO";

interface SavedMethod {
  id: string;
  type: Method;
  label: string;
  details: string;
}

const PANEL = "linear-gradient(135deg, #12183a, #0d1224)";

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
const METHOD_COLOR: Record<Method, string> = {
  UPI:           "#22c55e",
  BANK_TRANSFER: "#38bdf8",
  CRYPTO:        "#f59e0b",
};

function fmt(n: number | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
}

const QUICK_AMOUNTS = [500, 1000, 2000, 5000, 10000, 25000];

export default function WithdrawPage() {
  const user = useAuthStore((s) => s.user);
  const { data: wallet } = useSWR(user ? "/wallet/summary" : null);
  const { data: mine }   = useSWR(user ? "/transactions/mine" : null);

  const { data: saved = [] } = useSWR<SavedMethod[]>(user ? "/me/payout-methods" : null);
  const [selected, setSelected]   = useState<SavedMethod | null>(null);
  const [amount, setAmount]       = useState(0);
  const [busy, setBusy]           = useState(false);
  const [msg, setMsg]             = useState<{ text: string; ok: boolean } | null>(null);

  const [showAdd, setShowAdd]       = useState(false);
  const [newType, setNewType]       = useState<Method>("UPI");
  const [newLabel, setNewLabel]     = useState("");
  const [newDetails, setNewDetails] = useState("");

  // Default the selection to the first saved method (prefer UPI) once loaded.
  useEffect(() => {
    if (!selected && saved.length) setSelected(saved.find((m) => m.type === "UPI") ?? saved[0] ?? null);
  }, [saved, selected]);

  async function addMethod() {
    if (!newLabel.trim() || !newDetails.trim()) return;
    try {
      const { data } = await api.post("/me/payout-methods", { type: newType, label: newLabel.trim(), details: newDetails.trim() });
      mutate("/me/payout-methods");
      setSelected(data);
      setShowAdd(false); setNewLabel(""); setNewDetails(""); setNewType("UPI");
    } catch (e: any) { setMsg({ text: e?.response?.data?.message || "Failed to save method.", ok: false }); }
  }

  async function removeMethod(id: string) {
    try {
      await api.delete(`/me/payout-methods/${id}`);
      mutate("/me/payout-methods");
      if (selected?.id === id) setSelected(null);
    } catch (e: any) { setMsg({ text: e?.response?.data?.message || "Failed to remove method.", ok: false }); }
  }

  const available = Number(wallet?.available ?? 0);
  const exceeds = amount > available && available > 0;

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
  const withdrawReqs = (mine ?? []).filter((t: any) => t.kind === "WITHDRAWAL");

  return (
    <div className="max-w-6xl mx-auto pb-10">
      {/* ── Hero ───────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl p-5 md:p-6 mb-5"
        style={{ background: "linear-gradient(135deg, #1a0f2e 0%, #12183a 50%, #1a0a1a 100%)", border: "1px solid rgba(243,196,49,0.18)" }}>
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-25 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #f3c431, transparent)" }} />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-glow"
            style={{ background: "linear-gradient(135deg, #f3c431, #ff7a18)" }}>
            <ArrowUpCircle size={28} className="text-ink" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-3xl md:text-4xl leading-none">Withdraw Funds</h1>
            <p className="text-sm text-white/55 mt-1">Cash out to your UPI, bank account or crypto wallet.</p>
          </div>
          <div className="flex gap-3 shrink-0">
            <div className="rounded-xl px-4 py-2.5 text-center min-w-[110px]" style={{ background: "rgba(243,196,49,0.1)", border: "1px solid rgba(243,196,49,0.25)" }}>
              <div className="text-[10px] uppercase tracking-wider text-white/40">Available</div>
              <div className="font-display text-xl text-accentSoft">₹{fmt(available)}</div>
            </div>
            <div className="rounded-xl px-4 py-2.5 text-center min-w-[100px]" style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.25)" }}>
              <div className="text-[10px] uppercase tracking-wider text-white/40">Exposure</div>
              <div className="font-display text-xl" style={{ color: "#f43f5e" }}>₹{fmt(wallet?.exposure)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* ── Left: withdrawal flow ────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Step 1 — Payout method */}
          <Panel>
            <div className="flex items-center justify-between mb-4">
              <StepHead n={1} title="Select Payout Method" noMargin />
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-ink bg-accent-grad rounded-lg px-3 py-1.5 hover:brightness-110 transition shrink-0">
                <Plus size={13} /> Add Method
              </button>
            </div>

            {saved.length === 0 ? (
              <div className="text-center py-8 rounded-xl border border-dashed border-white/10 bg-white/[0.02]">
                <Wallet size={32} className="mx-auto opacity-25 mb-2" />
                <p className="text-sm text-white/40">No saved methods yet.</p>
                <p className="text-xs text-white/30 mt-0.5">Tap <span className="text-accentSoft font-semibold">Add Method</span> to save your UPI, bank or wallet.</p>
              </div>
            ) : (
              <div className="grid gap-2">
                {saved.map((m) => {
                  const isSel = selected?.id === m.id;
                  const c = METHOD_COLOR[m.type];
                  return (
                    <div key={m.id} className="flex items-center gap-2">
                      <button onClick={() => setSelected(isSel ? null : m)}
                        className="flex-1 flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition"
                        style={{
                          background: isSel ? `${c}14` : "rgba(255,255,255,0.03)",
                          borderColor: isSel ? `${c}66` : "rgba(255,255,255,0.1)",
                          boxShadow: isSel ? `0 0 16px ${c}33` : "none",
                        }}>
                        <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: `${c}1f`, color: c }}>{ICONS[m.type]}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm text-white">{m.label}</div>
                          <div className="text-xs text-white/50 truncate font-mono">{m.details}</div>
                        </div>
                        <span className="text-[10px] uppercase tracking-wider text-white/40 border border-white/10 rounded px-1.5 py-0.5 shrink-0">
                          {METHOD_LABELS[m.type]}
                        </span>
                        {isSel && <CheckCircle2 size={16} style={{ color: c }} className="shrink-0" />}
                      </button>
                      <button onClick={() => removeMethod(m.id)} title="Remove"
                        className="p-2.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition shrink-0">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          {/* Step 2 — Amount */}
          <Panel>
            <StepHead n={2} title="Enter Amount" />
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-accentSoft font-display text-2xl">₹</span>
              <input type="number" min={1} inputMode="decimal" value={amount || ""}
                onChange={(e) => setAmount(Number(e.target.value) || 0)} placeholder="0"
                className="w-full bg-white/5 border border-white/15 rounded-xl pl-10 pr-4 py-3.5 text-white text-2xl font-display tracking-wide placeholder-white/20 focus:outline-none focus:border-accentSoft/60 focus:bg-white/[0.08] transition" />
            </div>
            <div className="flex gap-2 mt-2.5 flex-wrap">
              {QUICK_AMOUNTS.map((v) => (
                <button key={v} onClick={() => setAmount(v)}
                  className="text-xs font-semibold border rounded-lg px-3 py-1.5 transition"
                  style={{
                    background: amount === v ? "rgba(243,196,49,0.15)" : "rgba(255,255,255,0.03)",
                    borderColor: amount === v ? "rgba(243,196,49,0.5)" : "rgba(255,255,255,0.12)",
                    color: amount === v ? "#f3c431" : "rgba(255,255,255,0.7)",
                  }}>
                  ₹{v.toLocaleString("en-IN")}
                </button>
              ))}
              <button onClick={() => setAmount(Math.floor(available))} disabled={available <= 0}
                className="text-xs font-bold border rounded-lg px-3 py-1.5 transition disabled:opacity-40"
                style={{ background: "rgba(34,197,94,0.12)", borderColor: "rgba(34,197,94,0.4)", color: "#4ade80" }}>
                Max ₹{fmt(Math.floor(available))}
              </button>
            </div>
            {exceeds && (
              <p className="mt-2 text-xs text-red-400 flex items-center gap-1.5">
                <Info size={13} /> Amount exceeds your available balance of ₹{fmt(available)}.
              </p>
            )}

            {/* Confirmation summary */}
            {selected && amount > 0 && !exceeds && (
              <div className="mt-4 text-xs text-white/70 bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 flex items-center gap-2">
                <CheckCircle2 size={14} className="text-green-400 shrink-0" />
                Withdraw <strong className="text-white">₹{amount.toLocaleString("en-IN")}</strong> via{" "}
                <strong className="text-white">{selected.label}</strong>
                <span className="text-white/40">({METHOD_LABELS[selected.type]})</span>
              </div>
            )}

            <button disabled={busy || !selected || amount <= 0 || exceeds} onClick={submit}
              className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-accent-grad py-3.5 font-bold text-white text-base shadow-glow hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition">
              <ArrowUpCircle size={18} />
              {busy ? "Submitting…" : "Request Withdrawal"}
            </button>
            {msg && (
              <p className={`mt-3 text-sm flex items-center gap-2 rounded-lg px-3 py-2 ${msg.ok ? "text-green-400 bg-green-500/10 border border-green-500/20" : "text-red-400 bg-red-500/10 border border-red-500/20"}`}>
                {msg.ok ? <CheckCircle2 size={15} /> : <Info size={15} />} {msg.text}
              </p>
            )}
          </Panel>
        </div>

        {/* ── Right: info & history ────────────────────────── */}
        <div className="space-y-5">
          {/* How it works */}
          <Panel>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles size={15} className="text-accentSoft" />
              <span className="text-sm font-semibold text-white/80">How It Works</span>
            </div>
            <ol className="space-y-3">
              {[
                { t: "Add a payout method", d: "Save your UPI, bank or wallet." },
                { t: "Enter the amount", d: "Up to your available balance." },
                { t: "Submit the request", d: "It goes to the admin queue." },
                { t: "Get paid out", d: "Admin processes to your method." },
              ].map((s, i) => (
                <li key={s.t} className="flex gap-3">
                  <span className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold text-ink"
                    style={{ background: "linear-gradient(135deg, #f3c431, #ff7a18)" }}>{i + 1}</span>
                  <div>
                    <div className="text-xs font-semibold text-white/85">{s.t}</div>
                    <div className="text-[11px] text-white/40">{s.d}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>

          {/* Info */}
          <Panel>
            <div className="space-y-2.5">
              <InfoLine icon={<Banknote size={14} />} color="#22c55e" label="Min withdrawal ₹500" />
              <InfoLine icon={<Clock size={14} />} color="#f59e0b" label="Processed within 24h" />
              <InfoLine icon={<ShieldCheck size={14} />} color="#38bdf8" label="Secure & verified payouts" />
              <InfoLine icon={<Headphones size={14} />} color="#a78bfa" label="Live support for issues" />
            </div>
          </Panel>

          {/* Recent requests */}
          <Panel>
            <div className="flex items-center gap-2 mb-3">
              <Wallet size={15} className="text-accentSoft" />
              <span className="text-sm font-semibold text-white/80">Recent Requests</span>
            </div>
            <ul className="divide-y divide-white/[0.06] text-sm">
              {withdrawReqs.slice(0, 6).map((t: any) => (
                <li key={t.id} className="py-2.5 flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <span className="font-display text-base text-white">₹{Number(t.amount).toLocaleString("en-IN")}</span>
                    <span className="text-white/40 ml-2 text-[11px]">{(t.method ?? "").replace("_", " ")}</span>
                    {t.reference && <div className="text-[10px] text-white/30 truncate">{t.reference}</div>}
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-lg font-bold shrink-0 ${
                    ["APPROVED", "COMPLETED"].includes(t.status) ? "bg-green-500/15 text-green-400 border border-green-500/30" :
                    t.status === "REJECTED"                      ? "bg-red-500/15 text-red-400 border border-red-500/30" :
                                                                   "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                  }`}>{t.status === "APPROVED" ? "COMPLETED" : t.status}</span>
                </li>
              ))}
              {withdrawReqs.length === 0 && (
                <li className="py-6 text-center text-white/30 text-xs">No withdrawal requests yet.</li>
              )}
            </ul>
          </Panel>
        </div>
      </div>

      {/* ── Add Method Modal ───────────────────────────────── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setShowAdd(false)}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4" style={{ background: PANEL, border: "1px solid rgba(255,255,255,0.1)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl">Add Payout Method</h2>
              <button onClick={() => setShowAdd(false)} className="p-1 rounded hover:bg-white/10 text-white/60"><X size={18} /></button>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-white/50 block mb-1.5">Method Type</label>
              <div className="grid grid-cols-3 gap-2">
                {(["UPI", "BANK_TRANSFER", "CRYPTO"] as Method[]).map((t) => {
                  const c = METHOD_COLOR[t];
                  const on = newType === t;
                  return (
                    <button key={t} onClick={() => setNewType(t)}
                      className="flex flex-col items-center gap-1.5 rounded-xl border py-3 text-[11px] font-semibold transition"
                      style={{ background: on ? `${c}14` : "rgba(255,255,255,0.03)", borderColor: on ? `${c}66` : "rgba(255,255,255,0.1)", color: on ? c : "rgba(255,255,255,0.5)" }}>
                      {ICONS[t]}
                      {METHOD_LABELS[t]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-white/50 block mb-1.5">Nickname</label>
              <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
                placeholder={newType === "UPI" ? "e.g. Primary UPI" : newType === "BANK_TRANSFER" ? "e.g. My SBI Account" : "e.g. MetaMask"}
                className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-accentSoft/60 transition" />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-white/50 block mb-1.5">
                {newType === "UPI" ? "UPI ID" : newType === "BANK_TRANSFER" ? "Account Details" : "Wallet Address"}
              </label>
              <input value={newDetails} onChange={(e) => setNewDetails(e.target.value)} placeholder={detailPlaceholder}
                className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-accentSoft/60 transition font-mono" />
              {newType === "BANK_TRANSFER" && (
                <p className="text-[10px] text-white/30 mt-1">Format: Account No · IFSC · Bank Name</p>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={addMethod} disabled={!newLabel.trim() || !newDetails.trim()}
                className="flex-1 rounded-xl bg-accent-grad py-2.5 font-bold text-white hover:brightness-110 disabled:opacity-40 transition">
                Save Method
              </button>
              <button onClick={() => setShowAdd(false)} className="px-4 rounded-xl border border-white/15 text-white/60 hover:text-white hover:border-white/30 transition">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────── */
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: PANEL, border: "1px solid rgba(255,255,255,0.07)" }}>
      {children}
    </div>
  );
}

function StepHead({ n, title, noMargin }: { n: number; title: string; noMargin?: boolean }) {
  return (
    <h2 className={`font-semibold text-white flex items-center gap-2 ${noMargin ? "" : "mb-4"}`}>
      <span className="w-6 h-6 rounded-full text-ink text-xs font-bold flex items-center justify-center shrink-0"
        style={{ background: "linear-gradient(135deg, #f3c431, #ff7a18)" }}>{n}</span>
      {title}
    </h2>
  );
}

function InfoLine({ icon, color, label }: { icon: React.ReactNode; color: string; label: string }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}18`, color }}>{icon}</span>
      <span className="text-white/70">{label}</span>
    </div>
  );
}
