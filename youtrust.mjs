import {encrypt,decrypt} from './security.mjs';
import {signatureSheet} from './signature-sheet.mjs';
import {PDFDocument} from 'pdf-lib';
export const uuidValid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const requestStatuses={draft:'created',ongoing:'sent',approval:'sent',paused:'paused',done:'completed',declined:'declined',rejected:'declined',expired:'expired',deleted:'voided',canceled:'voided'};
const signerStatuses={initiated:'created',notified:'sent',verified:'delivered',processing:'delivered',consent_given:'delivered',signed:'completed',declined:'declined',aborted:'voided',error:'error'};
export function createYoutrust({getSetting,setSetting,deleteSetting,secret,fail,config={},fetchImpl=fetch}){
 const base=environment=>environment==='demo'?'https://api-sandbox.yousign.app/v3':'https://api.yousign.app/v3';
 async function settings(){const stored=await getSetting('youtrust_config');return stored?decrypt(stored,secret):{apiKey:config.youtrustKey||'',environment:config.youtrustEnvironment==='sandbox'?'demo':'production',verified:false};}
 async function request(c,path,options={},uncertain=false){
  let response;try{response=await fetchImpl(base(c.environment)+path,{...options,headers:{Authorization:'Bearer '+c.apiKey,Accept:'application/json',...options.headers},redirect:'error',signal:AbortSignal.timeout(45000)});}catch{throw Object.assign(fail(502,'Youtrust ne répond pas. Consultez le suivi avant de réessayer.'),{uncertain});}
  if(!response.ok)throw Object.assign(fail(response.status===401?409:response.status===429?429:502,response.status===401?'La clé API Youtrust est invalide ou expirée.':response.status===403?'Votre compte Youtrust n’autorise pas cette opération. Vérifiez votre offre API et les droits de la clé.':response.status===429?'Youtrust limite temporairement les demandes. Réessayez plus tard.':'Youtrust a refusé la demande. Vérifiez le document, les signataires et votre accès API.'),{uncertain:uncertain&&response.status>=500});
  return response;
 }
 async function json(c,path,body,uncertain=false){const response=await request(c,path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},uncertain);try{return await response.json();}catch{throw Object.assign(fail(502,'Youtrust n’a pas confirmé la demande. Consultez le suivi.'),{uncertain});}}
 async function context(){const c=await settings();if(!c.apiKey)throw fail(409,'Renseignez votre clé API dans la connexion Youtrust de cette page.');return {...c,accountId:'youtrust',baseUri:base(c.environment)};}
 async function bytes(response){const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>25*1024*1024)throw fail(413,'Le document dépasse 25 Mo. Téléchargez-le depuis Youtrust.');chunks.push(Buffer.from(chunk));}const data=Buffer.concat(chunks);if(data.subarray(0,5).toString()!=='%PDF-')throw fail(502,'Youtrust n’a pas fourni un PDF valide.');return data;}
 async function upload(c,path,data,name){const form=new FormData();form.set('nature','signable_document');form.set('file',new Blob([data],{type:name.endsWith('.docx')?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/pdf'}),name);const response=await request(c,path+'/documents',{method:'POST',body:form});const result=await response.json();if(!uuidValid(result.id))throw fail(502,'Référence du document Youtrust invalide.');return result.id;}
 return {
  context,
  status:async()=>{const c=await settings();return {configured:!!c.apiKey,connected:!!c.apiKey&&!!c.verified,environment:c.environment,accountName:'Pharmacie de Trévoux'};},
  configure:async body=>{const previous=await settings();if(!['production','demo'].includes(body?.environment)||typeof body?.apiKey!=='string'||body.apiKey.length>1000)throw fail(400,'Renseignez la clé API Youtrust et son environnement.');const apiKey=body.apiKey.trim()||(body.environment===previous.environment?previous.apiKey:'');if(apiKey.length<8||/[\s\r\n]/.test(apiKey))throw fail(400,'Renseignez une clé API Youtrust valide.');const c={apiKey,environment:body.environment};await json(c,'/signature_requests?limit=1');await setSetting('youtrust_config',encrypt({...c,verified:true},secret));return {ok:true};},
  disconnect:async()=>{await setSetting('youtrust_config',encrypt({apiKey:'',environment:'production',verified:false},secret));return {ok:true};},
  send:async({document,signers,requestId,context:c,checkpoint=async()=>{}})=>{
   let original=document.file_content;
   if(document.file_type==='application/pdf'){try{original=Buffer.from(await (await PDFDocument.load(original)).save());}catch{throw fail(400,'Ce PDF ne peut pas être préparé pour la signature. Importez un PDF non protégé.');}}
   const result=await json(c,'/signature_requests',{name:('Pharmacie de Trévoux - '+document.title).slice(0,128),delivery_mode:'email',ordered_signers:false,external_id:requestId,timezone:'Europe/Paris',audit_trail_locale:'fr'},true);
   if(!uuidValid(result.id))throw Object.assign(fail(502,'Youtrust n’a pas confirmé la création. Consultez le suivi.'),{uncertain:true});
   const path='/signature_requests/'+result.id;await checkpoint({envelopeId:result.id});
   if(document.file_type!=='application/pdf'){
    const temporary=await upload(c,path,original,document.file_name);
    original=await bytes(await request(c,path+'/documents/download?version=current&archive=false',{headers:{Accept:'application/pdf'}}));
    await request(c,path+'/documents/'+temporary,{method:'DELETE'});
   }
   const sheet=await signatureSheet({title:document.title,hash:document.file_hash,signers,original});
   const documentId=await upload(c,path,sheet.bytes,'document-a-signer.pdf'),prepared=[];
   for(let i=0;i<signers.length;i++){
    const person=signers[i],parts=person.name.trim().split(/\s+/),first=person.firstName||parts[0],last=person.lastName||parts.slice(1).join(' ')||parts[0];
    const signer=await json(c,path+'/signers',{info:{first_name:first,last_name:last,email:person.email,locale:'fr'},signature_level:'electronic_signature',signature_authentication_mode:'otp_email',fields:[{...sheet.fields[i],document_id:documentId}]});
    if(!uuidValid(signer.id))throw fail(502,'Référence du signataire Youtrust invalide.');prepared.push({...person,recipientId:signer.id});await checkpoint({envelopeId:result.id,recipients:prepared});
   }
   const activated=await json(c,path+'/activate',{},true);
   if(!requestStatuses[activated.status]||activated.status==='draft')throw Object.assign(fail(502,'L’activation Youtrust n’a pas été confirmée. Actualisez le suivi.'),{uncertain:true});
   return {envelopeId:result.id,status:requestStatuses[activated.status],recipients:prepared};
  },
  inspect:async record=>{
   const c=await context();if(c.environment!==record.environment)throw fail(409,'Choisissez l’environnement Youtrust utilisé pour cette demande.');let id=record.envelope_id;
   if(!id){const list=await json(c,'/signature_requests?external_id%5Beq%5D='+encodeURIComponent(record.id));id=list.data?.[0]?.id;if(!id)throw fail(409,'Demande non retrouvée. Vérifiez votre compte Youtrust avant un nouvel envoi.');}
   if(!uuidValid(id))throw fail(502,'Référence Youtrust invalide.');const result=await json(c,'/signature_requests/'+id);if(!requestStatuses[result.status])throw fail(502,'Statut Youtrust non reconnu.');
   return {envelopeId:id,status:requestStatuses[result.status],recipients:(result.signers||[]).map(s=>({recipientId:s.id,status:signerStatuses[s.status]||'created',signedAt:s.signed_at||null}))};
  },
  signedFile:async record=>{const c=await context();if(c.environment!==record.environment)throw fail(409,'Choisissez l’environnement Youtrust de cette demande.');if(record.status!=='completed'||!uuidValid(record.envelope_id))throw fail(409,'Toutes les signatures ne sont pas terminées.');return bytes(await request(c,'/signature_requests/'+record.envelope_id+'/documents/download?version=completed&archive=false',{headers:{Accept:'application/pdf'}}));}
 };
}
