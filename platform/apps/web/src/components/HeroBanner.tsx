"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface BannerSlide {
  id: string;
  imageUrl: string;
  link?: string;
  title?: string;
  sortOrder: number;
}

export function HeroBanner() {
  const { data: settings, isLoading } = useSWR<{ heroBanners?: BannerSlide[] }>(
    "/api/platform/settings",
    (url: string) => fetch(url).then(r => r.ok ? r.json() : {}),
    { refreshInterval: 300_000 },
  );

  const slides: BannerSlide[] = (settings?.heroBanners ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter(s => s.imageUrl);

  const [idx, setIdx]           = useState(0);
  const [animDir, setAnimDir]   = useState<"left" | "right">("left");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const go = useCallback((dir: "prev" | "next") => {
    setAnimDir(dir === "next" ? "left" : "right");
    setIdx(i => dir === "next"
      ? (i + 1) % Math.max(slides.length, 1)
      : (i - 1 + Math.max(slides.length, 1)) % Math.max(slides.length, 1),
    );
  }, [slides.length]);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (slides.length > 1) timerRef.current = setInterval(() => go("next"), 5000);
  }, [go, slides.length]);

  useEffect(() => {
    resetTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [resetTimer]);

  if (isLoading) return <HeroBannerSkeleton />;
  if (!slides.length) return null;

  const slide = slides[idx % slides.length]!;

  return (
    <div className="w-full mb-3">
      {/* Outer wrapper: side arrows + banner inline */}
      <div className="flex items-stretch gap-0">

        {/* Left arrow */}
        <button
          onClick={() => { go("prev"); resetTimer(); }}
          aria-label="Previous banner"
          className="shrink-0 z-10 flex items-center justify-center w-9 md:w-12 bg-black/60 hover:bg-brandRed/80 transition-colors duration-200 rounded-l-xl border border-white/10 border-r-0"
        >
          <ChevronLeft size={28} className="text-white" />
        </button>

        {/* Banner viewport */}
        <div className="relative flex-1 overflow-hidden rounded-none" style={{ aspectRatio: "16/5", maxHeight: 300 }}>
          {slides.map((s, i) => (
            <div
              key={s.id}
              className="absolute inset-0 transition-opacity duration-500"
              style={{ opacity: i === idx ? 1 : 0, pointerEvents: i === idx ? "auto" : "none" }}
            >
              {s.link ? (
                <Link href={s.link} className="block w-full h-full">
                  <img
                    src={s.imageUrl}
                    alt={s.title ?? ""}
                    className="w-full h-full object-cover object-center"
                    draggable={false}
                    loading={i === 0 ? "eager" : "lazy"}
                  />
                </Link>
              ) : (
                <img
                  src={s.imageUrl}
                  alt={s.title ?? ""}
                  className="w-full h-full object-cover object-center"
                  draggable={false}
                  loading={i === 0 ? "eager" : "lazy"}
                />
              )}
              {s.title && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-5 py-4">
                  <span className="text-white font-bold text-lg drop-shadow">{s.title}</span>
                </div>
              )}
            </div>
          ))}

          {/* Dot indicators */}
          {slides.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setAnimDir(i > idx ? "left" : "right"); setIdx(i); resetTimer(); }}
                  aria-label={`Slide ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === idx ? "w-6 bg-white" : "w-1.5 bg-white/40 hover:bg-white/70"}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right arrow */}
        <button
          onClick={() => { go("next"); resetTimer(); }}
          aria-label="Next banner"
          className="shrink-0 z-10 flex items-center justify-center w-9 md:w-12 bg-black/60 hover:bg-brandRed/80 transition-colors duration-200 rounded-r-xl border border-white/10 border-l-0"
        >
          <ChevronRight size={28} className="text-white" />
        </button>
      </div>
    </div>
  );
}

function HeroBannerSkeleton() {
  return (
    <div className="w-full mb-3">
      <div className="flex items-stretch gap-0">
        <div className="shrink-0 w-9 md:w-12 bg-white/5 rounded-l-xl border border-white/10 border-r-0 animate-pulse" />
        <div className="flex-1 bg-white/5 animate-pulse rounded-none" style={{ aspectRatio: "16/5", maxHeight: 300 }} />
        <div className="shrink-0 w-9 md:w-12 bg-white/5 rounded-r-xl border border-white/10 border-l-0 animate-pulse" />
      </div>
    </div>
  );
}
