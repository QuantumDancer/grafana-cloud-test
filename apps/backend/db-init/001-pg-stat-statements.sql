-- Runs once against a fresh data directory (official Postgres image convention: anything in
-- /docker-entrypoint-initdb.d/ executes on first startup only). shared_preload_libraries is
-- already set via compose.yaml's `command:`, so the extension only needs to be created here.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
