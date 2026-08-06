import { createReactRouterV7DataOptions, getWebInstrumentations, initializeFaro, ReactIntegration } from '@grafana/faro-react';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';
import { matchRoutes } from 'react-router-dom';
import type { RuntimeConfig } from './config';

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

  initializeFaro({
    url: config.faroCollectorUrl,
    apiKey: config.faroAppKey || undefined,
    app: {
      name: 'spyglass-frontend',
      environment: config.appEnvironment,
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
