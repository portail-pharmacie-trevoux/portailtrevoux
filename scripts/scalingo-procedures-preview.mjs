// Preserve the raw upload until the real app has checked auth, rights and CSRF.
export const isScalingoProcedureImport=req=>req.method==='POST'&&req.path==='/api/procedures/import';
export function registerScalingoProcedures(gate,app){
 gate.post('/api/procedures/import',(req,res,next)=>isScalingoProcedureImport(req)?app(req,res,next):next());
 // Exact document operations only; role, universe rights, origin and CSRF are
 // checked again by the real app. Keep the existing reversible removal/undo.
 const manage=(req,res,next)=>/^\/api\/procedures\/[1-9]\d*(?:\/restore)?$/.test(req.path)?app(req,res,next):next();
 gate.put('/api/procedures/:id',manage);
 gate.delete('/api/procedures/:id',manage);
 gate.post('/api/procedures/:id/restore',manage);
 gate.get('/api/procedures/:id/file',(req,res,next)=>/^\/api\/procedures\/[1-9]\d*\/file$/.test(req.path)?app(req,res,next):next());
}
