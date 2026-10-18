import { mkdir, stat, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
const destination = new URL('./public/media/', import.meta.url);
const assets = [
  {name:'portail-plus-accueil.png',url:'https://d2ol7oe51mr4n9.cloudfront.net/user_3KFMr3Wn8Gf22pd0CGclp0y9Pv4/fecbc465-65d5-4ccc-a5b9-4c4e13e06d69.png',min:100000},
  {name:'portail-plus-higgsfield-original.mp4',url:'https://d8j0ntlcm91z4.cloudfront.net/user_3KFMr3Wn8Gf22pd0CGclp0y9Pv4/hf_20261018_162755_96a41375-49bd-4fd7-bfac-18a3b63a610b.mp4',min:1000000}
];
await mkdir(destination,{recursive:true});
await Promise.all(assets.map(async ({name,url,min})=>{
  const file=join(new URL(destination).pathname,name);
  try{if((await stat(file)).size>=min){console.log('Média local prêt : '+name);return;}}catch{}
  for(let attempt=1;attempt<=3;attempt++){
    const temp=file+'.tmp';
    try{
      const response=await fetch(url,{signal:AbortSignal.timeout(45000)});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const buffer=Buffer.from(await response.arrayBuffer());
      if(buffer.length<min)throw new Error('Fichier incomplet');
      await writeFile(temp,buffer);
      await rename(temp,file);
      console.log('Média copié dans Portail + : '+name+' ('+buffer.length+' octets)');
      return;
    }catch(error){
      await unlink(temp).catch(()=>{});
      if(attempt===3){console.error('Impossible de préparer le média '+name+': '+error.message);process.exitCode=1;}
    }
  }
}));
