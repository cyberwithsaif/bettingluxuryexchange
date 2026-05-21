"use client";

import { usePathname } from "next/navigation";
import { Suspense, useState, createContext } from "react";
import { TopBar } from "./TopBar";
import { Footer } from "./Footer";
import { NavigationProgress } from "../NavigationProgress";
import { MobileBottomNav } from "./MobileBottomNav";
import { AppSidebar } from "./AppSidebar";

export const SidebarContext = createContext<{ collapsed: boolean; setCollapsed: (v: boolean) => void } | null>(null);

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const isFullScreen =
    pathname === "/mines" ||
    pathname === "/roulette" ||
    pathname === "/plinko" ||
    pathname === "/crash" ||
    pathname === "/dice" ||
    pathname === "/towers" ||
    pathname === "/coinflip";

  if (isFullScreen) {
    return (
      <>
        <Suspense fallback={null}><NavigationProgress /></Suspense>
        <main className="flex-1 bg-[#0F1923] flex flex-col">{children}</main>
      </>
    );
  }

  return (
    <SidebarContext.Provider value={{ collapsed: sidebarCollapsed, setCollapsed: setSidebarCollapsed }}>
      <div className="min-h-screen flex bg-[#100810]">
        <Suspense fallback={null}><NavigationProgress /></Suspense>

        {/* ── Left Sidebar (desktop only) ───────────────────── */}
        <aside
          className={`app-sidebar transition-all duration-300 flex-col h-screen sticky top-0 z-40 bg-[#191938] rounded-br-2xl overflow-hidden ${
            sidebarCollapsed ? "hidden" : "hidden md:flex"
          } w-[220px] shrink-0`}
        >
          <AppSidebar />
        </aside>

        {/* ── Main column ──────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar onToggleSidebar={() => setSidebarCollapsed(c => !c)} />
          <main className="flex-1 pb-16 md:pb-0 overflow-x-hidden">{children}</main>
          <div className="hidden md:block">
            <Footer />
          </div>
        </div>

        {/* ── Mobile bottom nav ────────────────────────────── */}
        <MobileBottomNav />
      </div>
    </SidebarContext.Provider>
  );
}
