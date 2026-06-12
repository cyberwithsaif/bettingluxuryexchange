"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, User, Lock, Mail, Phone, Gift, ShieldCheck, Zap, ChevronRight, ArrowRight, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";

const FEATURES = [
  { icon: Gift,        color: "#22d3ee", title: "Welcome Bonus",   sub: "Get bonus on your first deposit" },
  { icon: ShieldCheck, color: "#22c55e", title: "Safe & Secure",   sub: "KYC verified, encrypted transactions" },
  { icon: Zap,         color: "#a855f7", title: "Instant Account", sub: "Start playing within 60 seconds" },
];

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

// Neon faceted diamond illustration (pure SVG — matches the design hero).
function NeonDiamond() {
  return (
    <svg viewBox="0 0 400 380" className="w-full h-full" aria-hidden>
      <defs>
        <linearGradient id="dgFill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.34" />
          <stop offset="55%" stopColor="#3b82f6" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0.36" />
        </linearGradient>
        <linearGradient id="dgEdge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="60%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>
        <filter id="dgGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="7" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="dgSoft" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
      </defs>

      {/* pedestal glow rings */}
      <ellipse cx="200" cy="330" rx="120" ry="20" fill="rgba(34,211,238,0.18)" filter="url(#dgSoft)" />
      <ellipse cx="200" cy="328" rx="78" ry="11" fill="none" stroke="rgba(103,232,249,0.5)" strokeWidth="2" />
      <ellipse cx="200" cy="334" rx="105" ry="14" fill="none" stroke="rgba(96,165,250,0.25)" strokeWidth="1.5" />
      <ellipse cx="200" cy="326" rx="40" ry="6" fill="rgba(165,243,252,0.5)" filter="url(#dgSoft)" />

      {/* light pillar under the gem */}
      <polygon points="178,318 222,318 212,250 188,250" fill="rgba(103,232,249,0.10)" filter="url(#dgSoft)" />

      {/* diamond body */}
      <g filter="url(#dgGlow)">
        {/* crown */}
        <polygon points="118,140 162,86 238,86 282,140" fill="url(#dgFill)" stroke="url(#dgEdge)" strokeWidth="3" strokeLinejoin="round" />
        {/* pavilion */}
        <polygon points="118,140 282,140 200,280" fill="url(#dgFill)" stroke="url(#dgEdge)" strokeWidth="3" strokeLinejoin="round" />
        {/* facets */}
        <path d="M162 86 L182 140 M238 86 L218 140 M200 86 L182 140 M200 86 L218 140 M118 140 L182 140 M282 140 L218 140 M182 140 L200 280 M218 140 L200 280"
          stroke="rgba(165,225,255,0.55)" strokeWidth="1.6" fill="none" />
        <path d="M162 86 L138 140 M238 86 L262 140" stroke="rgba(165,225,255,0.35)" strokeWidth="1.4" fill="none" />
      </g>

      {/* inner shine */}
      <polygon points="170,100 196,94 178,128" fill="rgba(255,255,255,0.35)" />

      {/* sparkles */}
      {[[96, 70, 1.1], [318, 96, 0.9], [330, 220, 1.2], [80, 230, 0.8], [262, 50, 0.7]].map(([x, y, s], i) => (
        <path key={i} transform={`translate(${x},${y}) scale(${s})`} d="M0 -10 L2.4 -2.4 L10 0 L2.4 2.4 L0 10 L-2.4 2.4 L-10 0 L-2.4 -2.4 Z" fill="rgba(190,235,255,0.85)" />
      ))}
      {/* starfield dots */}
      {[[40, 120], [70, 40], [150, 30], [250, 22], [340, 60], [360, 160], [350, 290], [60, 300], [120, 340]].map(([x, y], i) => (
        <circle key={`d${i}`} cx={x} cy={y} r={i % 3 === 0 ? 2 : 1.3} fill="rgba(160,200,255,0.5)" />
      ))}
    </svg>
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
    <div className="min-h-screen flex" style={{ background: "#04060f" }}>

      {/* ── Left branding panel ── */}
      <div className="hidden lg:flex lg:w-[54%] xl:w-[55%] flex-col relative overflow-hidden">
        {/* deep blue layered background */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(118deg,#050c26 0%,#081e5e 48%,#0a2472 78%,#071a4a 100%)" }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 65% 55% at 72% 38%, rgba(56,189,248,0.22) 0%, transparent 65%)" }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 50% 45% at 90% 80%, rgba(168,85,247,0.18) 0%, transparent 60%)" }} />
        {/* grid lines */}
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "linear-gradient(rgba(150,190,255,0.8) 1px,transparent 1px),linear-gradient(90deg,rgba(150,190,255,0.8) 1px,transparent 1px)", backgroundSize: "64px 64px" }} />

        {/* hero diamond */}
        <div className="absolute right-[2%] top-1/2 -translate-y-1/2 w-[380px] h-[380px] xl:w-[430px] xl:h-[430px] pointer-events-none">
          <NeonDiamond />
        </div>

        <div className="relative z-10 flex flex-col h-full px-12 xl:px-16 py-10">
          {/* Logo */}
          <div>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full overflow-hidden border border-white/15 shadow-lg">
                <Image src="/logo.png" alt="Logo" width={44} height={44} className="object-cover w-full h-full" />
              </div>
              <span className="font-black text-2xl tracking-tight">
                <span className="text-white">Diamond</span><span className="text-[#3b82f6]">Play</span>
              </span>
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mt-5" style={{ border: "1px solid rgba(56,189,248,0.45)", background: "rgba(8,30,94,0.55)" }}>
              <Gift size={13} className="text-[#22d3ee]" />
              <span className="text-[12px] font-black uppercase tracking-[0.16em] text-[#22d3ee]">Welcome Bonus on First Deposit</span>
            </div>
          </div>

          {/* Center content */}
          <div className="flex-1 flex flex-col justify-center max-w-xl">
            <h1 className="text-5xl xl:text-6xl font-black text-white leading-[1.1] mb-5">
              Join 10,000+<br />
              <span style={{ backgroundImage: "linear-gradient(90deg,#3b82f6,#a855f7 80%)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", color: "transparent" }}>
                Winners Today
              </span>
            </h1>
            <p className="text-white/65 text-lg leading-relaxed max-w-md mb-10">
              Create your free account in seconds and start playing provably fair casino games and live exchange bets.
            </p>

            {/* Feature cards */}
            <div className="flex flex-col gap-3">
              {FEATURES.map(({ icon: Icon, color, title, sub }) => (
                <div key={title} className="flex items-center gap-4 rounded-2xl px-5 py-4 backdrop-blur-[2px]"
                  style={{ background: "linear-gradient(90deg, rgba(13,30,80,0.55), rgba(10,22,60,0.35))", border: `1px solid ${color}2e` }}>
                  <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: `${color}1a`, border: `1.5px solid ${color}66`, boxShadow: `0 0 16px ${color}33` }}>
                    <Icon size={21} style={{ color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-[17px]">{title}</p>
                    <p className="text-white/50 text-sm mt-0.5">{sub}</p>
                  </div>
                  <ChevronRight size={20} className="shrink-0" style={{ color: `${color}99` }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden" style={{ background: "linear-gradient(180deg,#05070f 0%,#070b1d 100%)" }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 45% at 50% 0%, rgba(37,99,235,0.10) 0%, transparent 70%)" }} />

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
