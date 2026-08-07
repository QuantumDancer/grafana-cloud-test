import { render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { RouteErrorBoundary } from './RouteErrorBoundary';

// `faro` is a live-bound singleton (see faro-core's registerFaro) that
// defaults to a noop API until initializeFaro runs, which never happens in
// tests — replace it with a spy so pushError calls are observable.
vi.mock('@grafana/faro-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@grafana/faro-react')>();
  return {
    ...actual,
    faro: { api: { pushError: vi.fn() } },
  };
});

function ThrowsInRender(): never {
  throw new Error('Lens Care Guide: eyepiece coating chart failed to load (planted fault #1)');
}

describe('RouteErrorBoundary', () => {
  it('renders the app-crashed fallback and reports the error to Faro exactly once', async () => {
    const { faro } = await import('@grafana/faro-react');
    const router = createMemoryRouter([
      {
        path: '/',
        errorElement: <RouteErrorBoundary />,
        children: [{ index: true, element: <ThrowsInRender /> }],
      },
    ]);

    // StrictMode is what production's main.tsx also renders under, and is
    // what double-invokes effects in dev — the assertion below only proves
    // anything if pushError survives that double-invocation still called once.
    render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    );

    expect(await screen.findByText('Something broke the eyepiece.')).toBeInTheDocument();
    expect(
      screen.getByText('Lens Care Guide: eyepiece coating chart failed to load (planted fault #1)'),
    ).toBeInTheDocument();
    expect(faro.api.pushError).toHaveBeenCalledTimes(1);
    expect(faro.api.pushError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Lens Care Guide: eyepiece coating chart failed to load (planted fault #1)',
      }),
    );
  });
});
