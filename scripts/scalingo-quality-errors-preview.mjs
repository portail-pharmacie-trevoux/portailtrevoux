// Loaded only by the opt-in Scalingo preview. This opens routes, never rights.
// Authentication, universe permissions, CSRF, roles and revisions remain enforced
// by scalingoUniverseBoundary and the existing application routes.
export function isScalingoQualityErrorRoute({method,path}){
 if(method==='GET')return ['/api/quality/errors','/api/quality/errors/export.xlsx','/api/quality/prescriber-calls'].includes(path);
 if(method==='POST')return ['/api/quality/errors','/api/quality/prescriber-calls'].includes(path);
 if(method==='PUT')return /^\/api\/quality\/errors\/[1-9]\d*(?:\/(?:status|notification|correction-note))?$/.test(path)||/^\/api\/quality\/prescriber-calls\/[1-9]\d*$/.test(path);
 return method==='DELETE'&&/^\/api\/quality\/errors\/[1-9]\d*$/.test(path);
}
