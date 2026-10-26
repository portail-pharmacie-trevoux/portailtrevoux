export const webValidationMethod='web-two-sites-v1';
export function createMerchProductLookup({db,searchWeb,now=()=>Date.now()}){
 const pending=new Map(),requests=[];let active=0;
 return async function lookup(ean){
  if(!/^\d{13}$/.test(ean||''))throw Object.assign(Error('Code EAN invalide : 13 chiffres attendus.'),{status:400});
  if(pending.has(ean))return pending.get(ean);
  const task=(async()=>{
   const manual=(await db.query('SELECT name,revision,updated_name,updated_at FROM merchandising_product_overrides WHERE ean=$1',[ean])).rows[0];
   if(manual?.name)return{ean,name:manual.name,validated:false,manual:true,overrideRevision:manual.revision,source:'Correction par '+manual.updated_name,checkedAt:manual.updated_at,sources:[]};
   const cached=(await db.query("SELECT data FROM merchandising_product_names WHERE ean=$1 AND data->>'validationMethod'=$2 AND checked_at>now()-CASE WHEN data->>'validated'='true' THEN interval '7 days' ELSE interval '10 minutes' END",[ean,webValidationMethod])).rows[0];if(cached)return{...cached.data,overrideRevision:manual?.revision||0};
   if(!searchWeb)throw Object.assign(Error('Recherche web momentanément indisponible.'),{status:503});
   const time=now();while(requests.length&&requests[0]<=time-60000)requests.shift();if(requests.length>=12||active>=2)return{ean,name:'',pending:true,retryAfter:active>=2?4:Math.max(1,Math.ceil((requests[0]+60000-time)/1000))};requests.push(time);active++;
   let result;try{result=await searchWeb(ean);}finally{active--;}
   const sources=Array.isArray(result.sources)?result.sources:[],distinct=new Set(sources.map(s=>s.domain).filter(Boolean));const validated=result.validated===true&&distinct.size>=2&&typeof result.name==='string'&&result.name.trim();
   const data={ean,name:validated?result.name.trim().slice(0,300):'',found:!!validated,validated:!!validated,manual:false,validationMethod:webValidationMethod,sources,source:validated?'Recherche web · '+distinct.size+' sites concordants':'Correspondance insuffisante',checkedAt:new Date(now()).toISOString()};
   await db.query('INSERT INTO merchandising_product_names(ean,data,checked_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(ean) DO UPDATE SET data=EXCLUDED.data,checked_at=EXCLUDED.checked_at',[ean,JSON.stringify(data)]);return{...data,overrideRevision:manual?.revision||0};
  })().finally(()=>pending.delete(ean));pending.set(ean,task);return task;
 };
}
export async function resolveImpactProductNames({db,user,names,previousNames={},canManage}){
 if(await canManage(user))return names;
 const eans=Object.keys(names);if(!eans.length)return previousNames;
 const overrides=(await db.query('SELECT ean,name FROM merchandising_product_overrides WHERE ean=ANY($1::text[])',[eans])).rows;
 const cached=(await db.query("SELECT ean,data FROM merchandising_product_names WHERE ean=ANY($1::text[]) AND data->>'validationMethod'=$2 AND data->>'validated'='true'",[eans,webValidationMethod])).rows;
 const permitted=new Map(cached.map(r=>[r.ean,r.data.name]));for(const r of overrides)if(r.name)permitted.set(r.ean,r.name);
 for(const [ean,name]of Object.entries(names))if(name!==permitted.get(ean)&&name!==previousNames[ean])throw Object.assign(Error('Seuls le référent Merchandising et les administrateurs peuvent modifier une dénomination produit.'),{status:403});return names;
}
export function registerMerchandisingProductLookup({app,db,auth,ready,csrf,view,fail,searchWeb,canManage=async user=>user?.role==='admin'}){
 const lookup=createMerchProductLookup({db,searchWeb});app.get('/api/merchandising/impact/products/:ean',auth,ready,view,async(req,res)=>{try{res.json(await lookup(req.params.ean));}catch(e){if(e.status===400)throw e;throw fail(503,'Recherche web indisponible. Le responsable ou un administrateur peut renseigner le nom manuellement.');}});
 app.get('/api/merchandising/impact/products/:ean/name',auth,ready,view,async(req,res)=>{const ean=req.params.ean;if(!/^\d{13}$/.test(ean))throw fail(400,'EAN invalide.');const row=(await db.query('SELECT name,revision FROM merchandising_product_overrides WHERE ean=$1',[ean])).rows[0];res.json({name:row?.name||'',overrideRevision:row?.revision||0});});
 app.put('/api/merchandising/impact/products/:ean/name',auth,ready,view,csrf,async(req,res)=>{
  if(!await canManage(req.auth))throw fail(403,'Correction réservée au référent Merchandising et aux administrateurs.');const ean=req.params.ean,b=req.body;if(!/^\d{13}$/.test(ean)||typeof b?.name!=='string'||b.name.trim().length>300||!Number.isInteger(b.revision)||b.revision<0)throw fail(400,'EAN, nom ou version invalide.');
  const c=await db.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(78451028,hashtext($1))',[ean]);const old=(await c.query('SELECT * FROM merchandising_product_overrides WHERE ean=$1 FOR UPDATE',[ean])).rows[0];if((old?.revision||0)!==b.revision)throw fail(409,'Le nom de ce produit a changé. Rechargez la fiche avant de le corriger.');const result=(await c.query('INSERT INTO merchandising_product_overrides(ean,name,updated_by,updated_name) VALUES($1,$2,$3,$4) ON CONFLICT(ean) DO UPDATE SET name=EXCLUDED.name,updated_by=EXCLUDED.updated_by,updated_name=EXCLUDED.updated_name,updated_at=now(),revision=merchandising_product_overrides.revision+1 RETURNING *',[ean,b.name.trim(),req.auth.id,req.auth.name])).rows[0];await c.query('INSERT INTO merchandising_product_name_events(ean,previous_name,name,operator_id,operator_name) VALUES($1,$2,$3,$4,$5)',[ean,old?.name||'',result.name,req.auth.id,req.auth.name]);await c.query('COMMIT');res.json({ean,name:result.name,manual:!!result.name,overrideRevision:result.revision,source:'Correction par '+req.auth.name,sources:[]});}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 });return{lookup};
}
