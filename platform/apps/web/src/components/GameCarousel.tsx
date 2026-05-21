"use client";

import Link from "next/link";
import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const CASINO_GAMES = [
  { name: "Roulette", href: "/roulette", thumb: "/game-thumbs/roulette2.png" },
  { name: "Mines",    href: "/mines",    thumb: "/game-thumbs/mines2.png" },
  { name: "Plinko",   href: "/plinko",   thumb: "/game-thumbs/plinko2.png" },
  { name: "Pump",     href: "/crash",    thumb: "/game-thumbs/pump.png" },
  { name: "Dice",     href: "/dice",     thumb: "/game-thumbs/dice.png" },
  { name: "Towers",   href: "/towers",   thumb: "/game-thumbs/towers.png" },
  { name: "Coinflip", href: "/coinflip", thumb: "/game-thumbs/coinflip.png" },
];

export function GameCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -300 : 300, behavior: "smooth" });
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-white tracking-wide">DiamondPlay Originals</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => scroll("left")}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 transition"
            aria-label="Previous"
          >
            <ChevronLeft size={18} className="text-white" />
          </button>
          <button
            onClick={() => scroll("right")}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 transition"
            aria-label="Next"
          >
            <ChevronRight size={18} className="text-white" />
          </button>
          <Link href="/casino" className="text-xs text-white font-semibold bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition">
            View All
          </Link>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-2 md:gap-3 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {CASINO_GAMES.map(game => (
          <Link
            key={game.href}
            href={game.href}
            className="group block flex-shrink-0 w-[calc(25%-6px)] sm:w-[calc(20%-6px)] lg:w-[calc(14.28%-9px)]"
          >
            <div className="relative rounded-2xl overflow-hidden bg-[#1a1433] border border-white/5 group-hover:border-purple-500/40 transition-all duration-300 group-hover:scale-[1.03] group-hover:shadow-xl shadow-black/40">
              <div className="aspect-[3/4] w-full overflow-hidden">
                <img
                  src={game.thumb}
                  alt={game.name}
                  className="w-full h-full object-cover object-center group-hover:scale-110 transition-transform duration-500"
                />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
