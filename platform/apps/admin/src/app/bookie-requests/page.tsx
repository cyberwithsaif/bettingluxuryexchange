"use client";
import { useState } from "react";
import Link from "next/link";
import { mutate as globalMutate } from "swr";
import { api } from "@/lib/api";
import { useRiskData } from "@/lib/hooks";
import { PageHeader, GlassCard } from "@/components/ui";
import {
  Inbox, Store, User as UserIcon, CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight,
  Lock, KeyRound, SlidersHorizontal, MessageSquare, ExternalLink,
} from "lucide-react";

interface Req {
  id: string; type: string | null; title: string; status: string; priority: string;
  bookie: { id: string; username: string } | null;
  target: { id: string; username: string; status: string } | null;
  reason: string | null;
  messages: { id: string; body: string; isAdmin: boolean; createdAt: string }[];
  createdAt: string; updatedAt: string;
}
interface Data { summary: { total: number; pending: number }; rows: Req[]; }

const KEY = "/admin/bookies/requests";
const fmtDate = (s: string) => new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const TYPE_META: Record<string, { label: string; Icon: any; tone: string }> = {
  BLOCK:          { label: "Block / Suspend",  Icon: Lock,             tone: "red" },
  UNBLOCK:        { label: "Unblock",          Icon: CheckCircle2,     tone: "emerald" },
  RESET_PASSWORD: { label: "Reset Password",   Icon: KeyRound,         tone: "sky" },
  ADJUST_LIMIT:   { label: "Adjust Limits",    Icon: SlidersHorizontal,tone: "amber" },
  CLOSE_ACCOUNT:  { label: "Close Account",    Icon: XCircle,          tone: "red" },
  OTHER:          { label: "Other Change",     Icon: MessageSquare,    tone: "slate" },
};
const toneCls: Record<string, string> = {
  red: "bg-red-500/10 text-red-300 border-red-500/40",
  emerald: "bg-emerald-500/10 text-emerald-300 border-emerald-500/40",
  sky: "bg-sky-500/10 text-sky-300 border-sky-500/40",
  amber: "bg-amber-500/10 text-amber-300 border-amber-500/40",
  slate: "bg-gray-700/40 text-gray-300 border-gray-600/50",
};
const STATUS_CLS: Record<string, string> = {
  OPEN: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  PENDING: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  RESOLVED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  CLOSED: "bg-gray-700/50 text-gray-400 border-gray-600/50",
};

export default function BookieRequestsPage() {
  const [statusFilter, setStatusFilter] = useState("ALL");
  const { data, isLoading } = useRiskData<Data>(`${KEY}?status=${statusFilter}`); // 5s live
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function act(r: Req, action: "approve" | "reject") {
    const auto = action === "approve" && ["BLOCK", "UNBLOCK", "CLOSE_ACCOUNT"].includes(r.type ?? "");
    const verb = action === "approve" ? (auto ? "Approve & apply" : "Approve") : "Reject";
    if (!window.confirm(`${verb} this request for ${r.target?.username ?? "player"}?${auto ? "\nThe player's status will be changed automatically." : ""}`)) return;
    setBusy(r.id); setMsg(null);
    try {
      const { data: res } = await api.post(`${KEY}/${r.id}/action`, { action, note: note.trim() || undefined });
      setMsg({ ok: true, text: `${action === "approve" ? "Approved" : "Rejected"}${res.executed ? ` — ${res.executed}` : ""}` });
      setNote("");
      globalMutate(`${KEY}?status=${statusFilter}`);
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || "Action failed" }); }
    finally { setBusy(null); }
  }

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title="Bookie Requests" subtitle="Player block / change requests submitted by bookies — approve to apply, or reject" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Total Requests" value={String(data?.summary.total ?? 0)} Icon={Inbox} tone="neutral" loading={isLoading} />
        <Card label="Pending" value={String(data?.summary.pending ?? 0)} Icon={Clock} tone={(data?.summary.pending ?? 0) > 0 ? "amber" : "ok"} loading={isLoading} />
        <Card label="Resolved" value={String(rows.filter(r => r.status === "RESOLVED").length)} Icon={CheckCircle2} tone="ok" loading={isLoading} />
        <Card label="Rejected" value={String(rows.filter(r => r.status === "CLOSED").length)} Icon={XCircle} tone="neutral" loading={isLoading} />
      </div>

      {/* Filter + note */}
      <div className="flex flex-wrap items-center gap-2">
        {["ALL", "OPEN", "RESOLVED", "CLOSED"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${statusFilter === s ? "bg-gradient-to-r from-yellow-500 to-amber-500 text-gray-900" : "bg-gray-900/60 text-gray-400 border border-gray-700 hover:text-gray-200"}`}>
            {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note attached to your next action…"
          className="flex-1 min-w-[200px] bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-200 outline-none focus:border-yellow-400/60" />
        {msg && <span className={`text-xs font-semibold ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</span>}
      </div>

      {/* List */}
      {isLoading && !data ? (
        <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-20 rounded-xl bg-white/[0.04] animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <GlassCard className="py-16 text-center text-gray-500">
          <Inbox size={26} className="mx-auto mb-2 opacity-50" /> No bookie requests{statusFilter !== "ALL" ? ` with status ${statusFilter}` : ""}.
        </GlassCard>
      ) : (
        <div className="space-y-2.5">
          {rows.map(r => {
            const meta = TYPE_META[r.type ?? "OTHER"] ?? TYPE_META.OTHER!;
            const Icon = meta.Icon;
            const open = openId === r.id;
            const actionable = r.status === "OPEN" || r.status === "PENDING";
            return (
              <GlassCard key={r.id} className="p-0 overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${toneCls[meta.tone]}`}><Icon size={17} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-gray-100 text-sm">{meta.label}</span>
                      {r.priority === "HIGH" && <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/40 font-bold">HIGH</span>}
                      <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${STATUS_CLS[r.status] ?? "bg-gray-700 text-gray-400 border-gray-700"}`}>{r.status}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1"><Store size={11} className="text-emerald-400" /> {r.bookie?.username ?? "—"}</span>
                      <ChevronRight size={11} className="text-gray-600" />
                      <span className="flex items-center gap-1">
                        <UserIcon size={11} className="text-sky-400" />
                        {r.target ? (
                          <Link href={`/users/${r.target.id}`} className="text-sky-300 hover:underline inline-flex items-center gap-0.5">
                            {r.target.username} <ExternalLink size={9} />
                          </Link>
                        ) : "—"}
                        {r.target && <span className="text-gray-600">({r.target.status})</span>}
                      </span>
                      <span className="text-gray-600">· {fmtDate(r.createdAt)}</span>
                    </p>
                  </div>
                  {actionable && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => act(r, "approve")} disabled={busy !== null}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600 hover:brightness-110 disabled:opacity-40 transition flex items-center gap-1.5">
                        <CheckCircle2 size={13} /> {busy === r.id ? "…" : "Approve"}
                      </button>
                      <button onClick={() => act(r, "reject")} disabled={busy !== null}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-red-300 border border-red-500/40 hover:bg-red-500/10 disabled:opacity-40 transition flex items-center gap-1.5">
                        <XCircle size={13} /> Reject
                      </button>
                    </div>
                  )}
                  <button onClick={() => setOpenId(open ? null : r.id)} className="p-1.5 rounded-lg border border-gray-700 text-gray-500 hover:text-gray-300 shrink-0">
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                </div>

                {open && (
                  <div className="border-t border-gray-800 bg-gray-900/40 p-4 space-y-2">
                    {r.messages.map(m => (
                      <div key={m.id} className={`rounded-lg px-3 py-2 text-xs ${m.isAdmin ? "bg-yellow-500/5 border border-yellow-500/20" : "bg-gray-800/60 border border-gray-700"}`}>
                        <p className="font-bold text-[10px] uppercase tracking-wider mb-1" style={{ color: m.isAdmin ? "#fbbf24" : "#34d399" }}>
                          {m.isAdmin ? "Admin" : "Bookie"} · {fmtDate(m.createdAt)}
                        </p>
                        <p className="text-gray-300 whitespace-pre-wrap">{m.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-gray-600 max-w-3xl leading-relaxed">
        Approving a <b className="text-red-300">Block</b>, <b className="text-emerald-300">Unblock</b> or <b className="text-red-300">Close Account</b> request changes the
        player&apos;s status automatically. Reset Password / Adjust Limits / Other are marked approved for you to finish on the
        player&apos;s profile. Every action replies to the bookie and is written to Audit Logs.
      </p>
    </div>
  );
}

function Card({ label, value, Icon, tone, loading }: { label: string; value: string; Icon: any; tone: "amber" | "ok" | "neutral"; loading?: boolean }) {
  const color = tone === "amber" ? "text-amber-300" : tone === "ok" ? "text-emerald-300" : "text-gray-100";
  const iconBg = tone === "amber" ? "bg-amber-500/10 text-amber-400" : tone === "ok" ? "bg-emerald-500/10 text-emerald-400" : "bg-gray-700/40 text-gray-400";
  return (
    <div className="bg-gray-800 rounded-xl border border-yellow-500/20 p-4 flex items-start justify-between gap-2">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">{label}</p>
        {loading ? <div className="h-6 w-12 bg-gray-700 rounded animate-pulse" /> : <p className={`text-xl font-black tabular-nums ${color}`}>{value}</p>}
      </div>
      <div className={`p-2 rounded-lg shrink-0 ${iconBg}`}><Icon size={15} /></div>
    </div>
  );
}
