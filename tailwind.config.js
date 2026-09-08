/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        tetherly: {
          dark: '#050508',
          card: '#0a0a0f',
          border: '#ffffff0a',
        }
      },
    },
  },
  plugins: [],
}
