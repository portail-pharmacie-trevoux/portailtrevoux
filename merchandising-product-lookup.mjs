// Reuse PromoFlash's free product catalogs. Only the public EAN is sent out.
export function createMerchProductLookup({db,products,now=()=>Date.now()}){
 const pending=new Map(),requests=[];
 return async function lookup(ean){
  if(!/^\d{13}$/.test(ean||''))throw Object.assign(Error('Code EAN invalide : 13 chiffres attendus.'),{status:400});
  if(pending.has(ean))return pending.get(ean);
  const task=(async()=>{
   const cached=(await db.query("SELECT data FROM merchandising_product_names WHERE ean=$1 AND checked_at>now()-CASE WHEN COALESCE(data->>'name','')<>'' THEN interval '7 days' ELSE interval '1 day' END",[ean])).rows[0];if(cached)return cached.data;
   if(!products?.product)throw Object.assign(Error('Recherche produit momentanément indisponible.'),{status:503});
   const time=now();while(requests.length&&requests[0]<=time-60000)requests.shift();if(requests.length>=12)return{ean,name:'',pending:true,retryAfter:Math.max(1,Math.ceil((requests[0]+60000-time)/1000))};requests.push(time);
   const result=await products.product(ean);const french=result.found&&/^fr(?:$|-)/.test(result.nameLanguage||'');const data={ean,found:!!result.found,name:french?String(result.name||'').slice(0,300):'',originalName:result.found?String(result.originalName||result.name||'').slice(0,300):'',source:result.source||'',language:result.nameLanguage||'unknown',checkedAt:new Date(now()).toISOString()};
   await db.query('INSERT INTO merchandising_product_names(ean,data,checked_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(ean) DO UPDATE SET data=EXCLUDED.data,checked_at=EXCLUDED.checked_at',[ean,JSON.stringify(data)]);return data;
  })().finally(()=>pending.delete(ean));pending.set(ean,task);return task;
 };
}
export function registerMerchandisingProductLookup({app,db,auth,ready,view,fail,products}){
 const lookup=createMerchProductLookup({db,products});app.get('/api/merchandising/impact/products/:ean',auth,ready,view,async(req,res)=>{try{res.json(await lookup(req.params.ean));}catch(e){if(e.status===400)throw e;throw fail(503,'La recherche du nom est indisponible. Vous pouvez le renseigner manuellement.');}});
}
