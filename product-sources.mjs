const eanPattern=/^(\d{8}|\d{12}|\d{13}|\d{14})$/;
export function validateEAN(ean){if(typeof ean!=='string'||!eanPattern.test(ean))throw Object.assign(Error('Code EAN invalide.'),{status:400});return ean;}
export function productPayload(data,source){
  const found=data?.status===1||data?.status==='success'&&data?.result?.id==='product_found',p=data?.product||{};let image='';
  try{const url=new URL(p.image_front_url);if(['https://images.openbeautyfacts.org','https://images.openfoodfacts.org'].includes(url.origin)&&url.pathname.startsWith('/images/products/'))image=url.href;}catch{}
  return {found,name:String(p.product_name_fr||p.product_name||'Produit sans nom').slice(0,300),brand:String(p.brands||'').slice(0,200),quantity:String(p.quantity||'').slice(0,80),image:found?image:'',source};
}
export function safeLink(value){try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}}
export function shoppingOffers(data){
  const all=[...(data.shopping_results||[]),...(data.inline_shopping_results||[]),...(data.categorized_shopping_results||[]).flatMap(group=>group.shopping_results||[])],seen=new Set(),offers=[];
  for(const item of all){
    const price=item.extracted_price,link=safeLink(item.link||item.product_link),seller=String(item.source||'Marchand').slice(0,100),title=String(item.title||'').slice(0,300);
    if(typeof price!=='number'||!Number.isFinite(price)||price<=0||!link||!String(item.price||'').match(/€|EUR/i))continue;
    const key=seller+':'+title+':'+price;if(seen.has(key))continue;seen.add(key);
    offers.push({title,seller,price,link,provider:'Google Shopping',ageDays:null,verified:false});
  }
  return offers.slice(0,40);
}
export function summarizeOffers(offers){
  if(!offers.length)return null;const min=offers.reduce((a,b)=>a.price<=b.price?a:b);
  return {minimum:min.price,maximum:Math.max(...offers.map(o=>o.price)),mean:offers.reduce((sum,o)=>sum+o.price,0)/offers.length,seller:min.seller,count:offers.length};
}
export function createProductSources({origin,serpKey,fetchImpl=fetch}){
  const cache=new Map(),pending=new Map();
  function cached(key,work){
    const stored=cache.get(key);if(stored&&stored.until>Date.now())return Promise.resolve(stored.value);if(pending.has(key))return pending.get(key);
    const promise=work().then(value=>{if(cache.size>=200)cache.delete(cache.keys().next().value);cache.set(key,{value,until:Date.now()+3600000});return value;}).finally(()=>pending.delete(key));pending.set(key,promise);return promise;
  }
  async function json(url){const response=await fetchImpl(url,{headers:{'User-Agent':'PortailPlus-PromoFlash/1.1 ('+origin+')'},signal:AbortSignal.timeout(12000)});if(!response.ok&&response.status!==404)throw Error('Source indisponible');return response.json();}
  async function product(ean){validateEAN(ean);return cached('product:'+ean,async()=>{
    let failed=0;
    for(const [host,source] of [['openbeautyfacts.org','Open Beauty Facts'],['openfoodfacts.org','Open Food Facts']]){
      try{const result=productPayload(await json('https://world.'+host+'/api/v3/product/'+ean+'.json?fields=product_name,product_name_fr,brands,image_front_url,quantity,code'),source);if(result.found)return result;}catch{failed++;}
    }
    if(failed===2)throw Object.assign(Error('La recherche de produit est momentanément indisponible.'),{status:502});
    return {found:false,image:'',source:'Open Beauty Facts / Open Food Facts'};
  });}
  async function prices(ean){validateEAN(ean);
    return cached('prices:'+ean,async()=>{
      const retrievedAt=new Date().toISOString();
      if(!serpKey)return {retrievedAt,googleConfigured:false,google:[],googleError:false};
      try{
        const params=new URLSearchParams({engine:'google_shopping',q:ean,gl:'fr',hl:'fr',google_domain:'google.fr',api_key:serpKey});
        const data=await json('https://serpapi.com/search.json?'+params);if(data.error)throw Error('Source indisponible');
        return {retrievedAt,googleConfigured:true,google:shoppingOffers(data),googleError:false};
      }catch{return {retrievedAt,googleConfigured:true,google:[],googleError:true};}
    });
  }
  async function image(ean){
    const result=await product(ean);
    if(!result.image)throw Object.assign(Error('Aucune photo disponible pour ce produit.'),{status:404});
    const response=await fetchImpl(result.image,{redirect:'error',signal:AbortSignal.timeout(12000)});
    const type=(response.headers.get('content-type')||'').split(';')[0];
    if(!response.ok||!['image/jpeg','image/png','image/webp'].includes(type))throw Object.assign(Error('La photo du produit est momentanément indisponible.'),{status:502});
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>2097152)throw Object.assign(Error('Photo trop volumineuse.'),{status:502});chunks.push(chunk);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    return {bytes,type};
  }
  return {product,prices,image};
}
