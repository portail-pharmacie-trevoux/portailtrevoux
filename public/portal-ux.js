/* Shared feedback and edit protection; no change to server-side permissions. */
(function(global){
 'use strict';
 function createEditState(){
  const baseline=new Map(),values=new Map();
  return{remember(key,value){if(!baseline.has(key)){baseline.set(key,value);values.set(key,value);}},change(key,value){values.set(key,value);},dirty(){return [...values].some(([key,value])=>baseline.get(key)!==value);},capture(){return new Map(values);},commit(snapshot){for(const [key,value]of snapshot)baseline.set(key,value);}};
 }
 const api={createEditState};global.PortalUX=api;
 if(!global.document)return;
 const doc=global.document,records=new Map();let intent=null,sequence=0,pending=0,message='',kind='',messageTimer;
 const notice=doc.createElement('div');notice.id='portal-save-feedback';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.hidden=true;doc.body.append(notice);
 const fieldValue=n=>n.type==='checkbox'||n.type==='radio'?String(n.checked):n.type==='file'?[...(n.files||[])].map(f=>[f.name,f.size,f.lastModified].join(':')).join('|'):n.tagName==='SELECT'&&n.multiple?JSON.stringify([...n.selectedOptions].map(o=>o.value)):n.value;
 const live=form=>form.isConnected&&!form.closest('.hidden,[hidden]')&&(!form.closest('dialog')||form.closest('dialog').open);
 const eligible=form=>form.id!=='login-form'&&!form.closest('.order-mfa,.order-mfa-panel')&&!form.hasAttribute('data-ux-ignore')&&[...form.querySelectorAll('button')].some(b=>/enregistrer|sauvegarder|ajouter|créer|envoyer|déclarer|importer|valider|demander|appliquer|copier/i.test(b.textContent));
 function controls(record){for(const input of record.form.querySelectorAll('input,select,textarea')){if(['hidden','search','submit','button'].includes(input.type))continue;if(!record.inputs.has(input)){record.inputs.add(input);record.state.remember(input,fieldValue(input));}}}
 function refresh(record){controls(record);for(const input of record.inputs)record.state.change(input,fieldValue(input));return record.state.dirty();}
 function register(form){let r=records.get(form);if(!r&&!eligible(form))return null;if(!r){r={form,inputs:new Set(),state:createEditState(),pending:0};records.set(form,r);}controls(r);return r;}
 function dirtyRecords(){return [...records.values()].filter(r=>live(r.form)&&refresh(r));}
 const dirtyOrders=()=>[...doc.querySelectorAll('.order-plan-dirty')].some(n=>!n.closest('.hidden,[hidden]'));
 function local(record,text,state){if(!record||!record.form.isConnected)return;if(!record.hint){record.hint=doc.createElement('p');record.hint.setAttribute('role','status');record.hint.setAttribute('aria-live','polite');record.form.append(record.hint);}record.hint.className='ux-save-state '+state;record.hint.textContent=text;}
 function show(){const dirty=dirtyRecords().length||dirtyOrders();notice.hidden=!pending&&!message&&!dirty;notice.className='portal-save-feedback '+(pending?'saving':message?kind:'dirty');notice.textContent=pending?'Enregistrement…':message||(dirty?'Modifications non enregistrées':'');notice.setAttribute('role',kind==='failure'&&!pending?'alert':'status');}
 function announce(text,state){clearTimeout(messageTimer);message=text;kind=state;show();if(state==='success')messageTimer=setTimeout(()=>{message='';show();},5000);}
 function normalize(form){
  const submits=[...form.querySelectorAll('button[type="submit"]')];
  for(const save of submits){if(!/enregistrer|sauvegarder|ajouter|créer|envoyer|déclarer|importer|valider|demander/i.test(save.textContent))continue;save.classList.add('ux-primary-action');const original=save.textContent.trim();if(/^enregistrer\b|^sauvegarder\b/i.test(original)){if(!save.hasAttribute('aria-label'))save.setAttribute('aria-label',original);if(save.textContent!=='Enregistrer')save.textContent='Enregistrer';}else if(/^(créer|ajouter)\b/i.test(original)){if(!save.hasAttribute('aria-label'))save.setAttribute('aria-label',original);if(save.textContent!=='Ajouter')save.textContent='Ajouter';}
   const cancel=[...form.querySelectorAll('button')].find(b=>/^(annuler|fermer)\b/i.test(b.textContent.trim()));
   if(cancel&&cancel.parentElement===save.parentElement){let group=save.parentElement;if(group===form){group=doc.createElement('div');group.className='ux-form-actions';save.before(group);group.append(cancel,save);}else group.classList.add('ux-form-actions');cancel.classList.add('ux-cancel-action');if(group.lastElementChild!==save)group.append(save);}
  }
  for(const b of form.querySelectorAll('button'))if(/^supprimer\b/i.test(b.textContent.trim()))b.classList.add('ux-delete-action');
 }
 function scan(){for(const [form]of records)if(!form.isConnected)records.delete(form);for(const form of doc.querySelectorAll('form')){register(form);normalize(form);}}
 const observer=new MutationObserver(changes=>{if(changes.some(change=>[...change.addedNodes,...change.removedNodes].some(n=>n.nodeType===1&&(n.matches('form,input,select,textarea,button')||n.querySelector('form,input,select,textarea,button')))))scan();});observer.observe(doc.body,{childList:true,subtree:true});scan();
 function rememberIntent(target){intent=target;}
 doc.addEventListener('focusin',e=>{const form=e.target.closest?.('form');if(form)register(form);},true);
 doc.addEventListener('beforeinput',e=>{const form=e.target.closest?.('form');if(form)register(form);},true);
 for(const name of ['input','change'])doc.addEventListener(name,e=>{const form=e.target.closest?.('form'),r=form&&register(form);if(r){r.justSaved=false;const dirty=refresh(r);local(r,dirty?'Modifications non enregistrées':'',dirty?'dirty':'');message='';show();}rememberIntent(e.target);},true);
 doc.addEventListener('reset',e=>{const r=records.get(e.target);if(!r)return;if(!r.justSaved&&refresh(r)&&!canLeave(e.target)){e.preventDefault();return;}queueMicrotask(()=>{refresh(r);r.state.commit(r.state.capture());r.justSaved=false;show();});},true);
 doc.addEventListener('submit',e=>{const r=register(e.target);if(r)refresh(r);rememberIntent(e.target);},true);
 function canLeave(target,escape=false){
  const active=dirtyRecords().filter(r=>!escape||target.contains(r.form)),orders=!escape&&dirtyOrders(),saving=[...records.values()].some(r=>live(r.form)&&r.pending)||!!doc.querySelector('.order-plan-busy');
  if(!active.length&&!orders&&(!saving||escape))return true;
  // This existing action saves all edited order rows before locking the space.
  if(!escape&&/quitter et enregistrer/i.test(target?.textContent||''))return true;
  if(saving){announce('Enregistrement en cours. Patientez avant de quitter la fiche.','saving');return false;}
  return global.confirm('Des modifications ne sont pas enregistrées. Quitter cette fiche sans les enregistrer ?');
 }
 doc.addEventListener('click',e=>{
  const button=e.target.closest?.('button,a');if(!button)return;
  const text=button.textContent.trim(),form=button.closest('form');
  const exit=button.id==='portal-home'||button.id==='back'||button.id==='logout'||button.hasAttribute('data-universe')||/^(?:[←↩]\s*)?(retour|annuler|fermer|quitter)\b/i.test(text)||button.tagName==='A'&&!button.hasAttribute('download')&&button.target!=='_blank'&&button.getAttribute('href')&&!button.getAttribute('href').startsWith('#');
  const outside=button.tagName==='BUTTON'&&!button.hasAttribute('data-ux-stay')&&!form&&dirtyRecords().length&&button.type!=='submit'&&!button.closest('.ux-form-actions')&&!/enregistrer|ajouter un créneau|ajouter une plage/i.test(text)&&!/^(tout cocher|tout décocher|afficher davantage|imprimer|télécharger|exporter|ouvrir|csv vers|messages reçus|messages envoyés|non vus)/i.test(text);
  if((exit||outside)&&!canLeave(button)){e.preventDefault();e.stopImmediatePropagation();return;}
  rememberIntent(button);
 },true);
 doc.addEventListener('cancel',e=>{if(e.target.tagName==='DIALOG'&&!canLeave(e.target,true)){e.preventDefault();e.stopImmediatePropagation();}},true);
 global.addEventListener('beforeunload',e=>{if(dirtyRecords().length||dirtyOrders()||[...records.values()].some(r=>live(r.form)&&r.pending)){e.preventDefault();e.returnValue='';}});
 api.beginRequest=(path,method='GET')=>{
  if(!['POST','PUT','PATCH','DELETE'].includes(method)||/^\/api\/(login|logout|password|order-mfa|youtube|music\/export)/.test(path)||/\/(unlock|lock|export)(?:[/.?]|$)/.test(path))return null;
  const target=intent,form=target?.closest?.('form'),record=form&&register(form),snapshot=record?(refresh(record),record.state.capture()):null;
  if(form&&intent===target)intent=null;const id=++sequence;pending++;if(record)record.pending++;local(record,'Enregistrement…','saving');message='';show();let finished=false;
  return{success(){if(finished)return;finished=true;pending--;if(record){record.pending--;if(method!=='DELETE'){record.state.commit(snapshot);record.justSaved=true;}}local(record,method==='DELETE'?'Suppression effectuée':'Enregistré','success');if(id===sequence||!pending)announce(method==='DELETE'?'Suppression effectuée':'Enregistré','success');else show();},failure(error){if(finished)return;finished=true;pending--;if(record)record.pending--;local(record,'Échec de l’enregistrement : '+(error?.message||'Réessayez.'),'failure');announce('Échec de l’enregistrement : '+(error?.message||'Réessayez.'),'failure');}};
 };
 api.hasUnsavedChanges=()=>!!dirtyRecords().length||dirtyOrders();
 api.scan=scan;
})(typeof window!=='undefined'?window:globalThis);
