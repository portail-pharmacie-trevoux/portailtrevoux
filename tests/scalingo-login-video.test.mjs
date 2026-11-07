import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,mkdir,copyFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import express from 'express';
import {createApp} from '../server.mjs';
import {scalingoHomepage} from '../scripts/scalingo-retired-calculations-preview.mjs';
import {registerScalingoTrevouxEntry} from '../scripts/scalingo-trevoux-entry-preview.mjs';
import {scalingoLoginVideo,verifyScalingoLoginVideo} from '../scripts/scalingo-login-video-asset.mjs';
const available=existsSync(scalingoLoginVideo.file);
test('Local video validator: missing, truncated, wrong type, checksum; no download or byte modification',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'portail-video-validation-'));t.after(()=>rm(dir,{recursive:true,force:true}));const file=join(dir,'fixture-only.mp4');
 await assert.rejects(verifyScalingoLoginVideo({file}),/Vidéo originale absente/);
 await writeFile(file,'version https://git-lfs.github.com/spec/v1');await assert.rejects(verifyScalingoLoginVideo({file}),/MP4 complet/);
 const bytes=Buffer.alloc(1000000);bytes.writeUInt32BE(24,0);bytes.write('ftyp',4);await writeFile(file,bytes);
 const expected=createHash('sha256').update(bytes).digest('hex'),meta=await verifyScalingoLoginVideo({file,expectedSha256:expected});assert.equal(meta.sha256,expected);assert.equal(meta.bytes,bytes.length);assert.deepEqual(await readFile(file),bytes);
 await assert.rejects(verifyScalingoLoginVideo({file,expectedSha256:'0'.repeat(64)}),/empreinte/);
 bytes.write('html',4);await writeFile(file,bytes);await assert.rejects(verifyScalingoLoginVideo({file}),/MP4 complet/);
 const legacy=await readFile(new URL('../cache-portal-media.mjs',import.meta.url),'utf8');assert(legacy.includes(scalingoLoginVideo.source));assert.equal(scalingoLoginVideo.path,'/media/portail-plus-higgsfield-original.mp4');
});
test('Scalingo startup validates local video; normal startup remains unchanged without a video',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'portail-video-startup-'));t.after(()=>rm(dir,{recursive:true,force:true}));await mkdir(join(dir,'scripts'));await mkdir(join(dir,'public/media'),{recursive:true});
 for(const name of ['start-scalingo.mjs','scalingo-login-video-asset.mjs'])await copyFile(new URL('../scripts/'+name,import.meta.url),join(dir,'scripts',name));
 await writeFile(join(dir,'server.mjs'),"console.log('NORMAL_FIXTURE_STARTED');");await writeFile(join(dir,'scripts/serve-scalingo-ui-preview.mjs'),"console.log('PREVIEW_FIXTURE_STARTED');");
 const launch=async preview=>{const child=spawn(process.execPath,['scripts/start-scalingo.mjs'],{cwd:dir,env:{SCALINGO_PREVIEW_SAFE_MODE:preview?'true':'false',SCALINGO_PREVIEW_UI_ENABLED:preview?'true':'false'},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);const [code]=await once(child,'exit');return {code,output};};
 const normal=await launch(false);assert.equal(normal.code,0);assert.match(normal.output,/NORMAL_FIXTURE_STARTED/);
 const missing=await launch(true);assert.notEqual(missing.code,0);assert.match(missing.output,/Vidéo originale absente/);assert(!missing.output.includes('PREVIEW_FIXTURE_STARTED'));
 if(available){await copyFile(scalingoLoginVideo.file,join(dir,'public/media/portail-plus-higgsfield-original.mp4'));const ready=await launch(true);assert.equal(ready.code,0);assert.match(ready.output,/SCALINGO_LOGIN_VIDEO_VERIFIED/);assert.match(ready.output,/PREVIEW_FIXTURE_STARTED/);}
});
test('Original video local HTTP: MIME, Range, exact bytes and both absolute login references',{skip:available?false:'Original MP4 awaiting manual download; no replacement used'},async t=>{
 const expected=await verifyScalingoLoginVideo();const db={query:async()=>{throw Error('Business calls forbidden');}},config={origin:'http://localhost',secret:'local-test-'.repeat(4),homepageHTML:scalingoHomepage()}, {app}=createApp(db,config),gate=express();registerScalingoTrevouxEntry(gate,app);gate.use(app);const server=gate.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
 for(const path of ['/','/trevoux','/trevoux/']){const r=await fetch(base+path);assert.equal(r.status,200);const html=await r.text();assert(html.includes('src="'+scalingoLoginVideo.path+'"'));}
 const head=await fetch(base+scalingoLoginVideo.path,{method:'HEAD'});assert.equal(head.status,200);assert.match(head.headers.get('content-type'),/video\/mp4/);assert.equal(Number(head.headers.get('content-length')),expected.bytes);
 const partial=await fetch(base+scalingoLoginVideo.path,{headers:{range:'bytes=0-63'}});assert.equal(partial.status,206);assert.equal((await partial.arrayBuffer()).byteLength,64);assert.equal(partial.headers.get('content-range'),'bytes 0-63/'+expected.bytes);
 const response=await fetch(base+scalingoLoginVideo.path),bytes=Buffer.from(await response.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),expected.sha256);
 for(const path of ['/app.js','/styles.css','/branding/portail-plus-violet-v2.png'])assert.equal((await fetch(base+path)).status,200);assert.equal((await fetch(base+'/api/me')).status,401);
});
