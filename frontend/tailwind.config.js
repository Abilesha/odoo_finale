/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink:    { DEFAULT: '#1d1a24', soft: '#4a4455', faint: '#8b8495' },
        plum:   { 50:'#faf6f9', 100:'#f3e9f0', 200:'#e5cfdf', 300:'#d0a9c4',
                  400:'#b47aa2', 500:'#965682', 600:'#7a4169', 700:'#5e3152',
                  800:'#44243c', 900:'#2d1828', 950:'#1f0f1b' },
        gold:   { 50:'#fdfaf2', 100:'#faf1dc', 200:'#f2dfb0', 300:'#e7c87c',
                  400:'#d9ae4d', 500:'#c6922c', 600:'#a37421', 700:'#7d581d',
                  800:'#5a3f18', 900:'#3d2b12' },
        sand:   { 50:'#fcfbf9', 100:'#f6f3ee', 200:'#ebe5db', 300:'#dbd2c4' },
        sage:   { 100:'#e7efe8', 400:'#6f9c7a', 600:'#4b7356', 700:'#3a5a43' },
        rust:   { 100:'#fbe9e4', 400:'#d4714f', 600:'#b15030', 700:'#8f4327' },
        // the manager's portal — midnight indigo
        night:  { 50:'#f4f6fb', 100:'#e6eaf5', 200:'#c9d0ea', 300:'#a3add0',
                  400:'#7884b3', 500:'#55618f', 600:'#3c4772', 700:'#2b3459',
                  800:'#1e2543', 900:'#141a30', 950:'#0c1020' },
        // the couple's portal — blush and wine
        blush:  { 50:'#fdf6f7', 100:'#fbeaed', 200:'#f5d0d7', 300:'#eaa9b6',
                  400:'#d97d91', 500:'#c35a73', 600:'#a6435c', 700:'#86354b',
                  800:'#63283a', 900:'#431a28', 950:'#2a0f19' },
        // the vendor's portal — deep jade
        jade:   { 50:'#f1f8f5', 100:'#ddefe7', 200:'#bcdfd0', 300:'#8fc6b0',
                  400:'#5ea68b', 500:'#3f8a6f', 600:'#2f6e58', 700:'#255746',
                  800:'#1b4136', 900:'#122c25', 950:'#0a1b16' },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(29,26,36,.04), 0 4px 16px -4px rgba(29,26,36,.08)',
        lift: '0 2px 4px rgba(29,26,36,.05), 0 12px 32px -8px rgba(29,26,36,.14)',
        glow: '0 0 0 1px rgba(217,174,77,.35), 0 8px 30px -6px rgba(217,174,77,.35)',
      },
      keyframes: {
        rise: { '0%': { opacity: 0, transform: 'translateY(6px)' }, '100%': { opacity: 1, transform: 'none' } },
        pulseDot: { '0%,100%': { opacity: 1 }, '50%': { opacity: .35 } },
      },
      animation: {
        rise: 'rise .35s ease-out both',
        pulseDot: 'pulseDot 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
