"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Dices, Play, Activity } from "lucide-react";
import { cn } from "@/lib/cn";

const PILLS = [
  { href: "/casino",                      label: "Top Casino",  icon: Dices,    color: "text-brandYellow" },
  { href: "/exchange?filter=inplay",      label: "In Play",     icon: Play,     color: "text-green-400" },
  { href: "/exchange?sport=cricket",      label: "Cricket",     icon: Activity, color: "text-white" },
  { href: "/exchange?sport=soccer",       label: "Football",    icon: Activity, color: "text-white" },
  { href: "/exchange?sport=tennis",       label: "Tennis",      icon: Activity, color: "text-white" },
  { href: "/exchange?sport=basketball",   label: "Basketball",  icon: Activity, color: "text-white" },
];

export function MobileCategoryPills() {
  const path = usePathname() ?? "";
  const search = useSearchParams();
  const currentSport = search?.get("sport");
  const currentFilter = search?.get("filter");

  function isActive(href: string) {
    const url = new URL(href, "http://x");
    if (url.pathname !== path) return false;
    const hSport = url.searchParams.get("sport");
    const hFilter = url.searchParams.get("filter");
    if (hSport && hSport !== currentSport) return false;
    if (hFilter && hFilter !== currentFilter) return false;
    if (!hSport && !hFilter && (currentSport || currentFilter)) return false;
    return true;
  }

  return (
    <div className="md:hidden -mx-2 px-2 mb-3 overflow-x-auto no-scrollbar">
      <div className="flex gap-2 min-w-max">
        {PILLS.map(({ href, label, icon: Icon, color }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold whitespace-nowrap transition",
                active
                  ? "bg-brandYellow text-black border-brandYellow"
                  : "bg-black/30 border-white/10 text-white/90 hover:border-brandYellow/50",
              )}
            >
              <Icon size={14} className={active ? "text-black" : color} />
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
