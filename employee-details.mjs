import { employeeFields } from './public/employee-fields.js';
import { encrypt, decrypt } from './security.mjs';
export function validateEmployeeDetails(value,fail) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw fail(400,'Fiche administrative invalide.');
  const known=new Map(employeeFields.map(f=>[f.key,f])),clean={};
  for(const [key,raw] of Object.entries(value)){
    const f=known.get(key);if(!f)throw fail(400,'Champ non prévu dans la fiche.');
    if(f.type==='checkbox'){if(typeof raw!=='boolean')throw fail(400,f.label+' : valeur invalide.');clean[key]=raw;continue;}
    if(typeof raw!=='string'||raw.length>(f.maxLength||300))throw fail(400,f.label+' : valeur invalide.');
    const v=raw.trim();if(!v){clean[key]='';continue;}
    if(f.type==='select'&&!f.options.includes(v))throw fail(400,f.label+' : choix invalide.');
    if(f.type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v||v<'1900-01-01'||v>'2200-12-31'))throw fail(400,f.label+' : date invalide.');
    if(f.type==='number'&&(!/^\d+(?:[.,]\d{1,4})?$/.test(v)||!Number.isFinite(Number(v.replace(',','.')))||Number(v.replace(',','.'))>f.max))throw fail(400,f.label+' : nombre invalide.');
    if(f.type==='email'&&!/^\S+@\S+\.\S+$/.test(v))throw fail(400,f.label+' : adresse invalide.');
    if(f.type==='tel'&&!/^[+\d().\s-]{7,30}$/.test(v))throw fail(400,f.label+' : numéro invalide.');
    if(key==='socialSecurityNumber'&&!/^(?:[0-9AB]{13}|[0-9AB]{15})$/.test(v.replace(/\s/g,'').toUpperCase()))throw fail(400,'Le NIR doit contenir 13 caractères, ou 15 avec sa clé.');
    if(key==='socialSecurityKey'&&!/^\d{2}$/.test(v))throw fail(400,'La clé NIR doit comporter deux chiffres.');
    if(key==='iban'&&!/^[A-Z0-9]{15,34}$/.test(v.replace(/\s/g,'').toUpperCase()))throw fail(400,'Format IBAN invalide.');
    clean[key]=v;
  }
  if(clean.contractStart&&clean.contractEnd&&clean.contractEnd<clean.contractStart)throw fail(400,'La fin du contrat doit suivre sa date de début.');
  return clean;
}
export async function readEmployeeDetails(db,id,secret) {
  const row=(await db.query('SELECT payload,revision,updated_at FROM employee_details WHERE user_id=$1',[id])).rows[0];
  return row?{details:decrypt(row.payload,secret),detailsRevision:row.revision,updatedAt:row.updated_at}:{details:{},detailsRevision:0,updatedAt:null};
}
export async function saveEmployeeDetails(db,id,details,revision,secret,actor,fail) {
  if(!Number.isSafeInteger(revision)||revision<0)throw fail(400,'Version de fiche invalide.');
  const row=(await db.query('SELECT revision FROM employee_details WHERE user_id=$1',[id])).rows[0];
  if((row?.revision||0)!==revision)throw fail(409,'Cette fiche a été modifiée entre-temps. Rechargez-la avant de reprendre vos modifications.');
  await db.query(`INSERT INTO employee_details(user_id,payload,revision,updated_by) VALUES($1,$2,1,$3)
    ON CONFLICT(user_id) DO UPDATE SET payload=EXCLUDED.payload,revision=employee_details.revision+1,updated_by=EXCLUDED.updated_by,updated_at=now()`,[id,encrypt(details,secret),actor]);
}
