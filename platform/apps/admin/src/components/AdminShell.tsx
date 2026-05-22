"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import {
  LayoutDashboard, Users, ArrowDownToLine, ArrowUpToLine,
  Settings, Key, ListChecks, ShieldAlert, LogOut, Trophy,
  Ticket, BarChart3, Bell, Menu, X, CreditCard, Megaphone,
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
  { href: "/risk",                     label: "Live Risk",       Icon: ShieldAlert },
  { href: "/reports",                  label: "Reports",         Icon: BarChart3 },
  { href: "/notifications",            label: "Announcements",   Icon: Bell },
  { href: "/settings/payment-methods", label: "Payment Methods", Icon: CreditCard },
  { href: "/api-keys",                 label: "API Keys",        Icon: Key },
  { href: "/logs",                     label: "Audit Logs",      Icon: ListChecks },
  { href: "/settings",                 label: "Settings",        Icon: Settings },
  { href: "/settings/banners",         label: "Banner Settings", Icon: Megaphone },
] as const;

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="h-8 w-8 rounded-full border-2 border-yellow-400 border-t-transparent animate-spin" />
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, clear } = useAuthStore();
  const router = useRouter();
  const path = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
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

  if (path === "/login") return <>{children}</>;
  if (!hydrated) return <Spinner />;
  if (!user) return <Spinner />;

  return (
    <div className="h-screen overflow-hidden flex bg-gray-50">
      <TopLoader />

      {/* ── Sidebar ── */}
      <aside className={cn(
        "fixed top-0 left-0 w-64 h-screen flex flex-col transition-transform duration-300 z-40",
        "bg-[#0f172a] border-r border-slate-700/50",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      )}>
        {/* Logo */}
        <div className="px-5 py-4 flex items-center justify-between shrink-0"
          style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)", borderBottom: "1px solid rgba(255,204,0,0.15)" }}>
          <div className="flex items-center gap-2.5">
            <span
              className="h-9 w-9 grid place-items-center rounded-lg font-black text-xl text-slate-900 shrink-0"
              style={{ background: "linear-gradient(135deg, #ffcc00 0%, #f59e0b 100%)" }}
            >D</span>
            <div>
              <div className="font-black text-sm text-white tracking-tight">DiamondPlay22</div>
              <div className="text-[9px] uppercase tracking-[0.18em] text-yellow-400/70">Admin Panel</div>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 hover:bg-white/10 rounded text-white/60">
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {NAV.map(({ href, label, Icon }) => {
            const active =
              href === "/"
                ? path === "/"
                : path === href || (href !== "/settings" && path?.startsWith(href + "/"));
            const isSubItem = href === "/settings/banners";
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                  isSubItem && "ml-4 py-2 text-xs border-l-2 border-yellow-400/30 pl-4 rounded-l-none",
                  active
                    ? "bg-gradient-to-r from-yellow-400 to-yellow-500 text-slate-900 font-bold shadow-[0_2px_12px_rgba(255,204,0,0.35)]"
                    : "text-slate-300 hover:text-white hover:bg-white/8",
                )}
              >
                <Icon size={isSubItem ? 13 : 16} className="shrink-0" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="px-3 py-3 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 px-3 mb-1.5">{user.username}</div>
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
              isLoggingOut
                ? "opacity-50 cursor-not-allowed text-slate-400"
                : "text-red-400 hover:bg-red-500/10 hover:text-red-300",
            )}
          >
            <LogOut size={14} />
            {isLoggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 md:hidden z-30" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Main Content ── */}
      <main className="flex-1 md:ml-64 h-screen overflow-y-auto bg-white">
        {/* Top bar */}
        <div className="sticky top-0 z-20 h-14 bg-white border-b border-yellow-100 flex items-center px-4 md:px-6 gap-3 shadow-sm">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600">
            <Menu size={18} />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-yellow-400 flex items-center justify-center text-slate-900 font-black text-xs">
              {user.username[0]?.toUpperCase()}
            </div>
            <div className="text-sm font-medium text-gray-600">{user.username}</div>
          </div>
        </div>

        {/* Page content */}
        <div className="px-4 md:px-6 py-6 animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
