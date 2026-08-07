import { createReactRouterV7DataOptions, getWebInstrumentations, initializeFaro, ReactIntegration } from '@grafana/faro-react';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';
import { matchRoutes } from 'react-router-dom';
import type { RuntimeConfig } from './config';

// Shared between the app.name passed to initializeFaro below and the
// __faroBundleId_<appName> global the SDK reads to deobfuscate stack traces —
// those two must name the same app or the bundle-id lookup silently misses.
const APP_NAME = 'spyglass-frontend';

/**
 * Wires up Faro: Web Vitals/errors/sessions via getWebInstrumentations(),
 * React Router v7 data-router view tracking via ReactIntegration, and
 * distributed tracing to the same-origin Spring Boot API via
 * TracingInstrumentation (adds a `traceparent` header to `/api` fetches so
 * Application Observability can correlate backend traces to this session).
 *
 * Called once from main.tsx, before the router is created — the returned
 * `router` transform from createBrowserRouter must be wrapped by
 * withFaroRouterInstrumentation at the router-creation call site, not here.
 */
export function initFaro(config: RuntimeConfig): void {
  // Local dev and CI have no Grafana Cloud stack to send telemetry to. Rather
  // than have initializeFaro throw or silently queue against an invalid URL,
  // we skip instrumentation entirely — the rest of the app doesn't know or
  // care whether Faro is active.
  if (!config.faroCollectorUrl) {
    return;
  }

  // Faro 2.9.0 never reads app.version to deobfuscate stack traces — it reads
  // globalThis['__faroBundleId_<appName>'] (see be() in the SDK's exception
  // path). CI's `faro-cli upload` uploads the source map under this same
  // build's VITE_APP_VERSION as --bundle-id, but nothing ever assigns the
  // global the SDK looks up, so app.bundleId is silently omitted from every
  // exception payload and Grafana can't match it to the uploaded map. This
  // has to be set here, in the bundle itself, rather than via CI's
  // `faro-cli inject-bundle-id` step: that CLI patches CI's host-side dist/,
  // but the image that actually serves the bundle is built separately from a
  // Dockerfile stage — the same "two builds, one patched" trap issue 15 hit
  // with the `latest` tag. Guarded on non-empty for the same reason `version`
  // is: local/CI builds without VITE_APP_VERSION shouldn't report a bogus id.
  if (import.meta.env.VITE_APP_VERSION) {
    (globalThis as Record<string, unknown>)[`__faroBundleId_${APP_NAME}`] = import.meta.env.VITE_APP_VERSION;
  }

  initializeFaro({
    url: config.faroCollectorUrl,
    apiKey: config.faroAppKey || undefined,
    app: {
      // version identifies the *build artifact*, not the environment, so it
      // comes from the Vite build (CI injects the commit sha via the
      // VITE_APP_VERSION build arg) rather than from runtime config. It must
      // equal the `--bundle-id` CI passes to `faro-cli upload` — that pair is
      // how Faro matches minified runtime stack traces to the uploaded source
      // maps. Local builds have no version; `undefined` omits the field
      // instead of reporting an empty string.
      name: APP_NAME,
      environment: config.appEnvironment,
      version: import.meta.env.VITE_APP_VERSION || undefined,
    },
    instrumentations: [
      ...getWebInstrumentations(),
      new TracingInstrumentation({
        instrumentationOptions: {
          // Same-origin requests already carry the traceparent header
          // without needing to be listed here; this only matters if the
          // API ever moves to a different origin. Kept explicit and empty
          // so that future deployment has an obvious place to add it.
          propagateTraceHeaderCorsUrls: [],
        },
      }),
      new ReactIntegration({
        router: createReactRouterV7DataOptions({ matchRoutes }),
      }),
    ],
  });
}
