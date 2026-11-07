// Original animation only. Validate local bytes; never download, transcode or
// substitute media. The asset must be committed in the deployment archive.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export const scalingoLoginVideo={
 path:'/media/portail-plus-higgsfield-original.mp4',
 sha256:'1acbca496ac7b4bb8e6576881078e70046dab85924647096fd9887264cc79486',
 source:'https://d8j0ntlcm91z4.cloudfront.net/user_3KFMr3Wn8Gf22pd0CGclp0y9Pv4/hf_20261018_162755_96a41375-49bd-4fd7-bfac-18a3b63a610b.mp4',
 file:new URL('../public/media/portail-plus-higgsfield-original.mp4',import.meta.url)
};
export async function verifyScalingoLoginVideo({file=scalingoLoginVideo.file,expectedSha256=scalingoLoginVideo.sha256}={}){
 let bytes;
 try{bytes=await readFile(file);}catch(error){if(error.code==='ENOENT')throw Error('Vidéo originale absente : ajouter public/media/portail-plus-higgsfield-original.mp4 avant tout déploiement Scalingo.');throw error;}
 if(bytes.length<1000000||bytes.subarray(4,8).toString()!=='ftyp')throw Error('Le fichier local ne correspond pas à un MP4 complet attendu (minimum 1 Mo).');
 const sha256=createHash('sha256').update(bytes).digest('hex');
 if(expectedSha256&&sha256!==expectedSha256)throw Error('L’empreinte de la vidéo originale ne correspond pas.');
 return {path:scalingoLoginVideo.path,bytes:bytes.length,sha256};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(JSON.stringify(await verifyScalingoLoginVideo()));}catch(error){console.error(error.message);process.exitCode=1;}
}
