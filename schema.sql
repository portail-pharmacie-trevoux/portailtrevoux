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
