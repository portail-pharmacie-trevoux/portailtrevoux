export function renderQuality({container}) {
  const grid=document.createElement('div');grid.className='quality-hub';
  for(const title of ['Recueil des erreurs de délivrance','Appels aux prescripteurs','Suivi des relevés de température','Référents services']) {
    const button=document.createElement('button');button.type='button';button.className='btn primary quality-action';button.textContent=title;
    button.onclick=()=>{status.textContent=title+' : contenu à venir.';};grid.append(button);
  }
  const status=document.createElement('p');status.className='field-note';status.setAttribute('role','status');
  container.replaceChildren(grid,status);
}
