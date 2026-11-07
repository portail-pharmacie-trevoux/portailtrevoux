// Temporary, mounted exclusively by the Scalingo preview entrypoint.
import express from 'express';
import {readFileSync} from 'node:fs';
import {isScalingoOrigin} from './scalingo-origins-preview.mjs';
export const diagnosticExpiry=Date.parse('2026-11-10T23:59:59Z');
export const diagnosticPath='/staging-personal-admin-diagnostic';
export function diagnosticHomepage(html){return html.replace('</body>','<script src="/staging-personal-admin-diagnostic-ui.js" defer></script></body>');}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function page(csrf,result){return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Diagnostic temporaire</title><body><main><h1>Diagnostic temporaire du compte administrateur personnel</h1><p>Lecture seule. Aucune création ou modification de compte.</p>${result?`<dl><dt>Compte existant</dt><dd>${result.exists?'OUI':'NON'}</dd><dt>Compte actif</dt><dd>${result.active?'OUI':'NON'}</dd><dt>Droits administrateur</dt><dd>${result.admin?'OUI':'NON'}</dd></dl>`:''}<form method="post" action="/api/staging-personal-admin-diagnostic"><input type="hidden" name="csrf" value="${escape(csrf)}"><button>Vérifier le compte</button></form><p><a href="/trevoux">Retour à Portail+</a></p></main></body></html>`;}
export function registerScalingoPersonalAdminDiagnostic({gate,db,adminAuth,env=process.env,now=Date.now}){
 const enabled=()=>env.SCALINGO_PERSONAL_ADMIN_DIAGNOSTIC_DISABLED!=='true'&&now()<diagnosticExpiry;
 const headers=(req,res,next)=>{res.set({'Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Strict-Transport-Security':'max-age=31536000','Content-Security-Policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"});next();};
 const available=(req,res,next)=>enabled()?next():res.status(404).send('Diagnostic indisponible.');
 const origin=(req,res,next)=>isScalingoOrigin(req.get('origin'))?next():res.status(403).send('Origine refusée.');
 const csrf=(req,res,next)=>typeof req.body?.csrf==='string'&&req.body.csrf===req.cleanupAdmin.csrf&&Object.keys(req.body).every(k=>k==='csrf')&&Object.keys(req.query).length===0?next():res.status(403).send('Requête refusée.');
 gate.get('/staging-personal-admin-diagnostic-ui.js',(req,res)=>res.set('Cache-Control','no-store').type('application/javascript').send(enabled()?readFileSync(new URL('./scalingo-personal-admin-diagnostic-ui.js',import.meta.url),'utf8'):''));
 gate.get(diagnosticPath,headers,available,(req,res,next)=>{if((req.get('origin')&&!isScalingoOrigin(req.get('origin')))||req.get('sec-fetch-site')==='cross-site')return res.status(403).send('Origine refusée.');next();},adminAuth,(req,res)=>res.type('html').send(page(req.cleanupAdmin.csrf)));
 gate.post('/api/staging-personal-admin-diagnostic',headers,available,origin,adminAuth,express.urlencoded({extended:false,limit:'1kb'}),csrf,async(req,res,next)=>{
  let client;
  try{
   client=await db.connect();await client.query('BEGIN READ ONLY');
   const {rows}=await client.query("SELECT count(*)>0 AS exists,COALESCE(bool_or(active),FALSE) AS active,COALESCE(bool_or(role='admin'),FALSE) AS admin FROM users WHERE email=$1",['pharmaciedetrevoux@gmail.com']);
   const result={exists:rows[0].exists===true,active:rows[0].active===true,admin:rows[0].admin===true};
   await client.query('ROLLBACK');res.type('html').send(page(req.cleanupAdmin.csrf,result));
  }catch{if(client)await client.query('ROLLBACK').catch(()=>{});next(Object.assign(Error('Diagnostic indisponible. Aucune modification effectuée.'),{status:503}));}finally{client?.release();}
 });
}
