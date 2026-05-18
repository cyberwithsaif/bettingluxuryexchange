"use client";
import useSWR from "swr";
import { Bell, Info, AlertTriangle, Tag } from "lucide-react";
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

const LEVEL_CONFIG = {
  info:  { Icon: Info,          bg: "bg-blue-500/10",   border: "border-blue-500/30",   text: "text-blue-300",    label: "Info" },
  warn:  { Icon: AlertTriangle, bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-300",  label: "Warning" },
  promo: { Icon: Tag,           bg: "bg-accent/10",     border: "border-accent/30",     text: "text-accentSoft",  label: "Promo" },
};

export default function NotificationsPage() {
  const { data, isLoading } = useSWR<Announcement[]>("/announcements/active");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-accent-grad grid place-items-center shadow-glow">
          <Bell size={18} className="text-ink" />
        </div>
        <div>
          <h1 className="font-display text-3xl">Notifications</h1>
          <p className="text-sm text-white/50">Platform announcements and promotions</p>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="glass rounded-xl p-5 animate-pulse">
              <div className="h-4 bg-panel2 rounded w-1/4 mb-3" />
              <div className="h-3 bg-panel2 rounded w-3/4" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && (!data || data.length === 0) && (
        <div className="glass rounded-xl p-10 text-center">
          <Bell size={40} className="mx-auto mb-3 text-white/20" />
          <p className="text-white/50 text-sm">No active notifications right now.</p>
        </div>
      )}

      <div className="space-y-3">
        {(data ?? []).map((ann) => {
          const cfg = LEVEL_CONFIG[ann.level as keyof typeof LEVEL_CONFIG] ?? LEVEL_CONFIG.info;
          const { Icon } = cfg;
          return (
            <div
              key={ann.id}
              className={cn(
                "rounded-xl border p-5 flex gap-4 items-start transition",
                cfg.bg, cfg.border,
              )}
            >
              <div className={cn("mt-0.5 shrink-0", cfg.text)}>
                <Icon size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn("text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border", cfg.text, cfg.border, cfg.bg)}>
                    {cfg.label}
                  </span>
                  <span className="text-[11px] text-white/40">
                    {new Date(ann.createdAt).toLocaleDateString("en-IN", {
                      day: "2-digit", month: "short", year: "numeric",
                    })}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-white/90">{ann.text}</p>
                {(ann.startsAt || ann.endsAt) && (
                  <p className="text-[11px] text-white/40 mt-2">
                    {ann.startsAt && <>From {new Date(ann.startsAt).toLocaleDateString("en-IN")}</>}
                    {ann.endsAt && <> · Until {new Date(ann.endsAt).toLocaleDateString("en-IN")}</>}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
