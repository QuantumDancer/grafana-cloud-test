-- ~10,000 deterministic customers. Same hashtext-folding technique as V2.
WITH numbered AS (
    SELECT gs AS n FROM generate_series(1, 10000) AS gs
)
INSERT INTO customers (name, email, created_at)
SELECT
    first_name || ' ' || last_name AS name,
    lower(first_name) || '.' || lower(last_name) || n || '@example.com' AS email,
    now() - (age_hash % 1095 || ' days')::interval AS created_at
FROM (
    SELECT
        n,
        (ARRAY['Alex', 'Jordan', 'Sam', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Avery', 'Quinn',
               'Drew', 'Reese', 'Rowan', 'Sage', 'Elliot', 'Blair', 'Cameron', 'Dana', 'Emerson', 'Finley'])
            [1 + abs(hashtext('first' || n)) % 20] AS first_name,
        (ARRAY['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
               'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'])
            [1 + abs(hashtext('last' || n)) % 20] AS last_name,
        abs(hashtext('custage' || n)) AS age_hash
    FROM numbered
) generated;
