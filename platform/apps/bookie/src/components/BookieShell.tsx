"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { LayoutDashboard, Users, Wallet, ArrowLeftRight, UserCircle, LogOut, Menu, X, Inbox } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/lib/stores/auth";

const NAV = [
  { href: "/",             label: "Dashboard",    Icon: LayoutDashboard },
  { href: "/users",        label: "My Users",     Icon: Users },
  { href: "/requests",     label: "My Requests",  Icon: Inbox },
  { href: "/wallet",       label: "Wallet",       Icon: Wallet },
  { href: "/transactions", label: "Transactions", Icon: ArrowLeftRight },
  { href: "/profile",      label: "Profile",      Icon: UserCircle },
] as const;

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b1120]">
      <div className="h-8 w-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
    </div>
  );
}

export function BookieShell({ children }: { children: React.ReactNode }) {
  const { user, clear } = useAuthStore();
  const router = useRouter();
  const path = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) { setHydrated(true); return; }
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, []);

  useEffect(() => {
    if (hydrated && !user && path !== "/login") router.replace("/login");
  }, [hydrated, user, path, router]);

  const handleLogout = useCallback(() => { clear(); router.replace("/login"); }, [clear, router]);

  if (path === "/login") return <>{children}</>;
  if (!hydrated || !user) return <Spinner />;

  return (
    <div className="h-screen overflow-hidden flex bg-[#0b1120]">
      <aside className={cn(
        "fixed top-0 left-0 w-60 h-screen flex flex-col transition-transform duration-300 z-40 bg-[#0f172a] border-r border-emerald-500/15",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      )}>
        <div className="px-5 py-4 flex items-center justify-between shrink-0"
          style={{ background: "linear-gradient(135deg, #064e3b 0%, #0f172a 100%)", borderBottom: "1px solid rgba(0,200,83,0.18)" }}>
          <div className="flex items-center gap-2.5">
            <span className="h-9 w-9 grid place-items-center rounded-lg font-black text-lg text-white shrink-0"
              style={{ background: "linear-gradient(135deg, #00c853 0%, #16a34a 100%)" }}>B</span>
            <div>
              <div className="font-black text-sm text-white tracking-tight">Bookie Panel</div>
              <div className="text-[9px] uppercase tracking-[0.18em] text-emerald-400/70">DiamondPlay22</div>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 text-white/60"><X size={18} /></button>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto no-scrollbar">
          {NAV.map(({ href, label, Icon }) => {
            const active = href === "/" ? path === "/" : path === href || path?.startsWith(href + "/");
            return (
              <Link key={href} href={href} onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                  active
                    ? "bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold shadow-[0_2px_12px_rgba(0,200,83,0.4)]"
                    : "text-slate-300 hover:text-white hover:bg-emerald-900/20",
                )}>
                <Icon size={16} className="shrink-0" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-3 shrink-0 border-t border-white/10">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 px-3 mb-1.5">{user.username}</div>
          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-900/20 hover:text-red-300 transition">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 bg-black/40 md:hidden z-30" onClick={() => setSidebarOpen(false)} />}

      <main className="flex-1 md:ml-60 h-screen overflow-y-auto bg-[#0b1120]">
        <div className="sticky top-0 z-20 h-14 bg-[#0b1120]/95 backdrop-blur-sm border-b border-gray-700/60 flex items-center px-4 md:px-6 gap-3">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden p-2 text-gray-400"><Menu size={18} /></button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center text-white font-black text-xs">{user.username[0]?.toUpperCase()}</div>
            <div className="text-sm font-medium text-gray-300">{user.username}</div>
          </div>
        </div>
        <div className="px-4 md:px-6 py-6 animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
