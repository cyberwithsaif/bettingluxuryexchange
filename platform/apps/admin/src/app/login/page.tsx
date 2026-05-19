"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Shield } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";

export default function AdminLogin() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.set);
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
      // Write directly to localStorage without calling setAuth() first.
      localStorage.setItem("exch-admin-auth", JSON.stringify({
        state: { user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken },
        version: 0,
      }));
      // Use window.location.href for a FULL page reload, which triggers Zustand hydration.
      // SPA navigation with router.replace() doesn't re-hydrate Zustand from storage.
      // The localStorage write completes synchronously before navigation.
      window.location.href = "/admin/";
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message;
      if (msg === "OTP required") setNeedOtp(true);
      setErr(typeof msg === "string" ? msg : "Login failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 bg-bg">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent-grad shadow-glow mb-4">
            <Shield size={32} className="text-ink" />
          </div>
          <h1 className="font-display text-4xl bg-accent-grad bg-clip-text text-transparent">Admin Panel</h1>
          <p className="text-white/50 text-sm mt-1">Secure access for authorized personnel only</p>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-line bg-panel p-7 shadow-2xl space-y-4">
          {/* Username */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-white/60 mb-1">Username</label>
            <input
              required
              autoComplete="username"
              className="input"
              placeholder="Enter username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </div>

          {/* Password with show/hide */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-white/60 mb-1">Password</label>
            <div className="relative">
              <input
                required
                autoComplete="current-password"
                type={showPassword ? "text" : "password"}
                className="input pr-10"
                placeholder="Enter password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition"
                tabIndex={-1}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* 2FA */}
          {needOtp && (
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/60 mb-1">2FA Code</label>
              <input
                className="input"
                inputMode="numeric"
                placeholder="123 456"
                value={form.otp}
                onChange={(e) => setForm({ ...form, otp: e.target.value })}
              />
            </div>
          )}

          {/* Disable login toggle */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={() => setDisabled((v) => !v)}
                className={`relative w-9 h-5 rounded-full transition-colors ${disabled ? "bg-bad/60" : "bg-white/10"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${disabled ? "translate-x-4" : "translate-x-0"}`} />
              </div>
              <span className="text-xs text-white/50">{disabled ? "Login disabled" : "Login enabled"}</span>
            </label>
            <span className="text-[10px] text-white/30">Toggle to lock</span>
          </div>

          {/* Error */}
          {err && (
            <div className="text-xs text-bad bg-bad/15 border border-bad/40 rounded-md px-3 py-2 flex items-center gap-2">
              <span className="text-bad">⚠</span> {err}
            </div>
          )}

          {/* Submit */}
          <button
            disabled={busy || disabled}
            className="w-full rounded-md bg-accent-grad py-2.5 font-bold text-ink shadow-glow hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {busy ? "Signing in…" : disabled ? "Login Disabled" : "Sign in"}
          </button>
        </form>

        <p className="text-center text-[11px] text-white/25 mt-4">
          Future9 Exchange · Admin v1.0
        </p>
      </div>

      <style jsx>{`
        :global(.input){
          width: 100%;
          background: #0d0e15;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 14px;
          color: #e6e7eb;
          transition: border-color 0.15s;
        }
        :global(.input:focus){ outline: none; border-color: #ff7a18; }
        :global(.input::placeholder){ color: rgba(255,255,255,0.2); }
      `}</style>
    </div>
  );
}
