const element=(tag,text='',cls='')=>{
  const node=document.createElement(tag);node.textContent=text;node.className=cls;return node;
};
const date=value=>new Date(value+'T12:00:00Z');
const iso=value=>value.toISOString().slice(0,10);
const format=value=>date(value).toLocaleDateString('fr-FR',{timeZone:'UTC'});
const endOfWeek=value=>{const day=date(value);day.setUTCDate(day.getUTCDate()+6);return iso(day);};
const weekOf=value=>{const day=date(value);day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+6)%7);return iso(day);};
const parts={full:'journée entière',morning:'matin',afternoon:'après-midi'};
const button=(label,action,cls='btn small')=>{const b=element('button',label,cls);b.type='button';b.onclick=action;return b;};

export async function mountLeaveReview(panel){
  const root=element('section','','leave-review-bento');
  const notice=element('p','Chargement des demandes…');notice.setAttribute('role','status');
  const weeks=element('div');root.append(notice,weeks);
  panel.querySelector('.module-review-form')?.replaceWith(root);
  const request=async(path,payload)=>{
    const response=await fetch(path,payload?{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(payload)}:{});
    const body=await response.json();
    if(!response.ok)throw Error(body.error||'Opération indisponible.');
    return body;
  };
  let csrf,user;
  function draw(rows){
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const grouped=new Map([[weekOf(today),[]]]);
    for(const row of rows.filter(row=>['pending','approved'].includes(row.status))){
      for(let week=weekOf(row.start_date);week<=row.end_date;){
        if(!grouped.has(week))grouped.set(week,[]);
        grouped.get(week).push(row);
        const next=date(week);next.setUTCDate(next.getUTCDate()+7);week=iso(next);
      }
    }
    weeks.replaceChildren();
    for(const [week,items] of [...grouped].sort(([a],[b])=>a.localeCompare(b))){
      const block=element('section');
      block.append(element('h4','Semaine du '+format(week)+' au '+format(endOfWeek(week))));
      const grid=element('div','','leave-review-grid');
      const [pending,approved,application]=['Demandes de congés','Congés validés','Application sur l’emploi du temps'].map(label=>{
        const box=element('section','','leave-review-column');box.append(element('h5',label));grid.append(box);return box;
      });
      items.sort((a,b)=>a.start_date.localeCompare(b.start_date)||a.name.localeCompare(b.name,'fr'));
      for(const row of items){
        const card=element('article','','leave-review-card');
        card.append(element('strong',row.name),element('p',row.leave_type),element('p',format(row.start_date)+' ('+parts[row.start_part]+') → '+format(row.end_date)+' ('+parts[row.end_part]+')'));
        if(row.comment)card.append(element('p',row.comment));
        if(row.status==='approved'){approved.append(card);continue;}
        pending.append(card);
        if(row.user_id===user.id)continue;
        const actions=element('div','','leave-review-actions');
        const decide=async status=>{
          validate.disabled=refuse.disabled=true;
          try{
            const url='/api/leave-requests/'+row.id;
            const decision={status,note:'',revision:row.revision};
            if(status==='approved'){
              const preview=await request(url+'/preview?boundary=13%3A30');
              if(!confirm('Valider ce congé et intégrer les absences au planning ? '+preview.days.length+' jour(s) examiné(s). Les demi-journées sont séparées à 13 h 30.'))return;
              Object.assign(decision,{boundary:'13:30',weekRevisions:preview.weekRevisions});
            }else if(!confirm('Refuser cette demande de congés ?'))return;
            await request(url+'/review',decision);
            notice.textContent=status==='approved'?'Congé validé et intégré au planning.':'Demande refusée.';
            await refresh();
          }catch(error){notice.textContent=error.message;}
          finally{validate.disabled=refuse.disabled=false;}
        };
        const validate=button('✓',()=>decide('approved'),'btn small primary'),refuse=button('✕',()=>decide('refused'),'btn small danger');
        validate.setAttribute('aria-label','Valider la demande de '+row.name);
        refuse.setAttribute('aria-label','Refuser la demande de '+row.name);
        actions.append(validate,refuse);card.append(actions);
      }
      if(pending.childElementCount===1)pending.append(element('p','Aucune demande en attente.'));
      if(approved.childElementCount===1)approved.append(element('p','Aucun congé validé.'));
      const applied=items.filter(row=>row.status==='approved'&&row.planning_applied).length;
      const remaining=items.filter(row=>row.status==='approved'&&!row.planning_applied).length;
      application.append(element('p',applied+' absence'+(applied===1?' intégrée':'s intégrées')+' cette semaine.'));
      if(remaining)application.append(element('p',remaining+' congé(s) validé(s) sans intégration.'));
      block.append(grid);weeks.append(block);
    }
  }
  async function refresh(){const rows=await request('/api/leave-requests?scope=team');if(root.isConnected)draw(rows);}
  try{
    const session=await request('/api/me');csrf=session.csrf;user=session.user;
    if(user.role!=='admin'){notice.textContent='Rubrique réservée à l’administration.';return;}
    await refresh();notice.textContent='';
  }catch(error){notice.textContent=error.message;}
}
