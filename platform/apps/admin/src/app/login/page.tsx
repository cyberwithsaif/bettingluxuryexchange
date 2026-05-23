"use client";
import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { api } from "@/lib/api";

export default function AdminLogin() {
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
      if (!["SUPER_ADMIN", "ADMIN", "SUPER_MASTER", "MASTER", "AGENT"].includes(data.user.role)) {
        throw new Error("Not authorized for admin panel");
      }
      localStorage.setItem("exch-admin-auth", JSON.stringify({
        state: { user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken },
        version: 0,
      }));
      window.location.href = "/admin/";
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message;
      if (msg === "OTP required") setNeedOtp(true);
      setErr(typeof msg === "string" ? msg : "Login failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Left panel â€” branding */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12"
        style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)" }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-yellow-400 flex items-center justify-center font-black text-slate-900 text-lg">D</div>
          <span className="text-white font-black text-lg tracking-tight">DiamondPlay22</span>
        </div>
        <div>
          <h2 className="text-5xl font-black text-white leading-tight mb-4">
            Admin<br />
            <span className="text-yellow-400">Control</span><br />
            Panel
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
            Real-time platform management. Monitor bets, manage users, and control markets from one place.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4">
            {[
              { label: "Users", icon: "ðŸ‘¥" },
              { label: "Live Markets", icon: "ðŸ“Š" },
              { label: "Transactions", icon: "ðŸ’³" },
              { label: "Risk Monitor", icon: "âš¡" },
            ].map(({ label, icon }) => (
              <div key={label} className="flex items-center gap-2 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.06)" }}>
                <span className="text-xl">{icon}</span>
                <span className="text-slate-300 text-sm font-semibold">{label}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-slate-500 text-xs">DiamondPlay22 Admin v1.0 â€¢ Secure Access Only</p>
      </div>

      {/* Right panel â€” form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-10 h-10 rounded-xl bg-yellow-400 flex items-center justify-center font-black text-slate-900 text-lg">D</div>
            <span className="font-black text-xl text-gray-900">DiamondPlay22</span>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-black text-gray-900 mb-1">Sign in</h1>
            <p className="text-gray-500 text-sm">Authorized personnel only</p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            {/* Username */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Username</label>
              <input
                required
                autoComplete="username"
                placeholder="admin"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-yellow-200 bg-white text-gray-800 placeholder-gray-300 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition-all"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Password</label>
              <div className="relative">
                <input
                  required
                  autoComplete="current-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-4 py-3 pr-12 rounded-xl border border-yellow-200 bg-white text-gray-800 placeholder-gray-300 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-600 transition"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* 2FA */}
            {needOtp && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">2FA Code</label>
                <input
                  inputMode="numeric"
                  placeholder="123 456"
                  value={form.otp}
                  onChange={(e) => setForm({ ...form, otp: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-yellow-200 bg-white text-gray-800 placeholder-gray-300 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 transition-all"
                />
              </div>
            )}

            {/* Error */}
            {err && (
              <div className="p-3 rounded-xl text-sm font-medium text-red-700 bg-red-50 border border-red-200 flex items-center gap-2">
                <span>âš </span> {err}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-3.5 rounded-xl font-bold text-slate-900 transition-all duration-200 flex items-center justify-center gap-2 text-sm tracking-wide disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: busy
                  ? "linear-gradient(135deg, #fcd34d, #fbbf24)"
                  : "linear-gradient(135deg, #ffcc00 0%, #f59e0b 100%)",
                boxShadow: "0 4px 16px rgba(245,158,11,0.4)",
              }}
            >
              <Lock size={16} />
              {busy ? "Signing inâ€¦" : "Enter Admin Panel"}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-8">
            Secure connection â€¢ diamondplay22.site
          </p>
        </div>
      </div>
    </div>
  );
}
