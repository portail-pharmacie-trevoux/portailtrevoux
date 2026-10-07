import {validateLaboratory} from './laboratories.mjs';

// Les données du Drive arrivent uniquement dans une variable privée Render.
export function parseLaboratoryImport(raw) {
 const batch=JSON.parse(raw);
 if(!batch||! /^[\w-]{1,100}$/.test(batch.batchId)||!Array.isArray(batch.laboratories)||!batch.laboratories.length||batch.laboratories.length>100)throw Error('Lot de laboratoires invalide.');
 const seen=new Set();
 const laboratories=batch.laboratories.map(item=>{
  // Une fiche source peut omettre son responsable : ne pas lui en inventer un.
  // La saisie manuelle normale conserve son contrôle de responsable obligatoire.
  const missingResponsible=item.orderMode==='pharmacie'&&item.responsibleId==null;
  const data=validateLaboratory(missingResponsible?{...item,orderMode:'groupement'}:item,(status,message)=>Error(message));
  if(missingResponsible)data.orderMode='pharmacie';
  const url=new URL(item.sourceUrl);
  if(url.protocol!=='https:'||url.hostname!=='docs.google.com'||! /^\/document\/d\/[\w-]+\/edit$/.test(url.pathname)||url.username||url.password)throw Error('Source Google Docs invalide.');
  const key=data.name.toLocaleLowerCase('fr');if(seen.has(key))throw Error('Laboratoire en double.');seen.add(key);
  return {...data,sourceUrl:url.href};
 });
 return {batchId:batch.batchId,laboratories};
}

export async function importLaboratories(db,raw) {
 if(!raw)return;
 const batch=parseLaboratoryImport(raw),client=await db.connect();
 try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('laboratory-import'))");
  const key='laboratory-import:'+batch.batchId;
  const marker=await client.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING RETURNING key',[key,'pending']);
  if(!marker.rows.length){await client.query('COMMIT');return;}
  let added=0,completed=0;
  for(const item of batch.laboratories){
   if(item.responsibleId&&!(await client.query('SELECT id FROM users WHERE id=$1 AND active=TRUE',[item.responsibleId])).rows.length)throw Error('Responsable inactif.');
   const matches=(await client.query('SELECT id,details FROM laboratories WHERE lower(trim(name))=lower(trim($1)) FOR UPDATE',[item.name])).rows;
   if(matches.length>1)throw Error('Plusieurs fiches correspondent au laboratoire.');
   const source='Source Google Drive : '+item.sourceUrl;
   const details={...item.details,notes:[item.details.notes,source].filter(Boolean).join('\n\n')};
   if(matches.length){
    const current=matches[0],merged={...current.details};
    for(const [field,value] of Object.entries(details))if(field!=='notes'&&!merged[field]&&value)merged[field]=value;
    if(!merged.notes?.includes(item.sourceUrl))merged.notes=[merged.notes,details.notes].filter(Boolean).join('\n\n');
    await client.query('UPDATE laboratories SET details=$2::jsonb,revision=revision+1,updated_at=now() WHERE id=$1',[current.id,JSON.stringify(merged)]);completed++;
   }else{
    await client.query('INSERT INTO laboratories(name,order_mode,responsible_id,details) VALUES($1,$2,$3,$4::jsonb)',[item.name,item.orderMode,item.responsibleId,JSON.stringify(details)]);added++;
   }
  }
  await client.query('UPDATE settings SET value=$2 WHERE key=$1',[key,JSON.stringify({added,completed,total:batch.laboratories.length})]);
  await client.query('INSERT INTO publications(universe,title,source_key) VALUES($1,$2,$3) ON CONFLICT(source_key) DO NOTHING',['Laboratoires',batch.laboratories.length+' fiches intégrées depuis Google Drive',key]);
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

export function parseLaboratoryLogos(raw) {
 const batch=JSON.parse(raw);
 if(!batch||typeof batch.batchId!=='string'||! /^[\w-]{1,100}$/.test(batch.batchId)||!Array.isArray(batch.logos)||!batch.logos.length||batch.logos.length>100)throw Error('Lot de logos invalide.');
 const seen=new Set();
 const logos=batch.logos.map(item=>{
  if(!Number.isSafeInteger(item.id)||item.id<1||seen.has(item.id)||typeof item.name!=='string'||!item.name.trim()||item.name.length>160||typeof item.fileData!=='string'||item.fileData.length>2800000||! /^[A-Za-z0-9+/]+={0,2}$/.test(item.fileData))throw Error('Logo invalide.');
  seen.add(item.id);const bytes=Buffer.from(item.fileData,'base64');
  if(bytes.length>2*1024*1024||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Logo PNG attendu.');
  return {id:item.id,name:item.name.trim(),bytes};
 });return {batchId:batch.batchId,logos};
}

export async function importLaboratoryLogos(db,raw) {
 if(!raw)return;
 const batch=parseLaboratoryLogos(raw),client=await db.connect();
 try{
  await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtext('laboratory-logo-import'))");
  const key='laboratory-logo-import:'+batch.batchId;
  const marker=await client.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING RETURNING key',[key,'pending']);
  if(!marker.rows.length){await client.query('COMMIT');return;}
  let added=0;
  for(const item of batch.logos){
   const match=await client.query('SELECT id FROM laboratories WHERE id=$1 AND name=$2',[item.id,item.name]);
   if(!match.rows.length)throw Error('Fiche fournisseur introuvable.');
   const result=await client.query("UPDATE laboratories SET logo_content=$3,logo_type='image/png',logo_version=logo_version+1,revision=revision+1,updated_at=now() WHERE id=$1 AND name=$2 AND logo_content IS NULL RETURNING id",[item.id,item.name,item.bytes]);
   added+=result.rows.length;
  }
  await client.query('UPDATE settings SET value=$2 WHERE key=$1',[key,JSON.stringify({added,total:batch.logos.length})]);
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
