// Dedicated disposable cluster only. No production URL, CLI token or app startup is used.
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
const root=new URL('../../../',import.meta.url).pathname;
const name='portail-grouped-synthetic-'+randomBytes(6).toString('hex');
const directory=mkdtempSync(join(tmpdir(),'portail-grouped-synthetic-'));
const env={...process.env};for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[key];
const docker=(...args)=>execFileSync('docker',['--host=unix:///var/run/docker.sock',...args],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
let container=false,network=false;
try{
 docker('info','--format','{{.ServerVersion}}');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(directory,'server.key'),'-out',join(directory,'server.crt'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost'],{stdio:'ignore'});
 docker('network','create',name);network=true;
 docker('run','-d','--rm','--name',name,'--network',name,'-p','127.0.0.1::5432','-e','POSTGRES_HOST_AUTH_METHOD=trust','--mount','type=bind,src='+directory+',dst=/fixture,readonly',process.env.PORTAIL_SYNTHETIC_POSTGRES_IMAGE||'postgres:18-bookworm','bash','-c','cp /fixture/server.crt /tmp/server.crt && cp /fixture/server.key /tmp/server.key && chown postgres:postgres /tmp/server.* && chmod 600 /tmp/server.key && exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/tmp/server.crt -c ssl_key_file=/tmp/server.key -c cluster_name=portailplus-grouped-synthetic');container=true;
 let ready=false;for(let i=0;i<100;i++){try{docker('exec',name,'pg_isready','-h','127.0.0.1','-U','postgres');ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}
 if(!ready)throw Error('SYNTHETIC_POSTGRES_NOT_READY');
 const address=docker('port',name,'5432/tcp');if(!/^127\.0\.0\.1:\d+$/.test(address))throw Error('LOOPBACK_BIND_REQUIRED');
 const testFiles=['scripts/migration/grouped/archive-integration.test.mjs','scripts/migration/grouped/execution-preflight.test.mjs','scripts/migration/grouped/execution-policy.test.mjs'];
 if(process.argv.includes('--parity'))testFiles.push('tests/parity-schema.test.mjs');
 const result=spawnSync(process.execPath,['--test','--test-reporter=tap',...testFiles],{cwd:root,env:{...env,PORTAIL_SYNTHETIC_POSTGRES_ADDRESS:address,PORTAIL_SYNTHETIC_POSTGRES_CA:join(directory,'server.crt'),PORTAIL_SYNTHETIC_POSTGRES_CONTAINER:name},stdio:'inherit'});
 if(result.error)throw result.error;process.exitCode=result.status??1;
}finally{
 if(container)docker('stop',name);
 if(network)docker('network','rm',name);
 rmSync(directory,{recursive:true,force:true});
}
