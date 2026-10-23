#!/usr/bin/env python3
"""Encrypted PostgreSQL backup and isolated restore. Never runs against production by default for restore."""
import argparse
import datetime as dt
import hashlib
import json
import os
import pathlib
import secrets
import subprocess
import tempfile
import sys
import boto3
from botocore.config import Config
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

MAGIC = b"PORTAILBACKUP1"
CHUNK = 1024 * 1024

def required(name):
    value = os.environ.get(name)
    if not value:
        raise RuntimeError("Missing environment variable: " + name)
    return value

def key():
    import base64
    raw = base64.b64decode(required("BACKUP_ENCRYPTION_KEY_B64"), validate=True)
    if len(raw) != 32:
        raise RuntimeError("Encryption key must be exactly 32 bytes")
    return raw

def s3():
    return boto3.client("s3", endpoint_url=required("S3_ENDPOINT_URL"),
        region_name=required("S3_REGION"), aws_access_key_id=required("S3_ACCESS_KEY_ID"),
        aws_secret_access_key=required("S3_SECRET_ACCESS_KEY"),
        config=Config(signature_version="s3v4"))

def encrypt_file(source, dest, secret_key):
    nonce = secrets.token_bytes(12)
    encryptor = Cipher(algorithms.AES(secret_key), modes.GCM(nonce)).encryptor()
    with open(source, "rb") as inp, open(dest, "wb") as out:
        out.write(MAGIC + nonce)
        while chunk := inp.read(CHUNK):
            out.write(encryptor.update(chunk))
        out.write(encryptor.finalize())
        out.write(encryptor.tag)

def decrypt_file(source, dest, secret_key):
    size = pathlib.Path(source).stat().st_size
    header = len(MAGIC) + 12
    if size < header + 16:
        raise RuntimeError("Invalid encrypted backup")
    with open(source, "rb") as inp:
        if inp.read(len(MAGIC)) != MAGIC:
            raise RuntimeError("Invalid backup header")
        nonce = inp.read(12)
        inp.seek(-16, os.SEEK_END)
        tag = inp.read(16)
        decryptor = Cipher(algorithms.AES(secret_key), modes.GCM(nonce, tag)).decryptor()
        inp.seek(header)
        remaining = size - header - 16
        with open(dest, "wb") as out:
            while remaining:
                chunk = inp.read(min(CHUNK, remaining))
                if not chunk:
                    raise RuntimeError("Truncated backup")
                out.write(decryptor.update(chunk))
                remaining -= len(chunk)
            out.write(decryptor.finalize())

def digest_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(CHUNK):
            h.update(chunk)
    return h.hexdigest()

def backup():
    source = required("BACKUP_DATABASE_URL")
    bucket = required("S3_BUCKET")
    prefix = os.environ.get("S3_PREFIX", "portailtrevoux/daily").strip("/")
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    object_key = f"{prefix}/{stamp}-{secrets.token_hex(4)}.dump.aesgcm"
    with tempfile.TemporaryDirectory() as folder:
        dump = pathlib.Path(folder) / "database.dump"
        encrypted = pathlib.Path(folder) / "database.dump.aesgcm"
        with open(dump, "wb") as out:
            subprocess.run(["pg_dump", "--format=custom", "--no-owner", "--no-acl",
                            "--dbname", source], stdout=out, check=True, timeout=1800)
        subprocess.run(["pg_restore", "--list", str(dump)], check=True,
                       stdout=subprocess.DEVNULL, timeout=60)
        encrypt_file(dump, encrypted, key())
        checksum = digest_file(encrypted)
        client = s3()
        client.upload_file(str(encrypted), bucket, object_key,
                           ExtraArgs={"Metadata": {"sha256": checksum}})
        head = client.head_object(Bucket=bucket, Key=object_key)
        if head.get("Metadata", {}).get("sha256") != checksum or head["ContentLength"] != encrypted.stat().st_size:
            raise RuntimeError("Remote upload verification failed")
        print(json.dumps({"status": "ok", "object": object_key,
                          "encrypted_bytes": encrypted.stat().st_size,
                          "sha256": checksum, "utc": stamp}))
    # Retention is configured as an S3 bucket lifecycle rule, not via this script.

def restore(object_key):
    if os.environ.get("ALLOW_ISOLATED_RESTORE") != "YES":
        raise RuntimeError("Set ALLOW_ISOLATED_RESTORE=YES for a disposable isolated database")
    target = required("RESTORE_DATABASE_URL")
    if target == os.environ.get("BACKUP_DATABASE_URL"):
        raise RuntimeError("Restore target must differ from source")
    if os.environ.get("RESTORE_TARGET_CONFIRMATION") != "DISPOSABLE_TEST_DATABASE":
        raise RuntimeError("Explicit disposable target confirmation required")
    bucket = required("S3_BUCKET")
    client = s3()
    with tempfile.TemporaryDirectory() as folder:
        encrypted = pathlib.Path(folder) / "encrypted"
        dump = pathlib.Path(folder) / "database.dump"
        client.download_file(bucket, object_key, str(encrypted))
        expected = client.head_object(Bucket=bucket, Key=object_key).get("Metadata", {}).get("sha256")
        if not expected or digest_file(encrypted) != expected:
            raise RuntimeError("Encrypted backup checksum mismatch")
        decrypt_file(encrypted, dump, key())
        subprocess.run(["pg_restore", "--list", str(dump)], check=True,
                       stdout=subprocess.DEVNULL, timeout=60)
        # The caller MUST provision an empty isolated DB and disable outbound integrations.
        subprocess.run(["pg_restore", "--exit-on-error", "--no-owner", "--no-acl",
                        "--dbname", target, str(dump)], check=True, timeout=1800)
        print(json.dumps({"status": "restored", "object": object_key}))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["backup", "restore"])
    parser.add_argument("--object-key", default="")
    args = parser.parse_args()
    try:
        if args.command == "backup":
            backup()
        elif args.object_key:
            restore(args.object_key)
        else:
            raise RuntimeError("--object-key required for restore")
    except Exception as exc:
        print("Backup operation failed: " + type(exc).__name__ + ": " + str(exc).split("?")[0], file=sys.stderr)
        sys.exit(1)
