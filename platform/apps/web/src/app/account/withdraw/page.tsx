"use client";
import { useState } from "react";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";

export default function WithdrawPage() {
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<"UPI" | "BANK_TRANSFER" | "CRYPTO">("UPI");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  
  const user = useAuthStore((s) => s.user);
  const { data: wallet } = useSWR(user ? "/wallet/summary" : null);
  const { data: mine } = useSWR(user ? "/transactions/mine" : null);

  async function submit() {
    setBusy(true); setMsg(null);
    try {
      await api.post("/transactions", { kind: "WITHDRAWAL", method, amount, reference });
      setMsg("Withdrawal requested — admin will review.");
      setAmount(0); setReference("");
      mutate("/transactions/mine");
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "Failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl">Withdraw</h1>
      <div className="text-sm text-white/60">Available: <span className="text-accent font-semibold">{wallet?.available?.toLocaleString("en-IN") ?? "—"}</span></div>

      <div className="glass rounded-xl p-5 max-w-lg space-y-3">
        <Field label="Method">
          <select value={method} onChange={(e) => setMethod(e.target.value as any)} className="input">
            <option value="UPI">UPI</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="CRYPTO">Crypto</option>
          </select>
        </Field>
        <Field label="Amount (₹)">
          <input inputMode="decimal" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value) || 0)} className="input" />
        </Field>
        <Field label="Payout details (UPI ID / Account / Wallet)">
          <input value={reference} onChange={(e) => setReference(e.target.value)} className="input" />
        </Field>
        <button disabled={busy || amount <= 0} onClick={submit}
          className="w-full rounded-md bg-accent-grad py-2.5 font-bold text-ink shadow-glow hover:brightness-110 disabled:opacity-50">
          {busy ? "Submitting…" : "Request withdrawal"}
        </button>
        {msg && <p className="text-xs text-accentSoft">{msg}</p>}
      </div>

      <section className="glass rounded-xl p-4">
        <h2 className="font-display text-xl mb-2">Recent requests</h2>
        <ul className="text-sm divide-y divide-line/40">
          {(mine ?? []).filter((t: any) => t.kind === "WITHDRAWAL").slice(0, 8).map((t: any) => (
            <li key={t.id} className="py-2 flex justify-between">
              <span>₹ {Number(t.amount).toLocaleString("en-IN")} · {t.method}</span>
              <span className="text-xs uppercase tracking-wider text-white/60">{t.status}</span>
            </li>
          ))}
        </ul>
      </section>

      <style jsx>{`
        :global(.input){width:100%;background:#170a10;border:1px solid rgba(255,122,24,0.2);border-radius:8px;padding:10px 12px;font-size:14px}
        :global(.input:focus){outline:none;border-color:#ff7a18}
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs uppercase tracking-wider text-white/60">{label}</span><div className="mt-1">{children}</div></label>;
}
