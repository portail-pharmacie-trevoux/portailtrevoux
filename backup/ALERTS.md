# Portail+ synthetic backup alerts

Recipient: pharmaciedetrevoux@gmail.com

Proposed sender: a dedicated Gmail account (for example,
alertes.portailplus@gmail.com, subject to availability and account creation).
No custom domain purchase is required.

Delivery option: Gmail SMTP with an app password if Google permits this for
the account. Store SMTP_USERNAME and SMTP_APP_PASSWORD only as secret Render
environment variables; never commit credentials.

The synthetic freshness monitor emits BACKUP_ALERT on missing, stale
(older than 26 hours), or technical failure. It does not send mail yet.
A scheduled checker and a tested mail transport are still required.

Do not send real database content or credentials in alert messages.
Do not activate production backup or monitoring until compliance review.
