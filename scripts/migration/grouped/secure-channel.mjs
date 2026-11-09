import {randomBytes,createCipheriv,createHmac,createPublicKey,publicEncrypt,constants} from 'node:crypto';
export async function receiveSourceUrl(stream){
 const line=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>finish(Error('SECRET_INPUT_TIMEOUT')),120000);const finish=(error,value)=>{clearTimeout(timer);stream.removeListener('data',data);stream.removeListener('end',end);stream.removeListener('error',errorHandler);stream.pause();stream.unref?.();error?reject(error):resolve(value);};const data=chunk=>{text+=chunk.toString('utf8');if(text.length>4096)return finish(Error('SECRET_FRAME_TOO_LARGE'));const index=text.indexOf('\n');if(index>=0)finish(null,text.slice(0,index).replace(/\r$/,''));};const end=()=>finish(Error('SECRET_INPUT_CLOSED'));const errorHandler=()=>finish(Error('SECRET_INPUT_FAILED'));stream.on('data',data);stream.once('end',end);stream.once('error',errorHandler);stream.resume();});
 const prefix='PORTAIL-RENDER-URL-V2:';if(!line.startsWith(prefix))throw Error('INVALID_SECRET_FRAME');const b64=line.slice(prefix.length);if(!/^[A-Za-z0-9+/]+={0,2}$/.test(b64))throw Error('INVALID_SECRET_FRAME');const bytes=Buffer.from(b64,'base64');if(bytes.toString('base64')!==b64)throw Error('INVALID_SECRET_FRAME');
 let text=bytes.toString('utf8').trim();if((text.startsWith('"')&&text.endsWith('"'))||(text.startsWith("'")&&text.endsWith("'")))text=text.slice(1,-1).trim();if(!text||/[\x00-\x1f\x7f]/.test(text))throw Error('INVALID_SOURCE_URL_CHARACTERS');return text;
}
export function encryptPrivateReport(report,jwk){
 if(jwk?.kty!=='RSA'||typeof jwk.n!=='string'||typeof jwk.e!=='string')throw Error('PRIVATE_REPORT_PUBLIC_KEY_REQUIRED');
 const plaintext=Buffer.from(JSON.stringify(report));if(plaintext.length>2*1024*1024)throw Error('PRIVATE_REPORT_TOO_LARGE');
 const master=randomBytes(64),iv=randomBytes(16),cipher=createCipheriv('aes-256-cbc',master.subarray(0,32),iv),data=Buffer.concat([cipher.update(plaintext),cipher.final()]);
 const tag=createHmac('sha256',master.subarray(32)).update(iv).update(data).digest();
 const key=publicEncrypt({key:createPublicKey({key:jwk,format:'jwk'}),padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha1'},master);master.fill(0);plaintext.fill(0);
 return {event:'private_report',algorithm:'RSA-OAEP-SHA1+A256CBC-HS256',key:key.toString('base64'),iv:iv.toString('base64'),data:data.toString('base64'),tag:tag.toString('base64')};
}
