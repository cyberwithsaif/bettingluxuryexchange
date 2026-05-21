import Link from "next/link";

const CASINO_GAMES = [
  { name: "Roulette", href: "/roulette", thumb: "/game-thumbs/roulette.webp" },
  { name: "Mines",    href: "/mines",    thumb: "/game-thumbs/mines.webp" },
  { name: "Plinko",   href: "/plinko",   thumb: "/game-thumbs/plinko.webp" },
  { name: "Pump",     href: "/crash",    thumb: "/game-thumbs/balloon.webp" },
];

export default function HomePage() {
  return (
    <div className="w-full px-3 md:px-5 py-4 space-y-5 max-w-[1400px] mx-auto">

        {/* Category cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CategoryCard
            href="/casino"
            title="Casino"
            subtitle="Thousands of Games"
            emoji="🎰"
            gradient="linear-gradient(135deg,#3d0810 0%,#6b0e1a 40%,#1a0408 100%)"
          />
          <CategoryCard
            href="/exchange"
            title="Sports Betting"
            subtitle="Live Markets — Bet Now"
            emoji="🏏"
            gradient="linear-gradient(135deg,#0a1535 0%,#162a60 40%,#040c1a 100%)"
          />
        </div>

        {/* DiamondPlay Originals */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-white tracking-wide">DiamondPlay Originals</h2>
            <div className="flex items-center gap-2">
              <Link href="/casino" className="text-xs text-white font-semibold bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition">
                View All
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3">
            {CASINO_GAMES.map(game => (
              <Link key={game.href} href={game.href} className="group block">
                <div className="relative rounded-2xl overflow-hidden bg-[#1a1433] border border-white/5 group-hover:border-purple-500/40 transition-all duration-300 group-hover:scale-[1.03] group-hover:shadow-xl shadow-black/40">
                  {/* Thumbnail */}
                  <div className="aspect-[3/4] w-full overflow-hidden">
                    <img
                      src={game.thumb}
                      alt={game.name}
                      className="w-full h-full object-cover object-center group-hover:scale-110 transition-transform duration-500"
                    />
                  </div>
                  {/* Name label */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 py-3">
                    <p className="text-white font-bold text-sm tracking-wide uppercase leading-none">{game.name}</p>
                    <p className="text-purple-400 text-[10px] mt-0.5">DiamondPlay</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

    </div>
  );
}

/* ── Category Card ──────────────────────────────────────────── */
function CategoryCard({ href, title, subtitle, emoji, gradient }: {
  href: string; title: string; subtitle: string; emoji: string; gradient: string;
}) {
  return (
    <Link
      href={href}
      className="group block relative rounded-2xl overflow-hidden border border-white/8 hover:border-white/20 transition-all duration-300 hover:scale-[1.02]"
      style={{ background: gradient, minHeight: 140 }}
    >
      <div className="relative z-10 p-5 md:p-6 flex flex-col h-full justify-between" style={{ minHeight: 140 }}>
        <div>
          <h3 className="text-xl md:text-2xl font-black text-white">{title}</h3>
          <p className="text-white/50 text-sm mt-1">{subtitle}</p>
        </div>
        <div className="mt-4">
          <span className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white font-bold px-4 py-2 rounded-full text-sm transition-colors">
            Play Now →
          </span>
        </div>
      </div>
      <div className="absolute right-4 bottom-2 text-7xl md:text-8xl opacity-15 select-none pointer-events-none group-hover:opacity-25 transition-opacity">
        {emoji}
      </div>
    </Link>
  );
}
