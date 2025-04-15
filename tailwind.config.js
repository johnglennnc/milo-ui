/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        heading: ['Orbitron', 'Inter', 'system-ui']
      },
      colors: {
        milo: {
          dark: '#0d1117',
          blue: '#2563eb',
          neon: '#00ffe1',
          glass: 'rgba(255, 255, 255, 0.08)'
        }
      },
      boxShadow: {
        glow: '0 0 12px rgba(0, 255, 225, 0.4)',
      },
      animation: {
        pulseDot: 'pulse 1.4s infinite ease-in-out',
      },
      keyframes: {
        pulse: {
          '0%, 100%': { opacity: 0.2 },
          '50%': { opacity: 1 },
        }
      }
    },
  },
  plugins: [],
}
