// Calendar-only opt-in for the isolated Scalingo preview. Never load Render tokens.
export function scalingoGoogleCalendarConfig(env){
 const enabled=env.SCALINGO_ENABLE_GOOGLE_CALENDAR==='true';
 const keys=['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_ACCOUNT_EMAIL'];
 if(!enabled&&keys.some(key=>env[key]))throw Error('Google Calendar credentials require explicit Scalingo opt-in');
 if(enabled&&keys.some(key=>typeof env[key]!=='string'||!env[key].trim()))throw Error('Scalingo Google Calendar configuration incomplete');
 return {enabled,googleId:enabled?env.GOOGLE_CLIENT_ID:'',googleSecret:enabled?env.GOOGLE_CLIENT_SECRET:'',googleEmail:enabled?env.GOOGLE_ACCOUNT_EMAIL:''};
}
export function registerScalingoGoogleCalendar(gate,app,{enabled}){
 // Decorate only the authenticated application response; never expose credentials.
 gate.get('/api/google/status',(req,res,next)=>{
  const json=res.json;
  res.json=function(data){return json.call(this,typeof data?.configured==='boolean'?{...data,environment:'scalingo',calendarEnabled:enabled,configurationMessage:enabled?'Configuration Google Calendar chargée sur Scalingo.':'Activez Google Calendar et renseignez ses identifiants dans les variables Scalingo, puis redémarrez les conteneurs web.'}:data);};
  app(req,res,next);
 });
 // The shared callback also serves Gmail and YouTube in production: keep these closed.
 gate.use('/auth/google/callback',(req,res,next)=>{
  const state=req.query.state;
  if(!enabled||typeof state==='string'&&/^(mail_|youtube_)/.test(state))return res.status(403).json({error:'Connexion externe désactivée dans la prévisualisation.'});
  next();
 });
 const dispatch=(req,res,next)=>enabled?app(req,res,next):res.status(403).json({error:'Google Calendar désactivé dans la prévisualisation.'});
 gate.get('/api/google/calendars',dispatch);
 for(const path of ['connect','calendar','sync','disconnect'])gate.post('/api/google/'+path,dispatch);
}
