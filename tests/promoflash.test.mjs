import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePromoFlash } from '../public/promoflash-core.js';
const example={catalogue:'10,00',discount_floor:'30',discount_promo:'40',extra_enabled:false,extra:'0',sell_floor:'12,90',sell_promo:'8,90',monthly:'100',vat:'20'};
test('reproduit les coûts, marges HT et volume du prototype Windows',()=>{
 const r=calculatePromoFlash(example);assert.deepEqual(r.errors,[]);assert.equal(r.costFloor,7);assert.equal(r.costPromo,6);assert.equal(r.netPromo,6);
 assert.ok(Math.abs(r.marginFloor-3.75)<1e-10);assert.ok(Math.abs(r.marginPromo-1.4166666666667)<1e-10);assert.equal(r.units,265);assert.equal(r.factor,2.65);assert.equal(r.zone,'orange');
 assert.ok(Math.abs(r.gainX2+91.6666666667)<1e-7);assert.equal(r.simulations.length,5);
});
test('rémunération optionnelle ignorée si désactivée et coût net plafonné à zéro',()=>{
 assert.equal(calculatePromoFlash({...example,extra:'invalide'}).netPromo,6);
 const r=calculatePromoFlash({...example,extra_enabled:true,extra:'7'});assert.equal(r.netPromo,0);assert.equal(r.ratePromo,null);assert.equal(r.coefPromo,null);assert.equal(r.extraAboveCost,true);
});
test('aucun volume impossible ou nombre trompeur quand marge nulle, négative ou volume zéro',()=>{
 assert.equal(calculatePromoFlash({...example,sell_promo:'7,20'}).units,null);
 assert.equal(calculatePromoFlash({...example,sell_promo:'1'}).factor,null);
 assert.equal(calculatePromoFlash({...example,monthly:'0'}).factor,null);
});
test('refuse champs vides, nombres non finis, remises hors limites et unités fractionnaires',()=>{
 for(const patch of [{catalogue:''},{catalogue:'NaN'},{discount_floor:'101'},{monthly:'1,5'},{vat:'19'}])assert.ok(calculatePromoFlash({...example,...patch}).errors.length);
});
