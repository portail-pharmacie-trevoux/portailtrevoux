import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEmployeeDetails} from '../employee-details.mjs';
import {canAccess,canModify} from '../security.mjs';
import {employeeFields} from '../public/employee-fields.js';
const fail=(status,message)=>Object.assign(Error(message),{status});
test('fiche exhaustive : coordonnées, NIR, contrat, horaires, rémunération et suivi',()=>{
 assert(employeeFields.length>=90);const value={contractType:'CDI',weeklyHours:'35',grossBasePay:'2500,50',socialSecurityNumber:'199001000000000',iban:'FR0000000000000000000000000',signedContractReceived:true};
 assert.deepEqual(validateEmployeeDetails(value,fail),value);
 for(const invalid of [{unknown:'x'},{weeklyHours:'-2'},{withholdingRate:'101'},{contractStart:'2026-02-30'},{contractType:'wrong'},{signedContractReceived:'true'},{personalEmail:'wrong'},{socialSecurityNumber:'123'},{contractStart:'2026-10-05',contractEnd:'2026-10-04'}])assert.throws(()=>validateEmployeeDetails(invalid,fail));
});
test('consultation et modification sont distinctes et les fiches RH restent administrateur',()=>{
 const reader={role:'employee',permissions_configured:true,rights:['Fun','Collaborateurs'],edit_rights:[]};assert.equal(canAccess(reader,'Fun'),true);assert.equal(canModify(reader,'Fun'),false);assert.equal(canAccess(reader,'Agenda'),false);
 assert.equal(canModify({...reader,edit_rights:['Fun']},'Fun'),true);assert.equal(canModify({...reader,edit_rights:['Collaborateurs']},'Collaborateurs'),false);
 assert.equal(canModify({...reader,rights:[],edit_rights:['Fun']},'Fun'),false);assert.equal(canModify({role:'admin'},'Collaborateurs'),true);
 assert.equal(canModify({role:'employee',rights:[]},'Fun'),true,'legacy music participation remains until configured');
});
