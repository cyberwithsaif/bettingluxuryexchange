"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, User, Lock, Mail, Phone, Gift, ShieldCheck, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";

function PasswordStrength({ password }: { password: string }) {
  const score = [/.{8,}/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(password)).length;
  if (!password) return null;
  const labels = ["Weak", "Fair", "Good", "Strong"];
  const colors = ["#ef4444", "#f97316", "#eab308", "#22c55e"];
  return (
    <div className="mt-1.5">
      <div className="flex gap-1 mb-1">
        {[0,1,2,3].map(i => (
          <div key={i} className="flex-1 h-1 rounded-full transition-all" style={{ background: i < score ? colors[score - 1] : "rgba(255,255,255,0.08)" }} />
        ))}
      </div>
      {score > 0 && <span className="text-[10px]" style={{ color: colors[score - 1] }}>{labels[score - 1]}</span>}
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.set);
  const [form, setForm] = useState({ username: "", password: "", email: "", phone: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const { data } = await api.post("/auth/register", form);
      setAuth({ user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken });
      router.replace("/");
    } catch (e: any) {
      setError(e?.response?.data?.message || "Registration failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen flex bg-[#05060f]">

      {/* ── Left branding panel ── */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] flex-col relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,#0f0a1a 0%,#1a0510 40%,#0f0a1a 100%)" }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 80% 60% at 70% 30%,rgba(243,196,49,0.1) 0%,transparent 65%)" }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 50% at 20% 80%,rgba(220,47,47,0.15) 0%,transparent 60%)" }} />
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.8) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.8) 1px,transparent 1px)", backgroundSize: "60px 60px" }} />

        <div className="relative z-10 flex flex-col h-full px-12 xl:px-16 py-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden border border-white/10 shadow-lg">
              <Image src="/logo.png" alt="Logo" width={40} height={40} className="object-cover w-full h-full" />
            </div>
            <span className="text-white font-black text-xl tracking-tight">DiamondPlay</span>
          </div>

          <div className="flex-1 flex flex-col justify-center">
            {/* Bonus badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#f3c431]/30 bg-[#f3c431]/10 mb-8 self-start">
              <Gift size={13} className="text-[#f3c431]" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#f3c431]">Welcome Bonus on First Deposit</span>
            </div>

            <h1 className="text-4xl xl:text-5xl font-black text-white leading-tight mb-4">
              Join 10,000+<br />
              <span style={{ WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", background: "linear-gradient(90deg,#f3c431,#e43f3f)" }}>
                Winning Players
              </span>
            </h1>
            <p className="text-white/50 text-base leading-relaxed max-w-sm mb-10">
              Create your free account in seconds and start playing provably fair casino games and live exchange bets.
            </p>

            {/* Why join */}
            <div className="space-y-3">
              {[
                { icon: Gift,        color: "#f3c431", label: "Welcome Bonus",      sub: "Get bonus on your first deposit" },
                { icon: ShieldCheck, color: "#22c55e", label: "Safe & Secure",       sub: "KYC verified, encrypted transactions" },
                { icon: Zap,         color: "#3b82f6", label: "Instant Account",     sub: "Start playing within 60 seconds" },
              ].map(({ icon: Icon, color, label, sub }) => (
                <div key={label} className="flex items-center gap-4 rounded-2xl px-5 py-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}18`, border: `1px solid ${color}40` }}>
                    <Icon size={18} style={{ color }} />
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm">{label}</p>
                    <p className="text-white/40 text-xs mt-0.5">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-8 pt-8 border-t border-white/5">
            {[["Free","Account"],["2 Min","Setup"],["24/7","Support"]].map(([val, lbl]) => (
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
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 50% at 50% 0%,rgba(243,196,49,0.04) 0%,transparent 70%)" }} />

        <div className="w-full max-w-[400px] relative z-10">
          {/* Mobile logo */}
          <div className="flex items-center justify-center gap-2.5 mb-8 lg:hidden">
            <div className="w-9 h-9 rounded-xl overflow-hidden border border-white/10">
              <Image src="/logo.png" alt="Logo" width={36} height={36} className="object-cover w-full h-full" />
            </div>
            <span className="text-white font-black text-lg">DiamondPlay</span>
          </div>

          <div className="rounded-2xl p-7 sm:p-8" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}>
            <div className="mb-6">
              <h2 className="text-2xl font-black text-white">Create account</h2>
              <p className="text-white/40 text-sm mt-1">Free forever · No hidden fees</p>
            </div>

            <form onSubmit={submit} className="space-y-3.5">
              {/* Username */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-1.5">Username <span className="text-[#dc2f2f]">*</span></label>
                <div className="relative">
                  <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                  <input required minLength={3} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })}
                    placeholder="Choose a username" className="auth-input pl-9" />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-1.5">Password <span className="text-[#dc2f2f]">*</span></label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                  <input required minLength={8} type={showPassword ? "text" : "password"} value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder="Min. 8 characters" className="auth-input pl-9 pr-11" />
                  <button type="button" tabIndex={-1} onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <PasswordStrength password={form.password} />
              </div>

              {/* Email */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-1.5">Email <span className="text-white/20 font-normal normal-case">(optional)</span></label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                  <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                    placeholder="your@email.com" className="auth-input pl-9" />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-1.5">Phone <span className="text-white/20 font-normal normal-case">(optional)</span></label>
                <div className="relative">
                  <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                  <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                    placeholder="+91 9876543210" className="auth-input pl-9" inputMode="tel" />
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
                className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-50 active:scale-[0.98] mt-1"
                style={{ background: "linear-gradient(135deg,#c8961e 0%,#dc2f2f 100%)", boxShadow: busy ? "none" : "0 0 24px rgba(220,47,47,0.3), inset 0 1px 0 rgba(255,255,255,0.1)" }}
              >
                {busy ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin" width={16} height={16} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3"/><path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="3" strokeLinecap="round"/></svg>
                    Creating account…
                  </span>
                ) : "Create Account →"}
              </button>
            </form>

            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-white/8" />
              <span className="text-white/20 text-xs">or</span>
              <div className="flex-1 h-px bg-white/8" />
            </div>

            <p className="text-center text-sm text-white/40">
              Already have an account?{" "}
              <Link href="/auth/login" className="text-[#f3c431] font-bold hover:text-yellow-300 transition">
                Sign in
              </Link>
            </p>
          </div>

          <p className="text-center text-[11px] text-white/20 mt-6 px-4">
            By creating an account you agree to our{" "}
            <Link href="/legal/terms" className="underline hover:text-white/40 transition">Terms of Service</Link>
            {" & "}
            <Link href="/legal/privacy" className="underline hover:text-white/40 transition">Privacy Policy</Link>.
            Must be 18+.
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
          border-color: rgba(243,196,49,0.5);
          box-shadow: 0 0 0 3px rgba(243,196,49,0.08);
        }
      `}</style>
    </div>
  );
}
