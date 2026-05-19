import "./globals.css";
import type { Metadata, Viewport } from "next";
import { TopBar } from "@/components/layout/TopBar";
import { TopNav } from "@/components/layout/TopNav";
import { AnnouncementBar } from "@/components/layout/AnnouncementBar";
import { Footer } from "@/components/layout/Footer";
import { Providers } from "@/lib/providers";

export const metadata: Metadata = {
  title: "Exch — Premium Betting Exchange & Casino",
  description: "Live cricket, football, tennis exchange + casino, crash, virtual & lottery games.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#a3122e",
  width: "device-width",
  initialScale: 1,
};

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="min-h-screen flex flex-col">
            <TopBar />
            <AnnouncementBar />
            <TopNav />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
