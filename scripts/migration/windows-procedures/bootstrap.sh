#!/usr/bin/env bash
set -eu
umask 077
mode="${1:-audit}"
case "$mode" in audit|apply|verify) ;; *) exit 2 ;; esac
work="$(mktemp -d /tmp/portail-procedures-XXXXXXXX)"
trap 'rm -rf -- "$work"' EXIT
# The PowerShell wrapper checks this package's SHA-256 before upload.
tar -xzf /tmp/uploads/procedures-import.tar.gz -C "$work"
# Keep the deployed working directory so runner can resolve its existing pg package.
node "$work/scripts/migration/windows-procedures/runner.mjs" "$mode" PAYLOAD_SHA256
