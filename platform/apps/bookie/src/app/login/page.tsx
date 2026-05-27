"use client";
import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { api } from "@/lib/api";

export default function BookieLogin() {
  const [form, setForm] = useState({ username: "", password: "", otp: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [needOtp, setNeedOtp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const { data } = await api.post("/auth/login", form);
      if (data.user.role !== "BOOKIE") throw new Error("This panel is for bookie accounts only.");
      localStorage.setItem("exch-bookie-auth", JSON.stringify({
        state: { user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken },
        version: 0,
      }));
      window.location.href = "/bookie/";
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message;
      if (msg === "OTP required") setNeedOtp(true);
      setErr(typeof msg === "string" ? msg : "Login failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen flex bg-[#0b1120]">
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12"
        style={{ background: "linear-gradient(135deg, #0f172a 0%, #064e3b 50%, #0f172a 100%)" }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center font-black text-white text-lg">B</div>
          <span className="text-white font-black text-lg tracking-tight">Bookie Panel</span>
        </div>
        <div>
          <h2 className="text-5xl font-black text-white leading-tight mb-4">
            Manage<br /><span className="text-emerald-400">Your Players</span><br />In One Place
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
            Fund users, track bets, manage wallets and watch your P/L — all from a single dashboard.
          </p>
        </div>
        <p className="text-slate-500 text-xs">DiamondPlay22 Bookie · Secure Access Only</p>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center font-black text-white text-lg">B</div>
            <span className="font-black text-xl text-gray-100">Bookie Panel</span>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-black text-gray-100 mb-1">Sign in</h1>
            <p className="text-gray-500 text-sm">Bookie accounts only</p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Username</label>
              <input required autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-emerald-500/30 bg-gray-800 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30 transition-all" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Password</label>
              <div className="relative">
                <input required autoComplete="current-password" type={showPassword ? "text" : "password"} placeholder="••••••••"
                  value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-4 py-3 pr-12 rounded-xl border border-emerald-500/30 bg-gray-800 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30 transition-all" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-400 transition">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            {needOtp && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">2FA Code</label>
                <input inputMode="numeric" placeholder="123 456" value={form.otp} onChange={(e) => setForm({ ...form, otp: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-emerald-500/30 bg-gray-800 text-gray-200 focus:outline-none focus:border-emerald-400 transition-all" />
              </div>
            )}
            {err && <div className="p-3 rounded-xl text-sm font-medium text-red-300 bg-red-900/20 border border-red-500/30">{err}</div>}
            <button type="submit" disabled={busy}
              className="w-full py-3.5 rounded-xl font-bold text-white transition-all duration-200 flex items-center justify-center gap-2 text-sm tracking-wide disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #00c853 0%, #16a34a 100%)", boxShadow: "0 4px 16px rgba(0,200,83,0.4)" }}>
              <Lock size={16} /> {busy ? "Signing in…" : "Enter Bookie Panel"}
            </button>
          </form>
          <p className="text-center text-xs text-gray-500 mt-8">Secure connection · diamondplay22.site</p>
        </div>
      </div>
    </div>
  );
}
