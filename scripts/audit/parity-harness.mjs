// Local routing probes only. Never import the preview entrypoint (it starts DB/DDL/listening).
import express from 'express';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createApp} from '../../server.mjs';
import {universes} from '../../security.mjs';
export const fixtureOrigin='https://portailplus-hds.osc-fr1.scalingo.io';
const blocked=async()=>{throw Error('PARITY_EXTERNAL_CALL_FORBIDDEN');};
export function fixtureConfig(){return {origin:fixtureOrigin,secret:'synthetic-parity-secret-'.repeat(3),dummyHash:'fixture:hash',youtrustClient:{},mailEmail:'',mailFetch:blocked,youtrustFetch:blocked,employeeScanFetch:blocked,employeeImportFetch:blocked,youtubeFetch:blocked};}
export function appRoutes(app){
 const result=[];
 for(const layer of app.router.stack){if(!layer.route)continue;for(const path of [layer.route.path].flat())for(const method of Object.keys(layer.route.methods)){
  if(typeof path!=='string')throw Error('UNREVIEWED_NON_STRING_ROUTE');
  result.push({method:method.toUpperCase(),path,guards:layer.route.stack.map(s=>s.handle.name).filter(Boolean)});
 }}return result.sort((a,b)=>(a.method+' '+a.path).localeCompare(b.method+' '+b.path));
}
export function branchAppRoutes({optional=false}={}){
 const db={query:blocked,connect:blocked};
 return appRoutes(createApp(db,{...fixtureConfig(),scalingoChallengeDeletion:true,procedureAdminManagement:true,employeeAccountsReadOnly:true,scalingoEmployeeLifecycle:true,scalingoAccountCreation:true,scalingoAccountManagement:true,invitationSendingEnabled:false,messageAutomationAdminEnabled:optional}).app);
}
export async function createProbeGate({role='admin',googleEnabled=true,template='normal'}={}){
 const code=await readFile(new URL('../serve-scalingo-ui-preview.mjs',import.meta.url),'utf8');
 const start=code.indexOf(' const gate=express();'),end=code.indexOf(' const server=gate.listen');
 if(start<0||end<=start)throw Error('PREVIEW_GATE_BOUNDARY_CHANGED');
 const queryLog=[];
 const user={id:59,name:'Synthetic parity administrator',first_name:'Synthetic',last_name:'Fixture',email:'parity-admin@example.invalid',role,active:true,must_change:false,csrf:'fixture-csrf',rights:universes,edit_rights:universes,permissions_configured:true,session_id:'fixture-session'};
 const db={query:async(sql,args=[])=>{
  queryLog.push({kind:/^\s*(SELECT|WITH)/i.test(sql)?'read':'shadow-write'});
  if(/FROM sessions .*JOIN users|FROM users .*JOIN sessions/i.test(sql))return {rows:[user],rowCount:1};
  if(/COUNT\(\*\).*FROM users/i.test(sql))return {rows:[{n:16,count:'16'}]};
  if(/SELECT id,name FROM schedule_templates/.test(sql))return {rows:[{id:7,name:template==='demo'?'semaine test':'Synthetic real template'}]};
  if(/FROM users WHERE id/.test(sql))return {rows:[{...user,id:Number(args[0])||7,role:'employee',directory_key:'synthetic-parity-person',name:'Synthetic collaborator'}]};
  if(/SELECT u\.\*/.test(sql))return {rows:[user]};
  return {rows:[],rowCount:0};
 }};
 const bindings={express,db,origin:fixtureOrigin,env:{},googleCalendar:{enabled:googleEnabled},execFileAsync:blocked,process:{execPath:'forbidden',cwd:()=>'',env:{}},console:{log(){}}};
 for(const match of code.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/gm)){
  if(!match[2].startsWith('.'))continue;
  const module=await import(new URL(match[2],new URL('../serve-scalingo-ui-preview.mjs',import.meta.url)));
  for(const name of match[1].split(',').map(s=>s.trim()).filter(Boolean)){if(name==='createApp')continue;bindings[name]=module[name];}
 }
 bindings.app=(req,res)=>res.status(200).json({parityDelegated:true});
 const context=vm.createContext(bindings);vm.runInContext(code.slice(start,end)+'\nglobalThis.parityGate=gate;',context,{timeout:5000});
 return {gate:context.parityGate,queryLog};
}
export function moduleFor(path){
 if(/^\/api\/(users|collaborateurs|invitations|password)/.test(path))return 'Collaborateurs et accès';
 if(/^\/api\/(schedule|leave-requests)/.test(path))return 'Emplois du temps et absences';
 if(/^\/api\/(news|publications|message-automations)/.test(path))return 'Messagerie et communication';
 if(/^\/api\/(calendar|google)/.test(path)||path.startsWith('/auth/google'))return 'Agenda et Google Calendar';
 if(path.startsWith('/api/hr')||path.startsWith('/api/youtrust'))return 'Ressources humaines';
 if(path.startsWith('/api/quality'))return 'Démarche qualité';
 if(path.startsWith('/api/training'))return 'Formations et références';
 if(path.startsWith('/api/procedures'))return 'Procédures';
 if(path.startsWith('/api/laboratories'))return 'Laboratoires';
 if(path.startsWith('/api/contacts'))return 'Contacts utiles';
 if(/^\/api\/order/.test(path))return 'Commandes programmées et MFA';
 if(path.startsWith('/api/merchandising'))return 'Merchandising';
 if(path.startsWith('/api/challenges'))return 'Challenges';
 if(/^\/api\/(music|youtube)/.test(path))return 'Fun';
 if(path.startsWith('/api/promoflash'))return 'Calculs et PromoFlash (retrait volontaire)';
 if(path.startsWith('/api/mail')||path.startsWith('/api/integrations'))return 'Courriels et intégrations';
 if(path.startsWith('/api/tester')||path.startsWith('/tester'))return 'Accès testeurs';
 return 'Portail et navigation';
}
export function samplePath(path){return path.replace(/:([a-zA-Z_]+)/g,(_,name)=>({week:'2026-11-02',day:'2026-11-02',month:'2026-11',name:'Agenda',universe:'Agenda',ean:'1234567890123'}[name]||'7'));}
export async function probeRows(routes,options={}){
 const {gate,queryLog}=await createProbeGate(options);const server=gate.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port,result=[];
 try{for(const route of routes){
  const path=samplePath(route.path),headers={host:'portailplus-hds.osc-fr1.scalingo.io',origin:fixtureOrigin,cookie:'trevoux_session='+'a'.repeat(43),'x-csrf-token':'fixture-csrf','content-type':'application/json'};
  const response=await fetch(base+path,{method:route.method,headers,redirect:'manual',...(!['GET','HEAD'].includes(route.method)?{body:JSON.stringify({templateId:7})}:{})});
  const text=await response.text();let data;try{data=JSON.parse(text);}catch{}
  result.push({...route,module:moduleFor(route.path),probePath:path,status:response.status,delegated:data?.parityDelegated===true,reason:data?.parityDelegated?null:typeof data?.error==='string'?data.error.slice(0,180):null});
 }}finally{await new Promise(r=>server.close(r));}
 return {rows:result,shadowQueries:queryLog.length};
}
export async function routesFromCheckout(directory){
 // createApp registers handlers only. Startup/initialize/jobs are deliberately never invoked.
 const {createApp:baseline}=await import(pathToFileURL(resolve(directory,'server.mjs')));
 return appRoutes(baseline({query:blocked,connect:blocked},fixtureConfig()).app);
}
