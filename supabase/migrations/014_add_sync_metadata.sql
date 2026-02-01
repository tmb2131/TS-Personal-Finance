-- Single row storing last successful sync time (manual or cron).
-- Used by the header "Last Refresh" so it reflects cron runs as well as manual refresh.
CREATE TABLE IF NOT EXISTS sync_metadata (
  id int primary key default 1 check (id = 1),
  last_sync_at timestamptz not null default now()
);

-- Ensure exactly one row exists
INSERT INTO sync_metadata (id, last_sync_at)
VALUES (1, now())
ON CONFLICT (id) DO NOTHING;
