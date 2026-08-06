import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="not-found">
      <h2>Lost in the eyepiece</h2>
      <p>Nothing here — the page you're looking for doesn't exist.</p>
      <Link to="/">Back to the catalog</Link>
    </div>
  );
}
