// One exact write exception; application admin/edit, origin, CSRF and revision
// checks remain active. Publication only creates internal Portail+ notifications.
export function registerScalingoSchedulePublication(gate,app){
 gate.post('/api/schedule/:week/publish',(req,res,next)=>/^\/api\/schedule\/20\d{2}-\d{2}-\d{2}\/publish$/.test(req.path)?app(req,res,next):next());
}
