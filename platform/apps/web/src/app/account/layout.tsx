"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const items = [
  ["Dashboard",         "/account"],
  ["My Bets",           "/account/bets"],
  ["Account Statement", "/account/statement"],
  ["Profit / Loss",     "/account/pl"],
  ["Notifications",     "/account/notifications"],
  ["Deposit",           "/account/deposit"],
  ["Withdraw",          "/account/withdraw"],
  ["Security & 2FA",    "/account/security"],
] as const;

// Pages that get full-width layout (no sidebar)
const FULL_WIDTH = ["/account/deposit", "/account/withdraw"];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const isFullWidth = FULL_WIDTH.some((p) => path === p || path?.startsWith(p + "/"));

  if (isFullWidth) {
    return (
      <div className="mx-auto max-w-[1600px] px-3 py-5">
        {children}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] px-3 py-5 grid grid-cols-12 gap-3">
      <aside className="col-span-12 md:col-span-3 lg:col-span-2">
        <nav className="glass rounded-xl p-2">
          {items.map(([l, h]) => {
            const active = path === h || (h !== "/account" && path?.startsWith(h));
            return (
              <Link key={h} href={h} className={cn(
                "block px-3 py-2 text-sm rounded-md",
                active ? "bg-accent-grad text-ink font-semibold" : "hover:bg-panel2 text-white/80",
              )}>{l}</Link>
            );
          })}
        </nav>
      </aside>
      <section className="col-span-12 md:col-span-9 lg:col-span-10">{children}</section>
    </div>
  );
}
