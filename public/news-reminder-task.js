import {reminderTaskPreset} from './news-reminder-presets.js';
const el=(tag,text='')=>{const e=document.createElement(tag);e.textContent=text;return e;};
export function openNewsReminderTask({message,api,onChanged=()=>{},onCreated=()=>{}}){
 const preset=reminderTaskPreset(message);if(!preset)return;
 const dialog=el('dialog'),form=el('form'),title=el('input'),date=el('input'),icon=el('select'),description=el('textarea'),status=el('p'),save=el('button','Créer mon événement avec rappel'),cancel=el('button','Annuler');
 dialog.className='lab-email-dialog';title.required=true;title.maxLength=150;title.value=preset.title;date.type='date';date.required=true;
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(v=>[v.type,v.value]));
 date.value=date.min=p.year+'-'+p.month+'-'+p.day;
 for(const v of ['✅','📌','📞','✉️','📦','📝','💊','🗣️','🎓','⭐']){const option=el('option',v);option.value=v;icon.append(option);}icon.value=preset.icon;
 description.rows=6;description.maxLength=1000;description.value=message.text.slice(0,1000);
 form.append(el('h3','Créer un événement personnel'),el('p','Visible uniquement dans votre agenda Portail+. Rappel sur l’accueil de J−7 jusqu’au jour prévu. Aucun ajout dans Google Agenda.'));
 for(const [name,input]of [['Titre',title],['Date prévue',date],['Icône',icon],['Détails',description]]){const label=el('label',name);label.className='field';label.append(input);form.append(label);}
 status.setAttribute('role','status');save.type='submit';save.className='btn primary';cancel.type='button';cancel.className='btn';let busy=false;cancel.onclick=()=>dialog.close();
 form.append(status,cancel,save);dialog.append(form);document.body.append(dialog);
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 form.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;save.disabled=cancel.disabled=true;status.textContent='Enregistrement…';
 try{const result=await api('/api/calendar/tasks','POST',{title:title.value,date:date.value,icon:icon.value,description:description.value,sourceMessageId:message.id});
 status.textContent=result.alreadyExists?'Un événement est déjà associé à ce rappel. Vous pouvez le modifier dans votre agenda.':'Événement enregistré dans votre agenda personnel, avec rappel sur l’accueil.';
 form.reset();form.querySelectorAll('input,select,textarea').forEach(e=>e.disabled=true);save.hidden=true;cancel.textContent='Fermer';onCreated();onChanged();
 }catch(error){status.textContent=error.message;save.disabled=false;}finally{busy=false;cancel.disabled=false;}};
 dialog.showModal();date.focus();
}
