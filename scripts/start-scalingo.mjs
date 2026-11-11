// Fail closed: no implicit fallback to server.mjs/initialize or business seeding.
import {spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {verifyScalingoLoginVideo} from './scalingo-login-video-asset.mjs';
export function selectScalingoEntry(env){
 if(env.SCALINGO_RUNTIME_PROFILE==='production'){
  if(env.SCALINGO_PRODUCTION_RUNTIME_APPROVED!=='true'||env.SCALINGO_REQUIRE_DB_TLS!=='true')throw Error('SCALINGO_PRODUCTION_PROFILE_NOT_APPROVED');
  return 'scripts/serve-scalingo-production.mjs';
 }
 if(env.SCALINGO_PREVIEW_SAFE_MODE==='true'&&env.SCALINGO_PREVIEW_UI_ENABLED==='true')return 'scripts/serve-scalingo-ui-preview.mjs';
 throw Error('SCALINGO_RUNTIME_PROFILE_REQUIRED_NO_BUSINESS_STARTUP');
}
export async function startScalingo(env=process.env){
 const entry=selectScalingoEntry(env);console.log('SCALINGO_LOGIN_VIDEO_VERIFIED '+JSON.stringify(await verifyScalingoLoginVideo()));
 const child=spawn(process.execPath,[entry],{stdio:'inherit',env});
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
 child.on('error',()=>{console.error('Scalingo launcher failed.');process.exitCode=1;});
 child.on('exit',(code,signal)=>{process.exitCode=code??(signal?1:0);});return child;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await startScalingo();
