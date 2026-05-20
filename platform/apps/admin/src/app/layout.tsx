import "./globals.css";
import type { Metadata } from "next";
import { Providers } from "@/lib/providers";
import { AdminShell } from "@/components/AdminShell";

export const metadata: Metadata = { title: "Exch Admin" };

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
