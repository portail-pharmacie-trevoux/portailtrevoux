// One exact write exception; application admin/edit, origin, CSRF and revision
// checks remain active. Publication only creates internal Portail+ notifications.
export function registerScalingoSchedulePublication(gate,app){
 gate.post('/api/schedule/:week/publish',(req,res,next)=>{
  if(!/^\/api\/schedule\/20\d{2}-\d{2}-\d{2}\/publish$/.test(req.path))return next();
  res.once('finish',()=>console.log('SCALINGO_SCHEDULE_PUBLICATION_HTTP '+JSON.stringify({method:req.method,path:req.path,status:res.statusCode})));
  return app(req,res,next);
 });
}
