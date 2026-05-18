"use client";
import useSWR, { mutate as globalMutate } from "swr";
import { useState } from "react";
import { api } from "@/lib/api";
import { Bell, Plus, Trash2, ToggleLeft, ToggleRight, Info, AlertTriangle, Tag } from "lucide-react";
import { cn } from "@/lib/cn";

interface Announcement {
  id: string;
  text: string;
  level: string;
  active: boolean;
  createdAt: string;
  startsAt: string | null;
  endsAt: string | null;
}

const LEVEL_ICONS: Record<string, React.ElementType> = {
  info: Info,
  warn: AlertTriangle,
  promo: Tag,
};

const LEVEL_COLORS: Record<string, string> = {
  info:  "bg-blue-500/10 text-blue-300 border-blue-500/30",
  warn:  "bg-yellow-500/10 text-yellow-300 border-yellow-500/30",
  promo: "bg-accent/10 text-accentSoft border-accent/30",
};

const SWR_KEY = "/announcements?limit=100";

export default function AdminNotificationsPage() {
  const { data: announcements, isLoading } = useSWR<Announcement[]>(SWR_KEY);
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display text-4xl">Announcements</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-md bg-accent-grad px-4 py-2 font-bold text-ink shadow-glow hover:brightness-110"
        >
          <Plus size={16} /> New Announcement
        </button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl border border-line bg-panel/60 p-5 animate-pulse">
              <div className="h-4 bg-panel2 rounded w-1/3 mb-3" />
              <div className="h-3 bg-panel2 rounded w-2/3" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && (!announcements || announcements.length === 0) && (
        <div className="rounded-xl border border-line bg-panel/60 p-10 text-center">
          <Bell size={40} className="mx-auto mb-3 text-white/20" />
          <p className="text-white/50 text-sm">No announcements yet. Create one above.</p>
        </div>
      )}

      <div className="space-y-3">
        {(announcements ?? []).map((ann) => {
          const LevelIcon = LEVEL_ICONS[ann.level] ?? Info;
          const levelColor = LEVEL_COLORS[ann.level] ?? LEVEL_COLORS.info;

          return (
            <div
              key={ann.id}
              className={cn(
                "rounded-xl border p-5 flex items-start gap-4 transition",
                ann.active ? "bg-panel/60 border-line" : "bg-panel/20 border-line/40 opacity-60",
              )}
            >
              <div className={cn("mt-0.5 p-2 rounded-lg border shrink-0", levelColor)}>
                <LevelIcon size={16} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={cn("text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border", levelColor)}>
                    {ann.level}
                  </span>
                  <span className={cn(
                    "text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border",
                    ann.active ? "bg-ok/15 text-ok border-ok/30" : "bg-white/5 text-white/30 border-white/10",
                  )}>
                    {ann.active ? "Active" : "Inactive"}
                  </span>
                  <span className="text-[11px] text-white/40">
                    {new Date(ann.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                </div>
                <p className="text-sm text-white/90 leading-relaxed">{ann.text}</p>
                {(ann.startsAt || ann.endsAt) && (
                  <p className="text-[11px] text-white/40 mt-1.5">
                    {ann.startsAt && <>From {new Date(ann.startsAt).toLocaleDateString("en-IN")}</>}
                    {ann.endsAt && <> · Until {new Date(ann.endsAt).toLocaleDateString("en-IN")}</>}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {/* Toggle active */}
                <button
                  title={ann.active ? "Deactivate" : "Activate"}
                  onClick={async () => {
                    await api.patch(`/announcements/${ann.id}`, { active: !ann.active });
                    globalMutate(SWR_KEY);
                  }}
                  className="p-2 rounded-md border border-line hover:border-accent transition"
                >
                  {ann.active
                    ? <ToggleRight size={16} className="text-ok" />
                    : <ToggleLeft size={16} className="text-white/40" />}
                </button>
                {/* Delete */}
                <button
                  title="Delete"
                  onClick={async () => {
                    if (!confirm("Delete this announcement?")) return;
                    await api.delete(`/announcements/${ann.id}`);
                    globalMutate(SWR_KEY);
                  }}
                  className="p-2 rounded-md border border-line hover:border-bad hover:text-bad transition"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showCreate && (
        <CreateAnnouncementModal
          onClose={(saved) => {
            setShowCreate(false);
            if (saved) globalMutate(SWR_KEY);
          }}
        />
      )}
    </div>
  );
}

function CreateAnnouncementModal({ onClose }: { onClose: (saved?: boolean) => void }) {
  const [form, setForm] = useState({
    text: "",
    level: "info",
    active: true,
    startsAt: "",
    endsAt: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (form.text.trim().length < 5) { setErr("Text must be at least 5 characters."); return; }
    setBusy(true); setErr(null);
    try {
      await api.post("/announcements", {
        text: form.text,
        level: form.level,
        active: form.active,
        startsAt: form.startsAt || undefined,
        endsAt: form.endsAt || undefined,
      });
      onClose(true);
    } catch (e: any) {
      setErr(e?.response?.data?.message || "Failed to create announcement.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-panel p-6 space-y-4">
        <h2 className="font-display text-2xl">New Announcement</h2>

        <Field label="Message Text">
          <textarea
            rows={3}
            className="input resize-none"
            value={form.text}
            onChange={(e) => setForm({ ...form, text: e.target.value })}
            placeholder="Enter announcement text…"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Level">
            <select
              className="input"
              value={form.level}
              onChange={(e) => setForm({ ...form, level: e.target.value })}
            >
              <option value="info">Info</option>
              <option value="warn">Warning</option>
              <option value="promo">Promo</option>
            </select>
          </Field>
          <Field label="Status">
            <select
              className="input"
              value={form.active ? "active" : "inactive"}
              onChange={(e) => setForm({ ...form, active: e.target.value === "active" })}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive (Draft)</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts At (optional)">
            <input
              type="datetime-local"
              className="input"
              value={form.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
            />
          </Field>
          <Field label="Ends At (optional)">
            <input
              type="datetime-local"
              className="input"
              value={form.endsAt}
              onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
            />
          </Field>
        </div>

        {err && (
          <div className="text-xs text-bad bg-bad/15 border border-bad/40 rounded px-3 py-2">
            {err}
          </div>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <button onClick={() => onClose()} className="px-4 py-2 rounded border border-line text-sm">Cancel</button>
          <button
            disabled={busy}
            onClick={submit}
            className="px-4 py-2 rounded bg-accent-grad font-bold text-ink shadow-glow disabled:opacity-50 text-sm"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>

        <style jsx>{`
          :global(.input){width:100%;background:#0d0e15;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:9px 11px;font-size:14px;color:#e6e7eb}
          :global(.input:focus){outline:none;border-color:#ff7a18}
        `}</style>
      </div>
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
