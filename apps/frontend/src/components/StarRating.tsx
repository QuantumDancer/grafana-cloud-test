export function StarRating({ rating }: { rating: number }) {
  // Plain text stars rather than an icon set — one fewer asset/dependency
  // for a rating widget nobody needs to be pixel-perfect.
  const full = '★'.repeat(rating);
  const empty = '☆'.repeat(5 - rating);
  return (
    <span className="star-rating" aria-label={`${rating} out of 5 stars`}>
      {full}
      {empty}
    </span>
  );
}
