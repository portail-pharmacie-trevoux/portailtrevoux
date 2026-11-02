// Document management only. Signature sends, refreshes and YouTrust settings
// stay behind the preview default-deny filter. All allowed requests use the
// real app's authentication, role/universe checks, origin, CSRF and owner ACL.
export const isScalingoHRImport=req=>req.method==='POST'&&req.path==='/api/hr/documents/import';
export function registerScalingoHRDocuments(gate,app){
 const dispatch=(req,res,next)=>app(req,res,next);
 gate.get('/api/hr/signatories',dispatch);
 gate.get('/api/hr/documents',dispatch);
 gate.get('/api/hr/signatures',dispatch); // Existing read-only history, needed on page load.
 gate.post('/api/hr/documents/import',(req,res,next)=>isScalingoHRImport(req)?dispatch(req,res,next):next());
 const document=(req,res,next)=>/^\/api\/hr\/documents\/[1-9]\d*(?:\/file)?$/.test(req.path)?dispatch(req,res,next):next();
 gate.get('/api/hr/documents/:id/file',document);
 gate.patch('/api/hr/documents/:id',document);
 gate.delete('/api/hr/documents/:id',document);
}
