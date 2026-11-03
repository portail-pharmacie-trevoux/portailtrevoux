// Keep bounded import JSON parsing after the real app's auth, admin and CSRF.
export const isScalingoMusicImport=req=>req.method==='POST'&&req.path==='/api/music/import';
export function registerScalingoMusic(gate,app){
 const dispatch=(req,res,next)=>app(req,res,next);
 gate.post('/api/music/import',dispatch);
 gate.post('/api/music/export.csv',dispatch);
 gate.post('/api/music/delete-selected',dispatch);
 gate.delete('/api/music/:id',(req,res,next)=>/^\/api\/music\/[1-9]\d*$/.test(req.path)?dispatch(req,res,next):next());
}
