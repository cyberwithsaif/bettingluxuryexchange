"use client";
import Link from "next/link";
import useSWR from "swr";
import { useRef, useState, useEffect } from "react";

interface PromoBanner {
  id: string;
  imageUrl: string;
  link?: string;
  title?: string;
  sortOrder: number;
}

export function PromoBannerStrip() {
  const { data: settings, isLoading } = useSWR<{ promoBanners?: PromoBanner[]; promoBannerSpeed?: number }>(
    "/api/platform/settings",
    (url: string) => fetch(url).then(r => r.ok ? r.json() : {}),
    { refreshInterval: 300_000 },
  );

  const banners: PromoBanner[] = (settings?.promoBanners ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter(b => b.imageUrl);

  const speed = settings?.promoBannerSpeed ?? 45;
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const dragRef = useRef({ active: false, startX: 0, startScroll: 0 });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !banners.length) return;

    // Wait one frame so scrollWidth is correct after render
    const frameId = requestAnimationFrame(() => {
      const halfWidth = el.scrollWidth / 2;
      if (halfWidth <= 0) return;

      const pxPerMs = halfWidth / (speed * 1000);
      let last = 0;

      function tick(ts: number) {
        if (!dragRef.current.active) {
          const dt = last ? ts - last : 0;
          last = ts;
          if (el) {
            el.scrollLeft += pxPerMs * dt;
            // Seamless loop: reset when we've scrolled one full copy
            if (el.scrollLeft >= halfWidth) {
              el.scrollLeft -= halfWidth;
            }
          }
        } else {
          last = ts; // keep last updated so delta is 0 on resume
        }
        rafRef.current = requestAnimationFrame(tick);
      }

      rafRef.current = requestAnimationFrame(tick);
    });

    return () => {
      cancelAnimationFrame(frameId);
      cancelAnimationFrame(rafRef.current);
    };
  }, [banners.length, speed]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startScroll: containerRef.current?.scrollLeft ?? 0,
    };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active || !containerRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    containerRef.current.scrollLeft = dragRef.current.startScroll - dx;
  };

  const onPointerUp = () => {
    dragRef.current.active = false;
    setDragging(false);
  };

  if (isLoading) return <PromoBannerSkeleton />;
  if (!banners.length) return null;

  const items = [...banners, ...banners];

  return (
    <>
      <div
        ref={containerRef}
        className="w-full mb-3 rounded-lg overflow-x-scroll promo-no-scrollbar"
        style={{ cursor: dragging ? "grabbing" : "grab", userSelect: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div className="flex gap-2 md:gap-4" style={{ width: "max-content" }}>
          {items.map((b, i) => {
            const img = (
              <div className="promo-banner-card shrink-0 rounded-lg overflow-hidden border border-white/10 md:hover:border-brandYellow/50 transition-all duration-200 md:hover:scale-[1.02]">
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
      </div>
      <style>{`
        .promo-no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}
        .promo-no-scrollbar::-webkit-scrollbar{display:none}
        .promo-banner-card{width:calc(100vw - 1rem);aspect-ratio:10/3;max-height:90px}
        @media (min-width:768px){.promo-banner-card{width:380px;height:180px;aspect-ratio:auto;max-height:none}}
      `}</style>
    </>
  );
}

function PromoBannerSkeleton() {
  return (
    <div className="flex gap-2 md:gap-4 mb-3 overflow-hidden">
      {[1, 2].map(i => (
        <div
          key={i}
          className="promo-banner-card shrink-0 rounded-lg animate-pulse bg-white/10 border border-white/5"
        />
      ))}
    </div>
  );
}
