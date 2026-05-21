"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowDownToLine, ArrowUpToLine, User2, LogOut, Bell,
  ChevronDown, Search, Zap, MessageCircle, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import useSWR from "swr";
import { useAuthStore } from "@/lib/stores/auth";
import { getSocket } from "@/lib/socket";
import { cn } from "@/lib/cn";
import { MobileSidebar } from "../mobile/MobileSidebar";

interface PublicSettings { siteName?: string; siteTagline?: string; }

function useLiveClock() {
  const [now, setNow] = useState("");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(
        d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
        " " +
        d.toLocaleTimeString("en-US", { hour12: true }) +
        " (+05:30)",
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function fmtMoney(n: number | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
}

export function TopBar() {
  const clock = useLiveClock();
  const { user, clear } = useAuthStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const { data: wallet, mutate } = useSWR(user ? "/wallet/summary" : null);
  const pFetch = (url: string) => fetch(url).then(r => r.json());
  const { data: announcements } = useSWR<{ id: string; text: string }[]>(
    "/api/announcements/active", pFetch, { refreshInterval: 60_000 },
  );
  const { data: platformSettings } = useSWR<PublicSettings>(
    "/api/platform/settings", pFetch, { refreshInterval: 300_000 },
  );

  const marqueeText =
    announcements?.length
      ? announcements.map(a => `📢 ${a.text}`).join("  •  ")
      : "🎉 Welcome to " + (platformSettings?.siteName ?? "DiamondPlay22") + " — Bet Now & Win Big!";

  useEffect(() => {
    if (!user) return;
    const s = getSocket();
    s.on("wallet:update", () => mutate());
    return () => { s.off("wallet:update"); };
  }, [user, mutate]);

  // Toggle sidebar by flipping data attribute on the sidebar aside element
  function toggleSidebar() {
    setSidebarCollapsed(c => !c);
    const sidebar = document.querySelector("aside.app-sidebar") as HTMLElement | null;
    if (sidebar) {
      sidebar.style.display = sidebar.style.display === "none" ? "" : "none";
    }
  }

  return (
    <header className="sticky top-0 z-50 bg-[#191938] text-white shadow-sm rounded-br-2xl">
      <MobileSidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <div className="flex items-center h-16 px-3 justify-between gap-4">

        {/* ── Left section (logo + toggle) ──────────────────── */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Sidebar toggle (desktop) */}
          <button
            onClick={toggleSidebar}
            className="hidden md:flex w-10 h-10 rounded-xl items-center justify-center transition-all group"
            style={{
              background: "linear-gradient(135deg, rgba(139, 92, 246, 0.4), rgba(168, 85, 247, 0.2))",
              boxShadow: "0 8px 20px rgba(139, 92, 246, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -2px 8px rgba(0, 0, 0, 0.3)",
              border: "1px solid rgba(139, 92, 246, 0.3)",
            }}
            title="Toggle sidebar"
          >
            {/* Beautiful custom arrow */}
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="group-hover:text-violet-100 transition-colors" style={{ color: "rgb(196, 181, 253)" }}>
              <path d="M8 5L3 10M3 10L8 15M3 10H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Mobile hamburger */}
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="md:hidden w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition shrink-0"
          >
            <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
              <rect width="16" height="2" rx="1" fill="currentColor" />
              <rect y="5" width="12" height="2" rx="1" fill="currentColor" />
              <rect y="10" width="8" height="2" rx="1" fill="currentColor" />
            </svg>
          </button>

          {/* Logo — both mobile and desktop */}
          <Link href="/" className="flex flex-col leading-none">
            <span className="font-display italic text-lg font-black tracking-tight text-white uppercase">
              {platformSettings?.siteName ?? "DiamondPlay22"}
            </span>
          </Link>
        </div>

        {/* ── Center section (balance + deposit) ────────────── */}
        {user ? (
          <div className="flex items-center gap-2 md:gap-3 justify-center flex-1">

            {/* Balance pill */}
            <div
              className="hidden sm:flex items-center gap-1.5 rounded-full px-4 py-2 cursor-default group transition-all hover:scale-105"
              style={{
                background: "linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(168, 85, 247, 0.1))",
                boxShadow: "0 8px 24px rgba(139, 92, 246, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(139, 92, 246, 0.3)",
              }}
            >
              <span className="text-base leading-none text-yellow-300">₹</span>
              <div className="flex flex-col items-end leading-tight">
                <span className="text-[13px] font-bold text-white tabular-nums">
                  {fmtMoney(wallet?.available)}
                </span>
                {(wallet?.exposure ?? 0) > 0 && (
                  <span className="text-[9px] text-red-400 tabular-nums">
                    -{fmtMoney(wallet?.exposure)}
                  </span>
                )}
              </div>
              <ChevronDown size={12} className="text-white/40 group-hover:text-white/60 transition-colors" />
            </div>

            {/* Deposit button — yellow like Roobet */}
            <Link
              href="/account/deposit"
              className="flex items-center gap-1.5 rounded-xl font-bold text-[13px] px-5 py-2.5 transition-all hover:brightness-125 active:scale-95 shrink-0 hover:scale-105 shadow-lg"
              style={{
                background: "linear-gradient(135deg,#ffd700,#ffed4e)",
                color: "#1a0a00",
                boxShadow: "0 8px 24px rgba(255, 215, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.4), inset 0 -2px 8px rgba(0, 0, 0, 0.15)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
              }}
            >
              <ArrowDownToLine size={14} />
              <span className="hidden sm:inline">Deposit</span>
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-2 justify-center flex-1">
            <Link
              href="/auth/login"
              className="rounded-lg border border-white/20 px-4 py-2 text-[13px] font-bold text-white hover:bg-white/10 transition"
            >
              Login
            </Link>
            <Link
              href="/auth/register"
              className="rounded-lg font-bold text-[13px] px-4 py-2 transition hover:brightness-110"
              style={{ background: "linear-gradient(135deg,#d4a017,#f0c030)", color: "#1a0a00" }}
            >
              Sign up
            </Link>
          </div>
        )}

        {/* ── Right section (icons) ────────────────────────────── */}
        {user && (
          <div className="flex items-center gap-2 shrink-0">
            {/* Withdraw — outline on desktop */}
            <Link
              href="/account/withdraw"
              className="hidden sm:flex items-center gap-1.5 rounded-lg border border-white/15 text-white/60 hover:text-white hover:border-white/30 font-semibold text-[13px] px-3 py-2 transition"
            >
              <ArrowUpToLine size={13} />
            </Link>

            {/* Search */}
            <button className="hidden sm:flex w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 items-center justify-center transition">
              <Search size={15} className="text-white/55" />
            </button>

            {/* Lightning / promo — purple like Roobet */}
            <button className="relative hidden sm:flex w-9 h-9 rounded-lg items-center justify-center transition hover:brightness-110"
              style={{ background: "linear-gradient(135deg,#5b21b6,#7c3aed)" }}>
              <Zap size={15} className="text-yellow-300" fill="currentColor" />
            </button>

            {/* Notification bell */}
            <NotificationBell />

            {/* User menu */}
            <ProfileMenu username={user.username} onLogout={clear} />
          </div>
        )}
      </div>
    </header>
  );
}

/* ── Notification Bell ──────────────────────────────────────── */
function NotificationBell() {
  const pFetch = (url: string) => fetch(url).then(r => r.json());
  const { data } = useSWR<{ id: string }[]>("/api/announcements/active", pFetch, { refreshInterval: 60_000 });
  const count = data?.length ?? 0;
  return (
    <Link
      href="/account/notifications"
      className="relative flex w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 items-center justify-center transition"
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
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 h-9 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 transition"
      >
        {/* Hexagon-style avatar like Roobet */}
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white shrink-0"
          style={{ background: "linear-gradient(135deg,#7c3aed,#c026d3)" }}
        >
          {username[0]?.toUpperCase()}
        </div>
        <span className="hidden sm:inline text-[13px] font-semibold text-white/80 max-w-[80px] truncate">
          {username}
        </span>
        <ChevronDown size={12} className="text-white/30" />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-52 rounded-xl border border-white/10 p-1.5 shadow-2xl z-50"
          style={{ background: "#1a1330" }}
        >
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
              className="block px-3 py-2 text-[13px] rounded-lg hover:bg-white/6 text-white/70 hover:text-white font-medium transition"
              onClick={() => setOpen(false)}
            >
              {l}
            </Link>
          ))}
          <div className="h-px bg-white/8 my-1" />
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-2 px-3 py-2 text-[13px] rounded-lg text-red-400 hover:bg-red-900/20 font-medium transition"
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
