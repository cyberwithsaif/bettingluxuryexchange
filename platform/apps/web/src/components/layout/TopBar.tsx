"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowDownToLine, ArrowUpToLine, LogOut, Bell,
  ChevronDown, Search, Zap,
  Wallet, Plus,
} from "lucide-react";
import useSWR from "swr";
import { useAuthStore } from "@/lib/stores/auth";
import { getSocket } from "@/lib/socket";
import { MobileSidebar } from "../mobile/MobileSidebar";


function fmtMoney(n: number | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
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

  return (
    <header className="sticky top-0 z-50 bg-[#191938] text-white shadow-sm rounded-br-2xl">
      <MobileSidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <div className="flex items-center h-[74px] px-4 justify-between gap-4">

        {/* ── Left section ──────────────────────────────────── */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Mobile menu button */}
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="md:hidden w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition shrink-0"
          >
            <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
              <rect width="16" height="2" rx="1" fill="currentColor" />
              <rect y="5" width="12" height="2" rx="1" fill="currentColor" />
              <rect y="10" width="8" height="2" rx="1" fill="currentColor" />
            </svg>
          </button>

          {/* Logo — left side, all viewports */}
          <Link href="/" className="shrink-0">
            <Image src="/logo.png" alt="Logo" width={54} height={54} className="rounded-full md:w-[62px] md:h-[62px]" />
          </Link>
        </div>

        {/* ── Center section ────────────────────────────── */}
        {user ? (
          <div className="flex items-center gap-2 md:gap-3 justify-center flex-1">

            {/* Mobile balance + deposit */}
            <div className="flex md:hidden items-center gap-2 flex-1 justify-center">
              <div
                className="flex items-center gap-2 rounded-xl px-3 py-1.5 cursor-default"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500 shrink-0">
                  <Wallet size={14} className="text-white" strokeWidth={2.5} />
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-[9px] text-white/50 leading-none">Balance</span>
                  <span className="text-[13px] font-bold text-white tabular-nums">
                    ₹{Number(wallet?.available ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              <Link
                href="/account/deposit"
                className="flex items-center justify-center w-10 h-10 shrink-0 transition-all active:scale-95 hover:brightness-110"
                style={{
                  background: "linear-gradient(135deg, #ffcc00 0%, #ffcc00 50%, #ffb700 100%)",
                  boxShadow: "0 6px 16px rgba(255, 150, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -2px 6px rgba(0,0,0,0.15)",
                  border: "none",
                  borderRadius: "10px 10px 6px 1px",
                  clipPath: "polygon(0 0, 100% 0, 95% 100%, 0 100%)",
                }}
              >
                <Plus size={18} className="text-white" strokeWidth={3} />
              </Link>
            </div>

            {/* Desktop balance + deposit card — unified */}
            <div
              className="hidden md:flex items-center gap-2 rounded-2xl px-3 py-2 border-2"
              style={{
                background: "#1a1a2e",
                borderColor: "rgba(139, 92, 246, 0.4)",
              }}
            >
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-6 h-6 rounded-lg" style={{ background: "rgba(139, 92, 246, 0.2)" }}>
                  <span className="text-xs leading-none text-yellow-300">₹</span>
                </div>
                <div className="flex flex-col items-start leading-tight">
                  <span className="text-[9px] text-white/50 uppercase tracking-wider">Balance</span>
                  <span className="text-[14px] font-black text-white tabular-nums">
                    {fmtMoney(wallet?.available)}
                  </span>
                </div>
              </div>

              <Link
                href="/account/deposit"
                className="flex items-center justify-center gap-1 font-black text-sm px-5 py-2 transition-all hover:scale-105 active:scale-95 shrink-0 relative overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, #ffd400 0%, #ffc400 45%, #f5b300 45%, #ffbf00 100%)",
                  color: "white",
                  border: "2px solid #c46818",
                  borderRadius: "14px",
                  boxShadow: "inset 0 -5px 0 #c97700",
                  WebkitTextStroke: "0.7px #c46818",
                  fontWeight: "900",
                  letterSpacing: "-0.5px",
                }}
              >
                {/* Glossy effect */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: "35%",
                    width: "70px",
                    height: "100%",
                    background: "rgba(255,255,255,0.08)",
                    transform: "skewX(-30deg)",
                    zIndex: 0,
                  }}
                />
                <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  <ArrowDownToLine size={16} strokeWidth={2.5} />
                  <span>Deposit</span>
                </div>
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 justify-center flex-1">
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
            <button className="hidden sm:flex w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 items-center justify-center transition">
              <Search size={15} className="text-white/55" />
            </button>

            {/* Lightning / promo — purple like Roobet */}
            <button className="relative hidden sm:flex w-10 h-10 rounded-lg items-center justify-center transition hover:brightness-110"
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
      className="relative flex w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 items-center justify-center transition"
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
