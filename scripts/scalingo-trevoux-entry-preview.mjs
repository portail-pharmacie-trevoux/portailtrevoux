// Serve only the staging login alias through the application's existing security
// middleware and homepage. Never rewrite API paths or static asset URLs.
export function registerScalingoTrevouxEntry(gate,app){
 gate.get(['/trevoux','/trevoux/'],(req,res,next)=>{
  const original=req.url,query=original.indexOf('?');
  req.url='/'+(query<0?'':original.slice(query));
  app(req,res,error=>{req.url=original;next(error);});
 });
}
