// Éditeur autonome : les coordonnées du gabarit sont fixes, les champs restent éditables.
export function renderPromotionLabel({container}){
 const key='portail-plus-etiquette-promo-v1';
 const defaults={date:'',slogan:'',old:'',sale:'',unit:'',name:'',photo:'',logo1:'',logo2:''};
 let data={...defaults};try{data={...data,...JSON.parse(localStorage.getItem(key)||'{}')}}catch{}
 const root=document.createElement('section');root.className='promo-editor';
 if(!document.querySelector('link[data-promo-editor]')){const style=document.createElement('link');style.rel='stylesheet';style.href='/promotion-label-editor.css';style.dataset.promoEditor='1';document.head.append(style)}
 const heading=document.createElement('h3');heading.textContent='Étiquette promotionnelle personnalisable';
 const note=document.createElement('p');note.textContent='Format fixe horizontal : 105 × 99,6 mm (estimation issue du modèle). Les repères ne sont pas imprimés. Deux étiquettes par feuille A4.';note.className='field-note';
 const controls=document.createElement('div');controls.className='promo-controls';
 const preview=document.createElement('div');preview.className='promo-label';
 const fields=[
  ['date','1 · Date de validité','text'],['slogan','2 · Accroche promotionnelle','text'],['old','3 · Prix barré (€)','text'],
  ['photo','4 · Photo produit','file'],['logo1','5 · Logo 1','file'],['logo2','6 · Logo 2','file'],
  ['sale','7 · Prix promotionnel (€)','text'],['unit','8 · Prix au litre (€ / L)','text'],['name','9 · Intitulé produit','text']];
 const save=()=>{try{localStorage.setItem(key,JSON.stringify(data))}catch{status.textContent='Stockage local saturé : images trop volumineuses.'}};
 const cells={};for(const id of ['date','slogan','old','photo','logo1','logo2','sale','unit','name']){
  const cell=document.createElement('div');cell.className='promo-zone promo-'+id;cell.dataset.zone=id;preview.append(cell);cells[id]=cell;
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
  if(type==='file'){input.accept='image/png,image/jpeg,image/webp';input.onchange=()=>{const file=input.files?.[0];if(!file)return;if(file.size>1500000){status.textContent='Image trop volumineuse (maximum 1,5 Mo).';return}const reader=new FileReader();reader.onload=()=>{data[id]=String(reader.result);update();save()};reader.readAsDataURL(file)};}
  else{input.value=data[id]||'';input.oninput=()=>{data[id]=input.value;update();save()};}
  wrap.append(input);controls.append(wrap);
 }
 const buttons=document.createElement('div');buttons.className='promo-actions';
 const draft=document.createElement('button');draft.className='btn';draft.textContent='Enregistrer le brouillon';draft.onclick=()=>{save();status.textContent='Brouillon enregistré dans ce navigateur.'};
 const print=document.createElement('button');print.className='btn';print.textContent='Imprimer deux étiquettes sur A4';print.onclick=()=>window.print();
 const reset=document.createElement('button');reset.className='btn';reset.textContent='Vider les champs';reset.onclick=()=>{if(!confirm('Effacer les données de cette étiquette ?'))return;data={...defaults};localStorage.removeItem(key);controls.querySelectorAll('input').forEach(i=>{i.value=''});update()};
 buttons.append(draft,print,reset);
 const sheet=document.createElement('div');sheet.className='promo-sheet';sheet.append(preview);
 root.append(heading,note,controls,buttons,status,sheet);container.replaceChildren(root);update();
}
