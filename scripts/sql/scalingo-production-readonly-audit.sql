-- Run with psql -X -w -v ON_ERROR_STOP=1 -f <file>, after independent access approval.
-- The caller must already have verified the endpoint, certificate and dedicated role grants.
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
SELECT current_setting('server_version_num')::integer >= 170000 AS supports_transaction_timeout
\gset
\if :supports_transaction_timeout
SET LOCAL transaction_timeout = '120s';
\endif

SELECT current_database() = 'portailplus_7495'
 AND current_setting('transaction_read_only') = 'on'
 AND current_setting('default_transaction_read_only') = 'on'
 AND coalesce((SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()), false)
 AND current_user = session_user
 AND NOT EXISTS (
   SELECT 1 FROM pg_roles r
   WHERE pg_has_role(current_user, r.oid, 'MEMBER')
     AND (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls
       OR r.rolname IN ('pg_write_all_data','pg_read_all_data','pg_execute_server_program',
                        'pg_read_server_files','pg_write_server_files')))
 AND NOT EXISTS (
   SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member
   WHERE r.rolname=current_user
 )
 AND NOT EXISTS (
   SELECT 1 FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace
   WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
     AND (pg_has_role(f.proowner,'MEMBER')
       OR (f.prosecdef AND has_function_privilege(f.oid,'EXECUTE')))
 )
 AND NOT has_database_privilege(current_database(), 'CREATE,TEMP')
 AND NOT EXISTS (
   SELECT 1 FROM pg_namespace n
   WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
     AND (has_schema_privilege(n.oid, 'CREATE') OR pg_has_role(n.nspowner, 'MEMBER')))
 AND NOT EXISTS (
   SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
   AND CASE WHEN c.relkind = 'S' THEN
         has_sequence_privilege(c.oid, 'USAGE,UPDATE')
       WHEN c.relkind IN ('r','p','v','m','f') THEN
         has_table_privilege(c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
         OR has_any_column_privilege(c.oid, 'INSERT,UPDATE,REFERENCES')
         OR CASE WHEN current_setting('server_version_num')::integer >= 170000
                 THEN has_table_privilege(c.oid, 'MAINTAIN') ELSE false END
       ELSE false END
 )
 AND NOT EXISTS (
   SELECT 1 FROM pg_database d WHERE d.datname=current_database() AND pg_has_role(d.datdba,'MEMBER')
 )
 AND NOT EXISTS (
   SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
     AND pg_has_role(c.relowner,'MEMBER')
 ) AS audit_allowed
\gset
\if :audit_allowed
\echo READ ONLY / TLS / contrôles locaux des droits réussis
\else
\echo AUDIT REFUSÉ
ROLLBACK;
-- Force a nonzero exit in psql batch mode, without accessing application objects.
SELECT 1/0;
\endif

-- Counts from statistics and storage size. No scan of business data or sequence counters.
SELECT c.relname AS object, c.relkind AS kind, c.relpersistence AS persistence,
       c.relrowsecurity AS rls, s.n_live_tup AS estimated_rows,
       greatest(s.last_analyze,s.last_autoanalyze) AS last_statistics,
       CASE WHEN c.relkind IN ('r','p','m') THEN pg_total_relation_size(c.oid) END AS total_bytes
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_stat_all_tables s ON s.relid=c.oid
WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f','S') ORDER BY 1;

-- Expressions are fingerprinted. Catalog definitions can contain embedded literals.
SELECT c.relname AS object,a.attname AS column_name,format_type(a.atttypid,a.atttypmod) AS sql_type,
       a.attnum AS position,a.attnotnull AS not_null,a.attidentity AS identity_kind,
       a.attgenerated AS generated_kind, co.collname AS collation_name,
       md5(pg_get_expr(d.adbin,d.adrelid)) AS default_fingerprint
FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
LEFT JOIN pg_collation co ON co.oid=a.attcollation
WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped
ORDER BY 1,4;

SELECT n.nspname AS object_schema,c.relname AS object,k.conname AS constraint_name,k.contype AS kind,
       ARRAY(SELECT a.attname FROM unnest(k.conkey) WITH ORDINALITY u(num,pos)
             JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=u.num ORDER BY u.pos) AS columns,
       pn.nspname AS target_schema,p.relname AS target_table,
       ARRAY(SELECT a.attname FROM unnest(k.confkey) WITH ORDINALITY u(num,pos)
             JOIN pg_attribute a ON a.attrelid=p.oid AND a.attnum=u.num ORDER BY u.pos) AS target_columns,
       k.confupdtype AS on_update,k.confdeltype AS on_delete,k.confmatchtype AS match_type,
       k.convalidated AS validated,k.condeferrable AS deferrable,k.condeferred AS initially_deferred,
       md5(pg_get_constraintdef(k.oid)) AS definition_fingerprint
FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_class p ON p.oid=k.confrelid LEFT JOIN pg_namespace pn ON pn.oid=p.relnamespace
WHERE n.nspname='public' OR pn.nspname='public' ORDER BY 1,2,3;

SELECT c.relname AS object,i.relname AS index_name,am.amname AS method,x.indisunique AS unique_index,
       x.indisprimary AS primary_index,x.indisvalid AS valid,x.indisready AS ready,
       ARRAY(SELECT a.attname FROM unnest(x.indkey) WITH ORDINALITY u(num,pos)
             LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=u.num ORDER BY u.pos) AS columns,
       md5(pg_get_expr(x.indpred,c.oid)) AS predicate_fingerprint,
       md5(pg_get_indexdef(i.oid)) AS definition_fingerprint
FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid
JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_am am ON am.oid=i.relam
WHERE n.nspname='public' ORDER BY 1,2;

SELECT s.relname AS sequence_name,format_type(q.seqtypid,NULL) AS sql_type,
       q.seqstart,q.seqmin,q.seqmax,q.seqincrement,q.seqcycle,q.seqcache,
       tn.nspname AS owner_schema,t.relname AS owner_table,a.attname AS owner_column,d.deptype
FROM pg_sequence q JOIN pg_class s ON s.oid=q.seqrelid JOIN pg_namespace n ON n.oid=s.relnamespace
LEFT JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.objid=s.oid
 AND d.refclassid='pg_class'::regclass AND d.refobjsubid>0 AND d.deptype IN ('a','i')
LEFT JOIN pg_class t ON t.oid=d.refobjid LEFT JOIN pg_namespace tn ON tn.oid=t.relnamespace
LEFT JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
WHERE n.nspname='public' ORDER BY 1;

-- Catalog dependency edges involving public relations, without expressions or row values.
SELECT DISTINCT sn.nspname AS source_schema,s.relname AS source_relation,sa.attname AS source_column,
       pn.nspname AS target_schema,p.relname AS target_relation,pa.attname AS target_column,d.deptype
FROM pg_depend d
LEFT JOIN pg_rewrite w ON d.classid='pg_rewrite'::regclass AND w.oid=d.objid
JOIN pg_class s ON s.oid=CASE WHEN d.classid='pg_class'::regclass THEN d.objid ELSE w.ev_class END
JOIN pg_class p ON p.oid=d.refobjid AND d.refclassid='pg_class'::regclass
JOIN pg_namespace sn ON sn.oid=s.relnamespace JOIN pg_namespace pn ON pn.oid=p.relnamespace
LEFT JOIN pg_attribute sa ON sa.attrelid=s.oid AND sa.attnum=d.objsubid AND w.oid IS NULL
LEFT JOIN pg_attribute pa ON pa.attrelid=p.oid AND pa.attnum=d.refobjsubid
WHERE sn.nspname='public' OR pn.nspname='public' ORDER BY 1,2,3,4,5,6,7;

-- Fixed allowlist of unique keys from the parity delta and their implicit NULL semantics.
-- Runs only on physical public tables with RLS disabled, exact expected types and column grants.
WITH checks(name,relation,keys,types) AS (VALUES
 ('calendar_tasks_source_message','calendar_tasks',ARRAY['user_id','source_message_id'],ARRAY['integer','integer']),
 ('merchandising_promotion_slot','merchandising_promotions',ARRAY['month','zone_id'],ARRAY['text','integer']),
 ('merchandising_origin_key','merchandising_promotions',ARRAY['origin_key'],ARRAY['text']),
 ('message_automation_occurrence','message_automation_runs',ARRAY['automation_id','occurrence'],ARRAY['text','date']),
 ('message_automations_pk','message_automations',ARRAY['id'],ARRAY['text']),
 ('message_automation_runs_pk','message_automation_runs',ARRAY['id'],ARRAY['bigint']),
 ('message_automation_changes_pk','message_automation_changes',ARRAY['id'],ARRAY['bigint']),
 ('training_attestation_imports_pk','training_attestation_imports',ARRAY['id'],ARRAY['uuid']),
 ('merchandising_promotions_pk','merchandising_promotions',ARRAY['id'],ARRAY['integer']),
 ('merchandising_promotion_events_pk','merchandising_promotion_events',ARRAY['id'],ARRAY['bigint']),
 ('merchandising_product_names_pk','merchandising_product_names',ARRAY['ean'],ARRAY['text']),
 ('merchandising_product_overrides_pk','merchandising_product_overrides',ARRAY['ean'],ARRAY['text']),
 ('merchandising_product_name_events_pk','merchandising_product_name_events',ARRAY['id'],ARRAY['bigint']),
 ('merchandising_promotion_documents_pk','merchandising_promotion_documents',ARRAY['id'],ARRAY['bigint']),
 ('scalingo_employee_deletion_audit_pk','scalingo_employee_deletion_audit',ARRAY['id'],ARRAY['bigint'])
)
SELECT CASE WHEN c.relkind='r' AND NOT c.relrowsecurity AND NOT c.relhassubclass
 AND k.column_count=cardinality(checks.keys)
 THEN format('SELECT %L AS check_name, count(*) AS duplicate_groups FROM (SELECT 1 FROM ONLY public.%I WHERE %s GROUP BY %s HAVING count(*) > 1) grouped',
             checks.name,checks.relation,k.nonnull,k.key_list)
 ELSE format('SELECT %L AS check_name, %L AS status',checks.name,'NON VÉRIFIÉ')
 END
FROM checks
LEFT JOIN pg_class c ON c.relnamespace='public'::regnamespace AND c.relname=checks.relation
CROSS JOIN LATERAL (
 SELECT count(*) AS column_count,string_agg(format('%I IS NOT NULL',a.attname),' AND ' ORDER BY u.pos) AS nonnull,
        string_agg(format('%I',a.attname),', ' ORDER BY u.pos) AS key_list
 FROM unnest(checks.keys,checks.types) WITH ORDINALITY u(key,type_name,pos)
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname=u.key AND a.attnum>0 AND NOT a.attisdropped
 WHERE format_type(a.atttypid,a.atttypmod)=u.type_name AND has_column_privilege(c.oid,a.attnum,'SELECT')
) k ORDER BY checks.name
\gexec

-- Expected single-column foreign keys, including keys whose constraints may be absent.
WITH checks(source_table,source_key,target_table,target_key) AS (VALUES
 ('message_automations','created_by','users','id'),
 ('message_automations','updated_by','users','id'),
 ('message_automation_runs','automation_id','message_automations','id'),
 ('message_automation_changes','automation_id','message_automations','id'),
 ('message_automation_changes','actor_id','users','id'),
 ('training_attestation_imports','owner_id','users','id'),
 ('training_attestation_imports','added_by','users','id'),
 ('training_attestation_reads','user_id','users','id'),
 ('merchandising_promotions','laboratory_id','laboratories','id'),
 ('merchandising_promotions','zone_id','merchandising_zones','id'),
 ('merchandising_promotions','created_by','users','id'),
 ('merchandising_promotions','assigned_by','users','id'),
 ('merchandising_promotions','updated_by','users','id'),
 ('merchandising_promotion_events','promotion_id','merchandising_promotions','id'),
 ('merchandising_promotion_events','operator_id','users','id'),
 ('merchandising_product_overrides','updated_by','users','id'),
 ('merchandising_product_name_events','operator_id','users','id'),
 ('merchandising_promotion_documents','promotion_id','merchandising_promotions','id'),
 ('merchandising_promotion_documents','created_by','users','id'),
 ('calendar_tasks','source_message_id','team_messages','id'),
 ('hr_documents','training_verified_by','users','id'),
 ('training_documents','removed_by','users','id'),
 ('quality_errors','corrected_by','users','id')
), keys AS (
 SELECT c.relname::text AS relation,a.attname::text AS column_name,a.atttypid
 FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid
 WHERE c.relnamespace='public'::regnamespace AND c.relkind='r'
   AND NOT c.relrowsecurity AND NOT c.relhassubclass AND a.attnum>0 AND NOT a.attisdropped
   AND a.atttypid IN ('integer'::regtype,'text'::regtype)
   AND has_column_privilege(c.oid,a.attnum,'SELECT')
)
SELECT CASE WHEN s.atttypid=t.atttypid
 THEN format('SELECT %L AS check_name,count(*) AS orphan_rows FROM ONLY public.%I s WHERE s.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ONLY public.%I t WHERE t.%I=s.%I)',
             x.source_table||'.'||x.source_key,x.source_table,x.source_key,x.target_table,x.target_key,x.source_key)
 ELSE format('SELECT %L AS check_name,%L AS status',x.source_table||'.'||x.source_key,'NON VÉRIFIÉ')
 END
FROM checks x LEFT JOIN keys s ON (s.relation,s.column_name)=(x.source_table,x.source_key)
LEFT JOIN keys t ON (t.relation,t.column_name)=(x.target_table,x.target_key)
ORDER BY x.source_table,x.source_key
\gexec

-- Same eligibility rule as the candidate, returning counts only.
SELECT EXISTS (
 SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname='users' AND c.relkind='r'
   AND NOT c.relrowsecurity AND NOT c.relhassubclass
   AND 4=(SELECT count(*) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
     AND has_column_privilege(c.oid,a.attnum,'SELECT')
     AND ((a.attname IN ('role','email') AND a.atttypid='text'::regtype)
       OR (a.attname IN ('active','must_change') AND a.atttypid='boolean'::regtype)))
) AS check_admins
\gset
\if :check_admins
SELECT count(*) FILTER (WHERE active AND NOT must_change AND email<>'' AND email<>'admin-test@portailplus.invalid')
         AS ready_personal_administrators
FROM ONLY public.users WHERE role='admin';
\else
\echo Administrateurs personnels : NON VÉRIFIÉ
\endif
ROLLBACK;
