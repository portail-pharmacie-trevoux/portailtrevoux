// Local personal reminders only. The application retains session, Agenda rights,
// Origin, CSRF and cached-event checks. This never dispatches a Google API write.
export function registerScalingoCalendarReminders(gate,app){
 gate.post('/api/calendar/reminders',(req,res,next)=>req.path==='/api/calendar/reminders'?app(req,res,next):next());
}
