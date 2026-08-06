-- Spyglass core schema. Columns are deliberately unremarkable — this app's job is to be a
-- realistic-looking OLTP schema that generates rich traces/DB telemetry, not to showcase clever
-- modeling.

CREATE TABLE products (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT        NOT NULL,
    description     TEXT        NOT NULL,
    category        TEXT        NOT NULL CHECK (category IN ('TELESCOPE', 'BINOCULARS', 'MAGNIFIER')),
    magnification   INTEGER,
    aperture_mm     INTEGER,
    price_cents     BIGINT      NOT NULL CHECK (price_cents >= 0),
    stock           INTEGER     NOT NULL CHECK (stock >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_category ON products (category);

-- FAULT_SLOW_SEARCH support: a plain btree on lower(description) with text_pattern_ops. This
-- index can only be used by an *anchored* prefix predicate (`lower(description) LIKE 'term%'`);
-- an unanchored `description ILIKE '%term%'` predicate has a leading wildcard, so Postgres's
-- planner can't use *any* btree index for it regardless of whether one exists here — it's
-- forced to a sequential scan. That's the whole point of this fault: the index is real and
-- present in both the ON and OFF states (see ProductRepository), only the query shape decides
-- whether it gets used.
CREATE INDEX idx_products_description_prefix ON products (lower(description) text_pattern_ops);

CREATE TABLE customers (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT        NOT NULL,
    email       TEXT        NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
    id           BIGSERIAL PRIMARY KEY,
    customer_id  BIGINT      NOT NULL REFERENCES customers (id),
    status       TEXT        NOT NULL,
    total_cents  BIGINT      NOT NULL CHECK (total_cents >= 0),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_customer_id ON orders (customer_id);
CREATE INDEX idx_orders_created_at ON orders (created_at);

CREATE TABLE order_items (
    id                BIGSERIAL PRIMARY KEY,
    order_id          BIGINT  NOT NULL REFERENCES orders (id),
    product_id        BIGINT  NOT NULL REFERENCES products (id),
    quantity          INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents  BIGINT  NOT NULL CHECK (unit_price_cents >= 0)
);

CREATE INDEX idx_order_items_order_id ON order_items (order_id);
CREATE INDEX idx_order_items_product_id ON order_items (product_id);

CREATE TABLE reviews (
    id           BIGSERIAL PRIMARY KEY,
    product_id   BIGINT      NOT NULL REFERENCES products (id),
    author_name  TEXT        NOT NULL,
    rating       INTEGER     NOT NULL CHECK (rating BETWEEN 1 AND 5),
    text         TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reviews_product_id ON reviews (product_id);
