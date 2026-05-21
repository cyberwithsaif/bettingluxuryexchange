"use client";

import Link from "next/link";

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

      {/* Scrollable row */}
      <div className="flex gap-2.5 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pb-1">
        {CASINO_GAMES.map(game => (
          <Link
            key={game.href}
            href={game.href}
            className="group block flex-shrink-0 w-[38vw] sm:w-[22vw] lg:w-[calc(14.28%-10px)] max-w-[180px]"
          >
            <div className="relative rounded-2xl overflow-hidden bg-[#1a1433] border border-white/6 group-hover:border-purple-500/40 transition-all duration-300 group-hover:scale-[1.03] group-hover:shadow-xl shadow-black/40">
              {/* Image */}
              <div className="aspect-[3/4] w-full overflow-hidden">
                <img
                  src={game.thumb}
                  alt={game.name}
                  className="w-full h-full object-cover object-center group-hover:scale-110 transition-transform duration-500"
                />
              </div>

              {/* Name overlay */}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent pt-8 pb-2.5 px-2.5">
                <p className="text-white text-[12px] font-bold leading-tight truncate">{game.name}</p>
                <p className="text-white/40 text-[9px] font-semibold tracking-wide mt-0.5">DiamondPlay</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
