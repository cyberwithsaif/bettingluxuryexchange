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
        focusThrottleInterval: 300000,
        dedupingInterval: 60000,
        errorRetryInterval: 5000,
        errorRetryCount: 3,
        compare: (a, b) => JSON.stringify(a) === JSON.stringify(b),
      }}
    >
      {children}
    </SWRConfig>
  );
}
