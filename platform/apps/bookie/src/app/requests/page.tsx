"use client";
import useSWR from "swr";
import Link from "next/link";
import { PageHeader, GlassCard, Badge } from "@/components/ui";
import {
  Inbox, Lock, CheckCircle2, KeyRound, SlidersHorizontal, XCircle, MessageSquare, Clock, ExternalLink,
} from "lucide-react";

interface Req {
  id: string; title: string; type: string | null; targetUserId: string | null;
  status: string; priority: string;
  adminReply: { body: string; isAdmin: boolean; createdAt: string } | null;
  createdAt: string; updatedAt: string;
}

const KEY = "/bookie/requests";
const fmtDate = (s: string) => new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const TYPE_META: Record<string, { Icon: any; tone: string }> = {
  BLOCK:          { Icon: Lock,             tone: "red" },
  UNBLOCK:        { Icon: CheckCircle2,     tone: "emerald" },
  RESET_PASSWORD: { Icon: KeyRound,         tone: "sky" },
  ADJUST_LIMIT:   { Icon: SlidersHorizontal,tone: "amber" },
  CLOSE_ACCOUNT:  { Icon: XCircle,          tone: "red" },
  OTHER:          { Icon: MessageSquare,    tone: "slate" },
};
const toneCls: Record<string, string> = {
  red: "bg-red-500/10 text-red-300 border-red-500/40",
  emerald: "bg-emerald-500/10 text-emerald-300 border-emerald-500/40",
  sky: "bg-sky-500/10 text-sky-300 border-sky-500/40",
  amber: "bg-amber-500/10 text-amber-300 border-amber-500/40",
  slate: "bg-gray-700/40 text-gray-300 border-gray-600/50",
};
const statusTone = (s: string) => (s === "RESOLVED" ? "emerald" : s === "CLOSED" ? "red" : s === "PENDING" ? "sky" : "amber");
const statusWord = (s: string) =>
  s === "RESOLVED" ? "Approved" : s === "CLOSED" ? "Rejected / Closed" : s === "PENDING" ? "Admin replied" : "Awaiting admin";

export default function MyRequestsPage() {
  const { data, isLoading } = useSWR<Req[]>(KEY, { refreshInterval: 15000 });
  const rows = data ?? [];
  const pending = rows.filter(r => r.status === "OPEN" || r.status === "PENDING").length;

  return (
    <div>
      <PageHeader title="My Requests" subtitle="Player change requests you sent to the admin and their outcome." />

      <div className="grid grid-cols-3 gap-3 mb-5">
        <Stat label="Total" value={rows.length} tone="slate" />
        <Stat label="Pending" value={pending} tone="amber" />
        <Stat label="Approved" value={rows.filter(r => r.status === "RESOLVED").length} tone="emerald" />
      </div>

      {isLoading && !data ? (
        <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-20 rounded-xl bg-gray-800 animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <GlassCard className="py-16 text-center text-gray-500">
          <Inbox size={26} className="mx-auto mb-2 opacity-50" />
          No requests yet. Open a player from <Link href="/users" className="text-emerald-300 hover:underline">My Users</Link> and use the request panel.
        </GlassCard>
      ) : (
        <div className="space-y-2.5">
          {rows.map(r => {
            const meta = TYPE_META[r.type ?? "OTHER"] ?? TYPE_META.OTHER!;
            const Icon = meta.Icon;
            return (
              <GlassCard key={r.id} className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${toneCls[meta.tone]}`}><Icon size={17} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-100 text-sm">{r.title}</span>
                      {r.priority === "HIGH" && <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/40 font-bold">HIGH</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      {(r.status === "OPEN" || r.status === "PENDING") && <Clock size={11} className="text-amber-400" />}
                      Sent {fmtDate(r.createdAt)}
                      {r.targetUserId && (
                        <Link href={`/users/${r.targetUserId}`} className="text-emerald-300 hover:underline inline-flex items-center gap-0.5">
                          view player <ExternalLink size={9} />
                        </Link>
                      )}
                    </p>
                  </div>
                  <Badge tone={statusTone(r.status)}>{statusWord(r.status)}</Badge>
                </div>
                {r.adminReply && (
                  <div className="mt-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20 px-3 py-2 text-xs">
                    <p className="font-bold text-[10px] uppercase tracking-wider text-yellow-400 mb-1">Admin reply · {fmtDate(r.adminReply.createdAt)}</p>
                    <p className="text-gray-300 whitespace-pre-wrap">{r.adminReply.body}</p>
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "amber" | "emerald" | "slate" }) {
  const color = tone === "amber" ? "text-amber-300" : tone === "emerald" ? "text-emerald-300" : "text-gray-200";
  return (
    <GlassCard className="p-3.5">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</p>
      <p className={`font-black text-xl tabular-nums ${color}`}>{value}</p>
    </GlassCard>
  );
}
