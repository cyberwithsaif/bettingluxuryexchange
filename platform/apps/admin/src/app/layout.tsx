import "./globals.css";
import type { Metadata } from "next";
import { Providers } from "@/lib/providers";
import { AdminShell } from "@/components/AdminShell";
import { ChunkErrorRecovery } from "@/components/ChunkErrorRecovery";

export const metadata: Metadata = { title: "Exch Admin" };

// Apply the saved theme before first paint so light-mode users never see a
// dark flash. Default is dark (no class).
const themeScript = `(function(){try{if(localStorage.getItem("admin-theme")==="light")document.documentElement.classList.add("light")}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <Providers>
          <ChunkErrorRecovery />
          <AdminShell>{children}</AdminShell>
        </Providers>
      </body>
    </html>
  );
}
