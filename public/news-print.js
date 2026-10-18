export function printNewsMessage(card,{sent=false,hasAttachment=false}={}){
 document.getElementById('news-print-sheet')?.remove();
 const sheet=document.createElement('section');sheet.id='news-print-sheet';
 const title=document.createElement('h1');title.textContent='Portail+ - Communication';sheet.append(title);
 if(sent){const sender=document.createElement('p');sender.textContent='Message envoyé par vous';sheet.append(sender);}
 const copy=card.cloneNode(true);
 copy.querySelectorAll('.news-message-actions,button,input,select,textarea').forEach(n=>n.remove());
 copy.querySelectorAll('details').forEach(n=>n.open=true);
 copy.querySelectorAll('a').forEach(n=>{n.removeAttribute('href');n.removeAttribute('target');n.classList.remove('btn');});
 sheet.append(copy);
 if(hasAttachment){const note=document.createElement('p');note.className='news-print-note';note.textContent='La pièce jointe est mentionnée ci-dessus. Son contenu doit être téléchargé et imprimé séparément.';sheet.append(note);}
 const clean=()=>{sheet.remove();document.body.classList.remove('news-printing');window.removeEventListener('afterprint',clean);};
 document.body.append(sheet);document.body.classList.add('news-printing');window.addEventListener('afterprint',clean,{once:true});
 try{window.print();}catch(error){clean();throw error;}
}
