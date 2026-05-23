"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function Loader({ opacity }: { opacity: number }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "#0d1224",
      display: "flex", alignItems: "center", justifyContent: "center",
      pointerEvents: "none",
      opacity,
      transition: "opacity 350ms ease",
    }}>
      <div style={{ position: "relative", width: 200, height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg style={{ position: "absolute", inset: 0 }} width="200" height="200" viewBox="0 0 200 200" fill="none">
          <circle cx="100" cy="100" r="92" stroke="rgba(245,166,35,0.12)" strokeWidth="6" fill="none" />
        </svg>
        <svg style={{ position: "absolute", inset: 0, animation: "np-spin 2.4s linear infinite" }}
          width="200" height="200" viewBox="0 0 200 200" fill="none">
          <circle cx="100" cy="100" r="92" stroke="#f5a623" strokeWidth="5" strokeLinecap="round"
            strokeDasharray="100 478" fill="none" />
          <circle cx="100" cy="100" r="92" stroke="#f5a623" strokeWidth="5" strokeLinecap="round"
            strokeDasharray="50 528" strokeDashoffset="-200" fill="none" opacity="0.5" />
          <circle cx="100" cy="100" r="92" stroke="#f5a623" strokeWidth="5" strokeLinecap="round"
            strokeDasharray="25 553" strokeDashoffset="-360" fill="none" opacity="0.25" />
        </svg>
        <svg style={{ position: "absolute", inset: "14px", animation: "np-spin-r 1.8s linear infinite reverse" }}
          width="172" height="172" viewBox="0 0 172 172" fill="none">
          <circle cx="86" cy="86" r="80" stroke="rgba(245,166,35,0.2)" strokeWidth="3" strokeLinecap="round"
            strokeDasharray="40 462" fill="none" />
        </svg>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" width={140} height={140}
          style={{ position: "relative", zIndex: 10, objectFit: "contain",
            filter: "drop-shadow(0 0 18px rgba(245,166,35,0.55)) drop-shadow(0 0 40px rgba(245,166,35,0.2))",
            animation: "np-pulse 2s ease-in-out infinite" }}
        />
      </div>
      <style>{`
        @keyframes np-spin   { to { transform: rotate(360deg); } }
        @keyframes np-spin-r { to { transform: rotate(360deg); } }
        @keyframes np-pulse  { 0%,100% { transform:scale(1); } 50% { transform:scale(1.05); } }
      `}</style>
    </div>
  );
}

export function NavigationProgress() {
  const pathname = usePathname();
  const search   = useSearchParams();

  // visible = loader is mounted; opacity drives fade in/out
  const [visible, setVisible]   = useState(true);
  const [opacity, setOpacity]   = useState(1);
  const navPending              = useRef(false);
  const isFirst                 = useRef(true);

  /* ── 1. Initial / refresh load ─────────────────────────────────── */
  useEffect(() => {
    const hide = () => {
      setOpacity(0);
      setTimeout(() => setVisible(false), 380);
    };
    if (document.readyState === "complete") {
      // Already loaded (e.g. fast cache hit) — hide after short grace period
      const t = setTimeout(hide, 600);
      return () => clearTimeout(t);
    }
    window.addEventListener("load", () => setTimeout(hide, 400), { once: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── 2. Intercept link/button clicks → show loader ─────────────── */
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      // Skip external, hash-only, mailto, tel, or same-page links
      if (!href || href.startsWith("http") || href.startsWith("#")
          || href.startsWith("mailto") || href.startsWith("tel")
          || anchor.target === "_blank") return;
      // Internal navigation — show loader immediately
      navPending.current = true;
      setVisible(true);
      // Small tick so opacity transition fires
      requestAnimationFrame(() => requestAnimationFrame(() => setOpacity(1)));
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  /* ── 3. Pathname changed = navigation done → hide loader ────────── */
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    if (!navPending.current) return;
    navPending.current = false;
    // Small grace: let the new page paint before fading out
    const t1 = setTimeout(() => setOpacity(0), 350);
    const t2 = setTimeout(() => setVisible(false), 750);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [pathname, search]);

  if (!visible) return null;
  return <Loader opacity={opacity} />;
}
