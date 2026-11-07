// Presentation only. The server independently checks the exact test account.
(()=>{
 let pending=false;
 const refresh=async()=>{
  const home=document.querySelector('#home');
  if(!home||home.classList.contains('hidden')){document.querySelector('#personal-admin-diagnostic-link')?.remove();return;}
  if(pending||document.querySelector('#personal-admin-diagnostic-link'))return;
  pending=true;
  try{
   const r=await fetch('/api/me',{cache:'no-store'});if(!r.ok)return;
   const {user}=await r.json();
   if(user?.email!=='admin-test@portailplus.invalid'||user.role!=='admin'||user.mustChange||home.classList.contains('hidden'))return;
   const link=document.createElement('a');link.id='personal-admin-diagnostic-link';link.href='/staging-personal-admin-diagnostic';link.className='btn';link.textContent='Diagnostic temporaire du compte administrateur';home.append(link);
  }catch{}finally{pending=false;}
 };
 const home=document.querySelector('#home');if(home)new MutationObserver(refresh).observe(home,{attributes:true,attributeFilter:['class']});refresh();
})();
