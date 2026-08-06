-- Deterministic set-based generator for ~1,000 observation-gear products. "Deterministic" here
-- means hashtext(gs::text) rather than random() — re-running this migration against a fresh
-- database always produces byte-identical seed data, which matters for a demo/test stack where
-- people compare screenshots and query plans across environments.
--
-- hashtext() gives us a stable-but-scattered integer per row number (gs) that we fold into small
-- ranges with mod/abs to pick brands, model words, and numeric specs — the same trick used in
-- V3-V5 for customers, orders, and reviews.
WITH numbered AS (
    SELECT gs AS n FROM generate_series(1, 1000) AS gs
),
categorized AS (
    SELECT
        n,
        -- Roughly even three-way split across the domain's product categories.
        (ARRAY['TELESCOPE', 'BINOCULARS', 'MAGNIFIER'])[1 + (n % 3)] AS category,
        abs(hashtext('brand' || n))     AS brand_hash,
        abs(hashtext('model' || n))     AS model_hash,
        abs(hashtext('number' || n))    AS number_hash,
        abs(hashtext('spec1' || n))     AS spec1_hash,
        abs(hashtext('spec2' || n))     AS spec2_hash,
        abs(hashtext('price' || n))     AS price_hash,
        abs(hashtext('stock' || n))     AS stock_hash,
        abs(hashtext('age' || n))       AS age_hash
    FROM numbered
)
INSERT INTO products (name, description, category, magnification, aperture_mm, price_cents, stock, created_at)
SELECT
    brand || ' ' || model_word || ' ' || (100 + number_hash % 900) AS name,
    'A ' || lower(category) || ' from ' || brand || ''''
        || 's ' || model_word || ' line, offering '
        || magnification || 'x magnification'
        || CASE WHEN aperture_mm IS NOT NULL THEN ' and a ' || aperture_mm || 'mm aperture' ELSE '' END
        || ', well suited for ' || use_case || '.' AS description,
    category,
    magnification,
    aperture_mm,
    price_cents,
    stock,
    now() - (age_hash % 720 || ' days')::interval AS created_at
FROM (
    SELECT
        n,
        category,
        CASE category
            WHEN 'TELESCOPE'  THEN (ARRAY['Celestron', 'Orion', 'Meade', 'Sky-Watcher', 'Explore Scientific', 'Bresser'])[1 + brand_hash % 6]
            WHEN 'BINOCULARS' THEN (ARRAY['Vortex', 'Nikon', 'Zeiss', 'Leupold', 'Swarovski', 'Pentax'])[1 + brand_hash % 6]
            ELSE                   (ARRAY['Bausch+Lomb', 'Carson', 'MagniPros', 'Eschenbach', 'Coil', 'Loupe Co'])[1 + brand_hash % 6]
        END AS brand,
        (ARRAY['StarMaster', 'Voyager', 'Explorer', 'Odyssey', 'Pathfinder', 'Horizon', 'Summit', 'Ranger', 'Scout', 'Pioneer'])[1 + model_hash % 10] AS model_word,
        number_hash,
        CASE category
            WHEN 'TELESCOPE'  THEN 40 + spec1_hash % 260   -- 40x-300x
            WHEN 'BINOCULARS' THEN 6 + spec1_hash % 15      -- 6x-20x
            ELSE                   2 + spec1_hash % 9       -- 2x-10x loupes
        END AS magnification,
        CASE category
            WHEN 'TELESCOPE'  THEN 60 + spec2_hash % 141    -- 60mm-200mm
            WHEN 'BINOCULARS' THEN 20 + spec2_hash % 37     -- 20mm-56mm
            ELSE                   NULL                     -- magnifiers have no optical aperture
        END AS aperture_mm,
        CASE category
            WHEN 'TELESCOPE'  THEN 15000 + price_hash % 285000  -- $150-$3000
            WHEN 'BINOCULARS' THEN 4000 + price_hash % 96000    -- $40-$1000
            ELSE                   500 + price_hash % 14500     -- $5-$150
        END AS price_cents,
        -- ~5% deliberately at zero stock so /api/orders has real out-of-stock (409) cases to hit.
        CASE WHEN stock_hash % 20 = 0 THEN 0 ELSE 1 + stock_hash % 200 END AS stock,
        age_hash,
        CASE category
            WHEN 'TELESCOPE'  THEN (ARRAY['deep-sky observation', 'lunar and planetary viewing', 'astrophotography', 'wide-field star gazing'])[1 + spec2_hash % 4]
            WHEN 'BINOCULARS' THEN (ARRAY['birdwatching', 'hunting', 'marine use', 'stadium events'])[1 + spec2_hash % 4]
            ELSE                   (ARRAY['jewelry inspection', 'reading fine print', 'hobby electronics', 'stamp and coin collecting'])[1 + spec2_hash % 4]
        END AS use_case
    FROM categorized
) generated;
