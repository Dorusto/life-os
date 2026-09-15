import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

// In local development (npm run dev), the Vite dev server runs on port 5173
// and needs to talk to the FastAPI backend. The proxy below rewrites /api/*
// requests to http://localhost:8000/api/* so you don't need CORS configured.
//
// In production, Nginx handles this proxy — see frontend/nginx.conf.
export default defineConfig({
  plugins: [react()],
  // Single source of truth for the app version (About page) — package.json's
  // version, injected at build time as __APP_VERSION__.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/uploads': 'http://localhost:8000',
    },
  },
})
