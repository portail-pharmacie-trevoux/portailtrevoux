import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePromoFlash } from '../public/promoflash-core.js';
const example={catalogue:'10,00',discount_floor:'30',discount_promo:'40',extra_enabled:false,extra_total:'0',extra_units:'',sell_floor:'12,90',sell_promo:'8,90',monthly:'100',vat:'20'};
test('reproduit les coûts, marges HT et volume du prototype Windows',()=>{
 const r=calculatePromoFlash(example);assert.deepEqual(r.errors,[]);assert.equal(r.costFloor,7);assert.equal(r.costPromo,6);assert.equal(r.netPromo,6);
 assert.ok(Math.abs(r.marginFloor-3.75)<1e-10);assert.ok(Math.abs(r.marginPromo-1.4166666666667)<1e-10);assert.equal(r.units,265);assert.equal(r.factor,2.65);assert.equal(r.zone,'orange');
 assert.ok(Math.abs(r.gainX2+91.6666666667)<1e-7);assert.equal(r.simulations.length,5);
});
test('rémunération totale répartie sur les unités engagées, puis répercutée dans la marge',()=>{
 const r=calculatePromoFlash({...example,extra_enabled:true,extra_total:'150,00',extra_units:'50'});
 assert.deepEqual(r.errors,[]);assert.equal(r.extraPerUnit,3);assert.equal(r.netPromo,3);assert.ok(Math.abs(r.marginPromo-4.4166666666667)<1e-10);assert.equal(r.units,85);
 assert.equal(calculatePromoFlash({...example,extra_total:'invalide',extra_units:'0'}).netPromo,6);
 const negative=calculatePromoFlash({...example,extra_enabled:true,extra_total:'700',extra_units:'100'});assert.equal(negative.netPromo,-1);assert.equal(negative.extraAboveCost,true);
});
test('les unités engagées sont obligatoires, positives et entières quand la rémunération est activée',()=>{
 for(const units of ['', '0', '-1', '1,5'])assert.ok(calculatePromoFlash({...example,extra_enabled:true,extra_total:'150',extra_units:units}).errors.length);
});
test('aucun volume impossible ou nombre trompeur quand marge nulle, négative ou volume zéro',()=>{
 assert.equal(calculatePromoFlash({...example,sell_promo:'7,20'}).units,null);
 assert.equal(calculatePromoFlash({...example,sell_promo:'1'}).factor,null);
 assert.equal(calculatePromoFlash({...example,monthly:'0'}).factor,null);
});
test('refuse champs vides, nombres non finis, remises hors limites et unités fractionnaires',()=>{
 for(const patch of [{catalogue:''},{catalogue:'NaN'},{discount_floor:'101'},{monthly:'1,5'},{vat:'19'}])assert.ok(calculatePromoFlash({...example,...patch}).errors.length);
});
