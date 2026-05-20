"use client";

import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { TopBar } from "./TopBar";
import { AnnouncementBar } from "./AnnouncementBar";
import { TopNav } from "./TopNav";
import { Footer } from "./Footer";
import { NavigationProgress } from "../NavigationProgress";
import { MobileBottomNav } from "./MobileBottomNav";

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isFullScreen = pathname === "/mines" || pathname === "/roulette" || pathname === "/plinko" || pathname === "/crash";

  if (isFullScreen) {
    return (
      <>
        <Suspense fallback={null}><NavigationProgress /></Suspense>
        <main className="flex-1 bg-[#0F1923] flex flex-col">{children}</main>
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Suspense fallback={null}><NavigationProgress /></Suspense>
      <TopBar />
      <AnnouncementBar />
      <TopNav />
      <main className="flex-1 pb-16 md:pb-0">{children}</main>
      <Footer />
      <MobileBottomNav />
    </div>
  );
}
