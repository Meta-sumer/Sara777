import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The panel runs on 3000 and proxies /api and /uploads to the API, so the
 * browser only ever talks to one origin and the app's own fetches stay relative.
 *
 * The target is the local API (cd server && npm run dev), which logs in with
 * ADMIN_USER / ADMIN_PASSWORD from server/.env. To drive the deployed API instead
 * (once it runs this version): API_TARGET=https://sara777-api.onrender.com npm run dev
 * — nothing else in the app knows the difference.
 */
const API_TARGET = process.env.API_TARGET ?? 'http://localhost:4100';

export default defineConfig(({ command }) => ({
  plugins: [react()],

  // Where the panel is mounted decides how its asset URLs are written:
  //   dev              localhost:3000        -> /
  //   Vercel           the domain root       -> /            (VERCEL is set during its builds)
  //   the API's build  served under /admin   -> /admin/
  base: command !== 'build' || process.env.VERCEL ? '/' : '/admin/',

  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
      // payment QR and deposit screenshots are served by the API as /uploads/...
      '/uploads': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
  },
}));
