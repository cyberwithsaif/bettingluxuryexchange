"use client";
import { SWRConfig } from "swr";
import { fetcher } from "@/lib/api";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        // Live by default across the WHOLE admin panel: every useSWR auto-polls
        // and re-fetches when the tab regains focus, so data updates without a
        // manual refresh. SWR's deep-equal keeps the same reference when nothing
        // changed, so this won't churn forms / cause needless re-renders.
        refreshInterval: 10000,
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        dedupingInterval: 4000,
        keepPreviousData: true,
        errorRetryCount: 2,
        errorRetryInterval: 3000,
      }}
    >
      {children}
    </SWRConfig>
  );
}
