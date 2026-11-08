-- Metadata ONLY. Execute later via an authorized confidential read-only channel.
-- Never execute server startup/initialize() to obtain this inventory.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '10s';
SELECT id,email,first_name AS "firstName",last_name AS "lastName",name,role,active,
 directory_key AS "directoryKey",rights,edit_rights AS "editRights",
 permissions_configured AS "permissionsConfigured",must_change AS "mustChange",
 (password_hash IS NOT NULL AND password_hash<>'') AS "passwordPresent",
 COALESCE(password_hash ~ '^[0-9a-f]{32}:[0-9a-f]{128}$',FALSE) AS "passwordFormatValid"
FROM users ORDER BY id;
-- Structural references, no personal records or secrets:
SELECT conrelid::regclass AS referencing_table,conname,pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE contype='f' AND confrelid='public.users'::regclass
ORDER BY conrelid::regclass::text,conname;
ROLLBACK;
