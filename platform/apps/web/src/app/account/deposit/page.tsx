"use client";
import { useState } from "react";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";

const methods = [
  { v: "UPI",           label: "UPI" },
  { v: "BANK_TRANSFER", label: "Bank Transfer" },
  { v: "CRYPTO",        label: "Crypto" },
] as const;

export default function DepositPage() {
  const [method, setMethod] = useState<typeof methods[number]["v"]>("UPI");
  const [amount, setAmount] = useState(0);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  
  const user = useAuthStore((s) => s.user);
  const { data: mine } = useSWR(user ? "/transactions/mine" : null);

  async function submit() {
    setBusy(true); setMsg(null);
    try {
      await api.post("/transactions", { kind: "DEPOSIT", method, amount, reference });
      setMsg("Deposit request submitted — admin will review shortly.");
      setAmount(0); setReference("");
      mutate("/transactions/mine");
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "Failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl">Deposit</h1>
      <div className="glass rounded-xl p-5 max-w-lg">
        <label className="block text-xs uppercase tracking-wider text-white/60">Method</label>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {methods.map((m) => (
            <button key={m.v} onClick={() => setMethod(m.v)}
              className={"py-2 rounded-md text-sm font-semibold border " +
                (method === m.v ? "bg-accent-grad text-ink border-transparent shadow-glow" : "bg-panel2 border-line hover:border-accent")}>
              {m.label}
            </button>
          ))}
        </div>

        <label className="block text-xs uppercase tracking-wider text-white/60 mt-4">Amount (₹)</label>
        <input inputMode="decimal" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value) || 0)}
          className="mt-1 w-full bg-ink border border-line rounded-md px-3 py-2 focus:outline-none focus:border-accent" />

        <label className="block text-xs uppercase tracking-wider text-white/60 mt-4">Reference / UTR (optional)</label>
        <input value={reference} onChange={(e) => setReference(e.target.value)}
          className="mt-1 w-full bg-ink border border-line rounded-md px-3 py-2 focus:outline-none focus:border-accent" />

        <button disabled={busy || amount <= 0} onClick={submit}
          className="mt-4 w-full rounded-md bg-accent-grad py-2.5 font-bold text-ink shadow-glow hover:brightness-110 disabled:opacity-50">
          {busy ? "Submitting…" : "Submit deposit request"}
        </button>
        {msg && <p className="mt-3 text-xs text-accentSoft">{msg}</p>}
      </div>

      <section className="glass rounded-xl p-4">
        <h2 className="font-display text-xl mb-2">Recent requests</h2>
        <ul className="text-sm divide-y divide-line/40">
          {(mine ?? []).slice(0, 8).map((t: any) => (
            <li key={t.id} className="py-2 flex justify-between">
              <span>{t.kind} · {t.method} · {Number(t.amount).toLocaleString("en-IN")}</span>
              <span className="text-xs uppercase tracking-wider text-white/60">{t.status}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
