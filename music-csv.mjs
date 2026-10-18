export function musicCSV(tracks){
 const cell=value=>'"'+String(value).replace(/"/g,'""')+'"';
 return '\uFEFF'+[['Artist','Title'],...tracks.map(t=>[t.artist,t.title])].map(row=>row.map(cell).join(',')).join('\r\n');
}
export function registerMusicCSV({app,db,auth,ready,admin,csrf,fail}){
 app.post('/api/music/export.csv',auth,ready,admin,csrf,async(req,res)=>{
  const ids=req.body?.ids;if(!Array.isArray(ids)||!ids.length||ids.length>5000||ids.some(id=>!Number.isSafeInteger(id)||id<1))throw fail(400,'Sélectionnez entre 1 et 5 000 titres.');
  const selected=[...new Set(ids)],rows=(await db.query('SELECT id,artist,title FROM music_tracks WHERE id=ANY($1::int[]) ORDER BY lower(artist),lower(title),id',[selected])).rows;
  if(rows.length!==selected.length)throw fail(409,'La sélection a changé. Actualisez les titres avant d’exporter.');
  res.set({'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename=Playlist_PortailPlus_Trevoux.csv','Cache-Control':'no-store'}).send(musicCSV(rows));
 });
}
