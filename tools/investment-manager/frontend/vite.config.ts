import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Local dev: Vite on 5175, proxying to investment-manager's FastAPI on 8020.
// Every API call goes through /api/* (prefix stripped) so backend paths can
// never collide with a React Router route of the same name. In production
// Nginx applies the same split — see frontend/nginx.conf and
// tools/standalone-app-playbook.md section 2.1 for the bug this prevents.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    proxy: {
      '/api': {
        target: 'http://localhost:8020',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
