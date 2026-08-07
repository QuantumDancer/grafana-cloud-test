import type { WireOrder, WireProductDetail, WireReview } from '../types/wire';

// Backing data for the MSW mock handlers (standalone dev and every vitest
// run) — the real backend owns this data in every other environment.
//
// The rows are modelled on the backend's *tables*, not on anything the UI
// wants: integer `priceCents`, `TELESCOPE`-style category names, `authorName`
// /`text` on reviews. The handlers then project them into the same DTOs Spring
// serializes. That's deliberate: when these fixtures spoke the frontend's own
// invented shape, every test passed against a contract the backend had never
// agreed to, and the mismatch only surfaced in a real browser (see the header
// of `src/types/domain.ts`).

/** The `products` table. Descriptions here mirror the real seed data's habit of
 *  mentioning the magnification and aperture in prose, since the search
 *  predicate matches on description text. */
export const PRODUCTS: WireProductDetail[] = [
  { id: 1, name: 'Voyager 70mm Refractor', category: 'TELESCOPE', magnification: 35, apertureMm: 70, priceCents: 18999, stock: 12, description: 'A beginner-friendly refractor with a 70mm objective lens — enough aperture to resolve Saturn\'s rings on a clear night.' },
  { id: 2, name: 'Nebula Hunter 8" Dobsonian', category: 'TELESCOPE', magnification: 48, apertureMm: 203, priceCents: 54900, stock: 4, description: 'Big, simple, and unapologetically manual. The 8-inch mirror pulls in faint galaxies that smaller scopes can only guess at.' },
  { id: 3, name: 'Starlight Mini Travel Scope', category: 'TELESCOPE', magnification: 20, apertureMm: 50, priceCents: 7950, stock: 30, description: 'Fits in a daypack. Trades aperture for the fact that you\'ll actually bring it with you.' },
  { id: 4, name: 'Meridian 127mm Maksutov', category: 'TELESCOPE', magnification: 60, apertureMm: 127, priceCents: 42900, stock: 0, description: 'Long focal length in a short tube — a planetary specialist for high-power lunar and Jupiter viewing.' },
  { id: 5, name: 'Comet Chaser 6" Reflector', category: 'TELESCOPE', magnification: 40, apertureMm: 152, priceCents: 33900, stock: 7, description: 'A Newtonian reflector tuned for wide-field views of comets and star clusters.' },
  { id: 6, name: 'Harbor Watch 8x42 Binoculars', category: 'BINOCULARS', magnification: 8, apertureMm: 42, priceCents: 12900, stock: 25, description: 'The general-purpose pair: bright, waterproof, and equally happy at a birdwatching blind or a ballgame.' },
  { id: 7, name: 'Summit 10x50 Binoculars', category: 'BINOCULARS', magnification: 10, apertureMm: 50, priceCents: 15900, stock: 18, description: 'Extra light-gathering for dusk and dawn glassing sessions in the field.' },
  { id: 8, name: 'Pocket Ranger 8x25 Compact', category: 'BINOCULARS', magnification: 8, apertureMm: 25, priceCents: 5999, stock: 40, description: 'Folds down to jacket-pocket size without giving up much sharpness.' },
  { id: 9, name: 'Astro-Bino 15x70 Giants', category: 'BINOCULARS', magnification: 15, apertureMm: 70, priceCents: 24900, stock: 6, description: 'Tripod-mounted giant binoculars built for scanning the Milky Way, not for hiking.' },
  { id: 10, name: 'Marsh Glass 12x56 Low-Light', category: 'BINOCULARS', magnification: 12, apertureMm: 56, priceCents: 21900, stock: 0, description: 'Wide exit pupil for the last usable minutes of dusk on the water.' },
  { id: 11, name: "Naturalist's 10x Loupe", category: 'MAGNIFIER', magnification: 10, apertureMm: null, priceCents: 2400, stock: 60, description: 'Jeweler-grade folding loupe for lichen, insects, and mineral specimens.' },
  { id: 12, name: 'Reading Ring Magnifier', category: 'MAGNIFIER', magnification: 3, apertureMm: null, priceCents: 1450, stock: 80, description: 'A simple 3x hand lens with a comfortable grip for maps and fine print.' },
  { id: 13, name: 'Workshop LED Magnifier Lamp', category: 'MAGNIFIER', magnification: 2, apertureMm: null, priceCents: 4500, stock: 15, description: 'Bench-mounted glass with a ring light — for solder joints and splinters alike.' },
  { id: 14, name: 'Antique Brass Magnifier', category: 'MAGNIFIER', magnification: 5, apertureMm: null, priceCents: 3200, stock: 9, description: 'Looks like it belongs on a detective\'s desk. Optically it\'s a plain 5x glass.' },
  { id: 15, name: 'Linen Tester Loupe', category: 'MAGNIFIER', magnification: 6, apertureMm: null, priceCents: 1900, stock: 22, description: 'A folding fabric-count loupe, equally at home checking stitch density or dot-matrix printing.' },
];

/** The `reviews` table. `productId` is a column here but never reaches the
 *  wire: the backend's `ReviewDto` omits it, because the only endpoint that
 *  returns reviews is already scoped to one product. */
export const REVIEWS: (WireReview & { productId: number })[] = [
  { id: 1, productId: 1, authorName: 'Priya', rating: 5, text: 'Found the rings of Saturn on my second night out. Great starter scope.', createdAt: '2026-05-02T18:12:44Z' },
  { id: 2, productId: 1, authorName: 'Marcus', rating: 4, text: 'Tripod is a little wobbly at full extension but the optics are solid.', createdAt: '2026-04-28T09:31:02Z' },
  { id: 3, productId: 2, authorName: 'Dana', rating: 5, text: 'Huge upgrade from my old 4.5". M13 actually looks like a cluster now.', createdAt: '2026-06-11T21:45:19Z' },
  { id: 4, productId: 3, authorName: 'Owen', rating: 4, text: 'Perfect for a carry-on. Don\'t expect deep-sky miracles though.', createdAt: '2026-03-17T12:05:38Z' },
  { id: 5, productId: 5, authorName: 'Linh', rating: 5, text: 'Wide field views of the Pleiades were stunning.', createdAt: '2026-05-30T22:58:07Z' },
  { id: 6, productId: 6, authorName: 'Sam', rating: 5, text: 'Bought these for a stadium and ended up using them for birding too.', createdAt: '2026-06-02T15:22:51Z' },
  { id: 7, productId: 6, authorName: 'Fatima', rating: 4, text: 'Great value, slightly heavy for all-day carry.', createdAt: '2026-05-19T08:47:13Z' },
  { id: 8, productId: 7, authorName: 'Greg', rating: 5, text: 'Noticeably brighter than my old 8x42 at dusk.', createdAt: '2026-04-09T19:36:25Z' },
  { id: 9, productId: 9, authorName: 'Ines', rating: 5, text: 'Need the tripod but the views of the Milky Way core are unreal.', createdAt: '2026-06-21T23:14:09Z' },
  { id: 10, productId: 11, authorName: 'Ben', rating: 5, text: 'Sharp to the edge, folds up small. Exactly what a field loupe should be.', createdAt: '2026-02-14T10:03:55Z' },
  { id: 11, productId: 13, authorName: 'Ravi', rating: 4, text: 'Ring light is a nice touch for late-night soldering.', createdAt: '2026-01-27T20:41:33Z' },
];

// Orders accumulate in module state so the mock backend behaves like a real
// one across a session (checkout, then order history, in the same tab).
// Reset per test run because vitest re-imports the module fresh each file.
export const ORDERS: WireOrder[] = [];
let nextOrderId = 1000;

export function nextOrderIdSequence(): number {
  return nextOrderId++;
}

export function findProduct(id: number): WireProductDetail | undefined {
  return PRODUCTS.find((p) => p.id === id);
}
