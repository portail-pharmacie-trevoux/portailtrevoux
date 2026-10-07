import {exportOrderWorkbook} from './order-export.mjs';
import {encrypt,decrypt} from './security.mjs';
import {validDate,shiftDate} from './schedule.mjs';
export const orderModes=['grossiste','direct labo','prep rosiers'];
export function validateOrderPlan(body,fail,delivery=null){
 if(!body||typeof body!=='object')throw fail(400,'Ligne invalide.');
 const data={};
 for(const [key,max] of Object.entries({lastName:100,firstName:100,treatment:4000,mode:30,comments:4000})){
  const value=body[key]??'';if(typeof value!=='string'||value.trim().length>max)throw fail(400,'Champ invalide : '+key);data[key]=value.trim();
 }
 if(!data.lastName||!data.firstName)throw fail(400,'Renseignez le nom et le prénom.');
 if(!orderModes.includes(data.mode))throw fail(400,'Choisissez un mode de commande.');
 data.frequency=body.frequency==null?null:body.frequency;
 if(data.frequency!==null&&(!Number.isSafeInteger(data.frequency)||data.frequency<1||data.frequency>3650))throw fail(400,'La fréquence doit être un nombre de jours entre 1 et 3650.');
 if(delivery?.date)validDate(delivery.date);
 data.initialNextOrder=body.nextOrder??'';if(typeof data.initialNextOrder!=='string')throw fail(400,'Date invalide.');if(data.initialNextOrder)validDate(data.initialNextOrder);
 data.nextOrder=delivery?.date&&data.frequency?shiftDate(delivery.date,data.frequency):data.initialNextOrder;
 return data;
}
export function orderInitials(user){
 const parts=[user.first_name,user.last_name].filter(Boolean);const names=parts.length?parts:(user.name||'').trim().split(/\s+/);return names.map(n=>Array.from(n.trim())[0]||'').join('').toLocaleUpperCase('fr').slice(0,8)||'?';
}
export const orderNextDate=data=>data.delivery?.date&&data.frequency?shiftDate(data.delivery.date,data.frequency):(data.initialNextOrder||'');
export const compareOrders=(a,b)=>Number(!!a.suspended)-Number(!!b.suspended)||(a.nextOrder||'9999').localeCompare(b.nextOrder||'9999')||a.lastName.localeCompare(b.lastName,'fr')||a.firstName.localeCompare(b.firstName,'fr');
function orderDay(now){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));return p.year+'-'+p.month+'-'+p.day;}
export function registerOrderPlanning({app,db,auth,ready,csrf,viewUniverse,editUniverse,fail,secret,now=()=>new Date()}){
 const universe="Outils d'aide aux commandes",access=viewUniverse(universe),guard=[auth,ready,editUniverse(universe),csrf];
 const clean=row=>{const data=decrypt(row.content,secret);return {id:row.id,revision:row.revision,...data,nextOrder:orderNextDate(data)};};
 app.get('/api/order-planning',auth,ready,access,async(req,res)=>{
  const rows=(await db.query('SELECT id,revision,content FROM order_planning')).rows.map(clean);
  rows.sort(compareOrders);res.json(rows);
 });
 app.get('/api/order-planning/export.xlsx',auth,ready,access,async(req,res)=>{
  const rows=(await db.query('SELECT id,revision,content FROM order_planning')).rows.map(clean);
  rows.sort(compareOrders);
  const day=orderDay(now());res.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename=commandes-programmees-'+day+'.xlsx','Cache-Control':'no-store'}).send(exportOrderWorkbook(rows,day));
 });
 app.post('/api/order-planning',...guard,async(req,res)=>{
  const data=validateOrderPlan(req.body,fail);
  const row=(await db.query('INSERT INTO order_planning(content,updated_by) VALUES($1,$2) RETURNING id,revision,content',[encrypt(data,secret),req.auth.id])).rows[0];res.status(201).json(clean(row));
 });
 app.put('/api/order-planning/:id',...guard,async(req,res)=>{
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(req.body?.revision))throw fail(400,'Actualisez la ligne avant de la modifier.');
  const current=(await db.query('SELECT id,revision,content FROM order_planning WHERE id=$1',[id])).rows[0];
  if(!current||current.revision!==req.body.revision)throw fail(409,'Cette ligne a changé. Rechargez le tableau.');
  const previous=decrypt(current.content,secret),data={...previous,...validateOrderPlan({...req.body,nextOrder:previous.delivery?(previous.initialNextOrder||''):(req.body.nextOrder??previous.initialNextOrder??'')},fail,previous.delivery)};
  const row=(await db.query('UPDATE order_planning SET content=$2,updated_by=$3,updated_at=now(),revision=revision+1 WHERE id=$1 AND revision=$4 RETURNING id,revision,content',[id,encrypt(data,secret),req.auth.id,req.body.revision])).rows[0];
  if(!row)throw fail(409,'Cette ligne a changé. Rechargez le tableau avant de continuer.');res.json(clean(row));
 });
 app.post('/api/order-planning/:id/confirmation',...guard,async(req,res)=>{
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(req.body?.revision)||typeof req.body.enabled!=='boolean')throw fail(400,'Validation invalide.');
  const current=(await db.query('SELECT id,revision,content FROM order_planning WHERE id=$1',[id])).rows[0];
  if(!current||current.revision!==req.body.revision)throw fail(409,'Cette ligne a changé. Rechargez le tableau.');
  const data=decrypt(current.content,secret);
  if(req.body.enabled){const timestamp=now();data.confirmation={date:orderDay(timestamp),at:timestamp.toISOString(),initials:orderInitials(req.auth),userId:req.auth.id};}
  else delete data.confirmation;
  const row=(await db.query('UPDATE order_planning SET content=$2,updated_by=$3,updated_at=now(),revision=revision+1 WHERE id=$1 AND revision=$4 RETURNING id,revision,content',[id,encrypt(data,secret),req.auth.id,req.body.revision])).rows[0];
  if(!row)throw fail(409,'Cette ligne a changé. Rechargez le tableau.');res.json(clean(row));
 });
 app.post('/api/order-planning/:id/delivery',...guard,async(req,res)=>{
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(req.body?.revision)||typeof req.body.enabled!=='boolean')throw fail(400,'Délivrance invalide.');
  const current=(await db.query('SELECT id,revision,content FROM order_planning WHERE id=$1',[id])).rows[0];
  if(!current||current.revision!==req.body.revision)throw fail(409,'Cette ligne a changé. Rechargez le tableau.');
  const data=decrypt(current.content,secret);
  if(req.body.enabled){const timestamp=now();data.delivery={date:orderDay(timestamp),at:timestamp.toISOString(),initials:orderInitials(req.auth),userId:req.auth.id};}else delete data.delivery;
  data.nextOrder=orderNextDate(data);
  const row=(await db.query('UPDATE order_planning SET content=$2,updated_by=$3,updated_at=now(),revision=revision+1 WHERE id=$1 AND revision=$4 RETURNING id,revision,content',[id,encrypt(data,secret),req.auth.id,req.body.revision])).rows[0];
  if(!row)throw fail(409,'Cette ligne a changé. Rechargez le tableau.');res.json(clean(row));
 });
 app.post('/api/order-planning/:id/suspension',...guard,async(req,res)=>{
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(req.body?.revision)||typeof req.body.enabled!=='boolean')throw fail(400,'Suspension invalide.');
  const current=(await db.query('SELECT id,revision,content FROM order_planning WHERE id=$1',[id])).rows[0];if(!current||current.revision!==req.body.revision)throw fail(409,'Cette ligne a changé. Rechargez le tableau.');
  const data=decrypt(current.content,secret);data.suspended=req.body.enabled;
  const row=(await db.query('UPDATE order_planning SET content=$2,updated_by=$3,updated_at=now(),revision=revision+1 WHERE id=$1 AND revision=$4 RETURNING id,revision,content',[id,encrypt(data,secret),req.auth.id,req.body.revision])).rows[0];if(!row)throw fail(409,'Cette ligne a changé. Rechargez le tableau.');res.json(clean(row));
 });
 app.delete('/api/order-planning/:id',...guard,async(req,res)=>{
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(req.body?.revision))throw fail(400,'Ligne invalide.');
  const row=(await db.query('DELETE FROM order_planning WHERE id=$1 AND revision=$2 RETURNING id',[id,req.body.revision])).rows[0];if(!row)throw fail(409,'Cette ligne a changé. Rechargez le tableau.');res.json({ok:true});
 });
}
