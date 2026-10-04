export function registerContacts({app,db,auth,ready,admin,csrf,viewUniverse,fail,publish}){
 const fields={scope:80,name:160,person:160,phone:80,email:254,url:500,notes:1500};
 function validate(body){const d={};for(const [key,max] of Object.entries(fields)){const v=body?.[key]??'';if(typeof v!=='string'||v.length>max)throw fail(400,'Champ invalide : '+key);d[key]=v.trim();}if(!d.scope||!d.name)throw fail(400,'Le périmètre et le nom du contact sont obligatoires.');if(d.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email))throw fail(400,'Adresse e-mail invalide.');if(d.url){try{const u=new URL(d.url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error();}catch{throw fail(400,'Lien invalide.');}}return d;}
 const guard=[auth,ready,admin,csrf];
 const insert=async(client,d,key=null)=>(await client.query(`INSERT INTO useful_contacts(scope,name,person,phone,email,url,notes,source_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(source_key) DO NOTHING RETURNING *`,[...Object.keys(fields).map(k=>d[k]),key])).rows[0];
 app.get('/api/contacts',auth,ready,viewUniverse('Contacts utiles'),async(req,res)=>{res.json((await db.query('SELECT id,scope,name,person,phone,email,url,notes,active FROM useful_contacts WHERE active=TRUE OR $1 ORDER BY lower(scope),lower(name),id',[req.auth.role==='admin'])).rows);});
 app.post('/api/contacts',...guard,async(req,res)=>{const row=await insert(db,validate(req.body));await publish('Contacts utiles','Un contact a été ajouté : '+row.name);res.status(201).json(row);});
 app.post('/api/contacts/import',...guard,async(req,res)=>{
  if(!Array.isArray(req.body.contacts)||!req.body.contacts.length||req.body.contacts.length>100)throw fail(400,'Liste de contacts invalide.');
  const list=req.body.contacts.map((c,i)=>({...validate(c),key:typeof c.sourceKey==='string'&&/^[\w-]{1,100}$/.test(c.sourceKey)?c.sourceKey:null}));if(list.some(c=>!c.key))throw fail(400,'Identifiant d’import manquant.');
  const client=db.connect?await db.connect():db;let count=0;
  try{await client.query('BEGIN');for(const c of list)if(await insert(client,c,c.key))count++;if(count)await client.query("INSERT INTO publications(universe,title) VALUES('Contacts utiles',$1)",[count+' contacts ajoutés à l’annuaire.']);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release?.();}res.json({count});
 });
 app.put('/api/contacts/:id',...guard,async(req,res)=>{const d=validate(req.body);const row=(await db.query('UPDATE useful_contacts SET scope=$1,name=$2,person=$3,phone=$4,email=$5,url=$6,notes=$7 WHERE id=$8 AND active=TRUE RETURNING *',[...Object.keys(fields).map(k=>d[k]),req.params.id])).rows[0];if(!row)throw fail(404,'Contact introuvable.');res.json(row);});
 app.delete('/api/contacts/:id',...guard,async(req,res)=>{const row=(await db.query('UPDATE useful_contacts SET active=FALSE WHERE id=$1 AND active=TRUE RETURNING id',[req.params.id])).rows[0];if(!row)throw fail(404,'Contact introuvable.');res.json({ok:true});});
 app.post('/api/contacts/:id/restore',...guard,async(req,res)=>{const row=(await db.query('UPDATE useful_contacts SET active=TRUE WHERE id=$1 AND active=FALSE RETURNING id',[req.params.id])).rows[0];if(!row)throw fail(404,'Contact introuvable.');res.json({ok:true});});
}
