"use client";
import { useState } from "react";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import {
  CreditCard, Wallet, Bitcoin, Save, CheckCircle2,
  ToggleLeft, ToggleRight, Eye, EyeOff
} from "lucide-react";

interface UpiMethod   { enabled: boolean; upiId: string; qrCodeUrl?: string; displayName?: string; }
interface BankMethod  { enabled: boolean; accountName: string; accountNumber: string; ifsc: string; bankName: string; branch?: string; }
interface CryptoMethod{ enabled: boolean; address: string; network: string; coin: string; qrCodeUrl?: string; }
interface DepositMethods { upi?: UpiMethod; bank?: BankMethod; crypto?: CryptoMethod; }

const KEY = "/admin/deposit-methods";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
    />
  );
}

function Toggle({ enabled, onToggle, label }: { enabled: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition ${
        enabled ? "border-green-500/50 bg-green-500/10 text-green-400" : "border-slate-600 bg-slate-800 text-slate-400 hover:border-slate-500"
      }`}
    >
      {enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
      {enabled ? "Enabled" : "Disabled"}
      <span className="text-slate-300 font-normal">{label}</span>
    </button>
  );
}

export default function PaymentMethodsPage() {
  const { data } = useSWR<DepositMethods>(KEY, { revalidateOnFocus: true });

  const [upi, setUpi]     = useState<UpiMethod>({ enabled: true, upiId: "", qrCodeUrl: "", displayName: "" });
  const [bank, setBank]   = useState<BankMethod>({ enabled: true, accountName: "", accountNumber: "", ifsc: "", bankName: "", branch: "" });
  const [crypto, setCrypto] = useState<CryptoMethod>({ enabled: false, address: "", network: "", coin: "", qrCodeUrl: "" });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy]   = useState(false);
  const [msg, setMsg]     = useState<{ text: string; ok: boolean } | null>(null);
  const [showQr, setShowQr] = useState(false);

  // Populate once data arrives
  if (data && !loaded) {
    if (data.upi)    setUpi({ enabled: true, upiId: "", qrCodeUrl: "", displayName: "", ...data.upi });
    if (data.bank)   setBank({ enabled: true, accountName: "", accountNumber: "", ifsc: "", bankName: "", branch: "", ...data.bank });
    if (data.crypto) setCrypto({ enabled: false, address: "", network: "", coin: "", qrCodeUrl: "", ...data.crypto });
    setLoaded(true);
  }

  async function save() {
    setBusy(true); setMsg(null);
    try {
      await api.post(KEY, { upi, bank, crypto });
      mutate(KEY);
      setMsg({ text: "Payment methods saved and live for users!", ok: true });
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message || "Failed to save.", ok: false });
    } finally { setBusy(false); }
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <CreditCard size={22} className="text-blue-400" /> Deposit Payment Methods
        </h1>
        <p className="text-sm text-slate-400 mt-1">Configure the payment details users see on the deposit page. Changes are live immediately.</p>
      </div>

      {/* UPI */}
      <section className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2"><Wallet size={18} className="text-orange-400" /> UPI</h2>
          <Toggle enabled={upi.enabled} onToggle={() => setUpi({ ...upi, enabled: !upi.enabled })} label="UPI deposits" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="UPI ID" hint="Users will copy this to make payment">
            <Input value={upi.upiId} onChange={(v) => setUpi({ ...upi, upiId: v })} placeholder="yourid@bankname" />
          </Field>
          <Field label="Display Name (optional)">
            <Input value={upi.displayName ?? ""} onChange={(v) => setUpi({ ...upi, displayName: v })} placeholder="e.g. Future9 Payments" />
          </Field>
        </div>
        <Field label="QR Code URL (optional)" hint="Paste a link to your UPI QR image — users will scan it">
          <div className="flex gap-2">
            <Input value={upi.qrCodeUrl ?? ""} onChange={(v) => setUpi({ ...upi, qrCodeUrl: v })} placeholder="https://i.imgur.com/your-qr.png" />
            {upi.qrCodeUrl && (
              <button onClick={() => setShowQr((s) => !s)} className="px-3 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition text-sm">
                {showQr ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            )}
          </div>
          {showQr && upi.qrCodeUrl && (
            <img src={upi.qrCodeUrl} alt="QR Preview" className="mt-2 w-32 h-32 object-contain rounded-xl border border-slate-600 bg-white p-1" />
          )}
        </Field>
      </section>

      {/* Bank Transfer */}
      <section className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2"><CreditCard size={18} className="text-blue-400" /> Bank Transfer</h2>
          <Toggle enabled={bank.enabled} onToggle={() => setBank({ ...bank, enabled: !bank.enabled })} label="bank transfers" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Account Name">
            <Input value={bank.accountName} onChange={(v) => setBank({ ...bank, accountName: v })} placeholder="Your Business Name" />
          </Field>
          <Field label="Account Number">
            <Input value={bank.accountNumber} onChange={(v) => setBank({ ...bank, accountNumber: v })} placeholder="1234567890" />
          </Field>
          <Field label="IFSC Code">
            <Input value={bank.ifsc} onChange={(v) => setBank({ ...bank, ifsc: v.toUpperCase() })} placeholder="SBIN0001234" />
          </Field>
          <Field label="Bank Name">
            <Input value={bank.bankName} onChange={(v) => setBank({ ...bank, bankName: v })} placeholder="State Bank of India" />
          </Field>
          <Field label="Branch (optional)" hint="">
            <Input value={bank.branch ?? ""} onChange={(v) => setBank({ ...bank, branch: v })} placeholder="Main Branch, Mumbai" />
          </Field>
        </div>
      </section>

      {/* Crypto */}
      <section className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2"><Bitcoin size={18} className="text-yellow-400" /> Crypto</h2>
          <Toggle enabled={crypto.enabled} onToggle={() => setCrypto({ ...crypto, enabled: !crypto.enabled })} label="crypto deposits" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Coin / Token">
            <Input value={crypto.coin} onChange={(v) => setCrypto({ ...crypto, coin: v })} placeholder="USDT" />
          </Field>
          <Field label="Network">
            <Input value={crypto.network} onChange={(v) => setCrypto({ ...crypto, network: v })} placeholder="TRC20 / ERC20 / BEP20" />
          </Field>
          <div className="col-span-2">
            <Field label="Wallet Address" hint="Users will copy this address to send funds">
              <Input value={crypto.address} onChange={(v) => setCrypto({ ...crypto, address: v })} placeholder="T..." />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="QR Code URL (optional)">
              <Input value={crypto.qrCodeUrl ?? ""} onChange={(v) => setCrypto({ ...crypto, qrCodeUrl: v })} placeholder="https://..." />
            </Field>
          </div>
        </div>
      </section>

      {/* Save */}
      <div className="flex items-center gap-4">
        <button
          onClick={save}
          disabled={busy}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-xl transition"
        >
          {busy ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
          {busy ? "Saving…" : "Save & Apply"}
        </button>
        {msg && (
          <p className={`text-sm flex items-center gap-2 ${msg.ok ? "text-green-400" : "text-red-400"}`}>
            {msg.ok && <CheckCircle2 size={14} />} {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}

function RefreshCw({ size, className }: { size: number; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
    </svg>
  );
}
