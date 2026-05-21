"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import useSWR from "swr";
import {
  Gamepad2, Trophy, ChevronDown, Headphones,
  Ticket, Target, Monitor, Glasses, Gift, Shield,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface Sport { id: string; key: string; name: string; }
interface Settings { siteName?: string; }

const SPORT_EMOJI: Record<string, string> = {
  cricket: "🏏", football: "⚽", tennis: "🎾", basketball: "🏀",
  "table-tennis": "🏓", "horse-racing": "🏇", greyhound: "🐕",
  volleyball: "🏐", snooker: "🎱", darts: "🎯", rugby: "🏉",
};

const CASINO_GAMES = [
  { href: "/roulette",   label: "Roulette",   emoji: "🎡" },
  { href: "/mines",      label: "Mines",      emoji: "💣" },
  { href: "/plinko",     label: "Plinko",     emoji: "🎯" },
  { href: "/crash",      label: "Crash",      emoji: "🚀" },
  { href: "/slots",      label: "Slots",      emoji: "🎰" },
  { href: "/mini-games", label: "Mini Games", emoji: "💎" },
];

const EXTRA_NAV = [
  { href: "/virtual",    label: "Virtual Game", iconEl: <Monitor size={13} className="text-emerald-400" />, iconBg: "bg-emerald-500/15" },
  { href: "/vr-games",   label: "VR Games",     iconEl: <Glasses size={13} className="text-violet-400" />,  iconBg: "bg-violet-500/15" },
  { href: "/lottery",    label: "Lottery",      iconEl: <Ticket  size={13} className="text-pink-400" />,    iconBg: "bg-pink-500/15"   },
  { href: "/sportsbook", label: "Sports Book",  iconEl: <Target  size={13} className="text-orange-400" />,  iconBg: "bg-orange-500/15" },
];

function SidebarInner() {
  const pathname   = usePathname();
  const params     = useSearchParams();
  const activeSport = params.get("sport") ?? "cricket";

  const [casinoOpen,   setCasinoOpen]   = useState(pathname !== "/exchange");
  const [exchangeOpen, setExchangeOpen] = useState(true);

  const { data: sports   } = useSWR<Sport[]>("/markets/sports");
  const { data: settings } = useSWR<Settings>(
    "/api/platform/settings",
    (u: string) => fetch(u).then(r => r.json()),
    { refreshInterval: 300_000 },
  );
  const siteName = settings?.siteName ?? "DiamondPlay22";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Logo ─────────────────────────────────────────────── */}
      <div className="px-4 pt-5 pb-4 shrink-0 border-b border-white/5">
        <Link href="/" className="flex flex-col leading-none group">
          <span className="font-display italic text-[21px] font-black tracking-tight text-white uppercase group-hover:text-red-300 transition-colors">
            {siteName}
          </span>
          <span className="text-[8px] uppercase tracking-[0.25em] font-semibold text-white/30 mt-0.5">
            — Bet & Win —
          </span>
        </Link>
      </div>

      {/* ── Nav ──────────────────────────────────────────────── */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-0.5 scrollbar-thin scrollbar-thumb-white/8 scrollbar-track-transparent">

        {/* Casino section */}
        <SectionToggle
          label="Casino"
          open={casinoOpen}
          onToggle={() => setCasinoOpen(o => !o)}
          iconBg="bg-red-500/15"
          icon={<Gamepad2 size={13} className="text-red-400" />}
        />
        {casinoOpen && (
          <SubList>
            {CASINO_GAMES.map(g => (
              <SubLink key={g.href} href={g.href} active={pathname === g.href} emoji={g.emoji}>
                {g.label}
              </SubLink>
            ))}
          </SubList>
        )}

        {/* Exchange section */}
        <SectionToggle
          label="Exchange"
          open={exchangeOpen}
          onToggle={() => setExchangeOpen(o => !o)}
          iconBg="bg-yellow-500/15"
          icon={<Trophy size={13} className="text-yellow-400" />}
        />
        {exchangeOpen && (
          <SubList>
            {(sports ?? []).map(s => (
              <SubLink
                key={s.id}
                href={`/exchange?sport=${s.key}`}
                active={pathname === "/exchange" && activeSport === s.key}
                emoji={SPORT_EMOJI[s.key] ?? "🎯"}
              >
                {s.name}
              </SubLink>
            ))}
          </SubList>
        )}

        <div className="h-px bg-white/6 my-2 mx-1" />

        {/* Extra nav items */}
        {EXTRA_NAV.map(({ href, label, iconEl, iconBg }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-all",
              pathname === href
                ? "text-white border border-violet-500/40"
                : "text-white/60 hover:text-white",
            )}
            style={pathname === href ? { background: "rgba(139, 92, 246, 0.2)" } : { background: "rgba(139, 92, 246, 0.08)" }}
          >
            <div className={`w-6 h-6 rounded-md ${iconBg} flex items-center justify-center shrink-0`}>
              {iconEl}
            </div>
            {label}
          </Link>
        ))}

        <div className="h-px bg-white/6 my-2 mx-1" />

        <Link
          href="/contact"
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-semibold text-white/50 hover:text-white/80 transition-all"
          style={{ background: "rgba(139, 92, 246, 0.08)" }}
        >
          <div className="w-6 h-6 rounded-md bg-white/8 flex items-center justify-center shrink-0">
            <Headphones size={13} />
          </div>
          Live Support
        </Link>
      </nav>

      {/* ── Total Bets ───────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-white/8 shrink-0" style={{ background: "rgba(139, 92, 246, 0.06)" }}>
        <div className="text-[9px] uppercase tracking-wider text-white/30 mb-0.5">Total Bets Placed</div>
        <div className="text-sm font-bold text-white/50 tabular-nums tracking-tight">14,012,645,500</div>
      </div>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────────── */

function SectionToggle({ label, open, onToggle, iconBg, icon }: {
  label: string; open: boolean; onToggle: () => void; iconBg: string; icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-bold text-white transition-all"
      style={{ background: "rgba(139, 92, 246, 0.15)", border: "1px solid rgba(139, 92, 246, 0.25)" }}
    >
      <div className="flex items-center gap-2.5">
        <div className={`w-6 h-6 rounded-md ${iconBg} flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        {label}
      </div>
      <ChevronDown size={13} className={cn("text-white/40 transition-transform", open && "rotate-180")} />
    </button>
  );
}

function SubList({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-0.5 ml-2 pl-3 border-l border-white/8">
      {children}
    </div>
  );
}

function SubLink({ href, active, emoji, children }: {
  href: string; active: boolean; emoji: string; children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] transition-all",
        active
          ? "bg-red-900/50 text-white font-semibold border border-red-800/30"
          : "text-white/52 hover:text-white hover:bg-white/5",
      )}
    >
      <span className="text-sm leading-none">{emoji}</span>
      {children}
    </Link>
  );
}

/* ── Export ──────────────────────────────────────────────────── */
export function AppSidebar() {
  return (
    <Suspense fallback={<div className="h-full" />}>
      <SidebarInner />
    </Suspense>
  );
}
