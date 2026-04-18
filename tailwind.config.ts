import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx,js,jsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0b0c",
        paper: "#fafaf7",
        muted: "#6b7280",
        line: "#e5e5e0",
        accent: "#1f4d3a", // Hokusan deep green
        warn: "#b45309",
        good: "#15803d",
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
