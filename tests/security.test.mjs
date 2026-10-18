import test from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword,verifyPassword,passwordValid,encrypt,decrypt,canAccess,canModify,token} from '../security.mjs';
test('password hashing verifies the original and rejects a wrong password',async()=>{
 const password=token(),stored=await hashPassword(password);
 assert.equal(await verifyPassword(password,stored),true);
 assert.equal(await verifyPassword('incorrect',stored),false);
 assert.equal(await verifyPassword('a'.repeat(1000),stored),false);
 assert.equal(passwordValid('short'),false);
 assert.equal(passwordValid(password),true);
});
test('Google credentials survive encryption and reject tampering or the wrong key',()=>{
 const secret=token(),original={refresh_token:token()};const encoded=encrypt(original,secret);
 assert.deepEqual(decrypt(encoded,secret),original);
 assert(!encoded.includes(original.refresh_token));
 assert.throws(()=>decrypt(encoded,token()));
 const parts=encoded.split('.');parts[1]=Buffer.alloc(16).toString('base64');
 assert.throws(()=>decrypt(parts.join('.'),secret));
});
test('employees need an explicit universe right; administrator can access all',()=>{
 assert.equal(canAccess({role:'employee',rights:['Agenda']},'Agenda'),true);
 assert.equal(canAccess({role:'employee',rights:[]},'Agenda'),true);
 assert.equal(canAccess({role:'employee',rights:['Agenda']},'Ressources humaines'),true,'Les documents RH collectifs sont accessibles par défaut');
 assert.equal(canAccess({role:'employee',permissions_configured:true,rights:[]},'Ressources humaines'),false);
 assert.equal(canAccess({role:'admin',rights:[]},'Agenda'),true);
});


test('Planning réservé aux admins malgré un ancien droit, Communication ouverte à tous',()=>{
 const employee={role:'employee',permissions_configured:true,rights:['Emplois du temps'],edit_rights:['Emplois du temps']};
 assert.equal(canModify(employee,'Emplois du temps'),false);assert.equal(canAccess(employee,'Emplois du temps'),true);
 assert.equal(canModify({...employee,role:'admin'},'Emplois du temps'),true);
 assert.equal(canAccess({...employee,rights:[]},'Actualités'),true);assert.equal(canModify({...employee,rights:[]},'Actualités'),true);
 assert.equal(canAccess(null,'Actualités'),false);assert.equal(canModify(null,'Actualités'),false);
});

test('Agenda reste accessible même sans droit explicite et avec droits configurés',()=>{
 assert.equal(canAccess({role:'employee',rights:[],permissions_configured:true},'Agenda'),true);
 assert.equal(canAccess(null,'Agenda'),false);
});
