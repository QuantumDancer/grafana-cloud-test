import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

// Started conditionally from main.tsx — only when no real backend is
// configured for the dev proxy (see vite.config.ts) — so the app is
// runnable standalone with `pnpm dev` and nothing else.
export const worker = setupWorker(...handlers);
