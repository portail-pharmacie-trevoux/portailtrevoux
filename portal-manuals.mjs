import {readFile} from 'node:fs/promises';
export async function importPortalManuals(db){
 for(const [key,title,file] of [
  ['portailplus-v1-utilisateur','Manuel de l’utilisateur Portail+','manuel-utilisateur-portailplus-v1.1.pdf'],
  ['portailplus-v1-administrateur','Manuel de l’administrateur Portail+','manuel-administrateur-portailplus-v1.1.pdf']
 ]){
  const bytes=await readFile(new URL('./assets/'+file,import.meta.url));
  await db.query(`WITH next_id AS (SELECT nextval(pg_get_serial_sequence('procedure_documents','id')) AS id),added AS (
   INSERT INTO procedure_documents(id,category,title,description,keywords,url,file_name,file_type,file_content,builtin_key)
   SELECT id,'Logiciels et matériel',$1,'Guide pratique Portail+ version 1.1 - démarche qualité et fonctions disponibles au 18 octobre 2026.','portail logiciel manuel guide utilisateur administrateur version 1.1 qualité erreurs appels températures référents tiers payant','/api/procedures/'||id||'/file',$2,'application/pdf',$3,$4 FROM next_id
   ON CONFLICT(builtin_key) DO UPDATE SET category=EXCLUDED.category,title=EXCLUDED.title,
    description=EXCLUDED.description,keywords=EXCLUDED.keywords,file_name=EXCLUDED.file_name,file_type=EXCLUDED.file_type,file_content=EXCLUDED.file_content,active=TRUE
   WHERE procedure_documents.file_content IS DISTINCT FROM EXCLUDED.file_content OR procedure_documents.description IS DISTINCT FROM EXCLUDED.description OR procedure_documents.active=FALSE RETURNING title
  ) INSERT INTO publications(universe,title) SELECT 'Procédures','Manuel disponible ou mis à jour : '||title FROM added`,[title,file,bytes,key]);
 }
}
