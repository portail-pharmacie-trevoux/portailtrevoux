// Scalingo-only apex redirect. Do not derive destinations from proxy headers.
export const scalingoWwwOrigin='https://www.portailplus-officine.fr';
export function registerScalingoWwwRedirect(gate){
 gate.use((req,res,next)=>{
  if(!/^portailplus-officine\.fr(?::(?:80|443))?$/i.test(req.headers.host||''))return next();
  // Preserve the raw path/query, including encoded characters. The fixed origin
  // prevents protocol-relative URLs or a forged Host from becoming open redirects.
  if(!req.originalUrl.startsWith('/')||/[\r\n]/.test(req.originalUrl))return res.status(400).send('Adresse invalide.');
  res.set({'Cache-Control':'no-store','Strict-Transport-Security':'max-age=31536000','Referrer-Policy':'same-origin','X-Content-Type-Options':'nosniff'});
  return res.redirect(308,scalingoWwwOrigin+req.originalUrl);
 });
}
