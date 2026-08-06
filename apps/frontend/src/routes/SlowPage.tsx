import { useState } from 'react';
import { loadRuntimeConfig } from '../config';

// A junk-drawer of astronomical-sounding names to pad out the almanac table
// without needing real content — this page's substance is its slowness.
const CATALOG_PREFIXES = ['NGC', 'Messier', 'IC', 'Barnard', 'Sharpless', 'Caldwell'];
const OBJECT_COUNT = 4000;

/** Deliberately wasteful synchronous work standing in for "a bad render" —
 * a real-world equivalent would be an unmemoized formatter or layout
 * calculation run per row. Recomputing a Leibniz-series pi approximation is
 * just a CPU sink with no useful side effects, chosen so nothing here reads
 * as accidentally-meaningful business logic. */
function expensiveComputation(seed: number): number {
  let pi = 0;
  for (let i = 0; i < 20000; i++) {
    pi += ((i % 2 === 0 ? 1 : -1) / (2 * i + 1)) * (1 + (seed % 7));
  }
  return pi;
}

interface AlmanacRow {
  id: number;
  name: string;
  magnitude: string;
}

function buildAlmanac(filter: string): AlmanacRow[] {
  const rows: AlmanacRow[] = [];
  for (let i = 0; i < OBJECT_COUNT; i++) {
    // The busy-work runs unconditionally, for every row, on every render —
    // including ones triggered by typing in the filter box below — which is
    // exactly the "heavy synchronous render" the brief asks for: it blocks
    // the main thread long enough to show up as poor LCP on first load and
    // poor INP on every keystroke.
    const value = expensiveComputation(i);
    const name = `${CATALOG_PREFIXES[i % CATALOG_PREFIXES.length]} ${1000 + i}`;
    if (filter && !name.toLowerCase().includes(filter.toLowerCase())) continue;
    rows.push({ id: i, name, magnitude: value.toFixed(3) });
  }
  return rows;
}

/**
 * PLANTED FAULT #2 (runtime-toggleable via config.faultsEnabled): an
 * artificially slow page. When faults are disabled we skip straight to a
 * short, fast list so the route is still usable/testable without the
 * performance hit.
 */
export function SlowPage() {
  const [filter, setFilter] = useState('');
  const faultsEnabled = loadRuntimeConfig().faultsEnabled;

  const rows = faultsEnabled ? buildAlmanac(filter) : buildAlmanac(filter).slice(0, 20);

  return (
    <div className="slow-page">
      <h2>Deep Sky Almanac</h2>
      <p>A (deliberately unoptimized) catalog of {OBJECT_COUNT.toLocaleString()} deep-sky objects.</p>
      <input
        type="search"
        placeholder="Filter by name…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        aria-label="Filter almanac"
      />
      <table className="slow-page__table">
        <thead>
          <tr><th>Object</th><th>Computed magnitude</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}><td>{row.name}</td><td>{row.magnitude}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
