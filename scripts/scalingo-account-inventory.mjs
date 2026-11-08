// Temporary metadata-only page. Mounted exclusively by the Scalingo preview.
import express from 'express';
import {readFileSync} from 'node:fs';
import {normalizeName} from '../collaborateurs.mjs';
import {isScalingoOrigin} from './scalingo-origins-preview.mjs';
export const inventoryPath='/staging-account-inventory';
export const inventoryApiPath='/api/staging-account-inventory';
// 10 November 2026, 22:00 Europe/Paris; no request/config can extend this cutoff.
export const inventoryExpiry=Date.parse('2026-11-10T21:00:00Z');
export const inventorySQL=`SELECT id,first_name,last_name,email,role,active,
 (password_hash IS NOT NULL AND password_hash<>'') AS password_present,
 permissions_configured,directory_key FROM users ORDER BY id`;
export const inventoryHomepage=html=>html.replace('</body>','<script src="/staging-account-inventory-ui.js" defer></script></body>');
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const yes=v=>v?'OUI':'NON';
const emailKey=v=>String(v??'').trim().toLowerCase();
const sourceAdmins=[{email:'pharmaciedetrevoux@gmail.com',name:'Nicolas Marchand'},{email:'factures.phdt@gmail.com',name:'Sarah Dias'}];
const testEmails=new Set(['admin-test@portailplus.invalid','adjoint.demo@portailplus.invalid','preparateur.demo@portailplus.invalid','preparatrice.demo@portailplus.invalid','apprenti.demo@portailplus.invalid','rayonniste.demo@portailplus.invalid']);
export function inventoryMetadata(rows){return rows.map(r=>({id:r.id,firstName:r.first_name??'',lastName:r.last_name??'',email:r.email??'',role:r.role,active:r.active===true,passwordPresent:r.password_present===true,permissionsConfigured:r.permissions_configured===true,directoryKey:r.directory_key??''}));}
export function inventoryAnalysis(rows){
 const emailGroups=new Map(),nameGroups=new Map();
 for(const r of rows){const email=emailKey(r.email),name=normalizeName(r.firstName+' '+r.lastName);if(email)emailGroups.set(email,[...(emailGroups.get(email)||[]),r.id]);if(name)nameGroups.set(name,[...(nameGroups.get(name)||[]),r.id]);}
 return {duplicateEmails:[...emailGroups.values()].filter(g=>g.length>1),similarIdentities:[...nameGroups.values()].filter(g=>g.length>1),sourceCandidates:sourceAdmins.map(s=>({...s,targetIds:rows.filter(r=>r.email===s.email&&normalizeName(r.firstName+' '+r.lastName)===normalizeName(s.name)).map(r=>r.id)}))};
}
function results(rows){
 const analysis=inventoryAnalysis(rows),duplicateIds=new Set(analysis.duplicateEmails.flat()),similarIds=new Set(analysis.similarIdentities.flat());
 const cells=values=>'<tr>'+values.map(v=>'<td>'+escape(v)+'</td>').join('')+'</tr>';
 const inventory=rows.map(r=>{
  const source=sourceAdmins.find(s=>emailKey(s.email)===emailKey(r.email));
  const anomalies=[duplicateIds.has(r.id)?'Doublon potentiel e-mail':'',similarIds.has(r.id)?'Identité similaire : revue requise':'',source&&normalizeName(r.firstName+' '+r.lastName)!==normalizeName(source.name)?'Identité différente de l’administrateur Render déclaré':'',source&&r.role!=='admin'?'Rôle différent de l’administrateur Render déclaré':'',source&&!r.active?'Administrateur déclaré mais inactif sur Scalingo':''].filter(Boolean);
  return cells([r.id,r.firstName,r.lastName,r.email||'Non renseignée',r.role==='admin'?'Administrateur':r.role==='employee'?'Collaborateur':'Rôle à vérifier',yes(r.active),yes(r.passwordPresent),yes(r.permissionsConfigured),r.directoryKey||'Non renseigné',testEmails.has(r.email)?'Compte de test connu':source?'Administrateur personnel déclaré':'Compte à rapprocher',anomalies.join(' ; ')||'Aucune anomalie locale détectée']);
 }).join('');
 const correspondence=rows.map(r=>{
  const source=sourceAdmins.find(s=>emailKey(s.email)===emailKey(r.email)),exact=source&&source.email===r.email&&normalizeName(source.name)===normalizeName(r.firstName+' '+r.lastName),test=testEmails.has(r.email);
  return cells([r.firstName+' '+r.lastName,source?source.name+' — e-mail fourni par le titulaire ; ID Render manquant':test?'Hors périmètre':'Métadonnées Render individuelles non fournies','ID Scalingo '+r.id,exact?'Concordance déclarée e-mail et identité ; pas de paire d’IDs validée':source?'Écart d’adresse ou d’identité à vérifier':'Non vérifié',test||source?'Aucune reprise autorisée':'À déterminer après rapprochement',source?.email===sourceAdmins[0].email?'Conserver compte et Ente Auth validés':source?'Attendre la confirmation d’activation de Sarah':test?'Conserver le compte de test':'Réutiliser la fiche ; ne rien modifier avant validation']);
 }).join('');
 return `<h2>Inventaire Scalingo</h2><p>${rows.length} comptes observés ; ${rows.filter(r=>r.active).length} actifs ; ${rows.filter(r=>r.role==='admin').length} administrateurs. Doublons potentiels d’e-mail : ${analysis.duplicateEmails.length} groupe(s). Identités similaires : ${analysis.similarIdentities.length} groupe(s), sans rapprochement automatique.</p><table><thead><tr>${['ID Scalingo','Prénom','Nom','E-mail','Rôle','Actif','Empreinte présente','Autorisations configurées','Clé de fiche','Classification','Anomalies locales'].map(x=>'<th scope="col">'+x+'</th>').join('')}</tr></thead><tbody>${inventory}</tbody></table><p>L’ID est stable dans cette base seulement. La clé directory_key peut être dérivée d’un nom ou créée manuellement : elle ne prouve pas une correspondance avec un ID Render.</p><h2>Rapprochement provisoire</h2><p>Render : 18 actifs, 2 administrateurs, 14 collaborateurs avec accès et 2 sans accès, selon le titulaire. Les identifiants et e-mails individuels des 16 collaborateurs ne sont pas disponibles ici. Aucun nombre de correspondances confirmées Render ne peut être déduit de ces seuls totaux. Une identité similaire n’est pas une preuve.</p><table><thead><tr>${['Collaborateur','Compte Render','Compte Scalingo','E-mail identique','Mot de passe à reprendre','Action proposée'].map(x=>'<th scope="col">'+x+'</th>').join('')}</tr></thead><tbody>${correspondence}</tbody></table><p>Cette page n’applique aucun rapprochement, transfert, changement de rôle ou de mot de passe. Aucun secret Ente Auth n’est lu.</p>`;
}
function page(csrf,rows){return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex,nofollow,noarchive,nosnippet"><title>Inventaire temporaire Scalingo</title></head><body><main><h1>Inventaire temporaire des comptes Scalingo</h1><p>Lecture seule, réservée à Administrateur Test. Aucune donnée n’est modifiée. Nicolas, Sarah, Administrateur Test et les 16 fiches définitives sont conservés.</p><p>Expiration : 10 novembre 2026 à 22 h (heure de Paris).</p>${rows?results(rows):'<p>Cliquer pour lire les métadonnées. Aucun mot de passe, empreinte, cookie, jeton de session ou secret MFA ne sera affiché.</p>'}<form method="post" action="${inventoryApiPath}"><input type="hidden" name="csrf" value="${escape(csrf)}"><button>Afficher l’inventaire</button></form><p><a href="/trevoux">Retour à Portail+</a></p></main></body></html>`;}
export function registerScalingoAccountInventory({gate,db,adminAuth,env=process.env,now=Date.now}){
 const enabled=()=>env.SCALINGO_ACCOUNT_INVENTORY_ENABLED==='true'&&now()<inventoryExpiry;
 const headers=(req,res,next)=>{res.set({'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','Expires':'0','Vary':'Cookie, Origin','X-Robots-Tag':'noindex, nofollow, noarchive, nosnippet','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin','Cross-Origin-Resource-Policy':'same-origin','Strict-Transport-Security':'max-age=31536000','Content-Security-Policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"});next();};
 const available=(req,res,next)=>enabled()?next():res.status(404).send('Inventaire indisponible.');
 const navigation=(req,res,next)=>{if(req.get('origin')&&!isScalingoOrigin(req.get('origin'))||req.get('sec-fetch-site')==='cross-site'&&!(req.get('sec-fetch-mode')==='navigate'&&req.get('sec-fetch-dest')==='document'))return res.status(403).send('Origine refusée.');next();};
 gate.get('/staging-account-inventory-ui.js',headers,(req,res)=>res.type('application/javascript').send(enabled()?readFileSync(new URL('./scalingo-account-inventory-ui.js',import.meta.url),'utf8'):''));
 gate.get(inventoryPath,headers,available,navigation,adminAuth,(req,res)=>res.type('html').send(page(req.cleanupAdmin.csrf)));
 gate.post(inventoryApiPath,headers,available,(req,res,next)=>isScalingoOrigin(req.get('origin'))?next():res.status(403).send('Origine refusée.'),adminAuth,express.urlencoded({extended:false,limit:'1kb'}),async(req,res,next)=>{
  if(typeof req.body?.csrf!=='string'||req.body.csrf!==req.cleanupAdmin.csrf||Object.keys(req.body).some(k=>k!=='csrf')||Object.keys(req.query).length)return res.status(403).send('Requête refusée.');
  let client;
  try{
   client=await db.connect();await client.query('BEGIN READ ONLY');await client.query("SET LOCAL statement_timeout = '5s'");
   const identity=(await client.query('SELECT current_database() AS database,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls')).rows[0];
   if(identity?.database!=='portailplus_7495'||identity.tls!==true)throw Error('Database guard');
   const {rows}=await client.query(inventorySQL),data=inventoryMetadata(rows);
   await client.query('ROLLBACK');res.type('html').send(page(req.cleanupAdmin.csrf,data));
  }catch{if(client)await client.query('ROLLBACK').catch(()=>{});next(Object.assign(Error('Inventaire indisponible. Aucune modification effectuée.'),{status:503}));}finally{client?.release();}
 });
}
