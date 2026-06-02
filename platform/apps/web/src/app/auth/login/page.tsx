"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, User, Lock, ShieldCheck, Zap, Trophy } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.set);
  const [form, setForm] = useState({ username: "", password: "", otp: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [needOtp, setNeedOtp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const { data } = await api.post("/auth/login", form);
      setAuth({ user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken });
      router.replace("/");
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      if (msg === "OTP required") setNeedOtp(true);
      setError(typeof msg === "string" ? msg : "Login failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen flex bg-[#05060f]">

      {/* ── Left branding panel (hidden on mobile) ── */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] flex-col relative overflow-hidden">
        {/* layered background */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,#0f0a1a 0%,#1a0510 40%,#0f0a1a 100%)" }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 80% 60% at 30% 40%,rgba(220,47,47,0.18) 0%,transparent 65%)" }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 50% at 75% 80%,rgba(243,196,49,0.07) 0%,transparent 60%)" }} />
        {/* grid lines */}
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.8) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.8) 1px,transparent 1px)", backgroundSize: "60px 60px" }} />

        <div className="relative z-10 flex flex-col h-full px-12 xl:px-16 py-10">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden border border-white/10 shadow-lg">
              <Image src="/logo.png" alt="Logo" width={40} height={40} className="object-cover w-full h-full" />
            </div>
            <span className="text-white font-black text-xl tracking-tight">DiamondPlay</span>
          </div>

          {/* Center content */}
          <div className="flex-1 flex flex-col justify-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#dc2f2f]/30 bg-[#dc2f2f]/10 mb-8 self-start">
              <span className="w-1.5 h-1.5 rounded-full bg-[#dc2f2f] animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#dc2f2f]">Live Games Available</span>
            </div>

            <h1 className="text-4xl xl:text-5xl font-black text-white leading-tight mb-4">
              India&apos;s Premier<br />
              <span style={{ WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", background: "linear-gradient(90deg,#e43f3f,#f3c431)" }}>
                Betting Exchange
              </span>
            </h1>
            <p className="text-white/50 text-base leading-relaxed max-w-sm mb-10">
              Live cricket, sports exchange, casino games and provably fair originals — all on one platform.
            </p>

            {/* Feature pills */}
            <div className="flex flex-col gap-3">
              {[
                { icon: ShieldCheck, label: "Provably Fair Games",  sub: "Every outcome verifiable on-chain" },
                { icon: Zap,         label: "Instant Withdrawals",  sub: "UPI payouts in under 5 minutes" },
                { icon: Trophy,      label: "Live Sports Exchange", sub: "Back & Lay on cricket, football & more" },
              ].map(({ icon: Icon, label, sub }) => (
                <div key={label} className="flex items-center gap-4 rounded-2xl px-5 py-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(220,47,47,0.18)", border: "1px solid rgba(220,47,47,0.3)" }}>
                    <Icon size={18} className="text-[#e85555]" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm">{label}</p>
                    <p className="text-white/40 text-xs mt-0.5">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer stat strip */}
          <div className="flex items-center gap-8 pt-8 border-t border-white/5">
            {[["10K+","Active Players"],["₹50Cr+","Paid Out"],["99.9%","Uptime"]].map(([val, lbl]) => (
              <div key={lbl}>
                <p className="text-white font-black text-lg">{val}</p>
                <p className="text-white/35 text-[11px] mt-0.5">{lbl}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-10 relative overflow-hidden" style={{ background: "#07080f" }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 50% at 50% 0%,rgba(220,47,47,0.06) 0%,transparent 70%)" }} />

        <div className="w-full max-w-[400px] relative z-10">
          {/* Mobile-only logo */}
          <div className="flex items-center justify-center gap-2.5 mb-8 lg:hidden">
            <div className="w-9 h-9 rounded-xl overflow-hidden border border-white/10">
              <Image src="/logo.png" alt="Logo" width={36} height={36} className="object-cover w-full h-full" />
            </div>
            <span className="text-white font-black text-lg">DiamondPlay</span>
          </div>

          {/* Card */}
          <div className="rounded-2xl p-7 sm:p-8" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}>
            <div className="mb-7">
              <h2 className="text-2xl font-black text-white">Welcome back</h2>
              <p className="text-white/40 text-sm mt-1">Sign in to your account to continue</p>
            </div>

            <form onSubmit={submit} className="space-y-4">
              {/* Username */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-1.5">Username</label>
                <div className="relative">
                  <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                  <input
                    required
                    value={form.username}
                    onChange={e => setForm({ ...form, username: e.target.value })}
                    placeholder="Enter your username"
                    className="auth-input pl-9"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-1.5">Password</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                  <input
                    required
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder="Enter your password"
                    className="auth-input pl-9 pr-11"
                  />
                  <button type="button" tabIndex={-1} onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* OTP (2FA) */}
              {needOtp && (
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-1.5">2FA Code</label>
                  <input
                    value={form.otp}
                    onChange={e => setForm({ ...form, otp: e.target.value })}
                    inputMode="numeric"
                    placeholder="123 456"
                    className="auth-input text-center tracking-[0.3em] font-mono"
                  />
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(220,47,47,0.12)", border: "1px solid rgba(220,47,47,0.3)" }}>
                  <span className="text-[#e85555] shrink-0 mt-0.5">⚠</span>
                  <span className="text-[#f5a0a0]">{error}</span>
                </div>
              )}

              {/* Submit */}
              <button
                disabled={busy}
                className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-50 active:scale-[0.98] mt-1"
                style={{ background: "linear-gradient(135deg,#e43f3f 0%,#b91c1c 100%)", boxShadow: busy ? "none" : "0 0 24px rgba(220,47,47,0.35), inset 0 1px 0 rgba(255,255,255,0.1)" }}
              >
                {busy ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin" width={16} height={16} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3"/><path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="3" strokeLinecap="round"/></svg>
                    Signing in…
                  </span>
                ) : "Sign In"}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-white/8" />
              <span className="text-white/20 text-xs">or</span>
              <div className="flex-1 h-px bg-white/8" />
            </div>

            <p className="text-center text-sm text-white/40">
              New to DiamondPlay?{" "}
              <Link href="/auth/register" className="text-[#f3c431] font-bold hover:text-yellow-300 transition">
                Create an account
              </Link>
            </p>
          </div>

          <p className="text-center text-[11px] text-white/20 mt-6">
            By signing in you agree to our{" "}
            <Link href="/legal/terms" className="underline hover:text-white/40 transition">Terms</Link>
            {" & "}
            <Link href="/legal/privacy" className="underline hover:text-white/40 transition">Privacy Policy</Link>
          </p>
        </div>
      </div>

      <style>{`
        .auth-input {
          width: 100%;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          padding: 11px 14px;
          font-size: 14px;
          color: #f4e7e7;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .auth-input::placeholder { color: rgba(255,255,255,0.2); }
        .auth-input:focus {
          border-color: rgba(220,47,47,0.6);
          box-shadow: 0 0 0 3px rgba(220,47,47,0.1);
        }
      `}</style>
    </div>
  );
}
