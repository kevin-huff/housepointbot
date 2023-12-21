/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./views/**/*.ejs'],
  theme: {
    extend: {
      animation: {
        ticker: 'ticker 10s linear infinite'
      },
      keyframes: {
        ticker: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(-100%)' }
        }
      },
      fontFamily: {
        merriweather: ['Merriweather', 'serif'],
        eczar: ['Eczar', 'serif']
      }
    }
  },
  plugins: []
}
