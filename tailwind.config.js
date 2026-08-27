/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{html,js}"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bgDark: '#0d1117',
        cardDark: '#161b22',
        borderDark: '#30363d',
        accent: '#238636'
      }
    }
  },
  plugins: [],
}
