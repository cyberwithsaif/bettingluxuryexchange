import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0a0a0f",
        bg: "#11121a",
        panel: "#191b27",
        panel2: "#21243380",
        line: "rgba(255,255,255,0.08)",
        accent: "#ff7a18",
        accentSoft: "#ffb56b",
        crimson: "#a3122e",
        ok: "#34d39a",
        bad: "#ff4d6d",
      },
      fontFamily: {
        display: ['"Bebas Neue"', "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "accent-grad": "linear-gradient(135deg, #ff7a18 0%, #ff3358 50%, #a3122e 100%)",
      },
      boxShadow: { glow: "0 0 24px rgba(255,122,24,0.25)" },
    },
  },
  plugins: [],
} satisfies Config;
