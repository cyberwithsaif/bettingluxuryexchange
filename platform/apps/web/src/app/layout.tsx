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
  const base = process.env.INTERNAL_API_URL ?? "http://localhost:4000";
  // Retry once — a single transient SSR fetch failure used to drop the page to
  // the hardcoded fallback brand ("Future9") and skip the real settings.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${base}/api/platform/settings`, { cache: "no-store", signal: AbortSignal.timeout(2500) });
      if (res.ok) return res.json() as Promise<Record<string, unknown>>;
    } catch { /* retry */ }
  }
  return null;
}

export async function generateMetadata(): Promise<Metadata> {
  const s = await fetchPlatformSettings();
  const siteName = (s?.siteName as string | undefined) ?? "DiamondPlay";
  const tagline  = (s?.siteTagline as string | undefined) ?? "Premium Betting Exchange & Casino";
  return {
    title: `${siteName} — ${tagline}`,
    description: "Live cricket, football, tennis exchange + casino, crash, virtual & lottery games.",
    manifest: "/manifest.webmanifest",
    icons: { icon: "/logo.png", shortcut: "/logo.png", apple: "/logo.png" },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const platformSettings = await fetchPlatformSettings();
  const inMaintenance = platformSettings?.maintenanceMode === true;

  return (
    <html lang="en">
      <body>
        {inMaintenance ? (
          <div style={{ minHeight: "100dvh", background: "#0a0b16", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "sans-serif", padding: "24px", textAlign: "center" }}>
            <div style={{ fontSize: 72, marginBottom: 16 }}>🔧</div>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: "#facc15", marginBottom: 8, letterSpacing: -0.5 }}>Under Maintenance</h1>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", maxWidth: 380, lineHeight: 1.6 }}>
              We&apos;re upgrading the platform for a better experience. We&apos;ll be back shortly — please check again in a few minutes.
            </p>
            <div style={{ marginTop: 32, padding: "10px 24px", borderRadius: 12, background: "rgba(250,204,21,0.12)", border: "1px solid rgba(250,204,21,0.3)", color: "#facc15", fontSize: 13, fontWeight: 700 }}>
              ⏱ Estimated downtime: a few minutes
            </div>
          </div>
        ) : (
          <Providers initialSettings={platformSettings}>
            <LayoutWrapper>{children}</LayoutWrapper>
          </Providers>
        )}
      </body>
    </html>
  );
}
