/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f8faf5",
          100: "#edf4e7",
          200: "#d6e7c7",
          300: "#b8d79f",
          400: "#94c36e",
          500: "#6faa4b",
          600: "#54873a",
          700: "#426a31",
          800: "#37552c",
          900: "#304825"
        }
      },
      fontFamily: {
        display: ["Merriweather", "serif"],
        body: ["Lato", "sans-serif"]
      },
      boxShadow: {
        panel: "0 16px 45px -22px rgba(24, 39, 22, 0.35)"
      }
    }
  },
  plugins: []
};
