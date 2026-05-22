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
  info:  Info,
  warn:  AlertTriangle,
  promo: Tag,
};

const LEVEL_COLORS: Record<string, string> = {
  info:  "bg-blue-50 text-blue-700 border-blue-200",
  warn:  "bg-yellow-50 text-yellow-700 border-yellow-200",
  promo: "bg-orange-50 text-orange-600 border-orange-200",
};

const SWR_KEY = "/announcements?limit=100";

export default function AdminNotificationsPage() {
  const { data: announcements, isLoading } = useSWR<Announcement[]>(SWR_KEY);
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Announcements</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage site-wide banners and notifications</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-yellow-400 to-amber-500 px-4 py-2 font-bold text-slate-900 shadow-sm hover:brightness-110 transition"
        >
          <Plus size={16} /> New Announcement
        </button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl border border-yellow-100 bg-white p-5 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-1/3 mb-3" />
              <div className="h-3 bg-gray-100 rounded w-2/3" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && (!announcements || announcements.length === 0) && (
        <div className="rounded-xl border border-yellow-100 bg-white p-10 text-center shadow-sm">
          <Bell size={40} className="mx-auto mb-3 text-gray-200" />
          <p className="text-gray-400 text-sm">No announcements yet. Create one above.</p>
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
                "rounded-xl border p-5 flex items-start gap-4 transition bg-white",
                ann.active ? "border-yellow-100" : "border-gray-100 opacity-60",
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
                    ann.active
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-gray-50 text-gray-400 border-gray-200",
                  )}>
                    {ann.active ? "Active" : "Inactive"}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    {new Date(ann.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                </div>
                <p className="text-sm text-gray-800 leading-relaxed">{ann.text}</p>
                {(ann.startsAt || ann.endsAt) && (
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    {ann.startsAt && <>From {new Date(ann.startsAt).toLocaleDateString("en-IN")}</>}
                    {ann.endsAt && <> · Until {new Date(ann.endsAt).toLocaleDateString("en-IN")}</>}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  title={ann.active ? "Deactivate" : "Activate"}
                  onClick={async () => {
                    await api.patch(`/announcements/${ann.id}`, { active: !ann.active });
                    globalMutate(SWR_KEY);
                  }}
                  className="p-2 rounded-md border border-gray-200 hover:border-yellow-300 transition"
                >
                  {ann.active
                    ? <ToggleRight size={16} className="text-emerald-600" />
                    : <ToggleLeft size={16} className="text-gray-400" />}
                </button>
                <button
                  title="Delete"
                  onClick={async () => {
                    if (!confirm("Delete this announcement?")) return;
                    await api.delete(`/announcements/${ann.id}`);
                    globalMutate(SWR_KEY);
                  }}
                  className="p-2 rounded-md border border-gray-200 hover:border-red-300 hover:text-red-500 text-gray-400 transition"
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
  const [form, setForm] = useState({ text: "", level: "info", active: true, startsAt: "", endsAt: "" });
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
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-yellow-100 bg-white p-6 space-y-4 shadow-xl">
        <h2 className="text-xl font-black text-gray-900">New Announcement</h2>

        <Field label="Message Text">
          <textarea
            rows={3}
            className="modal-input resize-none"
            value={form.text}
            onChange={(e) => setForm({ ...form, text: e.target.value })}
            placeholder="Enter announcement text…"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Level">
            <select className="modal-input" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
              <option value="info">Info</option>
              <option value="warn">Warning</option>
              <option value="promo">Promo</option>
            </select>
          </Field>
          <Field label="Status">
            <select className="modal-input" value={form.active ? "active" : "inactive"} onChange={(e) => setForm({ ...form, active: e.target.value === "active" })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive (Draft)</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts At (optional)">
            <input type="datetime-local" className="modal-input" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
          </Field>
          <Field label="Ends At (optional)">
            <input type="datetime-local" className="modal-input" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
          </Field>
        </div>

        {err && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <button onClick={() => onClose()} className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
          <button
            disabled={busy}
            onClick={submit}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-yellow-400 to-amber-500 font-bold text-slate-900 shadow-sm disabled:opacity-50 text-sm hover:brightness-110 transition"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
