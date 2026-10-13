CREATE TABLE IF NOT EXISTS users (
 id SERIAL PRIMARY KEY, name TEXT NOT NULL, job TEXT NOT NULL DEFAULT '',
 email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'employee' CHECK(role IN ('admin','employee')),
 rights JSONB NOT NULL DEFAULT '[]', must_change BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Staff directory entries can exist before a personal login is configured.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS directory_key TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS edit_rights JSONB NOT NULL DEFAULT '[]';
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions_configured BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE users SET first_name=split_part(name,' ',1),last_name=trim(substr(name,length(split_part(name,' ',1))+1)) WHERE first_name='';
CREATE TABLE IF NOT EXISTS sessions (
 id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 csrf TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, oauth_state TEXT, oauth_expires TIMESTAMPTZ, oauth_verifier TEXT
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS calendar_cache (singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton), events JSONB NOT NULL, synced_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until_at TIMESTAMPTZ NOT NULL);

CREATE TABLE IF NOT EXISTS music_tracks (
 id SERIAL PRIMARY KEY,
 artist TEXT NOT NULL CHECK(length(artist) BETWEEN 1 AND 200),
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
 track_key TEXT NOT NULL UNIQUE,
 contributor TEXT NOT NULL DEFAULT '',
 added_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
 source TEXT NOT NULL DEFAULT 'collaborateur',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE TABLE IF NOT EXISTS publications (
 id BIGSERIAL PRIMARY KEY, universe TEXT NOT NULL, title TEXT NOT NULL,
 source_key TEXT UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS publications_universe_id ON publications(universe,id DESC);
CREATE TABLE IF NOT EXISTS publication_reads (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 universe TEXT NOT NULL, last_id BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(user_id,universe)
);
CREATE TABLE IF NOT EXISTS schedule_weeks (
 week DATE PRIMARY KEY CHECK(EXTRACT(ISODOW FROM week)=1),
 draft JSONB NOT NULL DEFAULT '{}', published JSONB,
 revision INTEGER NOT NULL DEFAULT 0, published_revision INTEGER,
 published_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS employee_details (
 user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS useful_contacts (
 id SERIAL PRIMARY KEY, scope TEXT NOT NULL, name TEXT NOT NULL,
 person TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
 url TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', active BOOLEAN NOT NULL DEFAULT TRUE,
 source_key TEXT UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS procedure_documents (
 id SERIAL PRIMARY KEY, category TEXT NOT NULL, title TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '', keywords TEXT NOT NULL DEFAULT '', url TEXT NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE procedure_documents ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE procedure_documents ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE procedure_documents ADD COLUMN IF NOT EXISTS file_content BYTEA;


CREATE TABLE IF NOT EXISTS team_messages (
 id SERIAL PRIMARY KEY,
 sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
 sender_name TEXT NOT NULL,
 text TEXT NOT NULL CHECK(char_length(text) BETWEEN 1 AND 500),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS team_message_recipients (
 message_id INTEGER NOT NULL REFERENCES team_messages(id) ON DELETE CASCADE,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 seen BOOLEAN NOT NULL DEFAULT FALSE,
 archived BOOLEAN NOT NULL DEFAULT FALSE,
 PRIMARY KEY(message_id,user_id)
);
CREATE INDEX IF NOT EXISTS team_messages_created_at ON team_messages(created_at);
CREATE INDEX IF NOT EXISTS team_message_recipients_user ON team_message_recipients(user_id,message_id DESC);

-- Enable the new personal messaging space once for existing active staff.
-- Subsequent administrator changes remain effective on future restarts.
WITH migration AS (
 INSERT INTO settings(key,value) VALUES('team_news_access_v1','enabled')
 ON CONFLICT(key) DO NOTHING RETURNING key
)
UPDATE users SET rights=rights||'["Actualités"]'::jsonb
WHERE active=TRUE AND NOT (rights ? 'Actualités') AND EXISTS(SELECT 1 FROM migration);

ALTER TABLE users ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS employee_invitations (
 token_hash TEXT PRIMARY KEY,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 email TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 sent_at TIMESTAMPTZ,
 used_at TIMESTAMPTZ,
 requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS employee_invitations_user_id ON employee_invitations(user_id);

CREATE TABLE IF NOT EXISTS hr_documents (
 id SERIAL PRIMARY KEY, title TEXT NOT NULL CHECK(char_length(title) BETWEEN 1 AND 200),
 file_name TEXT NOT NULL, file_type TEXT NOT NULL, file_content BYTEA NOT NULL,
 file_hash TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
 added_by INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 removed_by INTEGER REFERENCES users(id) ON DELETE SET NULL, removed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS hr_signature_requests (
 id UUID PRIMARY KEY, document_id INTEGER NOT NULL REFERENCES hr_documents(id),
 envelope_id TEXT, account_id TEXT NOT NULL, base_uri TEXT NOT NULL, environment TEXT NOT NULL CHECK(environment IN ('production','demo')),
 recipients JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'creating', error TEXT NOT NULL DEFAULT '',
 created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_checked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS hr_signature_requests_document ON hr_signature_requests(document_id,created_at DESC);
WITH migration AS (
 INSERT INTO settings(key,value) VALUES('hr_documents_access_v1','enabled')
 ON CONFLICT(key) DO NOTHING RETURNING key
)
UPDATE users SET rights=rights||'["Ressources humaines"]'::jsonb
WHERE active=TRUE AND NOT (rights ? 'Ressources humaines') AND EXISTS(SELECT 1 FROM migration);
-- Documents RH: a consultation right never grants employee management access.
UPDATE users SET edit_rights=edit_rights-'Ressources humaines' WHERE edit_rights ? 'Ressources humaines';

CREATE TABLE IF NOT EXISTS laboratories (
 id SERIAL PRIMARY KEY, name TEXT NOT NULL, order_mode TEXT NOT NULL CHECK(order_mode IN ('pharmacie','groupement')),
 responsible_id INTEGER REFERENCES users(id) ON DELETE SET NULL, details JSONB NOT NULL DEFAULT '{}',
 revision INTEGER NOT NULL DEFAULT 1, updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM settings WHERE key='laboratories_team_access_v1') THEN
  UPDATE users SET rights=rights || '["Laboratoires"]'::jsonb WHERE active=TRUE AND NOT rights ? 'Laboratoires';
  INSERT INTO settings(key,value) VALUES('laboratories_team_access_v1','enabled');
 END IF;
END $$;

ALTER TABLE laboratories ADD COLUMN IF NOT EXISTS logo_content BYTEA;
ALTER TABLE laboratories ADD COLUMN IF NOT EXISTS logo_type TEXT;
ALTER TABLE laboratories ADD COLUMN IF NOT EXISTS logo_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS laboratory_documents(
 id SERIAL PRIMARY KEY,laboratory_id INTEGER NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
 title TEXT NOT NULL,file_name TEXT NOT NULL,file_type TEXT NOT NULL,file_content BYTEA NOT NULL,
 added_by INTEGER REFERENCES users(id) ON DELETE SET NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS laboratory_documents_lab_idx ON laboratory_documents(laboratory_id);

CREATE TABLE IF NOT EXISTS calendar_reminders (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 calendar_id TEXT NOT NULL, event_id TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,calendar_id,event_id)
);

CREATE TABLE IF NOT EXISTS order_planning (
 id SERIAL PRIMARY KEY, content TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,
 updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE team_message_recipients ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ;
ALTER TABLE hr_documents ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'common' CHECK(scope IN ('common','personal'));
ALTER TABLE hr_documents ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS hr_documents_owner_idx ON hr_documents(owner_id) WHERE scope='personal';

CREATE TABLE IF NOT EXISTS order_mfa (
 user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 secret TEXT, pending_secret TEXT, pending_session TEXT, pending_expires TIMESTAMPTZ,
 last_step BIGINT NOT NULL DEFAULT -1, recovery_hashes JSONB NOT NULL DEFAULT '[]',
 generation INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS order_mfa_at TIMESTAMPTZ;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS order_mfa_generation INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS order_mfa_audit (
 id BIGSERIAL PRIMARY KEY,
 user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
 actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
 action TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE order_mfa ADD COLUMN IF NOT EXISTS paper_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE order_mfa ADD COLUMN IF NOT EXISTS paper_hashes JSONB NOT NULL DEFAULT '[]';
ALTER TABLE order_mfa ADD COLUMN IF NOT EXISTS paper_reference TEXT;

CREATE TABLE IF NOT EXISTS schedule_posts (
 id SERIAL PRIMARY KEY,name TEXT NOT NULL,color TEXT NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,revision INTEGER NOT NULL DEFAULT 1,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS leave_requests (
 id SERIAL PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 leave_type TEXT NOT NULL,start_date DATE NOT NULL,end_date DATE NOT NULL,
 start_part TEXT NOT NULL,end_part TEXT NOT NULL,comment TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','refused','cancelled')),
 revision INTEGER NOT NULL DEFAULT 1,review_note TEXT NOT NULL DEFAULT '',
 reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),reviewed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS leave_requests_pending_unique ON leave_requests(user_id,leave_type,start_date,end_date,start_part,end_part) WHERE status='pending';

CREATE TABLE IF NOT EXISTS schedule_templates (
 id SERIAL PRIMARY KEY,name TEXT NOT NULL,content JSONB NOT NULL DEFAULT '{}',
 revision INTEGER NOT NULL DEFAULT 1,updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS merchandising_zones(id INTEGER PRIMARY KEY CHECK(id BETWEEN 1 AND 10),name TEXT NOT NULL,comment TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1);

ALTER TABLE merchandising_zones ADD COLUMN IF NOT EXISTS months JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE merchandising_zones DROP CONSTRAINT IF EXISTS merchandising_zones_id_check;
ALTER TABLE merchandising_zones ADD CONSTRAINT merchandising_zones_id_check CHECK(id BETWEEN 1 AND 30);

ALTER TABLE merchandising_zones DROP CONSTRAINT IF EXISTS merchandising_zones_id_check;
ALTER TABLE merchandising_zones ADD CONSTRAINT merchandising_zones_id_check CHECK(id BETWEEN 1 AND 30);

ALTER TABLE merchandising_zones ADD COLUMN IF NOT EXISTS number INTEGER CHECK(number BETWEEN 1 AND 999);

CREATE TABLE IF NOT EXISTS team_challenges(
 id SERIAL PRIMARY KEY,month TEXT NOT NULL CHECK(month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),title TEXT NOT NULL,
 laboratory_id INTEGER NOT NULL REFERENCES laboratories(id),modalities TEXT NOT NULL DEFAULT '',metric TEXT NOT NULL CHECK(metric IN ('units','revenue')),
 target NUMERIC NOT NULL CHECK(target>0),participants JSONB NOT NULL,results JSONB,report_id INTEGER,revision INTEGER NOT NULL DEFAULT 1,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
ALTER TABLE team_challenges ADD COLUMN IF NOT EXISTS gain_per_collaborator NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(gain_per_collaborator>=0 AND gain_per_collaborator<=1000000);
ALTER TABLE team_challenges ADD COLUMN IF NOT EXISTS gain_per_unit NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(gain_per_unit>=0 AND gain_per_unit<=1000000);
CREATE INDEX IF NOT EXISTS team_challenges_month_idx ON team_challenges(month);
CREATE TABLE IF NOT EXISTS challenge_reports(
 id SERIAL PRIMARY KEY,challenge_id INTEGER NOT NULL REFERENCES team_challenges(id) ON DELETE CASCADE,file_name TEXT NOT NULL,file_content BYTEA NOT NULL,
 analysis JSONB NOT NULL,challenge_revision INTEGER NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),added_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
 confirmed_at TIMESTAMPTZ,confirmed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,sent_at TIMESTAMPTZ,sent_to TEXT,message_id TEXT,
 send_status TEXT NOT NULL DEFAULT 'none' CHECK(send_status IN ('none','sending','sent','uncertain'))
);
CREATE INDEX IF NOT EXISTS challenge_reports_challenge_idx ON challenge_reports(challenge_id,id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS schedule_position INTEGER;

ALTER TABLE schedule_weeks ADD COLUMN IF NOT EXISTS locked_days JSONB NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS training_documents(
 id SERIAL PRIMARY KEY,category TEXT NOT NULL CHECK(category IN ('reference','training')),title TEXT NOT NULL,
 file_name TEXT NOT NULL,file_type TEXT NOT NULL,file_content BYTEA NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS attachment_name TEXT;
ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS attachment_type TEXT;
ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS attachment_content BYTEA;

ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS can_archive BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE merchandising_zones ADD COLUMN IF NOT EXISTS month_labs JSONB NOT NULL DEFAULT '{}';
ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS planning_week DATE;

ALTER TABLE procedure_documents ADD COLUMN IF NOT EXISTS builtin_key TEXT UNIQUE;

CREATE TABLE IF NOT EXISTS merchandising_impact(
 id SERIAL PRIMARY KEY,zone_id INTEGER NOT NULL REFERENCES merchandising_zones(id),month TEXT NOT NULL,
 zone_name TEXT NOT NULL,offer TEXT NOT NULL,laboratory TEXT NOT NULL DEFAULT '',data JSONB NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
 UNIQUE(zone_id,month)
);

CREATE TABLE IF NOT EXISTS quality_services(
 id SERIAL PRIMARY KEY,collaborator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
 collaborator_name TEXT NOT NULL,service TEXT NOT NULL,missions TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS quality_service_evaluations(
 service_id INTEGER NOT NULL REFERENCES quality_services(id) ON DELETE CASCADE,year INTEGER NOT NULL,
 evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),evaluated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
 PRIMARY KEY(service_id,year)
);

ALTER TABLE quality_services ADD COLUMN IF NOT EXISTS icon_content BYTEA;
ALTER TABLE quality_services ADD COLUMN IF NOT EXISTS icon_type TEXT;
ALTER TABLE quality_services ADD COLUMN IF NOT EXISTS icon_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS quality_errors(
 id SERIAL PRIMARY KEY,identified_date DATE NOT NULL,error_type TEXT NOT NULL,details TEXT NOT NULL,
 responsible_id INTEGER REFERENCES users(id) ON DELETE SET NULL,responsible_name TEXT NOT NULL,error_date DATE NOT NULL,
 actions TEXT NOT NULL DEFAULT '',severity INTEGER NOT NULL CHECK(severity BETWEEN 1 AND 4),
 created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,operator_name TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),revision INTEGER NOT NULL DEFAULT 1,
 patient_notified_at TIMESTAMPTZ,patient_notified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,patient_notified_name TEXT,
 doctor_notified_at TIMESTAMPTZ,doctor_notified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,doctor_notified_name TEXT
);
CREATE INDEX IF NOT EXISTS quality_errors_date_idx ON quality_errors(identified_date DESC,created_at DESC,id DESC);

CREATE TABLE IF NOT EXISTS temperature_sensors(id TEXT PRIMARY KEY,name TEXT NOT NULL,low_threshold DOUBLE PRECISION NOT NULL DEFAULT 2,high_threshold DOUBLE PRECISION NOT NULL DEFAULT 8,revision INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS temperature_readings(sensor_id TEXT NOT NULL REFERENCES temperature_sensors(id),recorded_at TIMESTAMPTZ NOT NULL,value DOUBLE PRECISION NOT NULL,PRIMARY KEY(sensor_id,recorded_at));
CREATE TABLE IF NOT EXISTS temperature_comments(id BIGSERIAL PRIMARY KEY,sensor_id TEXT NOT NULL REFERENCES temperature_sensors(id),happened_at TIMESTAMPTZ NOT NULL,text TEXT NOT NULL,operator_name TEXT NOT NULL,created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS temperature_comments_sensor_idx ON temperature_comments(sensor_id,happened_at);
CREATE TABLE IF NOT EXISTS temperature_imports(id BIGSERIAL PRIMARY KEY,file_name TEXT NOT NULL,operator_name TEXT NOT NULL,imported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,added INTEGER NOT NULL,ignored INTEGER NOT NULL,first_reading TIMESTAMPTZ NOT NULL,last_reading TIMESTAMPTZ NOT NULL,imported_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS temperature_reminders(month TEXT NOT NULL,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(month,user_id));
INSERT INTO settings(key,value) VALUES('temperature_reminder_start',to_char((now() AT TIME ZONE 'Europe/Paris')+interval '1 month','YYYY-MM')) ON CONFLICT DO NOTHING;

ALTER TABLE merchandising_zones ADD COLUMN IF NOT EXISTS month_approvals JSONB NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS merchandising_validation_events(
 id BIGSERIAL PRIMARY KEY,zone_id INTEGER NOT NULL REFERENCES merchandising_zones(id),month TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('validated','invalidated')),operator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
 operator_name TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),offer TEXT NOT NULL,laboratory TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS merchandising_validation_events_zone_month ON merchandising_validation_events(zone_id,month,id DESC);

CREATE TABLE IF NOT EXISTS quality_tp_months(month TEXT PRIMARY KEY,invoices INTEGER NOT NULL CHECK(invoices>=0),rejections INTEGER NOT NULL CHECK(rejections>=0 AND rejections<=invoices),amount_cents BIGINT NOT NULL CHECK(amount_cents>=0),revision INTEGER NOT NULL DEFAULT 1,operator_name TEXT NOT NULL,updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS quality_monthly_reminders(service TEXT NOT NULL,month TEXT NOT NULL,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(service,month,user_id));
INSERT INTO settings(key,value) VALUES('tierspayant_reminder_start',to_char((now() AT TIME ZONE 'Europe/Paris')+interval '1 month','YYYY-MM')),('merchandising_reminder_start',to_char(now() AT TIME ZONE 'Europe/Paris','YYYY-MM')) ON CONFLICT DO NOTHING;
