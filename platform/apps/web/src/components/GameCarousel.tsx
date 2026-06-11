"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef } from "react";

const CASINO_GAMES = [
  { name: "Roulette", href: "/roulette", thumb: "/game-thumbs/opt/roulette.webp" },
  { name: "Mines",    href: "/mines",    thumb: "/game-thumbs/opt/mines.webp" },
  { name: "Plinko",   href: "/plinko",   thumb: "/game-thumbs/opt/plinko.webp" },
  { name: "Pump",     href: "/pump",     thumb: "/game-thumbs/opt/baloon.webp" },
  { name: "Dice",     href: "/dice",     thumb: "/game-thumbs/opt/dice.webp" },
  { name: "Towers",   href: "/towers",   thumb: "/game-thumbs/opt/towers.webp" },
  { name: "Chicken Road", href: "/chicken-road", thumb: "/game-thumbs/opt/chicken-road.webp" },
  { name: "Coinflip", href: "/coinflip", thumb: "/game-thumbs/opt/coin.webp" },
];

export function GameCarousel() {
  const scrollRef   = useRef<HTMLDivElement>(null);
  const isTouching  = useRef(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || window.innerWidth >= 640) return;

    let pos = 0;
    let raf: number;

    const tick = () => {
      if (!isTouching.current) {
        const max = el.scrollWidth - el.clientWidth;
        pos += 0.6;
        if (pos >= max) pos = 0;
        el.scrollLeft = pos;
      }
      raf = requestAnimationFrame(tick);
    };

    const onTouchStart = () => {
      isTouching.current = true;
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };

    const onTouchEnd = () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
      resumeTimer.current = setTimeout(() => {
        pos = el.scrollLeft;
        isTouching.current = false;
      }, 1200);
    };

    el.addEventListener("touchstart",  onTouchStart, { passive: true });
    el.addEventListener("touchend",    onTouchEnd,   { passive: true });
    el.addEventListener("touchcancel", onTouchEnd,   { passive: true });

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
      el.removeEventListener("touchstart",  onTouchStart);
      el.removeEventListener("touchend",    onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  return (
    <section>
      <div className="flex items-center justify-between mb-3 px-0.5">
        <h2 className="text-sm font-bold text-white tracking-wide">DiamondPlay Originals</h2>
        <Link
          href="/casino"
          className="text-[11px] font-bold text-white/70 bg-white/8 hover:bg-white/15 border border-white/10 px-3 py-1.5 rounded-full transition"
        >
          View All
        </Link>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-2 sm:gap-3 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] -mx-2 px-2 pb-1"
        style={{ touchAction: "pan-x" }}
      >
        {CASINO_GAMES.map((game, i) => (
          <Link key={game.href} href={game.href} className="group block flex-shrink-0 sm:w-[calc(16.666%-10px)] lg:w-[calc(12.5%-11px)]">

            {/* Mobile: 88px × 4/5 */}
            <div
              className="sm:hidden relative rounded-xl overflow-hidden border border-white/10 group-hover:border-yellow-400/60 transition shadow-md"
              style={{ width: 88, aspectRatio: "4/5" }}
            >
              <Image
                src={game.thumb}
                alt={game.name}
                fill
                sizes="88px"
                quality={85}
                priority={i < 4}
                className="object-cover"
                draggable={false}
              />
            </div>

            {/* Tablet / Desktop: portrait card */}
            <div className="hidden sm:block relative rounded-2xl overflow-hidden bg-[#1a1433] border border-white/6 group-hover:border-purple-500/40 transition-all duration-300 group-hover:scale-[1.03] group-hover:shadow-xl shadow-black/40">
              <div className="relative aspect-[3/4] w-full">
                <Image
                  src={game.thumb}
                  alt={game.name}
                  fill
                  sizes="(max-width: 1024px) 22vw, 14vw"
                  quality={85}
                  priority={i < 4}
                  className="object-cover group-hover:scale-110 transition-transform duration-500"
                />
              </div>
            </div>

          </Link>
        ))}
      </div>
    </section>
  );
}
