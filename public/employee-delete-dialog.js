export function confirmEmployeeDeletion(name){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.setAttribute('aria-labelledby','employee-delete-title');
  const form=document.createElement('form'),title=document.createElement('h2');title.id='employee-delete-title';title.textContent='Supprimer définitivement';
  const warning=document.createElement('p');warning.textContent='Supprimer définitivement '+name+' ? Cette opération est irréversible. La fiche et ses données confidentielles seront effacées. Les documents RH et historiques ne seront pas supprimés : toute dépendance empêchera cette suppression.';
  const label=document.createElement('label');label.textContent='Pour confirmer une seconde fois, saisissez SUPPRIMER';
  const input=document.createElement('input');input.type='text';input.autocomplete='off';input.required=true;input.id='employee-delete-confirmation';label.htmlFor=input.id;
  const actions=document.createElement('div');actions.className='dialog-actions';const cancel=document.createElement('button');cancel.type='button';cancel.className='btn';cancel.textContent='Annuler';
  const confirm=document.createElement('button');confirm.type='submit';confirm.className='btn danger';confirm.textContent='Supprimer définitivement';confirm.disabled=true;
  let finished=false;const finish=value=>{if(finished)return;finished=true;dialog.close();dialog.remove();resolve(value);};
  cancel.onclick=()=>finish(null);dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});dialog.addEventListener('close',()=>{if(!finished)finish(null);});
  input.oninput=()=>confirm.disabled=input.value!=='SUPPRIMER';form.onsubmit=e=>{e.preventDefault();if(input.value==='SUPPRIMER')finish(input.value);};
  actions.append(cancel,confirm);form.append(title,warning,label,input,actions);dialog.append(form);document.body.append(dialog);dialog.showModal();input.focus();
 });
}
