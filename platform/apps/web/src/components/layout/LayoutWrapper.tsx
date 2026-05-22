"use client";

import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { SidebarContext } from "@/lib/contexts/sidebar";
import { TopBar } from "./TopBar";
import { Footer } from "./Footer";
import { NavigationProgress } from "../NavigationProgress";
import { MobileBottomNav } from "./MobileBottomNav";
import { AppSidebar } from "./AppSidebar";

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const isFullScreen =
    pathname === "/mines" ||
    pathname === "/roulette" ||
    pathname === "/plinko" ||
    pathname === "/crash" ||
    pathname === "/towers" ||
    pathname === "/coinflip" ||
    pathname === "/pump";

  if (isFullScreen) {
    return (
      <>
        <Suspense fallback={null}><NavigationProgress /></Suspense>
        <main className="flex-1 bg-[#090c1c] flex flex-col">{children}</main>
      </>
    );
  }

  return (
    <SidebarContext.Provider value={{ collapsed: sidebarCollapsed, setCollapsed: setSidebarCollapsed }}>
      <div className="min-h-screen flex bg-[#090c1c]">
        <Suspense fallback={null}><NavigationProgress /></Suspense>

        {/* ── Left Sidebar (desktop only) ───────────────────── */}
        <aside
          className={`app-sidebar hidden md:flex flex-col h-screen sticky top-0 z-40 bg-[#191938] rounded-br-2xl overflow-hidden shrink-0 transition-all duration-300 ${
            sidebarCollapsed ? "w-0 opacity-0 pointer-events-none" : "w-[220px] opacity-100"
          }`}
        >
          <AppSidebar />
        </aside>

        {/* ── Main column ──────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar />
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
