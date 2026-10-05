const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,action,cls='btn')=>{const b=el('button',text,cls);b.type='button';b.onclick=action;return b;};
export async function renderEmployeeImport({container,api,people,onReview,isCurrent=()=>true}){
 const status=await api('/api/collaborateurs/scan/status');if(!isCurrent())return;
 container.replaceChildren();
 container.append(el('p','Importez un scan PDF ou une photo JPEG / PNG de la fiche remplie (10 Mo maximum). Les informations seront proposées dans une fiche à vérifier ; rien n’est enregistré automatiquement.','field-note'));
 const settings=el('details'),settingsBody=el('div');settings.open=!status.configured;settings.append(el('summary',status.configured?'Connexion du service de lecture':'Connecter le service de lecture'),settingsBody);container.append(settings);
 let configured=status.configured;
 const feedback=el('p','','field-note');feedback.setAttribute('role','status');
 const form=el('form','','employee-scan-form'),targetLabel=el('label','Dossier à compléter'),target=el('select');target.id='employee-scan-target';targetLabel.htmlFor=target.id;
 const newOption=el('option','Créer un nouveau collaborateur');newOption.value='';target.append(newOption);
 people.filter(p=>p.role!=='admin').forEach(p=>{const o=el('option',p.firstName+' '+p.lastName+(p.active?'':' (inactif)'));o.value=p.id;target.append(o);});
 const fileLabel=el('label','Fiche manuscrite'),file=el('input');file.id='employee-scan-file';file.type='file';file.accept='.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';file.required=true;fileLabel.htmlFor=file.id;
 const consentLabel=el('label'),consent=el('input');consent.type='checkbox';consent.required=true;consentLabel.append(consent,' Analyser cette fiche avec le service OpenAI connecté.');
 const submit=el('button','Lire la fiche et vérifier les informations','btn primary');submit.type='submit';submit.disabled=!configured;
 form.append(targetLabel,target,fileLabel,file,el('p','La fiche est transmise au service de lecture pour l’analyse. Le scan n’est pas conservé dans le portail ; les informations ne sont enregistrées qu’après votre validation.','field-note'),consentLabel,feedback,submit);container.append(form);
 function connection(){
  settingsBody.replaceChildren();
  if(status.managedByEnvironment){settingsBody.append(el('p','Connexion configurée sur le serveur.','field-note'));return;}
  if(configured){settingsBody.append(el('p','Service connecté.','field-note'),button('Déconnecter le service',async()=>{try{await api('/api/collaborateurs/scan/config','DELETE');configured=false;submit.disabled=true;connection();}catch(e){feedback.textContent=e.message;}}));}
  else{
   const configForm=el('form','','employee-scan-form'),label=el('label','Clé API OpenAI'),key=el('input'),save=el('button','Connecter','btn');key.type='password';key.autocomplete='off';key.required=true;key.id='employee-scan-key';label.htmlFor=key.id;save.type='submit';
   configForm.append(el('p','Une clé API OpenAI est nécessaire. Les analyses sont facturées sur ce compte API, indépendamment de votre abonnement ChatGPT. La clé est conservée chiffrée et reste réservée à l’administrateur.','field-note'),label,key,save);
   configForm.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{await api('/api/collaborateurs/scan/config','POST',{apiKey:key.value.trim()});key.value='';configured=true;submit.disabled=false;connection();feedback.textContent='Service connecté. Vous pouvez importer une fiche.';}catch(e){feedback.textContent=e.message;save.disabled=false;}};settingsBody.append(configForm);
  }
 }
 connection();
 form.onsubmit=async e=>{
  e.preventDefault();const selected=file.files[0];if(!selected)return;
  if(!selected.size||selected.size>10*1024*1024){feedback.textContent='Le fichier est vide ou dépasse 10 Mo.';return;}
  if(!/\.(pdf|jpe?g|png)$/i.test(selected.name)){feedback.textContent='Choisissez un PDF, une photo JPEG ou PNG.';return;}
  submit.disabled=true;file.disabled=true;target.disabled=true;feedback.textContent='Lecture de la fiche en cours…';
  try{
   const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('Impossible de lire le fichier.'));reader.readAsDataURL(selected);});
   const draft=await api('/api/collaborateurs/scan','POST',{fileName:selected.name,fileData:data});if(!isCurrent())return;
   if(!Object.keys(draft.values).length){feedback.textContent='Aucune information exploitable détectée. '+draft.notes.join(' ');return;}
   const person=target.value?people.find(p=>String(p.id)===target.value):{firstName:'',lastName:'',phone:'',birthday:'',job:'',active:true,role:'employee',rights:[],editRights:[],permissionsConfigured:true};
   draft.sourceUrl=URL.createObjectURL(selected);file.value='';
   try{await onReview(person,draft);}catch(e){URL.revokeObjectURL(draft.sourceUrl);throw e;}
  }catch(e){feedback.textContent=e.message;}
  finally{submit.disabled=!configured;file.disabled=false;target.disabled=false;}
 };
}
