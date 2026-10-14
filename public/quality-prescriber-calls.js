const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
const date=v=>new Date(v).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris'});
export async function renderPrescriberCalls({container,api,isCurrent=()=>true,onBack,initialError}){
 const root=el('div'),back=el('button','← Retour','btn'),area=el('div'),status=el('p','','status-line');back.type='button';back.onclick=onBack;status.setAttribute('role','status');root.append(back,el('h3','Appels aux prescripteurs'),area,status);container.replaceChildren(root);
 const current=()=>isCurrent()&&container.contains(root);let data=await api('/api/quality/prescriber-calls');if(!current())return;
 async function load(){data=await api('/api/quality/prescriber-calls');if(current())list();}
 function list(){area.replaceChildren();const add=el('button','Déclarer un appel','btn primary');add.type='button';add.onclick=()=>form();area.append(add);if(!data.calls.length)area.append(el('p','Aucun appel déclaré.','empty'));for(const call of data.calls){const card=el('article','','quality-service-card');card.append(el('h4',date(call.call_date)+' — '+call.prescriber),el('p','Déclaré par '+call.operator_name),el('p','Motif : '+call.reason),el('p','Suite donnée : '+(call.outcome||'Non renseignée')));if(call.error_id)card.append(el('small','Lié à l’erreur de délivrance n° '+call.error_id));area.append(card);}}
 function form(error){area.replaceChildren();const f=el('form','','quality-error-form'),fields={};
 function field(key,label,tag,value,max){const lab=el('label',label),input=el(tag);if(tag==='input')input.type=key==='callDate'?'date':'text';else input.rows=4;input.value=value||'';input.required=key!=='outcome';if(max)input.maxLength=max;lab.append(input);f.append(lab);fields[key]=input;return input;}
 if(error)f.append(el('p','Déclaration liée à l’erreur n° '+error.id+' — '+error.error_type,'field-note'));
 const callDate=field('callDate','Date de l’appel','input',error?.doctor_notified_at?new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(error.doctor_notified_at)):data.today);callDate.max=data.today;
 field('prescriber','Nom du prescripteur contacté','input','',200);field('reason','Motif de l’appel','textarea',error?error.error_type+' — '+error.details:'',5000);field('outcome','Réponse du prescripteur / suite donnée','textarea',error?.actions||'',5000);
 const save=el('button','Enregistrer la déclaration','btn primary'),cancel=el('button','Annuler','btn');save.type='submit';cancel.type='button';cancel.onclick=list;f.append(cancel,save);const requestId=crypto.randomUUID();let pending=false;
 f.onsubmit=async e=>{e.preventDefault();if(pending)return;pending=true;save.disabled=cancel.disabled=true;status.textContent='Enregistrement…';try{await api('/api/quality/prescriber-calls','POST',{...Object.fromEntries(Object.entries(fields).map(([k,n])=>[k,n.value])),errorId:error?.id??null,requestId});status.textContent='Déclaration d’appel enregistrée.';await load();}catch(err){status.textContent=err.message;}finally{pending=false;save.disabled=cancel.disabled=false;}};area.append(f);
 }
 if(initialError)form(initialError);else list();
}
