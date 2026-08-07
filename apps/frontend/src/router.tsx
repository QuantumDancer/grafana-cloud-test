import { withFaroRouterInstrumentation } from '@grafana/faro-react';
import { createBrowserRouter } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';
import { CartPage } from './routes/CartPage';
import { CatalogPage } from './routes/CatalogPage';
import { CheckoutPage } from './routes/CheckoutPage';
import { LensCareGuidePage } from './routes/LensCareGuidePage';
import { NotFoundPage } from './routes/NotFoundPage';
import { OrderHistoryPage } from './routes/OrderHistoryPage';
import { ProductDetailPage } from './routes/ProductDetailPage';
import { SlowPage } from './routes/SlowPage';

const dataRouter = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    // React Router's own boundary catches render/loader/action errors before
    // `FaroErrorBoundary` (mounted in main.tsx, outside <RouterProvider>) ever
    // sees them — without an errorElement here, Faro only learns about a
    // crash secondhand via console.error, as a triplicated, unmappable
    // console-capture signal instead of a single real exception. See
    // RouteErrorBoundary for the reporting side of this fix.
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <CatalogPage /> },
      { path: 'products/:id', element: <ProductDetailPage /> },
      { path: 'cart', element: <CartPage /> },
      { path: 'checkout', element: <CheckoutPage /> },
      { path: 'orders', element: <OrderHistoryPage /> },
      { path: 'orders/:customerId', element: <OrderHistoryPage /> },
      { path: 'lens-care', element: <LensCareGuidePage /> },
      { path: 'slow-page', element: <SlowPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

// Wrapping the data router is what makes Faro's ReactIntegration (configured
// in src/faro.ts) see route changes as view/navigation events. This is a
// no-op transform when Faro was never initialized (no collector URL), so it's
// safe to always apply.
export const router = withFaroRouterInstrumentation(dataRouter);
