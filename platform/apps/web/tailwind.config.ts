import type { Config } from "tailwindcss";

/**
 * Dark-luxury betting palette inspired by Future9 Club:
 *  - base   : near-black with maroon undertone
 *  - panel  : translucent dark-red for glassmorphism cards
 *  - accent : orange→red gradient for live/back/lay highlights
 */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink:        "#0b0608",   // deepest background
        bg:         "#15080c",   // page bg
        panel:      "#1f0a12",   // raised panel
        panel2:     "#2b0f1a",   // brighter raised panel
        wine:       "#3a0d1c",
        maroon:     "#5a1126",
        crimson:    "#a3122e",
        accent:     "#ff7a18",   // primary orange
        accentSoft: "#ff9b4d",
        gold:       "#f1c265",
        line:       "rgba(255, 122, 24, 0.18)",
        ok:         "#34d39a",
        bad:        "#ff4d6d",
        back:       "#7ad7ff",   // sportsbook BACK blue
        backSoft:   "#bdeaff",
        lay:        "#ffb3c0",   // sportsbook LAY pink
        laySoft:    "#ffd6dd",
      },
      fontFamily: {
        display: ['"Bebas Neue"', "system-ui", "sans-serif"],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        "accent-grad": "linear-gradient(135deg, #ff7a18 0%, #ff3358 50%, #a3122e 100%)",
        "panel-grad":  "linear-gradient(160deg, rgba(58,13,28,0.95), rgba(15,5,8,0.95))",
        "betslip-grad":"linear-gradient(180deg, rgba(58,13,28,0.95) 0%, rgba(11,6,8,0.95) 100%)",
        "subtle-grain": "radial-gradient(rgba(255,122,24,0.06) 1px, transparent 1px)",
      },
      boxShadow: {
        glow: "0 0 24px rgba(255,122,24,0.35)",
        glowSoft: "0 0 14px rgba(255,122,24,0.18)",
        panel: "0 12px 40px rgba(0,0,0,0.45)",
      },
      keyframes: {
        flashUp:   { "0%": { backgroundColor: "rgba(52,211,154,0.5)" }, "100%": { backgroundColor: "transparent" } },
        flashDown: { "0%": { backgroundColor: "rgba(255,77,109,0.5)" }, "100%": { backgroundColor: "transparent" } },
        marquee:   { "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-50%)" } },
        pulseGlow: { "0%,100%": { boxShadow: "0 0 0 0 rgba(255,122,24,0.55)" }, "50%": { boxShadow: "0 0 0 12px rgba(255,122,24,0)" } },
      },
      animation: {
        flashUp: "flashUp 700ms ease-out",
        flashDown: "flashDown 700ms ease-out",
        marquee: "marquee 30s linear infinite",
        pulseGlow: "pulseGlow 1.6s ease-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
