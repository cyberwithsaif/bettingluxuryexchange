"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import {
  LayoutDashboard, Users, ArrowDownToLine, ArrowUpToLine,
  Settings, Key, ListChecks, ShieldAlert, LogOut, Gamepad2, Trophy,
  Ticket, BarChart3, Bell, Menu, X, CreditCard, Megaphone, Navigation,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/lib/stores/auth";
import { TopLoader } from "@/components/TopLoader";

const NAV = [
  { href: "/",                         label: "Dashboard",       Icon: LayoutDashboard },
  { href: "/users",                    label: "Users",           Icon: Users },
  { href: "/bets",                     label: "All Bets",        Icon: Ticket },
  { href: "/deposits",                 label: "Deposits",        Icon: ArrowDownToLine },
  { href: "/withdrawals",              label: "Withdrawals",     Icon: ArrowUpToLine },
  { href: "/markets",                  label: "Markets",         Icon: Trophy },
  { href: "/casino",                   label: "Casino",          Icon: Gamepad2 },
  { href: "/risk",                     label: "Live Risk",       Icon: ShieldAlert },
  { href: "/reports",                  label: "Reports",         Icon: BarChart3 },
  { href: "/notifications",            label: "Announcements",   Icon: Bell },
  { href: "/settings/payment-methods", label: "Payment Methods", Icon: CreditCard },
  { href: "/api-keys",                 label: "API Keys",        Icon: Key },
  { href: "/logs",                     label: "Audit Logs",      Icon: ListChecks },
  { href: "/settings",                 label: "Settings",        Icon: Settings },
  { href: "/settings/banners",         label: "Banner Settings", Icon: Megaphone },
  { href: "/settings/nav",             label: "Navigation Bar",  Icon: Navigation },
  { href: "/casino/mines",             label: "Mines",           Icon: Gamepad2 },
] as const;

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="h-8 w-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, clear } = useAuthStore();
  const router = useRouter();
  const path = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // Track when Zustand has finished loading from localStorage.
  // On the server persist doesn't exist, so default false and let the effect handle it.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Already done — nothing to subscribe to
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    // Subscribe to be notified when hydration finishes
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, []);

  useEffect(() => {
    if (hydrated && !user && path !== "/login") {
      router.replace("/login");
    }
  }, [hydrated, user, path, router]);

  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true);
    clear();
    router.replace("/login");
  }, [clear, router]);

  // Login page renders without the shell
  if (path === "/login") return <>{children}</>;

  // Wait for localStorage to load before deciding auth state
  if (!hydrated) return <Spinner />;

  // Hydrated but no user — redirect effect will fire
  if (!user) return <Spinner />;

  return (
    <div className="h-screen overflow-hidden flex bg-bg">
      <TopLoader />
      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 w-64 h-screen bg-panel/95 border-r border-line flex flex-col transition-transform duration-300 z-40",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      )}>
        {/* Logo */}
        <div className="px-5 py-4 flex items-center justify-between border-b border-line shrink-0">
          <div className="flex items-center gap-2">
            <span className="h-9 w-9 grid place-items-center rounded-md bg-accent-grad font-display text-xl text-ink">E</span>
            <div>
              <div className="font-display text-lg bg-accent-grad bg-clip-text text-transparent">Exch</div>
              <div className="text-[9px] uppercase tracking-wider text-white/50">Admin</div>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 hover:bg-panel2 rounded">
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">
          {NAV.map(({ href, label, Icon }) => {
            const active =
              href === "/"
                ? path === "/"
                : path === href || (href !== "/settings" && href !== "/casino" && path?.startsWith(href + "/"));
            const isSubItem = href === "/settings/banners" || href === "/settings/nav" || href === "/casino/mines";
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isSubItem && "ml-4 py-2 text-xs border-l-2 border-line pl-4 rounded-l-none",
                  active
                    ? "bg-accent-grad text-ink shadow-glow border-accent!"
                    : "text-white/70 hover:text-white hover:bg-panel2/60",
                )}
              >
                <Icon size={isSubItem ? 13 : 16} className="shrink-0" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="px-3 py-3 border-t border-line shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-white/30 px-3 mb-1">{user.username}</div>
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
              isLoggingOut
                ? "opacity-50 cursor-not-allowed bg-panel2"
                : "text-bad hover:bg-bad/10 hover:border-bad border border-transparent",
            )}
          >
            <LogOut size={14} />
            {isLoggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-ink/50 md:hidden z-30 animate-fade-in" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <main className="flex-1 md:ml-64 h-screen overflow-y-auto">
        <div className="sticky top-0 z-20 h-14 bg-panel/80 border-b border-line flex items-center px-4 md:px-6 gap-3 backdrop-blur-sm">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden p-2 hover:bg-panel2 rounded-lg transition-colors">
            <Menu size={18} />
          </button>
          <div className="flex-1" />
          <div className="text-sm text-white/60">{user.username}</div>
        </div>
        <div className="px-4 md:px-6 py-6 animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
