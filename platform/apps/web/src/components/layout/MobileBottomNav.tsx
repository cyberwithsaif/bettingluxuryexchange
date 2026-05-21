"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Gamepad2, CircleDollarSign, Trophy, User } from "lucide-react";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/exchange",     label: "Home",    icon: Home },
  { href: "/casino",       label: "Casino",  icon: Gamepad2 },
  { href: "/account/bets", label: "Bet",     icon: CircleDollarSign, featured: true },
  { href: "/sportsbook",   label: "Sports",  icon: Trophy },
  { href: "/account",      label: "Account", icon: User },
];

export function MobileBottomNav() {
  const path = usePathname() ?? "";
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-[#0e1117] border-t border-white/10 shadow-[0_-4px_24px_rgba(0,0,0,0.7)]">
      <ul className="grid grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon, featured }) => {
          const active = path === href || (href === "/exchange" && path === "/");
          return (
            <li key={href}>
              <Link
                href={href}
                className="flex flex-col items-center justify-center gap-0.5 py-2.5 transition"
              >
                <div
                  className={cn(
                    "flex items-center justify-center w-10 h-7 rounded-xl transition-all duration-200",
                    active
                      ? "bg-amber-400/15"
                      : featured
                      ? "bg-amber-500/10"
                      : "",
                  )}
                >
                  <Icon
                    size={featured ? 22 : 20}
                    strokeWidth={2}
                    className={cn(
                      "transition-colors duration-200",
                      active
                        ? "text-amber-400"
                        : featured
                        ? "text-amber-500/70"
                        : "text-white/40",
                    )}
                  />
                </div>
                <span
                  className={cn(
                    "text-[9px] font-semibold leading-tight tracking-wide transition-colors duration-200",
                    active ? "text-amber-400" : "text-white/35",
                  )}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
