import Link from "next/link";
import { HeroBanner } from "@/components/HeroBanner";
import { PromoBannerStrip } from "@/components/PromoBannerStrip";
import { Betslip } from "@/components/exchange/Betslip";

/* ── Game cards ────────────────────────────────────────────── */
const ORIGINALS = [
  { name: "Roulette",   href: "/roulette",   emoji: "🎡", desc: "Spin & Win Big",      from: "#5c0a1a", to: "#2d0510" },
  { name: "Crash",      href: "/crash",      emoji: "🚀", desc: "Ride the Curve",      from: "#5c2a00", to: "#2d1400" },
  { name: "Mines",      href: "/mines",      emoji: "💣", desc: "Navigate to Win",     from: "#0a4020", to: "#041a0c" },
  { name: "Plinko",     href: "/plinko",     emoji: "🎯", desc: "Drop & Earn",         from: "#0a205c", to: "#04102d" },
  { name: "Slots",      href: "/slots",      emoji: "🎰", desc: "Jackpots & Rewards",  from: "#3d1a5c", to: "#1e0d2d" },
  { name: "Mini Games", href: "/mini-games", emoji: "💎", desc: "Quick & Fun",         from: "#0a4a4a", to: "#042525" },
  { name: "Virtual",    href: "/virtual",    emoji: "🎮", desc: "Simulated Thrills",   from: "#1a3a00", to: "#0c1e00" },
  { name: "Lottery",    href: "/lottery",    emoji: "🎟️", desc: "Pick Your Numbers",   from: "#4a001a", to: "#25000d" },
];

/* ── Weekly promo data (static, replace with real data later) ── */
const WEEKLY_END = (() => {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  d.setHours(23, 59, 59, 0);
  return d;
})();

export default function HomePage() {
  return (
    <div className="flex gap-0 items-start">
      {/* ── Center content ────────────────────────────────────── */}
      <div className="flex-1 min-w-0 px-3 md:px-5 py-4 space-y-5">

        {/* Hero carousel (admin-managed) */}
        <PromoBannerStrip />

        {/* Weekly Jackpot promo card */}
        <WeeklyPromoCard />

        {/* Category cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CategoryCard
            href="/casino"
            title="Casino"
            subtitle="Thousands of Games"
            emoji="🎰"
            gradient="linear-gradient(135deg,#3d0810 0%,#6b0e1a 40%,#1a0408 100%)"
          />
          <CategoryCard
            href="/exchange"
            title="Sports Betting"
            subtitle="Live Markets — Bet Now"
            emoji="🏏"
            gradient="linear-gradient(135deg,#0a1535 0%,#162a60 40%,#040c1a 100%)"
          />
        </div>

        {/* Originals grid */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-white tracking-wide">
              DiamondPlay22 Originals
            </h2>
            <Link href="/casino" className="text-xs text-red-400 hover:text-red-300 transition font-semibold">
              View All →
            </Link>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-4 lg:grid-cols-8 gap-2 md:gap-3">
            {ORIGINALS.map(g => (
              <Link key={g.href + g.name} href={g.href} className="group block">
                <div
                  className="relative rounded-xl overflow-hidden aspect-square flex flex-col items-center justify-center gap-1.5 border border-white/8 group-hover:border-white/25 transition-all duration-200 group-hover:scale-105 group-hover:shadow-lg"
                  style={{ background: `linear-gradient(145deg, ${g.from}, ${g.to})` }}
                >
                  <span className="text-3xl md:text-4xl leading-none">{g.emoji}</span>
                  <span className="text-[10px] md:text-xs font-bold text-white/90 text-center px-1 leading-tight">{g.name}</span>
                </div>
                <p className="text-[9px] md:text-[10px] text-white/40 mt-1.5 text-center leading-tight hidden sm:block">{g.desc}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* Hero banner carousel (admin-managed large slides) */}
        <HeroBanner />
      </div>

      {/* ── Right: Betslip (desktop only) ─────────────────────── */}
      <aside className="hidden xl:block w-[300px] shrink-0 sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto py-4 pr-3">
        <Betslip />
      </aside>
    </div>
  );
}

/* ── Weekly Promo Card ──────────────────────────────────────── */
function WeeklyPromoCard() {
  return (
    <div
      className="relative rounded-2xl overflow-hidden border border-white/10 p-5 md:p-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      style={{ background: "linear-gradient(135deg,#1a0830 0%,#2d0a50 50%,#0d0418 100%)" }}
    >
      {/* Glow */}
      <div className="absolute -top-10 -left-10 w-48 h-48 rounded-full opacity-20 blur-3xl"
           style={{ background: "radial-gradient(circle, #a855f7, transparent)" }} />

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">🏆</span>
          <span className="text-xs font-bold uppercase tracking-widest text-purple-300/70">Weekly Special</span>
        </div>
        <h3 className="text-2xl md:text-3xl font-black text-white leading-tight">
          ₹10,00,000<br />
          <span className="text-purple-300">Weekly Jackpot</span>
        </h3>
        <p className="text-white/50 text-sm mt-1">Top players share the prize every week.</p>
      </div>

      <div className="relative z-10 flex flex-col items-start sm:items-end gap-3">
        <CountdownTimer target={WEEKLY_END} />
        <Link
          href="/casino"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm text-white transition-all hover:brightness-110 active:scale-95"
          style={{ background: "linear-gradient(135deg,#7c3aed,#a855f7)" }}
        >
          Learn More →
        </Link>
      </div>
    </div>
  );
}

/* ── Countdown Timer ────────────────────────────────────────── */
import { CountdownTimer } from "@/components/CountdownTimer";

/* ── Category Card ──────────────────────────────────────────── */
function CategoryCard({ href, title, subtitle, emoji, gradient }: {
  href: string; title: string; subtitle: string; emoji: string; gradient: string;
}) {
  return (
    <Link
      href={href}
      className="group block relative rounded-2xl overflow-hidden border border-white/8 hover:border-white/20 transition-all duration-300 hover:scale-[1.02]"
      style={{ background: gradient, minHeight: 140 }}
    >
      <div className="relative z-10 p-5 md:p-6 flex flex-col h-full justify-between" style={{ minHeight: 140 }}>
        <div>
          <h3 className="text-xl md:text-2xl font-black text-white">{title}</h3>
          <p className="text-white/50 text-sm mt-1">{subtitle}</p>
        </div>
        <div className="mt-4">
          <span className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white font-bold px-4 py-2 rounded-full text-sm transition-colors">
            Play Now →
          </span>
        </div>
      </div>
      <div className="absolute right-4 bottom-2 text-7xl md:text-8xl opacity-15 select-none pointer-events-none group-hover:opacity-25 transition-opacity">
        {emoji}
      </div>
    </Link>
  );
}
