import {encrypt,decrypt} from './security.mjs';
import {validDate,shiftDate} from './schedule.mjs';
export const orderModes=['grossiste','direct labo','prep rosiers'];
export function validateOrderPlan(body,fail){
 if(!body||typeof body!=='object')throw fail(400,'Ligne invalide.');
 const data={};
 for(const [key,max] of Object.entries({lastOrder:10,lastName:100,firstName:100,treatment:4000,mode:30,comments:4000})){
  const value=body[key]??'';if(typeof value!=='string'||value.trim().length>max)throw fail(400,'Champ invalide : '+key);data[key]=value.trim();
 }
 if(!data.lastName||!data.firstName)throw fail(400,'Renseignez le nom et le prénom.');
 if(!orderModes.includes(data.mode))throw fail(400,'Choisissez un mode de commande.');
 data.frequency=body.frequency==null?null:body.frequency;
 if(data.frequency!==null&&(!Number.isSafeInteger(data.frequency)||data.frequency<1||data.frequency>3650))throw fail(400,'La fréquence doit être un nombre de jours entre 1 et 3650.');
 if(data.lastOrder)validDate(data.lastOrder);
 data.nextOrder=data.lastOrder&&data.frequency?shiftDate(data.lastOrder,data.frequency):'';
 return data;
}
export function registerOrderPlanning({app,db,auth,ready,csrf,viewUniverse,editUniverse,fail,secret}){
 const universe="Outils d'aide aux commandes",access=viewUniverse(universe),guard=[auth,ready,editUniverse(universe),csrf];
 const clean=row=>({id:row.id,revision:row.revision,...decrypt(row.content,secret)});
 app.get('/api/order-planning',auth,ready,access,async(req,res)=>{
  const rows=(await db.query('SELECT id,revision,content FROM order_planning')).rows.map(clean);
  rows.sort((a,b)=>(a.nextOrder||'9999').localeCompare(b.nextOrder||'9999')||a.lastName.localeCompare(b.lastName,'fr')||a.firstName.localeCompare(b.firstName,'fr'));res.json(rows);
 });
 app.post('/api/order-planning',...guard,async(req,res)=>{
  const data=validateOrderPlan(req.body,fail);
  const row=(await db.query('INSERT INTO order_planning(content,updated_by) VALUES($1,$2) RETURNING id,revision,content',[encrypt(data,secret),req.auth.id])).rows[0];res.status(201).json(clean(row));
 });
 app.put('/api/order-planning/:id',...guard,async(req,res)=>{
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(req.body?.revision))throw fail(400,'Actualisez la ligne avant de la modifier.');
  const data=validateOrderPlan(req.body,fail);
  const row=(await db.query('UPDATE order_planning SET content=$2,updated_by=$3,updated_at=now(),revision=revision+1 WHERE id=$1 AND revision=$4 RETURNING id,revision,content',[id,encrypt(data,secret),req.auth.id,req.body.revision])).rows[0];
  if(!row)throw fail(409,'Cette ligne a changé. Rechargez le tableau avant de continuer.');res.json(clean(row));
 });
 app.delete('/api/order-planning/:id',...guard,async(req,res)=>{
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(req.body?.revision))throw fail(400,'Ligne invalide.');
  const row=(await db.query('DELETE FROM order_planning WHERE id=$1 AND revision=$2 RETURNING id',[id,req.body.revision])).rows[0];if(!row)throw fail(409,'Cette ligne a changé. Rechargez le tableau.');res.json({ok:true});
 });
}
