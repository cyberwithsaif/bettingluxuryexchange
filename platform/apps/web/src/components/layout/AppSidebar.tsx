"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, Suspense, useContext } from "react";
import React from "react";
import useSWR from "swr";
import { SidebarContext } from "@/lib/contexts/sidebar";
import {
  Gamepad2, Trophy, ChevronDown, Headphones, House,
  TrendingUp, Award, Activity, Megaphone, Share2, Gift as GiftBox,
  Crown, Heart, Globe,
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
  { href: "/predictions", label: "Predictions",   icon: <TrendingUp size={20} strokeWidth={2.5} className="text-white shrink-0" /> },
  { href: "/rewards",     label: "Rewards",        icon: <Award      size={20} strokeWidth={2.5} className="text-white shrink-0" /> },
  { href: "/live-rtp",   label: "Live RTP",        icon: <Activity   size={20} strokeWidth={2.5} className="text-white shrink-0" /> },
  { href: "/promotions", label: "Promotions",      icon: <Megaphone  size={20} strokeWidth={2.5} className="text-white shrink-0" /> },
  { href: "/refer-earn", label: "Refer & Earn",    icon: <Share2     size={20} strokeWidth={2.5} className="text-white shrink-0" /> },
  { href: "/redeem",     label: "Redeem",          icon: <GiftBox    size={20} strokeWidth={2.5} className="text-white shrink-0" /> },
  { href: "/vip-club",   label: "VIP Club",        icon: <Crown      size={20} strokeWidth={2.5} className="text-white shrink-0" /> },
  { href: "/responsible",label: "Roo Responsibly", icon: <Heart      size={20} strokeWidth={2.5} className="text-white shrink-0" /> },
  { href: "/language",   label: "English",         icon: <Globe      size={20} strokeWidth={2.5} className="text-white shrink-0" /> },
  { href: "/contact",    label: "Live Support",    icon: <Headphones size={20} strokeWidth={2.5} className="text-white shrink-0" /> },
];

function SidebarInner() {
  const pathname    = usePathname();
  const params      = useSearchParams();
  const activeSport = params.get("sport") ?? "cricket";

  const [casinoOpen,   setCasinoOpen]   = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);

  const { data: sports } = useSWR<Sport[]>("/markets/sports");
  const ctx = useContext(SidebarContext);
  const collapsed = ctx?.collapsed ?? false;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header: Arrow ──────────────────────────────────────────── */}
      <div className="shrink-0 h-[64px] flex items-end justify-center px-4 pb-5">
        <button
          onClick={() => ctx?.setCollapsed(!collapsed)}
          className="flex items-center justify-center w-9 h-9 rounded-xl transition-all group"
          style={{
            background: "linear-gradient(135deg, rgba(139,92,246,0.4), rgba(168,85,247,0.2))",
            boxShadow: "0 8px 20px rgba(139,92,246,0.25), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -2px 8px rgba(0,0,0,0.3)",
            border: "1px solid rgba(139,92,246,0.3)",
          }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className="group-hover:text-violet-100 transition-all duration-300" style={{ color: "rgb(196,181,253)", transform: collapsed ? "rotate(180deg)" : "none" }}>
            <path d="M8 5L3 10M3 10L8 15M3 10H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* ── Nav ───────────────────────────────────────────────────── */}
      <nav className={cn(
        "flex-1 py-3 mt-0 overflow-y-auto space-y-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
        collapsed ? "px-1" : "px-2",
      )}>

        {/* Home */}
        {collapsed ? (
          <NavIcon icon={<House size={20} strokeWidth={2.5} className="text-white" />} href="/" active={pathname === "/"} />
        ) : (
          <NavRow href="/" active={pathname === "/"} icon={<House size={20} strokeWidth={2.5} className="text-white shrink-0" />} label="Home" />
        )}

        {/* Casino */}
        {collapsed ? (
          <NavIcon icon={<Gamepad2 size={20} strokeWidth={2.5} className="text-white" />} href="/casino" active={pathname.startsWith("/casino")} />
        ) : (
          <>
            <SectionRow
              label="Casino" href="/casino"
              active={pathname.startsWith("/casino")}
              open={casinoOpen} onToggle={() => setCasinoOpen(o => !o)}
              icon={<Gamepad2 size={20} strokeWidth={2.5} className="text-white" />}
            />
            {casinoOpen && (
              <div className="space-y-0.5 ml-2 pl-3">
                {CASINO_GAMES.map(g => (
                  <SubLink key={g.href} href={g.href} active={pathname === g.href} emoji={g.emoji}>{g.label}</SubLink>
                ))}
              </div>
            )}
          </>
        )}

        {/* Sportsbook */}
        {collapsed ? (
          <NavIcon icon={<Trophy size={20} strokeWidth={2.5} className="text-white" />} href="/exchange" active={pathname === "/exchange"} />
        ) : (
          <>
            <SectionRow
              label="Sportsbook" href="/exchange"
              active={pathname.startsWith("/exchange")}
              open={exchangeOpen} onToggle={() => setExchangeOpen(o => !o)}
              icon={<Trophy size={20} strokeWidth={2.5} className="text-white" />}
            />
            {exchangeOpen && (
              <div className="space-y-0.5 ml-2 pl-3">
                {(sports ?? []).map(s => (
                  <SubLink key={s.id} href={`/exchange?sport=${s.key}`}
                    active={pathname === "/exchange" && activeSport === s.key}
                    emoji={SPORT_EMOJI[s.key] ?? "🎯"}>
                    {s.name}
                  </SubLink>
                ))}
              </div>
            )}
          </>
        )}

        {/* Extra nav */}
        {EXTRA_NAV.map(({ href, label, icon }) => {
          const isActive = pathname === href;
          if (collapsed) {
            return <NavIcon key={href} icon={icon} href={href} active={isActive} />;
          }
          return (
            <NavRow key={href} href={href} active={isActive} icon={icon} label={label} />
          );
        })}
      </nav>

      {/* ── Total Bets (expanded only) ─────────────────────────── */}
      {!collapsed && (
        <div className="px-4 py-2 shrink-0" style={{ background: "rgba(139,92,246,0.06)" }}>
          <div className="text-[9px] uppercase tracking-wider text-white/30 mb-0.5">Total Bets Placed</div>
          <div className="text-sm font-bold text-white/50 tabular-nums tracking-tight">14,012,645,500</div>
        </div>
      )}
    </div>
  );
}

/* ── Shared Components ──────────────────────────────────────────── */

function NavIcon({ icon, href, active }: { icon: React.ReactNode; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-center w-10 h-10 mx-auto rounded-xl transition-all"
      style={{ background: active ? "#7740ed" : "#2c2852" }}
      title={undefined}
    >
      {icon}
    </Link>
  );
}

function NavRow({ href, active, icon, label }: { href: string; active: boolean; icon: React.ReactNode; label: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      href={href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-center gap-3 px-3 py-1.5 rounded-2xl text-[15px] font-bold text-white transition-all"
      style={{ background: hovered ? (active ? "#8a50f5" : "#3d3763") : (active ? "#7740ed" : "#2c2852") }}
    >
      {icon}
      {label}
    </Link>
  );
}

function SectionRow({ label, href, active, open, onToggle, icon }: {
  label: string; href: string; active: boolean; open: boolean; onToggle: () => void; icon: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const bg = hovered ? (active ? "#8a50f5" : "#5a5a8a") : (active ? "#7740ed" : "#463e7a");
  return (
    <div
      className="flex items-center rounded-2xl overflow-hidden transition-all"
      style={{ background: bg }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link
        href={href}
        className="flex-1 flex items-center gap-3 px-4 py-2 text-[15px] font-bold text-white"
      >
        {icon}{label}
      </Link>
      <button
        onClick={onToggle}
        className="shrink-0 w-10 h-10 flex items-center justify-center"
        aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
      >
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center transition-transform", open && "rotate-180")} style={{ background: "#605499" }}>
          <ChevronDown size={16} strokeWidth={2.5} className="text-white" />
        </div>
      </button>
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
        active ? "text-white" : "text-white/80 hover:text-white",
      )}
      style={{ background: "#2c2852" }}
    >
      <span className="text-base leading-none">{emoji}</span>
      {children}
    </Link>
  );
}

/* ── Export ──────────────────────────────────────────────────────── */
export function AppSidebar() {
  return (
    <Suspense fallback={<div className="h-full" />}>
      <SidebarInner />
    </Suspense>
  );
}
