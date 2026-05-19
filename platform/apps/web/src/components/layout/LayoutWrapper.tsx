"use client";

import { usePathname } from "next/navigation";
import { TopBar } from "./TopBar";
import { AnnouncementBar } from "./AnnouncementBar";
import { TopNav } from "./TopNav";
import { Footer } from "./Footer";

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isFullScreen = pathname === "/mines" || pathname === "/roulette" || pathname === "/plinko" || pathname === "/crash";

  if (isFullScreen) {
    return <main className="flex-1 bg-[#0F1923] flex flex-col">{children}</main>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />
      <AnnouncementBar />
      <TopNav />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
