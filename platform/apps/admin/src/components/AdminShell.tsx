"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  LayoutDashboard, Users, ArrowDownToLine, ArrowUpToLine, Activity,
  Settings, Key, ListChecks, ShieldAlert, LogOut, Gamepad2, Trophy,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/lib/stores/auth";

const NAV = [
  { href: "/",              label: "Dashboard",     Icon: LayoutDashboard },
  { href: "/users",         label: "Users",         Icon: Users },
  { href: "/deposits",      label: "Deposits",      Icon: ArrowDownToLine },
  { href: "/withdrawals",   label: "Withdrawals",   Icon: ArrowUpToLine },
  { href: "/markets",       label: "Markets",       Icon: Trophy },
  { href: "/casino",        label: "Casino",        Icon: Gamepad2 },
  { href: "/risk",          label: "Live Risk",     Icon: ShieldAlert },
  { href: "/api-keys",      label: "API Keys",      Icon: Key },
  { href: "/logs",          label: "Audit Logs",    Icon: ListChecks },
  { href: "/settings",      label: "Settings",      Icon: Settings },
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, clear } = useAuthStore();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!user && path !== "/login") router.replace("/login");
  }, [user, path, router]);

  if (!user) return null;
  if (path === "/login") return <>{children}</>;

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-panel/80 border-r border-line flex flex-col">
        <div className="px-5 py-4 flex items-center gap-2 border-b border-line">
          <span className="h-9 w-9 grid place-items-center rounded-md bg-accent-grad font-display text-xl text-ink">E</span>
          <div>
            <div className="font-display text-xl bg-accent-grad bg-clip-text text-transparent">Exch Admin</div>
            <div className="text-[10px] uppercase tracking-wider text-white/50">{user.role}</div>
          </div>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV.map(({ href, label, Icon }) => {
            const active = path === href || (href !== "/" && path?.startsWith(href));
            return (
              <Link key={href} href={href} className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm",
                active ? "bg-accent-grad text-ink font-semibold" : "hover:bg-panel2 text-white/80",
              )}>
                <Icon size={16}/> {label}
              </Link>
            );
          })}
        </nav>
        <button onClick={() => { clear(); router.replace("/login"); }} className="m-3 inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm hover:border-bad hover:text-bad">
          <LogOut size={14}/> Sign out
        </button>
      </aside>
      <main className="flex-1 px-6 py-6 overflow-x-hidden">{children}</main>
    </div>
  );
}
