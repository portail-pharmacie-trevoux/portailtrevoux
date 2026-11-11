import {Worker} from 'node:worker_threads';
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
let activePDFReads=0;
export async function readTrainingPDF(bytes){
 if(activePDFReads>=2)throw Error('Lecture locale occupée.');activePDFReads++;
 try{return await new Promise((resolve,reject)=>{const worker=new Worker(new URL('./training-pdf-worker.mjs',import.meta.url),{workerData:bytes,resourceLimits:{maxOldGenerationSizeMb:96}}),timer=setTimeout(()=>{worker.terminate();reject(Error('Lecture trop longue.'));},30000);let done=false;
  const finish=(error,text)=>{if(done)return;done=true;clearTimeout(timer);worker.terminate();error?reject(error):resolve(text);};
  worker.once('message',r=>finish(r.error?Error('PDF illisible.'):null,r.text));worker.once('error',e=>finish(e));worker.once('exit',code=>{if(!done)finish(Error('Lecture interrompue.'));});
 });}finally{activePDFReads--;}
}
const frenchMonths=['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre'];
const datePattern='(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/.\\-]\\d{1,2}[/.\\-]\\d{4}|\\d{1,2}(?:er)?\\s+(?:janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\\s+\\d{4})';
export function normalizeTrainingDate(value){
 if(!value)return '';const v=fold(value).trim();let match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v),date;
 if(match)date=v;else if((match=/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(v)))date=match[3]+'-'+match[2].padStart(2,'0')+'-'+match[1].padStart(2,'0');
 else if((match=/^(\d{1,2})(?:er)?\s+(\w+)\s+(\d{4})$/.exec(v))){const m=frenchMonths.indexOf(match[2]);if(m>=0)date=match[3]+'-'+String(m+1).padStart(2,'0')+'-'+match[1].padStart(2,'0');}
 return date&&Number.isFinite(Date.parse(date+'T12:00:00Z'))&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date?date:'';
}
export function parseTrainingText(raw,expectedName=''){
 const text=String(raw||'').replace(/[ \t]+/g,' ').replace(/\n[ \t]+/g,'\n'),flat=text.replace(/\s+/g,' '),notes=[];
 const attestation=/(attestation|certificat)/i.test(text)&&/(formation|DPC|participation|pr[eé]sence|r[eé]alisation)/i.test(text);
 const isAttestation=text.trim().length<40?null:attestation&&!/attestation d['’]inscription/i.test(text);
 const label=/(?:b[eé]n[eé]ficiaire|nom(?: et pr[eé]nom)?|participant(?:e)?|apprenant(?:e)?)\s*:\s*([^\n]+)/i.exec(text);
 const ownTokens=fold(expectedName).split(/[^a-z]+/).filter(v=>v.length>1),body=fold(flat).replace(/[^a-z]+/g,' ');
 const name=label?.[1]?.trim().slice(0,200)||(ownTokens.length&&ownTokens.every(token=>(' '+body+' ').includes(' '+token+' '))?expectedName:'');
 let title=/(?:intitul[eé] de (?:la )?formation|formation suivie|th[èe]me|formation intitul[eé]e?|intitul[eé])\s*[:\-]?\s*\n?([^\n]+)/i.exec(text)?.[1]||/[«“"]([^»”"\n]{4,150})[»”"]/u.exec(text)?.[1]||/(?:a suivi (?:avec succ[èe]s )?(?:la |une )?formation|formation portant sur|formation\s*:)\s*[:\-]?\s*([^\n]+)/i.exec(text)?.[1]||'';
 title=title.replace(/^[«“"\s]+|[»”"\s]+$/g,'').trim().slice(0,150);if(/^(?:continue|professionnelle|DPC|r[eé]alis[eé]e|suivie)$/i.test(title))title='';
 const labelled=new RegExp('(?:date de fin(?: de (?:la )?formation)?|fin de (?:la )?formation|termin[eé]e le|achev[eé]e le)\\s*[:\\-]?\\s*('+datePattern+')','i').exec(flat);
 const range=new RegExp('du\\s+'+datePattern+'\\s+(?:au|[àa])\\s+('+datePattern+')','i').exec(flat);
 const session=new RegExp('(?:formation|session)[^\\n]{0,120}?\\s+le\\s+('+datePattern+')','i').exec(text);
 const date=normalizeTrainingDate(labelled?.[1]||range?.[1]||session?.[1]),kind=/(?:attestation|certificat)\s+(?:individuell?e?\s+)?(?:de\s+)?(?:DPC|d[eé]veloppement professionnel continu)/i.test(flat)?'DPC':attestation?'Classique':'';
 if(!text.trim())notes.push('Aucun texte exploitable dans ce PDF : il peut s’agir d’un scan. Renseignez les informations à partir du document.');
 if(!title)notes.push('Intitulé non identifié : renseignez le nom exact de la formation.');
 if(!date)notes.push('Date de fin de formation non identifiée : ne la remplacez pas par la date d’édition ou de signature.');
 return {isAttestation,name,title,date,kind,uncertain:!name||!title||!date||!kind,notes};
}
