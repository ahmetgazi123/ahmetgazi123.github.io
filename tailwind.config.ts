import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#182230",
        muted: "#718096",
        canvas: "#f6f7fb",
        line: "#e9ecf2",
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          500: "#5965e8",
          600: "#4b55d4",
          700: "#3e46b7",
        },
      },
      boxShadow: {
        card: "0 2px 10px rgba(24, 34, 48, 0.045)",
        soft: "0 12px 35px rgba(24, 34, 48, 0.12)",
      },
      fontFamily: {
        sans: ["Arial", "Helvetica", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
