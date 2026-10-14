/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: { extend: { colors: { ink: '#172033', accent: '#086b67' } } },
  plugins: []
};
