"use client";
import Link from "next/link";
import useSWR from "swr";
import { cn } from "@/lib/cn";
import { Star, Search } from "lucide-react";

interface Sport { id: string; key: string; name: string; }

export function SportsSidebar({ active }: { active: string }) {
  const { data: sports } = useSWR<Sport[]>("/markets/sports");
  return (
    <div className="glass rounded-xl p-3 space-y-2">
      <div className="relative">
        <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/40" />
        <input
          placeholder="Search game"
          className="w-full bg-ink/60 border border-line rounded-md pl-7 pr-2 py-2 text-sm placeholder:text-white/40 focus:outline-none focus:border-accent"
        />
      </div>
      <button className="w-full inline-flex items-center gap-2 text-sm px-2 py-2 rounded hover:bg-panel2 text-accentSoft">
        <Star size={14}/> Favourites
      </button>
      <div className="text-[10px] uppercase tracking-wider text-white/40 px-2 pt-2">Sports</div>
      <nav className="space-y-0.5">
        {(sports ?? []).map((s) => (
          <Link
            key={s.id}
            href={`/exchange?sport=${s.key}`}
            className={cn(
              "flex items-center gap-2 px-2 py-2 text-sm rounded-md",
              active === s.key
                ? "bg-accent-grad text-ink font-semibold"
                : "hover:bg-panel2 text-white/80",
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
            {s.name}
          </Link>
        ))}
      </nav>
    </div>
  );
}
