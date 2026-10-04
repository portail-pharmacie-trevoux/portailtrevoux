import { calculatePromoFlash } from './promoflash-core.js';
const element=(tag,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
const defaults={catalogue:'10,00',discount_floor:'30',discount_promo:'40',extra:'0,00',sell_floor:'12,90',sell_promo:'8,90',monthly:'100',vat:'20'};
const euro=value=>value===null?'—':value.toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
const decimal=value=>value===null?'—':value.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});
const percent=value=>value===null?'—':(value*100).toLocaleString('fr-FR',{maximumFractionDigits:1})+' %';
export function renderPromoFlash({container,api,isAdmin=false}){
  const root=element('div','','promoflash'),head=element('div','','promo-header'),logo=element('img');logo.src='/promoflash-logo.svg';logo.alt='PromoFlash — Analyse de rentabilité promotionnelle';
  head.append(logo,element('p','Décider avant de promouvoir.'));root.append(head,element('p','Les valeurs préremplies sont un exemple : adaptez-les à votre produit.','field-note'));
  const fields={},metrics={};
  function card(number,title,subtitle){const box=element('section','','promo-card'),heading=element('h3');heading.append(element('span',String(number),'promo-number'),element('span',title));box.append(heading,element('p',subtitle,'field-note'));root.append(box);return box;}
  function grid(parent){const row=element('div','','promo-fields');parent.append(row);return row;}
  function input(parent,key,label,value='',type='text'){
    const wrap=element('div','','promo-field'),l=element('label',label),e=element('input');e.id='promo-'+key;l.htmlFor=e.id;e.type=type;
    if(type==='text'){e.inputMode=key==='monthly'?'numeric':'decimal';e.autocomplete='off';e.maxLength=80;}
    e.value=value;fields[key]=e;e.addEventListener('input',recalculate);wrap.append(l,e);parent.append(wrap);return e;
  }
  function metric(parent,key,label){const wrap=element('div','','promo-metric'),output=element('output','—');wrap.append(element('span',label),output);parent.append(wrap);metrics[key]=output;}
  const product=card(1,'Produit & prix marché','Saisissez ou scannez un EAN : le produit est recherché automatiquement dans Open Beauty Facts, puis Open Food Facts.');
  const productForm=element('form','','promo-product-form'),eanLabel=element('label','Code EAN'),ean=element('input');ean.id='promo-ean';eanLabel.htmlFor=ean.id;ean.type='text';ean.inputMode='numeric';ean.maxLength=14;ean.placeholder='8, 12, 13 ou 14 chiffres';
  const search=element('button','Actualiser le produit','btn primary');search.type='submit';const price=element('button','Rechercher les prix','btn');price.type='button';
  const shopping=element('a','Voir Google Shopping','btn small');shopping.target='_blank';shopping.rel='noopener noreferrer';
  const updatePriceLink=()=>{shopping.href='https://www.google.com/search?tbm=shop&q='+encodeURIComponent(ean.value.trim());};
  productForm.append(eanLabel,ean,search,price);const info=element('p','Aucun produit chargé.','field-note');info.setAttribute('role','status');const image=element('img','','promo-product-image hidden');
  const photoStatus=element('p','','field-note');photoStatus.setAttribute('role','status');product.append(productForm,info,image,photoStatus);
  const nameWrap=grid(product),productName=input(nameWrap,'product_name','Nom du produit');productName.inputMode='text';
  productName.oninput=updatePriceLink;
  const links=element('div','','promo-product-form');links.append(shopping);product.append(links);
  const market=grid(product);input(market,'market_low','Prix minimum relevé (€ TTC)');input(market,'market_avg','Prix moyen relevé (€ TTC)');input(market,'market_high','Prix maximum relevé (€ TTC)');
  const site=input(market,'market_site','Site du prix minimum');site.inputMode='text';input(market,'market_date','Date du relevé','','date');
  const source=element('p','Fiches et photos : Open Beauty Facts / Open Food Facts.','field-note');product.append(source);
  const priceStatus=element('p','Cliquez sur « Rechercher les prix » pour remplir les cases à partir des offres Google Shopping.','field-note');priceStatus.setAttribute('role','status');market.before(priceStatus);
  const priceResults=element('section','','promo-price-results');priceResults.setAttribute('aria-label','Offres de prix trouvées');product.append(priceResults);
  let lookup=0,timer=null,offerData=[],selectedOffers=new Set(),retrievedAt=null;
  function resetMarket(){offerData=[];selectedOffers.clear();priceResults.replaceChildren();['market_low','market_avg','market_high','market_site','market_date'].forEach(key=>fields[key].value='');}
  function addOffers(items,at){
    retrievedAt=at;for(const offer of items){if(!offerData.some(old=>old.provider===offer.provider&&old.seller===offer.seller&&old.link===offer.link&&old.price===offer.price))offerData.push(offer);}offerData.forEach((offer,index)=>selectedOffers.add(index));fillMarket();drawOffers();
  }
  function drawOffers(){
    priceResults.querySelector('.promo-offers')?.remove();if(!offerData.length)return;
    const block=element('div','','promo-offers');block.append(element('p','Cochez uniquement les offres correspondant au même produit et au même conditionnement. Les prix sont hors frais de livraison.','field-note'));
    const list=element('div','','promo-offer-list');
    offerData.forEach((offer,index)=>{
      const row=element('label','','promo-offer-row'),check=element('input');check.type='checkbox';check.checked=selectedOffers.has(index);check.setAttribute('aria-label','Inclure '+offer.title+' chez '+offer.seller);check.onchange=()=>{if(check.checked)selectedOffers.add(index);else selectedOffers.delete(index);fillMarket();};
      const details=element('span');details.append(element('strong',offer.title),element('small',offer.provider+' · '+offer.seller+(offer.ageDays===null?'':' · mis à jour il y a '+offer.ageDays+' j')));
      const link=element('a','Voir l’offre');link.href=offer.link;link.target='_blank';link.rel='noopener noreferrer';
      row.append(check,details,element('strong',euro(offer.price)),link);if(offer.ageDays>30)row.classList.add('old-price');list.append(row);
    });
    block.append(list);priceResults.append(block);
  }
  function fillMarket(){
    const seen=new Set(),chosen=[...selectedOffers].map(index=>offerData[index]).filter(offer=>{const key=offer.seller.toLowerCase().replace(/\s/g,'')+':'+offer.price;if(seen.has(key))return false;seen.add(key);return true;});
    ['market_low','market_avg','market_high','market_site','market_date'].forEach(key=>fields[key].value='');
    if(!chosen.length){priceStatus.textContent='Aucune offre sélectionnée : cochez les offres du produit ou saisissez vos relevés.';return;}
    const min=chosen.reduce((a,b)=>a.price<=b.price?a:b),mean=chosen.reduce((sum,o)=>sum+o.price,0)/chosen.length;
    fields.market_low.value=min.price.toFixed(2).replace('.',',');fields.market_avg.value=mean.toFixed(2).replace('.',',');fields.market_high.value=Math.max(...chosen.map(o=>o.price)).toFixed(2).replace('.',',');fields.market_site.value=min.seller+' ('+min.provider+')';
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(retrievedAt)).map(p=>[p.type,p.value]));fields.market_date.value=parts.year+'-'+parts.month+'-'+parts.day;
    priceStatus.textContent='Cases remplies avec '+chosen.length+' offre'+(chosen.length>1?'s':'')+' Google Shopping. Prix indicatifs du jour, hors livraison : vérifiez le produit et le conditionnement, puis décochez les offres inadaptées ci-dessous pour actualiser les cases.';
  }

  async function loadPrices(request=lookup){
    const code=ean.value.trim();if(!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)){info.textContent='Renseignez un EAN pour rechercher les prix.';return;}
    price.disabled=true;priceStatus.textContent='Recherche des prix Google Shopping…';priceResults.replaceChildren(element('p','Recherche des offres de prix…','field-note'));offerData=[];selectedOffers.clear();
    try{
      const result=await api('/api/promoflash/prices/'+code);if(request!==lookup)return;
      priceResults.replaceChildren();retrievedAt=result.retrievedAt||new Date().toISOString();
      priceResults.append(element('p','Offres consultées le '+new Date(retrievedAt).toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'short',timeStyle:'short'})+'. Vérifiez la variante et le conditionnement avant de les utiliser.','field-note'));
      if(!result.googleConfigured)priceResults.append(element('p',isAdmin?'Google Shopping : la connexion est prête. Ajoutez la clé SERPAPI_KEY dans les variables Render pour activer les résultats automatiques.':'Google Shopping n’est pas encore activé par l’administrateur. Vous pouvez utiliser le lien de recherche.','field-note'));
      if(result.googleError)priceResults.append(element('p','Google Shopping est momentanément indisponible ou son quota est atteint.','field-note'));
      if((result.google||[]).length)addOffers(result.google,retrievedAt);
      else priceStatus.textContent=!result.googleConfigured?'Les prix ne peuvent pas encore être récupérés : la connexion Google Shopping doit être activée par l’administrateur.':result.googleError?'Recherche indisponible : aucun prix récupéré. Réessayez plus tard.':'Aucun prix trouvé pour cet EAN.';
      if(!(result.google||[]).length)priceResults.append(element('p','Aucune offre exploitable. Vous pouvez relancer la recherche ou saisir vos relevés manuellement.','field-note'));
    }catch(e){if(request===lookup){priceResults.replaceChildren(element('p',e.message,'field-note'));priceStatus.textContent='La recherche des prix a échoué : '+e.message;}}finally{if(request===lookup)price.disabled=false;}
  }
  async function loadProduct(){
    clearTimeout(timer);const code=ean.value.trim(),request=++lookup;
    if(!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)){info.textContent='Saisissez un EAN de 8, 12, 13 ou 14 chiffres.';return;}
    search.disabled=true;image.classList.add('hidden');image.removeAttribute('src');info.textContent='Recherche du produit…';
    try{const result=await api('/api/promoflash/product/'+code);if(request!==lookup)return;
      info.textContent=result.found?result.name+(result.brand?' · '+result.brand:'')+(result.quantity?' · '+result.quantity:'')+' · EAN '+code:'Produit non trouvé dans Open Beauty Facts ou Open Food Facts. La recherche de prix utilise votre EAN.';
      productName.value=result.found?result.name+(result.quantity?' '+result.quantity:''):'';source.textContent='Fiche produit : '+(result.source||'Open Beauty Facts / Open Food Facts');updatePriceLink();
      photoStatus.textContent=result.image?'Chargement de la photo…':'Aucune photo disponible dans la fiche produit.';
      if(result.image){image.onload=()=>{if(request===lookup){image.classList.remove('hidden');photoStatus.textContent='';}};image.onerror=()=>{if(request===lookup){image.classList.add('hidden');photoStatus.textContent='La photo n’a pas pu être chargée. Cliquez sur « Actualiser le produit » pour réessayer.';}};image.alt=result.name;image.src=result.image;}

    }catch(e){if(request===lookup)info.textContent=e.message+' Les calculs restent disponibles.';}finally{if(request===lookup)search.disabled=false;}
  }
  productForm.onsubmit=event=>{event.preventDefault();void loadProduct();};price.onclick=async()=>{clearTimeout(timer);price.disabled=true;if(!productName.value)await loadProduct();void loadPrices();};
  ean.oninput=()=>{lookup++;clearTimeout(timer);search.disabled=false;price.disabled=false;image.classList.add('hidden');photoStatus.textContent='';productName.value='';resetMarket();priceStatus.textContent='Cliquez sur « Rechercher les prix » pour remplir les cases.';updatePriceLink();if(/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(ean.value.trim()))timer=setTimeout(()=>{if(root.isConnected)void loadProduct();},700);else info.textContent='Saisissez ou scannez le code EAN.';};
  updatePriceLink();
  const purchase=card(2,'Conditions commerciales','Les deux remises sont appliquées séparément au prix catalogue HT.');const purchases=grid(purchase);
  input(purchases,'catalogue','Prix catalogue (€ HT)',defaults.catalogue);input(purchases,'discount_floor','Remise fond de rayon (%)',defaults.discount_floor);input(purchases,'discount_promo','Remise promo (%)',defaults.discount_promo);
  const costs=grid(purchase);metric(costs,'costFloor','Achat fond de rayon HT');metric(costs,'costPromo','Achat promo HT');
  const extras=card(3,'Rémunérations supplémentaires','Optionnel : tête de gondole, unités gratuites, coopération commerciale… Saisissez la valeur nette HT par unité.');
  const toggleLabel=element('label','','promo-toggle'),toggle=element('input');toggle.type='checkbox';toggle.id='promo-extra-enabled';toggleLabel.append(toggle,element('span','Activer une rémunération supplémentaire'));extras.append(toggleLabel);
  const extrasGrid=grid(extras),extra=input(extrasGrid,'extra','Rémunération par unité (€ HT)',defaults.extra);extra.disabled=true;metric(extrasGrid,'netPromo','Coût net promo HT');const netNote=element('p','','field-note');extras.append(netNote);
  toggle.onchange=()=>{extra.disabled=!toggle.checked;recalculate();};
  const sales=card(4,'Prix de vente & marge','Marge unitaire HT et taux de marge rapporté au coût d’achat HT. Coefficient = prix TTC ÷ coût HT.');const saleInputs=grid(sales);
  input(saleInputs,'sell_floor','Vente habituelle (€ TTC)',defaults.sell_floor);input(saleInputs,'sell_promo','Vente promo (€ TTC)',defaults.sell_promo);
  const vatWrap=element('div','','promo-field'),vatLabel=element('label','TVA (%)'),vat=element('select');vat.id='promo-vat';vatLabel.htmlFor=vat.id;[20,10,5.5,2.1].forEach(value=>{const option=element('option',String(value).replace('.',','));option.value=String(value);vat.append(option);});fields.vat=vat;vat.onchange=recalculate;vatWrap.append(vatLabel,vat);saleInputs.append(vatWrap);
  const margins=grid(sales);[['marginFloor','Marge habituelle / unité'],['rateFloor','Taux de marge habituel'],['coefFloor','Coefficient habituel'],['marginPromo','Marge promo / unité'],['ratePromo','Taux de marge promo'],['coefPromo','Coefficient promo']].forEach(([key,label])=>metric(margins,key,label));
  const volume=card(5,'Volume nécessaire','Quantités à vendre pour conserver la marge brute mensuelle habituelle.');input(grid(volume),'monthly','Ventes mensuelles habituelles (unités)',defaults.monthly);const volumeMetrics=grid(volume);
  [['baseMargin','Marge mensuelle habituelle'],['units','Unités nécessaires en promo'],['factor','Volume de maintien'],['promoX2','Marge totale si ventes ×2'],['gainX2','Gain / perte si ventes ×2']].forEach(([key,label])=>metric(volumeMetrics,key,label));
  const simulation=element('div','','promo-simulations');volume.append(element('h4','Simulation de volume'),simulation);[1,1.5,2,2.5,3].forEach(factor=>metric(simulation,'sim'+factor,'Promo ×'+String(factor).replace('.',',')));
  const verdictCard=card(6,'PromoFlash — objectif de volume','Repère du prototype : comparer le volume nécessaire à un doublement des ventes. Ce repère ne prédit pas les ventes réelles.');
  const gauge=element('div','','promo-gauge'),marker=element('span','','promo-marker');marker.setAttribute('aria-hidden','true');gauge.append(marker);const ticks=element('div','','promo-gauge-ticks');[0,1,2,3,4].forEach(n=>ticks.append(element('span','×'+n)));
  const verdict=element('p','','promo-verdict'),explanation=element('p','','field-note');verdict.setAttribute('role','status');verdictCard.append(gauge,ticks,verdict,explanation);
  const errors=element('p','','error');errors.setAttribute('role','status');root.append(errors,element('p','Calcul de marge brute HT, hors frais de campagne et autres charges. Les prix de marché proviennent des offres Google Shopping sélectionnées ou de vos relevés manuels, hors livraison.','field-note'));
  const reset=element('button','Réinitialiser l’exemple','btn');reset.type='button';reset.onclick=()=>{lookup++;clearTimeout(timer);resetMarket();price.disabled=false;search.disabled=false;ean.value='';Object.entries(fields).forEach(([key,e])=>e.value=defaults[key]||'');toggle.checked=false;extra.disabled=true;image.classList.add('hidden');image.removeAttribute('src');info.textContent='Aucun produit chargé.';photoStatus.textContent='';priceStatus.textContent='Cliquez sur « Rechercher les prix » pour remplir les cases.';updatePriceLink();recalculate();};root.append(reset);
  function recalculate(){
    if(!fields.monthly)return;
    const values=Object.fromEntries(Object.entries(fields).map(([key,e])=>[key,e.value]));values.extra_enabled=toggle.checked;const result=calculatePromoFlash(values);
    errors.textContent=result.errors.join(' ');netNote.textContent=result.extraAboveCost?'La rémunération dépasse le coût d’achat promo : le coût net est ramené à 0 €.':'';
    if(result.errors.length){Object.values(metrics).forEach(e=>e.textContent='—');verdict.textContent='Complétez les données de calcul.';verdictCard.dataset.zone='none';explanation.textContent='';marker.style.display='none';return;}
    for(const key of ['costFloor','costPromo','netPromo','marginFloor','marginPromo','baseMargin','promoX2','gainX2'])metrics[key].textContent=euro(result[key]);
    ['rateFloor','ratePromo'].forEach(key=>metrics[key].textContent=percent(result[key]));['coefFloor','coefPromo'].forEach(key=>metrics[key].textContent=decimal(result[key]));
    metrics.units.textContent=result.units===null?'—':result.units.toLocaleString('fr-FR');metrics.factor.textContent=result.factor===null?'—':'×'+decimal(result.factor);
    result.simulations.forEach(s=>metrics['sim'+s.multiplier].textContent=euro(s.margin));verdictCard.dataset.zone=result.zone;
    marker.style.display=result.factor===null?'none':'block';marker.style.left=Math.max(0,Math.min(100,result.factor/4*100))+'%';
    if(result.marginPromo<=0){verdict.textContent=result.marginPromo<0?'Marge promo négative':'Marge promo nulle';explanation.textContent='Augmenter le volume ne permet pas de retrouver une marge habituelle positive.';verdictCard.dataset.zone='red';}
    else if(result.factor===null){verdict.textContent='Objectif de maintien non calculable';explanation.textContent='Renseignez un volume mensuel positif et une marge habituelle positive.';}
    else{verdict.textContent=result.zone==='green'?'Objectif de maintien ≤ ×2':result.zone==='orange'?'Objectif de maintien entre ×2 et ×3':'Objectif de maintien ≥ ×3';explanation.textContent='Il faut vendre '+result.units.toLocaleString('fr-FR')+' unités, soit ×'+decimal(result.factor)+' le volume habituel, pour conserver la marge brute mensuelle.';}
  }
  container.replaceChildren(root);recalculate();
}
