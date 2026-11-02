// Reference and training documents share this exact import. Leave the raw body
// for the real app's session, readiness, rights, origin and CSRF checks first.
export const isScalingoTrainingImport=req=>req.method==='POST'&&req.path==='/api/training/documents/import';
export function registerScalingoTrainingDocuments(gate,app){
 const dispatch=(req,res,next)=>app(req,res,next);
 gate.get('/api/training/documents',dispatch);
 gate.post('/api/training/documents/import',(req,res,next)=>isScalingoTrainingImport(req)?dispatch(req,res,next):next());
 const document=(req,res,next)=>/^\/api\/training\/documents\/[1-9]\d*(?:\/(?:file|print))?$/.test(req.path)?dispatch(req,res,next):next();
 gate.get('/api/training/documents/:id/file',document);
 gate.get('/api/training/documents/:id/print',document);
 gate.put('/api/training/documents/:id',document);
 gate.delete('/api/training/documents/:id',document);
}
