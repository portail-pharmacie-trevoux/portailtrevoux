// PREPARED ONLY: not imported by any application entrypoint. No external-service routes.
import {scalingoUniverseBoundary} from './scalingo-universal-rights.mjs';
export const preparedParityRoutes=Object.freeze({
 planning:[['GET','/api/schedule/today'],['GET','/api/schedule-month'],['GET','/api/schedule-month/pdf'],['PUT','/api/schedule-month/accountant'],['POST','/api/schedule/people-order'],['POST','/api/leave-requests'],['POST','/api/leave-requests/:id/review'],['POST','/api/leave-requests/:id/cancel'],['POST','/api/leave-requests/:id/cancel-approved'],['PUT','/api/schedule-posts/:id'],['DELETE','/api/schedule-posts/:id'],['POST','/api/schedule-templates'],['PUT','/api/schedule-templates/:id'],['DELETE','/api/schedule-templates/:id'],['PUT','/api/schedule-templates/:id/day'],['POST','/api/schedule-templates/:id/clear-day'],['POST','/api/schedule/:week/apply-template'],['POST','/api/schedule/:week/copy'],['POST','/api/schedule/:week/day-lock'],['POST','/api/schedule/:week/meal-ticket']],
 orders:[['GET','/api/order-planning/export.xlsx'],['POST','/api/order-planning'],['POST','/api/order-planning/import'],['PUT','/api/order-planning/:id'],['DELETE','/api/order-planning/:id'],['POST','/api/order-planning/:id/confirmation'],['POST','/api/order-planning/:id/delivery'],['POST','/api/order-planning/:id/suspension']],
 communication:[['POST','/api/news'],['GET','/api/news/:id/attachment'],['GET','/api/publications/:name'],['POST','/api/publications/:name/read']],
 documents:[['GET','/api/contacts/export.xlsx'],['GET','/api/laboratories/export.xlsx'],['GET','/api/merchandising/export.xlsx'],['GET','/api/merchandising/documents/:id/file'],['GET','/api/challenges/:id/logo'],['GET','/api/challenges/:id/reports'],['GET','/api/challenges/:id/reports/:reportId/file']],
 portal:[['GET','/api/quick-links'],['PUT','/api/quick-links'],['GET','/api/quality/training'],['GET','/api/collaborateurs/me/payroll']]
});
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function pattern(path){return new RegExp('^'+path.split('/').map(s=>s===':week'?'20\\d{2}-\\d{2}-\\d{2}':s===':name'?'[^/]+':s.startsWith(':')?'[1-9]\\d{0,9}':escape(s)).join('/')+'$');}
const rules=Object.fromEntries(Object.entries(preparedParityRoutes).map(([group,rows])=>[group,rows.map(([method,path])=>({method,path,re:pattern(path)}))]));
export function matchesPreparedParity(req,{enabled=false,groups=[]}={}){
 if(enabled!==true)return false;
 if(!Array.isArray(groups)||groups.some(g=>!Object.hasOwn(rules,g)))throw Error('UNKNOWN_PARITY_GROUP');
 return groups.some(group=>rules[group].some(rule=>rule.method===req.method&&rule.re.test(req.path)));
}
export const deferPreparedParityBody=(req,options)=>req.method==='POST'&&req.path==='/api/news'&&matchesPreparedParity(req,options);
export function registerPreparedLocalParity(gate,app,options={}){
 if(options.enabled!==true)return;
 if(!options.db?.query)throw Error('PARITY_SECURITY_BOUNDARY_REQUIRED');
 matchesPreparedParity({method:'GET',path:'/'},options);
 const boundary=scalingoUniverseBoundary(options.db);
 gate.use((req,res,next)=>{
  if(!matchesPreparedParity(req,options))return next();
  boundary(req,res,error=>error?next(error):app(req,res,next));
 });
}
