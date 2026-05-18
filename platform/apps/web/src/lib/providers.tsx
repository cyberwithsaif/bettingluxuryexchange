"use client";

import { SWRConfig } from "swr";
import { fetcher } from "@/lib/api";
import { useEffect } from "react";
import { useAuthStore } from "@/lib/stores/auth";
import { connectSocket } from "@/lib/socket";

export function Providers({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (typeof window === "undefined") return;
    connectSocket(token);
  }, [token]);

  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: false,
        shouldRetryOnError: false,
      }}
    >
      {children}
    </SWRConfig>
  );
}
