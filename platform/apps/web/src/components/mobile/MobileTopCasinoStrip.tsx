"use client";
import Link from "next/link";
import useSWR from "swr";
import { ChevronRight } from "lucide-react";

interface InHouseGame {
  id: string; name: string; description: string;
  href: string; thumbnail: string | null; emoji: string; bg: string; sortOrder: number;
}

export function MobileTopCasinoStrip() {
  const { data } = useSWR<{ inhouseGames?: InHouseGame[] }>(
    "/api/platform/settings",
    (url: string) => fetch(url).then(r => r.ok ? r.json() : {}),
    { refreshInterval: 300_000 },
  );
  const games = (data?.inhouseGames ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  if (!games.length) return null;

  return (
    <section className="md:hidden mb-3">
      <div className="flex items-center justify-between px-1 mb-2">
        <h2 className="text-white font-bold text-base">Our Top Casino</h2>
        <Link href="/casino" className="flex items-center text-xs font-semibold text-brandYellow hover:underline">
          See All <ChevronRight size={14} />
        </Link>
      </div>

      <div
        className="flex gap-2 overflow-x-auto no-scrollbar -mx-2 px-2 pb-1"
        style={{ touchAction: "pan-x" }}
      >
        {games.map((g) => (
          <Link
            key={g.id}
            href={g.href}
            className="shrink-0 w-[100px] rounded-xl overflow-hidden relative border border-white/10 hover:border-brandYellow/60 transition-all duration-200 shadow-md"
            style={{ aspectRatio: "4/5", background: g.thumbnail ? undefined : g.bg }}
          >
            {g.thumbnail ? (
              <img src={g.thumbnail} alt={g.name} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-4xl">{g.emoji}</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 px-2 py-2">
              <p className="text-[10px] font-bold text-white leading-tight truncate">{g.name}</p>
              {g.description && <p className="text-[8px] text-yellow-400/70 truncate mt-0.5">{g.description}</p>}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
