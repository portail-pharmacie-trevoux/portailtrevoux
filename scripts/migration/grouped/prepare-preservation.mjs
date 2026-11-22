import {spawnSync} from 'node:child_process';
import {access,readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {buildPreviewPauseReceipt} from './preview-maintenance-evidence.mjs';
import {REAL_EXECUTION_ENABLED} from './secure-executor.mjs';

const branch='chore/scalingo-hds-preparation-2026-10';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const recent=(time,now,window)=>typeof time==='string'&&Date.parse(time)<=now&&Date.parse(time)>now-window;

export function preparationReport({currentBranch,localRevision,isolatedTests,preview,observedAt,maintenance,backup},now=Date.now()){
 const reasons=[];
 const need=(condition,code)=>{if(!condition)reasons.push(code);};
 need(currentBranch===branch,'WRONG_BRANCH');
 need(isolatedTests===true,'ISOLATED_REHEARSAL_NOT_VERIFIED');
 const plan=preview?.reviewedPlan;
 const previewValid=preview?.ready===true&&preview.dataWrites===0&&preview.executionLocked===true&&
  preview.preserveExistingScalingoData===true&&preview.identities?.mapped===18&&
  preview.conflicts&&Object.keys(preview.conflicts).length===0&&plan?.mode==='preserve-scalingo-v1'&&
  sha(plan.planDigest)&&sha(plan.sourceDigest)&&sha(plan.targetDigest)&&
  plan.sourceDigest===preview.sourceDigest&&plan.targetDigest===preview.targetDigest&&
  Number.isSafeInteger(plan.inserts)&&plan.inserts>0&&plan.inserts===preview.plannedWrites?.inserts&&
  plan.updates===0&&plan.deletes===0&&plan.ledgerInserts===1;
 need(previewValid,'MATCHING_INSERT_ONLY_PREVIEW_REQUIRED');
 need(previewValid&&recent(observedAt,now,15*60_000),'FRESH_PREVIEW_OBSERVATION_REQUIRED');
 if(maintenance){
  try{buildPreviewPauseReceipt(maintenance,now);}
  catch(error){reasons.push(error.code||'INVALID_MAINTENANCE_EVIDENCE');}
 }else reasons.push('TWO_REPLICAS_AND_INDEPENDENT_DRAIN_EVIDENCE_REQUIRED');
 const backupMatches=previewValid&&backup?.targetDigest===plan.targetDigest&&
  typeof backup.reference==='string'&&backup.reference.length>=8&&
  typeof backup.restorationReference==='string'&&backup.restorationReference.length>=8&&
  backup.reference!==backup.restorationReference&&recent(backup.completedAt,now,86400_000)&&
  recent(backup.restoredAt,now,86400_000)&&Date.parse(backup.restoredAt)>=Date.parse(backup.completedAt)&&
  Date.parse(observedAt)>=Date.parse(backup.completedAt)&&backup.isolatedRestoreVerified===true;
 need(backupMatches,'FRESH_BACKUP_AND_MATCHING_ISOLATED_RESTORE_REQUIRED');
 // Local JSON validates shape only. It cannot establish that external observations came from authorized systems.
 reasons.push('TRUSTED_PLATFORM_DEPLOYMENT_AND_EVIDENCE_ADAPTERS_NOT_CONNECTED');
 need(!REAL_EXECUTION_ENABLED,'UNEXPECTED_EXECUTION_FLAG');
 reasons.push('PRODUCTION_PRESERVATION_EXECUTOR_NOT_RELEASED');
 return {status:'BLOCKED',localRevision,executionEnabled:REAL_EXECUTION_ENABLED,
  productionDataWrites:0,isolatedTests,plannedWrites:previewValid?{
   inserts:plan.inserts,updates:0,deletes:0,ledgerInserts:1}:null,reasons};
}

async function main(){
 const args=process.argv.slice(2);
 const input=args.find(arg=>arg!=='--rehearse');
 let evidence={},invalid=false;
 try{if(input)evidence=JSON.parse(await readFile(input,'utf8'));}
 catch{invalid=true;}
 const git=(...argv)=>spawnSync('git',['-C',root,...argv],{encoding:'utf8'});
 const currentBranch=git('branch','--show-current').stdout?.trim();
 const localRevision=git('rev-parse','HEAD').stdout?.trim();
 let isolatedTests=false;
 const preservationFixture=await access(new URL('./windows-transaction.mjs',import.meta.url)).then(()=>true,()=>false);
 if(args.includes('--rehearse')&&currentBranch===branch&&preservationFixture){
  const result=spawnSync(process.execPath,['scripts/migration/grouped/test-isolated-postgres.mjs'],{
   cwd:root,env:{PATH:process.env.PATH,PORTAIL_SYNTHETIC_POSTGRES_IMAGE:'postgres:18.6-bookworm'},
   encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024});
  isolatedTests=result.status===0&&/^# fail 0$/m.test(result.stdout||'')&&
   /^# pass [1-9][0-9]*$/m.test(result.stdout||'')&&/^# skipped 0$/m.test(result.stdout||'');
 }
 const report=preparationReport({...evidence,currentBranch,localRevision,isolatedTests});
 if(invalid)report.reasons.unshift('EVIDENCE_FILE_UNREADABLE');
 if(args.includes('--rehearse')&&!preservationFixture)report.reasons.unshift('PRESERVATION_REHEARSAL_CODE_NOT_PRESENT');
 console.log(JSON.stringify(report,null,2));
 process.exitCode=2;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
