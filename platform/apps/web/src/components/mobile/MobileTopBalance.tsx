"use client";

import Link from "next/link";
import { Wallet, Plus, ChevronDown } from "lucide-react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";

export function MobileTopBalance() {
  const user = useAuthStore(s => s.user);
  const { data: walletData } = useSWR(
    user ? "/wallet/summary" : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const balance = walletData ? Number(walletData.available) : 0;

  if (!user) return null;

  return (
    <div className="md:hidden bg-[#191a38] border-b border-white/5 px-3 py-2.5 flex items-center justify-between gap-2">
      {/* Balance display pill */}
      <div className="flex items-center gap-2 rounded-xl px-3 py-2 bg-white/5 flex-1 min-w-0">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500 shrink-0">
          <Wallet size={18} className="text-white" strokeWidth={2.5} />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-xs text-white/60 leading-none">Balance</span>
          <span className="text-sm font-bold text-white tabular-nums">
            ${balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <ChevronDown size={14} className="text-white/50 shrink-0" />
      </div>

      {/* Deposit button — yellow 3D */}
      <Link
        href="/account/deposit"
        className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-all active:scale-95 hover:brightness-110 shadow-lg"
        style={{
          background: "linear-gradient(135deg, #ffd700 0%, #ffed4e 50%, #ffb700 100%)",
          boxShadow: "0 4px 12px rgba(255, 215, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.5), inset 0 -2px 4px rgba(0, 0, 0, 0.2)",
          border: "1px solid rgba(255, 220, 0, 0.4)",
        }}
      >
        <Plus size={16} className="text-black" strokeWidth={3} />
      </Link>
    </div>
  );
}
