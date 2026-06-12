"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, User, Lock, ArrowRight, Gem } from "lucide-react";
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
    <div className="min-h-screen flex" style={{ background: "#04060f url('/images/auth-bg.webp') center / cover no-repeat fixed" }}>

      {/* ── Left branding panel (hidden on mobile) ── */}
      <div className="hidden lg:flex lg:w-[52%] items-center justify-center relative overflow-hidden px-3 py-4">
        <img
          src="/images/auth-side.webp"
          alt="DiamondPlay — join 10,000+ winners"
          className="w-full max-h-[96vh] object-contain drop-shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
          draggable={false}
        />
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-12 relative overflow-hidden">

        <div className="w-full max-w-[460px] relative z-10">
          {/* Mobile-only logo */}
          <div className="flex items-center justify-center gap-2.5 mb-10 lg:hidden">
            <div className="w-9 h-9 rounded-full overflow-hidden border border-white/15">
              <Image src="/logo.png" alt="Logo" width={36} height={36} className="object-cover w-full h-full" />
            </div>
            <span className="text-white font-black text-lg">DiamondPlay</span>
          </div>

          {/* Card with gradient border + diamond crest */}
          <div className="relative pt-12">
            {/* Diamond icon */}
            <div className="absolute left-1/2 -translate-x-1/2 top-0 z-10">
              <div className="w-[88px] h-[88px] rounded-full flex items-center justify-center relative"
                style={{ background: "radial-gradient(circle at 50% 38%, #0e2a66 0%, #081636 70%)", border: "2px solid rgba(56,189,248,0.6)", boxShadow: "0 0 34px rgba(56,189,248,0.35), inset 0 0 22px rgba(56,189,248,0.18)" }}>
                <Gem size={34} className="text-[#38bdf8]" style={{ filter: "drop-shadow(0 0 8px rgba(56,189,248,0.8))" }} />
                <span className="absolute top-3 right-5 text-[10px] text-cyan-200/90">✦</span>
                <span className="absolute bottom-4 left-4 text-[8px] text-cyan-200/70">✦</span>
              </div>
            </div>

            <div className="rounded-3xl px-7 sm:px-9 pt-16 pb-8"
              style={{
                background: "linear-gradient(rgba(8,12,32,0.96), rgba(8,12,32,0.96)) padding-box, linear-gradient(135deg, #2563eb 0%, #38bdf8 35%, #a855f7 100%) border-box",
                border: "1px solid transparent",
                boxShadow: "0 30px 70px rgba(0,0,0,0.55), 0 0 40px rgba(59,130,246,0.10)",
              }}>
              <div className="mb-8 text-center">
                <h2 className="text-[32px] font-black text-white leading-tight">
                  Welcome <span className="text-[#3b82f6]">back</span>
                </h2>
                <p className="text-white/50 text-[15px] mt-1.5">Sign in to your account to continue</p>
              </div>

              <form onSubmit={submit} className="space-y-5">
                {/* Username */}
                <div>
                  <label className="block text-[12px] font-black uppercase tracking-[0.14em] text-white/55 mb-2">Username</label>
                  <div className="relative">
                    <User size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                    <input
                      required
                      value={form.username}
                      onChange={e => setForm({ ...form, username: e.target.value })}
                      placeholder="Enter your username"
                      className="auth-input with-icon"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-[12px] font-black uppercase tracking-[0.14em] text-white/55 mb-2">Password</label>
                  <div className="relative">
                    <Lock size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                    <input
                      required
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      placeholder="••••••••"
                      className="auth-input with-icon with-trail"
                    />
                    <button type="button" tabIndex={-1} onClick={() => setShowPassword(v => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/75 transition">
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* OTP (2FA) */}
                {needOtp && (
                  <div>
                    <label className="block text-[12px] font-black uppercase tracking-[0.14em] text-white/55 mb-2">2FA Code</label>
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
                  className="relative w-full py-3.5 rounded-2xl font-black text-base text-white transition-all disabled:opacity-50 active:scale-[0.98] mt-1"
                  style={{ background: "linear-gradient(90deg,#2563eb 0%,#7c3aed 70%,#a855f7 100%)", boxShadow: busy ? "none" : "0 8px 28px rgba(99,72,237,0.45), inset 0 1px 0 rgba(255,255,255,0.18)" }}
                >
                  {busy ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin" width={17} height={17} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3"/><path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="3" strokeLinecap="round"/></svg>
                      Signing in…
                    </span>
                  ) : (
                    <>
                      Sign In
                      <ArrowRight size={19} className="absolute right-5 top-1/2 -translate-y-1/2 text-white/85" />
                    </>
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="flex items-center gap-4 my-6">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-white/30 text-sm">or</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              <p className="text-center text-[15px] text-white/55">
                New to DiamondPlay?{" "}
                <Link href="/auth/register" className="text-[#f3c431] font-black hover:text-yellow-300 transition">
                  Create an account
                </Link>
              </p>
            </div>
          </div>

          <p className="text-center text-[13px] text-white/35 mt-7">
            By signing in you agree to our{" "}
            <Link href="/legal/terms" className="text-[#5ba2f5] hover:text-[#8cc0ff] transition">Terms</Link>
            {" & "}
            <Link href="/legal/privacy" className="text-[#5ba2f5] hover:text-[#8cc0ff] transition">Privacy Policy</Link>
          </p>
        </div>
      </div>

      <style>{`
        .auth-input {
          width: 100%;
          background: rgba(10,16,40,0.85);
          border: 1px solid rgba(110,140,220,0.22);
          border-radius: 14px;
          padding: 13px 16px;
          font-size: 15px;
          color: #e8edff;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .auth-input.with-icon { padding-left: 46px; }
        .auth-input.with-trail { padding-right: 48px; }
        .auth-input::placeholder { color: rgba(190,205,255,0.25); }
        .auth-input:focus {
          border-color: rgba(59,130,246,0.65);
          box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
        }
      `}</style>
    </div>
  );
}
