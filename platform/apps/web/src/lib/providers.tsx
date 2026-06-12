"use client";

import { SWRConfig } from "swr";
import useSWR from "swr";
import { fetcher, refreshTokens } from "@/lib/api";
import { useEffect, useRef } from "react";
import { useAuthStore } from "@/lib/stores/auth";
import { connectSocket } from "@/lib/socket";

function MaintenanceOverlay() {
  const { data } = useSWR<Record<string, unknown>>("/api/platform/settings", {
    refreshInterval: 20_000,
    revalidateOnFocus: true,
  });

  if (!data?.maintenanceMode) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column",
      background: "rgba(5,4,20,0.88)",
      backdropFilter: "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
      padding: 24, textAlign: "center",
      animation: "maint-fade-in 0.35s ease",
    }}>
      <style>{`
        @keyframes maint-fade-in { from { opacity:0; transform:scale(.97) } to { opacity:1; transform:scale(1) } }
        @keyframes maint-spin { to { transform:rotate(360deg) } }
      `}</style>

      {/* Glow ring */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 60% 45% at 50% 40%, rgba(250,204,21,0.08) 0%, transparent 70%)",
      }} />

      {/* Icon */}
      <div style={{ fontSize: 72, marginBottom: 18, lineHeight: 1 }}>🔧</div>

      {/* Badge */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "5px 16px", borderRadius: 99,
        background: "rgba(250,204,21,0.12)", border: "1px solid rgba(250,204,21,0.35)",
        color: "#facc15", fontSize: 11, fontWeight: 800, letterSpacing: 2,
        textTransform: "uppercase", marginBottom: 20,
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: "50%", background: "#facc15",
          animation: "maint-spin 1s linear infinite",
          display: "inline-block",
          boxShadow: "0 0 8px #facc15",
        }} />
        Under Maintenance
      </div>

      {/* Heading */}
      <h2 style={{
        color: "#fff", fontSize: 26, fontWeight: 900,
        margin: "0 0 12px", letterSpacing: -0.5,
        fontFamily: "sans-serif",
      }}>
        We&apos;ll be back shortly
      </h2>

      {/* Body */}
      <p style={{
        color: "rgba(255,255,255,0.5)", fontSize: 14, maxWidth: 360,
        lineHeight: 1.7, margin: "0 0 32px", fontFamily: "sans-serif",
      }}>
        The platform is undergoing scheduled maintenance to improve your experience.
        Please check back in a few minutes.
      </p>

      {/* Info card */}
      <div style={{
        padding: "14px 28px", borderRadius: 14,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
        color: "rgba(255,255,255,0.55)", fontSize: 13,
        fontFamily: "sans-serif",
      }}>
        ⏱ &nbsp;Estimated downtime: <strong style={{ color: "#facc15" }}>a few minutes</strong>
      </div>
    </div>
  );
}

function jwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]!));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch { return null; }
}

export function Providers({ children, initialSettings }: { children: React.ReactNode; initialSettings?: Record<string, unknown> | null }) {
  const token = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reconnect socket whenever token changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    connectSocket(token);
  }, [token]);

  // Capture a referral code from any landing URL (/?ref=CODE) so the signup
  // page can attribute the registration even if the user navigates around first.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref && ref.length <= 40) localStorage.setItem("refCode", ref);
    } catch { /* ignore */ }
  }, []);

  // Proactive token refresh: schedule refresh 2 min before expiry.
  // Goes through the shared single-flight refreshTokens() so it can never
  // race the 401 interceptor with the same rotating refresh token, and
  // transient failures (network blip, server reload) do NOT log out — the
  // 401 interceptor acts as the safety net on the next API call.
  useEffect(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    if (!token || !refreshToken) return;

    const exp = jwtExpiry(token);
    if (!exp) return;

    const msUntilRefresh = exp - Date.now() - 2 * 60 * 1000; // 2 min before expiry

    if (msUntilRefresh <= 0) {
      // Already expired or about to — refresh immediately
      refreshTokens();
      return;
    }

    refreshTimer.current = setTimeout(() => { refreshTokens(); }, msUntilRefresh);
    return () => { if (refreshTimer.current) clearTimeout(refreshTimer.current); };
  }, [token, refreshToken]);

  // Cross-tab session sync: when another tab refreshes (rotates) or clears the
  // tokens, rehydrate this tab's store from localStorage so it never keeps
  // using a stale rotated refresh token.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === "exch-auth") useAuthStore.persist.rehydrate();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: false,
        shouldRetryOnError: false,
        dedupingInterval: 5000,
        keepPreviousData: true,
        revalidateIfStale: true,
        revalidateOnReconnect: true,
        fallback: initialSettings ? { "/api/platform/settings": initialSettings } : {},
      }}
    >
      <MaintenanceOverlay />
      {children}
    </SWRConfig>
  );
}
