// CSV import for Contacts utiles. Uses existing authenticated admin-only transactional API.
const HEADERS=['Périmètre','Nom du contact','Interlocuteur','Téléphone','E-mail','Site web','Commentaires'];
const FIELDS=['scope','name','person','phone','email','url','notes'];
const aliases={scope:['perimetre','categorie','domaine','scope'],name:['nom du contact','organisme','organisme ou service','nom','entreprise','contact','name'],person:['interlocuteur','fonction','fonction service','personne','person'],phone:['telephone','tel','phone','mobile'],email:['email','adresse email','courriel','e mail'],url:['site web','site internet','url','lien'],notes:['commentaires','informations utiles','notes','commentaire']};
const normalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function parseCsv(text,separator){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const ch=text[i];if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;}else if(ch==='"'){if(cell.trim())throw Error('Guillemets mal placés dans le CSV.');quoted=true;}else if(ch===separator){row.push(cell.trim());cell='';}else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';}else cell+=ch;}if(quoted)throw Error('Guillemet non fermé dans le CSV.');row.push(cell.trim());if(row.some(Boolean))rows.push(row);return rows;}
function hash(s){let h=2166136261;for(const ch of s){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}
const element=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
export function mountCsvImport({container,toolbar,api,getContacts,refresh}){
 const actions=toolbar.querySelector('.universe-actions');if(!actions)return;
 const button=element('button','Importer CSV / Excel');button.type='button';button.className='btn small';
 const panel=element('section');panel.hidden=true;panel.className='people-import';
 const title=element('h3','Importer des contacts depuis CSV ou Excel');
 const help=element('p','Colonnes obligatoires : Périmètre et Nom du contact. CSV : séparateur ; ou , · Excel : première feuille .xlsx · 100 contacts maximum par lot.');
 const template=element('button','Télécharger un modèle CSV');template.type='button';template.className='btn small';
 template.onclick=()=>{const sample=HEADERS.join(';')+'\r\n';const blob=new Blob(['\uFEFF'+sample],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=element('a');a.href=url;a.download='PortailPlus-contacts-modele.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const input=element('input');input.type='file';input.accept='.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';input.setAttribute('aria-label','Fichier CSV ou Excel de contacts');
 const status=element('p');status.setAttribute('role','status');
 const preview=element('div');const commit=element('button','Confirmer l’import');commit.type='button';commit.className='btn primary';commit.hidden=true;
 let pending=[];
 button.onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden)input.focus();};
 input.onchange=async()=>{pending=[];commit.hidden=true;preview.replaceChildren();status.textContent='';const file=input.files?.[0];if(!file)return;
 try{if(file.size>1024*1024)throw Error('Fichier trop volumineux (1 Mo maximum).');let rows;if(/\.xlsx$/i.test(file.name)){const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Lecture Excel impossible'));reader.readAsDataURL(file);});const result=await api('/api/contacts/parse-xlsx','POST',{fileData:data});rows=result.rows;}else{const raw=(await file.text()).replace(/^\uFEFF/,'');const first=raw.split(/\r?\n/,1)[0];const sep=(first.match(/;/g)||[]).length>=(first.match(/,/g)||[]).length?';':',';rows=parseCsv(raw,sep);}if(rows.length<2)throw Error('Le fichier ne contient aucun contact.');
 const header=rows.shift().map(normalize);const mapping=FIELDS.map(f=>header.findIndex(h=>aliases[f].includes(h)));if(mapping[0]<0||mapping[1]<0)throw Error('Colonnes Périmètre et Nom du contact introuvables.');if(rows.length>100)throw Error('Limite de 100 contacts par import.');
 const existing=getContacts();const keyOf=c=>normalize(c.scope)+'|'+normalize(c.name);const known=new Set(existing.map(keyOf));const seen=new Set();const problems=[];
 for(let i=0;i<rows.length;i++){const cells=rows[i];const c=Object.fromEntries(FIELDS.map((f,j)=>[f,mapping[j]>=0?(cells[mapping[j]]||''):'']));const key=keyOf(c);if(!c.scope||!c.name){problems.push('Ligne '+(i+2)+' : périmètre ou nom manquant');continue;}if(known.has(key)||seen.has(key)){problems.push('Ligne '+(i+2)+' : doublon ignoré ('+c.name+')');continue;}seen.add(key);const limits={scope:80,name:160,person:160,phone:80,email:254,url:500,notes:1500};if(FIELDS.some(f=>c[f].length>limits[f])){problems.push('Ligne '+(i+2)+' : champ trop long');continue;}if(c.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)){problems.push('Ligne '+(i+2)+' : e-mail invalide');continue;}if(c.url){try{const u=new URL(c.url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error();}catch{problems.push('Ligne '+(i+2)+' : lien invalide');continue;}}
 c.sourceKey='csv-'+hash(key);pending.push(c);
 }
 status.textContent=pending.length+' contact(s) prêt(s), '+problems.length+' ligne(s) ignorée(s). Les contacts existants ne seront pas modifiés.';
 const table=element('table');const head=element('tr');HEADERS.forEach(h=>head.append(element('th',h)));table.append(head);for(const c of pending.slice(0,20)){const tr=element('tr');FIELDS.forEach(f=>tr.append(element('td',c[f])));table.append(tr);}preview.append(table);if(pending.length>20)preview.append(element('p','Aperçu limité aux 20 premiers contacts.'));if(problems.length){const p=element('p',problems.slice(0,12).join(' · '));preview.append(p);}commit.hidden=!pending.length;
 }catch(e){status.textContent=e.message;}};
 commit.onclick=async()=>{if(!pending.length)return;commit.disabled=true;try{const r=await api('/api/contacts/import','POST',{contacts:pending});await refresh(r.count+' contacts importés depuis le CSV.');status.textContent=r.count+' ajout(s). '+(pending.length-r.count)+' doublon(s) ignoré(s) par le serveur.';pending=[];input.value='';preview.replaceChildren();commit.hidden=true;}catch(e){status.textContent=e.message;}finally{commit.disabled=false;}};
 panel.append(title,help,template,input,status,preview,commit);container.append(panel);actions.append(button);
}
