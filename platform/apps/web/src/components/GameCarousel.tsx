"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

const CASINO_GAMES = [
  { name: "Roulette", href: "/roulette", thumb: "/game-thumbs/roulette2.png" },
  { name: "Mines",    href: "/mines",    thumb: "/game-thumbs/mines2.png" },
  { name: "Plinko",   href: "/plinko",   thumb: "/game-thumbs/plinko2.png" },
  { name: "Pump",     href: "/pump",     thumb: "/game-thumbs/pump.png" },
  { name: "Dice",     href: "/dice",     thumb: "/game-thumbs/dice.png" },
  { name: "Towers",   href: "/towers",   thumb: "/game-thumbs/towers.png" },
  { name: "Coinflip", href: "/coinflip", thumb: "/game-thumbs/coinflip.png" },
];

export function GameCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    let scrollPos = 0;
    const scrollSpeed = 1;
    const maxScroll = container.scrollWidth - container.clientWidth;

    const interval = setInterval(() => {
      scrollPos += scrollSpeed;
      if (scrollPos > maxScroll) scrollPos = 0;
      container.scrollLeft = scrollPos;
    }, 30);

    return () => clearInterval(interval);
  }, []);

  return (
    <section>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-0.5">
        <h2 className="text-sm font-bold text-white tracking-wide">DiamondPlay Originals</h2>
        <Link
          href="/casino"
          className="text-[11px] font-bold text-white/70 bg-white/8 hover:bg-white/15 border border-white/10 px-3 py-1.5 rounded-full transition"
        >
          View All
        </Link>
      </div>

      {/* Auto-scrolling carousel */}
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {CASINO_GAMES.map(game => (
          <Link
            key={game.href}
            href={game.href}
            className="group block flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden border border-white/10 hover:border-purple-500/40 transition-all duration-200 hover:scale-105 hover:shadow-lg shadow-black/40"
          >
            <img
              src={game.thumb}
              alt={game.name}
              className="w-full h-full object-cover object-center group-hover:scale-110 transition-transform duration-300"
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
