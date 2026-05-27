"use client";
import { useState } from "react";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import { PageHeader, StatCard, Badge, DataTable, Column, Modal, Field, GlassCard } from "@/components/ui";
import {
  Wallet, Clock, ArrowDownCircle, CreditCard, Bitcoin, Copy, CheckCircle2, QrCode, Plus, Info,
} from "lucide-react";

const inr = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dt = (s: string) => new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const kindLabel = (k: string) => (k === "COMMISSION_PAYOUT" ? "ADMIN COMMISSION" : k.replace(/_/g, " "));
const kindTone = (k: string) =>
  k === "BOOKIE_RECHARGE" ? "sky" : k === "USER_TO_BOOKIE" ? "emerald" : k === "BOOKIE_TO_USER" ? "amber" : k === "COMMISSION_PAYOUT" ? "red" : "violet";

type Method = "UPI" | "BANK_TRANSFER" | "CRYPTO";
interface UpiMethod    { enabled: boolean; upiId: string; qrCodeUrl?: string; displayName?: string; }
interface BankMethod   { enabled: boolean; accountName: string; accountNumber: string; ifsc: string; bankName: string; branch?: string; }
interface CryptoMethod { enabled: boolean; address: string; network: string; coin: string; qrCodeUrl?: string; }
interface DepositMethods { upi?: UpiMethod; bank?: BankMethod; crypto?: CryptoMethod; }

export default function WalletPage() {
  const { data, isLoading } = useSWR<any>("/bookie/wallet");
  const [depositing, setDepositing] = useState(false);

  const ledgerCols: Column<any>[] = [
    { key: "createdAt", header: "Time", sortValue: (l) => l.createdAt, render: (l) => <span className="text-xs text-gray-500">{dt(l.createdAt)}</span> },
    { key: "kind", header: "Type", render: (l) => <Badge tone={kindTone(l.kind)}>{kindLabel(l.kind)}</Badge> },
    { key: "amount", header: "Amount", align: "right", sortValue: (l) => Number(l.amount),
      render: (l) => <span className={`tabular-nums font-semibold ${Number(l.amount) >= 0 ? "text-emerald-300" : "text-red-400"}`}>{Number(l.amount) >= 0 ? "+" : ""}{inr(Number(l.amount))}</span> },
    { key: "balanceAfter", header: "Balance After", align: "right", render: (l) => <span className="tabular-nums text-gray-300">{inr(Number(l.balanceAfter))}</span> },
    { key: "note", header: "Note", render: (l) => <span className="text-xs text-gray-500">{l.note ?? "—"}</span> },
  ];

  return (
    <div>
      <PageHeader title="Wallet" subtitle="Your balance, deposit requests and complete ledger."
        right={
          <button onClick={() => setDepositing(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600 shadow-[0_2px_12px_rgba(0,200,83,0.4)] hover:brightness-110 transition">
            <Plus size={16} /> Deposit Wallet
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-2 gap-3 mb-5 max-w-xl">
        <StatCard label="Balance" value={inr(data?.balance ?? 0)} Icon={Wallet} accent="emerald" loading={isLoading} />
        <StatCard label="Pending Withdrawals" value={data?.pendingWithdrawals ?? 0} Icon={Clock} accent="amber" loading={isLoading} />
      </div>

      <DepositRequests />

      <h3 className="text-sm font-black text-gray-200 mt-6 mb-2">Wallet Ledger</h3>
      <DataTable columns={ledgerCols} rows={data?.ledger ?? []} loading={isLoading} rowKey={(l) => l.id} exportName="wallet-ledger" emptyText="No wallet movements yet." />

      {depositing && <DepositModal onClose={() => { setDepositing(false); mutate("/bookie/wallet"); mutate("/transactions/mine"); }} />}
    </div>
  );
}

// ── Recent deposit requests ───────────────────────────────────────────────

function DepositRequests() {
  const { data } = useSWR<any[]>("/transactions/mine");
  const reqs = (data ?? []).filter((t) => t.kind === "DEPOSIT").slice(0, 6);
  if (reqs.length === 0) return null;
  const tone = (s: string) => (["APPROVED", "COMPLETED"].includes(s) ? "emerald" : s === "REJECTED" ? "red" : "amber");
  return (
    <GlassCard className="p-4 mb-2">
      <div className="flex items-center gap-2 mb-3"><ArrowDownCircle size={15} className="text-emerald-400" /><span className="text-sm font-semibold text-gray-200">Recent Deposit Requests</span></div>
      <ul className="divide-y divide-gray-800">
        {reqs.map((t) => (
          <li key={t.id} className="py-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="font-bold text-gray-100 tabular-nums">{inr(Number(t.amount))}</span>
              <span className="text-gray-500 ml-2 text-xs">{(t.method ?? "").replace("_", " ")}</span>
              {t.reference && <div className="text-[10px] text-gray-600 truncate">{t.reference}</div>}
            </div>
            <Badge tone={tone(t.status)}>{t.status === "APPROVED" ? "COMPLETED" : t.status}</Badge>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

// ── Deposit modal (mirrors the website deposit flow) ──────────────────────

const QUICK = [1000, 5000, 10000, 25000, 50000, 100000];
const METHODS: { v: Method; label: string; sub: string; Icon: any; color: string }[] = [
  { v: "UPI",           label: "UPI",           sub: "GPay, PhonePe",      Icon: Wallet,     color: "#22c55e" },
  { v: "BANK_TRANSFER", label: "Bank Transfer", sub: "NEFT / IMPS / RTGS", Icon: CreditCard, color: "#38bdf8" },
  { v: "CRYPTO",        label: "Crypto",        sub: "USDT, BTC & more",   Icon: Bitcoin,    color: "#f59e0b" },
];

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="ml-1 p-1 rounded hover:bg-white/10 text-gray-500 hover:text-emerald-400 transition shrink-0">
      {copied ? <CheckCircle2 size={13} className="text-emerald-400" /> : <Copy size={13} />}
    </button>
  );
}

function DepositModal({ onClose }: { onClose: () => void }) {
  const { data: methods } = useSWR<DepositMethods>("/platform/deposit-methods");
  const [method, setMethod] = useState<Method>("UPI");
  const [amount, setAmount] = useState(0);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const upi = methods?.upi, bank = methods?.bank, crypto = methods?.crypto;
  const available = METHODS.filter((m) =>
    !(m.v === "UPI" && upi && !upi.enabled) &&
    !(m.v === "BANK_TRANSFER" && bank && !bank.enabled) &&
    !(m.v === "CRYPTO" && crypto && !crypto.enabled));

  async function submit() {
    if (amount <= 0) { setMsg({ text: "Enter a valid amount.", ok: false }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.post("/transactions", { kind: "DEPOSIT", method, amount, reference });
      setMsg({ text: "Request submitted — admin will credit your wallet after verifying.", ok: true });
      setAmount(0); setReference("");
      mutate("/transactions/mine");
    } catch (e: any) {
      setMsg({ text: e?.response?.data?.message || "Failed to submit.", ok: false });
    } finally { setBusy(false); }
  }

  return (
    <Modal title="Deposit to Wallet" onClose={onClose}>
      {/* Method */}
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Payment Method</p>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {available.map((m) => {
          const active = method === m.v;
          return (
            <button key={m.v} onClick={() => setMethod(m.v)}
              className="flex flex-col items-start gap-1.5 p-3 rounded-xl border text-left transition"
              style={{ background: active ? `${m.color}14` : "rgba(255,255,255,0.03)", borderColor: active ? `${m.color}66` : "rgba(255,255,255,0.1)" }}>
              <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${m.color}1f`, color: m.color }}><m.Icon size={16} /></span>
              <span className="text-xs font-bold" style={{ color: active ? m.color : "#fff" }}>{m.label}</span>
            </button>
          );
        })}
        {available.length === 0 && <p className="col-span-3 text-xs text-gray-500 text-center py-3">No payment methods enabled.</p>}
      </div>

      {/* Details */}
      <div className="rounded-xl bg-gray-800/60 border border-gray-700 p-3 mb-4">
        {method === "UPI" && upi && (
          <div className="space-y-2">
            {upi.qrCodeUrl
              ? <div className="flex justify-center"><div className="bg-white p-2 rounded-xl"><img src={upi.qrCodeUrl} alt="UPI QR" className="w-32 h-32 object-contain" /></div></div>
              : <div className="text-center text-gray-600 py-4"><QrCode size={36} className="mx-auto mb-1 opacity-40" /><p className="text-[11px]">No QR configured</p></div>}
            <Row label={`UPI ID${upi.displayName ? ` · ${upi.displayName}` : ""}`} value={upi.upiId || "Not configured"} />
          </div>
        )}
        {method === "BANK_TRANSFER" && bank && (
          <div className="space-y-1.5">
            <Row label="Account Name" value={bank.accountName} />
            <Row label="Account Number" value={bank.accountNumber} />
            <Row label="IFSC" value={bank.ifsc} />
            <Row label="Bank" value={bank.bankName} />
          </div>
        )}
        {method === "CRYPTO" && crypto && (
          <div className="space-y-2">
            {crypto.qrCodeUrl && <div className="flex justify-center"><div className="bg-white p-2 rounded-xl"><img src={crypto.qrCodeUrl} alt="Crypto QR" className="w-32 h-32 object-contain" /></div></div>}
            <Row label={`Coin / Network`} value={`${crypto.coin} (${crypto.network})`} />
            <Row label="Wallet Address" value={crypto.address || "Not configured"} />
          </div>
        )}
        {!methods && <p className="text-xs text-gray-500 text-center py-3">Loading payment details…</p>}
      </div>

      {/* Amount */}
      <Field label="Amount (₹)"><input type="number" min={0} className="modal-input" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value) || 0)} placeholder="0" autoFocus /></Field>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {QUICK.map((v) => (
          <button key={v} onClick={() => setAmount(v)}
            className={`text-xs font-semibold border rounded-lg px-2.5 py-1 transition ${amount === v ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-300" : "border-gray-700 text-gray-400 hover:border-gray-600"}`}>
            +₹{v.toLocaleString("en-IN")}
          </button>
        ))}
      </div>
      <div className="mt-3"><Field label="Reference / UTR (optional — verifies faster)"><input className="modal-input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. UTR123456789" /></Field></div>

      {msg && (
        <p className={`mt-3 text-sm flex items-center gap-2 rounded-lg px-3 py-2 ${msg.ok ? "text-emerald-300 bg-emerald-500/10 border border-emerald-500/25" : "text-red-400 bg-red-500/10 border border-red-500/25"}`}>
          {msg.ok ? <CheckCircle2 size={15} /> : <Info size={15} />} {msg.text}
        </p>
      )}

      <div className="flex gap-2 mt-4">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-gray-300 border border-gray-700 hover:bg-gray-800 transition">Close</button>
        <button onClick={submit} disabled={busy || amount <= 0} className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600 hover:brightness-110 disabled:opacity-40 transition flex items-center justify-center gap-2">
          <ArrowDownCircle size={16} /> {busy ? "Submitting…" : "I've Paid — Submit"}
        </button>
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-gray-500 shrink-0">{label}</span>
      <div className="flex items-center min-w-0">
        <span className="font-mono text-sm text-gray-200 truncate">{value || "—"}</span>
        {value && value !== "Not configured" && <CopyBtn text={value} />}
      </div>
    </div>
  );
}
