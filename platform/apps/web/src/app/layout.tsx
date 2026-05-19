import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Providers } from "@/lib/providers";
import { LayoutWrapper } from "@/components/layout/LayoutWrapper";

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
          <LayoutWrapper>{children}</LayoutWrapper>
        </Providers>
      </body>
    </html>
  );
}
