import Link from "next/link";

/* ── Game cards ────────────────────────────────────────────── */

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
