import fs from 'node:fs';
import {deflateRawSync} from 'node:zlib';
const template=JSON.parse(fs.readFileSync(new URL('./order-export-template.json',import.meta.url),'utf8'));
const xml=value=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const serial=date=>date?Math.round((Date.parse(date+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000):'';
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
// Fill the workbook designed with artifact-tool; ZIP stays entirely in memory.
function zip(entries){const chunks=[],directory=[];let offset=0;for(const [path,text] of Object.entries(entries)){const name=Buffer.from(path),data=Buffer.from(text),compressed=deflateRawSync(data),checksum=crc(data),header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt32LE(checksum,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(name.length,26);const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);header.copy(central,6,4,30);central.writeUInt32LE(offset,42);directory.push(central,name);chunks.push(header,name,compressed);offset+=header.length+name.length+compressed.length;}const dir=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(entries).length,8);end.writeUInt16LE(Object.keys(entries).length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...chunks,dir,end]);}
export function exportOrderWorkbook(rows,today){
 if(rows.length>1048575)throw Error('Trop de lignes pour un fichier Excel.');
 const source=template['xl/worksheets/sheet1.xml'],header=source.match(/<x:row r="1"[\s\S]*?<\/x:row>/)[0];
 const limit=new Date(today+'T12:00:00Z');limit.setUTCDate(limit.getUTCDate()+7);const last=limit.toISOString().slice(0,10);
 const content=rows.map((r,index)=>{const n=index+2,values=[r.suspended?'Suspendue':r.nextOrder&&r.nextOrder>=today&&r.nextOrder<=last?'À commander sous 7 jours':'',r.confirmation?'Oui':'Non',serial(r.confirmation?.date),r.confirmation?.initials||'',r.delivery?'Oui':'Non',serial(r.delivery?.date),r.delivery?.initials||'',r.frequency??'',serial(r.nextOrder),r.lastName,r.firstName,r.treatment,r.mode,r.comments];
 return '<x:row r="'+n+'" ht="36" customHeight="1">'+values.map((value,c)=>{const ref=String.fromCharCode(65+c)+n,date=[2,5,8].includes(c),style=date?6:5;if(c===8&&r.delivery)return '<x:c r="'+ref+'" s="6"'+(value===''?' t="str"':'')+'><x:f>'+xml('IF(AND(F'+n+'<>"",H'+n+'<>""),F'+n+'+H'+n+',"")')+'</x:f><x:v>'+value+'</x:v></x:c>';return '<x:c r="'+ref+'" s="'+style+'"'+(typeof value==='number'?' t="n"><x:v>'+value+'</x:v>':' t="inlineStr"><x:is><x:t xml:space="preserve">'+xml(value)+'</x:t></x:is>')+'</x:c>';}).join('')+'</x:row>';}).join('');
 const sheet=source.replace(/<x:sheetData>[\s\S]*?<\/x:sheetData>/,'<x:sheetData>'+header+content+'</x:sheetData><x:autoFilter ref="A1:N'+(rows.length+1)+'"/>');
 return zip({...template,'xl/worksheets/sheet1.xml':sheet});
}
