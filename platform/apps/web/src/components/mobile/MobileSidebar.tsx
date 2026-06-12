"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { X, ChevronDown, House, Gamepad2, Trophy, TrendingUp, Award, Activity, Megaphone, Share2, Gift as GiftBox, Crown, Heart, Globe, Headphones } from "lucide-react";
import { useState, Suspense } from "react";
import React from "react";
import useSWR from "swr";
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
  { href: "/predictions", label: "Predictions",    icon: <TrendingUp size={18} strokeWidth={2.5} className="text-white shrink-0" /> },
  { href: "/rewards",     label: "Rewards",         icon: <Award      size={18} strokeWidth={2.5} className="text-white shrink-0" /> },
  { href: "/live-rtp",    label: "Live RTP",         icon: <Activity   size={18} strokeWidth={2.5} className="text-white shrink-0" /> },
  { href: "/promotions",  label: "Promotions",       icon: <Megaphone  size={18} strokeWidth={2.5} className="text-white shrink-0" /> },
  { href: "/refer-earn",  label: "Refer & Earn",     icon: <Share2     size={18} strokeWidth={2.5} className="text-white shrink-0" /> },
  { href: "/redeem",      label: "Redeem",           icon: <GiftBox    size={18} strokeWidth={2.5} className="text-white shrink-0" /> },
  { href: "/vip-club",    label: "VIP Club",         icon: <Crown      size={18} strokeWidth={2.5} className="text-white shrink-0" /> },
  { href: "/responsible", label: "Our Responsibly",  icon: <Heart      size={18} strokeWidth={2.5} className="text-white shrink-0" /> },
  { href: "/language",    label: "English",          icon: <Globe      size={18} strokeWidth={2.5} className="text-white shrink-0" /> },
  { href: "/contact",     label: "Live Support",     icon: <Headphones size={18} strokeWidth={2.5} className="text-white shrink-0" /> },
];

function MobileSidebarInner({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname     = usePathname();
  const params       = useSearchParams();
  const activeSport  = params.get("sport") ?? "cricket";
  const [casinoOpen,   setCasinoOpen]   = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const { data: sports } = useSWR<Sport[]>("/markets/sports");

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "md:hidden fixed inset-0 z-[60] bg-black/60 transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className={cn(
          "md:hidden fixed top-0 left-0 bottom-0 z-[61] w-[260px] flex flex-col shadow-2xl transition-transform duration-300",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        style={{ background: "#0f172a", borderRight: "1px solid rgba(139,92,246,0.15)" }}
      >
        {/* ── Logo / header ── */}
        <div
          className="shrink-0 h-[60px] flex items-center justify-between px-4"
          style={{ background: "linear-gradient(135deg,#1e3a5f 0%,#0f172a 100%)", borderBottom: "1px solid rgba(255,204,0,0.12)" }}
        >
          <div className="flex items-center gap-2.5">
            <span
              className="h-8 w-8 grid place-items-center rounded-lg font-black text-lg text-slate-900 shrink-0"
              style={{ background: "linear-gradient(135deg,#ffcc00,#f59e0b)" }}
            >D</span>
            <div>
              <div className="font-black text-sm text-white tracking-tight">DiamondPlay22</div>
              <div className="text-[9px] uppercase tracking-[0.18em] text-yellow-400/70">Menu</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Nav ── */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">

          {/* Home */}
          <NavRow
            href="/"
            active={pathname === "/"}
            icon={<House size={18} strokeWidth={2.5} className="text-white shrink-0" />}
            label="Home"
            onClick={onClose}
          />

          {/* Casino */}
          <SectionRow
            label="Casino"
            href="/casino"
            active={pathname.startsWith("/casino")}
            open={casinoOpen}
            onToggle={() => setCasinoOpen(o => !o)}
            icon={<Gamepad2 size={18} strokeWidth={2.5} className="text-white shrink-0" />}
            onLinkClick={onClose}
          />
          {casinoOpen && (
            <div className="space-y-0.5 ml-2 pl-3" style={{ borderLeft: "2px solid rgba(139,92,246,0.25)" }}>
              {CASINO_GAMES.map(g => (
                <SubLink key={g.href} href={g.href} active={pathname === g.href} emoji={g.emoji} onClick={onClose}>
                  {g.label}
                </SubLink>
              ))}
            </div>
          )}

          {/* Sportsbook */}
          <SectionRow
            label="Sportsbook"
            href="/exchange"
            active={pathname.startsWith("/exchange")}
            open={exchangeOpen}
            onToggle={() => setExchangeOpen(o => !o)}
            icon={<Trophy size={18} strokeWidth={2.5} className="text-white shrink-0" />}
            onLinkClick={onClose}
          />
          {exchangeOpen && (
            <div className="space-y-0.5 ml-2 pl-3" style={{ borderLeft: "2px solid rgba(139,92,246,0.25)" }}>
              {(sports ?? []).map(s => (
                <SubLink
                  key={s.id}
                  href={`/exchange?sport=${s.key}`}
                  active={pathname === "/exchange" && activeSport === s.key}
                  emoji={SPORT_EMOJI[s.key] ?? "🎯"}
                  onClick={onClose}
                >
                  {s.name}
                </SubLink>
              ))}
            </div>
          )}

          {/* Divider */}
          <div className="my-2 mx-3 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

          {/* Extra nav */}
          {EXTRA_NAV.map(({ href, label, icon }) => (
            <NavRow
              key={href}
              href={href}
              active={pathname === href}
              icon={icon}
              label={label}
              onClick={onClose}
            />
          ))}
        </nav>

        {/* ── Footer ── */}
        <div className="shrink-0 px-4 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(139,92,246,0.06)" }}>
          <div className="text-[9px] uppercase tracking-wider text-white/25 mb-0.5">Total Bets Placed</div>
          <div className="text-sm font-bold text-white/40 tabular-nums">14,012,645,500</div>
        </div>
      </aside>
    </>
  );
}

/* ── Shared sub-components ── */

function NavRow({ href, active, icon, label, onClick }: {
  href: string; active: boolean; icon: React.ReactNode; label: string; onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2 rounded-2xl text-[14px] font-bold text-white transition-all"
      style={{ background: active ? "#7740ed" : "#2c2852" }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#3d3763"; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "#2c2852"; }}
    >
      {icon}
      {label}
    </Link>
  );
}

function SectionRow({ label, href, active, open, onToggle, icon, onLinkClick }: {
  label: string; href: string; active: boolean; open: boolean;
  onToggle: () => void; icon: React.ReactNode; onLinkClick: () => void;
}) {
  return (
    <div
      className="flex items-center rounded-2xl overflow-hidden transition-all"
      style={{ background: active ? "#7740ed" : "#463e7a" }}
    >
      <Link
        href={href}
        onClick={onLinkClick}
        className="flex-1 flex items-center gap-3 px-3 py-2 text-[14px] font-bold text-white"
      >
        {icon}{label}
      </Link>
      <button
        onClick={onToggle}
        className="shrink-0 w-10 h-9 flex items-center justify-center"
        aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
      >
        <div
          className={cn("w-7 h-7 rounded-lg flex items-center justify-center transition-transform", open && "rotate-180")}
          style={{ background: "#605499" }}
        >
          <ChevronDown size={14} strokeWidth={2.5} className="text-white" />
        </div>
      </button>
    </div>
  );
}

function SubLink({ href, active, emoji, children, onClick }: {
  href: string; active: boolean; emoji: string; children: React.ReactNode; onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 text-[13px] font-semibold transition-all rounded-lg",
        active ? "text-white" : "text-white/75 hover:text-white",
      )}
      style={{ background: "#2c2852" }}
    >
      <span className="text-sm leading-none">{emoji}</span>
      {children}
    </Link>
  );
}

/* ── Export ── */
export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Suspense fallback={null}>
      <MobileSidebarInner open={open} onClose={onClose} />
    </Suspense>
  );
}
