import { FaroErrorBoundary } from '@grafana/faro-react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import './index.css';
import { loadRuntimeConfig } from './config';
import { initFaro } from './faro';
import { router } from './router';
import { CartProvider } from './state/CartContext';
import { CustomerProvider } from './state/CustomerContext';

const config = loadRuntimeConfig();
initFaro(config);

/**
 * Standalone-mode mock backend: started only in `vite dev` when no real
 * backend is configured for the dev proxy (see vite.config.ts / README). The
 * production container always has nginx routing /api to a real backend, and
 * vitest talks to msw/node directly (src/test/setup.ts) — neither of those
 * paths should ever load this browser worker.
 */
async function enableMockBackendIfNeeded(): Promise<void> {
  if (import.meta.env.DEV && !import.meta.env.VITE_BACKEND_URL) {
    const { worker } = await import('./mocks/browser');
    await worker.start({ onUnhandledRequest: 'bypass' });
  }
}

function renderApp() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {/* Safety net only: route-render errors (e.g. the fault planted in
          LensCareGuidePage) are caught and reported by router.tsx's
          errorElement (RouteErrorBoundary) before they ever reach here —
          React Router's own boundary sits between this component and the
          route tree, and always wins the race. This boundary still matters
          for errors thrown outside the router entirely, e.g. during
          CartProvider/CustomerProvider render, where there is no route
          boundary to catch them. */}
      <FaroErrorBoundary
        fallback={(error) => (
          <div className="app-crashed">
            <h1>Something broke the eyepiece.</h1>
            <p>{error.message}</p>
            <a href="/">Reload Spyglass</a>
          </div>
        )}
      >
        <CartProvider>
          <CustomerProvider>
            <RouterProvider router={router} />
          </CustomerProvider>
        </CartProvider>
      </FaroErrorBoundary>
    </StrictMode>,
  );
}

enableMockBackendIfNeeded().then(renderApp);
