import { randomBytes, scrypt as rawScrypt, timingSafeEqual, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(rawScrypt);
export const universes = ['Collaborateurs','Emplois du temps','Agenda','Procédures','Laboratoires','Challenges','Actualités','Formations','Contacts utiles','Ressources humaines','Fun','Passerelle groupement','Outils de calculs rapides'];
export function passwordValid(p) { return typeof p === 'string' && p.length >= 12 && Buffer.byteLength(p) <= 256; }
export async function hashPassword(password) {
  const salt=randomBytes(16).toString('hex');
  const key=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:67108864});
  return `${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password,encoded) {
  if(typeof password!=='string'||Buffer.byteLength(password)>256)return false;
  const [salt,hex]=encoded.split(':');
  const actual=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:67108864});
  const expected=Buffer.from(hex,'hex');
  return expected.length===actual.length && timingSafeEqual(actual,expected);
}
export const token = () => randomBytes(32).toString('base64url');
export const digest = value => createHash('sha256').update(value).digest('hex');
export function encrypt(value,secret) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',createHash('sha256').update(secret).digest(),iv);
  const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),data].map(b=>b.toString('base64')).join('.');
}
export function decrypt(value,secret) {
  const [iv,tag,data]=value.split('.').map(v=>Buffer.from(v,'base64'));
  const cipher=createDecipheriv('aes-256-gcm',createHash('sha256').update(secret).digest(),iv);
  cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(data),cipher.final()]).toString('utf8'));
}
export function canAccess(user,universe) {
 if(!user)return false;if(user.role==='admin')return true;
 if(user.permissions_configured)return !!user.rights?.includes(universe);
 return ['Fun','Outils de calculs rapides','Collaborateurs','Actualités'].includes(universe)||!!user.rights?.includes(universe);
}
export function canModify(user,universe) {
 if(!user||!canAccess(user,universe))return false;if(user.role==='admin')return true;
 if(universe==='Collaborateurs')return false;
 return user.permissions_configured?!!user.edit_rights?.includes(universe):universe==='Fun';
}

