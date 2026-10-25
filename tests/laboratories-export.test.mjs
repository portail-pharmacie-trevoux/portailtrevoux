import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {inflateRawSync} from 'node:zlib';
import {registerLaboratories} from '../laboratories.mjs';
test('Laboratory export: server admin restriction, all rows and safe XLSX strings',async t=>{
 const app=express();let role='employee',queries=0;
 const pass=(req,res,next)=>next();
 registerLaboratories({app,db:{query:async()=>{queries++;return {rows:[{id:1,name:'=FAKE()',order_mode:'pharmacie',responsible_name:'Alice',details:{conditions:'A & B',conditionsHistory:{2025:{year:2025,conditions:'Anciennes',franco:'100 €'}}},documents:[{title:'Catalogue',file_name:'catalogue.pdf'}]}]};}},auth:(req,res,next)=>{req.auth={id:1,role};next();},ready:pass,csrf:pass,viewUniverse:()=>pass,fail:(status,message)=>Object.assign(Error(message),{status})});
 app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));
 const server=app.listen(0);t.after(()=>server.close());
 const url='http://127.0.0.1:'+server.address().port+'/api/laboratories/export.xlsx';
 assert.equal((await fetch(url)).status,403);assert.equal(queries,0);
 role='admin';const r=await fetch(url);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.match(r.headers.get('content-type'),/spreadsheetml/);
 const buffer=Buffer.from(await r.arrayBuffer());assert.equal(buffer.subarray(0,2).toString(),'PK');
 let raw='';for(let offset=0;buffer.readUInt32LE(offset)===0x04034b50;){const size=buffer.readUInt32LE(offset+18),nameLength=buffer.readUInt16LE(offset+26),extraLength=buffer.readUInt16LE(offset+28),start=offset+30+nameLength+extraLength;raw+=inflateRawSync(buffer.subarray(start,start+size)).toString();offset=start+size;}assert.match(raw,/Anciennes/);assert.match(raw,/catalogue.pdf/);assert.match(raw,/A &amp; B/);assert.match(raw,/=FAKE\(\)/);assert.ok(!raw.includes('<f>'));
});
