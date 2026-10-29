-- Scalingo-only schema additions for Merchandising 1.2.
-- No INSERT/UPDATE/DELETE, no legacy migration, no production data.
CREATE TABLE IF NOT EXISTS merchandising_promotions(
 id SERIAL PRIMARY KEY,
 month TEXT NOT NULL CHECK(month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' AND month>='2026-11'),
 category TEXT NOT NULL CHECK(category IN ('TG','BS','IC','EV','SA','DS')),
 title TEXT NOT NULL,laboratory_id INTEGER REFERENCES laboratories(id) ON DELETE SET NULL,
 laboratory_name TEXT NOT NULL,eans JSONB NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(eans)='array'),
 zone_id INTEGER REFERENCES merchandising_zones(id),
 created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,creator_name TEXT NOT NULL,
 assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,assigned_name TEXT,assigned_at TIMESTAMPTZ,
 updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 revision INTEGER NOT NULL DEFAULT 1,origin_key TEXT UNIQUE
);
CREATE UNIQUE INDEX IF NOT EXISTS merchandising_promotion_slot ON merchandising_promotions(month,zone_id) WHERE zone_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchandising_promotion_month ON merchandising_promotions(month);
CREATE TABLE IF NOT EXISTS merchandising_promotion_events(
 id BIGSERIAL PRIMARY KEY,promotion_id INTEGER REFERENCES merchandising_promotions(id) ON DELETE SET NULL,
 action TEXT NOT NULL,from_zone INTEGER,to_zone INTEGER,
 operator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,operator_name TEXT NOT NULL,
 snapshot JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS merchandising_product_names(
 ean TEXT PRIMARY KEY CHECK(ean ~ '^[0-9]{13}$'),data JSONB NOT NULL,
 checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS merchandising_product_overrides(
 ean TEXT PRIMARY KEY CHECK(ean ~ '^[0-9]{13}$'),name TEXT NOT NULL CHECK(char_length(name)<=300),
 revision INTEGER NOT NULL DEFAULT 1,updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
 updated_name TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS merchandising_product_name_events(
 id BIGSERIAL PRIMARY KEY,ean TEXT NOT NULL,previous_name TEXT NOT NULL,name TEXT NOT NULL,
 operator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,operator_name TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS merchandising_promotion_documents(
 id BIGSERIAL PRIMARY KEY,promotion_id INTEGER NOT NULL REFERENCES merchandising_promotions(id) ON DELETE CASCADE,
 file_name TEXT NOT NULL,file_type TEXT NOT NULL,file_content BYTEA NOT NULL,
 created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,created_name TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS merchandising_promotion_documents_promotion ON merchandising_promotion_documents(promotion_id);
ALTER TABLE merchandising_promotions ADD COLUMN IF NOT EXISTS stocks JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE merchandising_promotions ADD COLUMN IF NOT EXISTS prices JSONB NOT NULL DEFAULT '{}'::jsonb;
