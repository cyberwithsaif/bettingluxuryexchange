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
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>

        {/* Logo with zoom animations */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt=""
          width={280}
          height={280}
          // @ts-ignore
          fetchpriority="high"
          style={{
            width: "min(280px, 75vw)",
            height: "min(280px, 75vw)",
            objectFit: "contain",
            display: "block",
            filter: "drop-shadow(0 0 16px rgba(255,100,0,0.5)) drop-shadow(0 0 40px rgba(255,200,0,0.2))",
            animation: "np-zoom 2.4s ease-in-out infinite",
          }}
        />
      </div>

      <style>{`
        @keyframes np-zoom {
          0%   { transform: scale(0.6); }
          50%  { transform: scale(1.1); }
          100% { transform: scale(0.6); }
        }
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
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirst     = useRef(true);

  const hide = (delay = 350) => {
    navPending.current = false;
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    setTimeout(() => setOpacity(0), delay);
    setTimeout(() => setVisible(false), delay + 400);
  };

  /* 1. Initial / refresh load */
  useEffect(() => {
    const doHide = () => hide(0);
    if (document.readyState === "complete") {
      const t = setTimeout(doHide, 600);
      return () => clearTimeout(t);
    }
    window.addEventListener("load", () => setTimeout(doHide, 400), { once: true });
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

      // Resolve href to just the pathname portion for comparison
      const targetPath = href.split("?")[0];
      const currentPath = window.location.pathname;

      // Same page click — skip loader entirely
      if (targetPath === currentPath) return;

      navPending.current = true;
      setVisible(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setOpacity(1)));

      // Safety timeout — if pathname never changes (edge case), hide after 4s
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
      safetyTimer.current = setTimeout(() => hide(0), 4000);
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 3. Navigation done → hide */
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    if (!navPending.current) return;
    hide(350);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search]);

  if (!visible) return null;
  return <Loader opacity={opacity} />;
}
