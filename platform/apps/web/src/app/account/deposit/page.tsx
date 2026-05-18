"use client";
import { useState } from "react";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";
import { ArrowDownCircle, Copy, CheckCircle2, Wallet, CreditCard, Bitcoin, QrCode } from "lucide-react";

type Method = "UPI" | "BANK_TRANSFER" | "CRYPTO";

interface UpiMethod    { enabled: boolean; upiId: string; qrCodeUrl?: string; displayName?: string; }
interface BankMethod   { enabled: boolean; accountName: string; accountNumber: string; ifsc: string; bankName: string; branch?: string; }
interface CryptoMethod { enabled: boolean; address: string; network: string; coin: string; qrCodeUrl?: string; }
interface DepositMethods { upi?: UpiMethod; bank?: BankMethod; crypto?: CryptoMethod; }

// fetcher without auth for public endpoint
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
async function publicFetch(url: string) {
  const r = await fetch(`${API_BASE}/api${url}`);
  return r.json();
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button onClick={copy} className="ml-2 p-1 rounded hover:bg-white/10 transition text-white/50 hover:text-white">
      {copied ? <CheckCircle2 size={14} className="text-green-400" /> : <Copy size={14} />}
    </button>
  );
}

const METHOD_INFO: { v: Method; label: string; icon: React.ReactNode }[] = [
  { v: "UPI",           label: "UPI",          icon: <Wallet size={16} /> },
  { v: "BANK_TRANSFER", label: "Bank Transfer", icon: <CreditCard size={16} /> },
  { v: "CRYPTO",        label: "Crypto",        icon: <Bitcoin size={16} /> },
];

export default function DepositPage() {
  const [method, setMethod]       = useState<Method>("UPI");
  const [amount, setAmount]       = useState(0);
  const [reference, setReference] = useState("");
  const [busy, setBusy]           = useState(false);
  const [msg, setMsg]             = useState<{ text: string; ok: boolean } | null>(null);

  const user = useAuthStore((s) => s.user);
  const { data: mine } = useSWR(user ? "/transactions/mine" : null);
  const { data: payMethods } = useSWR<DepositMethods>("/platform/deposit-methods", publicFetch, { refreshInterval: 30000 });

  async function submit() {
    if (amount <= 0) { setMsg({ text: "Enter a valid amount.", ok: false }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.post("/transactions", { kind: "DEPOSIT", method, amount, reference });
      setMsg({ text: "Deposit request submitted — admin will credit your wallet shortly.", ok: true });
      setAmount(0); setReference("");
      mutate("/transactions/mine");
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message || "Failed", ok: false });
    } finally { setBusy(false); }
  }

  const upi    = payMethods?.upi;
  const bank   = payMethods?.bank;
  const crypto = payMethods?.crypto;

  // Filter to only enabled methods
  const availableMethods = METHOD_INFO.filter((m) => {
    if (m.v === "UPI"           && upi    && !upi.enabled)    return false;
    if (m.v === "BANK_TRANSFER" && bank   && !bank.enabled)   return false;
    if (m.v === "CRYPTO"        && crypto && !crypto.enabled) return false;
    return true;
  });

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl">Deposit</h1>
        <p className="text-sm text-white/50 mt-1">Choose a payment method and transfer funds to the account below.</p>
      </div>

      {/* Step 1 — Select method */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-sm p-5 space-y-4">
        <h2 className="font-semibold text-white flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-accent-grad text-ink text-xs font-bold flex items-center justify-center">1</span>
          Select Payment Method
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {availableMethods.map((m) => (
            <button
              key={m.v}
              onClick={() => setMethod(m.v)}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-sm font-semibold transition ${
                method === m.v
                  ? "bg-white text-gray-900 border-white shadow-md"
                  : "bg-white/5 border-white/15 text-white/70 hover:bg-white/10 hover:border-white/30"
              }`}
            >
              {m.icon}
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Step 2 — Admin payment details (dynamic from admin panel) */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-sm p-5 space-y-3">
        <h2 className="font-semibold text-white flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-accent-grad text-ink text-xs font-bold flex items-center justify-center">2</span>
          Send Payment To
        </h2>

        {/* UPI */}
        {method === "UPI" && upi && (
          <div className="space-y-3">
            {upi.qrCodeUrl && (
              <div className="flex justify-center">
                <div className="bg-white p-3 rounded-xl inline-block">
                  <img src={upi.qrCodeUrl} alt="UPI QR Code" className="w-36 h-36 object-contain" />
                </div>
              </div>
            )}
            {!upi.qrCodeUrl && (
              <div className="flex justify-center">
                <div className="bg-white/5 border border-white/10 rounded-xl p-6 text-center text-white/30">
                  <QrCode size={48} className="mx-auto mb-2 opacity-30" />
                  <p className="text-xs">QR code not configured</p>
                </div>
              </div>
            )}
            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
              <p className="text-xs text-white/50 mb-1">UPI ID{upi.displayName ? ` · ${upi.displayName}` : ""}</p>
              <div className="flex items-center">
                <span className="font-mono font-bold text-white text-lg">{upi.upiId || "Not configured"}</span>
                {upi.upiId && <CopyBtn text={upi.upiId} />}
              </div>
            </div>
          </div>
        )}

        {/* Bank Transfer */}
        {method === "BANK_TRANSFER" && bank && (
          <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-4 space-y-2.5">
            {[
              { label: "Account Name",   value: bank.accountName },
              { label: "Account Number", value: bank.accountNumber },
              { label: "IFSC Code",      value: bank.ifsc },
              { label: "Bank Name",      value: bank.bankName },
              ...(bank.branch ? [{ label: "Branch", value: bank.branch }] : []),
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <span className="text-xs text-white/50 w-32 shrink-0">{label}</span>
                <div className="flex items-center gap-1 min-w-0">
                  <span className="font-mono text-sm text-white truncate">{value || "—"}</span>
                  {value && <CopyBtn text={value} />}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Crypto */}
        {method === "CRYPTO" && crypto && (
          <div className="space-y-3">
            {crypto.qrCodeUrl && (
              <div className="flex justify-center">
                <div className="bg-white p-3 rounded-xl inline-block">
                  <img src={crypto.qrCodeUrl} alt="Crypto QR" className="w-36 h-36 object-contain" />
                </div>
              </div>
            )}
            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/50">Coin / Token</span>
                <span className="font-bold text-yellow-400">{crypto.coin} <span className="text-white/40 font-normal text-xs">({crypto.network})</span></span>
              </div>
              <div>
                <p className="text-xs text-white/50 mb-1">Wallet Address</p>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-xs text-white break-all">{crypto.address || "Not configured"}</span>
                  {crypto.address && <CopyBtn text={crypto.address} />}
                </div>
              </div>
            </div>
          </div>
        )}

        {!payMethods && (
          <p className="text-xs text-white/30 text-center py-4">Loading payment details…</p>
        )}
      </div>

      {/* Step 3 — Amount & Reference */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-sm p-5 space-y-4">
        <h2 className="font-semibold text-white flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-accent-grad text-ink text-xs font-bold flex items-center justify-center">3</span>
          Enter Amount & Confirm
        </h2>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-white/70 mb-2">Amount (₹)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50 font-bold text-lg">₹</span>
            <input
              type="number" inputMode="decimal"
              value={amount || ""} onChange={(e) => setAmount(Number(e.target.value) || 0)}
              placeholder="0"
              className="w-full bg-white/5 border border-white/15 rounded-xl px-4 pl-8 py-3 text-white text-lg font-bold placeholder-white/20 focus:outline-none focus:border-white/50 focus:bg-white/10 transition"
            />
          </div>
          <div className="flex gap-2 mt-2 flex-wrap">
            {[500, 1000, 2000, 5000, 10000].map((v) => (
              <button key={v} onClick={() => setAmount(v)} className="text-xs border border-white/20 hover:border-white/50 hover:bg-white/10 text-white/70 hover:text-white rounded-lg px-3 py-1.5 transition">
                ₹{v.toLocaleString("en-IN")}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-white/70 mb-2">
            Reference / UTR <span className="text-white/30 normal-case font-normal">(optional — helps admin verify faster)</span>
          </label>
          <input
            value={reference} onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. UTR123456789 or transaction ID"
            className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-white/50 focus:bg-white/10 transition"
          />
        </div>
        <button
          disabled={busy || amount <= 0} onClick={submit}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent-grad py-3 font-bold text-ink text-base shadow-glow hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <ArrowDownCircle size={18} />
          {busy ? "Submitting…" : "I've Made the Payment — Submit Request"}
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
          {(mine ?? []).filter((t: any) => t.kind === "DEPOSIT").slice(0, 8).map((t: any) => (
            <li key={t.id} className="py-3 flex justify-between items-start gap-2">
              <div className="min-w-0">
                <span className="font-semibold text-white">₹{Number(t.amount).toLocaleString("en-IN")}</span>
                <span className="text-white/40 ml-2 text-xs">{(t.method ?? "").replace("_", " ")}</span>
                {t.reference && <div className="text-xs text-white/30 truncate">{t.reference}</div>}
              </div>
              <span className={`text-xs uppercase tracking-wider px-2.5 py-1 rounded-lg font-bold shrink-0 ${
                ["APPROVED", "COMPLETED"].includes(t.status) ? "bg-green-500/20 text-green-400 border border-green-500/30" :
                t.status === "REJECTED"                      ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                                                               "bg-amber-500/15 text-amber-400 border border-amber-500/30"
              }`}>{t.status === "APPROVED" ? "COMPLETED" : t.status}</span>
            </li>
          ))}
          {(!mine || mine.filter((t: any) => t.kind === "DEPOSIT").length === 0) && (
            <li className="py-5 text-center text-white/30 text-xs">No deposit requests yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
