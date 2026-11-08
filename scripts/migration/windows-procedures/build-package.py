"""Build a PRIVATE Windows package outside Git; never execute an import."""
import argparse, hashlib, importlib.util, io, json, os, tarfile, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('reader',ROOT/'scripts/migration/read-procedure-zip.py')
reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)

def build(archive,output):
    bundle=reader.read_bundle(archive)
    if bundle['archiveSha256']!='6dfe4d44359976eee044b98bbe20929ceee4f0791e41eb7072f2e6af668c1e8a' or len(bundle['documents'])!=55 or sum(d['bytes'] for d in bundle['documents'])!=7930504:
        raise ValueError('UNEXPECTED_ARCHIVE')
    out=Path(output).resolve()
    if out==ROOT or ROOT in out.parents: raise ValueError('PRIVATE_OUTPUT_MUST_BE_OUTSIDE_REPOSITORY')
    out.mkdir(mode=0o700,parents=True,exist_ok=False)
    payload=json.dumps(bundle,ensure_ascii=False,separators=(',',':')).encode()
    entries={'payload.json':payload,'package.json':b'{"type":"module"}\n'}
    for name in ['scripts/migration/procedure-batch.mjs','scripts/migration/windows-procedures/runner.mjs','procedure-file-migration.mjs','procedure-files.mjs','public/procedure-upload-limits.js']:
        entries[name]=(ROOT/name).read_bytes()
    tar=out/'procedures-import.tar.gz'
    with tarfile.open(tar,'w:gz') as archive_out:
        for name,data in entries.items():
            info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o600;info.mtime=0
            archive_out.addfile(info,io.BytesIO(data))
    bootstrap=(Path(__file__).parent/'bootstrap.sh').read_text().replace('PAYLOAD_SHA256',hashlib.sha256(payload).hexdigest())
    (out/'bootstrap.sh').write_text(bootstrap,newline='\n')
    for name in ['Invoke-Procedures.ps1','README.md']:
        (out/name).write_bytes((Path(__file__).parent/name).read_bytes())
    checks={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.iterdir())}
    (out/'checksums.json').write_text(json.dumps(checks,indent=2)+'\n')
    for path in out.iterdir(): os.chmod(path,0o600)
    final=out.with_suffix('.zip')
    with zipfile.ZipFile(final,'x',zipfile.ZIP_DEFLATED) as z:
        for path in sorted(out.iterdir()):z.write(path,path.name)
    os.chmod(final,0o600)
    print(json.dumps({'package':str(final),'sha256':hashlib.sha256(final.read_bytes()).hexdigest(),'documents':55,'verifiedHashes':55,'binaryBytes':7930504}))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('archive');p.add_argument('output');args=p.parse_args()
    build(args.archive,args.output)
