import "./globals.css";
import type { Metadata } from "next";
import { Providers } from "@/lib/providers";
import { BookieShell } from "@/components/BookieShell";

export const metadata: Metadata = { title: "Bookie Panel" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <BookieShell>{children}</BookieShell>
        </Providers>
      </body>
    </html>
  );
}
