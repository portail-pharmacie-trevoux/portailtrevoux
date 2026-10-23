#!/usr/bin/env bash
set -euo pipefail
export PATH="/usr/lib/postgresql/18/bin:$PATH"
dir="$(mktemp -d)"
trap 'runuser -u postgres -- pg_ctl -D "$dir/pg" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$dir"' EXIT
chmod 755 "$dir"
mkdir "$dir/pg"; chown -R postgres:postgres "$dir/pg"
runuser -u postgres -- initdb -D "$dir/pg" --auth-local=trust --no-instructions >/dev/null
runuser -u postgres -- pg_ctl -D "$dir/pg" -o "-c listen_addresses='' -c unix_socket_directories=/tmp" -w start >/dev/null
export PGHOST=/tmp PGUSER=postgres
createdb source
psql -v ON_ERROR_STOP=1 -d source <<'SQL'
CREATE TABLE fake_staff(id integer PRIMARY KEY, name text NOT NULL);
INSERT INTO fake_staff VALUES (1,'Alice Example'),(2,'Bob Example');
CREATE TABLE order_planning(id integer PRIMARY KEY, content text);
INSERT INTO order_planning VALUES (1,'TEST_ONLY');
CREATE TABLE order_mfa(user_id integer, secret text);
INSERT INTO order_mfa VALUES (1,'TEST_ONLY');
CREATE TABLE order_mfa_audit(id integer, details text);
INSERT INTO order_mfa_audit VALUES (1,'TEST_ONLY');
CREATE TABLE order_reminder_emails(period text, email text);
INSERT INTO order_reminder_emails VALUES ('test','TEST_ONLY');
CREATE TABLE order_weekly_reminders(period text, heading text);
INSERT INTO order_weekly_reminders VALUES ('test','TEST_ONLY');
CREATE TABLE fake_documents(id integer PRIMARY KEY, contents bytea NOT NULL);
INSERT INTO fake_documents VALUES (1, decode('255044462d312e340a66616b652d646f63756d656e74','hex'));
SQL
pg_dump -Fc -d source \
  --exclude-table-data=public.order_planning \
  --exclude-table-data=public.order_mfa \
  --exclude-table-data=public.order_mfa_audit \
  --exclude-table-data=public.order_reminder_emails \
  --exclude-table-data=public.order_weekly_reminders > "$dir/source.dump"
pg_restore --list "$dir/source.dump" >/dev/null
python - "$dir" <<'PY'
import pathlib, secrets, sys
sys.path.insert(0,'/opt/backup')
from backup import encrypt_file, decrypt_file, digest_file
p=pathlib.Path(sys.argv[1]); key=secrets.token_bytes(32)
encrypt_file(p/'source.dump',p/'source.enc',key)
decrypt_file(p/'source.enc',p/'restored.dump',key)
assert digest_file(p/'source.dump') == digest_file(p/'restored.dump')
try:
    decrypt_file(p/'source.enc',p/'bad.dump',secrets.token_bytes(32))
except Exception: pass
else: raise AssertionError('wrong key accepted')
tampered=bytearray((p/'source.enc').read_bytes()); tampered[-20]^=1
(p/'tampered.enc').write_bytes(tampered)
try:
    decrypt_file(p/'tampered.enc',p/'tampered.dump',key)
except Exception: pass
else: raise AssertionError('tampering accepted')
PY
createdb restored
pg_restore --exit-on-error --no-owner --no-acl -d restored "$dir/restored.dump"
for db in source restored; do
  psql -At -d "$db" -c "SELECT md5(string_agg(id::text||':'||name,',' ORDER BY id)) FROM fake_staff" > "$dir/$db.staff"
  psql -At -d "$db" -c "SELECT encode(contents,'hex') FROM fake_documents WHERE id=1" > "$dir/$db.doc"
done
cmp "$dir/source.staff" "$dir/restored.staff"
cmp "$dir/source.doc" "$dir/restored.doc"
for table in order_planning order_mfa order_mfa_audit order_reminder_emails order_weekly_reminders; do
  test "$(psql -At -d restored -c "SELECT count(*) FROM $table")" = "0"
done
echo 'PASS: selective backup excludes all order records'
echo 'PASS: synthetic PostgreSQL dump, AES-GCM, and restore'
python /opt/backup/test-scaleway-synthetic.py
echo 'PASS: synthetic encrypted Scaleway round-trip'
python /opt/backup/check-backup-freshness.py
python /opt/backup/send-test-alert.py
python - <<'PY'
import datetime as dt
import importlib.util
spec=importlib.util.spec_from_file_location('monitor','/opt/backup/check-backup-freshness.py')
module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
now=dt.datetime.now(dt.timezone.utc)
assert module.evaluate([],now,26)['status']=='missing'
assert module.evaluate([{'LastModified':now-dt.timedelta(hours=30)}],now,26)['status']=='stale'
assert module.evaluate([{'LastModified':now-dt.timedelta(hours=1)}],now,26)['status']=='ok'
print('PASS: missing, stale and fresh backup detection')
PY
python - <<'PY'
from http.server import BaseHTTPRequestHandler,HTTPServer
import os
class H(BaseHTTPRequestHandler):
 def do_GET(self):
  self.send_response(200); self.end_headers(); self.wfile.write(b'PASS: synthetic backup restore test')
HTTPServer(('0.0.0.0',int(os.environ.get('PORT','10000'))),H).serve_forever()
PY
