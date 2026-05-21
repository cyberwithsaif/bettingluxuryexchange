"use client";
import Link from "next/link";
import { X, ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

interface GameCategory {
  id: string;
  label: string;
  icon: string;
  games: { name: string; href: string; icon: string }[];
}

const GAME_CATEGORIES: GameCategory[] = [
  {
    id: "casino",
    label: "Casino",
    icon: "🎰",
    games: [
      { name: "Roulette", href: "/roulette", icon: "🎡" },
      { name: "Mines", href: "/mines", icon: "💣" },
      { name: "Plinko", href: "/plinko", icon: "🟣" },
      { name: "Crash", href: "/crash", icon: "🚀" },
      { name: "Slots", href: "/slots", icon: "🎰" },
      { name: "Mini Games", href: "/mini-games", icon: "💎" },
    ],
  },
  {
    id: "sportsbook",
    label: "Sportsbook",
    icon: "🏆",
    games: [
      { name: "Cricket", href: "/exchange?sport=cricket", icon: "🏏" },
      { name: "Football", href: "/exchange?sport=football", icon: "⚽" },
      { name: "Tennis", href: "/exchange?sport=tennis", icon: "🎾" },
      { name: "Basketball", href: "/exchange?sport=basketball", icon: "🏀" },
      { name: "Table Tennis", href: "/exchange?sport=table-tennis", icon: "🏓" },
      { name: "Horse Racing", href: "/exchange?sport=horse-racing", icon: "🏇" },
      { name: "Greyhound", href: "/exchange?sport=greyhound", icon: "🐕" },
      { name: "Volleyball", href: "/exchange?sport=volleyball", icon: "🏐" },
      { name: "Snooker", href: "/exchange?sport=snooker", icon: "🎱" },
    ],
  },
];

export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [expanded, setExpanded] = useState<string | null>("casino");

  const toggleCategory = (id: string) => {
    setExpanded(expanded === id ? null : id);
  };

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
          "md:hidden fixed top-0 left-0 bottom-0 z-[61] w-[85%] max-w-[320px] bg-[#0f0810] border-r border-white/10 shadow-2xl transition-transform overflow-y-auto",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Header */}
        <div className="sticky top-0 h-14 flex items-center justify-between px-4 bg-gradient-to-r from-purple-900 to-purple-800 border-b border-white/10">
          <span className="font-bold text-sm text-white uppercase tracking-wider">
            Menu
          </span>
          <button onClick={onClose} className="text-white/90 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Categories */}
        <nav className="py-2">
          {GAME_CATEGORIES.map((cat) => (
            <div key={cat.id} className="border-b border-white/5">
              {/* Category header */}
              <button
                onClick={() => toggleCategory(cat.id)}
                className="w-full flex items-center justify-between px-4 py-3 bg-purple-900/30 hover:bg-purple-900/40 transition border-b border-white/5"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{cat.icon}</span>
                  <span className="font-semibold text-white text-sm">{cat.label}</span>
                </div>
                <ChevronDown
                  size={18}
                  className={cn(
                    "text-white/60 transition-transform",
                    expanded === cat.id ? "rotate-180" : ""
                  )}
                />
              </button>

              {/* Games list */}
              {expanded === cat.id && (
                <ul className="bg-black/40">
                  {cat.games.map((game) => (
                    <li key={game.href}>
                      <Link
                        href={game.href}
                        onClick={onClose}
                        className="flex items-center gap-3 px-6 py-2.5 text-sm font-medium text-white/80 hover:text-white hover:bg-white/5 transition border-b border-white/5"
                      >
                        <span className="text-base w-5 text-center">{game.icon}</span>
                        {game.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
