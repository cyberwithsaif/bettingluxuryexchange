import "./globals.css";
import type { Metadata } from "next";
import { Providers } from "@/lib/providers";
import { AdminShell } from "@/components/AdminShell";

export const metadata: Metadata = { title: "Exch Admin" };
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AdminShell>{children}</AdminShell>
        </Providers>
      </body>
    </html>
  );
}
