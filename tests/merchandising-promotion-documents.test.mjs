import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../server.mjs';
import {digest,token} from '../security.mjs';

test('Documents promotion : accès, formats, validation, téléchargement et suppression autorisée',async t=>{
 const universe="Outils d'aide au merchandising";
 const employee={role:'employee',permissions_configured:true,rights:[universe],edit_rights:[]};
 const users={
  reader:employee,
  editor:{...employee,edit_rights:[universe]},
  denied:{...employee,rights:[]},
  legacy:{...employee,permissions_configured:false},
  admin:{role:'admin'},
  inactive:{role:'admin',active:false},
  pending:{role:'admin',must_change:true}
 };
 const sessions=new Map(),cookies={};
 Object.entries(users).forEach(([name,user],index)=>{
  const raw=token();
  cookies[name]='trevoux_session='+raw;
  sessions.set(digest(raw),{active:true,...user,id:index+1,name,csrf:'csrf-'+name});
 });
 const original=Buffer.from('%PDF-1.4\noriginal\n%%EOF');
 const bytes=Buffer.from('%PDF-1.4\nnouveau\n%%EOF');
 const docs=new Map([[1,{id:1,promotion_id:1,file_name:'offre.pdf',file_type:'application/pdf',file_content:original,created_by:1}]]);
 const zones=new Map([[1,1],[2,2],[3,null]]);
 const db={async query(sql,args){
  if(sql.startsWith('SELECT s.id AS session_id')){
   const session=sessions.get(args[0]);
   return {rows:session?.active?[session]:[]};
  }
  const [promotion,document]=args;
  const scoped=()=>docs.get(document)?.promotion_id===promotion?docs.get(document):undefined;
  if(sql.startsWith('SELECT zone_id'))return {rows:[{zone_id:zones.get(promotion)}]};
  if(sql.startsWith('SELECT id,file_name')){
   const rows=[...docs.values()].filter(row=>row.promotion_id===promotion);
   return {rows:rows.map(({id,file_name})=>({id,file_name}))};
  }
  if(sql.startsWith('INSERT INTO merchandising_promotion_documents')){
   assert.match(sql,/WHERE id=\$1 AND zone_id IS NOT NULL RETURNING/);
   assert.doesNotMatch(sql,/ON CONFLICT/);
   if(!zones.get(promotion))return {rows:[]};
   const [promotion_id,file_name,file_type,file_content,created_by]=args;
   const id=2;
   assert.equal(docs.has(id),false);
   docs.set(id,{id,promotion_id,file_name,file_type,file_content,created_by});
   return {rows:[{id,file_name}]};
  }
  if(sql.startsWith('SELECT d.file_name')){
   assert.match(sql,/WHERE p.id=\$1 AND d.id=\$2 AND p.zone_id IS NOT NULL/);
   const row=zones.get(promotion)&&scoped();
   return {rows:row?[row]:[]};
  }
  if(sql.startsWith('DELETE FROM merchandising_promotion_documents')){
   assert.match(sql,/WHERE promotion_id=\$1 AND id=\$2/);
   const row=scoped();
   if(row)docs.delete(document);
   return {rows:row?[row]:[]};
  }
  throw Error('Unexpected query: '+sql);
 }};
 const origin='http://127.0.0.1';
 const {app}=createApp(db,{origin,secret:'s'.repeat(32)});
 const server=app.listen(0,'127.0.0.1');
 t.after(()=>server.close());
 await once(server,'listening');
 const request=(user,method,promotion=1,path='',body,csrf='csrf-'+user)=>fetch(
  origin+':'+server.address().port+'/api/merchandising/promotions/'+promotion+'/documents'+path,
  {method,headers:{origin,cookie:cookies[user]||'','content-type':'application/json','x-csrf-token':csrf},body:body===undefined?undefined:JSON.stringify(body)}
 );
 const pdf={fileName:'offre.pdf',fileData:bytes.toString('base64')};

 await t.test('Lecture salarié et refus d’écriture, même pour le propriétaire et les anciens droits implicites',async()=>{
  for(const user of ['reader','legacy']){
   const list=await request(user,'GET');
   assert.equal(list.status,200);
   assert.equal((await list.json()).canDelete,false);
   assert.equal((await request(user,'POST',1,'',pdf)).status,403);
   assert.equal((await request(user,'DELETE',1,'/1')).status,403);
  }
  const file=await request('reader','GET',1,'/1/file');
  assert.equal(file.status,200);
  assert.match(file.headers.get('content-type'),/application\/pdf/);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()),original);
 });

 await t.test('Session absente ou inactive, univers interdit et mot de passe provisoire',async()=>{
  for(const [user,status] of [['anonymous',401],['inactive',401],['denied',403],['pending',403]]){
   for(const [method,path,body] of [['GET',''],['GET','/1/file'],['POST','',pdf],['DELETE','/1']]){
    assert.equal((await request(user,method,1,path,body)).status,status);
   }
  }
  assert.equal(docs.size,1);
 });

 await t.test('Salarié avec droit de modification et administrateur : intégrité, portée et CSRF',async()=>{
  assert.equal((await request('editor','POST',1,'',pdf,'bad')).status,403);
  assert.equal((await request('editor','POST',1,'',{...pdf,fileName:'fichier.exe'})).status,400);
  assert.equal((await request('editor','POST',1,'',{...pdf,fileData:'invalid!'})).status,400);
  assert.equal((await request('admin','POST',3,'',pdf)).status,404);
  assert.equal((await request('admin','GET',3)).status,404);
  assert.equal((await request('editor','POST',1,'',pdf)).status,201);
  assert.equal(docs.size,2);
  assert.equal(docs.get(2).created_by,sessions.values().find(user=>user.name==='editor').id);
  assert.deepEqual(docs.get(1).file_content,original);
  const list=await (await request('admin','GET')).json();
  assert.equal(list.canDelete,true);
  assert.equal(list.documents.length,2);
  assert.equal((await request('admin','GET',2,'/2/file')).status,404);
  assert.equal((await request('admin','DELETE',2,'/2')).status,404);
  assert.equal((await request('admin','DELETE',1,'/2',undefined,'bad')).status,403);
  const file=await request('reader','GET',1,'/2/file');
  assert.equal(file.status,200);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()),bytes);
  assert.equal((await request('admin','DELETE',1,'/2')).status,200);
  assert.equal((await request('reader','GET',1,'/2/file')).status,404);
  assert.deepEqual(docs.get(1).file_content,original);
 });
});
