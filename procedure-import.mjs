// Import metadata supplied privately through Render, never through public source files.
export function parseProcedureImport(raw) {
  let batch;
  try { batch=JSON.parse(raw); } catch { throw new Error('Import des procédures : JSON invalide.'); }
  if(!batch || typeof batch.batchId!=='string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(batch.batchId) || !Array.isArray(batch.documents) || batch.documents.length<1 || batch.documents.length>200) throw new Error('Import des procédures : lot invalide.');
  const limits={category:100,title:200,description:1500,keywords:500,url:1000};
  const seen=new Set();
  const documents=batch.documents.map(item=>{
    const doc={};
    for(const [key,max] of Object.entries(limits)) {
      const value=item?.[key]??'';
      if(typeof value!=='string'||value.length>max) throw new Error('Import des procédures : champ invalide.');
      doc[key]=value.trim();
    }
    if(!doc.category||!doc.title||!doc.url) throw new Error('Import des procédures : champ obligatoire absent.');
    let url;
    try { url=new URL(doc.url); } catch { throw new Error('Import des procédures : lien invalide.'); }
    if(url.protocol!=='https:'||!['drive.google.com','docs.google.com'].includes(url.hostname)||url.username||url.password) throw new Error('Import des procédures : lien Google Drive requis.');
    const id=url.pathname.match(/\/d\/([\w-]+)/)?.[1];
    if(!id||seen.has(id)) throw new Error('Import des procédures : document invalide ou doublon.');
    seen.add(id);
    return {...doc,driveId:id};
  });
  return {batchId:batch.batchId,documents};
}

export async function importProcedureDocuments(db,raw) {
  if(!raw) return {added:0,skipped:true};
  const batch=parseProcedureImport(raw);
  const client=await db.connect();
  try {
    await client.query('BEGIN');
    // A transaction-scoped lock serializes startup imports from concurrent instances.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('procedure-import'))");
    const key='procedure-import:'+batch.batchId;
    const marker=await client.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING RETURNING key',[key,'pending']);
    if(!marker.rows.length) {
      await client.query('COMMIT');
      return {added:0,skipped:true};
    }
    let added=0;
    for(const doc of batch.documents) {
      // Include inactive documents: a later restart must not undo an administrator's removal.
      const result=await client.query(`INSERT INTO procedure_documents(category,title,description,keywords,url)
        SELECT $1,$2,$3,$4,$5 WHERE NOT EXISTS (
          SELECT 1 FROM procedure_documents WHERE url=$5 OR substring(url from '/d/([A-Za-z0-9_-]+)')=$6
        ) RETURNING id`,[doc.category,doc.title,doc.description,doc.keywords,doc.url,doc.driveId]);
      added+=result.rows.length;
    }
    if(added) await client.query('INSERT INTO publications(universe,title,source_key) VALUES($1,$2,$3) ON CONFLICT(source_key) DO NOTHING',['Procédures',added+' documents importés depuis Google Drive',key]);
    await client.query('UPDATE settings SET value=$2 WHERE key=$1',[key,JSON.stringify({added,total:batch.documents.length})]);
    await client.query('COMMIT');
    return {added,skipped:false};
  } catch(error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
