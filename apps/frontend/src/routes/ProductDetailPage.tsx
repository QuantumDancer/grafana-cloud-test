import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchProduct, fetchProductReviews } from '../api/client';
import { StarRating } from '../components/StarRating';
import { useCart } from '../state/CartContext';
import type { Product, Review } from '../types/domain';

export function ProductDetailPage() {
  const { id } = useParams();
  const productId = Number(id);
  const navigate = useNavigate();
  const { addItem } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      setProduct(null);
      try {
        const [p, r] = await Promise.all([fetchProduct(productId), fetchProductReviews(productId)]);
        if (!cancelled) {
          setProduct(p);
          setReviews(r);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (error) {
    return <p className="error-banner">Couldn't load this product: {error}</p>;
  }
  if (!product) {
    return <p>Loading…</p>;
  }

  return (
    <div className="product-detail">
      <button className="back-link" onClick={() => navigate(-1)}>← Back</button>
      <div className="product-detail__main">
        <span className="product-detail__emoji" aria-hidden="true">{product.emoji}</span>
        <div>
          <h2>{product.name}</h2>
          <p className="product-detail__category">{product.category}</p>
          <p className="product-detail__price">${product.price.toFixed(2)}</p>
          <p>{product.description}</p>
          {product.stock === 0 ? (
            <p className="product-card__stock--out">Out of stock</p>
          ) : (
            <button
              onClick={() => {
                addItem(product);
                setAdded(true);
              }}
            >
              Add to cart
            </button>
          )}
          {added && (
            <p className="product-detail__added">
              Added to cart. <Link to="/cart">View cart</Link>
            </p>
          )}
        </div>
      </div>

      <section className="product-detail__reviews">
        <h3>Reviews</h3>
        {reviews.length === 0 ? (
          <p>No reviews yet.</p>
        ) : (
          <ul>
            {reviews.map((review) => (
              <li key={review.id}>
                <StarRating rating={review.rating} /> <strong>{review.author}</strong>
                <p>{review.comment}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
