/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        accent: '#3B82F6',
        'accent-dark': '#2563EB',
        'accent-purple': '#6366F1',
        'bubble-sent': '#3B82F6',
        'bubble-received': '#FFFFFF',
      },
    },
  },
  plugins: [],
};
