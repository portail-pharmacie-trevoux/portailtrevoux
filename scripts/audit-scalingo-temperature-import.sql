-- psql: run on portailplus-hds only, BEFORE any retry. No writes or cleanup.
\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $$ BEGIN
 IF current_database() <> 'portailplus_7495' OR
    (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Expected Scalingo database and TLS required'; END IF;
END $$;
SELECT current_database() AS database, current_timestamp AS audited_at;
SELECT id,file_name,imported_at,added,ignored,first_reading,last_reading
FROM temperature_imports ORDER BY imported_at DESC,id DESC LIMIT 30;
SELECT s.id,s.name,count(r.recorded_at) AS readings,
       min(r.recorded_at) AS first_reading,max(r.recorded_at) AS last_reading
FROM temperature_sensors s LEFT JOIN temperature_readings r ON r.sensor_id=s.id
GROUP BY s.id,s.name ORDER BY s.id;
SELECT count(*) AS duplicate_keys FROM (
 SELECT sensor_id,recorded_at FROM temperature_readings
 GROUP BY sensor_id,recorded_at HAVING count(*)>1
) duplicates;
SELECT conname,pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conrelid='temperature_readings'::regclass AND contype='p';
SELECT count(*) AS comments FROM temperature_comments;
COMMIT;
