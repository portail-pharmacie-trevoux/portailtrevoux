import test from 'node:test';import assert from 'node:assert/strict';
import {saveAndLockOrders} from '../public/order-exit.js';
test('Quitter : attendre la fin de tous les enregistrements avant de verrouiller',async()=>{
 const steps=[];let release;const saving=new Promise(r=>release=r);
 const result=saveAndLockOrders({saveBeforeExit:async()=>{steps.push('save');await saving;steps.push('saved');}},async()=>steps.push('lock'));
 await Promise.resolve();assert.deepEqual(steps,['save']);release();await result;assert.deepEqual(steps,['save','saved','lock']);
});
test('Quitter : erreur de sauvegarde ou éditeur indisponible empêchent le verrouillage',async()=>{
 let locks=0;await assert.rejects(saveAndLockOrders({saveBeforeExit:async()=>{throw Error('Conflit');}},async()=>locks++),/Conflit/);assert.equal(locks,0);
 await assert.rejects(saveAndLockOrders(undefined,async()=>locks++),/indisponible/);assert.equal(locks,0);
});
