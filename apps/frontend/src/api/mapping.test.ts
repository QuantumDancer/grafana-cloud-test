import { describe, expect, it } from 'vitest';
import { toWirePageNumber } from './mapping';

// `toWirePageNumber` is the one place responsible for turning whatever made
// it into `?page=` into an index the backend's `@RequestParam int page` will
// accept — see issue 17, where a hand-edited `?page=2.7` reached the backend
// as `page=1.7000000000000002` and got a 400 back.
describe('toWirePageNumber', () => {
  it('shifts a 1-based UI page down to the backend\'s 0-based index', () => {
    expect(toWirePageNumber(1)).toBe(0);
    expect(toWirePageNumber(3)).toBe(2);
  });

  it('floors a malformed page below 1 at 0 rather than going negative', () => {
    expect(toWirePageNumber(0)).toBe(0);
    expect(toWirePageNumber(-5)).toBe(0);
  });

  it('defaults to page 1 (wire index 0) when no page is given', () => {
    expect(toWirePageNumber(undefined)).toBe(0);
  });

  it('truncates a fractional page instead of passing it through to the backend', () => {
    expect(toWirePageNumber(2.7)).toBe(1);
    expect(toWirePageNumber(1.2)).toBe(0);
  });
});
