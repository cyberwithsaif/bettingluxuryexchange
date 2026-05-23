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

        {/* Faint track ring */}
        <svg style={{ position: "absolute", inset: 0 }} width="200" height="200" viewBox="0 0 200 200" fill="none">
          <circle cx="100" cy="100" r="92" stroke="rgba(255,255,255,0.06)" strokeWidth="6" fill="none" />
        </svg>

        {/* Main spinning gradient arc */}
        <svg style={{ position: "absolute", inset: 0, animation: "np-spin 2s linear infinite" }}
          width="200" height="200" viewBox="0 0 200 200" fill="none">
          <defs>
            <linearGradient id="arc-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffcc00" />
              <stop offset="50%" stopColor="#ff6a00" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>
          {/* Bold leading arc */}
          <circle cx="100" cy="100" r="92" stroke="url(#arc-grad)" strokeWidth="6" strokeLinecap="round"
            strokeDasharray="140 438" strokeDashoffset="0" fill="none" />
          {/* Fading tail */}
          <circle cx="100" cy="100" r="92" stroke="#ef4444" strokeWidth="6" strokeLinecap="round"
            strokeDasharray="60 518" strokeDashoffset="-145" fill="none" opacity="0.35" />
          <circle cx="100" cy="100" r="92" stroke="#ffcc00" strokeWidth="6" strokeLinecap="round"
            strokeDasharray="20 558" strokeDashoffset="-210" fill="none" opacity="0.15" />
        </svg>

        {/* Inner counter ring (red tint) */}
        <svg style={{ position: "absolute", inset: "16px", animation: "np-spin-r 1.6s linear infinite" }}
          width="168" height="168" viewBox="0 0 168 168" fill="none">
          <circle cx="84" cy="84" r="78" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray="35 455" strokeDashoffset="0" fill="none" opacity="0.3" />
        </svg>

        {/* Logo — shown immediately, no delay */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt=""
          width={140}
          height={140}
          // @ts-ignore
          fetchpriority="high"
          style={{
            position: "relative",
            zIndex: 10,
            objectFit: "contain",
            display: "block",
            filter: "drop-shadow(0 0 16px rgba(255,100,0,0.5)) drop-shadow(0 0 40px rgba(255,200,0,0.2))",
            animation: "np-pulse 2.2s ease-in-out infinite",
          }}
        />
      </div>

      <style>{`
        @keyframes np-spin   { to { transform: rotate(360deg); } }
        @keyframes np-spin-r { to { transform: rotate(-360deg); } }
        @keyframes np-pulse  { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
      `}</style>
    </div>
  );
}

export function NavigationProgress() {
  const pathname    = usePathname();
  const search      = useSearchParams();
  const [visible, setVisible] = useState(true);
  const [opacity, setOpacity] = useState(1);
  const navPending  = useRef(false);
  const isFirst     = useRef(true);

  /* 1. Initial / refresh load */
  useEffect(() => {
    const hide = () => {
      setOpacity(0);
      setTimeout(() => setVisible(false), 380);
    };
    if (document.readyState === "complete") {
      const t = setTimeout(hide, 600);
      return () => clearTimeout(t);
    }
    window.addEventListener("load", () => setTimeout(hide, 400), { once: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 2. Intercept link clicks → show loader immediately */
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      if (!href || href.startsWith("http") || href.startsWith("#")
        || href.startsWith("mailto") || href.startsWith("tel")
        || anchor.target === "_blank") return;
      navPending.current = true;
      setVisible(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setOpacity(1)));
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  /* 3. Navigation done → hide */
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    if (!navPending.current) return;
    navPending.current = false;
    const t1 = setTimeout(() => setOpacity(0), 350);
    const t2 = setTimeout(() => setVisible(false), 750);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [pathname, search]);

  if (!visible) return null;
  return <Loader opacity={opacity} />;
}
