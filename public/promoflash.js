import { calculatePromoFlash } from './promoflash-core.js';
const element=(tag,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
const defaults={catalogue:'10,00',discount_floor:'30',discount_promo:'40',extra:'0,00',sell_floor:'12,90',sell_promo:'8,90',monthly:'100',vat:'20'};
const euro=value=>value===null?'—':value.toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
const decimal=value=>value===null?'—':value.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});
const percent=value=>value===null?'—':(value*100).toLocaleString('fr-FR',{maximumFractionDigits:1})+' %';
export function renderPromoFlash({container,api}){
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
  const product=card(1,'Produit & prix marché','Recherche du produit par EAN. Les prix minimum, moyen et maximum sont vos relevés manuels.');
  const productForm=element('form','','promo-product-form'),eanLabel=element('label','Code EAN'),ean=element('input');ean.id='promo-ean';eanLabel.htmlFor=ean.id;ean.type='text';ean.inputMode='numeric';ean.maxLength=14;ean.placeholder='8, 12, 13 ou 14 chiffres';
  const search=element('button','Rechercher le produit','btn primary');search.type='submit';const price=element('a','Rechercher les prix','btn');price.target='_blank';price.rel='noopener noreferrer';price.href='https://www.google.com/search?q=prix';
  const updatePriceLink=()=>{price.href='https://www.google.com/search?q='+encodeURIComponent('"'+ean.value.trim()+'" prix '+new Date().getFullYear());};ean.oninput=updatePriceLink;
  productForm.append(eanLabel,ean,search,price);const info=element('p','Aucun produit chargé.','field-note');info.setAttribute('role','status');const image=element('img','','promo-product-image hidden');
  product.append(productForm,info,image);
  let lookup=0;
  productForm.onsubmit=async event=>{
    event.preventDefault();const code=ean.value.trim(),request=++lookup;
    if(!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)){info.textContent='Saisissez un EAN de 8, 12, 13 ou 14 chiffres.';return;}
    search.disabled=true;image.classList.add('hidden');image.removeAttribute('src');info.textContent='Recherche du produit…';
    try{const result=await api('/api/promoflash/product/'+code);if(request!==lookup)return;
      info.textContent=result.found?result.name+(result.brand?' · '+result.brand:'')+' · EAN '+code:'Produit non trouvé dans Open Food Facts. Vous pouvez saisir les conditions commerciales et calculer la marge.';
      if(result.image){image.src=result.image;image.alt=result.name;image.classList.remove('hidden');image.onerror=()=>image.classList.add('hidden');}
    }catch(e){if(request===lookup)info.textContent=e.message+' Les calculs restent disponibles.';}finally{if(request===lookup)search.disabled=false;}
  };
  const market=grid(product);input(market,'market_low','Prix minimum relevé (€ TTC)');input(market,'market_avg','Prix moyen relevé (€ TTC)');input(market,'market_high','Prix maximum relevé (€ TTC)');
  const site=input(market,'market_site','Site du prix minimum');site.inputMode='text';input(market,'market_date','Date du relevé','','date');
  const source=element('a','Fiches et photos : Open Food Facts','field-note');source.href='https://world.openfoodfacts.org';source.target='_blank';source.rel='noopener noreferrer';product.append(source);
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
  const errors=element('p','','error');errors.setAttribute('role','status');root.append(errors,element('p','Calcul de marge brute HT, hors frais de campagne et autres charges. Les prix de marché sont des relevés saisis manuellement.','field-note'));
  const reset=element('button','Réinitialiser l’exemple','btn');reset.type='button';reset.onclick=()=>{lookup++;search.disabled=false;ean.value='';Object.entries(fields).forEach(([key,e])=>e.value=defaults[key]||'');toggle.checked=false;extra.disabled=true;image.classList.add('hidden');image.removeAttribute('src');info.textContent='Aucun produit chargé.';updatePriceLink();recalculate();};root.append(reset);
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
