"use client";
import { SWRConfig } from "swr";
import { fetcher } from "@/lib/api";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        dedupingInterval: 10000,
        keepPreviousData: true,
        errorRetryCount: 2,
      }}
    >
      {children}
    </SWRConfig>
  );
}
