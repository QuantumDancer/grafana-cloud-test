import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../state/CartContext';

export function CartPage() {
  const { lines, removeItem, setQuantity, subtotal } = useCart();
  const navigate = useNavigate();

  if (lines.length === 0) {
    return (
      <div className="cart-empty">
        <p>Your cart is empty.</p>
        <Link to="/">Browse the catalog</Link>
      </div>
    );
  }

  return (
    <div className="cart">
      <table className="cart__table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Price</th>
            <th>Quantity</th>
            <th>Line total</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lines.map(({ product, quantity }) => (
            <tr key={product.id}>
              <td>
                <Link to={`/products/${product.id}`}>{product.emoji} {product.name}</Link>
              </td>
              <td>${product.price.toFixed(2)}</td>
              <td>
                <input
                  type="number"
                  min={1}
                  max={product.stock}
                  value={quantity}
                  onChange={(e) => setQuantity(product.id, Number(e.target.value))}
                  aria-label={`Quantity for ${product.name}`}
                />
              </td>
              <td>${(product.price * quantity).toFixed(2)}</td>
              <td>
                <button onClick={() => removeItem(product.id)}>Remove</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="cart__summary">
        <p>Subtotal: <strong>${subtotal.toFixed(2)}</strong></p>
        <button onClick={() => navigate('/checkout')}>Proceed to checkout</button>
      </div>
    </div>
  );
}
