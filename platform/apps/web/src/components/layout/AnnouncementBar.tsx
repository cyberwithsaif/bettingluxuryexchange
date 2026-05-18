"use client";
import { Megaphone } from "lucide-react";
import useSWR from "swr";

const FALLBACK = [
  "Welcome to Exch — premium betting exchange.",
  "Bet now in Line Markets — get up to 2% commission.",
  "New Crash game launched: Jet X. Try it now.",
  "Bet responsibly. 18+. Gambling can be addictive.",
];

interface Announcement {
  id: string;
  text: string;
  level: string;
}

export function AnnouncementBar() {
  const { data } = useSWR<Announcement[]>("/announcements/active", { refreshInterval: 60_000 });
  const items = data && data.length > 0 ? data.map((a) => a.text) : FALLBACK;

  return (
    <div className="bg-accent-grad text-ink overflow-hidden">
      <div className="mx-auto max-w-[1600px] h-9 flex items-center">
        <div className="px-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider shrink-0 border-r border-ink/30">
          <Megaphone size={14} /> Live
        </div>
        <div className="overflow-hidden flex-1">
          <div className="whitespace-nowrap animate-marquee flex gap-12 px-6 text-sm font-semibold">
            {[...items, ...items].map((t, i) => (
              <span key={i}>• {t}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
