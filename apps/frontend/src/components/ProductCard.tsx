import { Link } from 'react-router-dom';
import type { Product } from '../types/domain';

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link to={`/products/${product.id}`} className="product-card">
      <span className="product-card__emoji" aria-hidden="true">{product.emoji}</span>
      <h3>{product.name}</h3>
      <p className="product-card__category">{product.category}</p>
      <p className="product-card__price">${product.price.toFixed(2)}</p>
      {product.stock === 0 ? (
        <p className="product-card__stock product-card__stock--out">Out of stock</p>
      ) : (
        <p className="product-card__stock">{product.stock} in stock</p>
      )}
    </Link>
  );
}
