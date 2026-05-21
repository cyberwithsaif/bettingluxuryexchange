"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import React from "react";
import useSWR from "swr";
import {
  Gamepad2, Trophy, ChevronDown, Headphones,
  Ticket, Target, Monitor, Glasses, Gift, Shield,
  TrendingUp, Award, Activity, Megaphone, Share2, Gift as GiftBox,
  Crown, Heart, Globe, MessageCircle,
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
  { href: "/predictions", label: "Predictions",  iconEl: <TrendingUp size={20} strokeWidth={2.5} className="text-white" />,  iconBg: "" },
  { href: "/rewards",     label: "Rewards",       iconEl: <Award      size={20} strokeWidth={2.5} className="text-white" />,  iconBg: "" },
  { href: "/live-rtp",   label: "Live RTP",       iconEl: <Activity   size={20} strokeWidth={2.5} className="text-white" />,  iconBg: "" },
  { href: "/promotions", label: "Promotions",     iconEl: <Megaphone  size={20} strokeWidth={2.5} className="text-white" />,  iconBg: "" },
  { href: "/refer-earn", label: "Refer & Earn",   iconEl: <Share2     size={20} strokeWidth={2.5} className="text-white" />,  iconBg: "" },
  { href: "/redeem",     label: "Redeem",         iconEl: <GiftBox    size={20} strokeWidth={2.5} className="text-white" />,  iconBg: "" },
  { href: "/vip-club",   label: "VIP Club",       iconEl: <Crown      size={20} strokeWidth={2.5} className="text-white" />,  iconBg: "" },
  { href: "/responsible",label: "Roo Responsibly",iconEl: <Heart      size={20} strokeWidth={2.5} className="text-white" />,  iconBg: "" },
  { href: "/language",   label: "English",        iconEl: <Globe      size={20} strokeWidth={2.5} className="text-white" />,  iconBg: "" },
];

function SidebarInner() {
  const pathname   = usePathname();
  const params     = useSearchParams();
  const activeSport = params.get("sport") ?? "cricket";

  const [casinoOpen,   setCasinoOpen]   = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);

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
      <div className="px-4 pt-3 pb-2 shrink-0">
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
      <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">

        {/* Casino section */}
        <SectionToggle
          label="Casino"
          open={casinoOpen}
          onToggle={() => setCasinoOpen(o => !o)}
          iconBg=""
          icon={<Gamepad2 size={20} strokeWidth={2.5} className="text-white" />}
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

        {/* Sportsbook section */}
        <SectionToggle
          label="Sportsbook"
          open={exchangeOpen}
          onToggle={() => setExchangeOpen(o => !o)}
          iconBg=""
          icon={<Trophy size={20} strokeWidth={2.5} className="text-white" />}
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


        {/* Extra nav items */}
        {EXTRA_NAV.map(({ href, label, iconEl }) => {
          const isActive = pathname === href;
          const [isHovered, setIsHovered] = React.useState(false);
          const bgColor = isActive ? "#7740ed" : "#463e7a";
          const hoverColor = isActive ? "#8a50f5" : "#5a5a8a";

          return (
            <Link
              key={href}
              href={href}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-1.5 rounded-2xl text-[15px] font-bold transition-all",
                isActive ? "text-white" : "text-white hover:text-white",
              )}
              style={{ background: isHovered ? hoverColor : bgColor }}
            >
              {iconEl}
              {label}
            </Link>
          );
        })}


        {(() => {
          const [isHovered, setIsHovered] = React.useState(false);
          return (
            <Link
              href="/contact"
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              className="flex items-center gap-3 px-3 py-1.5 rounded-2xl text-[15px] font-bold text-white hover:text-white transition-all"
              style={{ background: isHovered ? "#5a5a8a" : "#463e7a" }}
            >
              <Headphones size={20} strokeWidth={2.5} className="text-white" />
              Live Support
            </Link>
          );
        })()}
      </nav>

      {/* ── Total Bets ───────────────────────────────────────── */}
      <div className="px-4 py-2 shrink-0" style={{ background: "rgba(139, 92, 246, 0.06)" }}>
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
  const [isHovered, setIsHovered] = React.useState(false);
  const bgColor = open ? "#7740ed" : "#463e7a";
  const hoverColor = open ? "#8a50f5" : "#5a5a8a";

  return (
    <button
      onClick={onToggle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="w-full flex items-center justify-between px-4 py-2 rounded-2xl text-[15px] font-bold text-white transition-all cursor-pointer"
      style={{ background: isHovered ? hoverColor : bgColor }}
    >
      <div className="flex items-center gap-3">
        {iconBg ? (
          <div className={`w-6 h-6 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
            {icon}
          </div>
        ) : (
          icon
        )}
        {label}
      </div>
      <ChevronDown size={16} strokeWidth={2.5} className={cn("text-white transition-transform", open && "rotate-180")} />
    </button>
  );
}

function SubList({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-0.5 ml-2 pl-3">
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
        "flex items-center gap-2.5 px-3 py-2 text-[14px] font-semibold transition-all rounded-lg",
        active
          ? "text-white"
          : "text-white/80 hover:text-white",
      )}
      style={{ background: "#2c2852" }}
    >
      <span className="text-base leading-none">{emoji}</span>
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
