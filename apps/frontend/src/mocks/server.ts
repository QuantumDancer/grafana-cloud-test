import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// Wired up in src/test/setup.ts so every vitest run exercises the same
// request handlers the browser fallback uses — one source of truth for what
// "the backend" does in tests vs. standalone dev.
export const server = setupServer(...handlers);
