import Link from "next/link";
import { GameCarousel } from "@/components/GameCarousel";

const DEFAULT_CATEGORIES = [
  {
    id: "casino",
    title: "Casino",
    subtitle: "Thousands of games",
    href: "/casino",
    emoji: "🎰",
    gradient: "linear-gradient(135deg,#5b21b6 0%,#3b0764 55%,#1a0433 100%)",
    accentColor: "#a78bfa",
  },
  {
    id: "sports",
    title: "Sports Betting",
    subtitle: "Live markets — bet now",
    href: "/exchange",
    emoji: "🏏",
    gradient: "linear-gradient(135deg,#d97706 0%,#92400e 55%,#3d1a00 100%)",
    accentColor: "#fbbf24",
  },
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
    <div className="w-full px-3 md:px-5 py-4 space-y-6 max-w-[1400px] mx-auto">

      {/* Category cards */}
      <div className="grid grid-cols-2 gap-3">
        {categories.map((cat: any) => (
          <CategoryCard
            key={cat.id || cat.href}
            href={cat.href}
            title={cat.title}
            subtitle={cat.subtitle}
            emoji={cat.emoji}
            gradient={cat.gradient}
            accentColor={cat.accentColor}
          />
        ))}
      </div>

      {/* DiamondPlay Originals */}
      <GameCarousel />

    </div>
  );
}

/* ── Category Card ──────────────────────────────────────────── */
function CategoryCard({ href, title, subtitle, emoji, gradient, accentColor }: {
  href: string;
  title: string;
  subtitle: string;
  emoji: string;
  gradient: string;
  accentColor?: string;
}) {
  return (
    <Link
      href={href}
      className="group block relative rounded-2xl overflow-hidden border border-white/10 hover:border-white/25 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl"
      style={{ background: gradient, minHeight: '100px', '@media (min-width: 768px)': { minHeight: '160px' } } as any}
    >
      {/* Shine overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/8 to-transparent pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 p-3 md:p-4 flex flex-col h-full" style={{ minHeight: 'inherit' }}>
        <div className="flex-1">
          <p
            className="text-[9px] md:text-[10px] font-bold uppercase tracking-widest mb-0.5 md:mb-1 opacity-70"
            style={{ color: accentColor ?? "#fff" }}
          >
            DiamondPlay
          </p>
          <h3 className="text-sm md:text-2xl font-black text-white leading-tight">{title}</h3>
          <p className="text-white/45 text-[9px] md:text-[11px] mt-0.5 md:mt-1 leading-tight hidden md:block">{subtitle}</p>
        </div>
        <div className="mt-2 md:mt-3">
          <span
            className="inline-flex items-center gap-1 text-[9px] md:text-[11px] font-bold px-2 md:px-3 py-1 md:py-1.5 rounded-full transition-opacity group-hover:opacity-90"
            style={{
              background: accentColor ? `${accentColor}22` : "rgba(255,255,255,0.12)",
              color: accentColor ?? "#fff",
              border: `1px solid ${accentColor ?? "rgba(255,255,255,0.2)"}55`,
            }}
          >
            Play Now →
          </span>
        </div>
      </div>

      {/* Decorative emoji */}
      <div className="absolute right-1 bottom-0 text-4xl md:text-6xl lg:text-7xl select-none pointer-events-none opacity-25 md:opacity-30 group-hover:opacity-45 transition-opacity duration-300 drop-shadow-2xl">
        {emoji}
      </div>
    </Link>
  );
}
