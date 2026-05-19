"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";
import useSWR from "swr";
import Link from "next/link";

interface ApiGame {
  id: string;
  name: string;
  category: string;
  thumbnail: string | null;
  isLive: boolean;
  provider: { id: string; name: string; key: string; category: string };
}

const IN_HOUSE_GAMES = [
  {
    name: "Roulette",
    href: "/roulette",
    emoji: "🎯",
    bg: "linear-gradient(135deg,#7f0000 0%,#b71c1c 50%,#4a0000 100%)",
    desc: "European Roulette",
    badge: "IN-HOUSE",
  },
  {
    name: "Mines",
    href: "/mines",
    emoji: "💣",
    bg: "linear-gradient(135deg,#0a3d1a 0%,#1b5e20 50%,#062210 100%)",
    desc: "Mines Game",
    badge: "IN-HOUSE",
  },
];

export function CasinoGrid({ category, title }: { category?: string; title: string }) {
  const [providerKey, setProviderKey] = useState<string>("All");
  const [categoryKey, setCategoryKey] = useState<string>("All");
  const [q, setQ] = useState("");

  const apiCategory = category === "LIVE" ? "LIVE"
    : category === "CRASH" ? "CRASH"
    : category === "SLOTS" ? "SLOT"
    : category === "VIRTUAL" ? "VIRTUAL"
    : category === "VR" ? "VIRTUAL"
    : category === "LOTTERY" ? "LOTTERY"
    : undefined;

  const { data: rawGames } = useSWR<ApiGame[]>(
    `/api/casino/games${apiCategory ? `?category=${apiCategory}` : ""}`,
    (url: string) => fetch(url).then((r) => r.ok ? r.json() : []),
  );
  const apiGames: ApiGame[] = Array.isArray(rawGames) ? rawGames : [];

  const providers = Array.from(new Set(apiGames.map((g) => g.provider.name)));
  const categories = Array.from(new Set(apiGames.map((g) => g.category).filter(Boolean)));

  const filtered = apiGames.filter((g) => {
    if (providerKey !== "All" && g.provider.name !== providerKey) return false;
    if (categoryKey !== "All" && g.category !== categoryKey) return false;
    if (q && !g.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const showInHouse = category === "LIVE" || !category;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6">
      <div className="flex flex-col mb-4">
        <h1 className="font-display text-5xl font-black text-brandRed tracking-tight uppercase">{title}</h1>
        <h2 className="font-display text-2xl font-bold text-white uppercase mt-1">BET NOW ON MULTIPLE {title}</h2>
      </div>

      {/* In-House Featured Games */}
      {showInHouse && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs font-bold uppercase tracking-widest text-brandYellow bg-brandYellow/10 border border-brandYellow/30 px-3 py-1 rounded-full">Our Games</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {IN_HOUSE_GAMES.map((g) => (
              <Link
                key={g.href}
                href={g.href}
                className="group relative aspect-[4/5] rounded-xl overflow-hidden border border-transparent hover:border-brandRed transition transform hover:-translate-y-1 shadow-lg"
                style={{ background: g.bg }}
              >
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <span className="text-5xl drop-shadow-lg">{g.emoji}</span>
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute top-2 right-2">
                  <span className="text-[9px] font-bold uppercase tracking-wider bg-brandYellow/90 text-black px-1.5 py-0.5 rounded">{g.badge}</span>
                </div>
                <div className="absolute bottom-0 inset-x-0 p-2 text-left">
                  <p className="font-bold text-sm leading-tight text-white">{g.name}</p>
                  <p className="text-[10px] uppercase tracking-wider text-brandYellow">{g.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Provider Games from Admin */}
      {(providers.length > 0 || apiGames.length > 0) && (
        <>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs font-bold uppercase tracking-widest text-white/60 bg-white/5 border border-white/10 px-3 py-1 rounded-full">Provider Games</span>
            <div className="flex-1 h-px bg-white/10" />
            <div className="relative w-52">
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search game" className="bg-transparent border border-gray-600 rounded-full pl-4 pr-9 py-1.5 text-xs w-full focus:outline-none focus:border-brandRed text-white" />
            </div>
          </div>

          {providers.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              <Chip label="All" active={providerKey === "All"} onClick={() => setProviderKey("All")} />
              {providers.map((p) => <Chip key={p} label={p} active={providerKey === p} onClick={() => setProviderKey(p)} />)}
            </div>
          )}

          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              <Chip label="All" active={categoryKey === "All"} onClick={() => setCategoryKey("All")} />
              {categories.map((c) => <Chip key={c} label={c} active={categoryKey === c} onClick={() => setCategoryKey(c)} />)}
            </div>
          )}

          {filtered.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-8 gap-3">
              {filtered.map((g) => (
                <button
                  key={g.id}
                  className="group relative aspect-[4/5] rounded-xl overflow-hidden glass border border-transparent hover:border-brandRed transition transform hover:-translate-y-1"
                >
                  {g.thumbnail ? (
                    <img src={g.thumbnail} alt={g.name} className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                      <span className="text-4xl opacity-30">🎮</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <div className="absolute bottom-0 inset-x-0 p-2 text-left">
                    <p className="font-bold text-sm leading-tight text-white">{g.name}</p>
                    <p className="text-[10px] uppercase tracking-wider text-brandYellow">{g.provider.name}</p>
                  </div>
                  {g.isLive && (
                    <div className="absolute top-2 left-2">
                      <span className="text-[9px] font-bold uppercase tracking-wider bg-red-600/90 text-white px-1.5 py-0.5 rounded">LIVE</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-white/30 text-sm">
              {q || providerKey !== "All" || categoryKey !== "All" ? "No games match your filter." : "No provider games yet. Add games from the admin panel."}
            </div>
          )}
        </>
      )}

      {/* No games at all and no in-house */}
      {!showInHouse && apiGames.length === 0 && (
        <div className="text-center py-20 text-white/30">
          <span className="text-6xl block mb-4">🎮</span>
          <p className="text-lg font-semibold">No games available yet.</p>
          <p className="text-sm mt-1">Check back soon or contact support.</p>
        </div>
      )}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-2 rounded text-xs font-bold transition border",
        active
          ? "bg-accent-grad text-white border-transparent"
          : "bg-transparent text-white border-gray-600 hover:border-white",
      )}
    >
      {label}
    </button>
  );
}
