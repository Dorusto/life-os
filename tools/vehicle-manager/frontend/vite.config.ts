import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In local development (npm run dev), the Vite dev server runs on port 5174
// (5173 is majordom-financiar's own frontend dev server) and needs to talk
// to vehicle-manager's FastAPI backend on its own dev port 8010. The proxy
// below rewrites these route prefixes so no CORS config is needed.
//
// In production, Nginx handles this proxy — see frontend/nginx.conf.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/auth': 'http://localhost:8010',
      '/vehicles': 'http://localhost:8010',
      '/log': 'http://localhost:8010',
      '/import': 'http://localhost:8010',
      '/health': 'http://localhost:8010',
    },
  },
})
