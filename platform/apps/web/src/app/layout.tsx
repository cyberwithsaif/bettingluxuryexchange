import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Providers } from "@/lib/providers";
import { LayoutWrapper } from "@/components/layout/LayoutWrapper";

export const viewport: Viewport = {
  themeColor: "#a3122e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

async function fetchPlatformSettings(): Promise<Record<string, unknown> | null> {
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
    const res = await fetch(`${base}/api/platform/settings`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json() as Promise<Record<string, unknown>>;
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const s = await fetchPlatformSettings();
  const siteName = (s?.siteName as string | undefined) ?? "Future9";
  const tagline  = (s?.siteTagline as string | undefined) ?? "Premium Betting Exchange & Casino";
  return {
    title: `${siteName} — ${tagline}`,
    description: "Live cricket, football, tennis exchange + casino, crash, virtual & lottery games.",
    manifest: "/manifest.webmanifest",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const platformSettings = await fetchPlatformSettings();

  return (
    <html lang="en">
      <body>
        <Providers initialSettings={platformSettings}>
          <LayoutWrapper>{children}</LayoutWrapper>
        </Providers>
      </body>
    </html>
  );
}
