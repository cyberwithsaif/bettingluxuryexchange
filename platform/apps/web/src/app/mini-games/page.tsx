import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Diamond Mini Games — Roulette, Plinko & Mines",
  description: "Play our provably fair in-house mini games: Roulette, Plinko, and Mines.",
};

const GAMES = [
  {
    href: "/roulette",
    emoji: "☸",
    name: "Roulette",
    tagline: "European Single-Zero Roulette",
    description:
      "Bet on numbers, colors, rows, columns & dozens. Live multiplayer — every spin is shared with all online players. Betting window resets every 30 seconds.",
    badge: "LIVE MULTIPLAYER",
    badgeColor: "bg-emerald-600",
    gradient: "from-emerald-900/60 via-[#0d1a12] to-[#0d1a12]",
    border: "border-emerald-700/40",
    glow: "shadow-[0_0_40px_rgba(16,185,129,0.15)]",
    stats: [
      { label: "Max Payout", value: "35×" },
      { label: "House Edge", value: "2.7%" },
      { label: "Min Bet", value: "₹10" },
    ],
  },
  {
    href: "/plinko",
    emoji: "⬟",
    name: "Plinko",
    tagline: "Provably Fair Ball Drop",
    description:
      "Drop the ball through a field of pegs and watch it bounce to a multiplier slot. Choose 8–24 rows and Low / Medium / High risk for edge-of-seat outcomes.",
    badge: "PROVABLY FAIR",
    badgeColor: "bg-brandRed",
    gradient: "from-red-900/60 via-[#1a0d0d] to-[#1a0d0d]",
    border: "border-red-700/40",
    glow: "shadow-[0_0_40px_rgba(239,68,68,0.15)]",
    stats: [
      { label: "Max Payout", value: "1000×" },
      { label: "Rows", value: "8–24" },
      { label: "Risk Levels", value: "3" },
    ],
  },
  {
    href: "/mines",
    emoji: "💎",
    name: "Mines",
    tagline: "Stake-Style Minesweeper",
    description:
      "Reveal diamonds on a 5×5 grid while avoiding hidden mines. Cash out anytime — the longer you push, the higher the multiplier climbs.",
    badge: "CASH OUT ANYTIME",
    badgeColor: "bg-yellow-600",
    gradient: "from-yellow-900/50 via-[#14110a] to-[#14110a]",
    border: "border-yellow-700/40",
    glow: "shadow-[0_0_40px_rgba(234,179,8,0.12)]",
    stats: [
      { label: "Max Mines", value: "24" },
      { label: "Max Multi", value: "292×" },
      { label: "Grid", value: "5 × 5" },
    ],
  },
];

export default function MiniGamesPage() {
  return (
    <div className="min-h-screen bg-[#0f111a] text-white">
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-white/5">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 80% 60% at 50% 0%, #a3122e 0%, transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-5xl px-4 py-14 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-brandYellow/30 bg-brandYellow/10 px-4 py-1 text-xs font-bold uppercase tracking-widest text-brandYellow mb-5">
            💎 Exclusive In-House Games
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-black italic tracking-tight uppercase mb-3">
            Diamond Mini Games
          </h1>
          <p className="text-white/50 text-base max-w-lg mx-auto">
            Three provably fair casino games, built exclusively for Diamond players. No third-party — 100% in-house.
          </p>
        </div>
      </div>

      {/* Game Cards */}
      <div className="mx-auto max-w-5xl px-4 py-12 grid grid-cols-1 md:grid-cols-3 gap-6">
        {GAMES.map((game) => (
          <div
            key={game.href}
            className={`relative flex flex-col rounded-2xl border bg-gradient-to-b ${game.gradient} ${game.border} ${game.glow} overflow-hidden transition-transform duration-200 hover:-translate-y-1`}
          >
            {/* Badge */}
            <div className="absolute top-4 right-4">
              <span className={`${game.badgeColor} text-white text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full`}>
                {game.badge}
              </span>
            </div>

            {/* Top section */}
            <div className="p-6 pb-4">
              <div className="text-5xl mb-3 leading-none">{game.emoji}</div>
              <h2 className="text-2xl font-black uppercase tracking-wide mb-0.5">{game.name}</h2>
              <p className="text-[11px] uppercase tracking-widest text-white/40 font-semibold mb-3">{game.tagline}</p>
              <p className="text-sm text-white/60 leading-relaxed">{game.description}</p>
            </div>

            {/* Stats strip */}
            <div className="mx-6 mb-4 grid grid-cols-3 divide-x divide-white/10 rounded-xl border border-white/10 bg-black/30">
              {game.stats.map((s) => (
                <div key={s.label} className="flex flex-col items-center py-2.5 px-1">
                  <span className="text-base font-black text-white tabular-nums">{s.value}</span>
                  <span className="text-[9px] uppercase tracking-wider text-white/40 mt-0.5">{s.label}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="px-6 pb-6 mt-auto">
              <Link
                href={game.href}
                className="block w-full rounded-xl bg-brandRed hover:brightness-110 active:scale-95 transition text-center text-sm font-bold uppercase tracking-widest py-3"
              >
                Play Now →
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Footer note */}
      <div className="text-center pb-12 text-xs text-white/25 px-4">
        All mini games use a provably fair system. Play responsibly — 18+ only.
      </div>
    </div>
  );
}
