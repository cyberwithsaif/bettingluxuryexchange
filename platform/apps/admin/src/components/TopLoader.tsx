"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function TopLoader() {
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const prevPath = useRef(pathname);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = () => timers.current.forEach(clearTimeout);

  useEffect(() => {
    if (pathname === prevPath.current) return;
    prevPath.current = pathname;

    clear();
    setVisible(true);
    setWidth(0);

    timers.current = [
      setTimeout(() => setWidth(40), 50),
      setTimeout(() => setWidth(70), 300),
      setTimeout(() => setWidth(90), 700),
      setTimeout(() => setWidth(100), 1200),
      setTimeout(() => setVisible(false), 1600),
      setTimeout(() => setWidth(0), 1700),
    ];

    return clear;
  }, [pathname]);

  if (!visible && width === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-[2px] bg-transparent pointer-events-none">
      <div
        className="h-full bg-accent shadow-[0_0_8px_rgba(253,119,40,0.8)] transition-all ease-out"
        style={{ width: `${width}%`, transitionDuration: width === 100 ? "200ms" : "400ms", opacity: visible ? 1 : 0 }}
      />
    </div>
  );
}
