/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
        display: ["'Major Mono Display'", "monospace"],
      },
      colors: {
        bg:     "#0a0e0f",
        panel:  "#11181a",
        panel2: "#1a2326",
        border: "#243033",
        fg:     "#e6f0ee",
        dim:    "#6b7e80",
        green:  "#4ade80",
        red:    "#f87171",
        amber:  "#fbbf24",
        blue:   "#60a5fa",
      },
    },
  },
  plugins: [],
};
