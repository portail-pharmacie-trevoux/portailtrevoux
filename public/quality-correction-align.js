// Keep correction comments below the error details, level with the corrected checkbox.
export function alignCorrectionNotes(table){
 for(const row of table.querySelectorAll('tbody tr')){
  if(row.hidden)continue;
  const note=row.querySelector('.quality-correction-note'),field=note?.querySelector('input'),check=row.querySelector('.quality-corrected-followup>label input');
  if(!note||!field||!check||!field.getClientRects().length)continue;
  const current=parseFloat(note.style.marginTop)||12;
  const margin=Math.max(12,Math.round((current+check.getBoundingClientRect().top-field.getBoundingClientRect().top)*2)/2);
  if(Math.abs(margin-current)>=0.5)note.style.marginTop=margin+'px';
 }
}
let observer,activeTable,pending=false,resizeInstalled=false;
export function watchCorrectionAlignment(table){
 observer?.disconnect();activeTable=table;
 const schedule=()=>{
  if(pending)return;pending=true;
  const run=()=>{pending=false;if(!activeTable?.isConnected){observer?.disconnect();activeTable=null;return;}alignCorrectionNotes(activeTable);};
  if(window.requestAnimationFrame)window.requestAnimationFrame(run);else setTimeout(run,0);
 };
 if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(schedule);observer.observe(table);}
 if(!resizeInstalled){window.addEventListener('resize',schedule);resizeInstalled=true;}
 schedule();
}
