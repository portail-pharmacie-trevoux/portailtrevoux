// Pure offline metadata reconciliation. No DB connections or credential input.
import {normalizeName} from '../collaborateurs.mjs';
const allowed=new Set(['id','email','firstName','lastName','name','role','active','directoryKey','rights','editRights','permissionsConfigured','mustChange','passwordPresent','passwordFormatValid']);
const normalizedEmail=value=>typeof value==='string'?value.trim().toLowerCase():'';
function validate(rows){
 if(!Array.isArray(rows))throw Error('Inventaire invalide.');const ids=new Set();
 for(const row of rows){if(!row||Object.keys(row).some(k=>!allowed.has(k))||!Number.isSafeInteger(row.id)||row.id<1||ids.has(row.id)||![null,undefined].includes(row.email)&&typeof row.email!=='string')throw Error('Inventaire invalide ou champ non autorisé. Aucun secret accepté.');ids.add(row.id);}
}
const identity=row=>normalizeName(row.firstName&&row.lastName?row.firstName+' '+row.lastName:row.name);
const collisions=rows=>{const byEmail=new Map();for(const row of rows){const key=normalizedEmail(row.email);if(key)byEmail.set(key,[...(byEmail.get(key)||[]),row.id]);}return new Map([...byEmail].filter(([,ids])=>ids.length>1));};
export function reconcileCollaborators({source,target,scopeTargetIds,reviewedPairs=[]}){
 validate(source);validate(target);
 if(!Array.isArray(scopeTargetIds)||scopeTargetIds.length!==16||new Set(scopeTargetIds).size!==16||scopeTargetIds.some(id=>!target.some(t=>t.id===id&&t.role==='employee')))throw Error('Périmètre des 16 fiches à vérifier avant rapprochement.');
 if(!Array.isArray(reviewedPairs)||reviewedPairs.some(p=>!p||!scopeTargetIds.includes(p.targetId)||!source.some(s=>s.id===p.sourceId)||typeof p.reviewReference!=='string'||!p.reviewReference.trim())||new Set(reviewedPairs.map(p=>p.targetId)).size!==reviewedPairs.length)throw Error('Correspondances revues invalides.');
 const sourceDuplicates=collisions(source),targetDuplicates=collisions(target);
 const rows=scopeTargetIds.map(targetId=>{
  const t=target.find(p=>p.id===targetId),email=normalizedEmail(t.email),pair=reviewedPairs.find(p=>p.targetId===targetId);
  const candidates=email?source.filter(s=>normalizedEmail(s.email)===email):[];
  let s=pair?source.find(s=>s.id===pair.sourceId):candidates.length===1?candidates[0]:null,status='UNMATCHED',reason='Aucune correspondance confirmée.';
  if(email&&(sourceDuplicates.has(email)||targetDuplicates.has(email))){status='CONFLICT';reason='Adresse partagée par plusieurs comptes.';}
  else if(s){
   if(s.role!=='employee'||sourceDuplicates.has(normalizedEmail(s.email))||target.some(other=>other.id!==t.id&&normalizedEmail(other.email)&&normalizedEmail(other.email)===normalizedEmail(s.email))||candidates.length===1&&pair&&candidates[0].id!==pair.sourceId){status='CONFLICT';reason='Rôle ou correspondance stable incompatible.';}
   else if(t.email&&s.email!==t.email){status='REVIEW_REQUIRED';reason='Adresse différente ; conservation exacte source à valider.';}
   else if(!pair&&identity(s)!==identity(t)){status='REVIEW_REQUIRED';reason='Identité différente malgré adresse correspondante.';}
   else if(!normalizedEmail(s.email)||s.passwordPresent!==true||s.passwordFormatValid!==true||s.active!==true){status='REVIEW_REQUIRED';reason='Accès source non confirmé actif et compatible.';}
   else{status=pair?'REVIEWED_PAIR':'EMAIL_CANDIDATE';reason=pair?'Correspondance individuelle revue ; aperçu à approuver.':'Adresse exacte unique ; correspondance proposée, non appliquée.';}
  }else if(identity(t)&&source.some(p=>identity(p)===identity(t))){status='REVIEW_REQUIRED';reason='Nom correspondant seulement : identifiants stables à faire confirmer.';}
  return {sourceId:s?.id??null,targetId,sourceEmail:s?.email??null,targetEmail:t.email??null,status,reason};
 });
 const usage=new Map();for(const row of rows)if(row.sourceId!==null)usage.set(row.sourceId,[...(usage.get(row.sourceId)||[]),row]);
 for(const group of usage.values())if(group.length>1)for(const row of group){row.status='CONFLICT';row.reason='Un compte source correspond à plusieurs fiches cible.';}
 return {rows,sourceDuplicateGroups:sourceDuplicates.size,targetDuplicateGroups:targetDuplicates.size,unresolved:rows.filter(r=>!['REVIEWED_PAIR','EMAIL_CANDIDATE'].includes(r.status)).length,requiresHumanApproval:true,eligibleForDataWrite:false,remoteWrites:0};
}
