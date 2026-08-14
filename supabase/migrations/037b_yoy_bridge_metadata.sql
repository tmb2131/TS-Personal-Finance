-- YoY forecast bridge metadata for UI subtitles (as-of date, forecast year, etc.)
ALTER TABLE sync_metadata
  ADD COLUMN IF NOT EXISTS yoy_bridge_meta JSONB;
