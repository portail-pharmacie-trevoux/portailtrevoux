#!/usr/bin/env bash
set -euo pipefail
set +x
# No web server, startup migration, mailer or scheduler is launched.
# Secret travels only through the authenticated CLI's interactive stdin.
printf 'URL PostgreSQL EXTERNE Render (saisie masquee, ne pas coller dans ChatGPT) : '
read -r -s PORTAIL_RENDER_READONLY_DATABASE_URL
printf '\n'
export PORTAIL_RENDER_READONLY_DATABASE_URL
trap 'unset PORTAIL_RENDER_READONLY_DATABASE_URL' EXIT
node /tmp/uploads/run.mjs
