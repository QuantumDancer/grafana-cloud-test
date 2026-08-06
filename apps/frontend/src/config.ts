// Runtime configuration, deliberately kept out of the Vite build.
//
// Faro's collector URL and app key are per-environment secrets/identifiers —
// baking them into the JS bundle at build time would mean a new image for
// every environment and would leak the app key to anyone who reads the
// bundle. Instead `index.html` loads /config.js *before* the app bundle; in
// the container that file is generated at startup by docker-entrypoint.sh
// from env vars, and it sets `window.__SPYGLASS_CONFIG__`. public/config.js
// (served as-is by Vite in dev) is the local-dev stand-in: empty collector
// URL, which tells initFaro() to skip telemetry entirely rather than error.
export interface RuntimeConfig {
  faroCollectorUrl: string;
  faroAppKey: string;
  appEnvironment: string;
  /** Master switch for the two frontend-owned planted faults (broken lens
   * care guide button, artificially slow page) — see src/faults.ts. */
  faultsEnabled: boolean;
}

const DEFAULT_CONFIG: RuntimeConfig = {
  faroCollectorUrl: '',
  faroAppKey: '',
  appEnvironment: 'test',
  faultsEnabled: true,
};

declare global {
  interface Window {
    __SPYGLASS_CONFIG__?: Partial<RuntimeConfig>;
  }
}

export function loadRuntimeConfig(): RuntimeConfig {
  // If config.js failed to load (e.g. a stripped-down test/build environment)
  // fall back to defaults rather than crashing the whole app on boot.
  return { ...DEFAULT_CONFIG, ...window.__SPYGLASS_CONFIG__ };
}
