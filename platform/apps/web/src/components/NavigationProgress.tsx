"use client";
import { useEffect, useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function NavigationProgress() {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    setVisible(true);
    setProgress(10);
    const t1 = setTimeout(() => setProgress(40), 100);
    const t2 = setTimeout(() => setProgress(70), 250);
    const t3 = setTimeout(() => setProgress(95), 500);
    const t4 = setTimeout(() => {
      setProgress(100);
      const t5 = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 200);
      return () => clearTimeout(t5);
    }, 700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [pathname, search]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 9999,
        pointerEvents: "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 200ms ease",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${progress}%`,
          background: "linear-gradient(90deg, #f59e0b, #ef4444, #f59e0b)",
          boxShadow: "0 0 10px rgba(245, 158, 11, 0.7)",
          transition: "width 300ms ease",
        }}
      />
    </div>
  );
}
