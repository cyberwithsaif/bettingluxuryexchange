"use client";
import { useState, useEffect, useRef } from "react";
import { Search, SlidersHorizontal, ChevronDown } from "lucide-react";
import useSWR from "swr";
import Link from "next/link";

function initCount(): number {
  return Math.floor(Math.random() * 9001) + 3000;
}
// Small organic movement: most games drift a little each tick, some hold still,
// and occasionally one jumps as if a burst of players joined/left.
function nudge(n: number): number {
  const r = Math.random();
  if (r < 0.30) return n;
  const delta = r > 0.93
    ? Math.floor(Math.random() * 601) - 300   // occasional bigger swing
    : Math.floor(Math.random() * 121) - 60;   // normal drift
  return Math.min(12000, Math.max(3000, n + delta));
}

interface ApiGame {
  id: string; name: string; category: string;
  thumbnail: string | null; isLive: boolean;
  provider: { id: string; name: string; key: string; category: string };
}
interface InHouseGame {
  id: string; name: string; description: string; href: string;
  thumbnail: string | null; emoji: string; bg: string; sortOrder: number;
}

const FALLBACK_GRADIENTS = [
  "linear-gradient(160deg,#3b0a6e 0%,#7c3aed 100%)",
  "linear-gradient(160deg,#0a2d6b 0%,#2563eb 100%)",
  "linear-gradient(160deg,#0a3320 0%,#16a34a 100%)",
  "linear-gradient(160deg,#4a0000 0%,#dc2626 100%)",
  "linear-gradient(160deg,#2a1a00 0%,#d97706 100%)",
  "linear-gradient(160deg,#2a0040 0%,#9333ea 100%)",
  "linear-gradient(160deg,#001e3c 0%,#0284c7 100%)",
  "linear-gradient(160deg,#1a1500 0%,#ca8a04 100%)",
];
function fallback(idx: number): string { return FALLBACK_GRADIENTS[idx % FALLBACK_GRADIENTS.length] ?? FALLBACK_GRADIENTS[0]!; }

export function CasinoGrid({ category, title }: { category?: string; title: string }) {
  const [providerKey, setProviderKey] = useState("All");
  const [q, setQ] = useState("");
  const [showSort, setShowSort] = useState(false);
  const [sortLabel, setSortLabel] = useState("Popular");
  const [counts, setCounts] = useState<number[]>([]);
  const totalRef = useRef(0);

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
  const filteredInhouse = inhouseGames.filter(g =>
    !q || g.name.toLowerCase().includes(q.toLowerCase())
  );

  const totalCount = (showInHouse ? filteredInhouse.length : 0) + filtered.length;

  // Init counts when total changes, then drift every few seconds so the
  // numbers feel live (previously seeded + 60s ticks = looked frozen).
  useEffect(() => {
    if (totalCount === 0) return;
    if (totalRef.current !== totalCount) {
      totalRef.current = totalCount;
      setCounts(Array.from({ length: totalCount }, () => initCount()));
    }
    const id = setInterval(() => {
      setCounts(prev => prev.map(nudge));
    }, 3500 + Math.floor(Math.random() * 2500));
    return () => clearInterval(id);
  }, [totalCount, category]);

  return (
    <div className="min-h-screen" style={{ background: "#0f1923" }}>
      <div className="mx-auto max-w-[1600px] px-3 md:px-5 py-5">

        {/* ── Search ── */}
        <div className="relative mb-3">
          <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none" />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search your game"
            className="w-full rounded-xl pl-11 pr-4 py-3.5 text-sm text-white placeholder-white/35 focus:outline-none focus:ring-2 focus:ring-white/10 transition-all"
            style={{ background: "#1a2332", border: "none" }}
          />
        </div>

        {/* ── Filter bar ── */}
        <div className="hidden md:flex items-center justify-between gap-3 mb-5 flex-wrap">
          {/* Publisher pills */}
          <div className="flex gap-1.5 flex-wrap">
            {["All", ...providers].map(p => (
              <button key={p} onClick={() => setProviderKey(p)}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: providerKey === p ? "#2d3d50" : "transparent",
                  color: providerKey === p ? "#ffffff" : "rgba(255,255,255,0.45)",
                }}
              >{p === "All" ? "All Publishers" : p}</button>
            ))}
          </div>

          {/* Sort + count */}
          <div className="flex items-center gap-3 shrink-0">
            {totalCount > 0 && (
              <span className="text-xs text-white/30 hidden sm:block">{totalCount} games</span>
            )}
            <div className="flex items-center gap-1.5 text-sm text-white/40">
              <SlidersHorizontal size={15} />
              <span>Sort</span>
            </div>
            <div className="relative">
              <button
                onClick={() => setShowSort(v => !v)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white transition-all"
                style={{ background: "#1a2332" }}
              >
                {sortLabel} <ChevronDown size={14} className={showSort ? "rotate-180" : ""} style={{ transition: "transform 0.2s" }} />
              </button>
              {showSort && (
                <div className="absolute right-0 top-full mt-1 z-30 rounded-xl overflow-hidden shadow-2xl" style={{ background: "#1a2332", minWidth: 130 }}>
                  {["Popular", "New", "A–Z", "Z–A"].map(s => (
                    <button key={s} onClick={() => { setSortLabel(s); setShowSort(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm transition-all hover:text-white"
                      style={{ color: sortLabel === s ? "#ffffff" : "rgba(255,255,255,0.5)", background: sortLabel === s ? "rgba(255,255,255,0.06)" : "transparent" }}
                    >{s}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Game grid ── */}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2 md:gap-3">

          {/* In-house games */}
          {showInHouse && filteredInhouse.map((g, idx) => (
            <div key={`ih-${g.id}`} className="flex flex-col gap-1">
              <GameCard
                as="link"
                href={g.href}
                name={g.name}
                publisher="Our Originals"
                thumbnail={g.thumbnail}
                fallbackBg={g.bg || fallback(idx)}
                fallbackEmoji={g.emoji}
                clean={!!g.thumbnail}
                isLive={false}
              />
              <PlayingBadge count={counts[idx]} />
            </div>
          ))}

          {/* Provider games */}
          {filtered.map((g, idx) => {
            const countIdx = (showInHouse ? filteredInhouse.length : 0) + idx;
            return (
              <div key={`api-${g.id}`} className="flex flex-col gap-1">
                <GameCard
                  as="link"
                  href={`/casino/play/${g.id}`}
                  name={g.name}
                  publisher={g.provider.name}
                  thumbnail={g.thumbnail}
                  fallbackBg={fallback(idx)}
                  isLive={g.isLive}
                />
                <PlayingBadge count={counts[countIdx]} />
              </div>
            );
          })}
        </div>

        {/* ── Empty state ── */}
        {totalCount === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-white/25">
            <span className="text-6xl mb-4">🎮</span>
            <p className="text-lg font-bold">No games available yet.</p>
            <p className="text-sm mt-1">Check back soon or contact support.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────── PlayingBadge ─────────────────── */
function PlayingBadge({ count }: { count?: number }) {
  if (!count) return <div className="h-4" />;
  return (
    <div className="flex items-center gap-1 px-1">
      <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0 animate-pulse" />
      <span className="text-[11px] font-semibold text-white/70 tabular-nums leading-none">
        {count.toLocaleString("en-IN")}
        <span className="text-white/40 font-normal"> playing</span>
      </span>
    </div>
  );
}

/* ─────────────────────── GameCard ─────────────────────── */
interface GameCardBase {
  name: string;
  publisher: string;
  thumbnail: string | null;
  fallbackBg: string;
  fallbackEmoji?: string;
  clean?: boolean;  // no overlay, no text, no badge — for cards whose thumbnail already has info baked in
  isLive?: boolean;
}
type GameCardProps =
  | (GameCardBase & { as: "link"; href: string })
  | (GameCardBase & { as: "button"; href?: never });

function GameCard({ name, publisher, thumbnail, fallbackBg, fallbackEmoji, clean, isLive, ...rest }: GameCardProps) {
  const cardBgStyle: React.CSSProperties = clean ? { background: "#0f1923" } : {};
  const imgStyle: React.CSSProperties = {
    position: "absolute", inset: 0, width: "100%", height: "100%",
    objectFit: clean ? "fill" : "cover",
  };
  const inner = (
    <div className="relative w-full h-full" style={cardBgStyle}>
      {/* Image / fallback */}
      {thumbnail
        ? <img src={thumbnail} alt={name} style={imgStyle} draggable={false} />
        : (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: fallbackBg }}>
            <span className="text-5xl drop-shadow-xl">{fallbackEmoji ?? "🎮"}</span>
          </div>
        )
      }

      {/* Dark gradient + text — hidden for clean cards */}
      {!clean && (
        <>
          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 45%, transparent 100%)" }} />
          {isLive && (
            <div className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded" style={{ background: "#dc2626" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse block" />
              <span className="text-[8px] font-black uppercase text-white tracking-wide">LIVE</span>
            </div>
          )}
          <div className="absolute bottom-0 inset-x-0 p-2 pb-2.5">
            <p className="font-black text-white uppercase leading-tight line-clamp-2" style={{ fontSize: "clamp(10px, 2vw, 14px)" }}>{name}</p>
            <p className="text-white/45 uppercase tracking-wider mt-0.5" style={{ fontSize: "clamp(8px, 1.4vw, 10px)" }}>{publisher}</p>
          </div>
        </>
      )}

      {/* Hover ring */}
      <div className="absolute inset-0 rounded-xl ring-2 ring-white/0 hover:ring-white/20 transition-all duration-150 group-hover:ring-white/20" />
    </div>
  );

  const sharedStyle: React.CSSProperties = { aspectRatio: "3/4", borderRadius: 12, overflow: "hidden", display: "block", position: "relative" };
  const hoverClass = "group transition-transform duration-150 hover:scale-[1.04] hover:z-10";

  if (rest.as === "link") {
    return (
      <Link href={rest.href} className={hoverClass} style={sharedStyle}>
        {inner}
      </Link>
    );
  }
  return (
    <button className={`text-left ${hoverClass}`} style={sharedStyle}>
      {inner}
    </button>
  );
}
