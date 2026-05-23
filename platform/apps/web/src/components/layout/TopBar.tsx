"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowDownToLine, ArrowUpToLine, LogOut, Bell,
  ChevronDown, Search, Zap, Plus,
} from "lucide-react";
import useSWR from "swr";
import { useAuthStore } from "@/lib/stores/auth";
import { getSocket } from "@/lib/socket";
import { MobileSidebar } from "../mobile/MobileSidebar";

function fmtMoney(n: number | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
}

/* ── Rank system ─────────────────────────────────────────────
   Add more ranks here when icons are provided.
   Each rank has: an SVG icon and a bar color.
   Current rank: gold (wired to deposits later).
────────────────────────────────────────────────────────────── */
type Rank = "bronze" | "silver" | "gold" | "platinum" | "diamond";

const RANK_BAR_COLOR: Record<Rank, string> = {
  bronze:   "linear-gradient(90deg,#92400e,#d97706)",
  silver:   "linear-gradient(90deg,#6b7280,#d1d5db)",
  gold:     "linear-gradient(90deg,#b45309,#f59e0b,#fbbf24)",
  platinum: "linear-gradient(90deg,#0369a1,#38bdf8)",
  diamond:  "linear-gradient(90deg,#6d28d9,#a78bfa,#e879f9)",
};

function RankBadge({ rank, size = 28 }: { rank: Rank; size?: number }) {
  if (rank === "gold") {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Dark background circle */}
        <circle cx="20" cy="20" r="20" fill="#1a1a2e" />
        {/* Outer hex ring — deep orange */}
        <polygon
          points="20,4 34,12 34,28 20,36 6,28 6,12"
          fill="none"
          stroke="#c2410c"
          strokeWidth="2.5"
        />
        {/* Middle hex — amber */}
        <polygon
          points="20,8 31,14.5 31,25.5 20,32 9,25.5 9,14.5"
          fill="url(#goldOuter)"
        />
        {/* Inner hex — bright gold */}
        <polygon
          points="20,12 28,16.5 28,23.5 20,28 12,23.5 12,16.5"
          fill="url(#goldInner)"
        />
        {/* Center shine dot */}
        <circle cx="20" cy="20" r="3" fill="#fef3c7" fillOpacity="0.9" />
        <defs>
          <linearGradient id="goldOuter" x1="6" y1="8" x2="34" y2="32" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#d97706" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>
          <linearGradient id="goldInner" x1="12" y1="12" x2="28" y2="28" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="50%" stopColor="#fef08a" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
      </svg>
    );
  }
  // Fallback for future ranks — plain colored hexagon placeholder
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="20" fill="#1a1a2e" />
      <polygon points="20,6 32,13 32,27 20,34 8,27 8,13" fill="#4b5563" />
      <polygon points="20,11 28,15.5 28,24.5 20,29 12,24.5 12,15.5" fill="#6b7280" />
    </svg>
  );
}

export function TopBar() {
  const { user, clear } = useAuthStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: wallet, mutate } = useSWR(user ? "/wallet/summary" : null);

  useEffect(() => {
    if (!user) return;
    const s = getSocket();
    s.on("wallet:update", () => mutate());
    return () => { s.off("wallet:update"); };
  }, [user, mutate]);

  const balance = Number(wallet?.available ?? 0);

  return (
    <header className="sticky top-0 z-50 text-white" style={{ background: "#191938" }}>
      <MobileSidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* ─── Single row, all breakpoints ──────────────────── */}
      <div className="flex items-center h-[60px] md:h-[74px] px-3 md:px-4 gap-2 md:gap-4">

        {/* ── LEFT: hamburger (mobile) + logo ── */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <svg width="15" height="11" viewBox="0 0 15 11" fill="none">
              <rect width="15" height="2" rx="1" fill="white" fillOpacity="0.7" />
              <rect y="4.5" width="11" height="2" rx="1" fill="white" fillOpacity="0.7" />
              <rect y="9" width="7" height="2" rx="1" fill="white" fillOpacity="0.7" />
            </svg>
          </button>

          <Link href="/" className="shrink-0">
            <Image
              src="/logo.png" alt="Logo"
              width={48} height={48}
              className="rounded-full md:w-[64px] md:h-[64px]"
            />
          </Link>
        </div>

        {/* ── CENTER spacer / desktop balance ── */}
        {user ? (
          <>
            {/* Desktop balance + deposit — hidden on mobile */}
            <div
              className="hidden md:flex items-center gap-2 rounded-2xl px-3 py-2 border-2 mx-auto"
              style={{ background: "#1a1a2e", borderColor: "rgba(139,92,246,0.4)" }}
            >
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-6 h-6 rounded-lg" style={{ background: "rgba(139,92,246,0.2)" }}>
                  <span className="text-xs text-yellow-300 leading-none">₹</span>
                </div>
                <div className="flex flex-col items-start leading-tight">
                  <span className="text-[9px] text-white/50 uppercase tracking-wider">Balance</span>
                  <span className="text-[14px] font-black text-white tabular-nums">{fmtMoney(balance)}</span>
                </div>
              </div>
              <Link
                href="/account/deposit"
                className="flex items-center gap-1 font-black text-sm px-5 py-2 transition-all hover:scale-105 active:scale-95 shrink-0 relative overflow-hidden"
                style={{
                  background: "linear-gradient(135deg,#ffd400,#ffc400 45%,#f5b300 45%,#ffbf00)",
                  color: "white", border: "2px solid #c46818",
                  borderRadius: "14px", boxShadow: "inset 0 -5px 0 #c97700",
                  WebkitTextStroke: "0.7px #c46818", fontWeight: 900, letterSpacing: "-0.5px",
                }}
              >
                <div style={{ position: "absolute", top: 0, left: "35%", width: 70, height: "100%", background: "rgba(255,255,255,0.08)", transform: "skewX(-30deg)", zIndex: 0 }} />
                <span style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  <ArrowDownToLine size={16} strokeWidth={2.5} />Deposit
                </span>
              </Link>
            </div>

            {/* Mobile: push right section to the right */}
            <div className="flex-1 md:hidden" />
          </>
        ) : (
          <div className="flex items-center gap-2 mx-auto">
            <Link href="/auth/login"
              className="rounded-lg border border-white/20 px-4 py-2 text-[13px] font-bold text-white hover:bg-white/10 transition">
              Login
            </Link>
            <Link href="/auth/register"
              className="rounded-lg font-bold text-[13px] px-4 py-2 transition hover:brightness-110"
              style={{ background: "linear-gradient(135deg,#d4a017,#f0c030)", color: "#1a0a00" }}>
              Sign up
            </Link>
          </div>
        )}

        {/* ── RIGHT: mobile balance + icons ── */}
        {user && (
          <div className="flex items-center gap-1.5 md:gap-2 shrink-0">

            {/* Mobile: compact balance pill */}
            <div
              className="md:hidden flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 shrink-0"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.09)" }}
            >
              <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                <span className="text-[9px] font-black text-white">₹</span>
              </div>
              <span className="text-[12px] font-bold text-white tabular-nums leading-none">
                {balance.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </span>
            </div>

            {/* Mobile: yellow deposit + button */}
            <Link
              href="/account/deposit"
              className="md:hidden flex items-center justify-center w-9 h-9 rounded-xl shrink-0 active:scale-95 transition-all"
              style={{
                background: "linear-gradient(135deg,#ffcc00,#ffb700)",
                boxShadow: "0 4px 12px rgba(255,180,0,0.4), inset 0 -3px 0 rgba(0,0,0,0.15)",
              }}
            >
              <Plus size={17} strokeWidth={3} className="text-white" />
            </Link>

            {/* Desktop-only: withdraw */}
            <Link
              href="/account/withdraw"
              className="hidden sm:flex items-center gap-1.5 rounded-lg border border-white/15 text-white/60 hover:text-white hover:border-white/30 font-semibold text-[13px] px-3 py-2 transition"
            >
              <ArrowUpToLine size={13} />
            </Link>

            {/* Desktop-only: search */}
            <button className="hidden sm:flex w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 items-center justify-center transition">
              <Search size={15} className="text-white/55" />
            </button>

            {/* Desktop-only: lightning */}
            <button
              className="hidden sm:flex w-10 h-10 rounded-lg items-center justify-center transition hover:brightness-110"
              style={{ background: "linear-gradient(135deg,#5b21b6,#7c3aed)" }}
            >
              <Zap size={15} className="text-yellow-300" fill="currentColor" />
            </button>

            {/* Bell — all viewports */}
            <NotificationBell />

            {/* Profile menu — all viewports */}
            <ProfileMenu username={user.username} onLogout={clear} />
          </div>
        )}
      </div>
    </header>
  );
}

/* ── Notification Bell ──────────────────────────────────────── */
function NotificationBell() {
  const { data } = useSWR<{ id: string }[]>(
    "/api/announcements/active",
    (url: string) => fetch(url).then(r => r.json()),
    { refreshInterval: 60_000 },
  );
  const count = data?.length ?? 0;
  return (
    <Link
      href="/account/notifications"
      className="relative flex w-9 h-9 md:w-10 md:h-10 rounded-lg items-center justify-center transition"
      style={{ background: "rgba(255,255,255,0.05)" }}
      title="Notifications"
    >
      <Bell size={15} className="text-white/55" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-0.5 rounded-full bg-green-500 text-[9px] font-bold grid place-items-center text-white">
          {count}
        </span>
      )}
    </Link>
  );
}

/* ── Profile Menu ───────────────────────────────────────────── */
function ProfileMenu({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);

  // Wire these to real deposit data later
  const rank: Rank = "gold";
  const level = 1;
  const progress = 0;
  const barColor = RANK_BAR_COLOR[rank];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 md:gap-2 h-9 md:h-10 px-1.5 md:px-2 rounded-xl transition"
        style={{ background: "rgba(255,255,255,0.05)" }}
      >
        {/* Rank badge icon */}
        <RankBadge rank={rank} size={30} />

        {/* Name + level bar — desktop only */}
        <div className="hidden sm:flex flex-col gap-[3px] min-w-0" style={{ width: 80 }}>
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-semibold text-white/90 truncate leading-none">
              {username}
            </span>
            <span className="text-[9px] font-bold text-amber-400 leading-none shrink-0 capitalize">
              {rank}
            </span>
          </div>
          <div className="h-[3px] w-full rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${progress}%`,
                background: barColor,
                boxShadow: progress > 0 ? "0 0 6px rgba(251,191,36,0.8)" : "none",
              }}
            />
          </div>
        </div>

        <ChevronDown size={12} className="text-white/30 shrink-0" />
      </button>

      {open && (
        <>
          {/* Backdrop for mobile */}
          <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 mt-2 w-56 rounded-xl border border-white/10 p-1.5 shadow-2xl z-50"
            style={{ background: "#1a1330" }}
          >
            {/* Mobile: show rank badge + username + level bar in dropdown */}
            <div className="sm:hidden px-3 py-2.5 mb-1 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
              <div className="flex items-center gap-2.5">
                <RankBadge rank={rank} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[13px] font-bold text-white truncate">{username}</span>
                    <span className="text-[9px] font-bold text-amber-400 shrink-0 capitalize">{rank}</span>
                  </div>
                  <div className="h-[3px] w-full rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${progress}%`, background: barColor }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {([
              ["Dashboard",         "/account"],
              ["My Bets",           "/account/bets"],
              ["Account Statement", "/account/statement"],
              ["Profit / Loss",     "/account/pl"],
              ["Notifications",     "/account/notifications"],
              ["Deposit",           "/account/deposit"],
              ["Withdraw",          "/account/withdraw"],
              ["Security & 2FA",    "/account/security"],
            ] as const).map(([l, h]) => (
              <Link
                key={h} href={h}
                className="block px-3 py-2 text-[13px] rounded-lg text-white/70 hover:text-white font-medium transition"
                style={{ background: "transparent" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                onClick={() => setOpen(false)}
              >
                {l}
              </Link>
            ))}
            <div className="h-px my-1" style={{ background: "rgba(255,255,255,0.08)" }} />
            <button
              onClick={onLogout}
              className="flex w-full items-center gap-2 px-3 py-2 text-[13px] rounded-lg text-red-400 font-medium transition hover:bg-red-900/20"
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
