// Only the existing personal Ente Auth flow and guarded order reads.
// All authorization, CSRF, password, TOTP, throttling and expiry checks run in app.
export function registerScalingoOrderMFA(gate,app){
 const dispatch=(req,res,next)=>app(req,res,next);
 for(const path of ['/api/order-mfa/status','/api/order-planning','/api/order-planning/options'])gate.get(path,(req,res,next)=>req.path===path?dispatch(req,res,next):next());
 for(const name of ['setup','confirm','unlock','touch','lock']){
  const path='/api/order-mfa/'+name;
  gate.post(path,(req,res,next)=>req.path===path?dispatch(req,res,next):next());
 }
}
