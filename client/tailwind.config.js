/** @type {import('tailwindcss').Config} */
export default {
    content: [
      "./index.html",
      "./src/**/*.{js,jsx}",
    ],
    theme: {
      extend: {
        fontFamily: {
          sans: ["Inter", "sans-serif"],
        },
        colors: {
          primary: "#1F2937",   // navy gray
          accent: "#F59E0B",    // amber
          backdrop: "#fefcf4",  // light cream - matches full site bg
        },
        animation: {
          'fade-in': 'fadeIn 1s ease-out both',
        },
        keyframes: {
          fadeIn: {
            from: { opacity: '0', transform: 'translateY(20px)' },
            to: { opacity: '1', transform: 'translateY(0)' },
          },
        },
      },
    },
    plugins: [require('@tailwindcss/typography')],
  };
  