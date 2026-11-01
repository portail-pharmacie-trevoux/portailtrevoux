ALTER TABLE temperature_comments ADD COLUMN IF NOT EXISTS validation TEXT CHECK (validation IN ('V','X'));
ALTER TABLE temperature_comments ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE temperature_comments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE temperature_comments ADD COLUMN IF NOT EXISTS history JSONB NOT NULL DEFAULT '[]';
