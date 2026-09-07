import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The panel runs on 3000 and proxies /api and /uploads to the API, so the
 * browser only ever talks to one origin and the app's own fetches stay relative.
 *
 * The target is the deployed API on Render, so the panel drives live data and
 * logs in with the ADMIN_USER / ADMIN_PASSWORD set in the Render dashboard.
 * Point it back at a local backend by changing this one line to
 * 'http://localhost:4100' — nothing else in the app knows the difference.
 */
const API_TARGET = 'https://sara777-api.onrender.com';

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
