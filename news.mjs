export const newsDeadline=(alias='m')=>`LEAST(${alias}.created_at+interval '15 days',COALESCE(((${alias}.expires_on+1)::timestamp AT TIME ZONE 'Europe/Paris'),${alias}.created_at+interval '15 days'))`;
export function validateNewsExpiry(value,fail,now=new Date()){
 if(value===undefined||value===null||value==='')return null;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value])),today=parts.year+'-'+parts.month+'-'+parts.day,max=new Date(today+'T12:00:00Z');max.setUTCDate(max.getUTCDate()+14);
 if(typeof value!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)||Number.isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value||value<today||value>max.toISOString().slice(0,10))throw fail(400,'Choisissez une expiration entre aujourd’hui et les 14 jours suivants.');return value;
}
import {validateProcedureFile} from './procedure-files.mjs';
import {validateEmployeeScan} from './employee-import.mjs';
export function validateNewsAttachment(value,fail){if(value===undefined||value===null)return null;if(typeof value!=='object'||Array.isArray(value))throw fail(400,'Pièce jointe invalide.');return /\.(pdf|docx)$/i.test(value.fileName||'')?validateProcedureFile(value,fail):validateEmployeeScan(value,fail);}
export const messageLimit=500;
export function validateMessage(body,fail){
  const text=typeof body?.text==='string'?body.text.trim():'';
  if(!text||Array.from(text).length>messageLimit)throw fail(400,'Le message doit contenir de 1 à 500 caractères.');
  if(!Array.isArray(body?.recipients)||!body.recipients.length||body.recipients.length>200||body.recipients.some(id=>!Number.isSafeInteger(id)||id<1))throw fail(400,'Sélectionnez un ou plusieurs collaborateurs actifs.');
  const priority=body.priority??'normal';if(!['normal','important'].includes(priority))throw fail(400,'Priorité invalide.');
  return {priority,text,recipients:[...new Set(body.recipients)]};
}
export async function purgeNews(db){
  // Each recipient keeps their own archive, independently of other recipients.
  await db.query(`DELETE FROM team_message_recipients r USING team_messages m
    WHERE r.message_id=m.id AND NOT r.archived AND ${newsDeadline()}<=now()`);
  await db.query(`DELETE FROM team_messages m WHERE ${newsDeadline()}<=now()
    AND NOT EXISTS(SELECT 1 FROM team_message_recipients r WHERE r.message_id=m.id)`);
}
export async function unreadNews(db,userId){
  return (await db.query(`SELECT COUNT(*)::int AS unread FROM team_message_recipients r
    JOIN team_messages m ON m.id=r.message_id WHERE r.user_id=$1 AND NOT r.seen
    AND (r.archived OR ${newsDeadline()}>now())`,[userId])).rows[0]?.unread||0;
}
export function registerNews({app,db,auth,ready,csrf,viewUniverse,fail,uploadParser}){
  const access=viewUniverse('Actualités');
  app.get('/api/news/recipients',auth,ready,access,async(req,res)=>{
    res.json((await db.query('SELECT id,name FROM users WHERE active=TRUE ORDER BY last_name,first_name,id')).rows);
  });
  app.get('/api/news',auth,ready,access,async(req,res)=>{
    await purgeNews(db);
    res.json((await db.query(`SELECT m.id,m.sender_id,m.sender_name AS sender,m.text,m.priority,m.created_at,m.attachment_name,m.can_archive,m.planning_week,m.is_reply,m.reply_to_id,COALESCE(m.thread_id,m.id) AS thread_id,m.challenge_digest,m.order_digest,
      CASE WHEN parent.sender_id=$1 AND ${newsDeadline('parent')}>now() THEN jsonb_build_object('text',parent.text,'createdAt',parent.created_at) ELSE NULL END AS reply_context,
      ${newsDeadline()} AS expires_at,r.seen,r.archived
      FROM team_message_recipients r JOIN team_messages m ON m.id=r.message_id LEFT JOIN team_messages parent ON parent.id=m.reply_to_id
      WHERE r.user_id=$1 AND (r.archived OR ${newsDeadline()}>now())
      ORDER BY m.created_at DESC,m.id DESC`,[req.auth.id])).rows);
  });
  app.get('/api/news/sent',auth,ready,access,async(req,res)=>{
    await purgeNews(db);
    const {rows}=await db.query(`SELECT m.id,m.sender_id,m.sender_name AS sender,m.text,m.priority,m.created_at,m.attachment_name,m.can_archive,m.planning_week,m.is_reply,m.reply_to_id,COALESCE(m.thread_id,m.id) AS thread_id,m.challenge_digest,m.order_digest,${newsDeadline()} AS expires_at,
      COALESCE(jsonb_agg(jsonb_build_object('id',r.user_id,'name',COALESCE(u.name,'Ancien collaborateur'),'seen',r.seen,'seenAt',r.seen_at,'archived',r.archived) ORDER BY u.name) FILTER(WHERE r.user_id IS NOT NULL),'[]'::jsonb) AS recipients
      FROM team_messages m LEFT JOIN team_message_recipients r ON r.message_id=m.id LEFT JOIN users u ON u.id=r.user_id
      WHERE m.sender_id=$1 AND ${newsDeadline()}>now() GROUP BY m.id ORDER BY m.created_at DESC,m.id DESC`,[req.auth.id]);res.json(rows);
  });
  app.get('/api/news/threads/:thread',auth,ready,access,async(req,res)=>{
    const thread=Number(req.params.thread);if(!Number.isSafeInteger(thread)||thread<1)throw fail(400,'Fil de discussion invalide.');
    const rows=(await db.query(`SELECT m.id,m.sender_id,m.sender_name AS sender,m.text,m.priority,m.created_at,m.attachment_name,m.can_archive,m.planning_week,m.is_reply,m.reply_to_id,COALESCE(m.thread_id,m.id) AS thread_id,m.challenge_digest,m.order_digest,${newsDeadline()} AS expires_at,r.seen,r.archived
      FROM team_messages m LEFT JOIN team_message_recipients r ON r.message_id=m.id AND r.user_id=$1
      WHERE COALESCE(m.thread_id,m.id)=$2 AND ((r.user_id=$1 AND (r.archived OR ${newsDeadline()}>now())) OR (m.sender_id=$1 AND ${newsDeadline()}>now()))
      ORDER BY m.created_at DESC,m.id DESC LIMIT 201`,[req.auth.id,thread])).rows;
    if(!rows.length)throw fail(404,'Ce fil ne contient aucun message encore accessible dans votre espace.');
    res.json({messages:rows.slice(0,200).reverse().map(m=>({...m,outgoing:m.sender_id===req.auth.id})),truncated:rows.length>200});
  });
  app.post('/api/news',auth,ready,access,csrf,uploadParser||((req,res,next)=>next()),async(req,res)=>{
    const attachment=validateNewsAttachment(req.body?.attachment,fail);
    const {text,recipients,priority}=validateMessage(req.body,fail);const expiresOn=validateNewsExpiry(req.body.expiresOn,fail);const replyTo=req.body.replyTo??null;if(replyTo!==null&&(!Number.isSafeInteger(replyTo)||replyTo<1))throw fail(400,'Message d’origine invalide.');
    // One atomic statement: every selected recipient must still be active.
    const {rows}=await db.query(`WITH targets AS MATERIALIZED (
      SELECT id FROM users WHERE active=TRUE AND id=ANY($1::int[]) FOR SHARE
    ), parent AS MATERIALIZED (
      SELECT p.id,p.sender_id,COALESCE(p.thread_id,p.id) AS thread_id FROM team_messages p JOIN team_message_recipients pr ON pr.message_id=p.id
      WHERE p.id=$9::int AND pr.user_id=$2 AND (pr.archived OR ${newsDeadline('p')}>now()) AND p.sender_id IS NOT NULL FOR SHARE OF p
    ), message AS (
      INSERT INTO team_messages(sender_id,sender_name,text,priority,attachment_name,attachment_type,attachment_content,reply_to_id,is_reply,expires_on,thread_id)
      SELECT $2,$3,$4,$5,$6,$7,$8,$9::int,$9::int IS NOT NULL,$10::date,(SELECT thread_id FROM parent) WHERE (SELECT COUNT(*) FROM targets)=cardinality($1::int[])
      AND ($9::int IS NULL OR EXISTS(SELECT 1 FROM parent WHERE cardinality($1::int[])=1 AND parent.sender_id=ANY($1::int[]))) RETURNING id
    ), deliveries AS (
      INSERT INTO team_message_recipients(message_id,user_id)
      SELECT message.id,targets.id FROM message CROSS JOIN targets RETURNING message_id
    ) SELECT message.id,(SELECT COUNT(*)::int FROM deliveries) AS sent FROM message`,[recipients,req.auth.id,req.auth.name,text,priority,attachment?.fileName||null,attachment?.fileType||null,attachment?.bytes||null,replyTo,expiresOn]);
    if(!rows[0])throw fail(409,replyTo?'Le message d’origine est indisponible ou son expéditeur n’est plus actif. Actualisez les messages avant de répondre.':'Un destinataire n’est plus actif. Actualisez la liste avant de renvoyer le message.');
    res.status(201).json({ok:true,sent:rows[0].sent});
  });
  app.get('/api/news/:id/attachment',auth,ready,access,async(req,res)=>{
    const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)throw fail(400,'Message invalide.');
    const row=(await db.query(`SELECT m.attachment_name,m.attachment_type,m.attachment_content FROM team_messages m
      WHERE m.id=$1 AND m.attachment_content IS NOT NULL AND (
        (m.sender_id=$2 AND ${newsDeadline()}>now()) OR EXISTS(
          SELECT 1 FROM team_message_recipients r WHERE r.message_id=m.id AND r.user_id=$2
          AND (r.archived OR ${newsDeadline()}>now())))` ,[id,req.auth.id])).rows[0];
    if(!row)throw fail(404,'Pièce jointe indisponible ou message expiré.');
    res.type(row.attachment_type).attachment(row.attachment_name).send(row.attachment_content);
  });
  app.patch('/api/news/:id',auth,ready,access,csrf,async(req,res)=>{
    const id=Number(req.params.id),body=req.body;
    if(!Number.isSafeInteger(id)||id<1||!body||!Object.keys(body).length||Object.keys(body).some(key=>!['seen','archived'].includes(key)||typeof body[key]!=='boolean'))throw fail(400,'Modification du message invalide.');
    const {rows}=await db.query(`UPDATE team_message_recipients r
      SET seen_at=CASE WHEN $3::boolean IS TRUE THEN COALESCE(r.seen_at,now()) WHEN $3::boolean IS FALSE THEN NULL ELSE r.seen_at END,seen=COALESCE($3::boolean,r.seen),archived=COALESCE($4::boolean,r.archived)
      FROM team_messages m WHERE r.message_id=m.id AND r.message_id=$1 AND r.user_id=$2
      AND (r.archived OR ${newsDeadline()}>now())
      AND (m.can_archive OR $4::boolean IS NOT TRUE)
      RETURNING r.seen,r.archived,m.created_at`,[id,req.auth.id,body.seen??null,body.archived??null]);
    if(!rows[0])throw fail(404,body.archived===true?'Ce message ne peut pas être archivé ou n’est plus disponible.':'Ce message est indisponible ou a expiré.');
    await purgeNews(db);
    res.json({ok:true});
  });
}
