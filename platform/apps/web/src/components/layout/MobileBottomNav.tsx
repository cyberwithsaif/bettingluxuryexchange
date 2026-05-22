"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Search, Gamepad2, Trophy, MessageCircle } from "lucide-react";

const ITEMS = [
  { href: "/",         label: "Home",   logo: true },
  { href: "#",         label: "Search", icon: Search },
  { href: "/casino",   label: "Casino", icon: Gamepad2 },
  { href: "/exchange", label: "Sports", icon: Trophy },
  { href: "#",         label: "Chat",   icon: MessageCircle },
] as const;

export function MobileBottomNav() {
  const path = usePathname() ?? "";
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-[#191a38] border-t border-white/5 shadow-[0_-2px_8px_rgba(0,0,0,0.3)]">
      <ul className="grid grid-cols-5">
        {ITEMS.map(({ href, label, ...rest }) => {
          const active = path === href || (href !== "/" && path.startsWith(href));
          const isLogo = "logo" in rest && rest.logo;
          const Icon = "icon" in rest ? rest.icon : null;
          return (
            <li key={href}>
              <Link
                href={href}
                className="flex flex-col items-center justify-center gap-1 py-3 transition"
              >
                {isLogo ? (
                  <Image
                    src="/logo.png"
                    alt="Home"
                    width={28}
                    height={28}
                    className="rounded-full"
                    style={{ opacity: active ? 1 : 0.65 }}
                  />
                ) : Icon ? (
                  <Icon
                    size={24}
                    fill={active ? "url(#gold-gradient)" : "#9689cc"}
                    stroke="none"
                  />
                ) : null}
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
