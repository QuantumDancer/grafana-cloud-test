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
      {/* Reports the error to Faro, then renders the fallback — this must be
          the outermost boundary so no other component can swallow an error
          before Faro sees it (see faults planted in LensCareGuidePage). */}
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
