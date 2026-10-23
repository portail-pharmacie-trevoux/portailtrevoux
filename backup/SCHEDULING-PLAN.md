# Portail+ — low-cost scheduling plan (PREPARATION ONLY)

Target: daily backup at 01:00 UTC, independent freshness check at 08:00 UTC, monthly isolated restore; 35-day retention and Gmail failure alerts. These times are UTC and shift relative to France local time at DST transitions.

## Constraints
- Render free synthetic web service startup is NOT a cron scheduler. Do not claim recurring protection from its successful tests.
- GitHub Actions scheduled workflows can be delayed or skipped; do not rely on a single schedule without independent verification.
- GitHub Actions runners cannot necessarily reach a Render database private hostname. A public database URL may expose credentials or create new attack surfaces; do not configure without approved security review.
- GitHub repository is public: never put database URL, encryption key, Gmail refresh token, or S3 credentials in tracked files or build logs.
- A Render Cron Job may be paid. Obtain a current quote before enabling it.
- The test service may sleep; it cannot reliably run an internal timer.
- 35-day retention must be verified against Scaleway S3 Object Lock Governance, versioning, lifecycle expiration and noncurrent versions; setting a lifecycle rule alone does not prove effective deletion at day 35.
- All scheduled tasks remain DISABLED pending verified order-data exclusions and applicable regulatory/security approvals.

## Candidate implementation
1. A dedicated Render Cron Job with least-privilege DB access, ephemeral workspace and existing AES-256-GCM backup script. Daily 01:00 UTC. No restore credentials in this job.
2. A separate scheduled monitor that lists only the expected backup prefix, checks timestamp and checksum metadata, and alerts by Gmail API on missing/stale/error states. Daily 08:00 UTC. It must not depend on backup-job success.
3. Monthly isolated restore test using a disposable database and recovery key stored separately.
4. Alert deduplication, audit logs without patient content, and an owner for failed backups.

## Blocking findings
- Five dedicated order tables can be excluded with pg_dump --exclude-table.
- Shared tables sessions (two order MFA fields) and team_messages (order_digest) need a column-level sanitization strategy. Dropping both shared tables is not acceptable as a final solution because it would lose allowed message data.
- Free-text content may contain patient identifiers; employee charter reduces risk but is not proof of absence.
- Compliance review is deferred for budget reasons, not waived.
