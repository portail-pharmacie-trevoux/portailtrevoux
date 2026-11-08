// Offline comparison only: no databases, application initialization or secrets.
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {hashPassword,verifyPassword,canModify} from '../security.mjs';
export const renderAuthReference='aa6e9a289221325471211ab577d07f5adc21d17d';
export async function auditAuthContinuity(){
 const source=execFileSync('git',['show',renderAuthReference+':security.mjs'],{cwd:new URL('..',import.meta.url),encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const render=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 let crossVerification=true,wrongPasswordRejected=true;
 for(const prefix of ['local-fixture-','Équipe-fictive-🔐-']){
  const password=prefix+randomBytes(24).toString('base64url'),fromRender=await render.hashPassword(password),fromScalingo=await hashPassword(password);
  crossVerification=crossVerification&&await verifyPassword(password,fromRender)&&await render.verifyPassword(password,fromScalingo);
  wrongPasswordRejected=wrongPasswordRejected&&!await verifyPassword(password+'!',fromRender);
 }
 const modules=['Laboratoires',"Outils d'aide aux commandes","Outils d'aide au merchandising","Outils d'aide à la démarche qualité"];
 const fixture={role:'employee',rights:modules,edit_rights:[],permissions_configured:true};
 return {renderCodeReference:renderAuthReference,productionDeploymentVerified:false,liveDataVerified:false,passwords:{algorithm:'scrypt',N:32768,r:8,p:1,keyBytes:64,saltBytes:16,maxmemBytes:67108864,format:'salt:hex',hashFunctionsIdentical:hashPassword.toString()===render.hashPassword.toString(),verificationFunctionsIdentical:verifyPassword.toString()===render.verifyPassword.toString(),crossVerification,wrongPasswordRejected,requiresSourceAppSecret:false},illustrativeRightsDifferences:modules.map(universe=>({universe,render:render.canModify(fixture,universe),scalingo:canModify(fixture,universe)})).filter(x=>x.render!==x.scalingo),remoteWrites:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const result=await auditAuthContinuity();console.log(JSON.stringify(result));if(!result.passwords.crossVerification||!result.passwords.wrongPasswordRejected)process.exitCode=1;}
 catch{console.error('Audit local indisponible : vérifier la présence de la référence Git documentée. Aucun accès aux bases effectué.');process.exitCode=1;}
}
