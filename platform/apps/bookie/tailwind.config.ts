import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#f3f4f6",
        bg: "#0b1120",
        panel: "#111827",
        panel2: "#1f2937",
        line: "rgba(0,200,83,0.18)",
        accent: "#00c853",
        accentSoft: "#34d399",
        ok: "#34d39a",
        bad: "#ff4d6d",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideInUp: { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
      },
      animation: {
        fadeIn: "fadeIn 300ms ease-out",
        slideInUp: "slideInUp 300ms ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
