"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
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
      router.push("/");
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      if (msg === "OTP required") setNeedOtp(true);
      setError(typeof msg === "string" ? msg : "Login failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-[70vh] grid place-items-center px-4">
      <div className="glass rounded-2xl p-7 w-full max-w-md">
        <h1 className="font-display text-3xl bg-accent-grad bg-clip-text text-transparent">Welcome back</h1>
        <p className="text-white/60 text-sm mt-1">Login to continue.</p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <Field label="Username">
            <input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="input" placeholder="Enter username" />
          </Field>
          <Field label="Password">
            <div className="relative">
              <input
                required
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="input pr-10"
                placeholder="Enter password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>
          {needOtp && (
            <Field label="2FA code">
              <input value={form.otp} onChange={(e) => setForm({ ...form, otp: e.target.value })} className="input" inputMode="numeric" placeholder="123 456" />
            </Field>
          )}
          {error && <div className="text-xs text-bad bg-bad/15 border border-bad/40 rounded px-2 py-1.5">⚠ {error}</div>}
          <button disabled={busy} className="w-full rounded-md bg-accent-grad py-2.5 font-bold text-ink shadow-glow hover:brightness-110 disabled:opacity-50">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-sm text-white/60 text-center">
          New here? <Link href="/auth/register" className="text-accentSoft">Create an account</Link>
        </p>
      </div>
      <style jsx>{`
        :global(.input) {
          width: 100%;
          background: #170a10;
          border: 1px solid rgba(255,122,24,0.2);
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 14px;
          color: #f4e7e7;
        }
        :global(.input:focus) { outline: none; border-color: #ff7a18; }
        :global(.input::placeholder) { color: rgba(255,255,255,0.25); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-white/60">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

