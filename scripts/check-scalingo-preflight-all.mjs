// Run the three read-only Scalingo checks in sequence; no credentials or data are printed.
import {spawnSync} from 'node:child_process';
const checks=[
 'scripts/check-scalingo-staging-db.mjs',
 'scripts/check-scalingo-authentication.mjs',
 'scripts/check-scalingo-functional-preflight.mjs'
];
let failures=0;
for(const script of checks){
 console.log(JSON.stringify({check:script,event:'start'}));
 const result=spawnSync(process.execPath,[script],{stdio:'inherit',env:process.env,timeout:60000});
 if(result.error||result.status!==0){
  failures++;
  console.error(JSON.stringify({check:script,status:'failed',reason:result.error?.message||'nonzero_exit',exitCode:result.status}));
 }else console.log(JSON.stringify({check:script,status:'passed'}));
}
console.log(JSON.stringify({summary:failures?'review_required':'passed',checks:checks.length,failed:failures,liveLoginVerified:false,mfaVerified:false}));
if(failures)process.exitCode=1;
