import Link from "next/link";
import Image from "next/image";
import { GameCarousel } from "@/components/GameCarousel";

const DEFAULT_CATEGORIES = [
  {
    id: "casino",
    title: "Casino",
    subtitle: "Thousands of Games",
    href: "/casino",
    gradient: "linear-gradient(135deg,#5b21b6 0%,#3b0764 55%,#1a0433 100%)",
    accentColor: "#a78bfa",
    image: "/images/casino-banner.png",
  },
  {
    id: "sports",
    title: "Sports Betting",
    subtitle: "Support Your Team",
    href: "/exchange",
    gradient: "linear-gradient(135deg,#d97706 0%,#92400e 55%,#3d1a00 100%)",
    accentColor: "#fbbf24",
    image: "/images/sports-banner.png",
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {categories.map((cat: any) => (
          <CategoryCard
            key={cat.id || cat.href}
            href={cat.href}
            title={cat.title}
            subtitle={cat.subtitle}
            gradient={cat.gradient}
            accentColor={cat.accentColor}
            image={cat.image}
          />
        ))}
      </div>

      {/* DiamondPlay Originals */}
      <GameCarousel />

    </div>
  );
}

/* ── Category Card ──────────────────────────────────────────── */
function CategoryCard({ href, title, subtitle, gradient, accentColor, image }: {
  href: string;
  title: string;
  subtitle: string;
  gradient: string;
  accentColor?: string;
  image?: string;
}) {
  return (
    <Link
      href={href}
      className="group block relative rounded-3xl overflow-hidden border border-white/10 hover:border-white/20 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl min-h-[160px] md:min-h-[220px]"
    >
      {/* Background gradient base */}
      <div className="absolute inset-0" style={{ background: gradient }} />

      {/* Background image overlay */}
      {image && (
        <div className="absolute inset-0">
          <Image
            src={image}
            alt={title}
            fill
            className="object-cover opacity-70 group-hover:opacity-80 transition-opacity duration-300"
            priority
          />
        </div>
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/40 to-transparent pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 h-full p-4 md:p-6 flex flex-col justify-between">
        <div>
          <p
            className="text-[10px] md:text-[11px] font-bold uppercase tracking-widest mb-2 opacity-70"
            style={{ color: accentColor ?? "#fff" }}
          >
            DiamondPlay
          </p>
          <h3 className="text-xl md:text-3xl font-black text-white leading-tight mb-1">{title}</h3>
          <p className="text-white/70 text-sm md:text-base font-medium">{subtitle}</p>
        </div>

        <div className="mt-4">
          <span
            className="inline-flex items-center gap-1 text-[11px] md:text-[13px] font-bold px-3 md:px-4 py-2 md:py-2.5 rounded-full transition-all group-hover:brightness-110"
            style={{
              background: accentColor ? `${accentColor}33` : "rgba(255,255,255,0.15)",
              color: accentColor ?? "#fff",
              border: `1.5px solid ${accentColor ?? "rgba(255,255,255,0.3)"}`,
              backdropFilter: "blur(8px)",
            }}
          >
            Play Now →
          </span>
        </div>
      </div>
    </Link>
  );
}
