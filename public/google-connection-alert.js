export function renderGoogleConnectionAlert({container,data,onReconnect,onOpenAgenda}){
 container.replaceChildren();const problems=Object.entries(data).filter(([,state])=>state.state!=='ok');container.hidden=!problems.length;if(!problems.length)return;
 container.setAttribute('role','status');container.className='google-connection-alert';
 const heading=document.createElement('strong');heading.textContent='⚠ Connexions Google à vérifier';container.append(heading);
 for(const [key,state]of problems){const row=document.createElement('div'),text=document.createElement('span'),action=document.createElement('button');row.className='google-connection-issue';const name=key==='mail'?'Gmail':'Google Agenda';text.textContent=name+' — '+state.error+(key==='calendar'&&state.lastSuccessAt?' Dernière synchronisation réussie : '+new Date(state.lastSuccessAt).toLocaleString('fr-FR',{timeZone:'Europe/Paris'})+'.':'');row.append(text);
  if(['reconnect','disconnected'].includes(state.state)&&state.configured){action.type='button';action.className='btn small primary';action.textContent='Reconnecter '+name;action.onclick=async()=>{action.disabled=true;try{await onReconnect(key);}catch(e){text.textContent=e.message;action.disabled=false;}};row.append(action);}
  else if(key==='calendar'&&state.configured){action.type='button';action.className='btn small';action.textContent='Ouvrir l’agenda';action.onclick=onOpenAgenda;row.append(action);}
  container.append(row);
 }
}
