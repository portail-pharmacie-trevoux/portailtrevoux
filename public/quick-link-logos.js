export function quickLinkImageUrl(item){
 if(item.imageUrl)return item.imageUrl;
 let host;try{host=new URL(item.url).hostname;}catch{return '';}
 // Do not send local/private site names to the public favicon service.
 if(!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)||/\.(?:local|localhost|internal|lan|test|invalid)$/i.test(host))return '';
 return 'https://icons.duckduckgo.com/ip3/'+encodeURIComponent(host)+'.ico';
}
export function makeQuickLinkLogo(item){
 const image=document.createElement('img'),fallback=document.createElement('span'),wrapper=document.createElement('span');wrapper.className='quick-link-logo';image.alt='';image.loading='lazy';image.referrerPolicy='no-referrer';fallback.className='quick-link-logo-fallback';fallback.textContent=(item.name||'Site').trim().slice(0,2).toUpperCase();const url=quickLinkImageUrl(item);image.hidden=!url;fallback.hidden=!!url;if(url)image.src=url;image.onerror=()=>{image.hidden=true;fallback.hidden=false;};wrapper.append(image,fallback);return wrapper;
}
