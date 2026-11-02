// Preserve the raw file body until app authentication, origin and CSRF checks.
export const isScalingoLaboratoryUpload=req=>req.method==='POST'&&/^\/api\/laboratories\/[1-9]\d*\/(?:logo|documents)$/.test(req.path);
export function registerScalingoLaboratories(gate,app){
 const dispatch=(req,res,next)=>/^\/api\/laboratories\/[1-9]\d*\/(?:logo|email|documents(?:\/[1-9]\d*(?:\/file)?)?)$/.test(req.path)?app(req,res,next):next();
 // Mounted after scalingoUniverseBoundary: every write requires edit rights.
 gate.get('/api/laboratories/:id/logo',dispatch);
 gate.post('/api/laboratories/:id/logo',dispatch);
 gate.delete('/api/laboratories/:id/logo',dispatch);
 gate.get('/api/laboratories/:id/documents',dispatch);
 gate.post('/api/laboratories/:id/documents',dispatch);
 gate.get('/api/laboratories/:id/documents/:documentId/file',dispatch);
 gate.delete('/api/laboratories/:id/documents/:documentId',dispatch);
 gate.post('/api/laboratories/:id/email',dispatch);
}
