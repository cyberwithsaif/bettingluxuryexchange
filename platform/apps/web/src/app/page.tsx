import Link from "next/link";
import { GameCarousel } from "@/components/GameCarousel";

const DEFAULT_CATEGORIES = [
  { id: "casino", title: "Casino", subtitle: "Thousands of Games", href: "/casino", emoji: "🎰", gradient: "linear-gradient(135deg,#3d0810 0%,#6b0e1a 40%,#1a0408 100%)" },
  { id: "sports", title: "Sports Betting", subtitle: "Live Markets — Bet Now", href: "/exchange", emoji: "🏏", gradient: "linear-gradient(135deg,#0a1535 0%,#162a60 40%,#040c1a 100%)" },
];

async function getCategoryBanners() {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/platform/settings`,
      { next: { revalidate: 300 } }
    );
    const data = await res.json();
    return data?.categoryBanners || null;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const categoryBanners = await getCategoryBanners();
  const categories = categoryBanners || DEFAULT_CATEGORIES;

  return (
    <div className="w-full px-3 md:px-5 py-4 space-y-5 max-w-[1400px] mx-auto">

      {/* Category cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {categories.map((cat: any) => (
          <CategoryCard
            key={cat.id || cat.href}
            href={cat.href}
            title={cat.title}
            subtitle={cat.subtitle}
            emoji={cat.emoji}
            gradient={cat.gradient}
          />
        ))}
      </div>

      {/* DiamondPlay Originals */}
      <GameCarousel />

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
