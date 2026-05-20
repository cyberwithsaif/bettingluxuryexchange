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

async function fetchPlatformSettings(): Promise<Record<string, unknown> | null> {
  try {
    const base = process.env.INTERNAL_API_URL ?? "http://localhost:4000";
    const res = await fetch(`${base}/api/platform/settings`, { next: { revalidate: 60 } });
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
