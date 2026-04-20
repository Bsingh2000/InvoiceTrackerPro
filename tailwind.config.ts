import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f7f7f4",
          100: "#ececea",
          200: "#d9d8d3",
          300: "#b9b7ad",
          400: "#939086",
          500: "#736f66",
          600: "#59564f",
          700: "#42403b",
          800: "#2c2c29",
          900: "#181917"
        },
        emerald: {
          50: "#eefdf7",
          100: "#d7f8ea",
          200: "#b2efd7",
          300: "#77dfbd",
          400: "#37c59b",
          500: "#17a984",
          600: "#0a876b",
          700: "#086c57",
          800: "#085646",
          900: "#07473b"
        },
        garnet: {
          50: "#fff1f2",
          100: "#ffe1e5",
          200: "#ffc8d1",
          300: "#ff9bac",
          400: "#fb637c",
          500: "#e63e5b",
          600: "#c91f43",
          700: "#a81839",
          800: "#8b1734",
          900: "#781831"
        },
        citrine: {
          50: "#fffbe8",
          100: "#fff5c2",
          200: "#ffe782",
          300: "#ffd243",
          400: "#f7ba15",
          500: "#d99a08",
          600: "#b57305",
          700: "#91530a",
          800: "#78420f",
          900: "#663713"
        },
        peacock: {
          50: "#eefcff",
          100: "#d5f7fd",
          200: "#afeef9",
          300: "#78e0f2",
          400: "#39c9e4",
          500: "#17accb",
          600: "#0f88a6",
          700: "#126d87",
          800: "#17586d",
          900: "#17495d"
        }
      },
      boxShadow: {
        "luxury": "0 24px 70px -34px rgba(24, 25, 23, 0.38)",
        "soft": "0 16px 42px -28px rgba(24, 25, 23, 0.35)"
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: [forms]
};

export default config;
