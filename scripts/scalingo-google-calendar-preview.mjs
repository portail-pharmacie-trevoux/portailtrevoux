// Calendar-only opt-in for the isolated Scalingo preview. Never load Render tokens.
export function scalingoGoogleCalendarConfig(env){
 const enabled=env.SCALINGO_ENABLE_GOOGLE_CALENDAR==='true';
 const keys=['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_ACCOUNT_EMAIL'];
 if(!enabled&&keys.some(key=>env[key]))throw Error('Google Calendar credentials require explicit Scalingo opt-in');
 if(enabled&&keys.some(key=>typeof env[key]!=='string'||!env[key].trim()))throw Error('Scalingo Google Calendar configuration incomplete');
 return {enabled,googleId:enabled?env.GOOGLE_CLIENT_ID:'',googleSecret:enabled?env.GOOGLE_CLIENT_SECRET:'',googleEmail:enabled?env.GOOGLE_ACCOUNT_EMAIL:''};
}
export function registerScalingoGoogleCalendar(gate,app,{enabled}){
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
