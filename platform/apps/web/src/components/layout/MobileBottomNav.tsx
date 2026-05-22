"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Search, Gamepad2, Trophy, MessageCircle } from "lucide-react";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/",       label: "Home",   icon: House },
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
          const active = path === href || (href !== "/" && path.startsWith(href));
          return (
            <li key={href}>
              <Link
                href={href}
                className="flex flex-col items-center justify-center gap-1 py-3 transition"
              >
                <Icon
                  size={24}
                  fill={active ? "url(#gold-gradient)" : "#9689cc"}
                  stroke="none"
                />
                <span
                  className="text-[10px] font-bold leading-tight transition-colors duration-200"
                  style={{ color: active ? "#ffcc00" : "#9689cc" }}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {/* SVG gradient definition */}
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <linearGradient id="gold-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffcc00" />
            <stop offset="100%" stopColor="#ffb700" />
          </linearGradient>
        </defs>
      </svg>
    </nav>
  );
}
