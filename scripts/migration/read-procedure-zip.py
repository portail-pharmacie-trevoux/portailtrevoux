"""Validate a private ZIP without extracting paths or executing its contents."""
import base64,hashlib,json,stat,sys,zipfile
from pathlib import PurePosixPath

def read_bundle(path):
    raw=open(path,'rb').read()
    if len(raw)>64*1024*1024: raise ValueError('ARCHIVE_TOO_LARGE')
    with zipfile.ZipFile(path) as archive:
        infos=archive.infolist();names=[i.filename for i in infos]
        if len(names)!=len(set(names)) or len(infos)>201 or sum(i.file_size for i in infos)>64*1024*1024: raise ValueError('ARCHIVE_LIMIT_OR_DUPLICATE')
        for item in infos:
            p=PurePosixPath(item.filename)
            if p.is_absolute() or '..' in p.parts or '\\' in item.filename or item.flag_bits&1 or stat.S_ISLNK(item.external_attr>>16): raise ValueError('UNSAFE_ARCHIVE_ENTRY')
        manifest=json.loads(archive.read('manifest.json'))
        if set(manifest)!={'status','documents'} or manifest['status']!='complete' or not isinstance(manifest['documents'],list) or not 1<=len(manifest['documents'])<=200: raise ValueError('INVALID_MANIFEST')
        expected={'active','builtin_key','category','created_at','description','file_name','file_type','id','keywords','source_imported_at','source_url','title','url','archive_path','bytes','sha256'}
        documents=[];ids=set();paths=set()
        for row in manifest['documents']:
            if set(row)!=expected or type(row['id']) is not int or not 1<=row['id']<=2147483647 or row['id'] in ids or type(row['active']) is not bool: raise ValueError('INVALID_DOCUMENT')
            if row['archive_path'] in paths or row['archive_path']=='manifest.json' or row['archive_path'] not in names: raise ValueError('INVALID_DOCUMENT_PATH')
            size=archive.getinfo(row['archive_path']).file_size
            if size!=row['bytes'] or not 0<size<=15*1024*1024: raise ValueError('INVALID_DOCUMENT_SIZE')
            data=archive.read(row['archive_path'])
            if hashlib.sha256(data).hexdigest()!=row['sha256']: raise ValueError('DOCUMENT_HASH_MISMATCH')
            ids.add(row['id']);paths.add(row['archive_path']);documents.append({**row,'file_base64':base64.b64encode(data).decode('ascii')})
        if set(names)!={'manifest.json'}|paths: raise ValueError('UNEXPECTED_ARCHIVE_FILE')
        return {'archiveSha256':hashlib.sha256(raw).hexdigest(),'documents':documents}

if __name__=='__main__':
    try:
        b=read_bundle(sys.argv[1]);print(json.dumps({'archiveSha256':b['archiveSha256'],'documents':len(b['documents']),'verifiedHashes':len(b['documents']),'binaryBytes':sum(d['bytes'] for d in b['documents']),'inactiveIds':[d['id'] for d in b['documents'] if not d['active']]}))
    except Exception:
        print(json.dumps({'status':'blocked','code':'PROCEDURE_ARCHIVE_INVALID'}),file=sys.stderr);sys.exit(1)
