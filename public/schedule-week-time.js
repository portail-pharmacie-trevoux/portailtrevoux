// Shared vertical clock for the personal weekly view. Existing controls stay in place.
export function clockPosition(start,end){
 const minutes=value=>{if(!/^\d{2}:\d{2}$/.test(value||''))return NaN;const [h,m]=value.split(':').map(Number);return h<24&&m<60?h*60+m:NaN;};
 const a=minutes(start),b=minutes(end);if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)return null;
 const from=Math.max(450,a),to=Math.min(1290,b);return to>from?{top:(from-450)/840*100,height:(to-from)/840*100}:null;
}
export function showPersonalWeekClock(table){
 if(!document.querySelector('link[data-week-clock]')){const css=document.createElement('link');css.rel='stylesheet';css.href='/schedule-week-time.css';css.dataset.weekClock='';document.head.append(css);}
 table.classList.add('schedule-week-clock');
 table.tHead.rows[0].cells[0].textContent='Horaires';
 for(const row of table.tBodies[0].rows){
  const name=row.cells[0],person=document.createElement('span');person.className='week-clock-person';person.textContent=name.textContent;name.replaceChildren(person);
  const ruler=document.createElement('div');ruler.className='week-clock-ruler';ruler.setAttribute('aria-hidden','true');
  for(let minute=450;minute<=1290;minute+=30){const mark=document.createElement('span');mark.style.top=((minute-450)/840*100)+'%';mark.textContent=String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');if(minute%60===30&&minute!==450&&minute!==1290)mark.className='half-hour';ruler.append(mark);}name.append(ruler);
  for(const td of Array.from(row.cells).slice(1,8)){
   const cell=td.querySelector('.schedule-day');if(!cell)continue;
   const track=document.createElement('span');track.className='week-clock-track';
   const details=document.createElement('span');details.className='week-clock-notes';
   for(const child of Array.from(cell.children)){
    const match=child.classList.contains('schedule-slot')&&child.textContent.match(/^(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})/);
    const position=match&&clockPosition(match[1],match[2]);
    if(position){child.style.top=position.top+'%';child.style.height=position.height+'%';child.classList.add('week-clock-slot');child.title=child.title||child.textContent;child.setAttribute('aria-label',child.title);child.tabIndex=0;
     if(cell.tagName!=='BUTTON'){
      const reveal=()=>{const dialog=document.createElement('dialog'),text=document.createElement('p'),close=document.createElement('button');text.textContent=child.title;close.type='button';close.className='btn';close.textContent='Fermer';close.onclick=()=>dialog.close();dialog.setAttribute('aria-label','Détail du créneau');dialog.append(text,close);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();};
      child.setAttribute('role','button');child.onclick=reveal;child.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();reveal();}};
     }
     track.append(child);}
    else details.append(child);
   }
   cell.replaceChildren(track,details);cell.classList.add('week-clock-day');
  }
 }
}
