"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, Suspense, useContext } from "react";
import React from "react";
import useSWR from "swr";
import { SidebarContext } from "@/lib/contexts/sidebar";
import {
  Gamepad2, Trophy, ChevronDown, Headphones,
  Ticket, Target, Monitor, Glasses, Gift, Shield,
  TrendingUp, Award, Activity, Megaphone, Share2, Gift as GiftBox,
  Crown, Heart, Globe, MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface Sport { id: string; key: string; name: string; }

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

  const { data: sports } = useSWR<Sport[]>("/markets/sports");
  const sidebarContext = useContext(SidebarContext);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Arrow toggle (top of sidebar) ─────────────────────────── */}
      <div className="shrink-0 h-[74px] flex items-center justify-center px-4">
        <button
          onClick={() => sidebarContext?.setCollapsed(!sidebarContext.collapsed)}
          className="flex items-center justify-center w-12 h-12 rounded-xl transition-all group"
          style={{
            background: "linear-gradient(135deg, rgba(139, 92, 246, 0.4), rgba(168, 85, 247, 0.2))",
            boxShadow: "0 8px 20px rgba(139, 92, 246, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -2px 8px rgba(0, 0, 0, 0.3)",
            border: "1px solid rgba(139, 92, 246, 0.3)",
          }}
          title="Toggle sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="group-hover:text-violet-100 transition-colors" style={{ color: "rgb(196, 181, 253)" }}>
            <path d="M12 5L17 10M17 10L12 15M17 10H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* ── Nav ──────────────────────────────────────────────── */}
      <nav className="flex-1 px-2 py-3 mt-4 overflow-y-auto space-y-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">

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
          const bgColor = isActive ? "#7740ed" : "#2c2852";
          const hoverColor = isActive ? "#8a50f5" : "#3d3763";

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
              style={{ background: isHovered ? "#3d3763" : "#2c2852" }}
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
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center transition-transform", open && "rotate-180")} style={{ background: "#605499" }}>
        <ChevronDown size={16} strokeWidth={2.5} className="text-white" />
      </div>
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
