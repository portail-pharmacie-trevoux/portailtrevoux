/* Shared navigation only: no API, history mutations, permissions or data writes. */
(function(global){
 'use strict';
 const labels={Collaborateurs:"Retour à l’annuaire",Agenda:"Retour à l’agenda",Actualités:'Retour à la messagerie',
  Laboratoires:'Retour aux laboratoires',Challenges:'Retour aux challenges',Formations:'Retour aux documents',
  'Contacts utiles':'Retour aux contacts','Ressources humaines':'Retour aux ressources humaines',
  'Emplois du temps':'Retour aux emplois du temps',Procédures:'Retour à la démarche qualité',
  "Outils d'aide au merchandising":'Retour au merchandising',"Outils d'aide à la démarche qualité":'Retour à la démarche qualité',
  "Outils d'aide aux commandes":'Retour aux commandes','Outils de calculs rapides':'Retour aux outils de calcul',
  Fun:'Retour à Fun','Passerelle groupement':'Retour au groupement'};
 const parentOf=universe=>universe==='Procédures'?"Outils d'aide à la démarche qualité":universe;
 function create({detail,content,homeButton,onHome,onUniverse}){
  const doc=detail.ownerDocument,bar=doc.createElement('nav'),parent=doc.createElement('button');
  let universe=null;
  bar.className='portal-navigation';bar.setAttribute('aria-label','Navigation des univers');
  const configure=(button,label,primary)=>{
   button.type='button';button.className='btn portal-navigation-tab'+(primary?' portal-navigation-home':'');
   const arrow=doc.createElement('span'),text=doc.createElement('span');arrow.textContent='←';arrow.className='portal-navigation-arrow';arrow.setAttribute('aria-hidden','true');text.textContent=label;
   button.replaceChildren(arrow,text);button.setAttribute('aria-label',label);
  };
  configure(homeButton,'Retour aux univers',true);homeButton.onclick=()=>onHome();
  parent.id='portal-universe-back';parent.hidden=true;parent.onclick=()=>{if(universe)onUniverse(parentOf(universe));};
  bar.append(homeButton,parent);detail.prepend(bar);
  function scan(){
   let subpage=universe==='Procédures'||[...content.querySelectorAll('[data-portal-subpage],.employee-record,.lab-form,.contact-form,.contact-document-upload,.hr-signature-form,.training-rename-form')].some(node=>!node.closest('dialog,.hidden,[hidden]'));
   for(const button of content.querySelectorAll('button[data-portal-back],button')){
    if(button.closest('dialog,.hidden,[hidden]'))continue;
    const text=button.textContent.trim();
    const back=button.hasAttribute('data-portal-back')||/^(?:[←↩]\s*)?(?:retour\b|démarche qualité$|outils d[’']aide au merchandising$)/i.test(text);
    if(!back)continue;
    subpage=true;
    // MFA wizard controls remain local security-step controls; never redirect
    // their handlers or interfere with setup, verification, locking or recovery.
    if(button.closest('.order-mfa-panel'))continue;
    button.classList.add('portal-legacy-back');
   }
   const shown=!!universe&&subpage;
   const label=labels[universe]||'Retour au menu de l’univers';
   if(parent.getAttribute('aria-label')!==label)configure(parent,label,false);
   parent.hidden=!shown;
  }
  const observer=new MutationObserver(scan);observer.observe(content,{childList:true,subtree:true});
  return {setUniverse(value){universe=value;scan();},refresh:scan,destroy(){observer.disconnect();homeButton.className='btn';homeButton.textContent='Retour aux univers';detail.prepend(homeButton);bar.remove();for(const b of content.querySelectorAll('.portal-legacy-back'))b.classList.remove('portal-legacy-back');}};
 }
 global.PortalNavigation={create,parentOf,labels};
})(typeof window!=='undefined'?window:globalThis);
