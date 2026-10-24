export function validateQuickLinks(body,fail){
 if(!Number.isSafeInteger(body?.revision)||body.revision<0||!Array.isArray(body.links)||body.links.length>30)throw fail(400,'Choisissez au maximum 30 liens et actualisez le menu avant de réessayer.');
 const seen=new Set();const links=body.links.map(link=>{
  if(typeof link?.id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(link.id)||seen.has(link.id)||typeof link.name!=='string'||!link.name.trim()||link.name.trim().length>80||typeof link.url!=='string'||link.url.length>2048)throw fail(400,'Chaque lien doit avoir un nom de 80 caractères maximum et une adresse valide.');
  seen.add(link.id);let url;try{url=new URL(link.url.trim());}catch{throw fail(400,'Renseignez une adresse complète commençant par https:// ou http://.');}
  if(!['https:','http:'].includes(url.protocol)||!url.hostname||url.username||url.password)throw fail(400,'Seules les adresses HTTP ou HTTPS sans identifiants intégrés sont autorisées.');
  let imageUrl=link.imageUrl??'';if(typeof imageUrl!=='string'||imageUrl.length>2048)throw fail(400,'L’adresse du logo ne doit pas dépasser 2 048 caractères.');imageUrl=imageUrl.trim();if(imageUrl){let image;try{image=new URL(imageUrl);}catch{throw fail(400,'Choisissez une adresse HTTPS valide pour le logo.');}if(image.protocol!=='https:'||!image.hostname||image.username||image.password)throw fail(400,'Le logo doit utiliser une adresse HTTPS sans identifiants intégrés.');imageUrl=image.href;}
  return {id:link.id,name:link.name.trim(),url:url.href,imageUrl};
 });return links;
}
export function registerPortalQuickLinks({app,db,auth,ready,admin,csrf,fail}){
 app.get('/api/quick-links',auth,ready,async(req,res)=>{
  const row=(await db.query('SELECT links,revision FROM portal_quick_links WHERE singleton=TRUE')).rows[0];res.set('Cache-Control','no-store').json({links:row?.links||[],revision:row?.revision||0,isAdmin:req.auth.role==='admin'});
 });
 app.put('/api/quick-links',auth,ready,admin,csrf,async(req,res)=>{
  const links=validateQuickLinks(req.body,fail),revision=req.body.revision;
  const sql=revision===0?'INSERT INTO portal_quick_links(singleton,links,revision,updated_by) VALUES(TRUE,$1::jsonb,1,$2) ON CONFLICT DO NOTHING RETURNING links,revision':'UPDATE portal_quick_links SET links=$1::jsonb,revision=revision+1,updated_by=$2,updated_at=now() WHERE singleton=TRUE AND revision=$3 RETURNING links,revision';
  const row=(await db.query(sql,revision===0?[JSON.stringify(links),req.auth.id]:[JSON.stringify(links),req.auth.id,revision])).rows[0];if(!row)throw fail(409,'Ces liens ont été modifiés par un autre administrateur. Actualisez la page avant de recommencer.');res.json({...row,isAdmin:true});
 });
}
