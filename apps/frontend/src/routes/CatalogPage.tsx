import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchProducts } from '../api/client';
import { ProductCard } from '../components/ProductCard';
import type { Category, ProductPage } from '../types/domain';

const CATEGORIES: Category[] = ['Telescopes', 'Binoculars', 'Magnifying Glasses'];

/**
 * Catalog with search + category filter. Filter state lives in the URL
 * (search params) rather than component state: it makes the current search
 * a shareable/bookmarkable link and — usefully for Faro — gives each search
 * its own navigation entry, so search-driven route changes show up as
 * distinct views rather than being invisible client-side state mutation.
 */
export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const category = searchParams.get('category') ?? '';
  const page = Number(searchParams.get('page') ?? '1') || 1;

  const [data, setData] = useState<ProductPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const result = await fetchProducts({ search, category, page });
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [search, category, page]);

  const updateParams = (next: Record<string, string>) => {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    // Any change to search or category starts back at page 1 — otherwise a
    // narrowed result set could leave the user stranded past the last page.
    if (!('page' in next)) params.delete('page');
    setSearchParams(params);
  };

  return (
    <div className="catalog">
      <div className="catalog__controls">
        <input
          type="search"
          placeholder="Search telescopes, binoculars, magnifiers…"
          value={search}
          onChange={(e) => updateParams({ search: e.target.value })}
          aria-label="Search products"
        />
        <select value={category} onChange={(e) => updateParams({ category: e.target.value })} aria-label="Filter by category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {error && <p className="error-banner">Couldn't load the catalog: {error}</p>}

      {data && (
        <>
          {data.items.length === 0 ? (
            <p className="catalog__empty">No products match your search.</p>
          ) : (
            <div className="product-grid">
              {data.items.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}

          {data.totalPages > 1 && (
            <div className="catalog__pagination">
              <button disabled={page <= 1} onClick={() => updateParams({ page: String(page - 1) })}>
                ← Previous
              </button>
              <span>Page {data.page} of {data.totalPages}</span>
              <button disabled={page >= data.totalPages} onClick={() => updateParams({ page: String(page + 1) })}>
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
