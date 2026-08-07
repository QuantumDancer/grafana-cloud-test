import { faro } from '@grafana/faro-react';
import { useEffect, useRef } from 'react';
import { useRouteError } from 'react-router-dom';

/**
 * Root route's `errorElement`. React Router's own boundary intercepts any
 * error thrown during render/loader/action *before* `FaroErrorBoundary` (an
 * ordinary component boundary further down the tree, or in this app's case
 * mounted outside the router entirely) ever sees it — so without this, Faro
 * only learns about the crash secondhand, from whatever console.error the
 * unhandled-error machinery logs on the way past. That produces a
 * console-capture signal whose stack is Faro's own logging internals, not
 * the throw site, and — because navigation/render/commit each get their own
 * console line — several of them per crash. Reporting the real `Error`
 * object here, at the boundary that actually receives it, is what gets a
 * single `kind=exception` signal with a stack that resolves to the
 * component that threw.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();

  // StrictMode double-invokes effects in dev (mount, cleanup, mount again)
  // to surface missing-cleanup bugs; it does not remount the component or
  // reset its refs between those invocations. Guarding with a ref — and
  // deliberately *not* clearing it in the cleanup — means the second
  // invocation sees `reported.current` already true and skips, so exactly
  // one `pushError` fires per thrown error in both dev and production.
  const reported = useRef(false);
  useEffect(() => {
    if (reported.current) {
      return;
    }
    reported.current = true;
    faro.api.pushError(error instanceof Error ? error : new Error(String(error)));
  }, [error]);

  return (
    <div className="app-crashed">
      <h1>Something broke the eyepiece.</h1>
      <p>{error instanceof Error ? error.message : String(error)}</p>
      <a href="/">Reload Spyglass</a>
    </div>
  );
}
