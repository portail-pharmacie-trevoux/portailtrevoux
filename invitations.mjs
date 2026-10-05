import {token,digest,encrypt,decrypt,passwordValid,hashPassword} from './security.mjs';
import {readEmployeeDetails} from './employee-details.mjs';
export const gmailSendScope='https://www.googleapis.com/auth/gmail.send';
export function sameMailAccount(a,b){
 const normalize=value=>String(value||'').toLowerCase().replace(/^([^@]+)@gmail\.com$/,(_,local)=>local.replace(/\./g,'')+'@gmail.com');
 return !!a&&!!b&&normalize(a)===normalize(b);
}
const emailValid=email=>typeof email==='string'&&email.length<=254&&/^[^\s<>"\r\n]+@[^\s<>"\r\n]+\.[^\s<>"\r\n]+$/.test(email);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function invitationAddress(db,person,secret){
 if(person.email)return person.email;
 const {details}=await readEmployeeDetails(db,person.id,secret);
 return details.personalEmail||details.workEmail||'';
}
export function welcomeMessage({sender,email,firstName,url}){
 if(!emailValid(sender)||!emailValid(email))throw Error('Invalid mail address');
 const subject='Bienvenue sur PORTAIL + - Créez votre mot de passe';
 const text=`Bonjour ${firstName},\n\nBienvenue dans l’espace équipe de la Pharmacie de Trévoux.\n\nPour activer votre accès et choisir votre mot de passe, ouvrez ce lien personnel :\n${url}\n\nVotre identifiant sera : ${email}\nCe lien est valable 72 heures et ne peut être utilisé qu’une seule fois.\nSi le lien a expiré, demandez une nouvelle invitation à l’administrateur.\n\nÀ bientôt sur PORTAIL + !\nPharmacie de Trévoux`;
 const html=`<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#182d3d"><h1 style="color:#006a60">Bienvenue sur PORTAIL +</h1><p>Bonjour ${escape(firstName)},</p><p>Bienvenue dans l’espace équipe de la <strong>Pharmacie de Trévoux</strong>.</p><p>Créez votre mot de passe pour activer votre accès personnel :</p><p><a href="${escape(url)}" style="display:inline-block;background:#006a60;color:white;padding:14px 22px;border-radius:8px;text-decoration:none">Créer mon mot de passe</a></p><p>Votre identifiant : <strong>${escape(email)}</strong></p><p>Ce lien personnel est valable <strong>72 heures</strong> et utilisable une seule fois. Si le lien a expiré, demandez une nouvelle invitation à l’administrateur.</p><p>À bientôt sur PORTAIL + !<br>Pharmacie de Trévoux</p><p style="font-size:12px;color:#62727f">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>${escape(url)}</p></div>`;
 const boundary='portal_'+token(),encode=value=>Buffer.from(value,'utf8').toString('base64').match(/.{1,76}/g).join('\r\n');
 const mime=[`From: Pharmacie de Trevoux <${sender}>`,`To: ${email}`,`Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,`MIME-Version: 1.0`,`Content-Type: multipart/alternative; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',encode(text),`--${boundary}`,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',encode(html),`--${boundary}--`,''].join('\r\n');
 return {raw:Buffer.from(mime).toString('base64url')};
}
export function createInvitationMailer({getSetting,setSetting,secret,clientId,clientSecret,sender='pharmacie.trevoux@gmail.com',fail,fetchImpl=fetch}){
 let refreshing=null;
 async function authorization(){
  const stored=await getSetting('mail_tokens');if(!stored)throw fail(409,'Connectez d’abord la messagerie des invitations dans la page Collaborateurs.');
  let tokens=decrypt(stored,secret);
  if(tokens.sender!==sender||!(tokens.scope||'').split(' ').includes(gmailSendScope))throw fail(409,'Reconnectez la messagerie de la pharmacie en autorisant l’envoi des e-mails.');
  if(tokens.expires_at>Date.now()+60000)return tokens;
  if(!refreshing)refreshing=(async()=>{
   if(!tokens.refresh_token||!clientId||!clientSecret)throw fail(409,'Reconnectez la messagerie des invitations.');
   let response;try{response=await fetchImpl('https://oauth2.googleapis.com/token',{method:'POST',redirect:'error',body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:tokens.refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(20000)});}catch{throw fail(502,'La messagerie est momentanément indisponible.');}
   if(!response.ok)throw fail(409,'L’autorisation Gmail a expiré. Reconnectez la messagerie des invitations.');
   const fresh=await response.json();tokens={...tokens,...fresh,expires_at:Date.now()+fresh.expires_in*1000};await setSetting('mail_tokens',encrypt(tokens,secret));return tokens;
  })().finally(()=>{refreshing=null;});
  return refreshing;
 }
 return {
  status:async()=>({configured:!!(clientId&&clientSecret),connected:!!await getSetting('mail_tokens'),sender}),
  send:async({email,firstName,url})=>{
   const tokens=await authorization();let response;
   try{response=await fetchImpl('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+tokens.access_token,'Content-Type':'application/json'},body:JSON.stringify(welcomeMessage({sender,email,firstName,url})),signal:AbortSignal.timeout(20000)});}catch{throw fail(502,'Gmail n’a pas confirmé l’envoi. Vérifiez les messages envoyés avant de réessayer.');}
   if(!response.ok){if(response.status===401)throw fail(409,'Reconnectez la messagerie des invitations.');if(response.status===403)throw fail(409,'Autorisez l’envoi Gmail et activez l’API Gmail dans le projet Google du portail.');throw fail(502,'Gmail n’a pas accepté le message. Réessayez plus tard.');}
   const sent=await response.json();if(!sent.id)throw fail(502,'L’envoi du message n’a pas été confirmé.');return sent.id;
  }
 };
}
export function registerInvitations({app,db,auth,ready,admin,csrf,fail,secret,origin,mailer,newSession}){
 const bad=()=>fail(400,'Ce lien est invalide, expiré ou déjà utilisé. Demandez une nouvelle invitation à la pharmacie.');
 async function transaction(work){const client=db.connect?await db.connect():db;try{await client.query('BEGIN');const result=await work(client);await client.query('COMMIT');return result;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release?.();}}
 const checkedToken=raw=>{if(typeof raw!=='string'||!/^[-\w]{43}$/.test(raw))throw bad();return digest(raw);};
 const validRow=async(client,hash,lock=false)=>(await client.query(`SELECT u.*,i.email AS invitation_email FROM employee_invitations i JOIN users u ON u.id=i.user_id
  WHERE i.token_hash=$1 AND i.sent_at IS NOT NULL AND i.used_at IS NULL AND i.expires_at>now() AND u.active=TRUE AND u.email=i.email AND (u.password_hash IS NULL OR u.must_change=TRUE)${lock?' FOR UPDATE OF i,u':''}`,[hash])).rows[0];
 async function limit(req,kind,max){const row=(await db.query("INSERT INTO login_attempts(key,count,until_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN login_attempts.until_at<now() THEN 1 ELSE login_attempts.count+1 END,until_at=CASE WHEN login_attempts.until_at<now() THEN EXCLUDED.until_at ELSE login_attempts.until_at END RETURNING count",[digest(kind+':'+req.ip)])).rows[0];if(row.count>max)throw fail(429,'Trop de tentatives. Réessayez dans 15 minutes.');}
 app.get('/api/mail/status',auth,ready,admin,async(req,res)=>res.json(await mailer.status()));
 app.post('/api/users/:id/invitation',auth,ready,admin,csrf,async(req,res)=>{
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)throw fail(400,'Collaborateur invalide.');
  if(!(await mailer.status()).connected)throw fail(409,'Connectez d’abord la messagerie des invitations dans la page Collaborateurs.');
  const result=await transaction(async client=>{
   const person=(await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!person)throw fail(404,'Collaborateur introuvable.');
   if(!person.active)throw fail(409,'Réactivez le collaborateur avant de l’inviter.');
   if(person.password_hash&&!person.must_change)throw fail(409,'Ce collaborateur a déjà défini son mot de passe.');
   if(person.invitation_sent_at&&new Date(person.invitation_sent_at)>new Date(Date.now()-60000))throw fail(429,'Une invitation vient d’être envoyée. Patientez une minute avant de la renvoyer.');
   const email=(await invitationAddress(client,person,secret)).trim().toLowerCase();if(!emailValid(email))throw fail(400,'Renseignez une adresse e-mail valide dans la fiche du collaborateur.');
   if(req.body?.email!==undefined&&(typeof req.body.email!=='string'||req.body.email.trim().toLowerCase()!==email))throw fail(409,'L’adresse e-mail a changé. Actualisez l’annuaire avant d’envoyer l’invitation.');
   const raw=token(),hash=digest(raw),url=origin+'/#invitation='+raw;
   await client.query('DELETE FROM employee_invitations WHERE user_id=$1 AND used_at IS NULL',[id]);
   await client.query("INSERT INTO employee_invitations(token_hash,user_id,email,expires_at,requested_by) VALUES($1,$2,$3,now()+interval '72 hours',$4)",[hash,id,email,req.auth.id]);
   // A pending account cannot log in until its owner chooses their own password.
   await client.query('UPDATE users SET email=$1,password_hash=NULL,must_change=TRUE WHERE id=$2',[email,id]);
   await mailer.send({email,firstName:person.first_name,url});
   await client.query('UPDATE employee_invitations SET sent_at=now() WHERE token_hash=$1',[hash]);
   await client.query('UPDATE users SET invitation_sent_at=now() WHERE id=$1',[id]);
   await client.query('DELETE FROM sessions WHERE user_id=$1',[id]);
   return {email};
  });res.json({ok:true,email:result.email});
 });
 app.post('/api/invitations/check',async(req,res)=>{
  const hash=checkedToken(req.body?.token);await limit(req,'invitation-check',80);const person=await validRow(db,hash);if(!person)throw bad();
  res.json({firstName:person.first_name,email:person.invitation_email});
 });
 app.post('/api/invitations/accept',async(req,res)=>{
  const hash=checkedToken(req.body?.token);await limit(req,'invitation-accept',20);
  if(!passwordValid(req.body.password))throw fail(400,'Choisissez un mot de passe de 12 caractères minimum (256 octets maximum).');
  const person=await transaction(async client=>{
   const user=await validRow(client,hash,true);if(!user)throw bad();const passwordHash=await hashPassword(req.body.password);
   const row=(await client.query('UPDATE users SET password_hash=$1,must_change=FALSE WHERE id=$2 RETURNING *',[passwordHash,user.id])).rows[0];
   await client.query('UPDATE employee_invitations SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',[user.id]);
   await client.query('DELETE FROM sessions WHERE user_id=$1',[user.id]);return row;
  });res.json(await newSession(person,res));
 });
}
