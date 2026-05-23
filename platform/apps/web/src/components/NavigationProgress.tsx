"use client";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function NavigationProgress() {
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 600);
    return () => clearTimeout(t);
  }, [pathname, search]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#0d1224",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div style={{ position: "relative", width: 96, height: 96, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* Faint background ring */}
        <svg style={{ position: "absolute", inset: 0 }} width="96" height="96" viewBox="0 0 96 96" fill="none">
          <circle cx="48" cy="48" r="44" stroke="rgba(245,166,35,0.15)" strokeWidth="5" fill="none" />
        </svg>

        {/* Spinning segmented ring */}
        <svg
          style={{ position: "absolute", inset: 0, animation: "spin 1.2s linear infinite" }}
          width="96"
          height="96"
          viewBox="0 0 96 96"
          fill="none"
        >
          <circle cx="48" cy="48" r="44" stroke="#f5a623" strokeWidth="5" strokeLinecap="round"
            strokeDasharray="50 226" strokeDashoffset="0" fill="none" />
          <circle cx="48" cy="48" r="44" stroke="#f5a623" strokeWidth="5" strokeLinecap="round"
            strokeDasharray="25 251" strokeDashoffset="-100" fill="none" opacity="0.6" />
          <circle cx="48" cy="48" r="44" stroke="#f5a623" strokeWidth="5" strokeLinecap="round"
            strokeDasharray="15 261" strokeDashoffset="-180" fill="none" opacity="0.3" />
        </svg>

        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Logo"
          width={56}
          height={56}
          style={{
            borderRadius: "50%",
            position: "relative",
            zIndex: 10,
            filter: "drop-shadow(0 0 12px rgba(245,166,35,0.6))",
          }}
        />
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
