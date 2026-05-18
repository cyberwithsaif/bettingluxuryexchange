"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Wallet, ArrowDownToLine, ArrowUpToLine, User2, LogOut } from "lucide-react";
import useSWR from "swr";
import { useAuthStore } from "@/lib/stores/auth";
import { getSocket } from "@/lib/socket";
import { cn } from "@/lib/cn";

function useLiveClock() {
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString("en-IN", { hour12: false }));
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

  useEffect(() => {
    if (!user) return;
    const s = getSocket();
    s.on("wallet:update", () => mutate());
    return () => { s.off("wallet:update"); };
  }, [user, mutate]);

  return (
    <header className="sticky top-0 z-50 glass border-b border-line">
      <div className="mx-auto max-w-[1600px] flex items-center gap-4 px-4 h-14">
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-accent-grad font-display text-xl text-ink shadow-glow">
            E
          </span>
          <span className="font-display text-2xl tracking-wide bg-accent-grad bg-clip-text text-transparent">
            Exch
          </span>
        </Link>

        <div className="hidden md:flex items-center text-xs text-white/60 gap-2 ml-2">
          <span className="inline-block h-2 w-2 rounded-full bg-ok animate-pulseGlow" />
          {clock} IST
        </div>

        <div className="flex-1" />

        {user ? (
          <>
            <div className="hidden sm:flex items-center gap-4 text-sm">
              <Stat label="Balance" value={fmtMoney(wallet?.available)} highlight />
              <Stat label="Exposure" value={fmtMoney(wallet?.exposure)} tone="bad" />
            </div>
            <Link
              href="/account/deposit"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-md bg-accent-grad px-3 py-1.5 text-sm font-semibold text-ink shadow-glow hover:brightness-110"
            >
              <ArrowDownToLine size={14} /> Deposit
            </Link>
            <Link
              href="/account/withdraw"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-line bg-panel/60 px-3 py-1.5 text-sm font-semibold hover:border-accent"
            >
              <ArrowUpToLine size={14} /> Withdraw
            </Link>
            <ProfileMenu username={user.username} onLogout={clear} />
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Link href="/auth/login"    className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-accent">Login</Link>
            <Link href="/auth/register" className="rounded-md bg-accent-grad px-3 py-1.5 text-sm font-semibold text-ink shadow-glow hover:brightness-110">Sign up</Link>
          </div>
        )}
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
      <button onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-2 rounded-md border border-line bg-panel/60 px-3 py-1.5 text-sm hover:border-accent">
        <User2 size={14} />
        <span className="hidden sm:inline">{username}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-52 rounded-md glass p-1 shadow-panel">
          {[
            ["Dashboard", "/account"],
            ["My Bets", "/account/bets"],
            ["Account Statement", "/account/statement"],
            ["Profit / Loss", "/account/pl"],
            ["Security & 2FA", "/account/security"],
          ].map(([l, h]) => (
            <Link key={h} href={h} className="block px-3 py-2 text-sm rounded hover:bg-panel2" onClick={() => setOpen(false)}>{l}</Link>
          ))}
          <button onClick={onLogout} className="flex w-full items-center gap-2 px-3 py-2 text-sm rounded text-bad hover:bg-panel2">
            <LogOut size={14}/> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function fmtMoney(n: number | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
}
