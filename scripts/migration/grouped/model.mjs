// Pure migration transformations. Never import application startup or handlers.
import {createHash} from 'node:crypto';
export const tables={
 schedule_posts:['id','name','color','active','revision','updated_at'],
 schedule_templates:['id','name','content','revision','updated_at'],
 leave_requests:['id','user_id','leave_type','start_date','end_date','start_part','end_part','comment','status','revision','review_note','reviewed_by','created_at','reviewed_at','planning_applied','cancelled_by','cancelled_at'],
 schedule_weeks:['week','draft','published','revision','published_revision','published_at','locked_days'],
 leave_schedule_changes:['request_id','day','week','draft_before','draft_after','published_before','published_after'],
 team_messages:['id','sender_id','sender_name','text','created_at','priority','attachment_name','attachment_type','attachment_content','can_archive','planning_week','reply_to_id','is_reply','challenge_digest','order_digest','expires_on','thread_id','merchandising_month','title','reminder_kind','automation_text'],
 team_message_recipients:['message_id','user_id','seen','archived','seen_at'],
 message_automations:['id','kind','name','enabled','config','revision','activation_at','created_by','updated_by','created_at','updated_at','deleted_at'],
 message_automation_runs:['id','automation_id','occurrence','status','recipient_count','message_count','error','completed_at'],
 message_automation_changes:['id','automation_id','actor_id','action','before_value','after_value','created_at'],
 publications:['id','universe','title','source_key','created_at'],
 publication_reads:['user_id','universe','last_id']
};
export const pk={schedule_posts:['id'],schedule_templates:['id'],leave_requests:['id'],schedule_weeks:['week'],leave_schedule_changes:['request_id','day'],team_messages:['id'],team_message_recipients:['message_id','user_id'],message_automations:['id'],message_automation_runs:['id'],message_automation_changes:['id'],publications:['id'],publication_reads:['user_id','universe']};
export const ledgerKey='migration:render:communication-planning:v1';
export const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
export const hash=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:canonical(v)).digest('hex');
export const fail=(code,details={})=>Object.assign(Error(code),{code,details});
export const key=(table,row)=>canonical(pk[table].map(k=>String(row[k])));
const id=n=>{const v=Number(n);if(!Number.isSafeInteger(v)||v<1||v>2147483647)throw fail('UNSUPPORTED_ID_RANGE');return v;};
const identity=u=>[u.first_name,u.last_name].map(s=>String(s||'').normalize('NFC').trim().toLocaleLowerCase('fr')).join('\0');
const fixed=[[3,7],[2,8],[16,9],[17,10],[4,11],[12,12],[13,13],[10,14],[6,15],[8,16],[5,17],[21,18],[9,19],[11,20],[7,21],[20,22],[1,59]];
export function userMapping(source,target){
 const map=new Map(),issues=[],claimed=new Set();
 for(const u of source){
  const approved=fixed.find(p=>p[0]===u.id);let matches;
  if(approved){const t=target.find(t=>t.id===approved[1]);matches=t&&u.first_name&&u.last_name&&identity(u)===identity(t)&&source.filter(x=>identity(x)===identity(u)).length===1&&target.filter(x=>identity(x)===identity(u)).length===1?[t]:[];}
  else{
   const exact=target.filter(t=>t.id!==1&&identity(t)===identity(u)&&u.first_name&&u.last_name);
   const signals=[u.email?target.filter(t=>t.id!==1&&t.email===u.email):[],u.directory_key?target.filter(t=>t.id!==1&&t.directory_key===u.directory_key):[]].filter(a=>a.length);
   matches=exact.length===1&&signals.every(a=>a.length===1&&a[0].id===exact[0].id)?exact:[];
  }
  if(matches.length===1&&matches[0].role===u.role&&!claimed.has(matches[0].id)){map.set(u.id,matches[0].id);claimed.add(matches[0].id);}else issues.push({code:'UNMATCHED_OR_AMBIGUOUS_USER',sourceId:u.id});
 }
 return {map,issues};
}
export function makePlan(source,target){
 const issues=[],warnings=[],u=userMapping(source.users,target.users),maps={users:Object.fromEntries(u.map)},previous=target.ledger||{version:1,rows:{},maps:{}};
 if(previous.version!==1)throw fail('UNSUPPORTED_LEDGER');
 for(const [sourceId]of fixed.filter(([sourceId])=>sourceId!==1))if(!u.map.has(sourceId))issues.push({code:'VALIDATED_STAFF_MAPPING_NOT_CONFIRMED',sourceId});
 for(const [sourceId,targetId]of u.map){const a=source.users.find(u=>u.id===sourceId),b=target.users.find(u=>u.id===targetId),fields=['job','schedule_position','active'].filter(k=>canonical(a[k])!==canonical(b[k]));if(fields.length)warnings.push({code:'PROFILE_DIFFERENCE_PRESERVED',sourceId,targetId,fields});}
 const use=(type,v)=>{if(v===null)return null;const result=maps[type]?.[v];if(result===undefined)throw fail('UNMAPPED_REFERENCE',{type,sourceId:v});return result;};
 const note=(e,table,row)=>issues.push({code:e.code||'INVALID_SOURCE_RECORD',table,sourceKey:key(table,row),...e.details});
 const records={},operations=[],nextLedger={version:1,rows:{},maps:{},sourceDigest:source.digest};
 const rows=t=>target.tables[t]||[];
 // Allocate all numeric keys before transforming any JSON or parent references.
 for(const table of Object.keys(tables).filter(t=>pk[t].length===1&&pk[t][0]==='id'&&t!=='message_automations')){
  maps[table]={...(previous.maps[table]||{})};let max=Math.max(0,...rows(table).map(r=>id(r.id)));
  if(table==='team_messages')max=Math.max(max,...rows(table).map(r=>Number(r.thread_id)||0),...Object.values(maps[table]).map(Number));
  const ids=new Set(source.tables[table].map(r=>id(r.id)));if(table==='team_messages')for(const r of source.tables[table])if(r.thread_id!==null)ids.add(id(r.thread_id));
  for(const sid of [...ids].sort((a,b)=>a-b)){if(maps[table][sid]===undefined){
   let exact=[];
   if(['schedule_posts','schedule_templates'].includes(table)){const row=source.tables[table].find(r=>r.id===sid);exact=rows(table).filter(r=>r.name===row.name);if(exact.length>1){issues.push({code:'AMBIGUOUS_NATURAL_KEY',table,sourceId:sid});continue;}if(exact.length===1){maps[table][sid]=id(exact[0].id);continue;}}
   if(table==='message_automation_runs'){const row=source.tables[table].find(r=>id(r.id)===sid);exact=rows(table).filter(r=>r.automation_id===row.automation_id&&r.occurrence===row.occurrence);if(exact.length===1){maps[table][sid]=id(exact[0].id);continue;}}
   if(table==='publications'){const row=source.tables[table].find(r=>id(r.id)===sid);if(row.source_key!==null)exact=rows(table).filter(r=>r.source_key===row.source_key);if(exact.length===1){maps[table][sid]=id(exact[0].id);continue;}}
   maps[table][sid]=++max;if(max>2147483647)throw fail('IDENTIFIERS_EXHAUSTED');
  }}
 }
 maps.message_automations=Object.fromEntries(source.tables.message_automations.map(r=>[r.id,r.id]));maps.services={};
 const service=(sid)=>{if(maps.services[sid]!==undefined)return maps.services[sid];const a=source.services.find(s=>s.id===sid);if(!a)throw fail('SOURCE_SERVICE_MISSING',{sourceId:sid});const who=a.collaborator_id===null?null:use('users',a.collaborator_id),matches=target.services.filter(s=>s.service===a.service&&s.collaborator_id===who);if(matches.length!==1)throw fail('UNMATCHED_SERVICE',{sourceId:sid});return maps.services[sid]=matches[0].id;};
 function config(v){if(v===null)return null;if(Array.isArray(v))return v.map(config);if(typeof v!=='object')return v;const out=Object.create(null);for(const [k,x]of Object.entries(v)){if(k==='userIds'){if(!Array.isArray(x))throw fail('INVALID_AUDIENCE');out[k]=x.map(n=>use('users',n));}else if(k==='serviceIds'){if(!Array.isArray(x))throw fail('INVALID_AUDIENCE');out[k]=x.map(service);}else out[k]=config(x);}return out;}
 function planning(v){if(v===null)return null;if(Array.isArray(v))return v.map(planning);if(typeof v!=='object')return v;const entries=[];for(const [k,x]of Object.entries(v)){const match=k.match(/^(\d+):((?:\d{4}-\d{2}-\d{2}|[0-6]))$/),name=match?use('users',match[1])+':'+match[2]:k;let value;if(['userId','by'].includes(k))value=use('users',x);else if(k==='postIds')value=x.map(n=>use('schedule_posts',n));else if(k==='leaveRequestId')value=use('leave_requests',x);else value=planning(x);entries.push([name,value]);}if(new Set(entries.map(([k])=>k)).size!==entries.length)throw fail('JSON_KEY_COLLISION');return Object.fromEntries(entries);}
 for(const [table,sourceRows]of Object.entries(source.tables)){
  if(table==='publication_reads')continue;
  records[table]=[];nextLedger.rows[table]={...(previous.rows[table]||{})};
  for(const raw of sourceRows){try{
   const r=structuredClone(raw);if(pk[table].length===1&&pk[table][0]==='id')r.id=typeof raw.id==='string'?String(use(table,raw.id)):use(table,raw.id);
   for(const f of ['sender_id','user_id','reviewed_by','cancelled_by','actor_id','created_by','updated_by'])if(Object.hasOwn(r,f))r[f]=use('users',r[f]);
   if(table==='team_messages'){r.reply_to_id=use('team_messages',r.reply_to_id);r.thread_id=use('team_messages',r.thread_id);}
   if(table==='team_message_recipients')r.message_id=use('team_messages',r.message_id);
   if(table==='leave_schedule_changes')r.request_id=use('leave_requests',r.request_id);
   if(Object.hasOwn(r,'automation_id'))r.automation_id=use('message_automations',r.automation_id);
   for(const f of ['draft','published','locked_days','content','draft_before','draft_after','published_before','published_after'])if(Object.hasOwn(r,f))r[f]=planning(r[f]);
   for(const f of ['config','before_value','after_value'])if(Object.hasOwn(r,f))r[f]=config(r[f]);
   if(table==='team_messages'&&typeof r.reminder_kind==='string'&&r.reminder_kind.startsWith('automation:')){const name=r.reminder_kind.slice(11);if(maps.message_automations[name]!==undefined)r.reminder_kind='automation:'+maps.message_automations[name];}
   records[table].push(r);
   const sk=key(table,raw),tk=key(table,r),old=rows(table).find(x=>key(table,x)===tk),tracked=previous.rows[table]?.[sk],sourceHash=hash(raw),targetHash=hash(r),currentHash=old?hash(old):null;
   let action='insert',owned=!old;
   if(!old&&['team_messages','publications','leave_requests','message_automation_changes'].includes(table)){
    const fields=table==='team_messages'?['sender_id','sender_name','text','title','created_at','attachment_name','attachment_type','attachment_content']:Object.keys(r).filter(k=>k!=='id');
    if(rows(table).some(x=>fields.every(k=>canonical(x[k])===canonical(r[k]))))throw fail('POSSIBLE_UNTRACKED_DUPLICATE');
   }
   if(tracked){owned=tracked.owned;if(!old)throw fail('IMPORTED_ROW_REMOVED');if(tracked.targetKey!==tk)throw fail('MAPPING_CHANGED');if(sourceHash===tracked.sourceHash){action='keep';if(currentHash!==tracked.targetHash)warnings.push({code:'LOCAL_CHANGE_PRESERVED',table,sourceKey:sk});}else if(currentHash===targetHash)action='keep';else if(owned&&currentHash===tracked.targetHash)action='update';else throw fail('SOURCE_TARGET_DIVERGED');}
   else if(old){if(currentHash!==targetHash)throw fail('EXISTING_TARGET_CONFLICT');action='keep';}
   // Do not rewrite the provenance baseline when preserving an independent local edit.
   const keepBaseline=tracked&&action==='keep'&&sourceHash===tracked.sourceHash&&currentHash!==tracked.targetHash;
   nextLedger.rows[table][sk]=keepBaseline?tracked:{sourceHash,targetHash,targetKey:tk,owned};
   operations.push({table,action,row:r,sourceKey:sk,targetKey:tk});
  }catch(e){note(e,table,raw);}}
 }
 // Single-watermark publication_reads must preserve old read/unread states too.
 records.publication_reads=[];nextLedger.rows.publication_reads={...(previous.rows.publication_reads||{})};
 for(const raw of source.tables.publication_reads){try{
  const user=use('users',raw.user_id),old=rows('publication_reads').find(x=>x.user_id===user&&x.universe===raw.universe),mapped=source.tables.publications.filter(p=>p.universe===raw.universe&&Number(p.id)<=Number(raw.last_id)).map(p=>Number(use('publications',p.id)));
  const importedRead=Math.max(0,...mapped),watermark=Math.max(Number(old?.last_id||0),importedRead);
  const existing=rows('publications').filter(p=>p.universe===raw.universe);
  const tracked=previous.rows.publication_reads?.[key('publication_reads',raw)];
  // Rows originating from this lot follow the source watermark, independent target rows keep theirs.
  const importedIds=new Set(Object.values(maps.publications).map(String));
  if(existing.some(p=>!importedIds.has(String(p.id))&&Number(p.id)>Number(old?.last_id||0)&&Number(p.id)<=watermark))throw fail('READ_WATERMARK_WOULD_MARK_LOCAL_UNREAD_AS_READ');
  for(const p of source.tables.publications.filter(p=>p.universe===raw.universe))if((Number(use('publications',p.id))<=watermark)!==(Number(p.id)<=Number(raw.last_id))){
   // A target user may have read additional imported items since the previous run.
   if(!tracked||Number(use('publications',p.id))>Number(old?.last_id||0))throw fail('READ_WATERMARK_CANNOT_REPRESENT_BOTH_HISTORIES');
  }
  const r={...raw,user_id:user,last_id:String(watermark)},action=old?Number(old.last_id)===watermark?'keep':'update':'insert';
  // Existing watermark may only advance if it preserves every prior read/unread state.
  operations.push({table:'publication_reads',action,row:r,sourceKey:key('publication_reads',raw),targetKey:key('publication_reads',r)});records.publication_reads.push(r);
  nextLedger.rows.publication_reads[key('publication_reads',raw)]={sourceHash:hash(raw),targetHash:hash(r),targetKey:key('publication_reads',r),owned:tracked?.owned??!old};
 }catch(e){note(e,'publication_reads',raw);}}
 // Pending leave unique index: detect conflicts without invoking approval workflows.
 const leaves=[...rows('leave_requests'),...(records.leave_requests||[]).filter(r=>!rows('leave_requests').some(x=>String(x.id)===String(r.id)))];
 const pending=new Set();for(const l of leaves.filter(r=>r.status==='pending')){const k=canonical(['user_id','leave_type','start_date','end_date','start_part','end_part'].map(k=>l[k]));if(pending.has(k))issues.push({code:'PENDING_LEAVE_CONFLICT',table:'leave_requests'});pending.add(k);}
 for(const s of source.settings){const old=target.settings.find(x=>x.key===s.key);if(old&&old.value!==s.value)issues.push({code:'SETTING_CONFLICT',key:s.key});}
 for(const table of Object.keys(tables)){const current=new Set(source.tables[table].map(r=>key(table,r)));for(const sourceKey of Object.keys(previous.rows[table]||{}))if(!current.has(sourceKey))warnings.push({code:'SOURCE_REMOVAL_RETAINED',table,sourceKey});}
 nextLedger.maps=maps;
 const count=Object.fromEntries(Object.keys(tables).map(t=>[t,{source:source.tables[t].length,existing:rows(t).length,insert:operations.filter(o=>o.table===t&&o.action==='insert').length,update:operations.filter(o=>o.table===t&&o.action==='update').length,keep:operations.filter(o=>o.table===t&&o.action==='keep').length}]));
 return {issues,warnings,count,maps,operations,records,nextLedger,ready:issues.length===0,sourceDigest:source.digest,targetDigest:target.digest};
}
