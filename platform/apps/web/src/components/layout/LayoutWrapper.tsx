"use client";

import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { TopBar } from "./TopBar";
import { Footer } from "./Footer";
import { NavigationProgress } from "../NavigationProgress";
import { MobileBottomNav } from "./MobileBottomNav";
import { AppSidebar } from "./AppSidebar";

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isFullScreen =
    pathname === "/mines" ||
    pathname === "/roulette" ||
    pathname === "/plinko" ||
    pathname === "/crash";

  if (isFullScreen) {
    return (
      <>
        <Suspense fallback={null}><NavigationProgress /></Suspense>
        <main className="flex-1 bg-[#0F1923] flex flex-col">{children}</main>
      </>
    );
  }

  return (
    <div className="min-h-screen flex bg-[#100810]">
      <Suspense fallback={null}><NavigationProgress /></Suspense>

      {/* ── Left Sidebar (desktop only) ───────────────────── */}
      <aside
        className="app-sidebar hidden md:flex flex-col w-[220px] shrink-0 h-screen sticky top-0 z-40 bg-[#191938] border-r border-white/5 overflow-hidden"
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
  );
}
