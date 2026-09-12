import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In local development (npm run dev), the Vite dev server runs on port 5174
// (5173 is majordom-financiar's own frontend dev server) and needs to talk
// to vehicle-manager's FastAPI backend on its own dev port 8010.
//
// All API calls go under /api/* (stripped before forwarding) so they never
// collide with an SPA route of the same name — vehicle-manager's own routes
// live at the root (/vehicles, /auth, etc.), and this app also has a React
// Router page at /vehicles/:id. Proxying bare /vehicles/* directly (as an
// earlier version of this file did) meant a hard refresh or direct link to
// /vehicles/4 hit the backend's JSON API instead of the SPA shell — found
// live in Phase 4 verification (a curl without an Authorization header hit
// this route and got a raw 401 JSON body instead of index.html). The /api/
// prefix is the same separation majordom-financiar's own nginx.conf already
// uses for this exact reason.
//
// In production, Nginx handles this proxy — see frontend/nginx.conf.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:8010',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
