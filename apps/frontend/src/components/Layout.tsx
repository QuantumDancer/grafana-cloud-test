import { NavLink, Outlet } from 'react-router-dom';
import { useCart } from '../state/CartContext';
import { useCustomer } from '../state/CustomerContext';

// The single shell rendered by the router's root route; per-route content
// goes through <Outlet/>. Nav is deliberately plain — this app exists to
// generate telemetry, not to demonstrate UI craft.
export function Layout() {
  const { itemCount } = useCart();
  const { lastCustomerId } = useCustomer();

  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink to="/" className="app-header__brand">
          🔭 Spyglass
        </NavLink>
        <nav className="app-header__nav">
          <NavLink to="/" end>Catalog</NavLink>
          <NavLink to="/cart">Cart{itemCount > 0 ? ` (${itemCount})` : ''}</NavLink>
          <NavLink to={lastCustomerId ? `/orders/${lastCustomerId}` : '/orders'}>Order History</NavLink>
          <NavLink to="/lens-care">Lens Care Guide</NavLink>
          <NavLink to="/slow-page">Deep Sky Almanac</NavLink>
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">Spyglass — demo storefront for observation gear. Not a real shop.</footer>
    </div>
  );
}
