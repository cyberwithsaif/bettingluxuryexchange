"use client";
import Link from "next/link";
import useSWR from "swr";
import { ChevronRight } from "lucide-react";

interface InHouseGame {
  id: string;
  name: string;
  description: string;
  href: string;
  thumbnail: string | null;
  emoji: string;
  bg: string;
  sortOrder: number;
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
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-2 px-2 pb-1">
        {games.map((g) => (
          <Link
            key={g.id}
            href={g.href}
            className="shrink-0 w-[145px] rounded-lg overflow-hidden relative border border-white/10 hover:border-brandYellow/40 transition"
            style={{ background: g.thumbnail ? undefined : g.bg }}
          >
            <div className="relative w-full aspect-square">
              {g.thumbnail ? (
                <img src={g.thumbnail} alt={g.name} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-4xl">{g.emoji}</span>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent px-2 py-1.5">
                <p className="text-xs font-bold text-white leading-tight truncate">{g.name}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
