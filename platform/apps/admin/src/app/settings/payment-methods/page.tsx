"use client";
import { useState, useEffect } from "react";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import { CreditCard, Wallet, Bitcoin, Save, CheckCircle2, ToggleLeft, ToggleRight, Eye, EyeOff } from "lucide-react";

interface UpiMethod    { enabled: boolean; upiId: string; qrCodeUrl?: string; displayName?: string; }
interface BankMethod   { enabled: boolean; accountName: string; accountNumber: string; ifsc: string; bankName: string; branch?: string; }
interface CryptoMethod { enabled: boolean; address: string; network: string; coin: string; qrCodeUrl?: string; }
interface DepositMethods { upi?: UpiMethod; bank?: BankMethod; crypto?: CryptoMethod; }

const KEY = "/admin/deposit-methods";

export default function PaymentMethodsPage() {
  const { data } = useSWR<DepositMethods>(KEY);
  const [upi,    setUpi]    = useState<UpiMethod>({ enabled: false, upiId: "", qrCodeUrl: "", displayName: "" });
  const [bank,   setBank]   = useState<BankMethod>({ enabled: false, accountName: "", accountNumber: "", ifsc: "", bankName: "", branch: "" });
  const [crypto, setCrypto] = useState<CryptoMethod>({ enabled: false, address: "", network: "", coin: "", qrCodeUrl: "" });
  const [busy, setBusy]     = useState(false);
  const [msg,  setMsg]      = useState<{ text: string; ok: boolean } | null>(null);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    if (!data) return;
    if (data.upi)    setUpi(prev    => ({ ...prev, ...data.upi }));
    if (data.bank)   setBank(prev   => ({ ...prev, ...data.bank }));
    if (data.crypto) setCrypto(prev => ({ ...prev, ...data.crypto }));
  }, [data]);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      await api.post(KEY, { upi, bank, crypto });
      mutate(KEY);
      setMsg({ text: "Payment methods saved!", ok: true });
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message || "Failed to save.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl animate-fade-in">
      <div>
        <h1 className="font-display text-3xl">Payment Methods</h1>
        <p className="text-sm text-white/60 mt-1">Configure deposit methods shown to users.</p>
      </div>

      {/* UPI */}
      <section className="glass rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2"><Wallet size={18} className="text-accent" /> UPI</h2>
          <button
            onClick={() => setUpi(p => ({ ...p, enabled: !p.enabled }))}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-semibold transition ${upi.enabled ? "border-ok/50 bg-ok/10 text-ok" : "border-line text-white/60 hover:border-accent"}`}
          >
            {upi.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
            {upi.enabled ? "Enabled" : "Disabled"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-white/50 mb-1">UPI ID</label>
            <input value={upi.upiId} onChange={e => setUpi(p => ({ ...p, upiId: e.target.value }))} placeholder="yourid@bank"
              className="w-full bg-panel/60 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-white/50 mb-1">Display Name</label>
            <input value={upi.displayName ?? ""} onChange={e => setUpi(p => ({ ...p, displayName: e.target.value }))} placeholder="DiamondPlay Payments"
              className="w-full bg-panel/60 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-white/50 mb-1">QR Code URL</label>
          <div className="flex gap-2">
            <input value={upi.qrCodeUrl ?? ""} onChange={e => setUpi(p => ({ ...p, qrCodeUrl: e.target.value }))} placeholder="https://..."
              className="flex-1 bg-panel/60 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
            {upi.qrCodeUrl && (
              <button onClick={() => setShowQr(s => !s)} className="px-3 rounded-lg bg-panel2 border border-line text-sm">
                {showQr ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            )}
          </div>
          {showQr && upi.qrCodeUrl && (
            <img src={upi.qrCodeUrl} alt="QR" className="mt-2 w-32 h-32 object-contain rounded-lg border border-line bg-white p-1" />
          )}
        </div>
      </section>

      {/* Bank Transfer */}
      <section className="glass rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2"><CreditCard size={18} className="text-back" /> Bank Transfer</h2>
          <button
            onClick={() => setBank(p => ({ ...p, enabled: !p.enabled }))}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-semibold transition ${bank.enabled ? "border-ok/50 bg-ok/10 text-ok" : "border-line text-white/60 hover:border-accent"}`}
          >
            {bank.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
            {bank.enabled ? "Enabled" : "Disabled"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(["accountName", "accountNumber", "ifsc", "bankName"] as const).map((k) => (
            <div key={k}>
              <label className="block text-xs font-semibold uppercase tracking-wider text-white/50 mb-1">
                {{ accountName: "Account Name", accountNumber: "Account Number", ifsc: "IFSC Code", bankName: "Bank Name" }[k]}
              </label>
              <input value={bank[k]} onChange={e => setBank(p => ({ ...p, [k]: e.target.value }))}
                className="w-full bg-panel/60 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
            </div>
          ))}
        </div>
      </section>

      {/* Crypto */}
      <section className="glass rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2"><Bitcoin size={18} className="text-gold" /> Crypto</h2>
          <button
            onClick={() => setCrypto(p => ({ ...p, enabled: !p.enabled }))}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-semibold transition ${crypto.enabled ? "border-ok/50 bg-ok/10 text-ok" : "border-line text-white/60 hover:border-accent"}`}
          >
            {crypto.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
            {crypto.enabled ? "Enabled" : "Disabled"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-white/50 mb-1">Coin</label>
            <input value={crypto.coin} onChange={e => setCrypto(p => ({ ...p, coin: e.target.value }))} placeholder="USDT"
              className="w-full bg-panel/60 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-white/50 mb-1">Network</label>
            <input value={crypto.network} onChange={e => setCrypto(p => ({ ...p, network: e.target.value }))} placeholder="TRC20"
              className="w-full bg-panel/60 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-white/50 mb-1">Wallet Address</label>
            <input value={crypto.address} onChange={e => setCrypto(p => ({ ...p, address: e.target.value }))} placeholder="T..."
              className="w-full bg-panel/60 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
          </div>
        </div>
      </section>

      <div className="flex items-center gap-4">
        <button onClick={save} disabled={busy}
          className="flex items-center gap-2 bg-accent-grad px-6 py-2.5 rounded-lg font-semibold text-ink shadow-glow hover:brightness-110 disabled:opacity-50 transition">
          <Save size={16} />
          {busy ? "Saving…" : "Save & Apply"}
        </button>
        {msg && (
          <p className={`text-sm flex items-center gap-1 ${msg.ok ? "text-ok" : "text-bad"}`}>
            {msg.ok && <CheckCircle2 size={14} />} {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}
