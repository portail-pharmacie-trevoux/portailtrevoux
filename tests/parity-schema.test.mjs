import test from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';
import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve} from 'node:path';
import {ensureScalingoTemperatureSchema} from '../scripts/ensure-scalingo-temperature-schema.mjs';
import {ensureScalingoQualityFollowupSchema} from '../scripts/ensure-scalingo-quality-followup-schema.mjs';
import {ensureScalingoTrainingDocumentsSchema} from '../scripts/ensure-scalingo-training-documents-schema.mjs';
import {ensureScalingoEmployeeDeletionAudit} from '../scripts/scalingo-employee-deletion.mjs';
import {structuralProjection} from '../scripts/audit/schema-projection.mjs';
import {readSnapshot} from '../scripts/migration/grouped/database.mjs';
const address=process.env.PORTAIL_SYNTHETIC_POSTGRES_ADDRESS,main=process.env.PORTAIL_PARITY_MAIN_CHECKOUT;
test('Parity: compare declared schemas on a dedicated synthetic TLS cluster only',{skip:!address||!main,timeout:60000},async t=>{
 assert.match(address,/^127\.0\.0\.1:\d+$/);const ssl={ca:await readFile(process.env.PORTAIL_SYNTHETIC_POSTGRES_CA,'utf8'),rejectUnauthorized:true},options={host:'127.0.0.1',port:Number(address.split(':')[1]),user:'postgres',ssl,connectionTimeoutMillis:5000};
 const admin=new pg.Client({...options,database:'postgres'});await admin.connect();assert.equal((await admin.query('SHOW cluster_name')).rows[0].cluster_name,'portailplus-grouped-synthetic');
 for(const name of ['parity_main_schema','parity_scalingo_schema','parity_main_boot_probe'])await admin.query('CREATE DATABASE '+name);await admin.end();
 const source=new pg.Pool({...options,database:'parity_main_schema'}),target=new pg.Pool({...options,database:'parity_scalingo_schema'});t.after(async()=>{await source.end();await target.end();});
 const mainSQL=await readFile(resolve(main,'schema.sql'),'utf8'),branchSQL=await readFile(new URL('../schema.sql',import.meta.url),'utf8');
 const boot=new pg.Client({...options,database:'parity_main_boot_probe'});await boot.connect();let rawMainInitialization;
 try{await boot.query(mainSQL);rawMainInitialization={success:true};}catch(e){rawMainInitialization={success:false,code:e.code,message:e.message};}finally{await boot.end();}
 const sourceProjection=structuralProjection(mainSQL),targetProjection=structuralProjection(branchSQL);
 await source.query(sourceProjection.sql);await target.query(targetProjection.sql);
 await target.query('ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS title TEXT CHECK (title IS NULL OR char_length(title)<=120)');
 await ensureScalingoTemperatureSchema(target);await ensureScalingoQualityFollowupSchema(target);await ensureScalingoTrainingDocumentsSchema(target);await ensureScalingoEmployeeDeletionAudit(target);
 const columns=async pool=>(await pool.query("SELECT table_name,column_name,udt_name,is_nullable FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
 const a=await columns(source),b=await columns(target),key=r=>r.table_name+'.'+r.column_name;
 const missingTables=[...new Set(a.filter(r=>!b.some(s=>s.table_name===r.table_name)).map(r=>r.table_name))];
 const missingColumns=a.filter(r=>!missingTables.includes(r.table_name)&&!b.some(s=>key(s)===key(r)));
 const differences=a.flatMap(r=>{const other=b.find(s=>key(s)===key(r));return other&&(other.udt_name!==r.udt_name||other.is_nullable!==r.is_nullable)?[{source:r,target:other}]:[];});
 let engineCompatibility;const client=await source.connect();try{await client.query('BEGIN READ ONLY');try{await readSnapshot(client,{source:true});engineCompatibility={compatible:true};}catch(e){engineCompatibility={compatible:false,code:e.code||e.message,details:e.details};}}finally{await client.query('ROLLBACK');client.release();}
 await t.test('Main raw schema cannot be blindly bootstrapped: the guarded business migration is recorded',()=>{assert.equal(rawMainInitialization.success,false);assert.equal(rawMainInitialization.code,'P0001');assert.match(rawMainInitialization.message,/Migration novembre/);});
 await t.test('Both declared schemas apply under TLS without creating collaborators',async()=>{for(const pool of [source,target]){assert.equal((await pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n,0);assert.equal((await pool.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl,true);}});
 await t.test('Known main-only training and calendar links are detected, not silently assumed present',()=>{assert(missingTables.includes('training_attestation_imports'));assert(missingColumns.some(r=>key(r)==='calendar_tasks.source_message_id'));assert(missingColumns.some(r=>key(r)==='hr_documents.training_date'));});
 await t.test('Preview additive preparation is accounted for in column comparisons',()=>{assert(b.some(r=>key(r)==='temperature_comments.validation'));assert(b.some(r=>key(r)==='quality_errors.correction_note'));assert(b.some(r=>key(r)==='training_documents.removed_at'));});
 const report={mode:'SYNTHETIC_DDL_PROJECTIONS_NOT_LIVE_DATABASES',rawMainInitialization,projection:{source:{statements:sourceProjection.structuralStatements,omitted:sourceProjection.omitted},target:{statements:targetProjection.structuralStatements,omitted:targetProjection.omitted}},mainTables:new Set(a.map(r=>r.table_name)).size,scalingoTables:new Set(b.map(r=>r.table_name)).size,missingTables,missingColumns,differences,engineCompatibility,liveDataVerified:false};
 if(process.env.PORTAIL_PARITY_SCHEMA_OUTPUT){const out=resolve(process.env.PORTAIL_PARITY_SCHEMA_OUTPUT);await mkdir(out,{recursive:true});await writeFile(resolve(out,'schema-differences.json'),JSON.stringify(report,null,2)+'\n');}
 t.diagnostic(JSON.stringify(report));
});
