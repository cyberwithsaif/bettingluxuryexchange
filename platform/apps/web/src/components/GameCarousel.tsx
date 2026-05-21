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

  // Auto-scroll on mobile only
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || window.innerWidth >= 640) return;

    let scrollPos = 0;
    const maxScroll = container.scrollWidth - container.clientWidth;

    const interval = setInterval(() => {
      scrollPos += 0.5;
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

      {/* Carousel */}
      <div
        ref={scrollRef}
        className="flex gap-2 sm:gap-3 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {CASINO_GAMES.map(game => (
          <Link
            key={game.href}
            href={game.href}
            // Mobile: small square — Tablet/Desktop: original portrait card size
            className="group block flex-shrink-0 w-[72px] h-[72px] sm:w-[calc(20%-10px)] sm:h-auto lg:w-[calc(14.28%-10px)]"
          >
            {/* Mobile: square thumb */}
            <div className="sm:hidden w-full h-full rounded-lg overflow-hidden border border-white/8 group-hover:border-purple-500/40 transition-all duration-200 group-hover:scale-105">
              <img
                src={game.thumb}
                alt={game.name}
                className="w-full h-full object-cover object-center"
              />
            </div>

            {/* Tablet / Desktop: portrait card, no text */}
            <div className="hidden sm:block relative rounded-2xl overflow-hidden bg-[#1a1433] border border-white/6 group-hover:border-purple-500/40 transition-all duration-300 group-hover:scale-[1.03] group-hover:shadow-xl shadow-black/40">
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
