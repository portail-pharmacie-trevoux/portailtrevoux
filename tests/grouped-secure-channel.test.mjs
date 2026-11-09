import test from 'node:test';import assert from 'node:assert/strict';import {Readable} from 'node:stream';
import {generateKeyPairSync,privateDecrypt,createHmac,createDecipheriv,constants} from 'node:crypto';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {receiveSourceUrl,encryptPrivateReport} from '../scripts/migration/grouped/secure-channel.mjs';
const url='postgresql://fixture:p%40%27%22%24%26@fixture.frankfurt-postgres.render.com/portailtrevoux_db';
test('Framed stdin accepts fragmented quoted clipboard URLs and preserves password characters without logging',async()=>{
 const frame='PORTAIL-RENDER-URL-V2:'+Buffer.from(' "'+url+'" ').toString('base64')+'\r\n',messages=[];const log=console.log;console.log=(...m)=>messages.push(m);try{const got=await receiveSourceUrl(Readable.from([frame.slice(0,14),frame.slice(14,55),frame.slice(55)]));assert.equal(got,url);assert.deepEqual(messages,[]);}finally{console.log=log;}
});
test('Unframed, oversized and control-character secret inputs fail without exposing the URL',async()=>{
 for(const value of [url+'\n','PORTAIL-RENDER-URL-V2:!!!!\n','x'.repeat(4200)+'\n','PORTAIL-RENDER-URL-V2:'+Buffer.from(url+'\u001b').toString('base64')+'\n'])await assert.rejects(receiveSourceUrl(Readable.from([value])),e=>/^[A-Z_]+$/.test(e.message)&&!e.message.includes(url));
});
test('Private identity/publication report is encrypted and authenticated, only the PC private key can decrypt it',()=>{
 const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048}),report={identities:[{sourceId:15,sourceIdentity:{firstName:'Synthetic',lastName:'Administrator'}}],publications:[{sourceId:282,title:'Private synthetic title'}]};
 const envelope=encryptPrivateReport(report,publicKey.export({format:'jwk'}));assert(!JSON.stringify(envelope).includes('Synthetic'));assert(!JSON.stringify(envelope).includes('Private synthetic title'));
 const master=privateDecrypt({key:privateKey,oaepHash:'sha1',padding:constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(envelope.key,'base64')),iv=Buffer.from(envelope.iv,'base64'),data=Buffer.from(envelope.data,'base64');assert(createHmac('sha256',master.subarray(32)).update(iv).update(data).digest().equals(Buffer.from(envelope.tag,'base64')));const cipher=createDecipheriv('aes-256-cbc',master.subarray(0,32),iv);assert.deepEqual(JSON.parse(Buffer.concat([cipher.update(data),cipher.final()])),report);
});
test('Bash handshake disables PTY echo before the password frame is sent',{timeout:10000},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'grouped-channel-fixture-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const receiver=join(dir,'receiver.mjs'),bootstrap=join(dir,'bootstrap.sh');
 await writeFile(receiver,"import {receiveSourceUrl} from "+JSON.stringify(new URL('../scripts/migration/grouped/secure-channel.mjs',import.meta.url).href)+";const u=await receiveSourceUrl(process.stdin);console.log(JSON.stringify({event:'received',matches:"+JSON.stringify(url)+"===u}));");
 await writeFile(bootstrap,(await readFile(new URL('../scripts/migration/grouped/bootstrap.sh',import.meta.url),'utf8')).replace('exec node /tmp/uploads/run.mjs','exec node '+JSON.stringify(receiver)));
 const python=`import os,pty,subprocess,select,time,sys,json,termios,base64
master,slave=pty.openpty()
p=subprocess.Popen(['bash',sys.argv[1]],stdin=slave,stdout=slave,stderr=slave)
buf=b'';deadline=time.time()+5
while b'PORTAIL_SECRET_READY_V2' not in buf:
 if time.time()>deadline:raise RuntimeError('handshake timeout')
 if select.select([master],[],[],0.1)[0]:buf+=os.read(master,65536)
assert not (termios.tcgetattr(slave)[3]&termios.ECHO)
frame=b'PORTAIL-RENDER-URL-V2:'+base64.b64encode(sys.argv[2].encode())
os.write(master,frame+b'\\n')
while p.poll() is None:
 if time.time()>deadline:p.kill();raise RuntimeError('receiver timeout')
 if select.select([master],[],[],0.1)[0]:buf+=os.read(master,65536)
while select.select([master],[],[],0.05)[0]:buf+=os.read(master,65536)
assert p.returncode==0
assert frame not in buf and sys.argv[2].encode() not in buf
assert b'"matches":true' in buf
print('MASKED_HANDSHAKE_OK')
os.close(master);os.close(slave)`;
 const result=await promisify(execFile)('python3',['-c',python,bootstrap,url]);assert.match(result.stdout,/MASKED_HANDSHAKE_OK/);
});
