"use client";
import Link from "next/link";
import useSWR from "swr";
import { useEffect } from "react";
import { X } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth";
import { cn } from "@/lib/cn";

interface NavItem { href: string; label: string; emoji: string; enabled: boolean; }
interface PublicSettings { siteName?: string; navItems?: NavItem[] }

const DEFAULT_TABS: NavItem[] = [
  { href: "/exchange",    label: "Exchange",          emoji: "🎰", enabled: true },
  { href: "/casino",      label: "Live Casino",       emoji: "🎲", enabled: true },
  { href: "/crash",       label: "Crash Games",       emoji: "🚀", enabled: true },
  { href: "/mini-games",  label: "Diamond Mini Games", emoji: "💎", enabled: true },
  { href: "/virtual",     label: "Virtual Game",      emoji: "🎮", enabled: true },
  { href: "/vr-games",    label: "VR Games",          emoji: "🥽", enabled: true },
  { href: "/slots",       label: "Slot Games",        emoji: "✨", enabled: true },
  { href: "/lottery",     label: "Lottery",           emoji: "🎟️", enabled: true },
  { href: "/sportsbook",  label: "Sports Book",       emoji: "🎯", enabled: true },
];

export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: settings } = useSWR<PublicSettings>(
    "/api/platform/settings",
    (url: string) => fetch(url).then(r => r.ok ? r.json() : {}),
  );
  const tabs = (settings?.navItems ?? DEFAULT_TABS).filter(t => t.enabled !== false);
  const user = useAuthStore(s => s.user);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <div
        className={cn(
          "md:hidden fixed inset-0 z-[60] bg-black/60 transition-opacity",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "md:hidden fixed top-0 left-0 bottom-0 z-[61] w-[78%] max-w-[320px] bg-[#1a0309] border-r border-white/10 shadow-2xl transition-transform",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="h-14 flex items-center justify-between px-4 bg-brandRed">
          <span className="font-display italic text-xl font-black tracking-tight text-white uppercase">
            {settings?.siteName ?? "Future9"}
          </span>
          <button onClick={onClose} className="text-white/90 hover:text-white">
            <X size={22} />
          </button>
        </div>

        {user && (
          <div className="px-4 py-3 border-b border-white/10 bg-black/30">
            <p className="text-[11px] text-white/60 uppercase tracking-wider">Signed in as</p>
            <p className="text-sm font-bold text-white">{user.username}</p>
          </div>
        )}

        <nav className="overflow-y-auto pb-6">
          <ul>
            {tabs.map((t) => (
              <li key={t.href}>
                <Link
                  href={t.href}
                  onClick={onClose}
                  className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-white/90 hover:bg-white/5 border-b border-white/5"
                >
                  <span className="text-lg w-6 text-center">{t.emoji}</span>
                  {t.label}
                </Link>
              </li>
            ))}
          </ul>
          {user && (
            <ul className="mt-4 border-t border-white/10">
              <li className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-widest text-white/40">Account</li>
              {([
                ["Dashboard", "/account"],
                ["My Bets", "/account/bets"],
                ["Statement", "/account/statement"],
                ["Profit / Loss", "/account/pl"],
                ["Notifications", "/account/notifications"],
                ["Security & 2FA", "/account/security"],
              ] as const).map(([l, h]) => (
                <li key={h}>
                  <Link
                    href={h}
                    onClick={onClose}
                    className="block px-4 py-2.5 text-sm font-medium text-white/85 hover:bg-white/5"
                  >
                    {l}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </nav>
      </aside>
    </>
  );
}
