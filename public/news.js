import {messageKind,groupNewsThreads} from './news-threads.js';
import {orderAlertIcon,legacyOrderAlerts} from './order-alerts.js';
import {printNewsMessage} from './news-print.js';
const node=(tag,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
const button=(text,action,cls='btn small')=>{const e=node('button',text,cls);e.type='button';e.onclick=action;return e;};
const attachmentLink=message=>{const link=node('a','📎 '+message.attachment_name,'btn small news-attachment');link.href='/api/news/'+message.id+'/attachment';link.download=message.attachment_name;return link;};
const date=value=>new Date(value).toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'medium',timeStyle:'short'});
export async function renderNews({container,api,isCurrent=()=>true,onChanged=()=>{},onOpenPlanning=()=>{},onOpenOrders=()=>{},onOpenMerchandising=()=>{}}){
  const [recipients,initialMessages,initialSent]=await Promise.all([api('/api/news/recipients'),api('/api/news'),api('/api/news/sent')]);
  if(!isCurrent())return;
  const expandedThreads=new Set(),threadCache=new Map();let sentMessages=initialSent,view='inbox',replyTo=null;let messages=initialMessages,filter='all',request=0,sending=false;
  const note=node('p','Les messages non archivés disparaissent automatiquement au bout de 15 jours. Cochez « Archiver » pour conserver un message dans votre espace.','news-retention');
  const layout=node('div','','news-layout'),compose=node('section','','news-compose'),inbox=node('section','','news-inbox');
  const form=node('form'),composeTitle=node('h3','Envoyer un message court'),replyContext=node('p','','field-note');replyContext.hidden=true;form.append(composeTitle,replyContext);
  const textLabel=node('label','Votre message (500 caractères maximum)','field');textLabel.htmlFor='news-text';
  const text=node('textarea');text.id='news-text';text.rows=5;text.maxLength=1000;text.required=true;text.placeholder='Une information, un rappel, un mot pour l’équipe…';
  const count=node('p','0 / 500 caractères','field-note');count.id='news-character-count';text.setAttribute('aria-describedby',count.id);
  const updateCount=()=>{const length=Array.from(text.value.trim()).length;count.textContent=length+' / 500 caractères';text.setCustomValidity(length>500?'Limitez votre message à 500 caractères.':'');};text.oninput=updateCount;
  const fieldset=node('fieldset'),legend=node('legend','Destinataires actifs');fieldset.append(legend);
  const searchLabel=node('label','Rechercher un collaborateur','field');searchLabel.htmlFor='news-recipient-search';
  const search=node('input');search.id='news-recipient-search';search.type='search';search.placeholder='Nom ou prénom';
  const choices=node('div','','news-recipient-list'),selection=node('p','Aucun destinataire sélectionné.','field-note'),selected=new Set();
  const updateSelection=()=>{selection.textContent=selected.size?selected.size+' destinataire'+(selected.size>1?'s':'')+' sélectionné'+(selected.size>1?'s':'')+'.':'Aucun destinataire sélectionné.';};
  const boxes=recipients.map(person=>{
    const label=node('label'),input=node('input');input.type='checkbox';input.value=String(person.id);
    input.onchange=()=>{input.checked?selected.add(person.id):selected.delete(person.id);updateSelection();};
    label.append(input,node('span',person.name));choices.append(label);return {person,label,input};
  });
  const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr');
  search.oninput=()=>boxes.forEach(({person,label})=>{label.hidden=!normalize(person.name).includes(normalize(search.value.trim()));});
  const selectAll=button('Sélectionner toute l’équipe',()=>{boxes.forEach(({person,input})=>{input.checked=true;selected.add(person.id);});updateSelection();});
  const clear=button('Tout désélectionner',()=>{boxes.forEach(({input})=>{input.checked=false;});selected.clear();updateSelection();});
  const selectionActions=node('div','','news-selection-actions');selectionActions.append(selectAll,clear);
  fieldset.append(searchLabel,search,selectionActions,choices,selection);
  const feedback=node('p','','field-note');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
  const submit=node('button','Envoyer le message','btn primary');submit.type='submit';submit.disabled=!recipients.length;
  const priorityLabel=node('label','Priorité'),priority=node('select');priority.setAttribute('aria-label','Priorité du message');for(const [value,label]of [['normal','Normale'],['important','Important']]){const option=node('option',label);option.value=value;priority.append(option);}priorityLabel.append(priority);const attachmentLabel=node('label','Pièce jointe (facultative)','field'),attachment=node('input'),attachmentNote=node('p','PDF, Word (.docx), JPEG ou PNG · 10 Mo maximum.','field-note');attachment.type='file';attachment.id='news-attachment';attachment.accept='.pdf,.docx,.jpg,.jpeg,.png';attachmentLabel.htmlFor=attachment.id;const removeAttachment=button('Retirer la pièce jointe',()=>{attachment.value='';removeAttachment.hidden=true;});removeAttachment.hidden=true;attachment.onchange=()=>{removeAttachment.hidden=!attachment.files.length;};const cancelReply=button('Annuler le mode réponse',()=>{if(!sending)resetReply();});cancelReply.hidden=true;function resetReply(){replyTo=null;submit.textContent='Envoyer le message';composeTitle.textContent='Envoyer un message court';replyContext.hidden=true;cancelReply.hidden=true;boxes.forEach(({input})=>input.disabled=false);selectAll.disabled=clear.disabled=false;}
  const expiryLabel=node('label','Expiration anticipée (facultative)','field'),expiry=node('input');expiry.type='date';expiry.id='news-expiry';expiryLabel.htmlFor=expiry.id;const todayParts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));expiry.min=todayParts.year+'-'+todayParts.month+'-'+todayParts.day;const maxExpiry=new Date(expiry.min+'T12:00:00Z');maxExpiry.setUTCDate(maxExpiry.getUTCDate()+14);expiry.max=maxExpiry.toISOString().slice(0,10);expiryLabel.append(expiry);const expiryNote=node('p','Sans date : conservation de 15 jours. Une date choisie fait expirer le message à la fin de cette journée. Les copies archivées restent conservées.','field-note');
  form.append(textLabel,text,count,priorityLabel,expiryLabel,expiryNote,fieldset,attachmentLabel,attachment,attachmentNote,removeAttachment,cancelReply,submit,feedback);compose.append(form);
  const heading=node('div','','news-inbox-heading');heading.append(node('h3','Mes messages reçus'));
  const list=node('div','','news-message-list');list.setAttribute('aria-live','polite');
  const filterLabel=node('label','Afficher');filterLabel.htmlFor='news-filter';
  const selector=node('select');selector.id='news-filter';
  [['all','Tous les messages'],['unseen','Non vus'],['current','Non archivés'],['archived','Archivés']].forEach(([value,label])=>{const option=node('option',label);option.value=value;selector.append(option);});
  const inboxError=node('p','','error');inboxError.setAttribute('role','alert');
  const redraw=()=>{
    list.replaceChildren();
    if(view==='sent'){list.append(node('p','Messages envoyés au cours des 15 derniers jours. Le suivi correspond aux cases « Vu » cochées par les destinataires.','field-note'));for(const group of groupNewsThreads(sentMessages))list.append(threadCard(group,true));if(!sentMessages.length)list.append(node('p','Aucun message envoyé disponible.','empty'));return;}
    const visible=messages.filter(m=>filter==='all'||(filter==='unseen'?!m.seen:filter==='archived'?m.archived:!m.archived));
    if(!visible.length){list.append(node('p',filter==='archived'?'Aucun message archivé.':'Aucun message reçu dans cette sélection.','empty'));return;}
    for(const group of groupNewsThreads(visible))list.append(threadCard(group,false));
  };
  function originBadge(message,outgoing=false){const kind=messageKind(message),labels={colleague:outgoing?'✉ Message envoyé':'👤 Message d’un collègue',reply:outgoing?'↩ Réponse envoyée':'↩ Réponse',automatic:'⚙ Notification automatique'};return node('span',labels[kind],'news-origin-badge '+kind);}
  function receivedCard(message,threaded=false){

      const card=node('article','','news-message news-origin-'+messageKind(message)+(message.seen?'':' unread'));card.append(originBadge(message));
      const top=node('div','','news-message-heading'),time=node('time',date(message.created_at));time.dateTime=message.created_at;
      top.append(node('strong',(message.priority==='important'?'Important · ':'')+message.sender),time);card.append(top);
      if(message.is_reply&&!threaded){card.classList.add('news-reply');card.append(node('span','↩ Réponse à votre message','news-reply-badge'));const context=node('blockquote','','news-reply-context');if(message.reply_context){const original=message.reply_context;context.append(node('small','Votre message du '+date(original.createdAt)));const excerpt=original.text.length>140?original.text.slice(0,140)+'…':original.text;context.append(node('p',excerpt));if(original.text.length>140){const details=node('details');details.append(node('summary','Lire le message d’origine'),node('p',original.text));context.append(details);}}else context.append(node('small','Le message d’origine a expiré ou n’est plus disponible.'));card.append(context);}
      card.append(node('p',message.order_digest?message.text.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g,'$3-$2-$1').replace(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g,'$1-$2-$3'):message.text,'news-message-text'));
      if(message.order_digest){const d=message.order_digest,box=node('section','','news-order-digest'),formatDates=value=>String(value).replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g,'$3-$2-$1');box.append(node('p','Période : '+formatDates(d.from)+' au '+formatDates(d.to)));const titles={unplanned:'Sans échéance',waiting:'En attente de délivrance',late:'En retard',soon:'À commander sous 7 jours',incomplete:'Informations incomplètes'};box.append(node('p',Object.entries(titles).map(([key,label])=>label+' : '+(d.counts[key]||0)).join(' · ')));if(!d.items.length)box.append(node('p','Aucune anomalie ni commande à prévoir sur cette période.'));const list=node('ul');for(const entry of d.items){const item=node('li');item.append(node('strong','Ligne #'+entry.id));for(const alert of legacyOrderAlerts(entry)){const line=node('div','','order-digest-alert');line.append(orderAlertIcon(alert.code,formatDates(alert.text)),node('span',formatDates(alert.text)));item.append(line);}list.append(item);}box.append(list,node('p',d.suspended+' ligne(s) suspendue(s) exclue(s). Les catégories peuvent se recouper.','field-note'));if(d.unreadable)box.append(node('p',d.unreadable+' ligne(s) illisible(s) : bilan incomplet, intervention administrateur nécessaire.','error'));box.append(button('Consulter les commandes programmées',onOpenOrders,'btn primary small'));card.append(box);}
      if(Array.isArray(message.challenge_digest)&&message.challenge_digest.length){const digest=node('ul','','news-challenge-digest');for(const challenge of message.challenge_digest){const item=node('li'),number=new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(Number(challenge.target));item.append(node('strong',challenge.title),node('span',challenge.laboratory+' · Objectif collectif : '+number+(challenge.metric==='units'?' unités vendues':' € de chiffre d’affaires')));digest.append(item);}card.append(digest);}
      if(message.attachment_name)card.append(attachmentLink(message));
      const actions=node('div','','news-message-actions');actions.append(button('Imprimer',()=>printNewsMessage(card,{hasAttachment:!!message.attachment_name})));
      const reply=button('Répondre',()=>{if(sending)return;replyTo=message.id;submit.textContent='Envoyer la réponse';cancelReply.hidden=false;selectAll.disabled=clear.disabled=true;selected.clear();boxes.forEach(({person,input})=>{input.disabled=true;input.checked=person.id===message.sender_id;if(input.checked)selected.add(person.id);});search.value='';boxes.forEach(({label})=>label.hidden=false);updateSelection();composeTitle.textContent='Répondre à '+message.sender;replyContext.hidden=false;replyContext.textContent='En réponse au message du '+date(message.created_at)+' : '+message.text;feedback.textContent='Le destinataire de votre réponse est '+message.sender+'.';form.scrollIntoView?.({behavior:'smooth',block:'start'});text.focus();});reply.disabled=!recipients.some(p=>p.id===message.sender_id);if(reply.disabled)reply.title='Cet expéditeur ne fait plus partie des collaborateurs actifs.';actions.append(reply);
      const controls=[];
      for(const [key,labelText] of (message.can_archive===false?[['seen','Vu']]:[['seen','Vu'],['archived','Archiver']])){
        const label=node('label'),input=node('input');input.type='checkbox';input.checked=message[key];input.setAttribute('aria-label',labelText+' : message de '+message.sender+' du '+date(message.created_at));controls.push(input);
        input.onchange=async()=>{
          const desired=input.checked;
          if(key==='archived'&&!desired&&new Date(message.expires_at).getTime()<=Date.now()&&!confirm('Ce message a atteint sa date d’expiration. Le désarchiver le supprimera de votre espace. Continuer ?')){input.checked=true;return;}
          controls.forEach(c=>c.disabled=true);inboxError.textContent='';
          try{await api('/api/news/'+message.id,'PATCH',{[key]:desired});if(!isCurrent())return;await reload();onChanged();}
          catch(e){if(isCurrent()){input.checked=message[key];inboxError.textContent=e.message;}}
          finally{controls.forEach(c=>c.disabled=false);}
        };label.append(input,node('span',labelText));actions.append(label);
      }
      if(message.merchandising_month)card.append(button('Consulter le planning merchandising',()=>onOpenMerchandising(message.merchandising_month),'btn primary small'));
      if(message.planning_week)card.append(button('Consulter le planning',()=>onOpenPlanning(message.planning_week?String(message.planning_week).slice(0,10):null),'btn primary small'));if(message.can_archive===false)card.append(node('p','Message automatique · Non archivable','field-note'));card.append(actions,node('p',message.archived?'Archivé · Conservé dans votre espace':'Disparaîtra le '+date(message.expires_at),'field-note'));return card;
  }
  function outgoingCard(message){const card=node('article','','news-message news-message-outgoing news-origin-'+messageKind(message));card.append(originBadge(message,true),node('strong','Vous · '+date(message.created_at)),node('p',message.text,'news-message-text'));if(message.attachment_name)card.append(attachmentLink(message));if(message.recipients){const seen=message.recipients.filter(p=>p.seen).length;card.append(node('p',seen+' / '+message.recipients.length+' destinataires ont coché « Vu »','field-note'));const people=node('ul');message.recipients.forEach(p=>people.append(node('li',p.name+' · '+(p.seen?'Vu'+(p.seenAt?' le '+date(p.seenAt):''):'Non vu'))));card.append(people);}card.append(button('Imprimer',()=>printNewsMessage(card,{sent:true,hasAttachment:!!message.attachment_name})));return card;}
  function threadCard(group,outgoing){
    const root=node('section','','news-thread'),content=node('div','','news-thread-content'),latest=group.latest;
    const showLatest=()=>content.replaceChildren(outgoing?outgoingCard(latest):receivedCard(latest));showLatest();root.append(content);
    const known=[...messages,...sentMessages].filter(m=>(m.thread_id??m.id)===group.id),hasExchange=latest.is_reply||known.some(m=>m.id!==latest.id);
    if(!hasExchange)return root;
    const toggle=button('Afficher le fil des échanges',()=>{if(expandedThreads.has(group.id)){expandedThreads.delete(group.id);toggle.textContent='Afficher le fil des échanges';toggle.setAttribute('aria-expanded','false');showLatest();}else{expandedThreads.add(group.id);void showThread();}},'btn news-thread-toggle');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('data-ux-stay','');root.append(toggle);
    async function showThread(){toggle.disabled=true;inboxError.textContent='';try{let thread=threadCache.get(group.id);if(!thread){thread=await api('/api/news/threads/'+group.id);threadCache.set(group.id,thread);}if(!isCurrent()||!root.isConnected||!expandedThreads.has(group.id))return;content.replaceChildren(node('h4','Fil des échanges — du plus ancien au plus récent'));if(thread.truncated)content.append(node('p','Les 200 derniers messages encore accessibles sont affichés.','field-note'));for(const message of thread.messages){const sent=sentMessages.find(m=>m.id===message.id);content.append(message.outgoing?outgoingCard({...sent,...message}):receivedCard(message,true));}toggle.textContent='Réduire le fil des échanges';toggle.setAttribute('aria-expanded','true');}catch(e){if(isCurrent()){inboxError.textContent=e.message;expandedThreads.delete(group.id);}}finally{toggle.disabled=false;}}
    if(expandedThreads.has(group.id))queueMicrotask(()=>void showThread());return root;
  }
  async function reload(){const current=++request;const [result,sent]=await Promise.all([api('/api/news'),api('/api/news/sent')]);if(isCurrent()&&current===request){messages=result;sentMessages=sent;threadCache.clear();redraw();}}
  selector.onchange=()=>{filter=selector.value;redraw();};
  const refresh=button('Actualiser',async()=>{refresh.disabled=true;inboxError.textContent='';try{await reload();onChanged();}catch(e){if(isCurrent())inboxError.textContent=e.message;}finally{refresh.disabled=false;}});
  const inboxTab=button('Messages reçus',()=>{view='inbox';selector.disabled=false;redraw();}),sentTab=button('Messages envoyés',async()=>{view='sent';selector.disabled=true;try{await reload();}catch(e){inboxError.textContent=e.message;}});heading.append(inboxTab,sentTab,refresh);const filters=node('div','','news-filters');filters.append(filterLabel,selector);
  inbox.append(heading,filters,node('p','Du plus récent au plus ancien. Cochez « Vu » pour confirmer votre lecture.','field-note'),inboxError,list);
  form.onsubmit=async e=>{
    e.preventDefault();if(sending)return;feedback.textContent='';updateCount();
    if(!text.reportValidity())return;
    if(!text.value.trim()){feedback.textContent='Rédigez votre message.';return;}
    if(!selected.size){feedback.textContent='Sélectionnez au moins un destinataire.';return;}
    sending=true;form.inert=true;submit.disabled=true;attachment.disabled=true;removeAttachment.disabled=true;
    try{const body={text:text.value.trim(),priority:priority.value,recipients:[...selected],expiresOn:expiry.value||null,...(replyTo!==null?{replyTo}:{})},file=attachment.files[0];if(file){if(!/\.(pdf|docx|jpe?g|png)$/i.test(file.name)||!file.size||file.size>10*1024*1024)throw Error('Choisissez un PDF, Word, JPEG ou PNG de 10 Mo maximum.');feedback.textContent='Envoi du message et de la pièce jointe…';const fileData=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('Impossible de lire la pièce jointe.'));reader.readAsDataURL(file);});body.attachment={fileName:file.name,fileData};}const result=await api('/api/news','POST',body);if(!isCurrent())return;
      resetReply();form.reset();selected.clear();boxes.forEach(({input})=>input.checked=false);updateSelection();text.value='';attachment.value='';removeAttachment.hidden=true;updateCount();feedback.textContent='Message envoyé à '+result.sent+' collaborateur'+(result.sent>1?'s':'')+'.';
      try{await reload();}catch(e){inboxError.textContent=e.message;}onChanged();
    }catch(e){if(isCurrent())feedback.textContent=e.message;}finally{sending=false;form.inert=false;submit.disabled=!recipients.length;attachment.disabled=false;removeAttachment.disabled=false;}
  };
  layout.append(compose,inbox);container.replaceChildren(note,layout);redraw();
}
