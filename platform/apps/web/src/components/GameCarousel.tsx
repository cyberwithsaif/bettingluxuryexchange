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
  const scrollRef  = useRef<HTMLDivElement>(null);
  const pausedRef  = useRef(false);
  const scrollPos  = useRef(0);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || window.innerWidth >= 640) return;

    const resume = () => {
      // sync scrollPos with actual position after manual drag
      scrollPos.current = container.scrollLeft;
      setTimeout(() => { pausedRef.current = false; }, 1000);
    };

    const pause = () => { pausedRef.current = true; };

    container.addEventListener("touchstart", pause,  { passive: true });
    container.addEventListener("touchend",   resume, { passive: true });
    container.addEventListener("mousedown",  pause,  { passive: true });
    container.addEventListener("mouseup",    resume, { passive: true });

    scrollPos.current = container.scrollLeft;

    const interval = setInterval(() => {
      if (pausedRef.current) return;
      const maxScroll = container.scrollWidth - container.clientWidth;
      scrollPos.current += 0.5;
      if (scrollPos.current > maxScroll) scrollPos.current = 0;
      container.scrollLeft = scrollPos.current;
    }, 30);

    return () => {
      clearInterval(interval);
      container.removeEventListener("touchstart", pause);
      container.removeEventListener("touchend",   resume);
      container.removeEventListener("mousedown",  pause);
      container.removeEventListener("mouseup",    resume);
    };
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
        className="flex gap-2 sm:gap-3 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] -mx-2 px-2 pb-1"
        style={{ touchAction: "pan-x" }}
      >
        {CASINO_GAMES.map(game => (
          <Link
            key={game.href}
            href={game.href}
            className="group block flex-shrink-0 sm:w-[calc(20%-10px)] lg:w-[calc(14.28%-10px)]"
            // Mobile: 100px wide, 4/5 aspect — matches MobileTopCasinoStrip
            style={{ width: undefined }}
          >
            {/* Mobile card */}
            <div
              className="sm:hidden relative rounded-xl overflow-hidden border border-white/10 group-hover:border-yellow-400/60 transition-all duration-200 shadow-md"
              style={{ width: 100, aspectRatio: "4/5" }}
            >
              <img
                src={game.thumb}
                alt={game.name}
                draggable={false}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill" }}
              />
            </div>

            {/* Tablet / Desktop card */}
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
