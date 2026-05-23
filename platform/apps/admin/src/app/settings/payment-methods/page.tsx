"use client";
import { useState, useEffect, useRef } from "react";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import { CreditCard, Wallet, Bitcoin, Save, CheckCircle2, ToggleLeft, ToggleRight, Eye, EyeOff, Upload } from "lucide-react";

interface UpiMethod    { enabled: boolean; upiId: string; qrCodeUrl?: string; displayName?: string; }
interface BankMethod   { enabled: boolean; accountName: string; accountNumber: string; ifsc: string; bankName: string; branch?: string; }
interface CryptoMethod { enabled: boolean; address: string; network: string; coin: string; qrCodeUrl?: string; }
interface DepositMethods { upi?: UpiMethod; bank?: BankMethod; crypto?: CryptoMethod; }

const KEY = "/admin/deposit-methods";
const inputCls = "w-full bg-white border border-yellow-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition";

export default function PaymentMethodsPage() {
  const { data } = useSWR<DepositMethods>(KEY);
  const [upi,    setUpi]    = useState<UpiMethod>({ enabled: false, upiId: "", qrCodeUrl: "", displayName: "" });
  const [bank,   setBank]   = useState<BankMethod>({ enabled: false, accountName: "", accountNumber: "", ifsc: "", bankName: "", branch: "" });
  const [crypto, setCrypto] = useState<CryptoMethod>({ enabled: false, address: "", network: "", coin: "", qrCodeUrl: "" });
  const [busy, setBusy]     = useState(false);
  const [msg,  setMsg]      = useState<{ text: string; ok: boolean } | null>(null);
  const [showQr, setShowQr] = useState(false);
  const upiFileInputRef     = useRef<HTMLInputElement>(null);
  const cryptoFileInputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!data) return;
    if (data.upi)    setUpi(prev    => ({ ...prev, ...data.upi }));
    if (data.bank)   setBank(prev   => ({ ...prev, ...data.bank }));
    if (data.crypto) setCrypto(prev => ({ ...prev, ...data.crypto }));
  }, [data]);

  function handleQrUpload(e: React.ChangeEvent<HTMLInputElement>, type: "upi" | "crypto") {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (type === "upi") setUpi(p => ({ ...p, qrCodeUrl: dataUrl }));
      else setCrypto(p => ({ ...p, qrCodeUrl: dataUrl }));
    };
    reader.readAsDataURL(file);
  }

  async function save() {
    setBusy(true); setMsg(null);
    try {
      await api.post(KEY, { upi, bank, crypto });
      mutate(KEY);
      setMsg({ text: "Payment methods saved!", ok: true });
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message || "Failed to save.", ok: false });
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6 max-w-3xl animate-fade-in">
      <div>
        <h1 className="text-2xl font-black text-gray-900">Payment Methods</h1>
        <p className="text-sm text-gray-500 mt-0.5">Configure deposit methods shown to users.</p>
      </div>

      {/* UPI */}
      <section className="rounded-xl border border-yellow-100 bg-white p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-gray-800 flex items-center gap-2"><Wallet size={18} className="text-yellow-500" /> UPI</h2>
          <button
            onClick={() => setUpi(p => ({ ...p, enabled: !p.enabled }))}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-semibold transition ${
              upi.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-500 hover:border-yellow-300"
            }`}
          >
            {upi.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
            {upi.enabled ? "Enabled" : "Disabled"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">UPI ID</label>
            <input value={upi.upiId} onChange={e => setUpi(p => ({ ...p, upiId: e.target.value }))} placeholder="yourid@bank" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Display Name</label>
            <input value={upi.displayName ?? ""} onChange={e => setUpi(p => ({ ...p, displayName: e.target.value }))} placeholder="DiamondPlay Payments" className={inputCls} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">QR Code</label>
          <div className="flex gap-2">
            <input value={upi.qrCodeUrl ?? ""} onChange={e => setUpi(p => ({ ...p, qrCodeUrl: e.target.value }))} placeholder="https://..." className={`${inputCls} flex-1`} />
            <button type="button" onClick={() => upiFileInputRef.current?.click()}
              className="px-3 rounded-lg bg-gray-50 border border-gray-200 text-gray-500 text-sm hover:border-yellow-300 transition" title="Upload QR code image">
              <Upload size={14} />
            </button>
            {upi.qrCodeUrl && (
              <button onClick={() => setShowQr(s => !s)} className="px-3 rounded-lg bg-gray-50 border border-gray-200 text-gray-500 text-sm">
                {showQr ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            )}
          </div>
          <input ref={upiFileInputRef} type="file" accept="image/*" onChange={(e) => handleQrUpload(e, "upi")} className="hidden" />
          {showQr && upi.qrCodeUrl && (
            <img src={upi.qrCodeUrl} alt="QR" className="mt-2 w-32 h-32 object-contain rounded-lg border border-yellow-100 bg-white p-1" />
          )}
        </div>
      </section>

      {/* Bank Transfer */}
      <section className="rounded-xl border border-yellow-100 bg-white p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-gray-800 flex items-center gap-2"><CreditCard size={18} className="text-blue-500" /> Bank Transfer</h2>
          <button
            onClick={() => setBank(p => ({ ...p, enabled: !p.enabled }))}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-semibold transition ${
              bank.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-500 hover:border-yellow-300"
            }`}
          >
            {bank.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
            {bank.enabled ? "Enabled" : "Disabled"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(["accountName", "accountNumber", "ifsc", "bankName"] as const).map((k) => (
            <div key={k}>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                {{ accountName: "Account Name", accountNumber: "Account Number", ifsc: "IFSC Code", bankName: "Bank Name" }[k]}
              </label>
              <input value={bank[k]} onChange={e => setBank(p => ({ ...p, [k]: e.target.value }))} className={inputCls} />
            </div>
          ))}
        </div>
      </section>

      {/* Crypto */}
      <section className="rounded-xl border border-yellow-100 bg-white p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-gray-800 flex items-center gap-2"><Bitcoin size={18} className="text-orange-500" /> Crypto</h2>
          <button
            onClick={() => setCrypto(p => ({ ...p, enabled: !p.enabled }))}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-semibold transition ${
              crypto.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-500 hover:border-yellow-300"
            }`}
          >
            {crypto.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
            {crypto.enabled ? "Enabled" : "Disabled"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Coin</label>
            <input value={crypto.coin} onChange={e => setCrypto(p => ({ ...p, coin: e.target.value }))} placeholder="USDT" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Network</label>
            <input value={crypto.network} onChange={e => setCrypto(p => ({ ...p, network: e.target.value }))} placeholder="TRC20" className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Wallet Address</label>
            <input value={crypto.address} onChange={e => setCrypto(p => ({ ...p, address: e.target.value }))} placeholder="T..." className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">QR Code</label>
            <div className="flex gap-2">
              <input value={crypto.qrCodeUrl ?? ""} onChange={e => setCrypto(p => ({ ...p, qrCodeUrl: e.target.value }))} placeholder="https://..." className={`${inputCls} flex-1`} />
              <button type="button" onClick={() => cryptoFileInputRef.current?.click()}
                className="px-3 rounded-lg bg-gray-50 border border-gray-200 text-gray-500 text-sm hover:border-yellow-300 transition" title="Upload QR code image">
                <Upload size={14} />
              </button>
              {crypto.qrCodeUrl && (
                <button onClick={() => setShowQr(s => !s)} className="px-3 rounded-lg bg-gray-50 border border-gray-200 text-gray-500 text-sm">
                  {showQr ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              )}
            </div>
            <input ref={cryptoFileInputRef} type="file" accept="image/*" onChange={(e) => handleQrUpload(e, "crypto")} className="hidden" />
            {showQr && crypto.qrCodeUrl && (
              <img src={crypto.qrCodeUrl} alt="QR" className="mt-2 w-32 h-32 object-contain rounded-lg border border-yellow-100 bg-white p-1" />
            )}
          </div>
        </div>
      </section>

      <div className="flex items-center gap-4">
        <button
          onClick={save}
          disabled={busy}
          className="flex items-center gap-2 bg-gradient-to-r from-yellow-400 to-amber-500 px-6 py-2.5 rounded-lg font-bold text-slate-900 shadow-sm hover:brightness-110 disabled:opacity-50 transition"
        >
          <Save size={16} />
          {busy ? "Saving…" : "Save & Apply"}
        </button>
        {msg && (
          <p className={`text-sm flex items-center gap-1 font-medium ${msg.ok ? "text-emerald-600" : "text-red-500"}`}>
            {msg.ok && <CheckCircle2 size={14} />} {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}
