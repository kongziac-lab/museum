import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Museum palette — deep navy exhibition walls, concrete, warm light
        ink: "#0a0e14",
        navy: {
          DEFAULT: "#141b2e",
          deep: "#0d1220",
          wall: "#1a2138",
        },
        concrete: "#c9c6bf",
        bone: "#f4f1ea",
        carpet: "#4b4d52",
        spot: "#fff4e0",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        museum: "0.35em",
      },
      transitionTimingFunction: {
        museum: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        breathe: {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        breathe: "breathe 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
