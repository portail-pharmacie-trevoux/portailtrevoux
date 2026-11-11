// Safety preload for parity tests. External fetch/HTTP(S) is forbidden, mocks remain possible.
const http=require('node:http'),https=require('node:https');
function allowed(input){
 let host;if(typeof input==='string'||input instanceof URL){try{host=new URL(input).hostname;}catch{throw Error('PARITY_TEST_NETWORK_FORBIDDEN');}}
 else host=input?.hostname||input?.host;
 if(!['localhost','127.0.0.1','[::1]','::1'].includes(host))throw Error('PARITY_TEST_NETWORK_FORBIDDEN');
}
const fetch=globalThis.fetch;globalThis.fetch=(input,...args)=>{allowed(input instanceof Request?input.url:input);return fetch(input,...args);};
for(const module of [http,https])for(const name of ['request','get']){const original=module[name];module[name]=function(input,...args){allowed(input);return original.call(this,input,...args);};}
