import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// During development, calls to /api go to the FastAPI backend on port 8000.
// The GitHub Pages workflow builds with --base /<repo name>/ so the site works under that path.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:8000' },
  },
})
