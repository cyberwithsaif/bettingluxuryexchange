"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Wallet, ArrowDownToLine, ArrowUpToLine, User2, LogOut, Bell, Sun, Volume2, ChevronDown } from "lucide-react";
import useSWR from "swr";
import { useAuthStore } from "@/lib/stores/auth";
import { getSocket } from "@/lib/socket";
import { cn } from "@/lib/cn";

const MARQUEE_FALLBACK = "📢 Live Matka Markets Now Available — Play Smart, Win Big! • Bet Now in Line Markets and Get Commission Upto 2%";

function useLiveClock() {
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " " + d.toLocaleTimeString("en-US", { hour12: true }) + "(+05:30)");
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function TopBar() {
  const clock = useLiveClock();
  const { user, clear } = useAuthStore();
  const { data: wallet, mutate } = useSWR(user ? "/wallet/summary" : null);
  const { data: announcements } = useSWR<Array<{ id: string; text: string }>>("/announcements/active", { refreshInterval: 60_000 });
  const marqueeText = announcements && announcements.length > 0
    ? announcements.map((a) => `📢 ${a.text}`).join(" • ")
    : MARQUEE_FALLBACK;

  useEffect(() => {
    if (!user) return;
    const s = getSocket();
    s.on("wallet:update", () => mutate());
    return () => { s.off("wallet:update"); };
  }, [user, mutate]);

  return (
    <header className="sticky top-0 z-50 bg-brandRed text-white shadow-md">
      <div className="mx-auto max-w-[1600px] flex items-center justify-between px-4 h-16">
        
        {/* Left: Logo & Clock */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex flex-col leading-none">
            <span className="font-display italic text-3xl font-black tracking-tight flex items-center gap-1">
              FUTURE <span className="text-xl">🏏</span>
            </span>
            <span className="text-[10px] uppercase tracking-widest font-semibold text-white/90">
              — Sports & Casino —
            </span>
          </Link>
          <div className="hidden lg:block text-xs font-medium text-white/90">
            {clock}
          </div>
        </div>

        {/* Middle: Marquee */}
        <div className="hidden md:flex flex-1 max-w-2xl mx-8 items-center overflow-hidden whitespace-nowrap text-sm font-semibold">
          <div className="flex items-center gap-2 animate-marquee w-full">
            <Volume2 size={16} className="shrink-0" />
            <span>{marqueeText}</span>
          </div>
        </div>

        {/* Right: Actions & User */}
        <div className="flex items-center gap-4">
          <button className="hidden sm:block hover:text-white/80 transition">
            <Sun size={18} />
          </button>

          {user ? (
            <>
              <div className="flex items-center gap-2">
                <Link
                  href="/account/deposit"
                  className="flex items-center gap-1.5 rounded bg-white px-4 py-1.5 text-sm font-bold text-brandRed hover:bg-gray-100 transition"
                >
                  <ArrowDownToLine size={16} /> DEPOSIT
                </Link>
                <Link
                  href="/account/withdraw"
                  className="flex items-center gap-1.5 rounded bg-white px-4 py-1.5 text-sm font-bold text-brandRed hover:bg-gray-100 transition"
                >
                  <ArrowUpToLine size={16} /> WITHDRAW
                </Link>
              </div>

              <div className="hidden sm:flex flex-col text-right leading-tight ml-2">
                <span className="text-[11px] font-semibold">Points: <span className="font-bold">{fmtMoney(wallet?.available)}</span></span>
                <span className="text-[11px] font-semibold text-white/80">Exposure: <span className="font-bold">{fmtMoney(wallet?.exposure)}</span></span>
              </div>

              <ProfileMenu username={user.username} onLogout={clear} />
            </>
          ) : (
            <div className="flex items-center gap-3">
              <Link href="/auth/login" className="rounded bg-white px-5 py-1.5 text-sm font-bold text-brandRed hover:bg-gray-100">Login</Link>
              <Link href="/auth/register" className="rounded bg-brandYellow px-5 py-1.5 text-sm font-bold text-ink hover:brightness-110">Sign up</Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function Stat({ label, value, highlight, tone }: { label: string; value: string; highlight?: boolean; tone?: "bad" }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[10px] uppercase tracking-wider text-white/50">{label}</span>
      <span className={cn(
        "font-semibold tabular-nums",
        highlight && "text-accent",
        tone === "bad" && "text-bad",
      )}>
        {value}
      </span>
    </div>
  );
}

function ProfileMenu({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 hover:bg-black/10 rounded-full py-1 px-2 transition">
        <div className="bg-white rounded-full p-1 text-brandRed">
          <User2 size={16} />
        </div>
        <span className="hidden sm:inline font-bold text-sm">{username}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-52 rounded-md bg-white border border-gray-200 p-1 shadow-panel text-ink z-50">
          {(
            [
              ["Dashboard", "/account"],
              ["My Bets", "/account/bets"],
              ["Account Statement", "/account/statement"],
              ["Profit / Loss", "/account/pl"],
              ["Notifications", "/account/notifications"],
              ["Security & 2FA", "/account/security"],
            ] as const
          ).map(([l, h]) => (
            <Link key={h} href={h} className="block px-3 py-2 text-sm rounded hover:bg-gray-100 font-medium" onClick={() => setOpen(false)}>{l}</Link>
          ))}
          <button onClick={onLogout} className="flex w-full items-center gap-2 px-3 py-2 text-sm rounded text-bad hover:bg-gray-100 font-medium">
            <LogOut size={14}/> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function NotificationBell() {
  const { data } = useSWR<Array<{ id: string }>>("/announcements/active", { refreshInterval: 60_000 });
  const count = data?.length ?? 0;
  return (
    <Link
      href="/account/notifications"
      className="relative inline-flex items-center justify-center h-9 w-9 rounded-md border border-line bg-panel/60 hover:border-accent transition"
      title="Notifications"
    >
      <Bell size={15} />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-0.5 rounded-full bg-bad text-[9px] font-bold grid place-items-center text-white">
          {count}
        </span>
      )}
    </Link>
  );
}

function fmtMoney(n: number | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
}
