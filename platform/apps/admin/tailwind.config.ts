import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0608",
        bg: "#15080c",
        panel: "#1f0a12",
        panel2: "#2b0f1a",
        line: "rgba(255,122,24,0.18)",
        accent: "#ff7a18",
        accentSoft: "#ff9b4d",
        gold: "#f1c265",
        crimson: "#a3122e",
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
        "accent-grad": "linear-gradient(135deg, #ff7a18 0%, #ff3358 50%, #a3122e 100%)",
        "panel-grad": "linear-gradient(160deg, rgba(58,13,28,0.95), rgba(15,5,8,0.95))",
        "subtle-grain": "radial-gradient(rgba(255,122,24,0.06) 1px, transparent 1px)",
      },
      boxShadow: {
        glow: "0 0 24px rgba(255,122,24,0.35)",
        glowSoft: "0 0 14px rgba(255,122,24,0.18)",
        panel: "0 12px 40px rgba(0,0,0,0.45)",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideInUp: { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        slideInDown: { "0%": { opacity: "0", transform: "translateY(-8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        pulseGlow: { "0%,100%": { boxShadow: "0 0 0 0 rgba(255,122,24,0.55)" }, "50%": { boxShadow: "0 0 0 12px rgba(255,122,24,0)" } },
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
