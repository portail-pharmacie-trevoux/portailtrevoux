# Portail+ — backup design (NOT DEPLOYED)

This branch is preparatory only. Production is unchanged. A private Scaleway S3 test bucket and a separate synthetic Render test service are configured. No production cron job or real-data backup is enabled.

## Architecture
- Dedicated Render **Docker cron job**, region **Frankfurt**, source repository branch `chore/backup-design-2026-10`, Dockerfile `backup/Dockerfile`, schedule `0 1 * * *` **UTC** (fixed 01:00 UTC, not fixed Paris local time).
- `pg_dump -Fc` using PostgreSQL 18 client, validation with `pg_restore --list`, then streaming AES-256-GCM encryption with a random 96-bit nonce.
- Upload to a **private** EU S3-compatible bucket (proposed Scaleway Paris) using HTTPS and verify remote size and SHA-256 metadata.
- Configure S3 lifecycle to expire objects after **35 days**. Set up bucket versioning/object-lock according to retention and incident-response requirements; ensure lifecycle also handles noncurrent versions.
- Independent daily failure alerts and missing-backup monitoring must be configured before production use. Successful cron logs alone are not sufficient.
- Monthly restore into a **separate, disposable PostgreSQL 18 database** with no public network access or application integrations. Check counts and document hashes against controlled reference checks, then delete test database securely.

## Secrets / configuration
Provide as Render cron job secret environment variables, **never in GitHub**:
- `BACKUP_DATABASE_URL`: a read-only, minimally privileged PostgreSQL connection URI. Use TLS (e.g. `sslmode=require`), private network when possible.
- `BACKUP_ENCRYPTION_KEY_B64`: base64 of a cryptographically random 32-byte key; keep a separately protected recovery copy. Losing it makes restores impossible.
- `S3_ENDPOINT_URL`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, optional `S3_PREFIX`.
- Restore only: `RESTORE_DATABASE_URL`, `ALLOW_ISOLATED_RESTORE=YES`, `RESTORE_TARGET_CONFIRMATION=DISPOSABLE_TEST_DATABASE`.

## Dry run and acceptance checks
1. Build the Docker image locally from the repository root: `docker build -f backup/Dockerfile -t portail-backup-test .`.
2. Create a **synthetic** PostgreSQL 18 database containing a sample table and binary document; do not use production data for the initial test.
3. Configure a test-only private bucket and test credentials; run `backup`.
4. Verify that the bucket object exists, is encrypted (no plaintext SQL or PDF), and has SHA-256 metadata.
5. Restore to a fresh, separate empty synthetic database using `restore --object-key <key>`. Check row counts and binary hashes.
6. Simulate wrong encryption key, tampered object, unreachable S3, and unavailable database; confirm nonzero exit and alert handling.
7. Verify lifecycle expiration, backup key recovery procedure, and retention/legal compliance before approving production.
8. Do not deploy, merge, or connect production until explicit approval.

## Important cautions
- The repository is currently public; never commit credentials or dump files.
- The backup includes HR documents and may include regulated personal/health data. EU location and encryption alone do not establish GDPR/HDS compliance. Validate contracts, certification scope and data classification first.
- A database backup does not include external Google Drive, Gmail, Calendar, Youtrust, or other provider data.
- No application writes, production exports, or schema changes are required.
- Restoration must be into a dedicated empty database; never point `RESTORE_DATABASE_URL` at production.

## Approved functional scope — 2026-10-24

The pharmacy owner confirmed: **include all Portail+ modules except the entire 'Outils d'aide aux commandes' module**. This is functional scope approval, **not** HDS/GDPR clearance or permission to export production data.

**Release blockers (must be verified before production):**
1. Inventory all database tables, columns, JSON payloads, file/blob stores, and cross-module references belonging to the orders module. The current code only excludes *rows* of five named tables; it does **not** exclude their schemas or prove the absence of order information elsewhere. Treat this as an incomplete exclusion, not a passed scope audit.
2. Define and test an explicit, reviewed exclusion manifest against the real schema **without copying any production rows**. Abort on unexpected order-related tables/columns or missing expected exclusions. Verify restored backup contains no excluded order information.
3. Inventory included modules' data categories, especially employee HR files, personal information, and possible health data; verify whether HDS certification is required for the actual processing and validate provider/service certification scope, contractual terms, access controls, encryption key custody, retention, and GDPR documentation.
4. Configure a dedicated daily scheduler and an **independent** daily freshness check with alerts; the current synthetic web-service startup test is not a reliable recurring schedule.
5. Confirm S3 lifecycle/object-lock/versioning behavior actually produces the agreed 35-day retention, including noncurrent versions and locked objects.
6. Validate monthly isolated restoration and key recovery, and document an incident/alert response owner. No restore into production.
7. Only after sign-off, request separate explicit authorization for production deployment and real-data backup. Keep `BACKUP_REAL_DATA_APPROVED` unset until then.

**Agreed target cadence:** nightly encrypted backup; daily independent freshness monitoring and Gmail anomaly alerts; 35-day retention; monthly isolated restoration. All tests to date used synthetic data only.
