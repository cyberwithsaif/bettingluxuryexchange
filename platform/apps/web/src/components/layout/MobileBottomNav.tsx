"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Trophy, Receipt, Dices, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/exchange",          label: "Home",         icon: Home },
  { href: "/sportsbook",        label: "Sports Book",  icon: Trophy },
  { href: "/account/bets",      label: "Bet",          icon: Receipt },
  { href: "/casino",            label: "Casino",       icon: Dices },
  { href: "/account/statement", label: "Transactions", icon: ArrowLeftRight },
];

export function MobileBottomNav() {
  const path = usePathname() ?? "";
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-brandRed border-t border-black/30 shadow-[0_-2px_8px_rgba(0,0,0,0.4)]">
      <ul className="grid grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = path === href || (href === "/exchange" && path === "/");
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold transition",
                  active ? "text-brandYellow" : "text-white/85 hover:text-white",
                )}
              >
                <Icon size={20} strokeWidth={2.2} />
                <span className="leading-tight">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
