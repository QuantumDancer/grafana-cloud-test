import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CatalogPage } from './CatalogPage';

function renderCatalog() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<CatalogPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CatalogPage search', () => {
  it('lists the full catalog before any search is entered', async () => {
    renderCatalog();
    expect(await screen.findByText('Voyager 70mm Refractor')).toBeInTheDocument();
    expect(screen.getByText('Harbor Watch 8x42 Binoculars')).toBeInTheDocument();
  });

  it('narrows results to matching products as the user types', async () => {
    const user = userEvent.setup();
    renderCatalog();
    await screen.findByText('Voyager 70mm Refractor');

    await user.type(screen.getByLabelText('Search products'), 'Nebula');

    await waitFor(() => {
      expect(screen.getByText('Nebula Hunter 8" Dobsonian')).toBeInTheDocument();
      expect(screen.queryByText('Voyager 70mm Refractor')).not.toBeInTheDocument();
    });
  });

  it('shows an empty-state message when nothing matches', async () => {
    const user = userEvent.setup();
    renderCatalog();
    await screen.findByText('Voyager 70mm Refractor');

    await user.type(screen.getByLabelText('Search products'), 'nonexistent-product-xyz');

    expect(await screen.findByText('No products match your search.')).toBeInTheDocument();
  });

  it('filters by category', async () => {
    const user = userEvent.setup();
    renderCatalog();
    await screen.findByText('Voyager 70mm Refractor');

    await user.selectOptions(screen.getByLabelText('Filter by category'), 'Magnifying Glasses');

    await waitFor(() => {
      expect(screen.getByText("Naturalist's 10x Loupe")).toBeInTheDocument();
      expect(screen.queryByText('Voyager 70mm Refractor')).not.toBeInTheDocument();
    });
  });
});
