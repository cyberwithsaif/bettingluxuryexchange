"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import useSWR from "swr";
import Link from "next/link";

interface ApiGame {
  id: string; name: string; category: string;
  thumbnail: string | null; isLive: boolean;
  provider: { id: string; name: string; key: string; category: string };
}
interface InHouseGame {
  id: string; name: string; description: string; href: string;
  thumbnail: string | null; emoji: string; bg: string; sortOrder: number;
}

// Fallback gradient colors for games without thumbnails
const FALLBACK_GRADIENTS = [
  "linear-gradient(135deg,#1a0533 0%,#6d28d9 100%)",
  "linear-gradient(135deg,#0a1f3c 0%,#1d4ed8 100%)",
  "linear-gradient(135deg,#0f2a1e 0%,#059669 100%)",
  "linear-gradient(135deg,#2d0000 0%,#dc2626 100%)",
  "linear-gradient(135deg,#1a1200 0%,#d97706 100%)",
  "linear-gradient(135deg,#1a0020 0%,#9333ea 100%)",
  "linear-gradient(135deg,#001a2d 0%,#0891b2 100%)",
  "linear-gradient(135deg,#1f1a00 0%,#ca8a04 100%)",
];

function fallback(idx: number) { return FALLBACK_GRADIENTS[idx % FALLBACK_GRADIENTS.length]; }

export function CasinoGrid({ category, title }: { category?: string; title: string }) {
  const [providerKey, setProviderKey]   = useState("All");
  const [q, setQ]                       = useState("");

  const apiCategory = category === "LIVE"    ? "LIVE"
    : category === "CRASH"   ? "CRASH"
    : category === "SLOTS"   ? "SLOT"
    : category === "VIRTUAL" ? "VIRTUAL"
    : category === "VR"      ? "VIRTUAL"
    : category === "LOTTERY" ? "LOTTERY"
    : undefined;

  const { data: siteSettings } = useSWR<{ inhouseGames?: InHouseGame[] }>(
    "/api/platform/settings",
    (url: string) => fetch(url).then(r => r.ok ? r.json() : {}),
  );
  const inhouseGames = (siteSettings?.inhouseGames ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);

  const { data: rawGames } = useSWR<ApiGame[]>(
    `/api/casino/games${apiCategory ? `?category=${apiCategory}` : ""}`,
    (url: string) => fetch(url).then(r => r.ok ? r.json() : []),
  );
  const apiGames: ApiGame[] = Array.isArray(rawGames) ? rawGames : [];
  const providers = Array.from(new Set(apiGames.map(g => g.provider.name)));

  const filtered = apiGames.filter(g => {
    if (providerKey !== "All" && g.provider.name !== providerKey) return false;
    if (q && !g.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const showInHouse = category === "LIVE" || category === "VR" || !category;

  return (
    <div className="min-h-screen" style={{ backgroundImage: "url('/casino-bg.jpg')", backgroundSize: "cover", backgroundPosition: "center top", backgroundAttachment: "fixed" }}>
    <div className="min-h-screen" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(5,0,10,0.82) 40%, rgba(5,0,10,0.95) 100%)" }}>
    <div className="mx-auto max-w-[1600px] px-3 md:px-6 py-4 md:py-6">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display text-2xl md:text-4xl font-black text-brandRed tracking-tight uppercase">{title}</h1>
          <p className="text-white/50 text-xs md:text-sm mt-0.5 uppercase tracking-wider">Premium Games · Bet Now</p>
        </div>
        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60" />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search game…"
            className="w-full bg-black/60 backdrop-blur border border-white/30 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/50 focus:outline-none focus:border-brandRed focus:bg-black/80 transition shadow-lg"
          />
        </div>
      </div>

      {/* Provider filter */}
      {providers.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mb-4">
          {["All", ...providers].map(p => (
            <button key={p} onClick={() => setProviderKey(p)}
              className={`px-3 py-1 rounded-full text-[11px] font-bold border transition ${
                providerKey === p
                  ? "bg-brandRed border-brandRed text-white shadow-[0_0_10px_rgba(168,18,46,0.4)]"
                  : "bg-white/5 border-white/10 text-white/60 hover:border-white/30 hover:text-white"
              }`}
            >{p}</button>
          ))}
        </div>
      )}

      {/* ── In-House Games ── */}
      {showInHouse && inhouseGames.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-brandYellow bg-brandYellow/10 border border-brandYellow/30 px-3 py-1 rounded-full">Our Games</span>
            <div className="flex-1 h-px bg-white/8" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-3 md:gap-4">
            {inhouseGames.map((g, idx) => (
              <Link key={g.id} href={g.href}
                className="group relative rounded-2xl overflow-hidden border border-white/8 hover:border-yellow-400/60 hover:scale-[1.04] hover:shadow-[0_0_18px_rgba(250,204,21,0.25)] transition-all duration-200 shadow-md"
                style={{ aspectRatio: "3/4", background: g.thumbnail ? undefined : fallback(idx) }}
              >
                {g.thumbnail
                  ? <img src={g.thumbnail} alt={g.name} className="absolute inset-0 w-full h-full object-cover" />
                  : <div className="absolute inset-0 flex items-center justify-center"><span className="text-4xl drop-shadow-lg">{g.emoji}</span></div>
                }
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                <div className="absolute top-1.5 right-1.5">
                  <span className="text-[8px] font-bold uppercase bg-yellow-400/90 text-black px-1.5 py-0.5 rounded-full tracking-wide">OUR</span>
                </div>
                <div className="absolute bottom-0 inset-x-0 p-2">
                  <p className="font-bold text-[11px] md:text-xs leading-tight text-white truncate">{g.name}</p>
                  {g.description && <p className="text-[9px] text-yellow-400/70 truncate mt-0.5">{g.description}</p>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Provider Games ── */}
      {apiGames.length > 0 && (
        <>
          {providers.length > 0 && (
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/50 bg-white/5 border border-white/10 px-3 py-1 rounded-full">All Games</span>
              <div className="flex-1 h-px bg-white/8" />
              <span className="text-[10px] text-white/30">{filtered.length} games</span>
            </div>
          )}

          {filtered.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-3 md:gap-4">
              {filtered.map((g, idx) => (
                <button key={g.id}
                  className="group relative rounded-2xl overflow-hidden border border-white/8 hover:border-brandRed/60 hover:scale-[1.04] hover:shadow-[0_0_18px_rgba(168,18,46,0.3)] transition-all duration-200 shadow-md text-left"
                  style={{ aspectRatio: "3/4", background: g.thumbnail ? undefined : fallback(idx) }}
                >
                  {g.thumbnail
                    ? <img src={g.thumbnail} alt={g.name} className="absolute inset-0 w-full h-full object-cover" />
                    : <div className="absolute inset-0 flex items-center justify-center"><span className="text-3xl opacity-50">🎮</span></div>
                  }
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                  {g.isLive && (
                    <div className="absolute top-1.5 left-1.5">
                      <span className="flex items-center gap-1 text-[8px] font-bold bg-red-600 text-white px-1.5 py-0.5 rounded-full uppercase">
                        <span className="w-1 h-1 rounded-full bg-white animate-pulse inline-block" />LIVE
                      </span>
                    </div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 p-2">
                    <p className="font-bold text-[11px] md:text-xs leading-tight text-white line-clamp-2">{g.name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <p className="text-[8px] md:text-[9px] text-white/50 truncate">{g.provider.name}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-white/30 text-sm">
              {q || providerKey !== "All" ? "No games match your filter." : "No games yet."}
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!showInHouse && apiGames.length === 0 && (
        <div className="text-center py-20 text-white/30">
          <span className="text-6xl block mb-4">🎮</span>
          <p className="text-lg font-semibold">No games available yet.</p>
          <p className="text-sm mt-1">Check back soon or contact support.</p>
        </div>
      )}
    </div>
    </div>
    </div>
  );
}
