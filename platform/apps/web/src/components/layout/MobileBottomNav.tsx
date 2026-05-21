"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, Gamepad2, Trophy, MessageCircle } from "lucide-react";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "#",       label: "Menu",   icon: Menu },
  { href: "#",       label: "Search", icon: Search },
  { href: "/casino", label: "Casino", icon: Gamepad2 },
  { href: "/exchange",   label: "Sports", icon: Trophy },
  { href: "#",       label: "Chat",   icon: MessageCircle },
];

export function MobileBottomNav() {
  const path = usePathname() ?? "";
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-[#191a38] border-t border-white/5 shadow-[0_-2px_8px_rgba(0,0,0,0.3)]">
      <ul className="grid grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = path === href || (href === "/exchange" && path === "/");
          return (
            <li key={href}>
              <Link
                href={href}
                className="flex flex-col items-center justify-center gap-0.5 py-2 transition"
              >
                <Icon
                  size={20}
                  strokeWidth={1.5}
                  className={cn(
                    "transition-colors duration-200",
                    active ? "text-white" : "text-white/50",
                  )}
                />
                <span
                  className={cn(
                    "text-[8px] font-semibold leading-tight transition-colors duration-200",
                    active ? "text-white" : "text-white/50",
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
