import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1a1a1a",
        bg: "#ffffff",
        panel: "#f8f8f8",
        panel2: "#f0f0f0",
        line: "rgba(255,204,0,0.25)",
        accent: "#ffcc00",
        accentSoft: "#ffd700",
        gold: "#ffc107",
        crimson: "#ff9800",
        ok: "#34d39a",
        bad: "#ff4d6d",
        back: "#7ad7ff",
        lay: "#ffb3c0",
      },
      fontFamily: {
        display: ['"Bebas Neue"', "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "accent-grad": "linear-gradient(135deg, #ffcc00 0%, #ffd700 50%, #ff9800 100%)",
        "panel-grad": "linear-gradient(160deg, rgba(255,255,255,0.98), rgba(248,248,248,0.98))",
        "subtle-grain": "radial-gradient(rgba(255,204,0,0.08) 1px, transparent 1px)",
      },
      boxShadow: {
        glow: "0 0 24px rgba(255,204,0,0.4)",
        glowSoft: "0 0 14px rgba(255,204,0,0.2)",
        panel: "0 12px 40px rgba(0,0,0,0.12)",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideInUp: { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        slideInDown: { "0%": { opacity: "0", transform: "translateY(-8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        pulseGlow: { "0%,100%": { boxShadow: "0 0 0 0 rgba(255,204,0,0.55)" }, "50%": { boxShadow: "0 0 0 12px rgba(255,204,0,0)" } },
      },
      animation: {
        fadeIn: "fadeIn 300ms ease-out",
        slideInUp: "slideInUp 300ms ease-out",
        slideInDown: "slideInDown 300ms ease-out",
        pulseGlow: "pulseGlow 1.6s ease-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
