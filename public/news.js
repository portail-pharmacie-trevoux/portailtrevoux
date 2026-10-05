const node=(tag,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
const button=(text,action,cls='btn small')=>{const e=node('button',text,cls);e.type='button';e.onclick=action;return e;};
const date=value=>new Date(value).toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'medium',timeStyle:'short'});
export async function renderNews({container,api,isCurrent=()=>true,onChanged=()=>{}}){
  const [recipients,initialMessages]=await Promise.all([api('/api/news/recipients'),api('/api/news')]);
  if(!isCurrent())return;
  let messages=initialMessages,filter='all',request=0,sending=false;
  const note=node('p','Les messages non archivés disparaissent automatiquement au bout de 30 jours. Cochez « Archiver » pour conserver un message dans votre espace.','news-retention');
  const layout=node('div','','news-layout'),compose=node('section','','news-compose'),inbox=node('section','','news-inbox');
  const form=node('form');form.append(node('h3','Envoyer un message court'));
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
  form.append(textLabel,text,count,fieldset,submit,feedback);compose.append(form);
  const heading=node('div','','news-inbox-heading');heading.append(node('h3','Mes messages reçus'));
  const list=node('div','','news-message-list');list.setAttribute('aria-live','polite');
  const filterLabel=node('label','Afficher');filterLabel.htmlFor='news-filter';
  const selector=node('select');selector.id='news-filter';
  [['all','Tous les messages'],['current','Non archivés'],['archived','Archivés']].forEach(([value,label])=>{const option=node('option',label);option.value=value;selector.append(option);});
  const inboxError=node('p','','error');inboxError.setAttribute('role','alert');
  const redraw=()=>{
    list.replaceChildren();
    const visible=messages.filter(m=>filter==='all'||(filter==='archived'?m.archived:!m.archived));
    if(!visible.length){list.append(node('p',filter==='archived'?'Aucun message archivé.':'Aucun message reçu dans cette sélection.','empty'));return;}
    for(const message of visible){
      const card=node('article','','news-message'+(message.seen?'':' unread'));
      const top=node('div','','news-message-heading'),time=node('time',date(message.created_at));time.dateTime=message.created_at;
      top.append(node('strong',message.sender),time);card.append(top,node('p',message.text,'news-message-text'));
      const actions=node('div','','news-message-actions');
      const controls=[];
      for(const [key,labelText] of [['seen','Vu'],['archived','Archiver']]){
        const label=node('label'),input=node('input');input.type='checkbox';input.checked=message[key];input.setAttribute('aria-label',labelText+' : message de '+message.sender+' du '+date(message.created_at));controls.push(input);
        input.onchange=async()=>{
          const desired=input.checked;
          if(key==='archived'&&!desired&&new Date(message.expires_at).getTime()<=Date.now()&&!confirm('Ce message a plus de 30 jours. Le désarchiver le supprimera de votre espace. Continuer ?')){input.checked=true;return;}
          controls.forEach(c=>c.disabled=true);inboxError.textContent='';
          try{await api('/api/news/'+message.id,'PATCH',{[key]:desired});if(!isCurrent())return;await reload();onChanged();}
          catch(e){if(isCurrent()){input.checked=message[key];inboxError.textContent=e.message;}}
          finally{controls.forEach(c=>c.disabled=false);}
        };label.append(input,node('span',labelText));actions.append(label);
      }
      card.append(actions,node('p',message.archived?'Archivé · Conservé dans votre espace':'Disparaîtra le '+date(message.expires_at),'field-note'));list.append(card);
    }
  };
  async function reload(){const current=++request;const result=await api('/api/news');if(isCurrent()&&current===request){messages=result;redraw();}}
  selector.onchange=()=>{filter=selector.value;redraw();};
  const refresh=button('Actualiser',async()=>{refresh.disabled=true;inboxError.textContent='';try{await reload();onChanged();}catch(e){if(isCurrent())inboxError.textContent=e.message;}finally{refresh.disabled=false;}});
  heading.append(refresh);const filters=node('div','','news-filters');filters.append(filterLabel,selector);
  inbox.append(heading,filters,node('p','Du plus récent au plus ancien. Cochez « Vu » pour confirmer votre lecture.','field-note'),inboxError,list);
  form.onsubmit=async e=>{
    e.preventDefault();if(sending)return;feedback.textContent='';updateCount();
    if(!text.reportValidity())return;
    if(!text.value.trim()){feedback.textContent='Rédigez votre message.';return;}
    if(!selected.size){feedback.textContent='Sélectionnez au moins un destinataire.';return;}
    sending=true;submit.disabled=true;
    try{const result=await api('/api/news','POST',{text:text.value.trim(),recipients:[...selected]});if(!isCurrent())return;
      text.value='';updateCount();feedback.textContent='Message envoyé à '+result.sent+' collaborateur'+(result.sent>1?'s':'')+'.';
      try{await reload();}catch(e){inboxError.textContent=e.message;}onChanged();
    }catch(e){if(isCurrent())feedback.textContent=e.message;}finally{sending=false;submit.disabled=!recipients.length;}
  };
  layout.append(compose,inbox);container.replaceChildren(note,layout);redraw();
}
