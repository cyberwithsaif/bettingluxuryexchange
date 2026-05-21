"use client";

import Link from "next/link";
import { Wallet, Plus } from "lucide-react";
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
    <div className="md:hidden bg-[#191a38] border-b border-white/5 px-4 py-3 flex items-center justify-between">
      {/* Balance display */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500">
          <Wallet size={20} className="text-white" strokeWidth={2.5} />
        </div>
        <div className="flex flex-col">
          <span className="text-sm text-white/60 leading-none">Balance</span>
          <span className="text-lg font-bold text-white">
            ${balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Deposit button */}
      <Link
        href="/account/deposit"
        className="flex items-center justify-center w-10 h-10 rounded-2xl bg-yellow-400 hover:bg-yellow-300 transition active:scale-95 shadow-lg"
      >
        <Plus size={22} className="text-black" strokeWidth={3} />
      </Link>
    </div>
  );
}
