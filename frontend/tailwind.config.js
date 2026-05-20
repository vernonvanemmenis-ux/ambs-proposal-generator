/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // SolutionsAI palette
        sai: {
          blue: "#2563B0",
          bluelight: "#4A90D9",
          bluepale: "#EEF4FF",
          navy: "#0B1120",
          midnight: "#111827",
          deep: "#070d18",
        },
        // Neutral UI utility colours
        ui: {
          surface: "#f7f7f7",
          border: "#e2e4ea",
          rowhover: "#f3f6fb",
          subtle: "#6b7280",
        },
      },
      fontFamily: {
        display: ["Montserrat", "system-ui", "sans-serif"],
        body: ["'Open Sans'", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(11,17,32,0.06), 0 1px 1px rgba(11,17,32,0.04)",
        kanban: "0 2px 6px rgba(11,17,32,0.08)",
      },
    },
  },
  plugins: [],
};
