"use client";

import { SWRConfig } from "swr";
import { fetcher } from "@/lib/api";
import { useEffect, useRef } from "react";
import { useAuthStore } from "@/lib/stores/auth";
import { connectSocket } from "@/lib/socket";
import axios from "axios";

function jwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]!));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch { return null; }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const set = useAuthStore((s) => s.set);
  const clear = useAuthStore((s) => s.clear);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reconnect socket whenever token changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    connectSocket(token);
  }, [token]);

  // Proactive token refresh: schedule refresh 2 min before expiry
  useEffect(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    if (!token || !refreshToken) return;

    const exp = jwtExpiry(token);
    if (!exp) return;

    const msUntilRefresh = exp - Date.now() - 2 * 60 * 1000; // 2 min before expiry

    if (msUntilRefresh <= 0) {
      // Already expired or about to — refresh immediately
      doRefresh();
      return;
    }

    refreshTimer.current = setTimeout(doRefresh, msUntilRefresh);
    return () => { if (refreshTimer.current) clearTimeout(refreshTimer.current); };

    async function doRefresh() {
      try {
        const rt = useAuthStore.getState().refreshToken;
        if (!rt) return;
        const { data } = await axios.post("/api/auth/refresh", { refreshToken: rt });
        set({ accessToken: data.accessToken, refreshToken: data.refreshToken ?? rt, user: data.user });
      } catch {
        clear();
      }
    }
  }, [token, refreshToken, set, clear]);

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
