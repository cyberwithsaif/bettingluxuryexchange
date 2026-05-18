"use client";
import { useState } from "react";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";
import { ArrowDownCircle } from "lucide-react";

const methods = [
  { v: "UPI",           label: "UPI",           icon: "🏦" },
  { v: "BANK_TRANSFER", label: "Bank Transfer",  icon: "🏛️" },
  { v: "CRYPTO",        label: "Crypto",         icon: "₿" },
] as const;

export default function DepositPage() {
  const [method, setMethod] = useState<typeof methods[number]["v"]>("UPI");
  const [amount, setAmount] = useState(0);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const user = useAuthStore((s) => s.user);
  const { data: mine } = useSWR(user ? "/transactions/mine" : null);

  async function submit() {
    if (amount <= 0) { setMsg({ text: "Enter a valid amount.", ok: false }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.post("/transactions", { kind: "DEPOSIT", method, amount, reference });
      setMsg({ text: "Deposit request submitted — admin will review shortly.", ok: true });
      setAmount(0); setReference("");
      mutate("/transactions/mine");
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message || "Failed", ok: false });
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl">Deposit</h1>
        <p className="text-sm text-white/50 mt-1">Submit a deposit request — admin will credit your wallet.</p>
      </div>

      {/* Form Card */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-sm p-6 space-y-5">

        {/* Method */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-white/70 mb-2">Payment Method</label>
          <div className="grid grid-cols-3 gap-2">
            {methods.map((m) => (
              <button
                key={m.v}
                onClick={() => setMethod(m.v)}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-sm font-semibold transition ${
                  method === m.v
                    ? "bg-white text-gray-900 border-white shadow-md"
                    : "bg-white/5 border-white/15 text-white/70 hover:bg-white/10 hover:border-white/30"
                }`}
              >
                <span className="text-xl">{m.icon}</span>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Amount */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-white/70 mb-2">Amount (₹)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50 font-bold text-lg">₹</span>
            <input
              type="number"
              inputMode="decimal"
              value={amount || ""}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              placeholder="0"
              className="w-full bg-white/5 border border-white/15 rounded-xl px-4 pl-8 py-3 text-white text-lg font-bold placeholder-white/20 focus:outline-none focus:border-white/50 focus:bg-white/10 transition"
            />
          </div>
          <div className="flex gap-2 mt-2 flex-wrap">
            {[500, 1000, 2000, 5000, 10000].map((v) => (
              <button
                key={v}
                onClick={() => setAmount(v)}
                className="text-xs border border-white/20 hover:border-white/50 hover:bg-white/10 text-white/70 hover:text-white rounded-lg px-3 py-1.5 transition"
              >
                ₹{v.toLocaleString("en-IN")}
              </button>
            ))}
          </div>
        </div>

        {/* Reference */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-white/70 mb-2">
            Reference / UTR <span className="text-white/30 normal-case font-normal">(optional — helps admin verify faster)</span>
          </label>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. UTR123456789 or transaction ID"
            className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-white/50 focus:bg-white/10 transition"
          />
        </div>

        {/* Submit */}
        <button
          disabled={busy || amount <= 0}
          onClick={submit}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent-grad py-3 font-bold text-ink text-base shadow-glow hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <ArrowDownCircle size={18} />
          {busy ? "Submitting…" : "Submit Deposit Request"}
        </button>

        {msg && (
          <p className={`text-sm flex items-center gap-2 ${msg.ok ? "text-green-400" : "text-red-400"}`}>
            {msg.ok ? "✅" : "⚠️"} {msg.text}
          </p>
        )}
      </div>

      {/* Recent requests */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-sm p-5">
        <h2 className="font-display text-xl text-white mb-3">Recent Requests</h2>
        <ul className="divide-y divide-white/10 text-sm">
          {(mine ?? []).slice(0, 8).map((t: any) => (
            <li key={t.id} className="py-3 flex justify-between items-start gap-2">
              <div className="min-w-0">
                <span className="font-semibold text-white">₹{Number(t.amount).toLocaleString("en-IN")}</span>
                <span className="text-white/40 ml-2 text-xs">{(t.method ?? "").replace("_", " ")} · {t.kind}</span>
                {t.reference && <div className="text-xs text-white/30 truncate">{t.reference}</div>}
              </div>
              <span className={`text-xs uppercase tracking-wider px-2.5 py-1 rounded-lg font-bold shrink-0 ${
                ["APPROVED", "COMPLETED"].includes(t.status) ? "bg-green-500/20 text-green-400 border border-green-500/30" :
                t.status === "REJECTED"                      ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                                                               "bg-amber-500/15 text-amber-400 border border-amber-500/30"
              }`}>{t.status === "APPROVED" ? "COMPLETED" : t.status}</span>
            </li>
          ))}
          {(!mine || mine.length === 0) && (
            <li className="py-6 text-center text-white/30 text-xs">No deposit requests yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
