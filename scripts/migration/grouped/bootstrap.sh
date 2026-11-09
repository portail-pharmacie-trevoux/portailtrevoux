#!/usr/bin/env bash
set -euo pipefail
set +x
# Establish no-echo BEFORE acknowledging readiness, including when CLI stdin is a pipe.
if [ -t 0 ]; then stty -echo || exit 1; fi
printf 'PORTAIL_SECRET_READY_V2\n'
# URL is read from one framed stdin line. No secret env variable, argument or file.
exec node /tmp/uploads/run.mjs
