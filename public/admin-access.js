/* One consistent administration entry point; existing controls and permissions are reused. */
(function(global){
 'use strict';const doc=global.document;if(!doc)return;
 const menus=new Map();let queued=false,dialog=null,trigger=null,slot=null;
 const node=(tag,text='',cls='')=>{const e=doc.createElement(tag);e.textContent=text;e.className=cls;return e;};
 if(!doc.querySelector('link[data-admin-access]')){const css=doc.createElement('link');css.rel='stylesheet';css.href='/admin-access.css';css.dataset.adminAccess='1';doc.head.append(css);}
 function eligible(source,record){const parent=record?.marker.parentElement||source.parentElement;return source.isConnected&&parent&&parent.closest('#detail')&&!parent.closest('.hidden,[hidden]')&&(!source.hidden||!!record);}
 function restore(){
  for(const [source,record]of menus)if(record.marker.isConnected){record.marker.before(source);source.open=false;source.hidden=true;}
  if(trigger)trigger.setAttribute('aria-expanded','false');const previous=dialog;dialog=null;previous?.remove();if(trigger?.isConnected)trigger.focus();queue();
 }
 function open(){
  scan();const available=[...menus].filter(([s,r])=>eligible(s,r));if(!available.length)return;
  if(dialog?.open){dialog.close();return;}
  dialog=node('dialog','','portal-administration-dialog');dialog.setAttribute('aria-labelledby','portal-administration-title');
  const heading=node('div','','portal-administration-heading'),title=node('h3','Administration'),close=node('button','Fermer','btn');title.id='portal-administration-title';close.type='button';close.onclick=()=>dialog?.close();heading.append(title,close);dialog.append(heading);
  const body=node('div','','portal-administration-body');dialog.append(body);
  // Keep the dialog inside the original owner so asynchronous view guards stay valid.
  available[0][1].marker.parentElement.append(dialog);
  for(const [source,record]of available){if(available.length>1)body.append(node('h4',record.label));source.hidden=false;source.open=true;body.append(source);}
  dialog.addEventListener('close',restore,{once:true});dialog.showModal();trigger.setAttribute('aria-expanded','true');close.focus();
 }
 function scan(){
  const detail=doc.querySelector('#detail'),heading=detail?.querySelector('.panel>.top');if(!detail||!heading)return;
  for(const [source,record]of menus)if(!record.marker.isConnected||!source.isConnected){source.remove();menus.delete(source);}
  for(const source of detail.querySelectorAll('details.admin-menu')){
   if(menus.has(source)||source.parentElement.closest('details.admin-menu')||source.hidden||source.closest('.hidden,[hidden],dialog:not([open])'))continue;
   const summary=[...source.children].find(e=>e.tagName==='SUMMARY');if(!summary)continue;
   const marker=doc.createComment('administration controls');source.before(marker);menus.set(source,{marker,label:summary.textContent.trim()});source.classList.add('portal-admin-source');source.open=false;source.hidden=true;
  }
  const available=[...menus].some(([source,record])=>eligible(source,record));
  if(!slot?.isConnected){slot=node('div','','portal-administration-access');trigger=node('button','Administration','portal-administration-button');trigger.type='button';trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('data-ux-stay','');trigger.onclick=open;slot.append(trigger);heading.append(slot);}
  slot.hidden=!available;
  if(dialog&&!dialog.isConnected){dialog=null;trigger.setAttribute('aria-expanded','false');}
  if(dialog&&!available)dialog.close();
 }
 function queue(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;scan();});}
 const observer=new MutationObserver(queue);observer.observe(doc.body,{childList:true,subtree:true});
 global.PortalAdminAccess={scan};scan();
})(typeof window!=='undefined'?window:globalThis);
