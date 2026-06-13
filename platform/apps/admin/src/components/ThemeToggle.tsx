"use client";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

/**
 * Light/dark toggle. Theme is a single `light` class on <html> (dark = no
 * class). Persisted in localStorage and applied pre-paint by a script in
 * layout.tsx, so this only handles the in-session switch.
 */
export function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.classList.contains("light"));
  }, []);

  function toggle() {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle("light", next);
    try { localStorage.setItem("admin-theme", next ? "light" : "dark"); } catch { /* ignore */ }
  }

  return (
    <button
      onClick={toggle}
      title={light ? "Switch to dark mode" : "Switch to light mode"}
      aria-label="Toggle theme"
      className="w-8 h-8 rounded-lg flex items-center justify-center border border-gray-700 text-gray-400 hover:text-yellow-400 hover:border-yellow-400/50 transition-colors"
    >
      {light ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}
