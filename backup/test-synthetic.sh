#!/usr/bin/env bash
# Isolated integration test: synthetic data only, no production connection or cloud credentials.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { echo "Docker is required" >&2; exit 1; }
name="portail-backup-synthetic-$$"
tmp="$(mktemp -d)"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap cleanup EXIT
docker run -d --name "$name" -e POSTGRES_PASSWORD=synthetic_only -e POSTGRES_DB=source -p 127.0.0.1::5432 postgres:18-bookworm >/dev/null
for i in $(seq 1 60); do
  if docker exec "$name" pg_isready -U postgres -d source >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$name" pg_isready -U postgres -d source >/dev/null
docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U postgres -d source <<'SQL'
CREATE TABLE fake_staff(id integer PRIMARY KEY, name text NOT NULL);
INSERT INTO fake_staff VALUES (1,'Alice Example'),(2,'Bob Example');
CREATE TABLE fake_documents(id integer PRIMARY KEY, contents bytea NOT NULL);
INSERT INTO fake_documents VALUES (1, decode('255044462d312e340a66616b652d646f63756d656e74','hex'));
SQL
docker exec "$name" pg_dump -U postgres -Fc -d source > "$tmp/source.dump"
docker exec -i "$name" pg_restore --list < "$tmp/source.dump" >/dev/null
# Exercise exact encrypt_file/decrypt_file implementation from backup.py, without S3.
python3 - "$tmp" <<'PY'
import pathlib, secrets, sys
from backup.backup import encrypt_file, decrypt_file, digest_file
p=pathlib.Path(sys.argv[1]); key=secrets.token_bytes(32)
encrypt_file(p/'source.dump',p/'source.enc',key)
decrypt_file(p/'source.enc',p/'restored.dump',key)
assert digest_file(p/'source.dump') == digest_file(p/'restored.dump')
try:
    decrypt_file(p/'source.enc',p/'bad.dump',secrets.token_bytes(32))
except Exception:
    pass
else:
    raise AssertionError('Wrong key was accepted')
tampered=bytearray((p/'source.enc').read_bytes()); tampered[-20] ^= 1
(p/'tampered.enc').write_bytes(tampered)
try:
    decrypt_file(p/'tampered.enc',p/'tampered.dump',key)
except Exception:
    pass
else:
    raise AssertionError('Tampering was accepted')
print('AES-256-GCM: roundtrip and tamper tests passed')
PY
docker exec "$name" createdb -U postgres restored
docker exec -i "$name" pg_restore -U postgres --no-owner --no-acl --exit-on-error -d restored < "$tmp/restored.dump"
source_sum="$(docker exec "$name" psql -At -U postgres -d source -c "SELECT md5(string_agg(id::text||':'||name,',' ORDER BY id)) FROM fake_staff")"
restore_sum="$(docker exec "$name" psql -At -U postgres -d restored -c "SELECT md5(string_agg(id::text||':'||name,',' ORDER BY id)) FROM fake_staff")"
[[ "$source_sum" == "$restore_sum" ]]
source_doc="$(docker exec "$name" psql -At -U postgres -d source -c "SELECT encode(contents,'hex') FROM fake_documents WHERE id=1")"
restore_doc="$(docker exec "$name" psql -At -U postgres -d restored -c "SELECT encode(contents,'hex') FROM fake_documents WHERE id=1")"
[[ "$source_doc" == "$restore_doc" ]]
echo "PASS: PostgreSQL 18 synthetic dump -> AES-GCM -> restore; rows and binary documents identical."
