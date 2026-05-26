"use client";
import { useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { api } from "@/lib/api";
import { useLiveData } from "@/lib/hooks";
import { PageHeader, GlassCard, StatCard, Badge } from "@/components/ui";
import { LifeBuoy, Send, MessageSquare, Clock, CheckCircle2, Inbox } from "lucide-react";

interface TicketRow {
  id: string; subject: string; status: string; priority: string;
  username: string; messageCount: number;
  lastMessage: { body: string; isAdmin: boolean; createdAt: string } | null;
  createdAt: string; updatedAt: string;
}
interface TicketDetail {
  id: string; subject: string; status: string; priority: string;
  user: { id: string; username: string; email: string | null };
  messages: { id: string; body: string; isAdmin: boolean; authorId: string | null; createdAt: string }[];
}

const STATUSES = ["all", "OPEN", "PENDING", "RESOLVED", "CLOSED"];
const STATUS_TONE: Record<string, string> = { OPEN: "sky", PENDING: "amber", RESOLVED: "emerald", CLOSED: "slate" };
const PRIORITY_TONE: Record<string, string> = { LOW: "slate", NORMAL: "sky", HIGH: "amber", URGENT: "red" };

export default function SupportPage() {
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const listKey = `/admin/support/tickets${status === "all" ? "" : `?status=${status}`}`;
  const { data: tickets, isLoading } = useLiveData<TicketRow[]>(listKey, 15000);

  const counts = (tickets ?? []).reduce<Record<string, number>>((m, t) => { m[t.status] = (m[t.status] ?? 0) + 1; return m; }, {});

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title="Support Tickets" subtitle="User support queue, conversations & moderation" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Open"     value={String(counts.OPEN ?? 0)}     Icon={Inbox}       accent="sky"     loading={isLoading} />
        <StatCard label="Pending"  value={String(counts.PENDING ?? 0)}  Icon={Clock}       accent="amber"   loading={isLoading} />
        <StatCard label="Resolved" value={String(counts.RESOLVED ?? 0)} Icon={CheckCircle2} accent="emerald" loading={isLoading} />
        <StatCard label="Total"    value={String(tickets?.length ?? 0)} Icon={LifeBuoy}    accent="violet"  loading={isLoading} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition border ${status === s ? "bg-yellow-400 text-gray-900 border-yellow-400" : "bg-gray-800/60 text-gray-400 border-gray-700 hover:border-yellow-400/50"}`}>
            {s.toLowerCase()}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        {/* Ticket list */}
        <div className="lg:col-span-2 space-y-2">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 bg-gray-700/40 rounded-xl animate-pulse" />)
          ) : (tickets?.length ?? 0) === 0 ? (
            <GlassCard className="p-8 text-center text-gray-500 text-sm">No tickets in this view</GlassCard>
          ) : (
            tickets!.map((t) => (
              <button key={t.id} onClick={() => setSelected(t.id)}
                className={`w-full text-left rounded-xl border p-3.5 transition ${selected === t.id ? "border-yellow-400/60 bg-gray-800" : "border-gray-700/60 bg-gray-800/60 hover:border-yellow-400/30"}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-bold text-gray-200 text-sm truncate">{t.subject}</span>
                  <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>@{t.username} · <Badge tone={PRIORITY_TONE[t.priority]} className="!px-1.5 !py-0">{t.priority}</Badge></span>
                  <span className="flex items-center gap-1"><MessageSquare size={11} />{t.messageCount}</span>
                </div>
                {t.lastMessage && <p className="text-xs text-gray-500 mt-1.5 truncate">{t.lastMessage.isAdmin ? "↩ " : ""}{t.lastMessage.body}</p>}
              </button>
            ))
          )}
        </div>

        {/* Detail */}
        <div className="lg:col-span-3">
          {selected
            ? <TicketDetailView id={selected} onChanged={() => globalMutate(listKey)} />
            : <GlassCard className="h-full min-h-[300px] flex items-center justify-center text-gray-500 text-sm">Select a ticket to view the conversation</GlassCard>}
        </div>
      </div>
    </div>
  );
}

function TicketDetailView({ id, onChanged }: { id: string; onChanged: () => void }) {
  const key = `/admin/support/tickets/${id}`;
  const { data, isLoading } = useSWR<TicketDetail>(key);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    try { await api.post(`${key}/messages`, { body: reply.trim() }); setReply(""); globalMutate(key); onChanged(); }
    catch { alert("Reply failed"); }
    finally { setBusy(false); }
  };
  const setStatus = async (status: string) => {
    try { await api.patch(`${key}/status`, { status }); globalMutate(key); onChanged(); }
    catch { alert("Status update failed"); }
  };

  if (isLoading || !data) return <GlassCard className="h-full min-h-[300px] animate-pulse" />;

  return (
    <GlassCard className="flex flex-col h-full min-h-[300px]">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4 border-b border-gray-700/60">
        <div>
          <h3 className="font-black text-gray-100">{data.subject}</h3>
          <p className="text-xs text-gray-500 mt-0.5">@{data.user.username}{data.user.email ? ` · ${data.user.email}` : ""}</p>
        </div>
        <select value={data.status} onChange={(e) => setStatus(e.target.value)}
          className="bg-gray-900/70 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-yellow-400/60">
          {["OPEN", "PENDING", "RESOLVED", "CLOSED"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[420px]">
        {data.messages.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No messages yet</p>
        ) : data.messages.map((m) => (
          <div key={m.id} className={`flex ${m.isAdmin ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${m.isAdmin ? "bg-yellow-400/15 border border-yellow-400/30 text-gray-100" : "bg-gray-900/60 border border-gray-700 text-gray-300"}`}>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p className="text-[10px] text-gray-500 mt-1">{m.isAdmin ? "Admin" : data.user.username} · {new Date(m.createdAt).toLocaleString("en-IN")}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Reply */}
      <div className="p-3 border-t border-gray-700/60 flex items-end gap-2">
        <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }}
          placeholder="Type a reply…  (Ctrl/⌘+Enter to send)"
          className="flex-1 bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-yellow-400/60 resize-none placeholder:text-gray-600" />
        <button onClick={send} disabled={busy || !reply.trim()}
          className="p-2.5 rounded-lg text-gray-900 bg-gradient-to-r from-yellow-400 to-yellow-500 hover:brightness-110 disabled:opacity-40 transition"><Send size={16} /></button>
      </div>
    </GlassCard>
  );
}
