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
  const { data: settings } = useSWR<{ heroBanners?: BannerSlide[] }>(
    "/api/platform/settings",
    (url: string) => fetch(url).then((r) => r.ok ? r.json() : {}),
    { refreshInterval: 300_000 },
  );

  const slides: BannerSlide[] = (settings?.heroBanners ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((s) => s.imageUrl);

  const [idx, setIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const next = useCallback(() => setIdx((i) => (i + 1) % Math.max(slides.length, 1)), [slides.length]);
  const prev = useCallback(() => setIdx((i) => (i - 1 + Math.max(slides.length, 1)) % Math.max(slides.length, 1)), [slides.length]);

  useEffect(() => {
    if (slides.length <= 1) return;
    timerRef.current = setInterval(next, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [next, slides.length]);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (slides.length > 1) timerRef.current = setInterval(next, 5000);
  }, [next, slides.length]);

  if (!slides.length) return null;

  const slide = slides[idx % slides.length];

  const inner = (
    <div className="relative w-full overflow-hidden rounded-xl" style={{ aspectRatio: "16/5" }}>
      {/* Slides */}
      {slides.map((s, i) => (
        <div
          key={s.id}
          className="absolute inset-0 transition-opacity duration-700"
          style={{ opacity: i === idx ? 1 : 0, pointerEvents: i === idx ? "auto" : "none" }}
        >
          <img
            src={s.imageUrl}
            alt={s.title ?? ""}
            className="w-full h-full object-cover object-center"
            draggable={false}
          />
          {s.title && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-4">
              <span className="text-white font-bold text-lg drop-shadow">{s.title}</span>
            </div>
          )}
        </div>
      ))}

      {/* Nav arrows */}
      {slides.length > 1 && (
        <>
          <button
            onClick={(e) => { e.preventDefault(); prev(); resetTimer(); }}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/50 hover:bg-black/80 flex items-center justify-center text-white transition"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={(e) => { e.preventDefault(); next(); resetTimer(); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/50 hover:bg-black/80 flex items-center justify-center text-white transition"
          >
            <ChevronRight size={18} />
          </button>
        </>
      )}

      {/* Dot indicators */}
      {slides.length > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.preventDefault(); setIdx(i); resetTimer(); }}
              className={`h-1.5 rounded-full transition-all ${i === idx ? "w-5 bg-white" : "w-1.5 bg-white/40"}`}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="w-full mb-4">
      {slide.link ? (
        <Link href={slide.link} target={slide.link.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
          {inner}
        </Link>
      ) : inner}
    </div>
  );
}
