"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";

export default function AdminLogin() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.set);
  const [form, setForm] = useState({ username: "", password: "", otp: "" });
  const [needOtp, setNeedOtp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const { data } = await api.post("/auth/login", form);
      if (!["SUPER_ADMIN", "ADMIN", "SUPER_MASTER", "MASTER", "AGENT"].includes(data.user.role)) {
        throw new Error("Not authorized for admin panel");
      }
      setAuth({ user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken });
      router.push("/");
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message;
      if (msg === "OTP required") setNeedOtp(true);
      setErr(typeof msg === "string" ? msg : "Login failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 bg-bg">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-line bg-panel p-7 shadow-glow">
        <h1 className="font-display text-3xl bg-accent-grad bg-clip-text text-transparent">Admin Panel</h1>
        <p className="text-white/60 text-sm mt-1">Sign in to continue.</p>
        <div className="mt-5 space-y-3">
          <Field label="Username"><input required className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
          <Field label="Password"><input required type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          {needOtp && <Field label="2FA code"><input className="input" value={form.otp} onChange={(e) => setForm({ ...form, otp: e.target.value })} /></Field>}
          {err && <div className="text-xs text-bad bg-bad/15 border border-bad/40 rounded px-2 py-1.5">{err}</div>}
          <button disabled={busy} className="w-full rounded-md bg-accent-grad py-2.5 font-bold text-ink shadow-glow disabled:opacity-50">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </form>
      <style jsx>{`
        :global(.input){width:100%;background:#0d0e15;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:10px 12px;font-size:14px;color:#e6e7eb}
        :global(.input:focus){outline:none;border-color:#ff7a18}
      `}</style>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs uppercase tracking-wider text-white/60">{label}</span><div className="mt-1">{children}</div></label>;
}
