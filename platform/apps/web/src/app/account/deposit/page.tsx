"use client";
import { useState } from "react";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";
import {
  ArrowDownCircle, Copy, CheckCircle2, Wallet, CreditCard, Bitcoin, QrCode,
  ShieldCheck, Zap, Clock, Headphones, Info, Sparkles,
} from "lucide-react";

type Method = "UPI" | "BANK_TRANSFER" | "CRYPTO";

interface UpiMethod    { enabled: boolean; upiId: string; qrCodeUrl?: string; displayName?: string; }
interface BankMethod   { enabled: boolean; accountName: string; accountNumber: string; ifsc: string; bankName: string; branch?: string; }
interface CryptoMethod { enabled: boolean; address: string; network: string; coin: string; qrCodeUrl?: string; }
interface DepositMethods { upi?: UpiMethod; bank?: BankMethod; crypto?: CryptoMethod; }

const PANEL = "linear-gradient(135deg, #12183a, #0d1224)";

async function publicFetch(url: string) {
  const r = await fetch(`/api${url}`);
  return r.json();
}

function fmt(n: number | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button onClick={copy} className="ml-1 p-1.5 rounded-lg hover:bg-white/10 transition text-white/50 hover:text-accentSoft shrink-0">
      {copied ? <CheckCircle2 size={14} className="text-green-400" /> : <Copy size={14} />}
    </button>
  );
}

const METHOD_INFO: { v: Method; label: string; sub: string; icon: React.ReactNode; color: string }[] = [
  { v: "UPI",           label: "UPI",           sub: "Instant · GPay, PhonePe", icon: <Wallet size={20} />,     color: "#22c55e" },
  { v: "BANK_TRANSFER", label: "Bank Transfer", sub: "NEFT / IMPS / RTGS",      icon: <CreditCard size={20} />, color: "#38bdf8" },
  { v: "CRYPTO",        label: "Crypto",        sub: "USDT, BTC & more",         icon: <Bitcoin size={20} />,    color: "#f59e0b" },
];

const QUICK_AMOUNTS = [500, 1000, 2000, 5000, 10000, 25000];

export default function DepositPage() {
  const [method, setMethod]       = useState<Method>("UPI");
  const [amount, setAmount]       = useState(0);
  const [reference, setReference] = useState("");
  const [busy, setBusy]           = useState(false);
  const [msg, setMsg]             = useState<{ text: string; ok: boolean } | null>(null);

  const user = useAuthStore((s) => s.user);
  const { data: wallet } = useSWR(user ? "/wallet/summary" : null);
  const { data: mine } = useSWR(user ? "/transactions/mine" : null);
  const { data: payMethods } = useSWR<DepositMethods>("/platform/deposit-methods", publicFetch, { refreshInterval: 30000 });

  async function submit() {
    if (amount <= 0) { setMsg({ text: "Enter a valid amount.", ok: false }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.post("/transactions", { kind: "DEPOSIT", method, amount, reference });
      setMsg({ text: "Deposit request submitted — admin will credit your wallet shortly.", ok: true });
      setAmount(0); setReference("");
      mutate("/transactions/mine");
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message || "Failed", ok: false });
    } finally { setBusy(false); }
  }

  const upi    = payMethods?.upi;
  const bank   = payMethods?.bank;
  const crypto = payMethods?.crypto;

  const availableMethods = METHOD_INFO.filter((m) => {
    if (m.v === "UPI"           && upi    && !upi.enabled)    return false;
    if (m.v === "BANK_TRANSFER" && bank   && !bank.enabled)   return false;
    if (m.v === "CRYPTO"        && crypto && !crypto.enabled) return false;
    return true;
  });

  const depositReqs = (mine ?? []).filter((t: any) => t.kind === "DEPOSIT");

  return (
    <div className="max-w-6xl mx-auto pb-10">
      {/* ── Hero ───────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl p-5 md:p-6 mb-5"
        style={{ background: "linear-gradient(135deg, #1a0f2e 0%, #12183a 50%, #1a0a1a 100%)", border: "1px solid rgba(255,122,24,0.18)" }}>
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-25 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #ff7a18, transparent)" }} />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-glow"
            style={{ background: "linear-gradient(135deg, #e43f3f, #ff7a18)" }}>
            <ArrowDownCircle size={28} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-3xl md:text-4xl leading-none">Deposit Funds</h1>
            <p className="text-sm text-white/55 mt-1">Add money instantly via UPI, Bank Transfer or Crypto.</p>
          </div>
          <div className="flex gap-3 shrink-0">
            <div className="rounded-xl px-4 py-2.5 text-center min-w-[100px]" style={{ background: "rgba(255,122,24,0.1)", border: "1px solid rgba(255,122,24,0.25)" }}>
              <div className="text-[10px] uppercase tracking-wider text-white/40">Balance</div>
              <div className="font-display text-xl text-accentSoft">₹{fmt(wallet?.balance)}</div>
            </div>
            <div className="rounded-xl px-4 py-2.5 text-center min-w-[100px]" style={{ background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.25)" }}>
              <div className="text-[10px] uppercase tracking-wider text-white/40">Bonus</div>
              <div className="font-display text-xl" style={{ color: "#a78bfa" }}>₹{fmt(wallet?.bonus)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* ── Left: deposit flow ───────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Step 1 — Method */}
          <Panel>
            <StepHead n={1} title="Select Payment Method" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {availableMethods.map((m) => {
                const active = method === m.v;
                return (
                  <button key={m.v} onClick={() => setMethod(m.v)}
                    className="relative flex flex-col items-start gap-2 p-4 rounded-xl border text-left transition-all"
                    style={{
                      background: active ? `${m.color}14` : "rgba(255,255,255,0.03)",
                      borderColor: active ? `${m.color}66` : "rgba(255,255,255,0.1)",
                      boxShadow: active ? `0 0 18px ${m.color}33` : "none",
                    }}>
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: `${m.color}1f`, color: m.color }}>{m.icon}</span>
                    <div>
                      <div className="font-bold text-sm" style={{ color: active ? m.color : "#fff" }}>{m.label}</div>
                      <div className="text-[10px] text-white/40">{m.sub}</div>
                    </div>
                    {active && <CheckCircle2 size={16} className="absolute top-3 right-3" style={{ color: m.color }} />}
                  </button>
                );
              })}
            </div>
            {availableMethods.length === 0 && (
              <p className="text-xs text-white/30 text-center py-4">No payment methods are currently enabled.</p>
            )}
          </Panel>

          {/* Step 2 — Payment details */}
          <Panel>
            <StepHead n={2} title="Send Payment To" />

            {/* UPI */}
            {method === "UPI" && upi && (
              <div className="space-y-3">
                <div className="flex justify-center">
                  {upi.qrCodeUrl ? (
                    <div className="bg-white p-3 rounded-2xl inline-block shadow-glow">
                      <img src={upi.qrCodeUrl} alt="UPI QR Code" className="w-40 h-40 object-contain" />
                    </div>
                  ) : (
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center text-white/30">
                      <QrCode size={48} className="mx-auto mb-2 opacity-30" />
                      <p className="text-xs">QR code not configured</p>
                    </div>
                  )}
                </div>
                <DetailRow label={`UPI ID${upi.displayName ? ` · ${upi.displayName}` : ""}`} value={upi.upiId || "Not configured"} big copyable={!!upi.upiId} />
              </div>
            )}

            {/* Bank */}
            {method === "BANK_TRANSFER" && bank && (
              <div className="rounded-xl bg-white/[0.03] border border-white/10 divide-y divide-white/[0.06]">
                {[
                  { label: "Account Name",   value: bank.accountName },
                  { label: "Account Number", value: bank.accountNumber },
                  { label: "IFSC Code",      value: bank.ifsc },
                  { label: "Bank Name",      value: bank.bankName },
                  ...(bank.branch ? [{ label: "Branch", value: bank.branch }] : []),
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between gap-2 px-4 py-3">
                    <span className="text-xs text-white/45 w-32 shrink-0">{label}</span>
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="font-mono text-sm text-white truncate">{value || "—"}</span>
                      {value && <CopyBtn text={value} />}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Crypto */}
            {method === "CRYPTO" && crypto && (
              <div className="space-y-3">
                {crypto.qrCodeUrl && (
                  <div className="flex justify-center">
                    <div className="bg-white p-3 rounded-2xl inline-block shadow-glow">
                      <img src={crypto.qrCodeUrl} alt="Crypto QR" className="w-40 h-40 object-contain" />
                    </div>
                  </div>
                )}
                <div className="rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3 flex items-center justify-between">
                  <span className="text-xs text-white/45">Coin / Network</span>
                  <span className="font-bold text-accentSoft">{crypto.coin} <span className="text-white/40 font-normal text-xs">({crypto.network})</span></span>
                </div>
                <DetailRow label="Wallet Address" value={crypto.address || "Not configured"} mono copyable={!!crypto.address} />
              </div>
            )}

            {!payMethods && <p className="text-xs text-white/30 text-center py-4">Loading payment details…</p>}
          </Panel>

          {/* Step 3 — Amount */}
          <Panel>
            <StepHead n={3} title="Enter Amount & Confirm" />
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/55 mb-2">Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-accentSoft font-display text-2xl">₹</span>
              <input type="number" inputMode="decimal" value={amount || ""}
                onChange={(e) => setAmount(Number(e.target.value) || 0)} placeholder="0"
                className="w-full bg-white/5 border border-white/15 rounded-xl pl-10 pr-4 py-3.5 text-white text-2xl font-display tracking-wide placeholder-white/20 focus:outline-none focus:border-accentSoft/60 focus:bg-white/[0.08] transition" />
            </div>
            <div className="flex gap-2 mt-2.5 flex-wrap">
              {QUICK_AMOUNTS.map((v) => (
                <button key={v} onClick={() => setAmount(v)}
                  className="text-xs font-semibold border rounded-lg px-3 py-1.5 transition"
                  style={{
                    background: amount === v ? "rgba(255,122,24,0.15)" : "rgba(255,255,255,0.03)",
                    borderColor: amount === v ? "rgba(255,122,24,0.5)" : "rgba(255,255,255,0.12)",
                    color: amount === v ? "#ffb074" : "rgba(255,255,255,0.7)",
                  }}>
                  +₹{v.toLocaleString("en-IN")}
                </button>
              ))}
            </div>

            <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/55 mt-5 mb-2">
              Reference / UTR <span className="text-white/30 normal-case font-normal">(optional — verifies faster)</span>
            </label>
            <input value={reference} onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. UTR123456789 or transaction ID"
              className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-accentSoft/60 focus:bg-white/[0.08] transition" />

            <button disabled={busy || amount <= 0} onClick={submit}
              className="mt-5 w-full flex items-center justify-center gap-2 rounded-xl bg-accent-grad py-3.5 font-bold text-white text-base shadow-glow hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition">
              <ArrowDownCircle size={18} />
              {busy ? "Submitting…" : "I've Paid — Submit Request"}
            </button>
            {msg && (
              <p className={`mt-3 text-sm flex items-center gap-2 rounded-lg px-3 py-2 ${msg.ok ? "text-green-400 bg-green-500/10 border border-green-500/20" : "text-red-400 bg-red-500/10 border border-red-500/20"}`}>
                {msg.ok ? <CheckCircle2 size={15} /> : <Info size={15} />} {msg.text}
              </p>
            )}
          </Panel>
        </div>

        {/* ── Right: info & history ────────────────────────── */}
        <div className="space-y-5">
          {/* How it works */}
          <Panel>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles size={15} className="text-accentSoft" />
              <span className="text-sm font-semibold text-white/80">How It Works</span>
            </div>
            <ol className="space-y-3">
              {[
                { t: "Pick a method", d: "Choose UPI, Bank or Crypto." },
                { t: "Send the payment", d: "Pay to the details shown." },
                { t: "Submit & confirm", d: "Enter amount + UTR and submit." },
                { t: "Get credited", d: "Admin approves — funds added fast." },
              ].map((s, i) => (
                <li key={s.t} className="flex gap-3">
                  <span className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
                    style={{ background: "linear-gradient(135deg, #e43f3f, #ff7a18)" }}>{i + 1}</span>
                  <div>
                    <div className="text-xs font-semibold text-white/85">{s.t}</div>
                    <div className="text-[11px] text-white/40">{s.d}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>

          {/* Trust / info */}
          <Panel>
            <div className="space-y-2.5">
              <InfoLine icon={<Zap size={14} />} color="#22c55e" label="Fast credit after approval" />
              <InfoLine icon={<ShieldCheck size={14} />} color="#38bdf8" label="100% secure & encrypted" />
              <InfoLine icon={<Clock size={14} />} color="#f59e0b" label="Min deposit ₹100 · 24/7" />
              <InfoLine icon={<Headphones size={14} />} color="#a78bfa" label="Live support for issues" />
            </div>
          </Panel>

          {/* Recent requests */}
          <Panel>
            <div className="flex items-center gap-2 mb-3">
              <Wallet size={15} className="text-accentSoft" />
              <span className="text-sm font-semibold text-white/80">Recent Requests</span>
            </div>
            <ul className="divide-y divide-white/[0.06] text-sm">
              {depositReqs.slice(0, 6).map((t: any) => (
                <li key={t.id} className="py-2.5 flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <span className="font-display text-base text-white">₹{Number(t.amount).toLocaleString("en-IN")}</span>
                    <span className="text-white/40 ml-2 text-[11px]">{(t.method ?? "").replace("_", " ")}</span>
                    {t.reference && <div className="text-[10px] text-white/30 truncate">{t.reference}</div>}
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-lg font-bold shrink-0 ${
                    ["APPROVED", "COMPLETED"].includes(t.status) ? "bg-green-500/15 text-green-400 border border-green-500/30" :
                    t.status === "REJECTED"                      ? "bg-red-500/15 text-red-400 border border-red-500/30" :
                                                                   "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                  }`}>{t.status === "APPROVED" ? "COMPLETED" : t.status}</span>
                </li>
              ))}
              {depositReqs.length === 0 && (
                <li className="py-6 text-center text-white/30 text-xs">No deposit requests yet.</li>
              )}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────── */
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: PANEL, border: "1px solid rgba(255,255,255,0.07)" }}>
      {children}
    </div>
  );
}

function StepHead({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="font-semibold text-white flex items-center gap-2 mb-4">
      <span className="w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0"
        style={{ background: "linear-gradient(135deg, #e43f3f, #ff7a18)" }}>{n}</span>
      {title}
    </h2>
  );
}

function DetailRow({ label, value, big, mono, copyable }: { label: string; value: string; big?: boolean; mono?: boolean; copyable?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3">
      <p className="text-[11px] text-white/45 mb-1">{label}</p>
      <div className="flex items-center">
        <span className={`text-white break-all ${big ? "font-display text-xl tracking-wide" : mono ? "font-mono text-xs" : "font-mono text-sm"}`}>{value}</span>
        {copyable && <CopyBtn text={value} />}
      </div>
    </div>
  );
}

function InfoLine({ icon, color, label }: { icon: React.ReactNode; color: string; label: string }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}18`, color }}>{icon}</span>
      <span className="text-white/70">{label}</span>
    </div>
  );
}
