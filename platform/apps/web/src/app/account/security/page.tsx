"use client";
import { useState } from "react";
import { api } from "@/lib/api";

export default function SecurityPage() {
  const [qr, setQr] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function start() {
    const { data } = await api.post("/auth/2fa/start");
    setQr(data.qr);
  }
  async function enable() {
    try {
      await api.post("/auth/2fa/enable", { otp });
      setMsg("2FA enabled. You'll need it on next login.");
      setQr(null); setOtp("");
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "Failed");
    }
  }

  return (
    <div className="space-y-4 max-w-xl">
      <h1 className="font-display text-3xl">Security & 2FA</h1>
      <div className="glass rounded-xl p-5 space-y-3">
        <p className="text-sm text-white/70">
          Add Google Authenticator (or any TOTP app) for an extra layer of login protection.
        </p>
        {!qr ? (
          <button onClick={start} className="rounded-md bg-accent-grad px-4 py-2 font-bold text-ink shadow-glow">Generate QR</button>
        ) : (
          <div className="space-y-3">
            <img src={qr} alt="2FA QR" className="h-44 w-44 rounded bg-white p-1" />
            <input className="input" placeholder="6-digit code" value={otp} onChange={(e) => setOtp(e.target.value)} />
            <button onClick={enable} className="rounded-md bg-accent-grad px-4 py-2 font-bold text-ink shadow-glow">Enable 2FA</button>
          </div>
        )}
        {msg && <p className="text-xs text-accentSoft">{msg}</p>}
      </div>
      <style jsx>{`
        :global(.input){width:100%;background:#170a10;border:1px solid rgba(255,122,24,0.2);border-radius:8px;padding:10px 12px;font-size:14px}
        :global(.input:focus){outline:none;border-color:#ff7a18}
      `}</style>
    </div>
  );
}
