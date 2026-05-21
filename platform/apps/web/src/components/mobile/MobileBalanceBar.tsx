"use client";

import Link from "next/link";
import { Wallet, Plus } from "lucide-react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";

export function MobileBalanceBar() {
  const user = useAuthStore(s => s.user);
  const { data: walletData } = useSWR(
    user ? "/wallet/summary" : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const balance = walletData ? Number(walletData.available) : 0;

  if (!user) return null;

  return (
    <div className="md:hidden flex items-center gap-2 px-3 py-2 bg-[#191a38]">
      <Wallet size={16} className="text-white/60" />
      <span className="text-sm font-bold text-white">
        ₹{balance.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
      <Link
        href="/account/deposit"
        className="ml-auto flex items-center justify-center w-8 h-8 rounded-full bg-yellow-400 hover:bg-yellow-300 transition active:scale-95"
      >
        <Plus size={18} className="text-black font-bold" />
      </Link>
    </div>
  );
}
