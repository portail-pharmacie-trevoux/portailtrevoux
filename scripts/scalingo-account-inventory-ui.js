// Navigation only; authorization and expiration are independently enforced server-side.
(()=>{
 let pending=false;
 const refresh=async()=>{
  const home=document.querySelector('#home');
  if(!home||home.classList.contains('hidden')){document.querySelector('#account-inventory-link')?.remove();return;}
  if(pending||document.querySelector('#account-inventory-link'))return;
  pending=true;
  try{
   const r=await fetch('/api/me',{cache:'no-store'});if(!r.ok)return;
   const {user}=await r.json();
   if(user?.email!=='admin-test@portailplus.invalid'||user.role!=='admin'||user.mustChange||home.classList.contains('hidden'))return;
   const link=document.createElement('a');link.id='account-inventory-link';link.href='/staging-account-inventory';link.className='btn';link.textContent='Inventaire temporaire des comptes';home.append(link);
  }catch{}finally{pending=false;}
 };
 const home=document.querySelector('#home');if(home)new MutationObserver(refresh).observe(home,{attributes:true,attributeFilter:['class']});refresh();
})();
