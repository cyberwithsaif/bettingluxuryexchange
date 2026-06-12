"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, User, Lock, Mail, Phone, Gift, ArrowRight, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";

function PasswordStrength({ password }: { password: string }) {
  const score = [/.{8,}/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(password)).length;
  if (!password) return null;
  const labels = ["Weak", "Fair", "Good", "Strong"];
  const colors = ["#ef4444", "#f59e0b", "#38bdf8", "#22c55e"];
  return (
    <div className="mt-2">
      <div className="flex gap-1.5 mb-1">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="flex-1 h-1.5 rounded-full transition-all" style={{ background: i < score ? colors[score - 1] : "rgba(140,170,255,0.12)" }} />
        ))}
      </div>
      {score > 0 && <span className="text-[11px] font-bold" style={{ color: colors[score - 1] }}>{labels[score - 1]}</span>}
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.set);
  const [form, setForm] = useState({ username: "", password: "", email: "", phone: "", referralCode: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill the referral code from ?ref= or one captured earlier on landing.
  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("ref");
      const code = fromUrl || localStorage.getItem("refCode");
      if (code) setForm(f => f.referralCode ? f : { ...f, referralCode: code.slice(0, 40) });
    } catch { /* ignore */ }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const payload = { ...form, referralCode: form.referralCode.trim() || undefined };
      const { data } = await api.post("/auth/register", payload);
      // One signup per captured code — don't attribute future accounts on
      // this browser to the same referrer.
      try { localStorage.removeItem("refCode"); } catch { /* ignore */ }
      setAuth({ user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken });
      router.replace("/");
    } catch (e: any) {
      setError(e?.response?.data?.message || "Registration failed");
    } finally { setBusy(false); }
  }

  const usernameOk = form.username.trim().length >= 3;

  return (
    <div className="min-h-screen flex" style={{ background: "#04060f url('/images/auth-bg.webp') center / cover no-repeat fixed" }}>

      {/* ── Left branding panel ── */}
      <div className="hidden lg:flex lg:w-[52%] items-center justify-center relative overflow-hidden px-3 py-4">
        <img
          src="/images/auth-side.webp"
          alt="DiamondPlay — join 10,000+ winners"
          className="w-full max-h-[96vh] object-contain drop-shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
          draggable={false}
        />
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden">

        <div className="w-full max-w-[480px] relative z-10">
          {/* Mobile-only logo */}
          <div className="flex items-center justify-center gap-2.5 mb-6 lg:hidden">
            <div className="w-9 h-9 rounded-full overflow-hidden border border-white/15">
              <Image src="/logo.png" alt="Logo" width={36} height={36} className="object-cover w-full h-full" />
            </div>
            <span className="font-black text-lg"><span className="text-white">Diamond</span><span className="text-[#3b82f6]">Play</span></span>
          </div>

          {/* Card with gradient border */}
          <div className="rounded-3xl px-6 sm:px-8 py-7"
            style={{
              background: "linear-gradient(rgba(8,12,32,0.96), rgba(8,12,32,0.96)) padding-box, linear-gradient(135deg, #2563eb 0%, #38bdf8 35%, #a855f7 100%) border-box",
              border: "1px solid transparent",
              boxShadow: "0 30px 70px rgba(0,0,0,0.55), 0 0 40px rgba(59,130,246,0.10)",
            }}>

            {/* Header: crest + title */}
            <div className="flex items-center gap-4 mb-6">
              <div className="w-[60px] h-[60px] rounded-full overflow-hidden shrink-0 flex items-center justify-center"
                style={{ background: "radial-gradient(circle at 50% 38%, #0e2a66 0%, #081636 70%)", border: "2px solid rgba(56,189,248,0.6)", boxShadow: "0 0 24px rgba(56,189,248,0.3)" }}>
                <Image src="/logo.png" alt="" width={56} height={56} className="object-cover w-full h-full" />
              </div>
              <div>
                <h2 className="text-[27px] font-black text-white leading-tight">
                  Create{" "}
                  <span style={{ backgroundImage: "linear-gradient(90deg,#3b82f6,#a855f7)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", color: "transparent" }}>account</span>
                </h2>
                <p className="text-white/50 text-sm mt-0.5">Free forever · No hidden fees</p>
              </div>
            </div>

            <form onSubmit={submit} className="space-y-4">
              {/* Username */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-[0.14em] text-white/55 mb-1.5">Username <span className="text-[#f43f5e]">*</span></label>
                <div className="relative">
                  <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                  <input required minLength={3} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })}
                    placeholder="Choose a username" className="auth-input with-icon with-trail" />
                  {usernameOk && <CheckCircle2 size={17} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#22c55e]" />}
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-[0.14em] text-white/55 mb-1.5">Password <span className="text-[#f43f5e]">*</span></label>
                <div className="relative">
                  <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                  <input required minLength={8} type={showPassword ? "text" : "password"} value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder="Min. 8 characters" className="auth-input with-icon with-trail" />
                  <button type="button" tabIndex={-1} onClick={() => setShowPassword(v => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/75 transition">
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                <PasswordStrength password={form.password} />
              </div>

              {/* Email */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-[0.14em] text-white/55 mb-1.5">Email <span className="text-white/30 font-semibold normal-case tracking-normal">(optional)</span></label>
                <div className="relative">
                  <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                  <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                    placeholder="your@email.com" className="auth-input with-icon" />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-[0.14em] text-white/55 mb-1.5">Phone <span className="text-white/30 font-semibold normal-case tracking-normal">(optional)</span></label>
                <div className="relative">
                  <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                  <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                    placeholder="+91 9876543210" className="auth-input with-icon" inputMode="tel" />
                </div>
              </div>

              {/* Referral code */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-[0.14em] text-white/55 mb-1.5">Referral Code <span className="text-white/30 font-semibold normal-case tracking-normal">(optional)</span></label>
                <div className="relative">
                  <Gift size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                  <input value={form.referralCode} onChange={e => setForm({ ...form, referralCode: e.target.value.slice(0, 40) })}
                    placeholder="Friend's code" className="auth-input with-icon" />
                </div>
              </div>

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
                    Creating account…
                  </span>
                ) : (
                  <span className="inline-flex items-center justify-center gap-2">
                    Create Account <ArrowRight size={18} className="text-white/85" />
                  </span>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-4 my-5">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-white/30 text-sm">or</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            <p className="text-center text-[15px] text-white/55">
              Already have an account?{" "}
              <Link href="/auth/login" className="text-[#38bdf8] font-black hover:text-cyan-300 transition">
                Sign in
              </Link>
            </p>
          </div>

          <p className="text-center text-[12px] text-white/35 mt-5 px-4">
            By creating an account you agree to our{" "}
            <Link href="/legal/terms" className="text-[#5ba2f5] hover:text-[#8cc0ff] transition">Terms of Service</Link>
            {" & "}
            <Link href="/legal/privacy" className="text-[#5ba2f5] hover:text-[#8cc0ff] transition">Privacy Policy</Link>.
            Must be 18+.
          </p>
        </div>
      </div>

      <style>{`
        .auth-input {
          width: 100%;
          background: rgba(10,16,40,0.85);
          border: 1px solid rgba(110,140,220,0.22);
          border-radius: 14px;
          padding: 12px 16px;
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
