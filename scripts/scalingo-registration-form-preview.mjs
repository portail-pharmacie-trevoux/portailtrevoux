import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
// Existing Render template, kept byte-for-byte. A missing/changed asset must be
// detected before the Scalingo deployment becomes ready, not on first download.
export const registrationFormSHA256='861595388186151d50d2c27011829402d55ea5ae03341995840a3c8482fb71a9';
export async function verifyScalingoRegistrationFormAsset(){
 const bytes=await readFile(new URL('../assets/fiche-inscription-salarie.pdf',import.meta.url));
 const sha256=createHash('sha256').update(bytes).digest('hex');
 if(sha256!==registrationFormSHA256)throw Error('Employee registration PDF missing or changed');
 return {bytes:bytes.length,sha256};
}
export function registerScalingoRegistrationForm(gate,app){
 gate.get('/api/collaborateurs/registration-form',(req,res,next)=>{
  if(req.method!=='GET'||req.path!=='/api/collaborateurs/registration-form')return next();
  // The existing app still enforces authentication, readiness and admin role,
  // reads the original asset, and sets the PDF attachment filename and MIME.
  return app(req,res,next);
 });
}
