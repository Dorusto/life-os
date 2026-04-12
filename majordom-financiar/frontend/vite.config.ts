import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In local development (npm run dev), the Vite dev server runs on port 5173
// and needs to talk to the FastAPI backend. The proxy below rewrites /api/*
// requests to http://localhost:8000/api/* so you don't need CORS configured.
//
// In production, Nginx handles this proxy — see frontend/nginx.conf.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/uploads': 'http://localhost:8000',
    },
  },
})
