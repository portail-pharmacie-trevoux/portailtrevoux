import https from 'node:https';
import {lookup as dnsLookup} from 'node:dns/promises';
import {publicProductURL,publicAddress,readPublicProductPage,extractVerifiedProduct,sourceDomain} from './merchandising-web-identity.mjs';
import {webValidationMethod} from './merchandising-product-lookup.mjs';

// Only use the image attached to the structured Product with the exact GTIN.
export function extractExactProductImage(html,ean,pageURL){
 if(!/^\d{13}$/.test(ean))return null;
 for(const match of String(html).matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  let obj;try{obj=JSON.parse(match[1]);}catch{continue;}const stack=[obj];let n=0;
  while(stack.length&&n++<1000){const item=stack.pop();if(!item||typeof item!=='object')continue;if(Array.isArray(item)){stack.push(...item.slice(0,100));continue;}
   const types=Array.isArray(item['@type'])?item['@type']:[item['@type']];const exact=[item.gtin13,item.gtin,item.gtin14].some(x=>String(x||'').replace(/\s/g,'').replace(/^0(?=\d{13}$)/,'')===ean);
   if(exact&&types.some(t=>/^(?:https?:\/\/schema.org\/)?Product$/i.test(t||''))){const images=Array.isArray(item.image)?item.image:[item.image];for(const image of images){const src=typeof image==='string'?image:image?.contentUrl||image?.url;if(typeof src!=='string')continue;try{const u=publicProductURL(new URL(src,pageURL).href);if(u)return u.href;}catch{}}}
   for(const v of Object.values(item))if(v&&typeof v==='object')stack.push(v);
  }
 }return null;
}
export async function readPublicProductImage(value,redirects=0){
 const url=publicProductURL(value);if(!url||redirects>3)throw Error('Image non disponible.');const addresses=await dnsLookup(url.hostname,{all:true});if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error('Adresse non publique.');const address=addresses.find(a=>a.family===4)||addresses[0];
 return await new Promise((resolve,reject)=>{const req=https.get(url,{headers:{'user-agent':'PortailPlus-ProductIdentity/1.2','accept':'image/jpeg,image/png,image/webp','accept-encoding':'identity'},lookup:(host,options,cb)=>options?.all?cb(null,[address]):cb(null,address.address,address.family)},res=>{
  if([301,302,303,307,308].includes(res.statusCode)){res.resume();if(!res.headers.location){reject(Error('Redirection invalide.'));return;}readPublicProductImage(new URL(res.headers.location,url).href,redirects+1).then(resolve,reject);return;}
  if(res.statusCode!==200){res.resume();reject(Error('Image indisponible.'));return;}const chunks=[];let size=0;res.on('data',c=>{size+=c.length;if(size>1500000){req.destroy(Error('Image trop volumineuse.'));return;}chunks.push(c);});res.on('end',()=>{const bytes=Buffer.concat(chunks);let type='';if(bytes.length>3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)type='image/jpeg';else if(bytes.length>8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))type='image/png';else if(bytes.length>12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')type='image/webp';if(!type){reject(Error('Format d’image invalide.'));return;}resolve({bytes,type});});res.on('error',reject);
 });req.setTimeout(9000,()=>req.destroy(Error('Image trop lente.')));req.on('error',reject);});
}
export async function findProductPhoto({ean,record,readPage=readPublicProductPage,readImage=readPublicProductImage}){
 const sources=record?.sources||[],domains=new Set(sources.map(s=>s.domain).filter(Boolean));if(record?.validationMethod!==webValidationMethod||record.validated!==true||domains.size<2)return null;
 for(const source of sources.slice(0,4)){if(!publicProductURL(source.url)||sourceDomain(source.url)!==source.domain)continue;try{const page=await readPage(source.url);if(sourceDomain(page.url)!==source.domain||!extractVerifiedProduct(page.html,ean))continue;const image=extractExactProductImage(page.html,ean,page.url);if(!image)continue;const result=await readImage(image);return{...result,source:page.url};}catch{}}
 return null;
}
export function registerMerchProductPhoto({app,db,auth,ready,view,fail}){
 app.get('/api/merchandising/impact/products/:ean/photo',auth,ready,view,async(req,res)=>{const ean=req.params.ean;if(!/^\d{13}$/.test(ean))throw fail(400,'EAN invalide.');const row=(await db.query("SELECT data FROM merchandising_product_names WHERE ean=$1 AND data->>'validationMethod'=$2 AND data->>'validated'='true' AND checked_at>now()-interval '7 days'",[ean,webValidationMethod])).rows[0];const photo=await findProductPhoto({ean,record:row?.data});if(!photo)throw fail(404,'Photo non trouvée. Ajoutez-la manuellement.');res.set('X-Product-Source',photo.source);res.set('Cache-Control','private, max-age=3600');res.type(photo.type).send(photo.bytes);});
}
