import { createHash } from 'node:crypto';
export function musicText(value){return typeof value==='string'?value.trim().replace(/\s+/g,' '):'';}
export function musicKey(artist,title){
  const normalized=[artist,title].map(v=>musicText(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr')).join('\n');
  return createHash('sha256').update(normalized).digest('hex');
}
export function validateMusic(data){
  const artist=musicText(data?.artist),title=musicText(data?.title);
  if(!artist||!title||artist.length>200||title.length>200)throw Object.assign(new Error('Indiquez un artiste et un titre (200 caractères maximum chacun).'),{status:400});
  return {artist,title,trackKey:musicKey(artist,title)};
}
