import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Product } from '../types/domain';
import { CartProvider, useCart } from './CartContext';

const telescope: Product = {
  id: 1,
  name: 'Voyager 70mm Refractor',
  category: 'Telescopes',
  price: 189.99,
  stock: 12,
  emoji: '🔭',
  description: 'test fixture',
};

const binoculars: Product = {
  id: 6,
  name: 'Harbor Watch 8x42 Binoculars',
  category: 'Binoculars',
  price: 129.0,
  stock: 25,
  emoji: '🔎',
  description: 'test fixture',
};

function setup() {
  return renderHook(() => useCart(), { wrapper: CartProvider });
}

describe('CartContext math', () => {
  it('starts empty', () => {
    const { result } = setup();
    expect(result.current.itemCount).toBe(0);
    expect(result.current.subtotal).toBe(0);
  });

  it('accumulates quantity when the same product is added twice', () => {
    const { result } = setup();
    act(() => result.current.addItem(telescope));
    act(() => result.current.addItem(telescope, 2));

    expect(result.current.lines).toHaveLength(1);
    expect(result.current.itemCount).toBe(3);
    expect(result.current.subtotal).toBeCloseTo(189.99 * 3);
  });

  it('computes subtotal across multiple distinct products', () => {
    const { result } = setup();
    act(() => result.current.addItem(telescope, 1));
    act(() => result.current.addItem(binoculars, 2));

    expect(result.current.itemCount).toBe(3);
    expect(result.current.subtotal).toBeCloseTo(189.99 + 129.0 * 2);
  });

  it('setQuantity to zero removes the line rather than leaving a zero-quantity row', () => {
    const { result } = setup();
    act(() => result.current.addItem(telescope));
    act(() => result.current.setQuantity(telescope.id, 0));

    expect(result.current.lines).toHaveLength(0);
  });

  it('removeItem drops only the targeted line', () => {
    const { result } = setup();
    act(() => result.current.addItem(telescope));
    act(() => result.current.addItem(binoculars));
    act(() => result.current.removeItem(telescope.id));

    expect(result.current.lines).toHaveLength(1);
    expect(result.current.lines[0].product.id).toBe(binoculars.id);
  });
});
