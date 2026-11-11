-- PREPARED ONLY. Never executed at application startup. Explicit approval required on real databases.
-- Additive DDL only: no roster, jobs, business imports, updates or historical cleanup.
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(783416);
CREATE TABLE IF NOT EXISTS message_automations(
 id TEXT PRIMARY KEY,kind TEXT NOT NULL,name TEXT NOT NULL,enabled BOOLEAN NOT NULL DEFAULT TRUE,config JSONB NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,activation_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),deleted_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS message_automation_runs(
 id BIGSERIAL PRIMARY KEY,automation_id TEXT NOT NULL REFERENCES message_automations(id),occurrence DATE NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('sent','skipped','failed')),recipient_count INTEGER NOT NULL DEFAULT 0,message_count INTEGER NOT NULL DEFAULT 0,
 error TEXT,completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(automation_id,occurrence)
);
CREATE TABLE IF NOT EXISTS message_automation_changes(
 id BIGSERIAL PRIMARY KEY,automation_id TEXT NOT NULL REFERENCES message_automations(id),actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
 action TEXT NOT NULL,before_value JSONB,after_value JSONB,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS training_attestation_imports(
 id UUID PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,added_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 file_name TEXT NOT NULL,file_type TEXT NOT NULL,file_content BYTEA NOT NULL,file_hash TEXT NOT NULL,proposal JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '1 day'
);
CREATE INDEX IF NOT EXISTS training_attestation_imports_expiry ON training_attestation_imports(expires_at);
CREATE TABLE IF NOT EXISTS training_attestation_reads(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,requested_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS training_attestation_reads_user_time ON training_attestation_reads(user_id,requested_at);
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
ALTER TABLE merchandising_promotions ADD COLUMN IF NOT EXISTS stocks JSONB NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(stocks)='object');
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
ALTER TABLE merchandising_promotions ADD COLUMN IF NOT EXISTS prices JSONB NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(prices)='object');
CREATE TABLE IF NOT EXISTS merchandising_promotion_documents(
 id BIGSERIAL PRIMARY KEY,promotion_id INTEGER NOT NULL REFERENCES merchandising_promotions(id) ON DELETE CASCADE,
 file_name TEXT NOT NULL,file_type TEXT NOT NULL,file_content BYTEA NOT NULL,
 created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,created_name TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS merchandising_promotion_documents_promotion ON merchandising_promotion_documents(promotion_id);
ALTER TABLE calendar_tasks ADD COLUMN IF NOT EXISTS source_message_id INTEGER REFERENCES team_messages(id) ON DELETE SET NULL;
ALTER TABLE hr_documents ADD COLUMN IF NOT EXISTS training_title TEXT;
ALTER TABLE hr_documents ADD COLUMN IF NOT EXISTS training_date DATE;
ALTER TABLE hr_documents ADD COLUMN IF NOT EXISTS training_kind TEXT CHECK(training_kind IN ('Classique','DPC'));
ALTER TABLE hr_documents ADD COLUMN IF NOT EXISTS training_verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE hr_documents ADD COLUMN IF NOT EXISTS training_verified_at TIMESTAMPTZ;
ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS reminder_kind TEXT;
ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS automation_text TEXT;
ALTER TABLE temperature_comments ADD COLUMN IF NOT EXISTS assessment TEXT;
ALTER TABLE training_documents ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;
ALTER TABLE training_documents ADD COLUMN IF NOT EXISTS removed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS calendar_tasks_source_message ON calendar_tasks(user_id,source_message_id) WHERE source_message_id IS NOT NULL;
ALTER TABLE temperature_comments ADD COLUMN IF NOT EXISTS validation TEXT CHECK (validation IN ('V','X'));
ALTER TABLE temperature_comments ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE temperature_comments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE temperature_comments ADD COLUMN IF NOT EXISTS history JSONB NOT NULL DEFAULT '[]';
ALTER TABLE quality_errors ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ;
ALTER TABLE quality_errors ADD COLUMN IF NOT EXISTS corrected_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE quality_errors ADD COLUMN IF NOT EXISTS corrected_name TEXT;
ALTER TABLE quality_errors ADD COLUMN IF NOT EXISTS error_corrected BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE quality_errors ADD COLUMN IF NOT EXISTS correction_note TEXT NOT NULL DEFAULT '' CHECK(char_length(correction_note)<=100);
ALTER TABLE quality_errors ADD COLUMN IF NOT EXISTS correction_note_history JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE TABLE IF NOT EXISTS scalingo_employee_deletion_audit(id BIGSERIAL PRIMARY KEY,deleted_user_id INTEGER NOT NULL,deleted_by INTEGER NOT NULL,deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),action TEXT NOT NULL CHECK(action='employee_deleted'),checks_version INTEGER NOT NULL DEFAULT 1);
COMMIT;
