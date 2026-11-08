-- Internal Scalingo console only. No changes, no file contents, no credentials.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='10s';
SET LOCAL TIME ZONE 'UTC';
SELECT current_database(),current_setting('transaction_read_only'),
 (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls;
SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns
WHERE table_schema='public' AND table_name='procedure_documents' ORDER BY ordinal_position;
SELECT count(*) AS documents,count(*) FILTER(WHERE active) AS active,
 count(file_content) AS files,coalesce(sum(octet_length(file_content)),0) AS binary_bytes
FROM public.procedure_documents;
SELECT id,category,title,active,builtin_key,file_name,file_type,octet_length(file_content) AS bytes,
 encode(sha256(file_content),'hex') AS sha256,created_at,source_imported_at
FROM public.procedure_documents ORDER BY id;
SELECT pg_get_serial_sequence('public.procedure_documents','id') AS sequence;
SELECT schemaname,sequencename,last_value,increment_by,max_value,cache_size,cycle FROM pg_sequences
WHERE schemaname='public' AND sequencename=split_part(pg_get_serial_sequence('public.procedure_documents','id'),'.',2);
SELECT conrelid::regclass::text AS child,confrelid::regclass::text AS parent,pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE contype='f' AND (conrelid='public.procedure_documents'::regclass OR confrelid='public.procedure_documents'::regclass);
ROLLBACK;
