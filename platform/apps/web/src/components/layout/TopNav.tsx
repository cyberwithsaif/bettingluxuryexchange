"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Dices, Gamepad2, Rocket, Trophy, Sparkles, Joystick, Ticket } from "lucide-react";

const tabs = [
  { href: "/exchange",   label: "EXCHANGE",    icon: Trophy },
  { href: "/casino",     label: "LIVE CASINO", icon: Dices },
  { href: "/crash",      label: "CRASH GAMES", icon: Rocket },
  { href: "/virtual",    label: "VIRTUAL GAME",icon: Joystick },
  { href: "/slots",      label: "SLOT GAMES",  icon: Sparkles },
  { href: "/lottery",    label: "LOTTERY",     icon: Ticket },
  { href: "/sportsbook", label: "SPORTS BOOK", icon: Gamepad2 },
] as const;

export function TopNav() {
  const path = usePathname();
  return (
    <div className="sticky top-16 z-40 shadow-md">
      {/* Main Navigation Bar */}
      <nav className="bg-brandMaroon border-b border-black/20">
        <div className="mx-auto max-w-[1600px] px-2 overflow-x-auto no-scrollbar">
          <ul className="flex items-stretch min-w-max">
            {tabs.map((t) => {
              const active = path === "/" ? t.href === "/exchange" : path?.startsWith(t.href);
              const Icon = t.icon;
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
                    <Icon size={16} className={active ? "text-white" : "text-brandYellow"} />
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
            Bet Now in Line Market and Get Comission Upto 2%
          </span>
        </div>
      </div>
    </div>
  );
}
