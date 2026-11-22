import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import test from 'node:test';
import {setTimeout as sleep} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {previewMaintenanceConfig} from '../scripts/scalingo-preview-maintenance.mjs';
import {buildPreviewPauseReceipt} from '../scripts/migration/grouped/preview-maintenance-evidence.mjs';
import {requirePaused} from '../scripts/migration/grouped/execution-policy.mjs';

const entry=fileURLToPath(new URL('../scripts/serve-scalingo-ui-preview.mjs',import.meta.url));
const normal={SCALINGO_PREVIEW_SAFE_MODE:'true',SCALINGO_PREVIEW_UI_ENABLED:'true',SCALINGO_REQUIRE_DB_TLS:'true'};
const enabled={...normal,SCALINGO_PREVIEW_MAINTENANCE:'true',SCALINGO_PREVIEW_MAINTENANCE_GENERATION:'synthetic-generation'};
const environment={PATH:process.env.PATH};

test('normal startup preserves the existing staging checks; invalid maintenance fails closed',()=>{
 assert.equal(previewMaintenanceConfig(normal),null);
 for(const flag of [undefined,'false']){
  const env={...environment,...normal};
  if(flag!==undefined)env.SCALINGO_PREVIEW_MAINTENANCE=flag;
  const child=spawnSync(process.execPath,[entry],{env,encoding:'utf8',timeout:5000});
  assert.equal(child.status,1);
  assert.match(child.stderr,/Staging URL, secret or DB missing/);
 }
 for(const override of [
  {SCALINGO_PREVIEW_MAINTENANCE_GENERATION:'short'},
  {SCALINGO_PREVIEW_MAINTENANCE:'typo'},
  {SCALINGO_PREVIEW_SAFE_MODE:'false'},
  {SCALINGO_ENABLE_SCHEDULED_JOBS:'true'},
  {SCALINGO_ENABLE_BUSINESS_STARTUP:'true'}
 ]){
  const child=spawnSync(process.execPath,[entry],{env:{...environment,...enabled,...override},encoding:'utf8',timeout:5000});
  assert.equal(child.status,1);
  assert.match(child.stderr,/PREVIEW_MAINTENANCE_CONFIGURATION_INVALID/);
 }
});

async function startReplica(t,index){
 const reservation=createServer();
 reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
 const {port}=reservation.address();
 await new Promise(resolve=>reservation.close(resolve));
 const child=spawn(process.execPath,[entry],{env:{...environment,...enabled,
  PORT:String(port),SCALINGO_PREVIEW_BIND_HOST:'127.0.0.1',DATABASE_URL:'invalid-by-design',
  CONTAINER:'web-'+index,CONTAINER_VERSION:'a'.repeat(40)},
  stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.setEncoding('utf8').on('data',chunk=>{output+=chunk;});
 const exit=once(child,'exit');
 t.after(async()=>{child.kill('SIGTERM');await exit;});
 const url='http://127.0.0.1:'+port;
 for(let i=0;i<60&&child.exitCode===null;i++){
  try{
   const response=await fetch(url+'/health');
   assert.equal(response.status,200);
   return {url,health:await response.json(),logs:()=>output.trim().split('\n').filter(Boolean).map(JSON.parse)};
  }catch{await sleep(25);}
 }
 throw Error('Maintenance replica did not start');
}

test('real entry starts two distinct maintenance processes without usable database config',async t=>{
 const replicas=await Promise.all([startReplica(t,1),startReplica(t,2)]);
 assert.notEqual(replicas[0].health.bootId,replicas[1].health.bootId);
 for(const {url,health} of replicas){
  assert.equal(health.status,'maintenance');
  assert.equal(health.generation,enabled.SCALINGO_PREVIEW_MAINTENANCE_GENERATION);
  assert.equal((await fetch(url+'/health',{method:'HEAD'})).status,200);
  for(const [path,method] of [['/trevoux','GET'],['/api/login','POST'],['/api/calendar/tasks','DELETE'],['/health','POST'],['/health?x=1','GET']]){
   const response=await fetch(url+path,{method});
   assert.equal(response.status,503);
   assert.deepEqual(await response.json(),{status:'maintenance'});
  }
 }
});

test('maintenance logs attribute only tagged safe probes to a boot and a container',async t=>{
 const replica=await startReplica(t,1),probe='b'.repeat(32);
 for(const [path,method] of [['/health','GET'],['/trevoux','GET'],['/api/login','POST']])
  await fetch(replica.url+path,{method,headers:{'x-portail-maintenance-probe':probe,authorization:'never-log-this'}});
 await fetch(replica.url+'/trevoux?private=never-log-this',{headers:{'x-portail-maintenance-probe':probe}});
 for(let i=0;i<40&&replica.logs().length<4;i++)await sleep(25);
 const records=replica.logs();
 assert.equal(records[0].event,'preview_maintenance_listening');
 assert.deepEqual(records.slice(1).map(record=>[record.kind,record.status]),[['health',200],['application-get',503],['application-post',503]]);
 for(const record of records){
  assert.equal(record.container,'web-1');
  assert.equal(record.containerVersion,'a'.repeat(40));
  assert.equal(record.bootId,replica.health.bootId);
  assert.equal(record.generation,replica.health.generation);
  assert.ok(Number.isFinite(Date.parse(record.observedAt)));
 }
 assert.ok(records.slice(1).every(record=>record.probe===probe));
 assert.doesNotMatch(JSON.stringify(records),/never-log-this/);
});

test('receipt requires two direct distinct probes and independent drain evidence',()=>{
 const now=Date.now(),at=new Date(now-1000).toISOString(),generation='fixture-generation';
 const inventory={app:'portailplus-hds',generation,observedAt:at,web:['container-fixture-1','container-fixture-2']};
 const probes=inventory.web.map((containerId,i)=>({containerId,observedAt:at,healthStatus:200,
  health:{status:'maintenance',generation,bootId:'fixture-boot-'+i},applicationGetStatus:503,applicationPostStatus:503}));
 const drain={app:inventory.app,generation,observedAt:at,reference:'fictional-drain',
  previousProcessesDrained:true,otherWritersStopped:true,schedulersStopped:true,notificationsStopped:true,
  ingressStopped:true,inFlightTasks:0,automaticResume:false};
 const evidence={inventory,probes,drain,reference:'fictional-receipt'};
 assert.equal(requirePaused(buildPreviewPauseReceipt(evidence,now),now).generation,generation);
 assert.throws(()=>buildPreviewPauseReceipt({...evidence,probes:[probes[0],probes[0]]},now),{code:'TWO_DISTINCT_MAINTENANCE_REPLICAS_REQUIRED'});
 assert.throws(()=>buildPreviewPauseReceipt({...evidence,probes:[{...probes[0],health:{...probes[0].health,generation:'old'}},probes[1]]},now),{code:'MAINTENANCE_REPLICA_NOT_VERIFIED'});
 for(const extra of [{inFlightTasks:1},{notificationsStopped:false},{otherWritersStopped:false},{previousProcessesDrained:false},
  {observedAt:new Date(now-301000).toISOString()},{automaticResume:true}]){
  assert.throws(()=>buildPreviewPauseReceipt({...evidence,drain:{...drain,...extra}},now),{code:'INDEPENDENT_MAINTENANCE_DRAIN_NOT_VERIFIED'});
 }
});
