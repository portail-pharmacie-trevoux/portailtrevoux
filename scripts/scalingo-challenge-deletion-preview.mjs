// Opt-in from the Scalingo preview only; production never registers this route.
export function registerScalingoChallengeDeletion({app,db,auth,ready,csrf,viewUniverse,fail}){
 app.delete('/api/challenges/:id',auth,ready,viewUniverse('Challenges'),(req,res,next)=>req.auth.role==='admin'?next():next(fail(403,'Suppression réservée aux administrateurs.')),csrf,async(req,res)=>{
  if(!/^[1-9]\d*$/.test(req.params.id)||!Number.isSafeInteger(Number(req.params.id)))throw fail(400,'Challenge invalide.');
  const revision=req.body?.revision;
  if(!Number.isSafeInteger(revision)||revision<1)throw fail(400,'Version invalide.');
  // A single atomic delete: own reports and monthly reminders follow their FK
  // ON DELETE CASCADE. Laboratories, users and other challenges are untouched.
  const row=(await db.query('DELETE FROM team_challenges WHERE id=$1 AND revision=$2 RETURNING id',[Number(req.params.id),revision])).rows[0];
  if(!row){
   if((await db.query('SELECT id FROM team_challenges WHERE id=$1',[Number(req.params.id)])).rows[0])throw fail(409,'Le challenge a changé. Actualisez-le avant de supprimer.');
   throw fail(404,'Challenge introuvable.');
  }
  res.json({ok:true,id:row.id});
 });
}
export function registerScalingoChallengeDeletionGateway(gate,app){
 gate.delete('/api/challenges/:id',(req,res,next)=>/^\/api\/challenges\/[1-9]\d*$/.test(req.path)?app(req,res,next):next());
}
