-- Apply manually to the isolated Scalingo database only, after verified backup.
-- Do not execute against Render. API remains disabled until this migration is verified.
BEGIN;
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
ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS reminder_kind TEXT;
ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS automation_text TEXT;

COMMIT;
