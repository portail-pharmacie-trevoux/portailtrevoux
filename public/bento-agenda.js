const themes=[
  ['Formation',/formation|webinaire|atelier/],
  ['Réunion',/reunion|brief|point d'equipe/],
  ['Rendez-vous',/\brdv\b|rendez[ -]vous/],
  ['Livraison',/livraison|reception/],
  ['Congé',/conge|absence|vacances/]
];
const dayLabels=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const dateLabel=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',timeZone:'Europe/Paris'});
const resultDateLabel=new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Paris'});
const timeLabel=new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris'});
function element(tag,text='',className=''){
  const node=document.createElement(tag);
  node.textContent=text;
  node.className=className;
  return node;
}
function action(label,handler){
  const button=element('button',label,'btn');
  button.type='button';
  button.onclick=handler;
  return button;
}
export function dayEntries(events,day,eventDays){
  return events.filter(event=>{
    if(!event.start?.date&&!event.start?.dateTime)return false;
    const span=eventDays(event);
    return span.start<=day&&day<=span.end;
  }).sort((a,b)=>{
    const kind=event=>event.personalTask?2:event.start.date?0:1;
    return kind(a)-kind(b)||Date.parse(a.start.dateTime||a.start.date)-Date.parse(b.start.dateTime||b.start.date);
  });
}
export function agendaTime(event,day,eventDays){
  if(event.start.date)return 'Toute la journée';
  return eventDays(event).start<day?'En cours':timeLabel.format(new Date(event.start.dateTime));
}
export function renderBentoAgenda({container,data,api,moveDay,eventDays,normalizeSearch,today,onChanged,isCurrent}){
  const monday=moveDay(today,-((new Date(today+'T12:00:00Z').getUTCDay()+6)%7));
  let week=monday;
  const events=data.events||[];
  const tasks=element('section','','week-task-panel');
  tasks.append(element('h3','Tâches personnelles planifiées'));
  const form=element('form','','week-task-form');
  const title=element('input'),date=element('input'),submit=element('button','Ajouter ma tâche','btn primary');
  title.required=true;
  title.maxLength=150;
  date.type='date';
  date.required=true;
  date.value=new Date(today+'T12:00:00Z').getUTCDay()===0?moveDay(today,1):today;
  submit.type='submit';
  for(const [name,input] of [['Tâche',title],['Jour prévu',date]]){
    const label=element('label',name,'field');
    label.append(input);
    form.append(label);
  }
  form.append(submit);
  const feedback=element('p','','status-line');
  feedback.setAttribute('role','status');
  tasks.append(form,feedback);
  const heading=element('h3');
  const nav=element('div','','week-agenda-navigation');
  nav.append(action('← Semaine précédente',()=>{week=moveDay(week,-7);draw();}),heading,action('Semaine suivante →',()=>{week=moveDay(week,7);draw();}));
  const grid=element('div','','week-agenda-grid');
  const search=element('input');
  search.type='search';
  search.placeholder='Titre, lieu ou mot-clé';
  const keyword=element('label','Mot-clé','field');
  keyword.append(search);
  const theme=element('select');
  theme.append(new Option('Tous les thèmes',''),...themes.map(([label])=>new Option(label,label)),new Option('Tâches personnelles','tasks'));
  const select=element('label','Thème','field');
  select.append(theme);
  const filters=element('section','','week-agenda-search');
  const results=element('section','','week-agenda-results');
  const resultCount=element('p','','status-line');
  resultCount.setAttribute('role','status');
  const resultList=element('ul','','week-agenda-result-list');
  results.append(resultCount,resultList);
  filters.append(element('h3','Rechercher dans l’agenda'),keyword,select,results);
  const notice=data.error?element('p',data.error+' Les événements affichés peuvent ne pas être à jour.','calendar-warning'):null;
  container.replaceChildren(tasks,...(notice?[notice]:[]),filters,nav,grid);

  function draw(){
    heading.textContent=dateLabel.format(new Date(week+'T12:00:00Z'))+' – '+dateLabel.format(new Date(moveDay(week,5)+'T12:00:00Z'));
    grid.replaceChildren(...dayLabels.map((label,index)=>{
      const day=moveDay(week,index);
      const card=element('section','','week-agenda-day');
      if(day===today)card.classList.add('today');
      card.append(element('h4',label+' '+dateLabel.format(new Date(day+'T12:00:00Z'))));
      const rows=dayEntries(events,day,eventDays);
      if(!rows.length)card.append(element('p','Aucun événement','week-agenda-empty'));
      for(const event of rows){
        if(event.personalTask){
          const row=element('label','','week-agenda-entry week-agenda-task');
          const check=element('input');
          check.type='checkbox';
          check.checked=event.completed===true;
          row.append(check,element('span',event.title));
          check.onchange=async()=>{
            check.disabled=true;
            try{
              const result=await api('/api/calendar/tasks/'+event.taskId+'/completion','PATCH',{completed:check.checked});
              event.completed=result.completed;
              if(isCurrent())onChanged();
            }catch(error){
              check.checked=event.completed===true;
              if(isCurrent())feedback.textContent=error.message;
            }finally{check.disabled=false;}
          };
          card.append(row);
        }else{
          const row=element('article','','week-agenda-entry');
          row.append(element('span',agendaTime(event,day,eventDays),'week-agenda-time'),element('strong',event.title||'Événement'));
          if(event.location)row.append(element('small',event.location));
          card.append(row);
        }
      }
      return card;
    }));
  }
  function drawResults(){
    const terms=normalizeSearch(search.value).split(/\s+/).filter(Boolean);
    const selected=theme.value;
    results.hidden=!terms.length&&!selected;
    resultList.replaceChildren();
    if(results.hidden)return;
    const pattern=themes.find(([name])=>name===selected)?.[1];
    const matches=events.filter(event=>{
      if(!event.start?.date&&!event.start?.dateTime)return false;
      const text=normalizeSearch([event.title,event.location,event.description].filter(Boolean).join(' '));
      const themeMatch=selected==='tasks'?event.personalTask:!event.personalTask&&(!pattern||pattern.test(text));
      return themeMatch&&terms.every(term=>text.includes(term));
    }).sort((a,b)=>Date.parse(a.start.dateTime||a.start.date)-Date.parse(b.start.dateTime||b.start.date));
    resultCount.textContent=matches.length?matches.length+(matches.length===1?' résultat':' résultats'):'Aucun résultat dans les événements enregistrés.';
    for(const event of matches){
      const day=eventDays(event).start;
      const row=element('li','','week-agenda-entry');
      const date=resultDateLabel.format(new Date(day+'T12:00:00Z'));
      row.append(element('span',date+' · '+agendaTime(event,day,eventDays),'week-agenda-time'),element('strong',event.title||'Événement'));
      if(event.location)row.append(element('small',event.location));
      resultList.append(row);
    }
  }
  search.oninput=theme.onchange=drawResults;
  drawResults();
  form.onsubmit=async event=>{
    event.preventDefault();
    if(new Date(date.value+'T12:00:00Z').getUTCDay()===0){feedback.textContent='Choisissez un jour du lundi au samedi.';return;}
    const taskTitle=title.value.trim(),day=date.value;
    submit.disabled=true;
    try{
      const {id}=await api('/api/calendar/tasks','POST',{title:taskTitle,date:day,icon:'✅'});
      if(!isCurrent())return;
      events.push({id:'task-'+id,taskId:id,personalTask:true,title:taskTitle,completed:false,start:{date:day},end:{date:moveDay(day,1)}});
      week=moveDay(day,-((new Date(day+'T12:00:00Z').getUTCDay()+6)%7));
      title.value='';
      drawResults();
      feedback.textContent='Tâche ajoutée.';
      draw();
      onChanged();
    }catch(error){if(isCurrent())feedback.textContent=error.message;}
    finally{submit.disabled=false;}
  };
  draw();
}
