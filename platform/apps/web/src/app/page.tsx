import Link from "next/link";
import { Trophy, Dices, Rocket, Sparkles, Joystick, Ticket } from "lucide-react";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 space-y-8">
      <Hero />
      <FeatureGrid />
      <HighlightStrip />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden rounded-2xl glass p-8 md:p-12">
      <div className="absolute inset-0 bg-subtle-grain [background-size:18px_18px] opacity-30 pointer-events-none" />
      <div className="relative grid md:grid-cols-2 gap-8 items-center">
        <div>
          <p className="uppercase tracking-[0.3em] text-accentSoft/90 text-xs mb-3">Premium Sportsbook & Casino</p>
          <h1 className="font-display text-5xl md:text-6xl leading-none">
            Bet, Win, <span className="bg-accent-grad bg-clip-text text-transparent">Repeat.</span>
          </h1>
          <p className="mt-4 text-white/70 max-w-md">
            Live cricket, football, tennis exchange with deep markets — plus live casino, crash & slots from top providers.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/exchange" className="rounded-md bg-accent-grad px-5 py-3 font-semibold text-ink shadow-glow hover:brightness-110">Open Exchange</Link>
            <Link href="/casino" className="rounded-md border border-line px-5 py-3 font-semibold hover:border-accent">Browse Casino</Link>
          </div>
        </div>
        <div className="relative aspect-[5/3] rounded-xl bg-betslip-grad border border-line p-4 grid place-items-center">
          <div className="text-center">
            <p className="font-display text-7xl bg-accent-grad bg-clip-text text-transparent">2,847</p>
            <p className="text-white/60">Live markets right now</p>
            <div className="mt-4 flex gap-2 justify-center text-xs">
              <span className="px-2 py-1 rounded bg-ok/15 text-ok">156 in-play</span>
              <span className="px-2 py-1 rounded bg-accent/15 text-accentSoft">42 cricket</span>
              <span className="px-2 py-1 rounded bg-back/10 text-back">21 football</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureGrid() {
  const items = [
    { href: "/exchange",   label: "Sports Exchange", Icon: Trophy,   desc: "Back & Lay on cricket, football, tennis" },
    { href: "/casino",     label: "Live Casino",     Icon: Dices,    desc: "Evolution, Pragmatic, Vivo & more" },
    { href: "/crash",      label: "Crash Games",     Icon: Rocket,   desc: "Aviator, Jet X, Plinko, Mines" },
    { href: "/virtual",    label: "Virtual Sports",  Icon: Joystick, desc: "24/7 simulated leagues" },
    { href: "/slots",      label: "Slot Games",      Icon: Sparkles, desc: "1000+ titles & jackpots" },
    { href: "/lottery",    label: "Lottery",         Icon: Ticket,   desc: "Color prediction & lotto" },
  ];
  return (
    <section>
      <h2 className="font-display text-3xl mb-4">Explore</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map(({ href, label, Icon, desc }) => (
          <Link key={href} href={href}
            className="group relative overflow-hidden rounded-xl glass p-5 hover:border-accent transition flex items-center gap-4">
            <div className="absolute -inset-px opacity-0 group-hover:opacity-100 bg-accent-grad blur-2xl -z-10 transition" />
            <div className="h-12 w-12 grid place-items-center rounded-lg bg-accent-grad text-ink shadow-glow">
              <Icon size={22} />
            </div>
            <div>
              <h3 className="font-bold">{label}</h3>
              <p className="text-sm text-white/60">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function HighlightStrip() {
  return (
    <section className="grid md:grid-cols-3 gap-3">
      {[
        ["⚡", "Instant settlements", "Auto-settled via in-house engine"],
        ["🛡️", "Seamless wallet", "One wallet, sports + casino"],
        ["📈", "Live risk", "Admin sees exposure in real time"],
      ].map(([emoji, t, d]) => (
        <div key={t} className="glass rounded-xl p-5">
          <div className="text-3xl">{emoji}</div>
          <h3 className="mt-2 font-bold">{t}</h3>
          <p className="text-sm text-white/60">{d}</p>
        </div>
      ))}
    </section>
  );
}
