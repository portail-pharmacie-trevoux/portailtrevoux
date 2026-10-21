import {createHash} from 'node:crypto';
import {validateProcedureFile,isProcedureWorkbook,maxProcedureFileBytes} from './procedure-files.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
export function parseProcedureFileMigration(raw){
 const batch=JSON.parse(raw);if(!Array.isArray(batch.documents)||!batch.documents.length||batch.documents.length>200)throw Error('Lot de procédures invalide.');const seen=new Set();
 return batch.documents.map(d=>{if(!Number.isSafeInteger(d.id)||d.id<1||seen.has(d.id)||typeof d.sourceUrl!=='string'||typeof d.fileName!=='string'||d.fileName.length>240||/[\x00-\x1f/\\]/.test(d.fileName)||! /\.(pdf|docx|xlsx)$/i.test(d.fileName)||! /^[a-f0-9]{64}$/.test(d.sha256)||!Number.isSafeInteger(d.size)||d.size<1||d.size>maxProcedureFileBytes)throw Error('Document d’import invalide.');const source=new URL(d.sourceUrl),download=new URL(d.downloadUrl);if(source.protocol!=='https:'||!['drive.google.com','docs.google.com'].includes(source.hostname)||source.username||source.password||download.protocol!=='https:'||!/^sdmntpr[a-z0-9-]*\.oaiusercontent\.com$/.test(download.hostname)||download.username||download.password)throw Error('Source d’import refusée.');seen.add(d.id);return d;});
}
export function validateMigratedProcedure(d,bytes){
 if(bytes.length!==d.size||createHash('sha256').update(bytes).digest('hex')!==d.sha256)throw Error('Intégrité du fichier non confirmée.');
 if(/\.xlsx$/i.test(d.fileName)){if(!isProcedureWorkbook(bytes))throw Error('Tableur invalide.');return{fileName:d.fileName,fileType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',bytes};}
 return validateProcedureFile({fileName:d.fileName,fileData:bytes.toString('base64')},fail);
}
export async function migrateProcedureFiles(db,raw,{fetchImpl=fetch}={}){
 if(!raw)return{imported:0,skipped:0,failed:[]};const docs=parseProcedureFileMigration(raw),result={imported:0,skipped:0,failed:[]};
 for(const d of docs){
  const row=(await db.query('SELECT id FROM procedure_documents WHERE id=$1 AND active=TRUE AND file_content IS NULL AND url=$2',[d.id,d.sourceUrl])).rows[0];if(!row){result.skipped++;continue;}
  try{const response=await fetchImpl(d.downloadUrl,{redirect:'error',signal:AbortSignal.timeout(30000)});if(!response.ok||Number(response.headers?.get('content-length'))>maxProcedureFileBytes)throw Error('Téléchargement indisponible.');let bytes;if(response.body?.getReader){const reader=response.body.getReader(),chunks=[];let size=0;try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>maxProcedureFileBytes)throw Error('Fichier trop volumineux.');chunks.push(Buffer.from(part.value));}}finally{await reader.cancel().catch(()=>{});}bytes=Buffer.concat(chunks);}else bytes=Buffer.from(await response.arrayBuffer());const file=validateMigratedProcedure(d,bytes);
   const saved=(await db.query("UPDATE procedure_documents SET source_url=url,source_imported_at=now(),url='/api/procedures/'||id||'/file',file_name=$3,file_type=$4,file_content=$5 WHERE id=$1 AND url=$2 AND active=TRUE AND file_content IS NULL RETURNING id",[d.id,d.sourceUrl,file.fileName,file.fileType,file.bytes])).rows[0];if(saved)result.imported++;else result.skipped++;
  }catch{result.failed.push(d.id);}
 }
 return result;
}
