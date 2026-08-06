-- Reviews on ~30% of the 1,000 products (picked deterministically via `id % 10 < 3`), 1-4 reviews
-- each — same generate_series fan-out trick as the order items in V4.
WITH reviewed_products AS (
    SELECT id AS product_id, 1 + abs(hashtext('reviewcount' || id)) % 4 AS review_count
    FROM products
    WHERE id % 10 < 3
),
review_slots AS (
    SELECT rp.product_id, idx.i AS review_index
    FROM reviewed_products rp
    CROSS JOIN generate_series(1, 4) AS idx (i)
    WHERE idx.i <= rp.review_count
)
INSERT INTO reviews (product_id, author_name, rating, text, created_at)
SELECT
    product_id,
    first_name || ' ' || last_initial || '.' AS author_name,
    rating,
    (ARRAY[
        'Exceeded my expectations for the price — the optics are noticeably sharp.',
        'Solid build quality, does exactly what it says on the box.',
        'Good value, though the included case feels a bit flimsy.',
        'Fantastic clarity, this has become my go-to for every trip.',
        'Decent for beginners but experienced users may want to upgrade eventually.'
    ])[1 + rating_hash % 5] AS text,
    now() - (age_hash % 500 || ' days')::interval AS created_at
FROM (
    SELECT
        product_id,
        review_index,
        (ARRAY['Alex', 'Jordan', 'Sam', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie'])
            [1 + abs(hashtext('revfirst' || product_id || '-' || review_index)) % 8] AS first_name,
        chr(65 + abs(hashtext('revlast' || product_id || '-' || review_index)) % 26) AS last_initial,
        -- Ratings skew positive (3-5) like most real product review sets.
        3 + abs(hashtext('rating' || product_id || '-' || review_index)) % 3 AS rating,
        abs(hashtext('ratingtext' || product_id || '-' || review_index)) AS rating_hash,
        abs(hashtext('revage' || product_id || '-' || review_index)) AS age_hash
    FROM review_slots
) generated;
