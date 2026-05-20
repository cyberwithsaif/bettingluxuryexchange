"use client";
import Link from "next/link";
import useSWR from "swr";
import { useRef, useState } from "react";

interface PromoBanner {
  id: string;
  imageUrl: string;
  link?: string;
  title?: string;
  sortOrder: number;
}

export function PromoBannerStrip() {
  const { data: settings, isLoading } = useSWR<{ promoBanners?: PromoBanner[], promoBannerSpeed?: number }>(
    "/api/platform/settings",
    (url: string) => fetch(url).then(r => r.ok ? r.json() : {}),
    { refreshInterval: 300_000 },
  );

  const banners: PromoBanner[] = (settings?.promoBanners ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter(b => b.imageUrl);

  const speed = settings?.promoBannerSpeed ?? 45;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef({ isDragging: false, startX: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    dragStateRef.current.isDragging = true;
    dragStateRef.current.startX = "touches" in e ? (e.touches[0]?.clientX ?? 0) : e.clientX;
    setIsDragging(true);
  };

  const handleDragMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!dragStateRef.current.isDragging || !scrollerRef.current) return;
    const clientX = "touches" in e ? (e.touches[0]?.clientX ?? 0) : e.clientX;
    const delta = clientX - dragStateRef.current.startX;
    scrollerRef.current.style.transform = `translateX(${delta}px)`;
  };

  const handleDragEnd = () => {
    dragStateRef.current.isDragging = false;
    setIsDragging(false);
    if (scrollerRef.current) {
      scrollerRef.current.style.transform = "";
    }
  };

  if (isLoading) return <PromoBannerSkeleton />;
  if (!banners.length) return null;

  const items = [...banners, ...banners];

  return (
    <div
      className="w-full overflow-hidden mb-3 rounded-lg"
      onMouseDown={handleDragStart}
      onMouseMove={handleDragMove}
      onMouseUp={handleDragEnd}
      onMouseLeave={handleDragEnd}
      onTouchStart={handleDragStart}
      onTouchMove={handleDragMove}
      onTouchEnd={handleDragEnd}
      style={{ cursor: isDragging ? "grabbing" : "grab" }}
    >
      <div
        ref={scrollerRef}
        className={`flex gap-4 ${!isDragging ? "promo-strip-scroll" : ""}`}
        style={{
          width: "max-content",
          animation: !isDragging ? `promoScroll ${speed}s linear infinite` : "none",
        }}
      >
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
