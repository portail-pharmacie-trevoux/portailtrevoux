// Éditeur autonome : les coordonnées du gabarit sont fixes, les champs restent éditables.
export function renderPromotionLabel({container,promotion=null,month='',api=null,isCurrent=()=>true}){
 const key='portail-plus-etiquette-promo-v1';
 const defaults={date:'',slogan:'',old:'',sale:'',unit:'',name:'',photo:'',logo1:'',logo2:''};
 let data={...defaults};if(!promotion)try{data={...data,...JSON.parse(localStorage.getItem(key)||'{}')}}catch{}
 const root=document.createElement('section');root.className='promo-editor';
 if(!document.querySelector('link[data-promo-editor]')){const style=document.createElement('link');style.rel='stylesheet';style.href='/promotion-label-editor.css?v=20261026-prix-central';style.dataset.promoEditor='1';document.head.append(style)}
 const heading=document.createElement('h3');heading.textContent='Étiquette promotionnelle personnalisable';
 const note=document.createElement('p');note.textContent='Format fixe horizontal : 105 × 99,6 mm (estimation issue du modèle). Les repères ne sont pas imprimés. Deux étiquettes par feuille A4.';note.className='field-note';
 const controls=document.createElement('div');controls.className='promo-controls';const fieldInputs={};let photoRevision=0;
 const preview=document.createElement('div');preview.className='promo-label';
 const fields=[
  ['date','1 · Date de validité','text'],['slogan','2 · Accroche promotionnelle','text'],['old','3 · Prix barré (€)','text'],
  ['photo','4 · Photo produit','file'],['logo1','5 · Logo 1','file'],['logo2','6 · Logo 2','file'],
  ['sale','7 · Prix promotionnel (€)','text'],['unit','8 · Prix au litre (€ / L)','text'],['name','9 · Intitulé produit','text']];
 const save=()=>{try{localStorage.setItem(key,JSON.stringify(data))}catch{status.textContent='Stockage local saturé : images trop volumineuses.'}};
 const cells={};for(const id of ['date','slogan','old','photo','logo1','logo2','sale','unit','name']){
  const cell=document.createElement('div');cell.className='promo-zone promo-'+id;cell.dataset.zone=id;cell.dataset.number=String(fields.findIndex(field=>field[0]===id)+1);preview.append(cell);cells[id]=cell;
 }
 const money=v=>{const s=String(v||'').trim();return s&&!s.includes('€')?s+' €':s};
 function update(){
  cells.date.textContent=data.date.toLocaleUpperCase('fr-FR');cells.slogan.textContent=data.slogan.toLocaleUpperCase('fr-FR');
  cells.old.textContent=money(data.old);cells.sale.textContent=money(data.sale);cells.unit.textContent=data.unit?money(data.unit)+' / L':'';
  cells.name.textContent=data.name;
  for(const id of ['photo','logo1','logo2']){cells[id].replaceChildren();if(data[id]){const img=document.createElement('img');img.src=data[id];img.alt=id;cells[id].append(img)}}
 }
 const status=document.createElement('p');status.className='field-note';status.setAttribute('role','status');
 for(const [id,label,type] of fields){
  const wrap=document.createElement('label');wrap.textContent=label;wrap.className='promo-field';
  const input=document.createElement('input');input.type=type==='file'?'file':'text';
  if(type==='file'){input.accept='image/png,image/jpeg,image/webp';input.onchange=()=>{const file=input.files?.[0];if(!file)return;if(id==='photo')photoRevision++;if(file.size>1500000){status.textContent='Image trop volumineuse (maximum 1,5 Mo).';return}const revision=photoRevision,reader=new FileReader();reader.onload=()=>{if(id==='photo'&&revision!==photoRevision)return;data[id]=String(reader.result);update();save()};reader.readAsDataURL(file)};}
  else{input.value=data[id]||'';input.oninput=()=>{data[id]=input.value;update();save()};}
  fieldInputs[id]=input;wrap.append(input);controls.append(wrap);
 }
 const buttons=document.createElement('div');buttons.className='promo-actions';
 const draft=document.createElement('button');draft.className='btn';draft.textContent='Enregistrer le brouillon';draft.onclick=()=>{save();status.textContent='Brouillon enregistré dans ce navigateur.'};
 const print=document.createElement('button');print.className='btn primary';print.textContent='Imprimer deux étiquettes sur A4';print.onclick=()=>window.print();
 const reset=document.createElement('button');reset.className='btn danger';reset.textContent='Vider les champs';reset.onclick=()=>{if(!confirm('Effacer les données de cette étiquette ?'))return;data={...defaults};localStorage.removeItem(key);controls.querySelectorAll('input').forEach(i=>{i.value=''});update()};
 buttons.append(draft,print,reset);
 const sheet=document.createElement('div');sheet.className='promo-sheet';sheet.append(preview);const second=preview.cloneNode(true);second.setAttribute('aria-hidden','true');second.classList.add('promo-print-copy');sheet.append(second);const refreshCopy=()=>{second.innerHTML=preview.innerHTML};const originalUpdate=update;update=()=>{originalUpdate();refreshCopy()};
 const chooser=document.createElement('div');chooser.className='promo-product-choice';let choiceToken=0;
 if(promotion){
  const parts=/^(20\d{2})-(0[1-9]|1[0-2])$/.exec(month);if(parts){const year=Number(parts[1]),m=Number(parts[2]),last=new Date(Date.UTC(year,m,0)).getUTCDate();data.date='DU 01/'+parts[2]+'/'+year+' AU '+String(last).padStart(2,'0')+'/'+parts[2]+'/'+year;fieldInputs.date.value=data.date;}
  const eans=Array.isArray(promotion.eans)?promotion.eans.filter(ean=>/^\d{13}$/.test(ean)):[];
  const hint=document.createElement('p');hint.className='field-note';hint.textContent='Période préremplie sur le mois de la mise en avant. Vérifiez et modifiez les champs si nécessaire.';chooser.append(hint);const photoHint=document.createElement('p');photoHint.className='field-note';photoHint.setAttribute('role','status');chooser.append(photoHint);
  const euro=value=>value==null?'':Number(value).toFixed(2).replace('.',',');
  async function selectProduct(ean){const token=++choiceToken,revision=++photoRevision,prices=promotion.prices?.[ean]||{};data.photo='';fieldInputs.photo.value='';photoHint.textContent='';data.old=euro(prices.before);data.sale=euro(prices.after);data.name=promotion.title||'';fieldInputs.old.value=data.old;fieldInputs.sale.value=data.sale;fieldInputs.name.value=data.name;update();if(!ean||!api)return;
   hint.textContent='Recherche du nom du produit…';const fallback=data.name;
   async function loadPhoto(){if(token!==choiceToken||revision!==photoRevision||!isCurrent()||!root.isConnected)return;photoHint.textContent='Recherche de la photo du produit…';try{const response=await fetch('/api/merchandising/impact/products/'+ean+'/photo',{credentials:'same-origin'});if(!response.ok)throw Error('Indisponible');const blob=await response.blob();if(!/^image\/(png|jpeg|webp)$/.test(blob.type)||blob.size>1500000)throw Error('Format invalide');const image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});if(token!==choiceToken||revision!==photoRevision||!isCurrent()||!root.isConnected)return;data.photo=image;update();photoHint.replaceChildren(document.createTextNode('Photo trouvée. Vous pouvez la remplacer. '));const source=response.headers.get('X-Product-Source');if(source){try{const url=new URL(source);if(url.protocol==='https:'){const a=document.createElement('a');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Voir la source';photoHint.append(a);}}catch{}}}catch{if(token===choiceToken&&revision===photoRevision&&isCurrent()&&root.isConnected)photoHint.textContent='Photo non trouvée : vous pouvez l’ajouter manuellement.';}}

   try{const result=await api('/api/merchandising/impact/products/'+ean);if(token!==choiceToken||!isCurrent()||!root.isConnected)return;const domains=new Set((result.sources||[]).map(x=>x.domain).filter(Boolean));const accepted=result.manual||result.validated&&domains.size>=2;if(accepted&&result.name&&data.name===fallback){data.name=result.name;fieldInputs.name.value=data.name;update();}hint.textContent=accepted&&result.name?'Nom de produit retrouvé. Vérifiez la période et les champs préremplis.':'Nom du produit non confirmé : l’intitulé de la promotion est proposé, à vérifier.';void loadPhoto();}catch{if(token===choiceToken&&isCurrent()&&root.isConnected)hint.textContent='Nom du produit indisponible : l’intitulé de la promotion est proposé, à vérifier.';void loadPhoto();}
  }
  if(eans.length>1){const label=document.createElement('label'),select=document.createElement('select'),empty=document.createElement('option');label.textContent='Produit à étiqueter';empty.value='';empty.textContent='Choisir un produit (EAN)';select.append(empty);for(const ean of eans){const option=document.createElement('option');option.value=ean;option.textContent=ean;select.append(option);}select.setAttribute('aria-label','Produit à étiqueter');select.onchange=()=>void selectProduct(select.value);label.append(select);chooser.prepend(label);hint.textContent='Choisissez un EAN pour préremplir les prix et le nom du produit.';data.name=promotion.title||'';fieldInputs.name.value=data.name;}
  else if(eans.length===1){queueMicrotask(()=>void selectProduct(eans[0]));}
  else{data.name=promotion.title||'';fieldInputs.name.value=data.name;hint.textContent='Aucun EAN renseigné : l’intitulé de la promotion est proposé, à vérifier.';}
 }
 root.append(heading,note,chooser,controls,buttons,status,sheet);container.replaceChildren(root);update();
}
