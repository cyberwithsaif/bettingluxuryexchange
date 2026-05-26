"use client";
import { useState } from "react";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";
import {
  Shield, ShieldCheck, ShieldAlert, KeyRound, Lock, Smartphone, Monitor,
  LogOut, QrCode, Copy, CheckCircle2, AlertTriangle, Eye, EyeOff, Globe,
  Clock, Mail, Sparkles, Info,
} from "lucide-react";

const PANEL = "linear-gradient(135deg, #12183a, #0d1224)";

interface Overview {
  username: string; email: string | null; phone: string | null;
  twoFactorEnabled: boolean; lastLoginAt: string | null; lastLoginIp: string | null;
  createdAt: string; activeSessions: number;
}
interface Session {
  id: string; ip: string | null; userAgent: string | null;
  createdAt: string; expiresAt: string;
}

function deviceLabel(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg/.test(ua) ? "Edge" : /Chrome/.test(ua) ? "Chrome" : /Firefox/.test(ua) ? "Firefox" : /Safari/.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return `${browser}${os ? " · " + os : ""}`;
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function secretFromOtpauth(url: string) {
  try { return new URL(url).searchParams.get("secret") ?? ""; } catch { return ""; }
}

export default function SecurityPage() {
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.set);
  const { data: ov } = useSWR<Overview>(user ? "/auth/security/overview" : null);
  const { data: sessions } = useSWR<Session[]>(user ? "/auth/sessions" : null);

  if (!user) {
    return (
      <div className="max-w-md mx-auto mt-10 rounded-2xl p-6 text-center" style={{ background: PANEL, border: "1px solid rgba(255,255,255,0.08)" }}>
        <ShieldAlert size={32} className="mx-auto text-accentSoft mb-2" />
        <p className="text-white/70">Please sign in to manage security settings.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto pb-10">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl p-5 md:p-6 mb-5"
        style={{ background: "linear-gradient(135deg, #1a0f2e 0%, #12183a 50%, #0a1a2e 100%)", border: "1px solid rgba(56,189,248,0.18)" }}>
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-25 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #38bdf8, transparent)" }} />
        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-glow"
            style={{ background: "linear-gradient(135deg, #38bdf8, #6366f1)" }}>
            <Shield size={28} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-3xl md:text-4xl leading-none">Security &amp; 2FA</h1>
            <p className="text-sm text-white/55 mt-1">Protect your account — two-factor auth, password &amp; active sessions.</p>
          </div>
        </div>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Two-Factor"
          value={ov?.twoFactorEnabled ? "Enabled" : "Disabled"}
          tone={ov?.twoFactorEnabled ? "#22c55e" : "#f59e0b"}
          Icon={ov?.twoFactorEnabled ? ShieldCheck : ShieldAlert} />
        <StatCard label="Email" value={ov?.email ? "Verified" : "Not set"} tone={ov?.email ? "#38bdf8" : "#94a3b8"} Icon={Mail} sub={ov?.email ?? undefined} />
        <StatCard label="Active Sessions" value={String(ov?.activeSessions ?? sessions?.length ?? "—")} tone="#a78bfa" Icon={Monitor} />
        <StatCard label="Last Login" value={ov?.lastLoginAt ? fmtDate(ov.lastLoginAt).split(",")[0]! : "—"} tone="#f3c431" Icon={Clock} sub={ov?.lastLoginIp ?? undefined} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <TwoFactorPanel enabled={!!ov?.twoFactorEnabled} />
        <PasswordPanel onChanged={(tokens) => setAuth(tokens)} />
      </div>

      <div className="mt-5">
        <SessionsPanel
          sessions={sessions ?? []}
          loading={!sessions}
          onRevokeAll={(tokens) => setAuth(tokens)}
        />
      </div>
    </div>
  );
}

/* ─── Two-Factor ─────────────────────────────────────────── */
function TwoFactorPanel({ enabled }: { enabled: boolean }) {
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [disableMode, setDisableMode] = useState(false);
  const [copied, setCopied] = useState(false);

  async function start() {
    setBusy(true); setMsg(null);
    try {
      const { data } = await api.post("/auth/2fa/start");
      setQr(data.qr); setSecret(secretFromOtpauth(data.otpauth));
    } catch { setMsg({ text: "Could not start 2FA setup.", ok: false }); }
    finally { setBusy(false); }
  }
  async function enable() {
    if (otp.trim().length < 6) { setMsg({ text: "Enter the 6-digit code.", ok: false }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.post("/auth/2fa/enable", { otp: otp.trim() });
      setMsg({ text: "2FA enabled — you'll need it on your next login.", ok: true });
      setQr(null); setOtp(""); setSecret("");
      mutate("/auth/security/overview");
    } catch (e: any) { setMsg({ text: e?.response?.data?.message || "Invalid code.", ok: false }); }
    finally { setBusy(false); }
  }
  async function disable() {
    if (otp.trim().length < 6) { setMsg({ text: "Enter your current 6-digit code to disable.", ok: false }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.post("/auth/2fa/disable", { otp: otp.trim() });
      setMsg({ text: "2FA disabled.", ok: true });
      setDisableMode(false); setOtp("");
      mutate("/auth/security/overview");
    } catch (e: any) { setMsg({ text: e?.response?.data?.message || "Invalid code.", ok: false }); }
    finally { setBusy(false); }
  }
  function copySecret() {
    navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Panel>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-white flex items-center gap-2">
          <KeyRound size={18} className="text-accentSoft" /> Two-Factor Authentication
        </h2>
        {enabled
          ? <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg bg-green-500/15 text-green-400 border border-green-500/30 flex items-center gap-1"><ShieldCheck size={11} /> On</span>
          : <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30">Off</span>}
      </div>

      {/* ENABLED state */}
      {enabled ? (
        <div className="space-y-3">
          <p className="text-sm text-white/60">Your account is protected with an authenticator app. A 6-digit code is required at login.</p>
          {!disableMode ? (
            <button onClick={() => { setDisableMode(true); setMsg(null); }}
              className="rounded-xl border border-red-500/40 text-red-400 hover:bg-red-500/10 px-4 py-2.5 text-sm font-semibold transition">
              Disable 2FA
            </button>
          ) : (
            <div className="space-y-2 rounded-xl border border-red-500/20 bg-red-500/[0.04] p-3">
              <p className="text-xs text-white/60">Enter your current authenticator code to confirm disabling 2FA.</p>
              <OtpInput value={otp} onChange={setOtp} />
              <div className="flex gap-2">
                <button onClick={disable} disabled={busy}
                  className="flex-1 rounded-xl bg-red-600 hover:bg-red-500 text-white py-2.5 text-sm font-bold disabled:opacity-40 transition">
                  {busy ? "Disabling…" : "Confirm Disable"}
                </button>
                <button onClick={() => { setDisableMode(false); setOtp(""); }} className="px-4 rounded-xl border border-white/15 text-white/60 hover:text-white text-sm transition">Cancel</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* DISABLED state — setup flow */
        <div className="space-y-3">
          <p className="text-sm text-white/60">Add Google Authenticator (or any TOTP app) for an extra layer of login protection.</p>
          {!qr ? (
            <button onClick={start} disabled={busy}
              className="rounded-xl bg-accent-grad px-4 py-2.5 text-sm font-bold text-white shadow-glow hover:brightness-110 disabled:opacity-40 transition flex items-center gap-2">
              <QrCode size={16} /> {busy ? "Generating…" : "Set Up 2FA"}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-center">
                <div className="bg-white p-3 rounded-2xl inline-block shadow-glow">
                  <img src={qr} alt="2FA QR Code" className="w-40 h-40 object-contain" />
                </div>
              </div>
              {secret && (
                <div className="rounded-xl bg-white/[0.03] border border-white/10 px-3 py-2.5">
                  <p className="text-[11px] text-white/45 mb-1">Or enter this key manually</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-white break-all">{secret}</span>
                    <button onClick={copySecret} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-accentSoft shrink-0">
                      {copied ? <CheckCircle2 size={14} className="text-green-400" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              )}
              <div>
                <label className="text-[11px] uppercase tracking-wider text-white/55 block mb-1.5">Enter 6-digit code</label>
                <OtpInput value={otp} onChange={setOtp} />
              </div>
              <button onClick={enable} disabled={busy}
                className="w-full rounded-xl bg-accent-grad py-2.5 text-sm font-bold text-white shadow-glow hover:brightness-110 disabled:opacity-40 transition">
                {busy ? "Verifying…" : "Verify & Enable"}
              </button>
            </div>
          )}
        </div>
      )}

      {msg && (
        <p className={`mt-3 text-sm flex items-center gap-2 rounded-lg px-3 py-2 ${msg.ok ? "text-green-400 bg-green-500/10 border border-green-500/20" : "text-red-400 bg-red-500/10 border border-red-500/20"}`}>
          {msg.ok ? <CheckCircle2 size={15} /> : <Info size={15} />} {msg.text}
        </p>
      )}
    </Panel>
  );
}

/* ─── Change Password ────────────────────────────────────── */
function PasswordPanel({ onChanged }: { onChanged: (t: { accessToken: string; refreshToken: string; user: any }) => void }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit = cur && next.length >= 8 && next === confirm;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true); setMsg(null);
    try {
      const { data } = await api.post("/auth/change-password", { currentPassword: cur, newPassword: next });
      if (data?.accessToken) onChanged({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
      setMsg({ text: "Password updated. Other devices have been signed out.", ok: true });
      setCur(""); setNext(""); setConfirm("");
      mutate("/auth/sessions");
    } catch (e: any) { setMsg({ text: e?.response?.data?.message || "Could not update password.", ok: false }); }
    finally { setBusy(false); }
  }

  return (
    <Panel>
      <h2 className="font-semibold text-white flex items-center gap-2 mb-4">
        <Lock size={18} className="text-accentSoft" /> Change Password
      </h2>
      <div className="space-y-3">
        <Field label="Current Password" type={show ? "text" : "password"} value={cur} onChange={setCur} placeholder="••••••••" />
        <div className="relative">
          <Field label="New Password" type={show ? "text" : "password"} value={next} onChange={setNext} placeholder="At least 8 characters" />
          <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-[34px] text-white/40 hover:text-white">
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <Field label="Confirm New Password" type={show ? "text" : "password"} value={confirm} onChange={setConfirm} placeholder="Re-enter new password" />
        {tooShort && <p className="text-xs text-amber-400 flex items-center gap-1.5"><Info size={12} /> Password must be at least 8 characters.</p>}
        {mismatch && <p className="text-xs text-red-400 flex items-center gap-1.5"><Info size={12} /> Passwords don't match.</p>}
        <button onClick={submit} disabled={busy || !canSubmit}
          className="w-full rounded-xl bg-accent-grad py-2.5 text-sm font-bold text-white shadow-glow hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition">
          {busy ? "Updating…" : "Update Password"}
        </button>
        {msg && (
          <p className={`text-sm flex items-center gap-2 rounded-lg px-3 py-2 ${msg.ok ? "text-green-400 bg-green-500/10 border border-green-500/20" : "text-red-400 bg-red-500/10 border border-red-500/20"}`}>
            {msg.ok ? <CheckCircle2 size={15} /> : <Info size={15} />} {msg.text}
          </p>
        )}
      </div>
    </Panel>
  );
}

/* ─── Active Sessions ────────────────────────────────────── */
function SessionsPanel({ sessions, loading, onRevokeAll }: {
  sessions: Session[]; loading: boolean;
  onRevokeAll: (t: { accessToken: string; refreshToken: string; user: any }) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function revoke(id: string) {
    setBusy(id); setMsg(null);
    try { await api.delete(`/auth/sessions/${id}`); mutate("/auth/sessions"); mutate("/auth/security/overview"); }
    catch { setMsg({ text: "Could not revoke session.", ok: false }); }
    finally { setBusy(null); }
  }
  async function revokeAll() {
    if (!confirm("Sign out of all devices? You'll stay signed in here.")) return;
    setBusy("all"); setMsg(null);
    try {
      const { data } = await api.post("/auth/sessions/revoke-all");
      if (data?.accessToken) onRevokeAll({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
      setMsg({ text: `Signed out ${data.revoked ?? 0} session(s). This device stays active.`, ok: true });
      mutate("/auth/sessions"); mutate("/auth/security/overview");
    } catch { setMsg({ text: "Could not sign out other devices.", ok: false }); }
    finally { setBusy(null); }
  }

  return (
    <Panel>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-white flex items-center gap-2">
          <Monitor size={18} className="text-accentSoft" /> Active Sessions
        </h2>
        {sessions.length > 0 && (
          <button onClick={revokeAll} disabled={busy === "all"}
            className="flex items-center gap-1.5 text-xs font-semibold text-red-400 border border-red-500/30 hover:bg-red-500/10 rounded-lg px-3 py-1.5 transition disabled:opacity-40">
            <LogOut size={13} /> {busy === "all" ? "Signing out…" : "Sign out all"}
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-14 rounded-xl bg-white/[0.04] animate-pulse" />)}</div>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-white/40 text-center py-6">No active sessions.</p>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <span className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center text-white/60 shrink-0">
                <Smartphone size={16} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white">{deviceLabel(s.userAgent)}</div>
                <div className="text-[11px] text-white/40 flex items-center gap-2 flex-wrap">
                  <span className="flex items-center gap-1"><Globe size={10} />{s.ip ?? "—"}</span>
                  <span>·</span>
                  <span>Started {fmtDate(s.createdAt)}</span>
                </div>
              </div>
              <button onClick={() => revoke(s.id)} disabled={busy === s.id} title="Revoke this session"
                className="p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition shrink-0 disabled:opacity-40">
                <LogOut size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
      {msg && (
        <p className={`mt-3 text-sm flex items-center gap-2 rounded-lg px-3 py-2 ${msg.ok ? "text-green-400 bg-green-500/10 border border-green-500/20" : "text-red-400 bg-red-500/10 border border-red-500/20"}`}>
          {msg.ok ? <CheckCircle2 size={15} /> : <Info size={15} />} {msg.text}
        </p>
      )}
      <p className="mt-3 text-[11px] text-white/30 flex items-center gap-1.5">
        <Sparkles size={11} className="text-accentSoft" /> Changing your password automatically signs out all other devices.
      </p>
    </Panel>
  );
}

/* ─── Shared bits ────────────────────────────────────────── */
function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl p-5" style={{ background: PANEL, border: "1px solid rgba(255,255,255,0.07)" }}>{children}</div>;
}

function StatCard({ label, value, tone, Icon, sub }: { label: string; value: string; tone: string; Icon: React.ElementType; sub?: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: PANEL, border: `1px solid ${tone}22` }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wider text-white/40">{label}</span>
        <Icon size={15} className="shrink-0" style={{ color: tone }} />
      </div>
      <div className="font-display text-xl leading-none" style={{ color: tone }}>{value}</div>
      {sub && <div className="text-[10px] text-white/30 mt-1 truncate">{sub}</div>}
    </div>
  );
}

function Field({ label, type, value, onChange, placeholder }: { label: string; type: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider text-white/55 block mb-1.5">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="off"
        className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-accentSoft/60 transition" />
    </div>
  );
}

function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input inputMode="numeric" maxLength={6} value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      placeholder="000000"
      className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2.5 text-center text-lg font-mono tracking-[0.4em] text-white placeholder-white/20 focus:outline-none focus:border-accentSoft/60 transition" />
  );
}
