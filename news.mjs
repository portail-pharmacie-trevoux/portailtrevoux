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
    WHERE r.message_id=m.id AND NOT r.archived AND m.created_at<=now()-interval '30 days'`);
  await db.query(`DELETE FROM team_messages m WHERE m.created_at<=now()-interval '30 days'
    AND NOT EXISTS(SELECT 1 FROM team_message_recipients r WHERE r.message_id=m.id)`);
}
export async function unreadNews(db,userId){
  return (await db.query(`SELECT COUNT(*)::int AS unread FROM team_message_recipients r
    JOIN team_messages m ON m.id=r.message_id WHERE r.user_id=$1 AND NOT r.seen
    AND (r.archived OR m.created_at>now()-interval '30 days')`,[userId])).rows[0]?.unread||0;
}
export function registerNews({app,db,auth,ready,csrf,viewUniverse,fail}){
  const access=viewUniverse('Actualités');
  app.get('/api/news/recipients',auth,ready,access,async(req,res)=>{
    res.json((await db.query('SELECT id,name FROM users WHERE active=TRUE ORDER BY last_name,first_name,id')).rows);
  });
  app.get('/api/news',auth,ready,access,async(req,res)=>{
    await purgeNews(db);
    res.json((await db.query(`SELECT m.id,m.sender_name AS sender,m.text,m.priority,m.created_at,
      m.created_at+interval '30 days' AS expires_at,r.seen,r.archived
      FROM team_message_recipients r JOIN team_messages m ON m.id=r.message_id
      WHERE r.user_id=$1 AND (r.archived OR m.created_at>now()-interval '30 days')
      ORDER BY m.created_at DESC,m.id DESC`,[req.auth.id])).rows);
  });
  app.get('/api/news/sent',auth,ready,access,async(req,res)=>{
    await purgeNews(db);
    const {rows}=await db.query(`SELECT m.id,m.text,m.priority,m.created_at,
      COALESCE(jsonb_agg(jsonb_build_object('id',r.user_id,'name',COALESCE(u.name,'Ancien collaborateur'),'seen',r.seen,'seenAt',r.seen_at,'archived',r.archived) ORDER BY u.name) FILTER(WHERE r.user_id IS NOT NULL),'[]'::jsonb) AS recipients
      FROM team_messages m LEFT JOIN team_message_recipients r ON r.message_id=m.id LEFT JOIN users u ON u.id=r.user_id
      WHERE m.sender_id=$1 AND m.created_at>now()-interval '30 days' GROUP BY m.id ORDER BY m.created_at DESC,m.id DESC`,[req.auth.id]);res.json(rows);
  });
  app.post('/api/news',auth,ready,access,csrf,async(req,res)=>{
    const {text,recipients,priority}=validateMessage(req.body,fail);
    // One atomic statement: every selected recipient must still be active.
    const {rows}=await db.query(`WITH targets AS MATERIALIZED (
      SELECT id FROM users WHERE active=TRUE AND id=ANY($1::int[]) FOR SHARE
    ), message AS (
      INSERT INTO team_messages(sender_id,sender_name,text,priority)
      SELECT $2,$3,$4,$5 WHERE (SELECT COUNT(*) FROM targets)=cardinality($1::int[]) RETURNING id
    ), deliveries AS (
      INSERT INTO team_message_recipients(message_id,user_id)
      SELECT message.id,targets.id FROM message CROSS JOIN targets RETURNING message_id
    ) SELECT message.id,(SELECT COUNT(*)::int FROM deliveries) AS sent FROM message`,[recipients,req.auth.id,req.auth.name,text,priority]);
    if(!rows[0])throw fail(409,'Un destinataire n’est plus actif. Actualisez la liste avant de renvoyer le message.');
    res.status(201).json({ok:true,sent:rows[0].sent});
  });
  app.patch('/api/news/:id',auth,ready,access,csrf,async(req,res)=>{
    const id=Number(req.params.id),body=req.body;
    if(!Number.isSafeInteger(id)||id<1||!body||!Object.keys(body).length||Object.keys(body).some(key=>!['seen','archived'].includes(key)||typeof body[key]!=='boolean'))throw fail(400,'Modification du message invalide.');
    const {rows}=await db.query(`UPDATE team_message_recipients r
      SET seen_at=CASE WHEN $3::boolean IS TRUE THEN COALESCE(r.seen_at,now()) WHEN $3::boolean IS FALSE THEN NULL ELSE r.seen_at END,seen=COALESCE($3::boolean,r.seen),archived=COALESCE($4::boolean,r.archived)
      FROM team_messages m WHERE r.message_id=m.id AND r.message_id=$1 AND r.user_id=$2
      AND (r.archived OR m.created_at>now()-interval '30 days')
      RETURNING r.seen,r.archived,m.created_at`,[id,req.auth.id,body.seen??null,body.archived??null]);
    if(!rows[0])throw fail(404,'Ce message est indisponible ou a expiré.');
    await purgeNews(db);
    res.json({ok:true});
  });
}
