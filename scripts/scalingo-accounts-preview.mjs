// Exact account endpoints only. Existing app auth/admin/origin/CSRF remain authoritative.
export function registerScalingoAccountManagement(gate,app){
 gate.post('/api/users',(req,res,next)=>app(req,res,next));
 gate.put('/api/users/:id',(req,res,next)=>/^\/api\/users\/[1-9]\d*$/.test(req.path)?app(req,res,next):next());
 for(const path of ['/api/users/:id/invitation-preview','/api/users/:id/invitation','/api/invitations/check','/api/invitations/accept'])gate.post(path,(req,res,next)=>app(req,res,next));
}
