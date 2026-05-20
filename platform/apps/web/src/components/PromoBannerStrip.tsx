"use client";
import Link from "next/link";
import useSWR from "swr";

interface PromoBanner {
  id: string;
  imageUrl: string;
  link?: string;
  title?: string;
  sortOrder: number;
}

export function PromoBannerStrip() {
  const { data: settings, isLoading } = useSWR<{ promoBanners?: PromoBanner[] }>(
    "/api/platform/settings",
    (url: string) => fetch(url).then(r => r.ok ? r.json() : {}),
    { refreshInterval: 300_000 },
  );

  const banners: PromoBanner[] = (settings?.promoBanners ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter(b => b.imageUrl);

  if (isLoading) return <PromoBannerSkeleton />;
  if (!banners.length) return null;

  // Duplicate the list so the CSS marquee loop is seamless
  const items = [...banners, ...banners];

  return (
    <div className="w-full overflow-hidden mb-3 rounded-lg">
      <div className="flex gap-4 promo-strip-scroll" style={{ width: "max-content" }}>
        {items.map((b, i) => {
          const img = (
            <div
              key={`${b.id}-${i}`}
              className="shrink-0 rounded-lg overflow-hidden border border-white/10 hover:border-brandYellow/50 transition-all duration-200 hover:scale-[1.02]"
              style={{ width: 380, height: 180 }}
            >
              <img
                src={b.imageUrl}
                alt={b.title ?? ""}
                className="w-full h-full object-cover"
                draggable={false}
              />
            </div>
          );
          return b.link ? (
            <Link key={`${b.id}-${i}`} href={b.link}>{img}</Link>
          ) : (
            <div key={`${b.id}-${i}`}>{img}</div>
          );
        })}
      </div>

      <style>{`
        .promo-strip-scroll {
          animation: promoScroll 45s linear infinite;
        }
        .promo-strip-scroll:hover {
          animation-play-state: paused;
        }
        @keyframes promoScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

function PromoBannerSkeleton() {
  return (
    <div className="flex gap-4 mb-3 overflow-hidden">
      {[1, 2].map(i => (
        <div key={i} className="shrink-0 rounded-lg animate-pulse bg-white/10 border border-white/5" style={{ width: 380, height: 180 }} />
      ))}
    </div>
  );
}
