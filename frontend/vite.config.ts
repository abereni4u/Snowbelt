import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// During development, calls to /api go to the FastAPI backend on port 8000.
// `vite build --mode pages` (the GitHub Pages workflow) serves the site from /Snowbelt_UBHacking2026/.
export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/Snowbelt_UBHacking2026/' : '/',
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:8000' },
  },
}))
