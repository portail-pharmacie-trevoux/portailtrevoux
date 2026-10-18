import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';import {musicCSV,registerMusicCSV} from '../music-csv.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
test('CSV musical : UTF-8, guillemets, virgules et retours à la ligne conservés',()=>{
 const csv=musicCSV([{artist:'Björk, "live"',title:'Ligne 1\nLigne 2'}]);assert(csv.startsWith('\uFEFF"Artist","Title"\r\n'));assert.match(csv,/"Björk, ""live"""/);assert(csv.includes('"Ligne 1\nLigne 2"'));
});
test('CSV musical : administrateur et CSRF obligatoires, uniquement les identifiants choisis',async t=>{
 let admin=false,available=true,args;const pass=(req,res,next)=>next(),app=express();app.use(express.json());registerMusicCSV({app,db:{query:async(sql,values)=>{args=values;assert.match(sql,/WHERE id=ANY/);return {rows:available?[{id:2,artist:'Artiste choisi',title:'Titre choisi'}]:[]};}},auth:pass,ready:pass,admin:(req,res,next)=>admin?next():next(fail(403,'Administrateur')),csrf:(req,res,next)=>req.headers['x-csrf-token']==='ok'?next():next(fail(403,'CSRF')),fail});app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);t.after(()=>server.close());const url='http://127.0.0.1:'+server.address().port+'/api/music/export.csv';const send=(ids,token='ok')=>fetch(url,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':token},body:JSON.stringify({ids})});assert.equal((await send([2])).status,403);admin=true;assert.equal((await send([2],'bad')).status,403);assert.equal((await send([])).status,400);assert.equal((await send([1.5])).status,400);const response=await send([2,2]);assert.equal(response.status,200);assert.deepEqual(args,[[2]]);assert.match(response.headers.get('content-type'),/text\/csv/);assert.match(await response.text(),/Artiste choisi/);available=false;assert.equal((await send([2])).status,409);
});
test('Suppression musicale groupée : administrateur, CSRF et sélection explicite',async t=>{
 let allowed=false,calls=0;const pass=(req,res,next)=>next(),app=express();app.use(express.json());
 registerMusicCSV({app,db:{query:async(sql,args)=>{calls++;assert.equal(sql,'DELETE FROM music_tracks WHERE id=ANY($1::int[]) RETURNING id');assert.deepEqual(args,[[2,7]]);return {rows:[{id:2},{id:7}]};}},auth:pass,ready:pass,admin:(req,res,next)=>allowed?next():next(fail(403,'Admin')),csrf:(req,res,next)=>req.headers['x-csrf-token']==='ok'?next():next(fail(403,'CSRF')),fail});
 app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);t.after(()=>server.close());
 const send=(ids,token='ok')=>fetch('http://127.0.0.1:'+server.address().port+'/api/music/delete-selected',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':token},body:JSON.stringify({ids})});
 assert.equal((await send([2,7])).status,403);allowed=true;assert.equal((await send([2,7],'bad')).status,403);
 for(const ids of [[],[0],[1.5],['2'],[2147483648]])assert.equal((await send(ids)).status,400);
 assert.equal(calls,0);const response=await send([2,7,2]);assert.equal(response.status,200);assert.deepEqual(await response.json(),{ids:[2,7]});assert.equal(calls,1);
});
