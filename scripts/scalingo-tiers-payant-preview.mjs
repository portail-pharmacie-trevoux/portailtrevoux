// Scalingo preview only: open the existing import, without changing any rights.
// The universe boundary and app still enforce auth, readiness, CSRF and the
// active Tiers payant referent/administrator check before touching monthly data.
export const isScalingoTiersPayantImport=req=>req.method==='POST'&&req.path==='/api/quality/tiers-payant/import';

export function registerScalingoTiersPayantImport(gate,app){
 // Register before the preview's default-deny filter, but after its universe
 // boundary. Dispatch to the real app, not a bypass of its security/validation.
 gate.post('/api/quality/tiers-payant/import',(req,res,next)=>{
  if(!isScalingoTiersPayantImport(req))return next();
  return app(req,res,next);
 });
}
