import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In local development (npm run dev), the Vite dev server runs on port 5173
// and needs to talk to the FastAPI backend. The proxy below rewrites /api/*
// requests to http://localhost:8000/api/* so you don't need CORS configured.
//
// In production, Nginx handles this proxy — see frontend/nginx.conf.
export default defineConfig({
  plugins: [react()],
  // Build identity for Settings → About (#314): the deployed commit and build
  // date, passed in by the deploy workflow as build args. A hand-bumped
  // version number told nothing about which build is running; local builds
  // show "dev".
  define: {
    __APP_VERSION__: JSON.stringify(
      process.env.BUILD_SHA
        ? [process.env.BUILD_SHA, process.env.BUILD_DATE].filter(Boolean).join(' · ')
        : 'dev',
    ),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/uploads': 'http://localhost:8000',
    },
  },
})
