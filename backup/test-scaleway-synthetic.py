#!/usr/bin/env python3
"""Synthetic encrypted S3 round-trip; never reads production DB or deletes locked objects."""
import hashlib, json, os, pathlib, secrets, tempfile, datetime
import boto3
from botocore.config import Config
from backup import encrypt_file, decrypt_file, digest_file

names=("S3_ACCESS_KEY_ID","S3_SECRET_ACCESS_KEY","S3_ENDPOINT_URL","S3_REGION","S3_BUCKET")
missing=[n for n in names if not os.environ.get(n)]
if missing: raise SystemExit("Missing required Render environment variables: "+", ".join(missing))
if os.environ["S3_BUCKET"] != "portailplus-trevoux":
    raise SystemExit("Safety stop: unexpected bucket")
client=boto3.client("s3",endpoint_url=os.environ["S3_ENDPOINT_URL"],region_name=os.environ["S3_REGION"],
  aws_access_key_id=os.environ["S3_ACCESS_KEY_ID"],aws_secret_access_key=os.environ["S3_SECRET_ACCESS_KEY"],
  config=Config(signature_version="s3v4"))
with tempfile.TemporaryDirectory() as folder:
    p=pathlib.Path(folder)
    sample=p/"fictitious.json"
    sample.write_text(json.dumps({"type":"SYNTHETIC_TEST_ONLY","records":[{"id":1,"name":"Example"}],"token":secrets.token_hex(24)}))
    key=secrets.token_bytes(32)
    encrypt_file(sample,p/"upload.enc",key)
    object_key="tests/synthetic/"+datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")+"-"+secrets.token_hex(8)+".aesgcm"
    sha=digest_file(p/"upload.enc")
    client.upload_file(str(p/"upload.enc"),os.environ["S3_BUCKET"],object_key,ExtraArgs={"Metadata":{"sha256":sha}})
    head=client.head_object(Bucket=os.environ["S3_BUCKET"],Key=object_key)
    assert head["ContentLength"]==(p/"upload.enc").stat().st_size
    assert head.get("Metadata",{}).get("sha256")==sha
    client.download_file(os.environ["S3_BUCKET"],object_key,str(p/"download.enc"))
    assert digest_file(p/"download.enc")==sha
    decrypt_file(p/"download.enc",p/"restored.json",key)
    assert sample.read_bytes()==(p/"restored.json").read_bytes()
    print(json.dumps({"result":"PASS","test":"synthetic encrypted S3 upload/download/verification","object":object_key,"production_data_used":False}))
# No delete: the test object is subject to bucket retention and Object Lock.
