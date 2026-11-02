// Preserve the raw upload until the real app has checked auth, rights and CSRF.
export const isScalingoProcedureImport=req=>req.method==='POST'&&req.path==='/api/procedures/import';
export function registerScalingoProcedures(gate,app){
 gate.post('/api/procedures/import',(req,res,next)=>isScalingoProcedureImport(req)?app(req,res,next):next());
 gate.get('/api/procedures/:id/file',(req,res,next)=>/^\/api\/procedures\/[1-9]\d*\/file$/.test(req.path)?app(req,res,next):next());
}
