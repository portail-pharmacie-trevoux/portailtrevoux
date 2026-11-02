// Only promotion attachments; the app retains session, origin, CSRF and file checks.
// The Scalingo universe boundary must run before dispatch for write permissions.
export const isScalingoPromotionDocumentImport=req=>req.method==='POST'&&/^\/api\/merchandising\/promotions\/[1-9]\d*\/documents$/.test(req.path);
export function registerScalingoPromotionDocuments(gate,app){
 const dispatch=(req,res,next)=>/^\/api\/merchandising\/promotions\/[1-9]\d*\/documents(?:\/[1-9]\d*(?:\/file)?)?$/.test(req.path)?app(req,res,next):next();
 gate.get('/api/merchandising/promotions/:id/documents',dispatch);
 gate.post('/api/merchandising/promotions/:id/documents',dispatch);
 gate.get('/api/merchandising/promotions/:id/documents/:document/file',dispatch);
 gate.delete('/api/merchandising/promotions/:id/documents/:document',dispatch);
}
