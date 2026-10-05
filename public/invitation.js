const node=(tag,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
export async function renderInvitation({container,token,api,onComplete}){
  const original=[...container.childNodes];
  const restore=()=>container.replaceChildren(...original);
  const title=node('h1','Bienvenue sur PORTAIL +'),intro=node('p','Vérification de votre invitation…','intro');
  const feedback=node('p','','error');feedback.setAttribute('role','alert');
  const back=node('button','Retour à la connexion','btn');back.type='button';back.onclick=restore;
  container.replaceChildren(title,intro,feedback,back);
  let person;try{person=await api('/api/invitations/check','POST',{token});}catch(e){intro.textContent='Votre invitation ne peut pas être ouverte.';feedback.textContent=e.message;return;}
  intro.textContent='Bonjour '+person.firstName+'. Choisissez votre mot de passe pour accéder à l’espace équipe de la Pharmacie de Trévoux.';
  const identifier=node('p','Votre identifiant : '+person.email,'field-note'),form=node('form');
  const input=(id,labelText)=>{const label=node('label',labelText,'field');label.htmlFor=id;const e=node('input');e.type='password';e.id=id;e.required=true;e.minLength=12;e.maxLength=256;e.autocomplete='new-password';form.append(label,e);return e;};
  const password=input('invitation-password','Votre mot de passe'),confirmation=input('invitation-confirmation','Confirmez votre mot de passe');
  const submit=node('button','Créer mon mot de passe et me connecter','btn primary');submit.type='submit';
  form.append(node('p','12 caractères minimum. Choisissez un mot de passe personnel.','field-note'),submit);
  let saving=false;
  form.onsubmit=async e=>{e.preventDefault();if(saving)return;feedback.textContent='';
    if(password.value!==confirmation.value){feedback.textContent='Les mots de passe ne correspondent pas.';return;}
    saving=true;submit.disabled=true;
    try{const result=await api('/api/invitations/accept','POST',{token,password:password.value});password.value='';confirmation.value='';restore();onComplete(result);}
    catch(e){feedback.textContent=e.message;}finally{saving=false;submit.disabled=false;}
  };
  container.replaceChildren(title,intro,identifier,form,feedback,back);
}
