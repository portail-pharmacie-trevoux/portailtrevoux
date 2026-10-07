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
