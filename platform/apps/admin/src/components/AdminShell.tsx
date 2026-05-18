"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import {
  LayoutDashboard, Users, ArrowDownToLine, ArrowUpToLine,
  Settings, Key, ListChecks, ShieldAlert, LogOut, Gamepad2, Trophy,
  Ticket, BarChart3, Bell, Menu, X, CreditCard,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/lib/stores/auth";

const NAV = [
  { href: "/",              label: "Dashboard",     Icon: LayoutDashboard },
  { href: "/users",         label: "Users",         Icon: Users },
  { href: "/bets",          label: "All Bets",      Icon: Ticket },
  { href: "/deposits",      label: "Deposits",      Icon: ArrowDownToLine },
  { href: "/withdrawals",   label: "Withdrawals",   Icon: ArrowUpToLine },
  { href: "/markets",       label: "Markets",       Icon: Trophy },
  { href: "/casino",        label: "Casino",        Icon: Gamepad2 },
  { href: "/risk",          label: "Live Risk",     Icon: ShieldAlert },
  { href: "/reports",       label: "Reports",       Icon: BarChart3 },
  { href: "/notifications", label: "Announcements", Icon: Bell },
  { href: "/api-keys",      label: "API Keys",      Icon: Key },
  { href: "/logs",          label: "Audit Logs",    Icon: ListChecks },
  { href: "/settings",                  label: "Settings",        Icon: Settings },
  { href: "/settings/payment-methods", label: "Payment Methods", Icon: CreditCard },
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, clear } = useAuthStore();
  const router = useRouter();
  const path = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user && path !== "/login") {
      router.replace("/login");
    }
  }, [user, path, router]);

  const handleLogout = useCallback(async () => {
    setIsLoading(true);
    clear();
    router.replace("/login");
  }, [clear, router]);

  if (path === "/login") return <>{children}</>;
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-white/60">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-bg">
      {/* Sidebar */}
      <aside className={cn(
        "fixed md:static w-64 h-screen bg-panel/95 border-r border-line flex flex-col transition-transform duration-300 z-40",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      )}>
        <div className="px-5 py-4 flex items-center justify-between border-b border-line">
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

        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto no-scrollbar">
          {NAV.map(({ href, label, Icon }) => {
            const active = path === href || (href !== "/" && path?.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  active
                    ? "bg-accent-grad text-ink shadow-glow"
                    : "text-white/70 hover:text-white hover:bg-panel2/60",
                )}
              >
                <Icon size={16} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t border-line space-y-2">
          <button
            onClick={handleLogout}
            disabled={isLoading}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
              isLoading
                ? "opacity-50 cursor-not-allowed bg-panel2"
                : "text-bad hover:bg-bad/10 hover:border-bad border border-transparent",
            )}
          >
            <LogOut size={14} />
            {isLoading ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-ink/50 md:hidden z-30 animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-20 h-14 bg-panel/80 border-b border-line flex items-center px-4 md:px-6 gap-3 backdrop-blur-sm">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden p-2 hover:bg-panel2 rounded-lg transition-colors"
          >
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
