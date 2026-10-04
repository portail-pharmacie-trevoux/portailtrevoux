import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductSources,productPayload,shoppingOffers,summarizeOffers } from '../product-sources.mjs';
const beauty={status:'success',result:{id:'product_found'},product:{product_name:'Crème',brands:'Marque',quantity:'50 ml',image_front_url:'https://images.openbeautyfacts.org/images/products/123/front.jpg'}};
test('import Beauty Facts v3 et photos limitées aux domaines de la base',()=>{
 assert.equal(productPayload(beauty,'Open Beauty Facts').found,true);
 assert.equal(productPayload(beauty,'Open Beauty Facts').quantity,'50 ml');
 assert.equal(productPayload({...beauty,product:{...beauty.product,image_front_url:'https://evil.test/image.jpg'}},'Open Beauty Facts').image,'');
});
test('recherche automatique : Beauty en priorité, repli Food et cache des requêtes concurrentes',async()=>{
 let calls=0;const sources=createProductSources({origin:'https://test.example',fetchImpl:async url=>{calls++;return {ok:true,json:async()=>url.includes('openbeautyfacts')?{status:'failure'}:{...beauty,status:1}};}});
 const [a,b]=await Promise.all([sources.product('1234567890123'),sources.product('1234567890123')]);assert.equal(a.source,'Open Food Facts');assert.equal(b.found,true);assert.equal(calls,2);await sources.product('1234567890123');assert.equal(calls,2);
 await assert.rejects(()=>sources.product('123'),/EAN/);
});
test('Shopping : euros seulement, prix positifs, liens sûrs et doublons exclus',()=>{
 const offer={title:'Crème 50 ml',source:'Boutique',price:'12,00 €',extracted_price:12,product_link:'https://www.google.com/shopping/product/123'};
 const offers=shoppingOffers({shopping_results:[offer,offer,{...offer,price:'$12'},{...offer,extracted_price:-1},{...offer,product_link:'javascript:alert(1)'}]});assert.equal(offers.length,1);assert.equal(offers[0].verified,false);
 assert.equal(summarizeOffers(offers).mean,12);assert.equal(summarizeOffers([]),null);
});
test('Google Shopping reste désactivé sans clé et ne lance aucun appel facturable',async()=>{
 const sources=createProductSources({origin:'https://test.example',fetchImpl:async()=>assert.fail()});const result=await sources.prices('1234567890123');assert.equal(result.googleConfigured,false);assert.deepEqual(result.google,[]);
});
test('Shopping connecté : pays France, recherche EAN et clé seulement côté serveur',async()=>{
 let calls=0;const sources=createProductSources({origin:'https://test.example',serpKey:'private-test-key',fetchImpl:async url=>{calls++;const u=new URL(url);assert.equal(u.searchParams.get('gl'),'fr');assert.equal(u.searchParams.get('q'),'1234567890123');assert.equal(u.searchParams.get('api_key'),'private-test-key');return {ok:true,json:async()=>({shopping_results:[{title:'Produit',source:'Site',price:'5 €',extracted_price:5,link:'https://example.test/produit'}]})};}});
 const result=await sources.prices('1234567890123');assert.equal(result.google[0].price,5);assert.ok(!JSON.stringify(result).includes('private-test-key'));await sources.prices('1234567890123');assert.equal(calls,1);
});
test('régression EAN 3337875597449 : réponse v3 success, nom et photo anglaise',async()=>{
 const sources=createProductSources({origin:'https://test.example',fetchImpl:async url=>{
  assert.ok(url.includes('/3337875597449.json'));
  return {ok:true,json:async()=>({code:'3337875597449',status:'success',result:{id:'product_found'},product:{code:'3337875597449',brands:'CeraVe',product_name:'CeraVe Hydraterende Gezichtscrème',quantity:'52ml',image_front_url:'https://images.openbeautyfacts.org/images/products/333/787/559/7449/front_en.9.400.jpg'}})};
 }});
 const p=await sources.product('3337875597449');assert.equal(p.found,true);assert.equal(p.brand,'CeraVe');assert.equal(p.quantity,'52ml');assert.match(p.image,/front_en/);
});
