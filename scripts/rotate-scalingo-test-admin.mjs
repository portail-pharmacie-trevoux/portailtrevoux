// Rotate the fictitious admin password in isolated Scalingo staging only.
import pg from 'pg';
import { hashPassword, token } from '../security.mjs';

const env = process.env;
if (env.SCALINGO_PREVIEW_SAFE_MODE !== 'true' || env.SCALINGO_REQUIRE_DB_TLS !== 'true') {
  throw new Error('Scalingo safe preview and verified database TLS are required');
}
if (env.SCALINGO_ENABLE_BUSINESS_STARTUP === 'true' || env.SCALINGO_ENABLE_SCHEDULED_JOBS === 'true') {
  throw new Error('Business startup and scheduled jobs must remain disabled');
}
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is missing');

const url = new URL(env.DATABASE_URL);
for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
const client = new pg.Client({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: true },
  connectionTimeoutMillis: 10000
});
let inTransaction = false;
try {
  await client.connect();
  await client.query('BEGIN');
  inTransaction = true;
  await client.query('SELECT pg_advisory_xact_lock(20261028, 3)');
  const identity = (await client.query(
    'SELECT current_database() AS database, (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls'
  )).rows[0];
  if (identity.database !== 'portailplus_7495' || !identity.tls) {
    throw new Error('Unexpected database or missing TLS');
  }
  const users = await client.query('SELECT id, email, role, active FROM users');
  if (users.rowCount !== 1 || users.rows[0].email !== 'admin-test@portailplus.invalid' ||
      users.rows[0].role !== 'admin' || users.rows[0].active !== true) {
    throw new Error('Database does not contain exactly the expected fictitious administrator');
  }
  const password = token();
  const passwordHash = await hashPassword(password);
  const userId = users.rows[0].id;
  await client.query('UPDATE users SET password_hash=$1 WHERE id=$2', [passwordHash, userId]);
  await client.query('DELETE FROM sessions WHERE user_id=$1', [userId]);
  await client.query('COMMIT');
  inTransaction = false;
  console.log(JSON.stringify({
    status: 'ok', database: identity.database, email: users.rows[0].email,
    password, previewSafeMode: true, mailSent: false, scheduledJobs: false,
    note: 'Store the new password privately; do not share the full output.'
  }));
} catch (error) {
  if (inTransaction) await client.query('ROLLBACK').catch(() => {});
  console.error('Password rotation failed:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
