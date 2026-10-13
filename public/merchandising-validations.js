const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
const date=value=>new Date(value).toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'short',timeStyle:'short'});
export function appendMonthValidation({label,key,z,data,months,input,lab,other,persist,api,error,onSaved,busy}){
 const approval=z.monthApprovals?.[key]||{},validated=approval.validated===true;
 for(const control of [input,lab,other])control.disabled=validated||data.canEdit===false;
 label.classList.toggle('merch-month-validated',validated);
 const status=el('span','','merch-validation-status '+(validated?'approved':'pending'));
 const update=()=>status.textContent=validated?'✓ Disposition validée':(months[key]||'').trim()?'À valider':'Non renseignée';update();input.addEventListener('input',update);label.append(status);
 if(approval.modifiedAt)label.append(el('small','Dernière modification : '+approval.modifiedBy+' — '+date(approval.modifiedAt),'merch-validation-date'));
 if(approval.validatedAt)label.append(el('small','Validation : '+date(approval.validatedAt)+' — '+approval.validatedBy,'merch-validation-date'));
 if(approval.invalidatedAt)label.append(el('small','Invalidation : '+date(approval.invalidatedAt)+' — '+approval.invalidatedBy,'merch-validation-date'));
 const history=(z.monthValidationHistory||[]).filter(e=>e.month===key);
 if(history.length){const details=el('details','','merch-validation-history');details.append(el('summary','Historique ('+history.length+')'));for(const event of history)details.append(el('p',(event.action==='validated'?'Validation':'Invalidation')+' : '+date(event.created_at)+' — '+event.operator_name));label.append(details);}
 if(data.canValidate){const button=el('button',validated?'Invalider la disposition':'Valider la disposition','btn '+(validated?'':'primary'));button.type='button';button.disabled=!validated&&!(months[key]||'').trim();input.addEventListener('input',()=>button.disabled=!validated&&!(months[key]||'').trim());button.onclick=async()=>{if(busy.value)return;busy.value=true;button.disabled=true;try{if(!await persist())return;const saved=await api('/api/merchandising/'+z.id+'/months/'+key+'/validation','PUT',{validated:!validated,revision:z.revision});Object.assign(z,saved);if(saved.validationEvent){z.monthValidationHistory=z.monthValidationHistory||[];z.monthValidationHistory.unshift(saved.validationEvent);}await onSaved();error.textContent=validated?'Disposition invalidée. La case peut être modifiée.':'Disposition validée et verrouillée.';}catch(e){error.textContent=e.message;}finally{busy.value=false;button.disabled=false;}};label.append(button);}
}
