"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Dices, Gamepad2, Rocket, Trophy, Sparkles, Joystick, Ticket } from "lucide-react";

const tabs = [
  { href: "/exchange",   label: "Exchange",    icon: Trophy },
  { href: "/casino",     label: "Live Casino", icon: Dices },
  { href: "/crash",      label: "Crash Games", icon: Rocket },
  { href: "/virtual",    label: "Virtual",     icon: Joystick },
  { href: "/slots",      label: "Slot Games",  icon: Sparkles },
  { href: "/lottery",    label: "Lottery",     icon: Ticket },
  { href: "/sportsbook", label: "Sportsbook",  icon: Gamepad2 },
] as const;

export function TopNav() {
  const path = usePathname();
  return (
    <nav className="border-b border-line bg-panel/70 backdrop-blur sticky top-14 z-40">
      <div className="mx-auto max-w-[1600px] px-2 overflow-x-auto no-scrollbar">
        <ul className="flex items-stretch min-w-max">
          {tabs.map((t) => {
            const active = path?.startsWith(t.href);
            const Icon = t.icon;
            return (
              <li key={t.href} className="relative">
                <Link
                  href={t.href}
                  className={cn(
                    "flex items-center gap-2 px-5 h-12 text-sm font-bold uppercase tracking-wider transition",
                    active
                      ? "text-ink bg-accent-grad"
                      : "text-white/75 hover:text-accentSoft hover:bg-panel2/60",
                  )}
                >
                  <Icon size={16}/>
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
