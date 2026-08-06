import type { Category, Order, Product, Review } from '../types/domain';

// Backing data for both the MSW mock handlers (standalone/dev/test) and
// nothing else — the real backend owns this data in every other environment.
// Kept in one module so catalog, reviews, and the stock levels checkout
// depends on all agree with each other.

export const PRODUCTS: Product[] = [
  { id: 1, name: 'Voyager 70mm Refractor', category: 'Telescopes', price: 189.99, stock: 12, emoji: '🔭', description: 'A beginner-friendly refractor with a 70mm objective lens — enough aperture to resolve Saturn\'s rings on a clear night.' },
  { id: 2, name: 'Nebula Hunter 8" Dobsonian', category: 'Telescopes', price: 549.0, stock: 4, emoji: '🔭', description: 'Big, simple, and unapologetically manual. The 8-inch mirror pulls in faint galaxies that smaller scopes can only guess at.' },
  { id: 3, name: 'Starlight Mini Travel Scope', category: 'Telescopes', price: 79.5, stock: 30, emoji: '🔭', description: 'Fits in a daypack. Trades aperture for the fact that you\'ll actually bring it with you.' },
  { id: 4, name: 'Meridian 127mm Maksutov', category: 'Telescopes', price: 429.0, stock: 0, emoji: '🔭', description: 'Long focal length in a short tube — a planetary specialist for high-power lunar and Jupiter viewing.' },
  { id: 5, name: 'Comet Chaser 6" Reflector', category: 'Telescopes', price: 339.0, stock: 7, emoji: '🔭', description: 'A Newtonian reflector tuned for wide-field views of comets and star clusters.' },
  { id: 6, name: 'Harbor Watch 8x42 Binoculars', category: 'Binoculars', price: 129.0, stock: 25, emoji: '🔎', description: 'The general-purpose pair: bright, waterproof, and equally happy at a birdwatching blind or a ballgame.' },
  { id: 7, name: 'Summit 10x50 Binoculars', category: 'Binoculars', price: 159.0, stock: 18, emoji: '🔎', description: 'Extra light-gathering for dusk and dawn glassing sessions in the field.' },
  { id: 8, name: 'Pocket Ranger 8x25 Compact', category: 'Binoculars', price: 59.99, stock: 40, emoji: '🔎', description: 'Folds down to jacket-pocket size without giving up much sharpness.' },
  { id: 9, name: 'Astro-Bino 15x70 Giants', category: 'Binoculars', price: 249.0, stock: 6, emoji: '🔎', description: 'Tripod-mounted giant binoculars built for scanning the Milky Way, not for hiking.' },
  { id: 10, name: 'Marsh Glass 12x56 Low-Light', category: 'Binoculars', price: 219.0, stock: 0, emoji: '🔎', description: 'Wide exit pupil for the last usable minutes of dusk on the water.' },
  { id: 11, name: "Naturalist's 10x Loupe", category: 'Magnifying Glasses', price: 24.0, stock: 60, emoji: '🔍', description: 'Jeweler-grade folding loupe for lichen, insects, and mineral specimens.' },
  { id: 12, name: 'Reading Ring Magnifier', category: 'Magnifying Glasses', price: 14.5, stock: 80, emoji: '🔍', description: 'A simple 3x hand lens with a comfortable grip for maps and fine print.' },
  { id: 13, name: 'Workshop LED Magnifier Lamp', category: 'Magnifying Glasses', price: 45.0, stock: 15, emoji: '🔍', description: 'Bench-mounted glass with a ring light — for solder joints and splinters alike.' },
  { id: 14, name: 'Antique Brass Magnifier', category: 'Magnifying Glasses', price: 32.0, stock: 9, emoji: '🔍', description: 'Looks like it belongs on a detective\'s desk. Optically it\'s a plain 5x glass.' },
  { id: 15, name: 'Linen Tester Loupe', category: 'Magnifying Glasses', price: 19.0, stock: 22, emoji: '🔍', description: 'A folding fabric-count loupe, equally at home checking stitch density or dot-matrix printing.' },
];

export const REVIEWS: Review[] = [
  { id: 1, productId: 1, author: 'Priya', rating: 5, comment: 'Found the rings of Saturn on my second night out. Great starter scope.' },
  { id: 2, productId: 1, author: 'Marcus', rating: 4, comment: 'Tripod is a little wobbly at full extension but the optics are solid.' },
  { id: 3, productId: 2, author: 'Dana', rating: 5, comment: 'Huge upgrade from my old 4.5". M13 actually looks like a cluster now.' },
  { id: 4, productId: 3, author: 'Owen', rating: 4, comment: 'Perfect for a carry-on. Don\'t expect deep-sky miracles though.' },
  { id: 5, productId: 5, author: 'Linh', rating: 5, comment: 'Wide field views of the Pleiades were stunning.' },
  { id: 6, productId: 6, author: 'Sam', rating: 5, comment: 'Bought these for a stadium and ended up using them for birding too.' },
  { id: 7, productId: 6, author: 'Fatima', rating: 4, comment: 'Great value, slightly heavy for all-day carry.' },
  { id: 8, productId: 7, author: 'Greg', rating: 5, comment: 'Noticeably brighter than my old 8x42 at dusk.' },
  { id: 9, productId: 9, author: 'Ines', rating: 5, comment: 'Need the tripod but the views of the Milky Way core are unreal.' },
  { id: 10, productId: 11, author: 'Ben', rating: 5, comment: 'Sharp to the edge, folds up small. Exactly what a field loupe should be.' },
  { id: 11, productId: 13, author: 'Ravi', rating: 4, comment: 'Ring light is a nice touch for late-night soldering.' },
];

export const CATEGORIES: Category[] = ['Telescopes', 'Binoculars', 'Magnifying Glasses'];

// Orders accumulate in module state so the mock backend behaves like a real
// one across a session (checkout, then order history, in the same tab).
// Reset per test run because vitest re-imports the module fresh each file.
export const ORDERS: Order[] = [];
let nextOrderId = 1000;

export function nextOrderIdSequence(): number {
  return nextOrderId++;
}

export function findProduct(id: number): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}
