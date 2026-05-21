"use client";
import { useState } from "react";
import { Eye, EyeOff, Shield, Lock } from "lucide-react";
import { api } from "@/lib/api";

export default function AdminLogin() {
  const [form, setForm] = useState({ username: "", password: "", otp: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [needOtp, setNeedOtp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;
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
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "linear-gradient(135deg, #100810 0%, #1a0f2e 100%)" }}>
      <div className="w-full max-w-md">
        {/* Logo & Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-6 relative" style={{ background: "linear-gradient(135deg, #d4423f 0%, #a01628 100%)", boxShadow: "0 8px 32px rgba(212, 66, 63, 0.3)" }}>
            <Shield size={40} className="text-white" />
          </div>
          <h1 className="text-5xl font-black text-white mb-2 tracking-tight">Admin Panel</h1>
          <p className="text-white/50 text-sm">Secure access for authorized personnel only</p>
        </div>

        <form onSubmit={submit} className="space-y-5">
          {/* Username */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-2">Username</label>
            <input
              required
              autoComplete="username"
              placeholder="admin"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border transition-all text-white placeholder-white/30"
              style={{ background: "rgba(26, 20, 51, 0.8)", borderColor: "rgba(167, 139, 250, 0.2)", borderWidth: "1px" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(167, 139, 250, 0.5)"; e.currentTarget.style.background = "rgba(26, 20, 51, 1)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(167, 139, 250, 0.2)"; e.currentTarget.style.background = "rgba(26, 20, 51, 0.8)"; }}
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-2">Password</label>
            <div className="relative">
              <input
                required
                autoComplete="current-password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border transition-all text-white placeholder-white/30 pr-12"
                style={{ background: "rgba(26, 20, 51, 0.8)", borderColor: "rgba(167, 139, 250, 0.2)", borderWidth: "1px" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(167, 139, 250, 0.5)"; e.currentTarget.style.background = "rgba(26, 20, 51, 1)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(167, 139, 250, 0.2)"; e.currentTarget.style.background = "rgba(26, 20, 51, 0.8)"; }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* 2FA */}
          {needOtp && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-2">2FA Code</label>
              <input
                inputMode="numeric"
                placeholder="123 456"
                value={form.otp}
                onChange={(e) => setForm({ ...form, otp: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border transition-all text-white placeholder-white/30"
                style={{ background: "rgba(26, 20, 51, 0.8)", borderColor: "rgba(167, 139, 250, 0.2)", borderWidth: "1px" }}
              />
            </div>
          )}

          {/* Lock/Unlock Toggle */}
          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                onClick={() => setDisabled(!disabled)}
                className="relative w-10 h-6 rounded-full transition-all"
                style={{ background: disabled ? "rgba(212, 66, 63, 0.6)" : "rgba(167, 139, 250, 0.2)" }}
              >
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-transform ${disabled ? "left-5" : "left-1"}`} />
              </div>
              <span className="text-xs font-semibold text-white/60">
                {disabled ? "🔒 Locked" : "🔓 Unlocked"}
              </span>
            </label>
          </div>

          {/* Error Message */}
          {err && (
            <div className="p-3 rounded-lg text-xs font-medium text-white flex items-center gap-2" style={{ background: "rgba(212, 66, 63, 0.15)", border: "1px solid rgba(212, 66, 63, 0.3)" }}>
              <span>⚠</span> {err}
            </div>
          )}

          {/* Sign In Button */}
          <button
            disabled={busy || disabled}
            className="w-full py-3 rounded-xl font-bold text-white transition-all duration-300 flex items-center justify-center gap-2 text-sm uppercase tracking-wider"
            style={{
              background: disabled
                ? "rgba(100, 100, 100, 0.4)"
                : busy
                  ? "linear-gradient(135deg, #7740ed 0%, #a78bfa 100%)"
                  : "linear-gradient(135deg, #d4423f 0%, #a01628 100%)",
              boxShadow: disabled
                ? "none"
                : "0 8px 24px rgba(212, 66, 63, 0.3)",
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <Lock size={16} />
            {busy ? "Signing in…" : disabled ? "Locked" : "Enter Admin Panel"}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-xs text-white/25 mt-8 tracking-wide">
          DiamondPlay22 Admin • v1.0
        </p>
      </div>
    </div>
  );
}
