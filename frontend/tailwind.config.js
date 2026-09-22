/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          800: '#1e293b',
          850: '#172033',
          900: '#0f172a',
          950: '#0a0f1d',
        },
        brand: {
          blue: '#2563eb',
          'blue-light': '#3b82f6',
          indigo: '#4f46e5',
          purple: '#7c3aed',
          'purple-light': '#8b5cf6',
          cyan: '#0891b2',
        },
        sovereign: {
          green: '#10b981',
          'green-dark': '#059669',
          'green-light': '#34d399',
          emerald: '#059669',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        'card-hover': '0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -1px rgba(0, 0, 0, 0.04)',
      },
    },
  },
  plugins: [],
}
