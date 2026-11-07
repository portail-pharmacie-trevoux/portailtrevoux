// Scalingo-only process launcher. Procfile needs no shell syntax.
// The restricted UI requires both explicit staging flags.
import {spawn} from 'node:child_process';
import {verifyScalingoLoginVideo} from './scalingo-login-video-asset.mjs';
const e=process.env;
const preview=e.SCALINGO_PREVIEW_SAFE_MODE==='true'&&e.SCALINGO_PREVIEW_UI_ENABLED==='true';
if(preview)console.log('SCALINGO_LOGIN_VIDEO_VERIFIED '+JSON.stringify(await verifyScalingoLoginVideo()));
const entry=preview?'scripts/serve-scalingo-ui-preview.mjs':'server.mjs';
const child=spawn(process.execPath,[entry],{stdio:'inherit',env:e});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
child.on('error',error=>{console.error('Scalingo launcher failed:',error.message);process.exitCode=1;});
child.on('exit',(code,signal)=>{process.exitCode=code??(signal?1:0);});
