"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { cn } from "@/lib/cn";

const DEFAULT_TABS = [
  { href: "/exchange",   label: "EXCHANGE",    emoji: "🎰", enabled: true },
  { href: "/casino",     label: "LIVE CASINO", emoji: "🎲", enabled: true },
  { href: "/crash",      label: "CRASH GAMES", emoji: "🚀", enabled: true },
  { href: "/virtual",    label: "VIRTUAL GAME",emoji: "🎮", enabled: true },
  { href: "/vr-games",   label: "VR GAMES",    emoji: "🥽", enabled: true },
  { href: "/slots",      label: "SLOT GAMES",  emoji: "✨", enabled: true },
  { href: "/lottery",    label: "LOTTERY",     emoji: "🎟️", enabled: true },
  { href: "/sportsbook", label: "SPORTS BOOK", emoji: "🎯", enabled: true },
];

interface NavItem { href: string; label: string; emoji: string; enabled: boolean; }
interface PublicSettings {
  subBanner?: string;
  siteName?: string;
  siteTagline?: string;
  marqueeText?: string;
  navItems?: NavItem[];
}

export function TopNav() {
  const path = usePathname();
  const { data: settings } = useSWR<PublicSettings>("/api/platform/settings", (url) => fetch(url).then(r => r.json()), { refreshInterval: 300_000 });
  const subBanner = settings?.subBanner ?? "Bet Now in Line Market and Get Commission Upto 2%";
  const tabs = (settings?.navItems ?? DEFAULT_TABS).filter(t => t.enabled !== false);

  return (
    <div className="sticky top-16 z-40 shadow-md">
      {/* Main Navigation Bar */}
      <nav className="bg-brandMaroon border-b border-black/20">
        <div className="mx-auto max-w-[1600px] px-2 overflow-x-auto no-scrollbar">
          <ul className="flex items-stretch min-w-max">
            {tabs.map((t) => {
              const active = path === "/" ? t.href === "/exchange" : path?.startsWith(t.href);
              return (
                <li key={t.href} className="relative">
                  <Link
                    href={t.href}
                    className={cn(
                      "flex items-center gap-2 px-6 h-12 text-sm font-bold tracking-wide transition",
                      active
                        ? "text-white bg-brandRed shadow-[inset_0_2px_0_0_#fff]"
                        : "text-white/80 hover:text-white hover:bg-white/5",
                    )}
                  >
                    <span className="text-lg">{t.emoji}</span>
                    {t.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* Sub Banner */}
      <div className="bg-[#4a0815] border-b border-black/30">
        <div className="mx-auto max-w-[1600px] h-8 flex items-center justify-center px-4 overflow-hidden">
          <span className="text-brandYellow font-semibold text-sm animate-pulse">
            {subBanner}
          </span>
        </div>
      </div>
    </div>
  );
}
