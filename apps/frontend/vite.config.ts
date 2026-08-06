import react from '@vitejs/plugin-react';
// `vitest/config`'s defineConfig re-exports Vite's, merged with the `test`
// field's types — lets one config file serve both `vite build` and
// `vitest run` without a second config file to keep in sync.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Points at a real Spring Boot backend when VITE_BACKEND_URL is set.
      // When it's not, main.tsx starts the MSW browser worker instead, which
      // intercepts fetches at the browser's network layer before they'd ever
      // reach this proxy — so the fallback target below is never actually
      // dialed in that mode, just harmless config. Never used in the built/
      // containerized app either: nginx owns /api routing there.
      '/api': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Source maps are required (uploaded to Faro by CI separately) but must
    // not ship in the served image — see the Dockerfile build stage, which
    // moves *.map files out of dist/ before the nginx stage copies it in.
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
});
