-- ~100,000 orders with 1-5 items each, fully set-based (no row-by-row PL/pgSQL loop) so the
-- whole seed still completes in seconds. The shape is: generate order "specs" once, insert the
-- orders, then fan each order out into 1-5 item rows via a CROSS JOIN against generate_series(1,5)
-- filtered down to that order's own item_count — a standard trick for turning a per-row count
-- into a variable number of child rows without procedural code.
WITH order_specs AS (
    SELECT
        n,
        1 + abs(hashtext('customer' || n)) % 10000 AS customer_id,
        1 + abs(hashtext('itemcount' || n)) % 5    AS item_count,
        abs(hashtext('orderage' || n))              AS age_hash
    FROM generate_series(1, 100000) AS n
)
INSERT INTO orders (id, customer_id, status, total_cents, created_at)
SELECT n, customer_id, 'COMPLETED', 0, now() - (age_hash % 730 || ' days')::interval
FROM order_specs
ORDER BY n;

-- Explicit ids above (so item generation below can reference order n directly) mean the id
-- sequence itself never advanced; realign it before the app starts minting its own orders.
SELECT setval(pg_get_serial_sequence('orders', 'id'), (SELECT max(id) FROM orders));

WITH order_specs AS (
    SELECT n, 1 + abs(hashtext('itemcount' || n)) % 5 AS item_count
    FROM generate_series(1, 100000) AS n
),
item_slots AS (
    -- One row per (order, item position) up to that order's item_count (1-5).
    SELECT os.n AS order_id, idx.i AS item_index
    FROM order_specs os
    CROSS JOIN generate_series(1, 5) AS idx (i)
    WHERE idx.i <= os.item_count
),
item_specs AS (
    SELECT
        order_id,
        item_index,
        1 + abs(hashtext('product' || order_id || '-' || item_index)) % 1000 AS product_id,
        1 + abs(hashtext('qty' || order_id || '-' || item_index)) % 3        AS quantity
    FROM item_slots
)
INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents)
SELECT s.order_id, s.product_id, s.quantity, p.price_cents
FROM item_specs s
JOIN products p ON p.id = s.product_id;

-- Orders were inserted with a placeholder total_cents of 0; backfill now that line items (and
-- therefore each order's real total) exist. Cheaper as one aggregate UPDATE than maintaining a
-- running total while generating items above.
UPDATE orders o
SET total_cents = agg.total
FROM (
    SELECT order_id, sum(quantity * unit_price_cents) AS total
    FROM order_items
    GROUP BY order_id
) agg
WHERE o.id = agg.order_id;
