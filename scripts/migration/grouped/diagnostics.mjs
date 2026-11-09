import {tables,key,hash} from './model.mjs';
export function previousAttempt(target){
 const ledger=target.ledger;
 if(!ledger)return {state:'NO_COMMIT_RECEIPT',commitRecorded:false,rollbackProven:false,executionAllowed:false,explanation:'No atomic batch receipt found. This is not proof of rollback; inspect read-only before any execution.'};
 const missing=[],changed=[];let verified=0;
 for(const [table,entries]of Object.entries(ledger.rows||{})){
  if(!tables[table])continue;
  for(const entry of Object.values(entries)){const row=target.tables[table].find(r=>key(table,r)===entry.targetKey);if(!row)missing.push({table,targetKey:entry.targetKey});else if(hash(row)!==entry.targetHash)changed.push({table,targetKey:entry.targetKey});else verified++;}
 }
 return {state:missing.length||changed.length?'COMMIT_RECORDED_WITH_LATER_DIFFERENCES':'COMMIT_RECORDED_ROWS_VERIFIED',commitRecorded:true,executionAllowed:false,verified,missing,changed,ledgerDigest:hash(ledger)};
}
// Metadata-only identity check. No password, session or MFA fields are read or written.
export function verifyAccountCorrespondence(sourceUsers,targetUsers,sourceId){
 const source=sourceUsers.find(u=>u.id===sourceId);if(!source)return {sourceId,status:'SOURCE_USER_ABSENT',targetId:null};
 const normalize=v=>String(v||'').normalize('NFC').trim().toLocaleLowerCase('fr'),full=u=>normalize(u.first_name)+'\0'+normalize(u.last_name);
 const matches=targetUsers.filter(u=>u.id!==1&&source.first_name&&source.last_name&&full(u)===full(source));
 if(matches.length!==1)return {sourceId,status:matches.length?'AMBIGUOUS_IDENTITY':'NO_TARGET_IDENTITY',targetId:null,candidateIds:matches.map(u=>u.id)};
 const target=matches[0],emailMatches=!!source.email&&normalize(source.email)===normalize(target.email),roleMatches=source.role===target.role;
 return {sourceId,targetId:target.id,status:!source.email?'SOURCE_EMAIL_NOT_AVAILABLE':!emailMatches?'EMAIL_DIFFERS_REVIEW_REQUIRED':!roleMatches?'ROLE_DIFFERS_REVIEW_REQUIRED':'VERIFIED_CORRESPONDENCE',identityMatches:true,emailMatches,roleMatches,sourceActive:source.active,targetActive:target.active};
}
export function identityDiagnostics(source,target,plan){
 const counts=new Map();
 const add=(v,table)=>{if(v==null)return;const id=Number(v);if(!Number.isSafeInteger(id)||id<1)return;if(!counts.has(id))counts.set(id,{});const by=counts.get(id);by[table]=(by[table]||0)+1;};
 function json(v,table){if(Array.isArray(v)){v.forEach(x=>json(x,table));return;}if(!v||typeof v!=='object')return;for(const [k,x]of Object.entries(v)){const match=k.match(/^(\d+):(?:\d{4}-\d{2}-\d{2}|[0-6])$/);if(match)add(match[1],table);if(['userId','by'].includes(k))add(x,table);if(k==='userIds'&&Array.isArray(x))x.forEach(id=>add(id,table));json(x,table);}}
 for(const [table,rows]of Object.entries(source.tables))for(const row of rows){for(const f of ['sender_id','user_id','reviewed_by','cancelled_by','actor_id','created_by','updated_by'])if(Object.hasOwn(row,f))add(row[f],table);for(const f of ['draft','published','locked_days','content','draft_before','draft_after','published_before','published_after','config','before_value','after_value'])if(Object.hasOwn(row,f))json(row[f],table);}
 return [...counts].filter(([id])=>plan.maps.users[id]===undefined||[14,15].includes(id)).map(([id,references])=>{
  const user=source.users.find(u=>u.id===id);
  const candidates=user?target.users.filter(t=>(user.directory_key&&t.directory_key===user.directory_key)||(user.email&&t.email===user.email)||(user.first_name&&user.last_name&&t.first_name===user.first_name&&t.last_name===user.last_name)):[];
  const state=plan.maps.users[id]!==undefined?'MATCHED':user?'SOURCE_USER_EXISTS_TARGET_UNRESOLVED':'SOURCE_USER_ABSENT_ORPHAN_REFERENCES';
  return {sourceId:id,state,accountCorrespondence:verifyAccountCorrespondence(source.users,target.users,id),sourcePresent:!!user,sourceActive:user?.active??null,sourceRole:user?.role??null,sourceIdentity:user?{firstName:user.first_name,lastName:user.last_name}:null,targetCandidates:candidates.map(t=>({id:t.id,role:t.role,active:t.active})),references,decision:state==='MATCHED'?null:user?'Activate/confirm the same real identity on Scalingo; do not create or reassign automatically.':'Find reliable historical identity evidence; never infer a person from the numeric ID.'};
 });
}
export function publicationDiagnostics(source,target,plan){
 const ids=[...new Set([282,284,285,288,289,295,...plan.publicationConflicts.map(c=>Number(c.sourceId))])];
 return ids.map(sourceId=>{const row=source.tables.publications.find(p=>Number(p.id)===sourceId),conflict=plan.publicationConflicts.find(c=>Number(c.sourceId)===sourceId),mapped=plan.maps.publications[sourceId],old=conflict?target.tables.publications.find(p=>String(p.id)===String(conflict.targetId)):target.tables.publications.find(p=>String(p.id)===String(mapped));
  const differences=row&&old?['source_key','universe','title','created_at'].filter(k=>hash(row[k])!==hash(old[k])):[];
  return {sourceId,targetId:old?.id??null,sourcePresent:!!row,state:conflict?'CURRENT_SOURCE_KEY_COLLISION':!row?'SOURCE_PUBLICATION_NOT_PRESENT':old?'EXISTING_MAPPING':'NO_EXISTING_TARGET_MAPPING',differences,resolution:conflict?.resolution??(old?'tracked_or_equal':'no_current_collision'),source:row??null,target:old??null};
 });
}
export function issueSummary(issues){const categories={};for(const i of issues)categories[i.code]=(categories[i.code]||0)+1;return {total:issues.length,categories,unresolvedUserIds:[...new Set(issues.filter(i=>i.type==='users'||i.code==='VALIDATED_STAFF_MAPPING_NOT_CONFIRMED').map(i=>Number(i.sourceId)))].sort((a,b)=>a-b)};}
