import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureScalingoTemperatureSchema} from '../scripts/ensure-scalingo-temperature-schema.mjs';
function fixture(columns,error){
 const queries=[];let released=false;
 const db={connect:async()=>({query:async sql=>{
  queries.push(sql);if(sql.startsWith('SELECT column_name'))return {rows:columns.map(column_name=>({column_name}))};
  if(sql.startsWith('ALTER TABLE')&&error)throw error;return {rows:[]};
 },release(){released=true;}})};
 return {db,queries,get released(){return released;}};
}
test('Schéma Scalingo déjà compatible : aucune écriture ni migration répétée',async()=>{
 const f=fixture(['id','text','validation','revision','updated_at','history']);assert.deepEqual(await ensureScalingoTemperatureSchema(f.db),{added:[]});assert.equal(f.queries.some(s=>/ALTER|UPDATE|DELETE|INSERT/.test(s)),false);assert.equal(f.queries.at(-1),'COMMIT');assert.equal(f.released,true);
});
test('Échec de migration : transaction annulée et connexion libérée',async()=>{
 const error=Object.assign(Error('Lock timeout'),{code:'55P03'}),f=fixture(['id','text'],error);await assert.rejects(()=>ensureScalingoTemperatureSchema(f.db),e=>e===error);assert.equal(f.queries.at(-1),'ROLLBACK');assert.equal(f.released,true);
});
test('Table absente : refuser de recréer les données métier',async()=>{
 const f=fixture([]);await assert.rejects(()=>ensureScalingoTemperatureSchema(f.db),/refusing to recreate/);assert.equal(f.queries.some(s=>s.startsWith('CREATE')||s.startsWith('ALTER')),false);assert.equal(f.queries.at(-1),'ROLLBACK');assert.equal(f.released,true);
});
