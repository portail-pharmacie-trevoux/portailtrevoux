-- Read-only inventory for an approved, independently verified TLS session.
-- Private output: role names and attributable session counts, without queries or credentials.
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';
SELECT current_database()='portailplus_7495'
 AND current_setting('transaction_read_only')='on'
 AND coalesce((SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),false) AS target_ok
\gset
\if :target_ok
\else
ROLLBACK;
SELECT 1/0;
\endif

-- Current role capabilities. Membership is not evidence that every backend is controllable.
SELECT current_user AS inventory_role, current_user=session_user AS using_login_role,
 r.rolsuper,r.rolcreaterole,r.rolreplication,r.rolbypassrls,
 pg_has_role(current_user,'pg_signal_backend','USAGE') AS signal_backend_member,
 pg_has_role(current_user,'pg_read_all_stats','USAGE') AS can_read_all_stats,
 pg_has_role(current_user,d.datdba,'USAGE') AS database_owner_rights
FROM pg_roles r CROSS JOIN pg_database d
WHERE r.rolname=current_user AND d.datname=current_database();

SELECT granted.rolname AS administered_role
FROM pg_auth_members m
JOIN pg_roles member ON member.oid=m.member
JOIN pg_roles granted ON granted.oid=m.roleid
WHERE member.rolname=current_user AND m.admin_option
ORDER BY 1;

SELECT rolname,rolcanlogin,rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,
 has_database_privilege(oid,current_database(),'CONNECT') AS can_connect,
 has_database_privilege(oid,current_database(),'CREATE,TEMP') AS can_create_or_temp
FROM pg_roles ORDER BY rolname;

-- Include transitive membership even where privileges are not automatically inherited.
SELECT member.rolname AS member, granted.rolname AS reachable_role,
       pg_has_role(member.oid,granted.oid,'USAGE') AS inherited
FROM pg_roles member CROSS JOIN pg_roles granted
WHERE member.oid<>granted.oid AND pg_has_role(member.oid,granted.oid,'MEMBER')
ORDER BY 1,2;

WITH local_relations AS (
 SELECT c.oid,c.relowner,c.relkind
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
   AND c.relkind IN ('r','p','v','m','f','S')
)
SELECT r.rolname,count(*) FILTER(WHERE c.relowner=r.oid) AS owned_objects,
 count(*) FILTER(WHERE CASE WHEN c.relkind='S'
   THEN has_sequence_privilege(r.oid,c.oid,'USAGE,UPDATE')
   ELSE has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
     OR has_any_column_privilege(r.oid,c.oid,'INSERT,UPDATE') END) AS effective_write_objects
FROM pg_roles r CROSS JOIN local_relations c
GROUP BY r.rolname ORDER BY r.rolname;

SELECT n.nspname AS schema_name,p.proname AS routine_name,r.rolname AS owner
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
WHERE p.prosecdef AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
ORDER BY 1,2,3;

SELECT usename,backend_type,state,count(*) AS sessions,
 count(xact_start) AS transactions_with_start
FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()
GROUP BY usename,backend_type,state ORDER BY 1,2,3;

SELECT count(*) AS pending_prepared_transactions FROM pg_prepared_xacts WHERE database=current_database();
SELECT CASE WHEN has_table_privilege(current_user,'pg_catalog.pg_subscription','SELECT')
 THEN 'SELECT count(*) AS enabled_subscriptions FROM pg_subscription WHERE subdbid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND subenabled'
 ELSE 'SELECT ''NON VÉRIFIÉ'' AS enabled_subscriptions' END
\gexec
ROLLBACK;
