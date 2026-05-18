"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";

export default function RegisterPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.set);
  const [form, setForm] = useState({ username: "", password: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const { data } = await api.post("/auth/register", form);
      setAuth({ user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken });
      router.push("/");
    } catch (e: any) {
      setError(e?.response?.data?.message || "Registration failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-[70vh] grid place-items-center px-4">
      <div className="glass rounded-2xl p-7 w-full max-w-md">
        <h1 className="font-display text-3xl bg-accent-grad bg-clip-text text-transparent">Create account</h1>
        <p className="text-white/60 text-sm mt-1">Get a welcome bonus on first deposit.</p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <Field label="Username"><input required minLength={3} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="input" /></Field>
          <Field label="Password"><input required minLength={8} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input" /></Field>
          <Field label="Email (optional)"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" /></Field>
          <Field label="Phone (optional)"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" /></Field>
          {error && <div className="text-xs text-bad bg-bad/15 border border-bad/40 rounded px-2 py-1.5">{error}</div>}
          <button disabled={busy} className="w-full rounded-md bg-accent-grad py-2.5 font-bold text-ink shadow-glow hover:brightness-110 disabled:opacity-50">
            {busy ? "Creating…" : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-sm text-white/60 text-center">
          Have an account? <Link href="/auth/login" className="text-accentSoft">Sign in</Link>
        </p>
      </div>
      <style jsx>{`
        :global(.input) { width:100%; background:#170a10; border:1px solid rgba(255,122,24,0.2); border-radius:8px; padding:10px 12px; font-size:14px; }
        :global(.input:focus){ outline:none; border-color:#ff7a18; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs uppercase tracking-wider text-white/60">{label}</span><div className="mt-1">{children}</div></label>;
}
