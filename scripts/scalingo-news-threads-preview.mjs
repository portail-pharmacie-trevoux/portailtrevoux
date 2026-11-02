// Read-only exception: session, readiness and per-message ACL remain in news.mjs.
export function registerScalingoNewsThreads(gate,app){
 gate.get('/api/news/threads/:thread',(req,res,next)=>/^\/api\/news\/threads\/[1-9]\d*$/.test(req.path)?app(req,res,next):next());
}
