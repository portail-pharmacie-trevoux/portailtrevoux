export const maxProcedureFileBytes=10*1024*1024;
const docxType='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
function isDocx(bytes){
  // Inspect the ZIP central directory without inflating untrusted content.
  if(bytes.length<22||bytes.readUInt32LE(0)!==0x04034b50)return false;
  let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
    if(bytes.readUInt32LE(i)===0x06054b50&&i+22+bytes.readUInt16LE(i+20)===bytes.length){end=i;break;}
  }
  if(end<0||bytes.readUInt16LE(end+4)!==0||bytes.readUInt16LE(end+6)!==0)return false;
  const count=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12),offset=bytes.readUInt32LE(end+16);
  if(!count||count>10000||offset+size!==end||bytes.readUInt16LE(end+8)!==count)return false;
  const names=new Set();let position=offset;
  for(let i=0;i<count;i++){
    if(position+46>end||bytes.readUInt32LE(position)!==0x02014b50)return false;
    const flags=bytes.readUInt16LE(position+8),nameLength=bytes.readUInt16LE(position+28),extra=bytes.readUInt16LE(position+30),comment=bytes.readUInt16LE(position+32);
    const next=position+46+nameLength+extra+comment;
    if(next>end||(flags&1))return false;
    const name=bytes.subarray(position+46,position+46+nameLength).toString('utf8');
    if(name.includes('..')||name.startsWith('/')||name.includes('\\')||/vbaProject\.bin$/i.test(name))return false;
    const local=bytes.readUInt32LE(position+42),compressed=bytes.readUInt32LE(position+20);
    if(local+30>offset||bytes.readUInt32LE(local)!==0x04034b50)return false;
    const localNameLength=bytes.readUInt16LE(local+26),localExtra=bytes.readUInt16LE(local+28);
    if(local+30+localNameLength+localExtra+compressed>offset)return false;
    if(bytes.subarray(local+30,local+30+localNameLength).toString('utf8')!==name)return false;
    if(names.has(name))return false;
    names.add(name);position=next;
  }
  return position===end&&names.has('[Content_Types].xml')&&names.has('word/document.xml');
}
export function validateProcedureFile(body,fail){
  const name=body?.fileName,data=body?.fileData;
  if(typeof name!=='string'||name.length>240||/[\x00-\x1f\x7f/\\]/.test(name)||!name.trim())throw fail(400,'Nom de fichier invalide.');
  const fileName=name.trim(),extension=fileName.toLowerCase().match(/\.(pdf|docx)$/)?.[1];
  if(!extension)throw fail(400,'Choisissez un document PDF ou Word (.docx).');
  if(typeof data!=='string'||!data||data.length>Math.ceil(maxProcedureFileBytes/3)*4)throw fail(413,'Le fichier dépasse la limite de 10 Mo ou est vide.');
  if(!/^[A-Za-z0-9+/]*={0,2}$/.test(data)||data.length%4!==0)throw fail(400,'Le fichier n’a pas pu être lu.');
  const bytes=Buffer.from(data,'base64');
  if(!bytes.length||bytes.length>maxProcedureFileBytes)throw fail(413,'Le fichier dépasse la limite de 10 Mo ou est vide.');
  if(bytes.toString('base64')!==data)throw fail(400,'Le fichier n’a pas pu être lu.');
  const valid=extension==='pdf'?bytes.subarray(0,5).toString('ascii')==='%PDF-'&&bytes.subarray(Math.max(0,bytes.length-2048)).includes(Buffer.from('%%EOF')):isDocx(bytes);
  if(!valid)throw fail(400,'Le contenu ne correspond pas à un document '+(extension==='pdf'?'PDF':'Word (.docx)')+' valide.');
  return {fileName,fileType:extension==='pdf'?'application/pdf':docxType,bytes};
}
